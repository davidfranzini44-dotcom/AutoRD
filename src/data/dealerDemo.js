// ============================================================
// Centralized demo data for the dealer "command center".
// Blends with the dealer's REAL inventory (leads/financing reference
// actual vehicles when available); pads with realistic DR-market data.
// Everything here is deterministic (no randomness) so it stays stable.
// ============================================================

export const SALESPEOPLE = [
  { id: 's1', name: 'Carlos Jiménez', initials: 'CJ' },
  { id: 's2', name: 'María Rodríguez', initials: 'MR' },
  { id: 's3', name: 'Luis Fernández', initials: 'LF' },
]
const sp = (i) => SALESPEOPLE[i % SALESPEOPLE.length]

export const LEAD_STAGES = [
  { key: 'nuevo', label: 'Nuevo', color: '#3b82f6' },
  { key: 'contactado', label: 'Contactado', color: '#0ea5e9' },
  { key: 'financiamiento', label: 'Financiamiento', color: '#8b5cf6' },
  { key: 'negociando', label: 'Negociando', color: '#f59e0b' },
  { key: 'reservado', label: 'Reservado', color: '#14b8a6' },
  { key: 'vendido', label: 'Vendido', color: '#16a34a' },
  { key: 'perdido', label: 'Perdido', color: '#ef4444' },
]

export const FIN_STAGES = [
  { key: 'kyc_pendiente', label: 'KYC pendiente', tone: 'amber' },
  { key: 'kyc_aprobado', label: 'KYC aprobado', tone: 'blue' },
  { key: 'consentimiento', label: 'Consentimiento firmado', tone: 'blue' },
  { key: 'enviado', label: 'Enviado a bancos', tone: 'blue' },
  { key: 'documentos', label: 'Banco solicita documentos', tone: 'amber' },
  { key: 'preaprobado', label: 'Pre-aprobado', tone: 'green' },
  { key: 'rechazado', label: 'Rechazado', tone: 'red' },
]
export const finStage = (key) => FIN_STAGES.find((s) => s.key === key) || FIN_STAGES[0]

// Standalone identity-verification link a dealer sends a customer who hasn't
// done KYC (points at the /verificar page).
export function kycLink(origin, { vehiculo, nombre } = {}) {
  const p = new URLSearchParams()
  if (vehiculo) p.set('vehiculo', vehiculo)
  if (nombre) p.set('nombre', nombre)
  const qs = p.toString()
  return `${origin || ''}/verificar${qs ? `?${qs}` : ''}`
}

// Fallback vehicles when the dealer has little/no inventory loaded.
const FALLBACK_VEH = [
  { name: 'Toyota RAV4 2021', make: 'Toyota', model: 'RAV4', bodyType: 'SUV', price: 1850000, currency: 'DOP', tone: '#e2e8f0' },
  { name: 'Honda CR-V 2020', make: 'Honda', model: 'CR-V', bodyType: 'SUV', price: 1560000, currency: 'DOP', tone: '#4b5563' },
  { name: 'Kia Sportage 2022', make: 'Kia', model: 'Sportage', bodyType: 'SUV', price: 1690000, currency: 'DOP', tone: '#334155' },
  { name: 'Hyundai Tucson 2021', make: 'Hyundai', model: 'Tucson', bodyType: 'SUV', price: 1620000, currency: 'DOP', tone: '#64748b' },
]
function vehFor(inventory, i) {
  const v = inventory && inventory[i % Math.max(1, inventory.length)]
  if (v) {
    return { id: v.id, name: `${v.make} ${v.model} ${v.year}`, make: v.make, model: v.model, bodyType: v.bodyType, price: v.price, currency: v.currency, photo: v.coverPhoto, tone: v.tone }
  }
  return FALLBACK_VEH[i % FALLBACK_VEH.length]
}

