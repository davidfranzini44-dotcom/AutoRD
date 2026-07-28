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
const DEFAULT_DETAIL_LIMIT = 22
const MAX_PREVIEW_PAGES = 8
const MAX_IMPORT = 80
// Detail pages carry the photos, so coverage here decides how many cars arrive
// with images. Firecrawl allows ~17 requests/minute, and a 78-car dealer needs
// ~82 requests -- about 5 minutes against a ~150s function budget. Bursting at
// concurrency 6 produced a 429 storm that read as "this dealer has no data".
const DETAIL_CONCURRENCY = 3
// ~15 req/min. The pacer is global, so concurrency only overlaps slow
// responses; it never raises the request rate.
const MIN_REQUEST_GAP_MS = 3800

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let lastRequestAt = 0
let gate: Promise<unknown> = Promise.resolve()
function paced<T>(fn: () => Promise<T>): Promise<T> {
  const slot = gate.then(async () => {
    const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt)
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
  })
  gate = slot.catch(() => {})
  return slot.then(fn)
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const queue = [...items]
  const out: R[] = []
  const worker = async () => {
    for (;;) {
      const item = queue.shift()
      if (item === undefined) return
      out.push(await fn(item))
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

// A detail parse that misses a field must not erase what the listing line
// already told us. Empty values never overwrite a populated base.
function mergeVehicle(base: any, extra: any) {
  const out = { ...(base || {}) }
  for (const [k, val] of Object.entries(extra || {})) {
    const empty = val == null || val === ''
      || (Array.isArray(val) && val.length === 0)
      || (typeof val === 'number' && !Number.isFinite(val))
    if (!empty) out[k] = val
  }
  return out
}

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

// Returns null when the source stated no number at all. "Uso: N/D Mi" strips to
// an empty string, and Number('') is 0 -- which is finite, so every unknown
// mileage used to be published as a confident "0 km", including on a 2003 car.
function parseMoney(raw: string) {
  const cleaned = text(raw).replace(/[^\d.]/g, '').replace(/\.(?=.*\.)/g, '')
  if (!/\d/.test(cleaned)) return null
  const n = Number(cleaned)
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
  // Firecrawl renders the spec block as a markdown table, so a raw capture keeps
  // the cell pipes: "| Jeepeta |". Those leaked straight into the database and
  // broke every marketplace filter, including values that were otherwise right.
  return text(markdown.match(re)?.[1] || '').replace(/^\|+|\|+$/g, '').trim()
}

// SuperCarros' vocabulary is not AutoRD's. Map onto the values the marketplace
// filters and the per-fuel bank rates already use; leave anything genuinely
// unknown (GLP, say) untouched rather than inventing a match.
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function normFuel(raw: string) {
  const s = strip(raw)
  if (!s) return null
  if (s === 'gasoil' || s === 'diesel') return 'Diésel'
  if (s === 'gasolina') return 'Gasolina'
  if (s === 'hibrido' || s === 'hybrid') return 'Híbrido'
  if (s === 'electrico' || s === 'electric') return 'Eléctrico'
  return raw
}

function normTransmission(raw: string) {
  const s = strip(raw)
  if (!s) return null
  if (s.startsWith('autom')) return 'Automática'
  if (s === 'manual' || s === 'sincronica') return 'Manual'
  return raw
}

function normBodyType(raw: string) {
  const s = strip(raw)
  if (!s) return null
  if (s === 'jeepeta') return 'SUV'
  if (s === 'camioneta') return 'Pickup'
  if (s === 'sedan') return 'Sedán'
  return raw
}

// SuperCarros serves one photo at several sizes and ends every detail page with
// an "Anuncios Similares" strip of OTHER dealers' cars:
//   .../AdsPhotos/266x600/0/14079019.jpg   gallery, large
//   .../AdsPhotos/188x125/5/14079019.jpg   same photo, thumbnail
//   .../AdsPhotos/117x78/5/14470725.jpg    a different vehicle entirely
// Deduping on the full URL kept both sizes of the same photo and imported the
// similar-ads strip onto the car. Key on the photo id, keep the widest variant,
// and drop the 117x78 strip.
function collectImages(markdown: string) {
  const best = new Map<string, { url: string; width: number }>()
  const re = /https?:\/\/img\.supercarros\.com\/AdsPhotos\/(\d+)x(\d+)\/\d+\/(\d+)\.(?:jpg|jpeg|png|webp)/gi
  for (const m of markdown.matchAll(re)) {
    const width = Number(m[1])
    if (!Number.isFinite(width) || width < 150) continue
    const photoId = m[3]
    const prev = best.get(photoId)
    if (!prev || width > prev.width) best.set(photoId, { url: m[0], width })
  }
  return [...best.values()].map((v) => v.url).slice(0, 20)
}

// The dealer's own blurb, and nothing else. No SuperCarros links (the page ends
// with "Ver más vehículos como este" pointing back at a competitor listing), no
// bare URLs, no leftover markdown escapes. An empty result is null, never
// filler text standing in for a description we do not have.
function cleanDescription(raw: string) {
  const out = text(raw)
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/Ver m[aá]s veh[ií]culos como este/gi, ' ')
    .replace(/\\([-*_#[\]()])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return out || null
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
  const images = collectImages(markdown)
  const conditionText = field(markdown, 'Condición')
  const condition = conditionText ? (/nuevo/i.test(conditionText) ? 'nuevo' : 'usado') : null
  const mileage = parseMoney(field(markdown, 'Uso'))
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
    mileage: mileage ?? null,
    transmission: normTransmission(field(markdown, 'Transmisión') || field(markdown, 'Transmision')),
    fuel: normFuel(field(markdown, 'Combustible')),
    engine: field(markdown, 'Motor'),
    color: field(markdown, 'Exterior') || field(markdown, 'Color'),
    interior: field(markdown, 'Interior'),
    bodyType: normBodyType(field(markdown, 'Tipo')),
    drivetrain: field(markdown, 'Tracción') || field(markdown, 'Traccion'),
    doors: parseMoney(field(markdown, 'Puertas')),
    passengers: parseMoney(field(markdown, 'Pasajeros')),
    condition,
    location: field(markdown, 'Ciudad') || 'RD',
    description: cleanDescription(observation),
    features,
    images,
  }
}

async function firecrawlScrape(url: string) {
  const key = Deno.env.get('FIRECRAWL_API_KEY')
  if (!key) throw new Error('Falta FIRECRAWL_API_KEY en Supabase Secrets.')
  const res = await paced(() => fetch(FIRECRAWL_URL, {
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
  }))
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.success === false) {
    // Deliberately NOT retrying 429: the quota is per minute, so a retry spends
    // another request from the same bucket and the window does not reset for
    // ~52s. That is what turned a partial read into a total failure.
    throw new Error(body?.error || `Firecrawl respondió ${res.status}`)
  }
  return body
}

async function buildPreview(urlRaw: string, detailLimitRaw = DEFAULT_DETAIL_LIMIT, alreadyImported: Set<string> = new Set()) {
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

  const rest = await pool(pageUrls.slice(1), DETAIL_CONCURRENCY, async (u) => {
    try { return await firecrawlScrape(u) } catch { return null /* keep partial preview */ }
  })
  const pageScrapes = [first, ...rest.filter(Boolean)]

  const summaries = new Map<string, any>()
  const urls = new Set<string>()
  for (const scrape of pageScrapes) {
    const md = scrape?.data?.markdown || ''
    for (const [u, v] of listingLineSummary(md)) summaries.set(u, v)
    for (const u of extractVehicleUrls(scrape, md)) urls.add(u)
  }

  const detailLimit = Math.min(Math.max(Number(detailLimitRaw) || DEFAULT_DETAIL_LIMIT, 0), MAX_IMPORT)
  // Spend the run's rate-limit budget only on cars this dealer does not have.
  // Without this every run re-scrapes the same inventory and never converges.
  const pending = [...urls].filter((u) => !alreadyImported.has(u))
  const selectedUrls = pending.slice(0, detailLimit)
  const baseOf = (u: string) => ({
    ...(summaries.get(u) || {}),
    dealerName,
    source: SOURCE,
    sourceUrl: u,
    sourceId: sourceIdFromUrl(u),
  })
  const details = await pool(selectedUrls, DETAIL_CONCURRENCY, async (u) => {
    try {
      const detail = await firecrawlScrape(u)
      return mergeVehicle(baseOf(u), parseDetail(detail?.data?.markdown || '', u, dealerName))
    } catch {
      return { ...baseOf(u), needsDetailRetry: true }
    }
  })
  const byUrl = new Map(details.map((v) => [v.sourceUrl, v]))
  // Only rows we actually read this run are offered. Listing the rest as blank
  // placeholders is what made the preview table look broken.
  const vehicles = selectedUrls.map((u) => byUrl.get(u) || baseOf(u))
  const withDetail = details.filter((v) => !v.needsDetailRetry).length
  return {
    dealerName,
    source: SOURCE,
    url: base.toString(),
    totalPublished: total,
    totalFound: urls.size,
    alreadyImported: urls.size - pending.length,
    pagesScanned: pageScrapes.length,
    detailAttempted: selectedUrls.length,
    detailFetched: withDetail,
    remainingAfterRun: Math.max(0, pending.length - selectedUrls.length),
    vehicles,
  }
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

async function saveMarketSnapshots(admin: any, vehicles: any[], dealerName: string) {
  const today = new Date().toISOString().slice(0, 10)
  const rows = vehicles
    .filter((v) => v?.sourceUrl && v?.make && v?.model && Number(v?.price) > 0)
    .map((v) => ({
      source: SOURCE,
      source_id: text(v.sourceId) || sourceIdFromUrl(v.sourceUrl),
      source_url: text(v.sourceUrl),
      snapshot_date: today,
      dealer_name: dealerName || text(v.dealerName) || null,
      make: text(v.make),
      model: text(v.model),
      year: Number(v.year) || null,
      trim: text(v.trim) || null,
      mileage: Number(v.mileage) || null,
      price: Number(v.price),
      currency: v.currency === 'USD' ? 'USD' : 'DOP',
      condition: text(v.condition) || null,
      transmission: text(v.transmission) || null,
      fuel: text(v.fuel) || null,
      body_type: text(v.bodyType) || null,
      color: text(v.color) || null,
      location: text(v.location) || null,
      raw: v,
    }))
  if (!rows.length) return { saved: 0 }
  const { error } = await admin
    .from('vehicle_market_snapshots')
    .upsert(rows, { onConflict: 'source,source_url,snapshot_date' })
  if (error) return { saved: 0, error: error.message }
  return { saved: rows.length }
}

function vehiclePatch(v: any, dealerId: string, dealerCity: string | null) {
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
    // Normalised here too, not just in parseDetail: values coming from the
    // listing-line fallback never pass through the detail parser.
    transmission: normTransmission(text(v.transmission)),
    fuel: normFuel(text(v.fuel)),
    engine: text(v.engine) || null,
    // null means the source did not state it. Never 0, which reads as a genuine
    // zero-kilometre car.
    mileage: v.mileage == null || v.mileage === '' ? null : Number(v.mileage) || null,
    color: text(v.color) || null,
    body_type: normBodyType(text(v.bodyType)),
    price,
    currency: v.currency === 'USD' ? 'USD' : 'DOP',
    condition: v.condition === 'nuevo' ? 'nuevo' : 'usado',
    condition_confirmed: v.condition === 'nuevo' || v.condition === 'usado',
    certified: false,
    // The car sits at the AutoRD dealer's lot, not at whatever city SuperCarros
    // printed in the seller block. Their value is only a fallback.
    location: dealerCity || text(v.location) || null,
    financing: true,
    description: cleanDescription(v.description),
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
  const candidates = vehicles.slice(0, MAX_IMPORT)
  const chosen = candidates.filter((v) => v?.sourceUrl && v?.make && v?.model && v?.year && v?.price)
  // Rows we could not complete used to vanish with no trace, which is why an
  // 80-car dealer looked like a 6-car dealer. Count them and say so.
  const incomplete = candidates
    .filter((v) => !chosen.includes(v))
    .map((v) => ({ sourceUrl: v?.sourceUrl || null, missing: ['make', 'model', 'year', 'price'].filter((k) => !v?.[k]) }))
  const checked = await withDuplicates(admin, dealerId, chosen)
  const { data: dealerRow } = await admin.from('dealers').select('city').eq('id', dealerId).maybeSingle()
  const dealerCity = text(dealerRow?.city) || null
  const result = { imported: 0, updated: 0, skipped: 0, incomplete, errors: [] as any[] }
  for (const v of checked) {
    try {
      if (v.duplicate && mode !== 'update') { result.skipped += 1; continue }
      const patch = vehiclePatch(v, dealerId, dealerCity)
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
        // NOT .catch(): a PostgrestBuilder is a bare thenable with no catch
        // method, so the previous `.insert(rows).catch(() => {})` threw
        // TypeError before the insert ever ran. Every photo was lost while
        // photos_count still advertised 20 of them.
        await admin.from('vehicle_photos').delete().eq('vehicle_id', vehicleId)
        const { error: photoErr } = await admin.from('vehicle_photos').insert(rows)
        if (photoErr) {
          // Never leave the card claiming photos that do not exist.
          await admin.from('vehicles').update({ photos_count: 0 }).eq('id', vehicleId)
          result.errors.push({ sourceUrl: v.sourceUrl, error: `fotos: ${photoErr.message}` })
        }
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
      // Known before any scraping, so the rate-limit budget is spent only on
      // vehicles that are actually new to this dealer.
      const { data: owned } = await admin.from('vehicles')
        .select('source_url').eq('dealer_id', dealerId).eq('source', SOURCE)
      const alreadyImported = new Set<string>((owned || []).map((r: any) => r.source_url).filter(Boolean))
      const preview = await buildPreview(text(body.url), body.detailLimit, alreadyImported)
      preview.vehicles = await withDuplicates(admin, dealerId, preview.vehicles)
      preview.marketSnapshots = await saveMarketSnapshots(admin, preview.vehicles, preview.dealerName)
        .catch((e) => ({ saved: 0, error: String((e as Error)?.message || e) }))
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
