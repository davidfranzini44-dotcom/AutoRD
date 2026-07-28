// AutoRD - SuperCarros dealer inventory importer powered by Firecrawl.
//
// POST { action: 'preview', url, detailLimit? }
// POST { action: 'import', url, vehicles: previewVehicles[] }
//
// Deploy:
//   supabase secrets set FIRECRAWL_API_KEY=fc-...
//   supabase functions deploy supercarros-import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/scrape'
const SOURCE = 'supercarros'
const DEFAULT_DETAIL_LIMIT = 12
const MAX_PREVIEW_PAGES = 8
const MAX_IMPORT = 80

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

function text(v: unknown) {
  return String(v ?? '').trim()
}

function normUrl(raw: string) {
  const u = new URL(raw)
  const host = u.hostname.toLowerCase()
  if (!host.endsWith('supercarros.com')) throw new Error('Solo se permiten URLs de SuperCarros.')
  if (!/\/dealers\//i.test(u.pathname)) throw new Error('Pega el URL del inventario del dealer en SuperCarros.')
  u.hash = ''
  return u
}

function canonicalVehicleUrl(raw: string) {
  try {
    const u = new URL(raw, 'https://www.supercarros.com')
    if (!u.hostname.toLowerCase().endsWith('supercarros.com')) return null
    const m = u.pathname.match(/^\/([^/]+)\/(\d+)\/?$/)
    if (!m) return null
    return `https://www.supercarros.com/${m[1]}/${m[2]}/`
  } catch {
    return null
  }
}

function slugify(s: string) {
  return text(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
}

function parseMoney(raw: string) {
  const n = Number(text(raw).replace(/[^\d.]/g, '').replace(/\.(?=.*\.)/g, ''))
  return Number.isFinite(n) ? n : null
}

function sourceIdFromUrl(url: string) {
  return canonicalVehicleUrl(url)?.match(/\/(\d+)\/?$/)?.[1] || null
}

function parseDealerName(markdown: string, fallbackUrl: URL) {
  const h = markdown.match(/#\s+(.+?)\s+-\s+Inventario de Veh/i)
  if (h) return text(h[1])
  const seller = markdown.match(/###\s+(.+?)\n\s*Dealer/i)
  if (seller) return text(seller[1])
  const path = fallbackUrl.pathname.split('/').filter(Boolean).pop() || 'dealer'
  return path.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function parseTotal(markdown: string) {
  const m = markdown.match(/Actualmente encuentras\s+([\d,.]+)\s+veh/i)
  return m ? parseMoney(m[1]) : null
}

const KNOWN_MAKES = [
  'Mercedes-Benz', 'Land Rover', 'Alfa Romeo', 'Aston Martin',
  'Toyota', 'Honda', 'Hyundai', 'Kia', 'Nissan', 'Mazda', 'Mitsubishi',
  'Ford', 'Lexus', 'BMW', 'Jeep', 'Chevrolet', 'Daihatsu', 'Isuzu',
  'Volvo', 'Changan', 'Chang LI', 'Weichai', 'Audi', 'Suzuki', 'Jetour',
]

function splitMakeModel(raw: string) {
  const clean = text(raw).replace(/\s+/g, ' ')
  const make = KNOWN_MAKES.find((m) => clean.toLowerCase().startsWith(m.toLowerCase()))
  if (!make) {
    const parts = clean.split(' ')
    return { make: parts.shift() || '', model: parts.join(' ') }
  }
  const rest = clean.slice(make.length).trim()
  const spaced = rest || clean.replace(make, '').trim()
  return { make, model: spaced.replace(/^[-\s]+/, '') }
}

function listingLineSummary(markdown: string) {
  const rows = new Map<string, any>()
  for (const line of markdown.split('\n')) {
    const url = canonicalVehicleUrl(line.match(/https?:\/\/[^\s)]+/i)?.[0] || '')
    if (!url) continue
    const plain = line
      .replace(/\[[^\]]+\]\(([^)]+)\)/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[*`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const m = plain.match(/((?:19|20)\d{2})\s+(.+?)\s+(US\$|RD\$)\s*([\d,.]+)/i)
    if (!m) continue
    const mm = splitMakeModel(m[2])
    const title = `${m[1]} ${m[2]}`.replace(/\s+/g, ' ').trim()
    rows.set(url, {
      source: SOURCE,
      sourceUrl: url,
      sourceId: sourceIdFromUrl(url),
      title,
      year: Number(m[1]),
      make: mm.make,
      model: mm.model,
      price: parseMoney(m[4]),
      currency: m[3].toUpperCase().startsWith('US') ? 'USD' : 'DOP',
    })
  }
  return rows
}

function extractVehicleUrls(scrape: any, markdown: string) {
  const urls = new Set<string>()
  for (const link of scrape?.data?.links || []) {
    const u = canonicalVehicleUrl(link)
    if (u) urls.add(u)
  }
  for (const m of markdown.matchAll(/https?:\/\/[^\s)"']+/gi)) {
    const u = canonicalVehicleUrl(m[0])
    if (u) urls.add(u)
  }
  return [...urls]
}

function splitTitle(title: string) {
  const clean = text(title).replace(/^#\s*/, '')
  const m = clean.match(/^(.+?)\s+((?:19|20)\d{2})$/)
  const body = m ? m[1] : clean
  const year = m ? Number(m[2]) : null
  const parts = body.split(/\s+/)
  const make = parts.shift() || ''
  const model = parts.shift() || ''
  const trim = parts.join(' ')
  return { year, make, model, trim }
}

function field(markdown: string, label: string) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${esc}:\\s*([^\\n]+?)(?=\\s+[A-ZÁÉÍÓÚÑ][\\wÁÉÍÓÚÑ/ ]{1,24}:|\\n|$)`, 'i')
  return text(markdown.match(re)?.[1] || '')
}

function parseDetail(markdown: string, sourceUrl: string, dealerName: string) {
  const title = text(markdown.match(/^#\s+(.+)$/m)?.[1] || '')
  const titleParts = splitTitle(title)
  const priceMatch = markdown.match(/(?:###\s*)?(US\$|RD\$)\s*([\d,.]+)/i)
  const price = priceMatch ? parseMoney(priceMatch[2]) : null
  const currency = priceMatch?.[1]?.toUpperCase().startsWith('US') ? 'USD' : 'DOP'
  const anuncio = markdown.match(/Anuncio\s+#?(\d+)/i)?.[1] || sourceIdFromUrl(sourceUrl)
  const features = [...markdown.matchAll(/^\s*\*\s+(.+)$/gm)]
    .map((m) => text(m[1]))
    .filter((x) => x && !/^(Tel|WhatsApp|Email|Ciudad|Av\.|Contactar|Solicitar|Ver Todas)/i.test(x))
    .slice(0, 40)
  const observation = text(markdown.match(/### Observaciones\s+([\s\S]+?)(?:\n#+\s|$)/i)?.[1] || '')
    .replace(/\s+/g, ' ')
    .slice(0, 1200)
  const images = [...markdown.matchAll(/https?:\/\/[^\s)"']+\.(?:jpg|jpeg|png|webp)(?:\?[^\s)"']*)?/gi)]
    .map((m) => m[0])
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, 20)
  const conditionText = field(markdown, 'Condición')
  const condition = /nuevo/i.test(conditionText) ? 'nuevo' : 'usado'
  return {
    source: SOURCE,
    sourceId: anuncio,
    sourceUrl,
    dealerName,
    title,
    year: titleParts.year,
    make: titleParts.make,
    model: titleParts.model,
    trim: titleParts.trim,
    price,
    currency,
    mileage: parseMoney(field(markdown, 'Uso')) || 0,
    transmission: field(markdown, 'Transmisión') || field(markdown, 'Transmision'),
    fuel: field(markdown, 'Combustible'),
    engine: field(markdown, 'Motor'),
    color: field(markdown, 'Exterior') || field(markdown, 'Color'),
    interior: field(markdown, 'Interior'),
    bodyType: field(markdown, 'Tipo'),
    drivetrain: field(markdown, 'Tracción') || field(markdown, 'Traccion'),
    doors: parseMoney(field(markdown, 'Puertas')),
    passengers: parseMoney(field(markdown, 'Pasajeros')),
    condition,
    location: field(markdown, 'Ciudad') || 'RD',
    description: observation,
    features,
    images,
  }
}

async function firecrawlScrape(url: string) {
  const key = Deno.env.get('FIRECRAWL_API_KEY')
  if (!key) throw new Error('Falta FIRECRAWL_API_KEY en Supabase Secrets.')
  const res = await fetch(FIRECRAWL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      formats: ['markdown', 'links'],
      onlyMainContent: false,
      removeBase64Images: true,
      blockAds: true,
      mobile: false,
      timeout: 60000,
      maxAge: 3600000,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error || `Firecrawl respondió ${res.status}`)
  }
  return body
}

async function buildPreview(urlRaw: string, detailLimitRaw = DEFAULT_DETAIL_LIMIT) {
  const base = normUrl(urlRaw)
  const first = await firecrawlScrape(base.toString())
  const firstMd = first?.data?.markdown || ''
  const total = parseTotal(firstMd)
  const dealerName = parseDealerName(firstMd, base)
  const pages = Math.min(MAX_PREVIEW_PAGES, Math.max(1, Math.ceil((total || 20) / 20)))
  const pageUrls = [base.toString()]
  for (let i = 1; i < pages; i += 1) {
    const u = new URL(base.toString())
    u.searchParams.set('PagingPageSkip', String(i))
    pageUrls.push(u.toString())
  }

  const pageScrapes = [first]
  for (const u of pageUrls.slice(1)) {
    try { pageScrapes.push(await firecrawlScrape(u)) } catch { /* keep partial preview */ }
  }

  const summaries = new Map<string, any>()
  const urls = new Set<string>()
  for (const scrape of pageScrapes) {
    const md = scrape?.data?.markdown || ''
    for (const [u, v] of listingLineSummary(md)) summaries.set(u, v)
    for (const u of extractVehicleUrls(scrape, md)) urls.add(u)
  }

  const detailLimit = Math.min(Math.max(Number(detailLimitRaw) || DEFAULT_DETAIL_LIMIT, 0), 30)
  const selectedUrls = [...urls].slice(0, detailLimit)
  const details: any[] = []
  for (const u of selectedUrls) {
    try {
      const detail = await firecrawlScrape(u)
      details.push(parseDetail(detail?.data?.markdown || '', u, dealerName))
    } catch {
      details.push({ ...summaries.get(u), dealerName, needsDetailRetry: true })
    }
  }
  const byUrl = new Map(details.map((v) => [v.sourceUrl, v]))
  const vehicles = [...urls].map((u) => byUrl.get(u) || { ...summaries.get(u), dealerName, source: SOURCE, sourceUrl: u, sourceId: sourceIdFromUrl(u) })
  return { dealerName, source: SOURCE, url: base.toString(), totalPublished: total, pagesScanned: pageScrapes.length, vehicles }
}

async function withDuplicates(admin: any, dealerId: string, vehicles: any[]) {
  const urls = vehicles.map((v) => v.sourceUrl).filter(Boolean)
  const ids = vehicles.map((v) => v.sourceId).filter(Boolean)
  let existing: any[] = []
  if (urls.length) {
    const { data } = await admin.from('vehicles').select('id, slug, source_url, source_id, make, model, year, price').eq('dealer_id', dealerId).eq('source', SOURCE).in('source_url', urls)
    existing = existing.concat(data || [])
  }
  if (ids.length) {
    const { data } = await admin.from('vehicles').select('id, slug, source_url, source_id, make, model, year, price').eq('dealer_id', dealerId).eq('source', SOURCE).in('source_id', ids)
    existing = existing.concat(data || [])
  }
  const byUrl = new Map(existing.map((e) => [e.source_url, e]))
  const byId = new Map(existing.map((e) => [e.source_id, e]))
  return vehicles.map((v) => {
    const match = byUrl.get(v.sourceUrl) || byId.get(v.sourceId)
    return { ...v, duplicate: !!match, existingVehicleId: match?.id || null, existingSlug: match?.slug || null }
  })
}

function vehiclePatch(v: any, dealerId: string) {
  const make = text(v.make)
  const model = text(v.model)
  const year = Number(v.year)
  const price = Number(v.price)
  const slugBase = slugify(`${make}-${model}-${v.trim || ''}-${year}-${v.sourceId || crypto.randomUUID().slice(0, 8)}`)
  return {
    dealer_id: dealerId,
    slug: slugBase,
    make,
    model,
    year,
    trim: text(v.trim) || null,
    transmission: text(v.transmission) || null,
    fuel: text(v.fuel) || null,
    engine: text(v.engine) || null,
    mileage: Number(v.mileage) || 0,
    color: text(v.color) || null,
    body_type: text(v.bodyType) || null,
    price,
    currency: v.currency === 'USD' ? 'USD' : 'DOP',
    condition: v.condition === 'nuevo' ? 'nuevo' : 'usado',
    certified: false,
    location: text(v.location) || null,
    financing: true,
    description: text(v.description) || `Importado desde SuperCarros: ${v.sourceUrl}`,
    features: Array.isArray(v.features) ? v.features : [],
    monthly: Math.round((price * 0.8 * 0.013) || 0),
    apr: 9.75,
    term_years: 7,
    status: 'publicado',
    photos_count: Array.isArray(v.images) ? v.images.length : 0,
    source: SOURCE,
    source_id: text(v.sourceId) || null,
    source_url: text(v.sourceUrl) || null,
    source_imported_at: new Date().toISOString(),
    source_last_synced_at: new Date().toISOString(),
  }
}

async function importVehicles(admin: any, dealerId: string, vehicles: any[], mode = 'new') {
  const chosen = vehicles.slice(0, MAX_IMPORT).filter((v) => v?.sourceUrl && v?.make && v?.model && v?.year && v?.price)
  const checked = await withDuplicates(admin, dealerId, chosen)
  const result = { imported: 0, updated: 0, skipped: 0, errors: [] as any[] }
  for (const v of checked) {
    try {
      if (v.duplicate && mode !== 'update') { result.skipped += 1; continue }
      const patch = vehiclePatch(v, dealerId)
      let vehicleId = v.existingVehicleId
      if (vehicleId && mode === 'update') {
        const { error } = await admin.from('vehicles').update({ ...patch, slug: undefined, source_imported_at: undefined }).eq('id', vehicleId)
        if (error) throw error
        result.updated += 1
      } else {
        const { data, error } = await admin.from('vehicles').insert(patch).select('id').single()
        if (error) throw error
        vehicleId = data.id
        result.imported += 1
      }
      if (vehicleId && Array.isArray(v.images) && v.images.length) {
        const rows = v.images.slice(0, 20).map((url: string, position: number) => ({
          vehicle_id: vehicleId,
          url,
          position,
          is_cover: position === 0,
        }))
        await admin.from('vehicle_photos').insert(rows).catch(() => {})
      }
    } catch (e) {
      result.errors.push({ sourceUrl: v.sourceUrl, error: String((e as Error)?.message || e) })
    }
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'not_authenticated' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } })
    const { data: prof } = await admin.from('profiles').select('role,dealer_id').eq('id', user.id).single()
    if (!prof || !['dealer', 'admin'].includes(prof.role)) return json({ error: 'forbidden' }, 403)
    const dealerId = prof.dealer_id
    if (!dealerId) return json({ error: 'missing_dealer' }, 400)

    const body = await req.json().catch(() => ({}))
    const action = body.action || 'preview'
    if (action === 'preview') {
      const preview = await buildPreview(text(body.url), body.detailLimit)
      preview.vehicles = await withDuplicates(admin, dealerId, preview.vehicles)
      return json(preview)
    }
    if (action === 'import') {
      const result = await importVehicles(admin, dealerId, Array.isArray(body.vehicles) ? body.vehicles : [], body.mode || 'new')
      return json({ ok: true, ...result })
    }
    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
