// ============================================================
// Bank portal — reviewers, document workflow, priority/SLA and
// deterministic enrichment of applications (contact, KYC/consent
// detail, review timeline) that the thin backend doesn't yet carry.
// Everything here is deterministic (no randomness) so it stays stable.
// ============================================================

export const REVIEWERS = [
  { id: 'r1', name: 'Laura Fernández', initials: 'LF' },
  { id: 'r2', name: 'Miguel Ortega', initials: 'MO' },
  { id: 'r3', name: 'Ana Pérez', initials: 'AP' },
]

export const REVIEWER_STATES = ['Sin asignar', 'En revisión', 'Esperando documentos', 'Listo para decisión']

export const DOC_TYPES = [
  'Comprobante de ingresos', 'Carta de trabajo', 'Estados de cuenta',
  'Certificación laboral', 'RNC / documentos del negocio', 'Formulario del banco', 'Otro',
]

// Internal document review statuses.
export const DOC_STATUS = {
  solicitado: { label: 'Solicitado', tone: 'blue' },
  recibido: { label: 'Recibido', tone: 'teal' },
  revision: { label: 'En revisión', tone: 'amber' },
  aceptado: { label: 'Aceptado', tone: 'green' },
  rechazado: { label: 'Rechazado', tone: 'red' },
}

export const TONE = {
  blue: { bg: '#dbeafe', fg: '#1d4ed8' }, teal: { bg: '#ccfbf1', fg: '#0f766e' },
  amber: { bg: '#fef3c7', fg: '#b45309' }, green: { bg: '#dcfce7', fg: '#166534' },
  red: { bg: '#fee2e2', fg: '#b91c1c' }, slate: { bg: '#e2e8f0', fg: '#475569' },
}

const hashInt = (s) => { let h = 0; const str = String(s || ''); for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h }

function maskCedula(c) {
  const s = String(c || '')
  if (!s || s === '—') return '***-*******-*'
  const parts = s.split('-')
  if (parts.length === 3) return `${parts[0]}-•••••••-${parts[2]}`
  return s.length > 4 ? `••••${s.slice(-4)}` : '***-*******-*'
}

const CITIES = ['Santo Domingo', 'Santiago', 'La Vega', 'San Cristóbal', 'Punta Cana', 'La Romana', 'San Francisco de Macorís']
const EMPLOYMENTS = ['Asalariado', 'Negocio propio', 'Independiente']

