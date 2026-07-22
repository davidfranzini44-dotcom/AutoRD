// ============================================================
// AutoRD data-access layer.
// If Supabase is configured -> live queries.
// Otherwise -> local demo data (keeps the app fully runnable).
// ============================================================
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import {
  vehicles as demoVehicles, banks as demoBanks, financingCase,
  dealerInventory, dealerLeads, bankApplications, bankStatusMeta,
} from './demo'
import { withPriceInsights } from './priceInsights'
import { DR_CITY_COORDS } from './geo'

export { fmtRD } from './demo'
export const LIVE = isSupabaseConfigured
const DOC_BUCKET = 'application-documents'
const PHOTO_BUCKET = 'vehicle-photos'

// Parse a free-text money field ("RD$ 85,000") into a number, or null.
export function parseMoney(s) {
  if (s == null) return null
  const n = Number(String(s).replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

// Map a DB vehicle row (+ joined dealer) to the shape the UI components expect.
function mapVehicle(r) {
  const dealer = r.dealer || {}
  const photoRows = (r.photo_rows || r.vehicle_photos || [])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
  const cover = photoRows.find((p) => p.is_cover) || photoRows[0] || null
  const photoUrls = photoRows.map((p) => p.url).filter(Boolean)
  return {
    id: r.slug,
    dbId: r.id,
    dealerDbId: r.dealer_id,
    make: r.make, model: r.model, year: r.year, trim: r.trim,
    transmission: r.transmission, fuel: r.fuel, engine: r.engine,
    mileage: r.mileage, color: r.color, bodyType: r.body_type,
    price: Number(r.price),
    condition: r.condition === 'nuevo' ? 'Nuevo' : 'Usado',
    certified: r.certified,
    location: r.location, dealer: dealer.name, dealerVerified: dealer.verified,
    dealerSlug: dealer.slug || null, dealerWhatsapp: dealer.whatsapp || null, dealerPhone: dealer.phone || null,
    lat: r.lat != null ? Number(r.lat) : null, lng: r.lng != null ? Number(r.lng) : null,
    financing: r.financing, tone: r.tone,
    monthly: Number(r.monthly), downPct: 20, apr: Number(r.apr), termYears: r.term_years,
    photos: photoUrls.length || r.photos_count || 0,
    coverPhoto: cover?.url || null,
    photoUrls,
    photoRows: photoRows.map((p) => ({
      id: p.id, url: p.url, storagePath: p.storage_path, position: p.position || 0, isCover: !!p.is_cover,
    })),
    description: r.description,
    features: Array.isArray(r.features) ? r.features : [],
    status: r.status,
  }
}

const VEHICLE_PHOTOS_SELECT = 'photo_rows:vehicle_photos(id, url, storage_path, position, is_cover)'
const VEHICLE_SELECT = `*, dealer:dealers(name, verified, slug, initials, whatsapp, phone), ${VEHICLE_PHOTOS_SELECT}`

function withDemoCoords(v) {
  if (v.lat != null && v.lng != null) return v
  const coords = DR_CITY_COORDS[v.location]
  return coords ? { ...v, lat: coords.lat, lng: coords.lng } : v
}

const JOSELITO_SLUG = 'joselito-auto-import'
const JOSELITO_FALLBACK_DEALER = {
  id: JOSELITO_SLUG,
  name: 'Joselito Auto Import',
  slug: JOSELITO_SLUG,
  logoUrl: '/dealer-logos/joselito-auto-import.jpg',
  city: 'Santiago',
  verified: true,
  initials: 'JA',
  phone: '+1 809-724-9999',
  whatsapp: '+1 809-501-5858',
  hours: 'Lunes a sábado',
  description: 'Dealer importador en Santiago con inventario premium, atención por WhatsApp y opciones de financiamiento disponibles en AutoRD.',
  rating: 4.8,
  ratingCount: 94,
  foundedYear: 2014,
  locations: [{ name: 'Principal', address: 'Av. Estrella Sadhalá #172, Centro, Santiago', city: 'Santiago', lat: 19.4517, lng: -70.6970 }],
}

function tabMatchesVehicle(v, tab) {
  if (tab === 'nuevos') return v.condition === 'Nuevo'
  if (tab === 'cert') return v.certified
  if (tab === 'fin') return v.financing
  return true
}

function joselitoFallbackVehicles({ tab = 'todos', dealer = JOSELITO_FALLBACK_DEALER } = {}) {
  return demoVehicles
    .filter((v) => v.dealerSlug === JOSELITO_SLUG)
    .filter((v) => tabMatchesVehicle(v, tab))
    .map((v) => withDemoCoords({
      ...v,
      dealer: dealer.name || v.dealer,
      dealerVerified: dealer.verified ?? v.dealerVerified,
      dealerSlug: dealer.slug || v.dealerSlug,
      dealerWhatsapp: dealer.whatsapp || v.dealerWhatsapp,
      dealerPhone: dealer.phone || v.dealerPhone,
      dealerLogoUrl: dealer.logoUrl || v.dealerLogoUrl || JOSELITO_FALLBACK_DEALER.logoUrl,
      dealerDbId: dealer.id && dealer.id !== JOSELITO_SLUG ? dealer.id : v.dealerDbId || null,
    }))
}

function mergeVehiclesById(primary, fallback) {
  const fallbackById = new Map(fallback.map((v) => [v.id, v]))
  const merged = primary.map((v) => {
    const f = fallbackById.get(v.id)
    if (!f) return v
    return {
      ...v,
      coverPhoto: v.coverPhoto || f.coverPhoto,
      photoUrls: v.photoUrls?.length ? v.photoUrls : (f.photoUrls || []),
      photoRows: v.photoRows?.length ? v.photoRows : (f.photoRows || []),
      photos: v.photos || f.photos,
      dealerLogoUrl: v.dealerLogoUrl || f.dealerLogoUrl,
    }
  })
  const seen = new Set(primary.map((v) => v.id))
  return [...merged, ...fallback.filter((v) => !seen.has(v.id))]
}

function joselitoFallbackDealer() {
  return {
    ...JOSELITO_FALLBACK_DEALER,
    vehicles: withPriceInsights(joselitoFallbackVehicles()),
  }
}

function withJoselitoDealerFallback(dealer) {
  if (!dealer || dealer.slug !== JOSELITO_SLUG) return dealer
  const vehicles = mergeVehiclesById(
    dealer.vehicles || [],
    joselitoFallbackVehicles({ dealer }),
  )
  return { ...dealer, logoUrl: dealer.logoUrl || JOSELITO_FALLBACK_DEALER.logoUrl, vehicles: withPriceInsights(vehicles) }
}

// ---------------- Vehicles ----------------
export async function listVehicles({ tab = 'todos' } = {}) {
  if (!LIVE) {
    return withPriceInsights(demoVehicles.filter((v) => {
      if (tab === 'nuevos') return v.condition === 'Nuevo'
      if (tab === 'cert') return v.certified
      if (tab === 'fin') return v.financing
      return true
    }).map(withDemoCoords))
  }
  let q = supabase.from('vehicles').select(VEHICLE_SELECT).eq('status', 'publicado')
  if (tab === 'nuevos') q = q.eq('condition', 'nuevo')
  if (tab === 'cert') q = q.eq('certified', true)
  if (tab === 'fin') q = q.eq('financing', true)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return withPriceInsights(mergeVehiclesById(
    (data || []).map(mapVehicle),
    joselitoFallbackVehicles({ tab }),
  ))
}

export async function getVehicleBySlug(slug) {
  if (!LIVE) return withPriceInsights(demoVehicles.map(withDemoCoords)).find((v) => v.id === slug) || null
  const { data, error } = await supabase.from('vehicles').select(VEHICLE_SELECT).eq('slug', slug).single()
  if (error) {
    const fallback = joselitoFallbackVehicles().find((v) => v.id === slug)
    return fallback ? withPriceInsights([fallback])[0] : null
  }
  return withPriceInsights(mergeVehiclesById([mapVehicle(data)], joselitoFallbackVehicles()))[0]
}

// ---------------- Lead tracking (views / share / contact / financing) ----------------
export function trackEvent(slug, kind) {
  if (!LIVE || !slug) return
  try { supabase.rpc('track_event', { p_slug: slug, p_kind: kind }).catch(() => {}) } catch { /* ignore */ }
}
export async function getDealerLeadCounts() {
  if (!LIVE) return {}
  try {
    const { data } = await supabase.rpc('my_dealer_lead_counts')
    return Object.fromEntries((data || []).map((r) => [r.kind, Number(r.total)]))
  } catch { return {} }
}

// ---------------- In-app notifications (bell) ----------------
export async function myNotifications(limit = 30) {
  if (!LIVE) return []
  try { const { data } = await supabase.rpc('my_notifications', { p_limit: limit }); return data || [] } catch { return [] }
}
export async function myUnreadCount() {
  if (!LIVE) return 0
  try { const { data } = await supabase.rpc('my_unread_count'); return Number(data) || 0 } catch { return 0 }
}
export async function markNotificationsRead() {
  if (!LIVE) return
  try { await supabase.rpc('mark_notifications_read'); window.dispatchEvent(new Event('autord-notifs')) } catch { /* ignore */ }
}

export async function listBanks() {
  if (!LIVE) return demoBanks
  const { data, error } = await supabase.from('banks').select('*').eq('active', true).order('name')
  if (error) throw error
  return (data || []).map((b) => ({ id: b.slug, dbId: b.id, name: b.name, color: b.color, initials: b.initials }))
}

// ---------------- Dealers (with their published inventory) ----------------
const initialsOf = (name) => String(name || '').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

export async function listDealers() {
  if (!LIVE) {
    // Derive dealers from the demo vehicles (grouped by dealer name).
    const byName = {}
    demoVehicles.forEach((v) => {
      const name = v.dealer || 'Dealer'
      if (!byName[name]) {
        byName[name] = {
          id: name, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          city: v.location, verified: !!v.dealerVerified, initials: initialsOf(name), vehicles: [],
        }
      }
      byName[name].vehicles.push(v)
    })
    return Object.values(byName).map((d) => ({ ...d, vehicles: withPriceInsights(d.vehicles.map(withDemoCoords)) }))
  }
  const { data, error } = await supabase
    .from('dealers')
    .select(`id, name, slug, city, verified, initials, phone, whatsapp, vehicles(*, ${VEHICLE_PHOTOS_SELECT})`)
    .order('name')
  if (error) throw error
  const dealers = (data || []).map((d) => ({
    id: d.id, name: d.name, slug: d.slug, city: d.city, verified: d.verified,
    phone: d.phone, whatsapp: d.whatsapp,
    initials: d.initials || initialsOf(d.name),
    // Map each vehicle and stamp the dealer (the nested select omits the dealer join).
    vehicles: withPriceInsights((d.vehicles || [])
      .filter((v) => v.status === 'publicado')
      .map((v) => ({ ...mapVehicle(v), dealer: d.name, dealerVerified: d.verified, dealerDbId: d.id }))),
  })).map(withJoselitoDealerFallback)
  return dealers.some((d) => d.slug === JOSELITO_SLUG)
    ? dealers
    : [...dealers, joselitoFallbackDealer()]
}

export async function getDealerBySlug(slug) {
  if (!LIVE) {
    const all = await listDealers()
    return all.find((d) => d.slug === slug) || null
  }
  const { data, error } = await supabase
    .from('dealers')
    .select(`id, name, slug, city, verified, initials, phone, whatsapp, hours, locations, description, rating, rating_count, founded_year, vehicles(*, ${VEHICLE_PHOTOS_SELECT})`)
    .eq('slug', slug).single()
  if (error) return slug === JOSELITO_SLUG ? joselitoFallbackDealer() : null
  return withJoselitoDealerFallback({
    id: data.id, name: data.name, slug: data.slug, city: data.city, verified: data.verified,
    phone: data.phone, whatsapp: data.whatsapp, hours: data.hours,
    description: data.description || '', rating: data.rating != null ? Number(data.rating) : null,
    ratingCount: data.rating_count || 0, foundedYear: data.founded_year || null,
    locations: Array.isArray(data.locations) ? data.locations : [],
    initials: data.initials || initialsOf(data.name),
    vehicles: withPriceInsights((data.vehicles || [])
      .filter((v) => v.status === 'publicado')
      .map((v) => ({ ...mapVehicle(v), dealer: data.name, dealerVerified: data.verified, dealerDbId: data.id }))),
  })
}

// Dealer console: read + update the signed-in dealer's own editable profile.
export async function getMyDealer(dealerDbId) {
  if (!LIVE || !dealerDbId) return null
  const { data, error } = await supabase
    .from('dealers')
    .select('id, name, slug, city, phone, whatsapp, hours, locations, description, founded_year')
    .eq('id', dealerDbId).single()
  if (error) return null
  return { ...data, locations: Array.isArray(data.locations) ? data.locations : [] }
}

export async function updateDealerProfile(dealerDbId, { whatsapp, hours, locations, description, foundedYear }) {
  if (!LIVE || !dealerDbId) return { ok: false, demo: true }
  const patch = {
    whatsapp: whatsapp || null,
    hours: hours || null,
    locations: Array.isArray(locations) ? locations : [],
  }
  if (description !== undefined) patch.description = description || null
  if (foundedYear !== undefined) patch.founded_year = foundedYear || null
  const { error } = await supabase.from('dealers').update(patch).eq('id', dealerDbId)
  if (error) throw error
  return { ok: true }
}

// Buyer contacts a dealer about a specific car — seeds a conversation into the
// dealer's WhatsApp inbox. Requires an auth session (mint an anonymous one if
// needed). Returns { ok } or { error: <code> }.
export async function startDealerChat({ vehicleSlug, phone, name, text }) {
  if (!LIVE) return { ok: true, simulated: true }
  try {
    const { data, error } = await supabase.rpc('start_dealer_chat', {
      p_vehicle_slug: vehicleSlug, p_phone: phone, p_name: name || '', p_text: text,
    })
    if (error) return { error: error.message || 'no_enviado' }
    return { ok: true, conversationId: data }
  } catch (e) {
    return { error: String(e?.message || e) }
  }
}

// ---------------- KYC (Didit) ----------------
// Creates a real Didit verification session via the edge function.
// - Demo mode (no Supabase at all): { simulated: true } -> the UI auto-approves
//   so the app stays explorable offline.
// - Live backend: { url, session_id } on success, or { error } on failure. We do
//   NOT fake an approval when the backend is reachable but errors — a real test
//   must fail loudly instead of silently passing.
export async function createKycSession() {
  if (!LIVE) return { simulated: true }
  try {
    const { data, error } = await supabase.functions.invoke('didit-session', { body: { action: 'create' } })
    if (error) return { error: error.message || 'No se pudo iniciar la verificación de identidad.' }
    if (!data?.url) return { error: data?.error || 'La verificación de identidad no está disponible ahora mismo.' }
    return data
  } catch (e) {
    return { error: String(e?.message || e) }
  }
}

export async function getKycStatus(sessionId) {
  if (!LIVE) return { approved: true }
  try {
    const { data } = await supabase.functions.invoke('didit-session', { body: { action: 'status', session_id: sessionId } })
    return data || { approved: false }
  } catch {
    return { approved: false }
  }
}

// Stamp the buyer's identity as verified "now" so it can be reused for 12 months
// (see src/data/kyc.js). Called when the KYC step succeeds. Best-effort.
export async function markKycVerified() {
  if (!LIVE) return { at: new Date().toISOString() }
  try {
    const { data, error } = await supabase.rpc('mark_kyc_verified')
    if (error) return {}
    return { at: data }
  } catch {
    return {}
  }
}

// ---------------- Financing application ----------------
export async function createApplication(payload) {
  if (!LIVE) {
    return { code: 'AP-DEMO', ...payload }
  }
  const { data: userRes } = await supabase.auth.getUser()
  const uid = userRes?.user?.id
  const inicial = parseMoney(payload.inicial)
  const requested = payload.requestedAmount != null ? Number(payload.requestedAmount) : null
  const { data: app, error } = await supabase.from('financing_applications').insert({
    buyer_id: uid,
    buyer_name: payload.nombre, buyer_phone: payload.telefono, buyer_email: payload.email,
    vehicle_id: payload.vehicleDbId || null,
    dealer_id: payload.dealerDbId || null,
    requested_amount: requested,
    down_payment: inicial,
    term_years: Number(payload.plazo) || null,
    notify: payload.notify,
    status: 'enviada',
    kyc_status: 'aprobado',
    consent_signed: true,
    consent_text: payload.consentText,
    consent_signed_at: new Date().toISOString(),
  }).select().single()
  if (error) throw error

  await supabase.from('application_financials').insert({
    // Employment is no longer asked up front — a bank can request supporting
    // documents itself if it wants them. Income is the field that matters.
    application_id: app.id, income: parseMoney(payload.ingreso), employment_type: payload.empleo || null,
  })
  // bankDbIds are real bank UUIDs; skip any falsy (demo slugs without a dbId).
  const bankIds = (payload.bankDbIds || []).filter(Boolean)
  if (bankIds.length) {
    await supabase.from('application_banks').insert(
      bankIds.map((bank_id) => ({ application_id: app.id, bank_id })),
    )
  }
  return app
}

// Customer financing status (latest application for the logged-in buyer)
export async function getMyFinancing() {
  if (!LIVE) return financingCase
  const { data: userRes } = await supabase.auth.getUser()
  const uid = userRes?.user?.id
  if (!uid) return null
  const { data: app } = await supabase
    .from('financing_applications')
    .select('*, vehicle:vehicles(' + VEHICLE_SELECT + '), responses:application_banks(*, bank:banks(name, slug, color, initials))')
    .eq('buyer_id', uid).order('created_at', { ascending: false }).limit(1).single()
  if (!app) return null
  const isPre = !app.vehicle_id
  const responses = (app.responses || []).map((r) => ({
    bankId: r.bank?.slug, status: mapBankStatus(r.status), label: bankStatusLabel(r.status),
    apr: r.apr, term: r.term_years, down: r.down_required, monthly: r.monthly, note: r.notes,
    approvedAmount: r.approved_amount != null ? Number(r.approved_amount) : null,
  }))
  const hasOffer = responses.some((r) => r.status === 'offer')
  const evaluating = responses.some((r) => r.status === 'evaluating' || r.status === 'docs')
  // Best (highest) pre-approved ceiling across banks — powers "shop within budget".
  const approvedAmounts = responses.map((r) => r.approvedAmount).filter((n) => n != null && n > 0)
  const approvedAmount = approvedAmounts.length ? Math.max(...approvedAmounts) : null
  const timeline = [
    { key: 'kyc', name: 'KYC aprobado', sub: 'Identidad verificada', state: app.kyc_status === 'aprobado' ? 'done' : 'current' },
    { key: 'consent', name: 'Consentimiento firmado', sub: 'Autorización de consulta crediticia', state: app.consent_signed ? 'done' : 'pending' },
    { key: 'sent', name: isPre ? 'Pre-aprobación enviada a bancos' : 'Solicitud enviada a bancos', sub: `${responses.length} banco(s) seleccionado(s)`, state: 'done' },
    { key: 'eval', name: isPre ? 'Bancos evaluando tu pre-aprobación' : 'Bancos evaluando', sub: 'Los bancos revisan tu solicitud', state: hasOffer || evaluating ? 'done' : 'current' },
    { key: 'offers', name: isPre ? 'Pre-aprobación recibida' : 'Ofertas recibidas', sub: hasOffer ? (isPre ? 'Tienes una pre-aprobación disponible' : 'Tienes ofertas disponibles') : 'Aún sin respuestas', state: hasOffer ? 'current' : 'pending' },
  ]
  return {
    id: app.id,
    code: app.code,
    createdAt: app.created_at,
    isPreapproval: isPre,
    vehicle: app.vehicle ? mapVehicle(app.vehicle) : null,
    requestedAmount: app.requested_amount != null ? Number(app.requested_amount) : null,
    down: app.down_payment != null ? Number(app.down_payment) : null,
    term: app.term_years,
    approvedAmount,
    responses,
    timeline,
  }
}

// ---------------- Supporting documents ----------------
const DEMO_DOCS = [
  {
    id: 'demo-income-proof',
    applicationId: 'demo',
    bankId: 'scotiabank',
    bankName: 'Scotiabank',
    type: 'Comprobante de ingresos',
    status: 'solicitado',
    requestedAt: '2026-07-15T12:00:00.000Z',
    notes: 'Sube una carta de trabajo o tus ultimos estados de cuenta.',
  },
]

function mapDocument(r) {
  const bank = r.bank || {}
  return {
    id: r.id,
    applicationId: r.application_id || r.applicationId,
    bankId: bank.slug || r.bankId,
    bankName: bank.name || r.bankName || 'Banco',
    bankColor: bank.color || r.bankColor,
    bankInitials: bank.initials || r.bankInitials,
    type: r.doc_type || r.type || 'Documento solicitado',
    status: r.status || 'solicitado',
    storagePath: r.storage_path || r.storagePath || null,
    fileName: r.file_name || r.fileName || null,
    mimeType: r.mime_type || r.mimeType || null,
    fileSize: r.file_size || r.fileSize || null,
    notes: r.notes || '',
    requestedAt: r.requested_at || r.requestedAt || r.created_at || null,
    uploadedAt: r.uploaded_at || r.uploadedAt || null,
  }
}

export async function getApplicationDocuments(applicationId) {
  if (!LIVE) return DEMO_DOCS.map((d) => ({ ...d, applicationId: applicationId || d.applicationId }))
  if (!applicationId) return []
  const { data, error } = await supabase
    .from('documents')
    .select('*, bank:banks(name, slug, color, initials)')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapDocument)
}

export async function requestApplicationDocuments(responseId, docTypes, notes = '') {
  const types = [...new Set((docTypes || []).map((d) => String(d).trim()).filter(Boolean))]
  if (!types.length) throw new Error('Selecciona por lo menos un documento.')

  if (!LIVE) {
    return {
      ok: true,
      documents: types.map((type, i) => ({
        id: `demo-request-${Date.now()}-${i}`,
        applicationId: 'demo',
        bankId: 'bhd',
        bankName: 'BHD',
        type,
        status: 'solicitado',
        requestedAt: new Date().toISOString(),
        notes,
      })),
    }
  }

  const { data: response, error: responseError } = await supabase
    .from('application_banks')
    .select('id, application_id, bank_id')
    .eq('id', responseId)
    .single()
  if (responseError) throw responseError

  const requestedAt = new Date().toISOString()
  const rows = types.map((doc_type) => ({
    application_id: response.application_id,
    requested_by_bank: response.bank_id,
    doc_type,
    status: 'solicitado',
    requested_at: requestedAt,
    notes: notes || null,
  }))

  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .insert(rows)
    .select('*, bank:banks(name, slug, color, initials)')
  if (docsError) throw docsError

  const responseNote = notes || `Documentos solicitados: ${types.join(', ')}`
  const { error: updateError } = await supabase
    .from('application_banks')
    .update({ status: 'pendiente_docs', notes: responseNote, responded_at: requestedAt })
    .eq('id', responseId)
  if (updateError) throw updateError

  supabase.functions.invoke('wa-notify', {
    body: { response_id: responseId, event: 'bank_response' },
  }).catch(() => {})

  return { ok: true, documents: (docs || []).map(mapDocument) }
}

function safeFileName(name) {
  const cleaned = String(name || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
  return cleaned || 'documento'
}

export async function uploadApplicationDocument(doc, file) {
  if (!file) throw new Error('Selecciona un archivo.')
  if (!LIVE) {
    return {
      ...doc,
      status: 'subido',
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
    }
  }

  const applicationId = doc.applicationId || doc.application_id
  if (!applicationId || !doc.id) throw new Error('No se encontro la solicitud de documento.')

  const { data: userRes } = await supabase.auth.getUser()
  const uid = userRes?.user?.id
  const path = `${applicationId}/${doc.id}/${Date.now()}-${safeFileName(file.name)}`
  const { error: uploadError } = await supabase.storage
    .from(DOC_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('documents')
    .update({
      status: 'subido',
      storage_path: path,
      uploaded_by: uid || null,
      uploaded_at: new Date().toISOString(),
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size || null,
    })
    .eq('id', doc.id)
    .select('*, bank:banks(name, slug, color, initials)')
    .single()
  if (error) throw error
  return mapDocument(data)
}

export async function getDocumentDownloadUrl(doc) {
  if (!LIVE || !doc?.storagePath) return null
  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(doc.storagePath, 60 * 10)
  if (error) throw error
  return data?.signedUrl || null
}

// Attach a chosen vehicle to an existing (car-agnostic) pre-approval, so the
// customer can convert "pre-aprobado hasta RD$X" into a real application for a
// specific car WITHOUT repeating KYC. Reuses the same application row.
export async function attachVehicleToApplication(applicationId, { vehicleDbId, dealerDbId, requestedAmount }) {
  if (!LIVE) return { ok: true }
  const { error } = await supabase.from('financing_applications').update({
    vehicle_id: vehicleDbId || null,
    dealer_id: dealerDbId || null,
    requested_amount: requestedAmount != null ? Number(requestedAmount) : null,
  }).eq('id', applicationId)
  if (error) throw error
  return { ok: true }
}

// ---------------- Dealer panel ----------------
export async function getDealerData(dealerDbId) {
  if (!LIVE) return { inventory: dealerInventory, leads: dealerLeads }
  const [{ data: inv }, { data: leads }] = await Promise.all([
    supabase.from('vehicles').select(VEHICLE_SELECT).eq('dealer_id', dealerDbId),
    supabase.from('financing_applications')
      .select('*, vehicle:vehicles(make, model, year), responses:application_banks(status)')
      .eq('dealer_id', dealerDbId).order('created_at', { ascending: false }),
  ])
  return {
    inventory: (inv || []).map(mapVehicle),
    leads: (leads || []).map((a) => ({
      customer: a.buyer_name,
      vehicle: a.vehicle ? `${a.vehicle.make} ${a.vehicle.model} ${a.vehicle.year}` : '—',
      amount: Number(a.requested_amount),
      kyc: a.kyc_status === 'aprobado' ? 'aprobado' : 'pendiente',
      bank: mapBankStatus((a.responses || [])[0]?.status), salesperson: a.salesperson || 'Sin asignar',
    })),
  }
}

async function uploadVehiclePhoto(vehicleId, file, position) {
  const path = `${vehicleId}/${Date.now()}-${position}-${safeFileName(file.name)}`
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type || undefined,
      upsert: false,
    })
  if (uploadError) throw uploadError

  const { data: publicData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  const { data, error } = await supabase.from('vehicle_photos').insert({
    vehicle_id: vehicleId,
    url: publicData?.publicUrl,
    storage_path: path,
    position,
    is_cover: position === 0,
  }).select().single()
  if (error) throw error
  return data
}

export async function createVehicle(v) {
  const photos = Array.from(v.photos || []).slice(0, 20)
  if (!LIVE) return { ok: true, demo: true, photos: photos.length }
  const { data: userRes } = await supabase.auth.getUser()
  const uid = userRes?.user?.id
  const { data: prof } = await supabase.from('profiles').select('dealer_id').eq('id', uid).single()
  const slug = `${v.make}-${v.model}-${v.year}-${Math.random().toString(36).slice(2, 6)}`
    .toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const { data, error } = await supabase.from('vehicles').insert({
    dealer_id: prof?.dealer_id, slug,
    make: v.make, model: v.model, year: Number(v.year), trim: v.trim,
    transmission: v.transmission, fuel: v.fuel, engine: v.engine,
    mileage: Number(v.mileage) || 0, color: v.color, body_type: v.bodyType,
    price: Number(v.price), condition: v.condition, certified: !!v.certified,
    location: v.location, description: v.description,
    features: Array.isArray(v.features) ? v.features : [],
    lat: v.lat != null && v.lat !== '' ? Number(v.lat) : null,
    lng: v.lng != null && v.lng !== '' ? Number(v.lng) : null,
    monthly: Math.round((Number(v.price) * 0.8 * 0.013) || 0), apr: 9.75, term_years: 7,
    status: 'publicado',
  }).select().single()
  if (error) throw error
  for (let i = 0; i < photos.length; i += 1) {
    await uploadVehiclePhoto(data.id, photos[i], i)
  }
  if (photos.length) {
    await supabase.from('vehicles').update({ photos_count: photos.length }).eq('id', data.id)
  }
  return data
}

// ---------------- Bank panel ----------------
export async function getBankApplications(bankDbId, filter = 'todas') {
  if (!LIVE) {
    return bankApplications.filter((a) => filter === 'todas' || a.status === filter)
  }
  let q = supabase.from('application_banks')
    .select('*, app:financing_applications(*, vehicle:vehicles(make, model, year), dealer:dealers(name), financials:application_financials(income, employment_type))')
    .eq('bank_id', bankDbId)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((r) => {
    const fin = Array.isArray(r.app?.financials) ? r.app.financials[0] : r.app?.financials
    const isPre = !r.app?.vehicle_id
    return {
      id: r.app?.code, customer: r.app?.buyer_name, cedula: '—',
      isPreapproval: isPre,
      vehicle: r.app?.vehicle ? `${r.app.vehicle.make} ${r.app.vehicle.model} ${r.app.vehicle.year}` : '',
      dealer: r.app?.dealer?.name, amount: r.app?.requested_amount != null ? Number(r.app.requested_amount) : null,
      down: r.app?.down_payment != null ? Number(r.app.down_payment) : null, term: r.app?.term_years,
      income: fin?.income, employment: fin?.employment_type,
      approvedAmount: r.approved_amount != null ? Number(r.approved_amount) : null,
      kyc: r.app?.kyc_status === 'aprobado' ? 'aprobado' : 'pendiente', consent: r.app?.consent_signed,
      status: filterFromResponse(r.status), responseId: r.id, applicationId: r.application_id || r.app?.id,
    }
  })
}

export async function submitBankResponse(responseId, body) {
  if (!LIVE) return { ok: true }
  const { error } = await supabase.from('application_banks').update({
    status: body.status, apr: body.apr, term_years: body.term,
    monthly: body.monthly, down_required: body.down, notes: body.notes,
    approved_amount: body.approvedAmount != null ? Number(body.approvedAmount) : null,
    responded_at: new Date().toISOString(),
  }).eq('id', responseId)
  if (error) throw error
  // Fire-and-forget: WhatsApp ping + in-app notification for the buyer & dealer.
  supabase.functions.invoke('wa-notify', { body: { response_id: responseId, event: 'bank_response' } }).catch(() => {})
  supabase.rpc('notify_bank_response', { p_response_id: responseId }).catch(() => {})
  return { ok: true }
}

// ---------------- WhatsApp OTP (claim) ----------------
// Sends a code to the buyer's WhatsApp (from the operator's linked number via
// the Baileys worker) and verifies it, stamping the verified phone on the profile.
export async function sendPhoneOtp(phone, kind = 'otp') {
  if (!LIVE) return { ok: true, simulated: true }
  const { data, error } = await supabase.functions.invoke('wa-send-otp', { body: { phone, kind } })
  if (error) return { ok: false, error: error.message }
  return data
}
// ---------------- WhatsApp login (phone OTP) ----------------
// Logged-out buyers sign in with their WhatsApp number: a code is sent to it,
// they confirm it, and a real Supabase session is minted (re-loginable account
// keyed to the phone). Reuses the same delivery gateway.
export async function startPhoneLogin(phone) {
  if (!LIVE) return { ok: true, simulated: true }
  const { data, error } = await supabase.functions.invoke('wa-login-start', { body: { phone } })
  if (error) return { ok: false, error: error.message }
  return data
}
export async function verifyPhoneLogin(phone, code) {
  if (!LIVE) return { ok: true, simulated: true }
  const { data, error } = await supabase.functions.invoke('wa-login-verify', { body: { phone, code } })
  if (error) return { ok: false, error: error.message }
  if (!data?.ok || !data?.password) return { ok: false, error: data?.error || 'wrong_code' }
  // One-time password grant → real session in this browser's client.
  const { error: sErr } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password })
  if (sErr) return { ok: false, error: sErr.message }
  return { ok: true }
}

