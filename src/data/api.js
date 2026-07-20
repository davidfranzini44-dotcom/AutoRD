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

export { fmtRD } from './demo'
export const LIVE = isSupabaseConfigured

// Parse a free-text money field ("RD$ 85,000") into a number, or null.
export function parseMoney(s) {
  if (s == null) return null
  const n = Number(String(s).replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

// Map a DB vehicle row (+ joined dealer) to the shape the UI components expect.
function mapVehicle(r) {
  const dealer = r.dealer || {}
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
    financing: r.financing, tone: r.tone,
    monthly: Number(r.monthly), downPct: 20, apr: Number(r.apr), termYears: r.term_years,
    photos: r.photos_count, description: r.description,
    features: Array.isArray(r.features) ? r.features : [],
    status: r.status,
  }
}

const VEHICLE_SELECT = '*, dealer:dealers(name, verified, slug, initials)'

// ---------------- Vehicles ----------------
export async function listVehicles({ tab = 'todos' } = {}) {
  if (!LIVE) {
    return demoVehicles.filter((v) => {
      if (tab === 'nuevos') return v.condition === 'Nuevo'
      if (tab === 'cert') return v.certified
      if (tab === 'fin') return v.financing
      return true
    })
  }
  let q = supabase.from('vehicles').select(VEHICLE_SELECT).eq('status', 'publicado')
  if (tab === 'nuevos') q = q.eq('condition', 'nuevo')
  if (tab === 'cert') q = q.eq('certified', true)
  if (tab === 'fin') q = q.eq('financing', true)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapVehicle)
}

export async function getVehicleBySlug(slug) {
  if (!LIVE) return demoVehicles.find((v) => v.id === slug) || null
  const { data, error } = await supabase.from('vehicles').select(VEHICLE_SELECT).eq('slug', slug).single()
  if (error) return null
  return mapVehicle(data)
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
    return Object.values(byName)
  }
  const { data, error } = await supabase
    .from('dealers')
    .select('id, name, slug, city, verified, initials, phone, whatsapp, vehicles(*)')
    .order('name')
  if (error) throw error
  return (data || []).map((d) => ({
    id: d.id, name: d.name, slug: d.slug, city: d.city, verified: d.verified,
    phone: d.phone, whatsapp: d.whatsapp,
    initials: d.initials || initialsOf(d.name),
    // Map each vehicle and stamp the dealer (the nested select omits the dealer join).
    vehicles: (d.vehicles || [])
      .filter((v) => v.status === 'publicado')
      .map((v) => ({ ...mapVehicle(v), dealer: d.name, dealerVerified: d.verified, dealerDbId: d.id })),
  }))
}

export async function getDealerBySlug(slug) {
  if (!LIVE) {
    const all = await listDealers()
    return all.find((d) => d.slug === slug) || null
  }
  const { data, error } = await supabase
    .from('dealers')
    .select('id, name, slug, city, verified, initials, phone, whatsapp, hours, locations, vehicles(*)')
    .eq('slug', slug).single()
  if (error) return null
  return {
    id: data.id, name: data.name, slug: data.slug, city: data.city, verified: data.verified,
    phone: data.phone, whatsapp: data.whatsapp, hours: data.hours,
    locations: Array.isArray(data.locations) ? data.locations : [],
    initials: data.initials || initialsOf(data.name),
    vehicles: (data.vehicles || [])
      .filter((v) => v.status === 'publicado')
      .map((v) => ({ ...mapVehicle(v), dealer: data.name, dealerVerified: data.verified, dealerDbId: data.id })),
  }
}

// Dealer console: read + update the signed-in dealer's own editable profile.
export async function getMyDealer(dealerDbId) {
  if (!LIVE || !dealerDbId) return null
  const { data, error } = await supabase
    .from('dealers')
    .select('id, name, slug, city, phone, whatsapp, hours, locations')
    .eq('id', dealerDbId).single()
  if (error) return null
  return { ...data, locations: Array.isArray(data.locations) ? data.locations : [] }
}

export async function updateDealerProfile(dealerDbId, { whatsapp, hours, locations }) {
  if (!LIVE || !dealerDbId) return { ok: false, demo: true }
  const { error } = await supabase.from('dealers').update({
    whatsapp: whatsapp || null,
    hours: hours || null,
    locations: Array.isArray(locations) ? locations : [],
  }).eq('id', dealerDbId)
  if (error) throw error
  return { ok: true }
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

export async function createVehicle(v) {
  if (!LIVE) return { ok: true, demo: true }
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
    monthly: Math.round((Number(v.price) * 0.8 * 0.013) || 0), apr: 9.75, term_years: 7,
    status: 'publicado',
  }).select().single()
  if (error) throw error
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
      status: filterFromResponse(r.status), responseId: r.id,
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
  // Fire-and-forget: ping the buyer on WhatsApp that a bank responded.
  supabase.functions.invoke('wa-notify', { body: { response_id: responseId, event: 'bank_response' } }).catch(() => {})
  return { ok: true }
}

// ---------------- WhatsApp OTP (claim) ----------------
// Sends a code to the buyer's WhatsApp (from the operator's linked number via
// the Baileys worker) and verifies it, stamping the verified phone on the profile.
export async function sendPhoneOtp(phone) {
  if (!LIVE) return { ok: true, simulated: true }
  const { data, error } = await supabase.functions.invoke('wa-send-otp', { body: { phone } })
  if (error) return { ok: false, error: error.message }
  return data
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