const relHrs = (h) => {
  if (h < 1) return 'Hace minutos'
  if (h < 24) return `Hace ${Math.round(h)} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'Ayer' : `Hace ${d} días`
}

// Priority signal for an enriched app.
export function appPriority(a) {
  if (a.status === 'rechazada') return { key: 'cerrada', label: 'Cerrada', tone: 'slate' }
  if (a.status === 'preaprobada') return { key: 'enviada', label: 'Respuesta enviada', tone: 'green' }
  if (a.status === 'docs') return { key: 'faltan', label: 'Faltan documentos', tone: 'amber' }
  const ready = a.kyc === 'aprobado' && a.consent
  if (a.hoursWaiting >= 48) return { key: 'urgente', label: 'Urgente', tone: 'red' }
  if (ready && a.status === 'evaluando') return { key: 'lista', label: 'Lista para decisión', tone: 'green' }
  if (ready) return { key: 'completa', label: 'Completa', tone: 'teal' }
  return { key: 'esperando', label: 'Esperando banco', tone: 'blue' }
}

// Add contact / KYC / consent detail, reviewer, SLA and a review timeline.
export function enrichApp(a, i = 0) {
  const h = hashInt(a.id || String(i))
  const hoursWaiting = [3, 9, 27, 51, 6, 14, 33, 2][h % 8]
  const reviewer = a.status === 'nueva' ? null : REVIEWERS[h % REVIEWERS.length]
  const first = (a.customer || '').split(' ')[0]
  const emailUser = first ? first.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '') : 'cliente'
  const enriched = {
    ...a,
    hoursWaiting,
    maskedCedula: maskCedula(a.cedula),
    phone: `1809${String(200 + (h % 700)).padStart(3, '0')}${String(1000 + (h % 8999)).padStart(4, '0')}`,
    email: `${emailUser}@correo.com`,
    city: CITIES[h % CITIES.length],
    employment: a.employment || EMPLOYMENTS[h % EMPLOYMENTS.length],
    reviewer,
    reviewerState: a.status === 'nueva' ? 'Sin asignar' : a.status === 'docs' ? 'Esperando documentos' : (a.status === 'evaluando' && a.kyc === 'aprobado' && a.consent) ? 'Listo para decisión' : 'En revisión',
    lastTouched: relHrs(Math.max(0, hoursWaiting - 1)),
    kycAt: relHrs(hoursWaiting + 6),
    cedulaVerified: a.kyc === 'aprobado',
    livenessPassed: a.kyc === 'aprobado',
    consentAt: relHrs(hoursWaiting + 5),
    consentVersion: 'v1.2',
    banksAuthorized: 'Banco Popular, BHD, Banreservas, Scotiabank',
    receivedAt: relHrs(hoursWaiting),
    incomeSource: a.employment === 'Negocio propio' ? 'Declarado (negocio)' : 'Declarado (nómina)',
  }
  enriched.priority = appPriority(enriched)
  enriched.timeline = buildTimeline(enriched)
  return enriched
}

function buildTimeline(a) {
  const t = []
  const push = (name, actor, hoursAgo, note) => t.push({ name, actor, when: relHrs(hoursAgo), note })
  const base = a.hoursWaiting
  push('Solicitud recibida', 'Sistema AutoRD', base + 8, `De ${a.dealer || 'dealer'}`)
  if (a.kyc === 'aprobado') push('KYC aprobado', 'DIDIT', base + 6, 'Cédula + prueba de vida')
  if (a.consent) push('Consentimiento firmado', a.customer, base + 5, 'Autorizó consulta crediticia')
  if (a.reviewer) push('Banco abrió la solicitud', a.reviewer.name, base + 2, null)
  if (a.status === 'docs') { push('Documento solicitado', a.reviewer?.name || 'Banco', base + 1, 'Comprobante de ingresos'); push('Documento recibido', a.customer, Math.max(0, base - 1), 'Estados de cuenta') }
  if (['evaluando', 'preaprobada', 'rechazada'].includes(a.status)) push('Evaluación iniciada', a.reviewer?.name || 'Banco', base, null)
  if (a.status === 'preaprobada') push('Oferta enviada', a.reviewer?.name || 'Banco', Math.max(0, base - 2), 'Pre-aprobación al cliente')
  if (a.status === 'rechazada') push('Rechazo enviado', a.reviewer?.name || 'Banco', Math.max(0, base - 2), null)
  return t
}

// -------- Dashboard / reports metrics computed from the enriched list --------
export function bankStats(apps) {
  const by = (s) => apps.filter((a) => a.status === s).length
  const ready = apps.filter((a) => a.status === 'evaluando' && a.kyc === 'aprobado' && a.consent).length
  const waiting = apps.filter((a) => ['nueva', 'evaluando'].includes(a.status) && a.hoursWaiting >= 24)
  const totalApproved = apps.filter((a) => a.status === 'preaprobada').reduce((s, a) => s + (Number(a.approvedAmount) || Number(a.amount) || 0), 0)
  const decided = apps.filter((a) => ['preaprobada', 'rechazada'].includes(a.status))
  const approvalRate = decided.length ? Math.round((by('preaprobada') / decided.length) * 100) : 0
  const avgHrs = apps.length ? (apps.reduce((s, a) => s + a.hoursWaiting, 0) / apps.length) : 0
  return {
    nuevas: by('nueva'), evaluando: by('evaluando'), docs: by('docs'),
    preaprobadas: by('preaprobada'), rechazadas: by('rechazada'),
    ready, waiting, totalApproved, approvalRate,
    rejectionRate: decided.length ? Math.round((by('rechazada') / decided.length) * 100) : 0,
    avgResponse: avgHrs >= 24 ? `${(avgHrs / 24).toFixed(1)} d` : `${avgHrs.toFixed(1)} h`,
    pendingCustomer: apps.filter((a) => a.status === 'preaprobada').length,
  }
}

export function byDealer(apps) {
  const map = new Map()
  for (const a of apps) {
    const d = a.dealer || '—'
    const cur = map.get(d) || { dealer: d, apps: 0, approved: 0, volume: 0 }
    cur.apps += 1
    if (a.status === 'preaprobada') { cur.approved += 1; cur.volume += Number(a.approvedAmount) || Number(a.amount) || 0 }
    map.set(d, cur)
  }
  return [...map.values()].sort((x, y) => y.apps - x.apps)
}

export function byAmountRange(apps) {
  const ranges = [
    { label: 'Hasta RD$ 1M', lo: 0, hi: 1_000_000 },
    { label: 'RD$ 1M – 1.5M', lo: 1_000_000, hi: 1_500_000 },
    { label: 'RD$ 1.5M – 2M', lo: 1_500_000, hi: 2_000_000 },
    { label: 'Más de RD$ 2M', lo: 2_000_000, hi: Infinity },
  ]
  return ranges.map((r) => ({ ...r, n: apps.filter((a) => (Number(a.amount) || 0) >= r.lo && (Number(a.amount) || 0) < r.hi).length }))
}
