// Lead readiness and vehicle matching for the dealer console.
//
// Both are pure and both refuse to invent. A dealer acts on these: a badge
// saying "Listo para comprar" sends someone to call, and "Frío" sends them to
// stop calling. Wrong either way costs a sale or wastes a day.
//
// One omission from the brief is deliberate. "Riesgo alto" is not implemented:
// risk lives in the bank's flags, which dealers cannot see by design
// (bank_client_details and financing_internal_notes are scoped to auth_bank_id()).
// The only ways to show it here would be to leak bank-private analysis or to
// invent it. Neither is acceptable, so the badge does not exist.

import { vehicleFit } from './finance'

export const READINESS = {
  listo:        { label: 'Listo para comprar', tone: 'green', rank: 0 },
  preaprobado:  { label: 'Pre-aprobado',       tone: 'green', rank: 1 },
  faltan_docs:  { label: 'Faltan documentos',  tone: 'amber', rank: 2 },
  en_banco:     { label: 'En revisión banco',  tone: 'blue',  rank: 3 },
  precalificado:{ label: 'Pre-calificado',     tone: 'blue',  rank: 4 },
  interesado:   { label: 'Interesado',         tone: 'slate', rank: 5 },
  navegando:    { label: 'Navegando',          tone: 'slate', rank: 6 },
  frio:         { label: 'Frío',               tone: 'slate', rank: 7 },
}

const DAY = 86_400_000
const daysSince = (iso) => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((Date.now() - t) / DAY)
}
const daysUntilDate = (iso) => {
  if (!iso) return null
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / DAY)
}

/**
 * @param {object} lead  a merged lead from mergeLeadSources()
 * @returns {{key,label,tone,reasons:string[],stale:number|null}}
 */
export function leadReadiness(lead = {}) {
  const reasons = []
  const approved = Number(lead.approvedAmount) > 0
  const stale = daysSince(lead.lastAt || lead.lastActivity)

  let key
  if (approved && lead.vehicle) key = 'listo'
  else if (approved) key = 'preaprobado'
  else if (lead.needsDocs) key = 'faltan_docs'
  else if (lead.inBank) key = 'en_banco'
  else if (lead.kycVerified) key = 'precalificado'
  else if (lead.vehicle) key = 'interesado'
  else key = 'navegando'

  // Going cold only overrides the weak states. A pre-approved buyer who has not
  // been called in a week is not a cold lead — that is an urgent one, and the
  // staleness belongs in the reasons where it reads as a prompt.
  const COLD_AFTER = 14
  if (stale != null && stale >= COLD_AFTER && ['navegando', 'interesado'].includes(key)) {
    key = 'frio'
  }

  if (approved) reasons.push(`Aprobado por banco${lead.approvedAmount ? ` hasta ${fmt(lead.approvedAmount)}` : ''}`)
  if (lead.needsDocs) reasons.push('Le faltan documentos')
  if (lead.inBank) reasons.push('Su solicitud está en el banco')
  if (lead.kycVerified) reasons.push('Identidad verificada')
  if (!lead.phone) reasons.push('Sin teléfono registrado')
  if (lead.vehicle) reasons.push('Tiene un vehículo de interés')
  if (stale != null && stale >= 5) {
    reasons.push(`Hace ${stale} día${stale === 1 ? '' : 's'} sin seguimiento`)
  }
  if (lead.approvalValidUntil) {
    const left = daysUntilDate(lead.approvalValidUntil)
    if (Number.isFinite(left)) {
      if (left < 0) reasons.push('Su aprobación venció')
      else if (left <= 7) reasons.push(`Su aprobación vence en ${left} día${left === 1 ? '' : 's'}`)
    }
  }

  return { key, ...READINESS[key], reasons, stale }
}

// Sorting the queue: who to call first.
export const readinessRank = (lead) => READINESS[leadReadiness(lead).key]?.rank ?? 9

export const MATCH = {
  excelente: { label: 'Excelente opción', tone: 'green' },
  dentro:    { label: 'Dentro de rango',  tone: 'green' },
  ajustado:  { label: 'Ajustado',         tone: 'amber' },
  fuera:     { label: 'Fuera de rango',   tone: 'red' },
}

// Shown when there is nothing to match against, rather than a made-up ranking.
export const NO_FINANCING_MSG = 'Necesita pre-calificación para recomendaciones precisas.'

/**
 * Rank this dealer's stock against what the buyer can actually finance.
 * @returns {{matches:Array, message:string|null}}
 */
export function matchVehicles(lead = {}, inventory = [], { limit = 6 } = {}) {
  const ceiling = Number(lead.approvedAmount) || 0
  const stock = (inventory || []).filter((v) => Number(v?.price) > 0)
  if (!ceiling) return { matches: [], message: NO_FINANCING_MSG }
  if (!stock.length) return { matches: [], message: 'No hay vehículos con precio en tu inventario.' }

  const scored = stock.map((v) => {
    const fit = vehicleFit({ price: v.price, approvedAmount: ceiling, apr: lead.apr ?? undefined, termYears: lead.term ?? undefined })
    // vehicleFit returns null only without a price or ceiling, both checked above.
    const usage = fit.financed / ceiling
    let key
    let reason
    if (!fit.fits) {
      // Distinguish "a bit more inicial" from "this car is out of reach".
      if (fit.extraDownNeeded <= ceiling * 0.15) { key = 'ajustado'; reason = 'Requiere mayor inicial' }
      else { key = 'fuera'; reason = 'Sobrepasa aprobación' }
    } else if (usage <= 0.75) { key = 'excelente'; reason = 'Cuota estimada cómoda' }
    else { key = 'dentro'; reason = 'Dentro del monto aprobado' }
    return { vehicle: v, fit, key, ...MATCH[key], reason }
  })

  const order = { excelente: 0, dentro: 1, ajustado: 2, fuera: 3 }
  scored.sort((a, b) => (order[a.key] - order[b.key]) || (b.vehicle.price - a.vehicle.price))

  // Out-of-reach cars are not recommendations; they are only worth showing when
  // there is nothing better to offer.
  const usable = scored.filter((m) => m.key !== 'fuera')
  return { matches: (usable.length ? usable : scored).slice(0, limit), message: null }
}

const fmt = (n) => `RD$ ${Math.round(n).toLocaleString('es-DO')}`