// Lead seeds — customer + workflow metadata; vehicle is overlaid from inventory.
const LEAD_SEEDS = [
  { customer: 'Ramón Peralta', phone: '18095551201', stage: 'nuevo', fin: null, last: 'Hace 20 min', next: 'Hoy 4:00pm', unread: true, today: true, note: 'Preguntó por disponibilidad y si acepta cambio.' },
  { customer: 'Yleana Santos', phone: '18095551202', stage: 'nuevo', fin: 'kyc_pendiente', last: 'Hace 1 h', next: 'Hoy 5:30pm', unread: true, today: true, note: 'Quiere cuota estimada a 60 meses.' },
  { customer: 'Pedro Guzmán', phone: '18095551203', stage: 'contactado', fin: 'kyc_aprobado', last: 'Ayer', next: 'Mañana 10:00am', note: 'Interesado, pидет documentos de ingreso.' },
  { customer: 'Wendy Fernández', phone: '18095551204', stage: 'financiamiento', fin: 'enviado', last: 'Hace 3 h', next: 'Hoy 6:00pm', hot: true, amount: 1450000, income: 95000, down: 300000, note: 'Enviado a 3 bancos, esperando respuesta.' },
  { customer: 'José Almonte', phone: '18095551205', stage: 'financiamiento', fin: 'documentos', last: 'Ayer', next: 'Hoy 2:00pm', unread: true, amount: 1250000, income: 72000, down: 250000, note: 'BHD solicitó carta de trabajo.' },
  { customer: 'Carla Mejía', phone: '18095551206', stage: 'negociando', fin: 'preaprobado', last: 'Hace 5 h', next: 'Mañana 3:00pm', hot: true, amount: 1680000, income: 120000, down: 400000, note: 'Pre-aprobada 9.25%. Negociando inicial.' },
  { customer: 'Frank Reyes', phone: '18095551207', stage: 'negociando', fin: null, last: 'Ayer', next: 'Hoy 5:00pm', hot: true, note: 'Ofreció RD$50k menos, evaluar.' },
  { customer: 'Diana Castillo', phone: '18095551208', stage: 'reservado', fin: 'preaprobado', last: 'Hace 2 días', next: 'Firma jueves', amount: 1990000, income: 140000, down: 450000, note: 'Reservó con RD$25k. Cita para firma.' },
  { customer: 'Manuel Ovalles', phone: '18095551209', stage: 'vendido', fin: 'preaprobado', last: 'Hace 6 días', next: '—', amount: 1250000, note: 'Entregado. Excelente experiencia.' },
  { customer: 'Sofía Núñez', phone: '18095551210', stage: 'vendido', fin: null, last: 'Hace 9 días', next: '—', note: 'Pago de contado.' },
  { customer: 'Héctor Beltré', phone: '18095551211', stage: 'perdido', fin: 'rechazado', last: 'Hace 4 días', next: '—', note: 'Banco rechazó, no calificó.' },
  { customer: 'Gabriela Lora', phone: '18095551212', stage: 'contactado', fin: null, last: 'Hace 8 h', next: 'Mañana 11:00am', note: 'Pidió más fotos del interior.' },
]

export function buildLeads(inventory) {
  return LEAD_SEEDS.map((s, i) => ({
    id: `L-${1000 + i}`,
    ...s,
    vehicle: vehFor(inventory, i),
    salesperson: sp(i),
    timeline: [
      { t: s.last, text: 'Último contacto por WhatsApp' },
      { t: 'Antes', text: 'Lead recibido desde el marketplace' },
    ],
  }))
}

// Financing applications for this dealer's vehicles.
const FIN_SEEDS = [
  { customer: 'Wendy Fernández', phone: '18095551204', status: 'enviado', amount: 1450000, down: 300000, income: 95000, banks: ['Banco Popular', 'BHD', 'Banreservas'], best: null, missing: [] },
  { customer: 'José Almonte', phone: '18095551205', status: 'documentos', amount: 1250000, down: 250000, income: 72000, banks: ['BHD', 'Scotiabank'], best: null, missing: ['Carta de trabajo', 'Últimos 3 estados de cuenta'] },
  { customer: 'Carla Mejía', phone: '18095551206', status: 'preaprobado', amount: 1680000, down: 400000, income: 120000, banks: ['Banco Popular', 'BHD'], best: { bank: 'BHD', apr: 9.25, monthly: 27950 }, missing: [] },
  { customer: 'Diana Castillo', phone: '18095551208', status: 'preaprobado', amount: 1990000, down: 450000, income: 140000, banks: ['Banreservas', 'Banco Popular'], best: { bank: 'Banreservas', apr: 8.95, monthly: 31200 }, missing: [] },
  { customer: 'Yleana Santos', phone: '18095551202', status: 'kyc_pendiente', amount: 1180000, down: 200000, income: 68000, banks: [], best: null, missing: ['Verificación de identidad (KYC)'] },
  { customer: 'Héctor Beltré', phone: '18095551211', status: 'rechazado', amount: 1350000, down: 150000, income: 55000, banks: ['BHD', 'Scotiabank'], best: null, missing: [] },
]
export function buildFinancing(inventory) {
  return FIN_SEEDS.map((s, i) => ({ id: `AP-${2040 + i}`, ...s, vehicle: vehFor(inventory, i) }))
}