// Admin: history of WhatsApp messages AutoRD sent. kind = null | 'otp' | 'notif'.
export async function getNotifications(kind = null, limit = 60) {
  if (!LIVE) return []
  const { data, error } = await supabase.rpc('wa_notifications_list', { p_kind: kind, p_limit: limit })
  if (error) throw error
  return data || []
}
export async function verifyPhoneOtp(phone, code) {
  if (!LIVE) return { ok: true, verified: true, simulated: true }
  const { data, error } = await supabase.functions.invoke('wa-verify-otp', { body: { phone, code } })
  if (error) return { ok: false, error: error.message }
  return data
}

// ---------------- Super-admin: WhatsApp sender pairing ----------------
// Is the WhatsApp gateway (reuse Reparando's worker) active + ready? No message sent.
export async function checkWaGateway() {
  if (!LIVE) return { mode: 'autord', ready: false }
  const { data, error } = await supabase.functions.invoke('wa-send-otp', { body: { check: true } })
  if (error) return { mode: 'unknown', ready: false, error: error.message }
  return data
}
export async function getWaStatus() {
  if (!LIVE) return { status: 'disconnected', enabled: false }
  const { data, error } = await supabase.rpc('wa_connection_status')
  if (error) throw error
  return data || { status: 'disconnected', enabled: false }
}
export async function waLinkQr() {
  const { error } = await supabase.rpc('wa_baileys_link')
  if (error) throw error
  return { ok: true }
}
export async function waStartPairing(phone) {
  const { error } = await supabase.rpc('wa_start_pairing', { p_phone: phone })
  if (error) throw error
  return { ok: true }
}
export async function waDisconnect() {
  const { error } = await supabase.rpc('wa_disconnect')
  if (error) throw error
  return { ok: true }
}

// ---------------- WhatsApp inbox (dealer/bank, two-way chat) ----------------
export async function ibStatus() {
  if (!LIVE) return { status: 'disconnected', enabled: false }
  const { data, error } = await supabase.rpc('wa_ib_status')
  if (error) throw error
  return (data && data[0]) || { status: 'disconnected', enabled: false }
}
export async function ibLink() { const { error } = await supabase.rpc('wa_ib_link'); if (error) throw error; return { ok: true } }
export async function ibPair(phone) { const { error } = await supabase.rpc('wa_ib_pair', { p_phone: phone }); if (error) throw error; return { ok: true } }
export async function ibDisconnect() { const { error } = await supabase.rpc('wa_ib_disconnect'); if (error) throw error; return { ok: true } }
export async function ibConversations() {
  if (!LIVE) return []
  const { data, error } = await supabase.rpc('wa_ib_conversations')
  if (error) throw error
  return data || []
}
export async function ibMessages(convId) {
  if (!LIVE) return []
  const { data, error } = await supabase.rpc('wa_ib_messages', { p_conversation: convId })
  if (error) throw error
  return data || []
}
export async function ibSend(convId, body) {
  const { error } = await supabase.rpc('wa_ib_send', { p_conversation: convId, p_body: body })
  if (error) throw error
  return { ok: true }
}

// ---------------- helpers ----------------
function mapBankStatus(s) {
  return ({ oferta: 'offer', preaprobada: 'offer', en_evaluacion: 'evaluating',
    pendiente_docs: 'docs', rechazada: 'rejected', pendiente: 'pending' })[s] || 'pending'
}
function bankStatusLabel(s) {
  return ({ oferta: 'Oferta recibida', preaprobada: 'Pre-aprobado', en_evaluacion: 'En evaluación',
    pendiente_docs: 'Pendiente documentos', rechazada: 'Rechazada', pendiente: 'Pendiente' })[s] || 'Pendiente'
}
function filterFromResponse(s) {
  return ({ pendiente: 'nueva', en_evaluacion: 'evaluando', pendiente_docs: 'docs',
    preaprobada: 'preaprobada', oferta: 'preaprobada', rechazada: 'rechazada' })[s] || 'nueva'
}

export { bankStatusMeta }