// Recent activity timeline for the dashboard.
export function buildActivity(inventory) {
  const v = (i) => vehFor(inventory, i).name
  return [
    { kind: 'lead', text: `Nuevo lead de Ramón Peralta por ${v(0)}`, time: 'Hace 20 min' },
    { kind: 'financing', text: `Wendy Fernández envió financiamiento a 3 bancos`, time: 'Hace 3 h' },
    { kind: 'offer', text: `BHD pre-aprobó a Carla Mejía al 9.25%`, time: 'Hace 5 h' },
    { kind: 'message', text: `José Almonte respondió por WhatsApp`, time: 'Hace 6 h' },
    { kind: 'view', text: `${v(1)} alcanzó 100 vistas esta semana`, time: 'Ayer' },
    { kind: 'sale', text: `Manuel Ovalles marcó como vendido ${v(2)}`, time: 'Hace 6 días' },
  ]
}

// ---- Listing quality score (used in inventory + dashboard "incompletos") ----
export function listingScore(v) {
  const checks = [
    { key: 'Fotos', ok: (v.photos || 0) >= 3, partial: (v.photos || 0) >= 1, weight: 25 },
    { key: 'Descripción', ok: (v.description || '').trim().length >= 40, weight: 20 },
    { key: 'Precio', ok: Number(v.price) > 0, weight: 15 },
    { key: 'Financiamiento', ok: !!v.financing || Number(v.monthly) > 0, weight: 15 },
    { key: 'Ubicación', ok: !!v.location, weight: 10 },
    { key: 'Specs', ok: !!(v.transmission && v.fuel && v.mileage != null && v.color), weight: 15 },
  ]
  let score = 0
  const missing = []
  for (const c of checks) {
    if (c.ok) score += c.weight
    else if (c.partial) { score += Math.round(c.weight / 2); missing.push(c.key) }
    else missing.push(c.key)
  }
  return { score, missing }
}

// Dashboard KPIs + urgent tasks, computed from real inventory + demo workflow.
export function dashboardStats(inventory, leads, financing) {
  const published = inventory.filter((v) => (v.status || 'publicado') === 'publicado')
  const noPhotos = inventory.filter((v) => (v.photos || 0) === 0)
  const incompletos = inventory.filter((v) => listingScore(v).score < 70)
  const unread = leads.filter((l) => l.unread)
  const nuevosHoy = leads.filter((l) => l.today)
  const esperandoDocs = financing.filter((f) => f.status === 'documentos')
  const hot = leads.filter((l) => l.hot)

  const kpis = [
    { key: 'leads', label: 'Leads nuevos hoy', value: nuevosHoy.length, to: '/dealer/leads' },
    { key: 'financing', label: 'Solicitudes de financiamiento', value: financing.length, to: '/dealer/financiamiento' },
    { key: 'inventory', label: 'Vehículos publicados', value: published.length, to: '/dealer/inventario' },
    { key: 'messages', label: 'Mensajes sin responder', value: unread.length, to: '/dealer/whatsapp' },
    { key: 'incomplete', label: 'Vehículos incompletos', value: incompletos.length, to: '/dealer/inventario' },
    { key: 'sales', label: 'Ventas potenciales', value: hot.length, to: '/dealer/leads' },
  ]

  const tareas = [
    unread.length && { key: 'leads', label: `${unread.length} lead${unread.length === 1 ? '' : 's'} sin responder`, to: '/dealer/leads', tone: 'amber' },
    esperandoDocs.length && { key: 'docs', label: `${esperandoDocs.length} solicitud${esperandoDocs.length === 1 ? '' : 'es'} esperando documentos`, to: '/dealer/financiamiento', tone: 'amber' },
    noPhotos.length && { key: 'photos', label: `${noPhotos.length} vehículo${noPhotos.length === 1 ? '' : 's'} sin portada / fotos`, to: '/dealer/inventario', tone: 'red' },
    incompletos.length && { key: 'incomplete', label: `${incompletos.length} publicación${incompletos.length === 1 ? '' : 'es'} incompleta${incompletos.length === 1 ? '' : 's'}`, to: '/dealer/inventario', tone: 'blue' },
  ].filter(Boolean)

  return { kpis, tareas, published }
}
