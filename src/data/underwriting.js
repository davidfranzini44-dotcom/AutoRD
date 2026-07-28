// Bank-side decision support: risk flags and a capacity calculator.
//
// Neither of these decides anything. They surface what the record already says
// so an analyst can see it in one place instead of reconstructing it from five
// panels. Every output is advisory and labelled as such.
//
// Discipline for the flags: a flag is only raised from data we actually hold. A
// red flag against a real applicant is not a cosmetic detail — it can cost
// someone a car — so "we don't know" must render as nothing, never as a
// warning. Flags that need data the panel does not have yet (duplicate
// applications, client history) are supported through explicit optional context
// and stay silent until a caller passes it.

import { estimateMonthly, maxPrincipal } from './finance'

export const FLAG_LEVEL = {
  alta: { label: 'Alta', tone: 'red' },
  media: { label: 'Media', tone: 'amber' },
}

const num = (v) => (v == null || v === '' ? null : Number(v))
const pos = (v) => { const n = num(v); return n != null && Number.isFinite(n) && n > 0 ? n : null }

/**
 * @param {object} a        a row from getBankApplications()
 * @param {object} ctx      optional extras the panel may or may not have:
 *                          { documents, duplicateCount, hasHistory, phoneVerified }
 * @returns {Array<{key,level,label,detail}>}
 */
export function riskFlags(a = {}, ctx = {}) {
  const flags = []
  const add = (key, level, label, detail) => flags.push({ key, level, label, detail })

  // --- identity -------------------------------------------------------------
  if (a.kyc !== 'aprobado') {
    add('identidad', 'alta', 'Identidad no verificada',
      'El cliente no ha completado la verificación con cédula y selfie.')
  }
  if (a.consent === false) {
    add('consentimiento', 'alta', 'Sin consentimiento firmado',
      'No hay autorización para consultar el historial crediticio.')
  }
  // Only when we genuinely hold nothing. cedulaLast4 is the display field; the
  // mask is the older one. Either counts as "we have it".
  if (!a.cedulaLast4 && !a.maskedCedula && !a.cedula) {
    add('cedula', 'media', 'Cédula incompleta',
      'No hay número de cédula registrado en la solicitud.')
  }
  // Absent phone is a fact. "Not verified" needs phone_verified_at, which the
  // bank does not receive, so it is only raised when a caller supplies it.
  if (!a.phone) {
    add('telefono', 'media', 'Sin teléfono registrado',
      'No hay forma de contactar al cliente por WhatsApp.')
  } else if (ctx.phoneVerified === false) {
    add('telefono_no_verificado', 'media', 'Teléfono no verificado',
      'El número no ha sido confirmado por código.')
  }

  // --- income ---------------------------------------------------------------
  const income = pos(a.income)
  if (!income) {
    add('ingreso_pendiente', 'alta', 'Ingreso pendiente',
      'El cliente no declaró un ingreso mensual.')
  }

  // --- amounts --------------------------------------------------------------
  const amount = pos(a.amount)
  const down = num(a.down)
  const price = pos(a.vehiclePrice)

  if (income && amount) {
    const months = Math.max(1, Math.round(num(a.term) || 5) * 12)
    const monthly = estimateMonthly(amount, num(a.apr) ?? 12, months)
    // 40% of gross is a widely used ceiling; above it the file needs a reason.
    if (monthly / income > 0.4) {
      add('ingreso_insuficiente', 'alta', 'Ingreso insuficiente',
        `La cuota estimada supera el 40% del ingreso declarado (${Math.round((monthly / income) * 100)}%).`)
    }
  }

  if (amount && down != null && down >= 0) {
    const pct = (down / amount) * 100
    if (pct < 10) {
      add('inicial_bajo', 'media', 'Inicial bajo',
        `El inicial cubre ${pct.toFixed(0)}% del monto solicitado.`)
    }
  }

  // Financing more than the car is worth. Only checked when both figures exist —
  // a missing price is not evidence of an inconsistency.
  if (amount && price && amount > price) {
    add('precio_inconsistente', 'alta', 'Monto mayor al precio del vehículo',
      'La solicitud pide financiar más de lo que cuesta el vehículo.')
  }

  // --- documents ------------------------------------------------------------
  const docs = Array.isArray(ctx.documents) ? ctx.documents : null
  if (docs && docs.length) {
    const received = new Set(['aceptado', 'recibido', 'subido', 'revision'])
    const missing = docs.filter((d) => !received.has(d.status))
    if (missing.length) {
      add('documentos', 'media', 'Documentos faltantes',
        `${missing.length} documento${missing.length === 1 ? '' : 's'} sin recibir.`)
    }
  }

  // --- validity -------------------------------------------------------------
  if (a.expired) {
    add('expirada', 'media', 'Aprobación expirada',
      'La vigencia de la oferta ya venció; hay que emitir condiciones nuevas.')
  }

  // --- context-dependent, silent unless the caller supplies the data ---------
  if (typeof ctx.duplicateCount === 'number' && ctx.duplicateCount > 1) {
    add('duplicada', 'media', 'Solicitud duplicada',
      `El cliente tiene ${ctx.duplicateCount} solicitudes abiertas con este banco.`)
  }
  if (ctx.hasHistory === false) {
    add('sin_historial', 'media', 'Cliente sin historial',
      'Primera solicitud de este cliente con el banco.')
  }

  return flags
}

export function riskSummary(flags = []) {
  const alta = flags.filter((f) => f.level === 'alta').length
  const media = flags.filter((f) => f.level === 'media').length
  return {
    alta,
    media,
    total: flags.length,
    clean: flags.length === 0,
    // Deliberately not a score. A number invites treating it as a decision.
    label: alta > 0 ? 'Revisar con cuidado' : media > 0 ? 'Revisar' : 'Sin alertas importantes detectadas',
    tone: alta > 0 ? 'red' : media > 0 ? 'amber' : 'green',
  }
}

/**
 * Capacity calculator. Decision SUPPORT only — it never returns approve/reject.
 *
 * @returns null when there is not enough input to say anything honest.
 */
export function assessCapacity({
  income, monthlyDebts = 0, downAvailable = 0, vehiclePrice = null,
  requestedAmount = null, apr = 12, termYears = 5, maxDtiPct = 40,
} = {}) {
  const inc = pos(income)
  if (!inc) return null

  const months = Math.max(1, Math.round(num(termYears) || 5) * 12)
  const rate = num(apr) ?? 12
  const debts = Math.max(0, num(monthlyDebts) || 0)
  const down = Math.max(0, num(downAvailable) || 0)

  // What they want to finance: the stated amount, else price minus what they
  // can put down.
  const price = pos(vehiclePrice)
  const financed = pos(requestedAmount) ?? (price ? Math.max(0, price - down) : null)

  // Room for a car payment after existing obligations.
  const ceiling = inc * (Math.max(1, num(maxDtiPct) || 40) / 100)
  const maxMonthly = Math.max(0, ceiling - debts)
  const maxFinanceable = maxMonthly > 0 ? maxPrincipal(maxMonthly, rate, months) : 0

  const monthly = financed ? estimateMonthly(financed, rate, months) : null
  const dti = monthly != null ? (monthly + debts) / inc : null
  const ratio = monthly != null && maxMonthly > 0 ? monthly / maxMonthly : null

  let verdict = null
  if (ratio != null) {
    verdict = ratio <= 0.85 ? 'dentro' : ratio <= 1 ? 'ajustado' : 'fuera'
  }

  const pct = (n) => `${Math.round(n * 100)}%`
  const explanation = verdict === 'dentro'
    ? `La cuota estimada usa ${pct(ratio)} de la capacidad disponible. Con las deudas declaradas, la relación cuota/ingreso queda en ${pct(dti)}.`
    : verdict === 'ajustado'
      ? `La cuota estimada consume casi toda la capacidad (${pct(ratio)}). La relación cuota/ingreso llega a ${pct(dti)}; conviene un inicial mayor o un plazo más largo.`
      : verdict === 'fuera'
        ? `La cuota estimada supera la capacidad calculada en ${pct(ratio - 1)}. Para entrar haría falta financiar hasta ${Math.round(maxFinanceable).toLocaleString('es-DO')} o subir el inicial.`
        : 'Falta el monto o el precio del vehículo para estimar una cuota.'

  return {
    monthly, maxMonthly, maxFinanceable, dti, ratio, verdict, explanation,
    financed, months, apr: rate, income: inc, monthlyDebts: debts,
    // Restated in the payload so a UI cannot present this as a decision by
    // accident.
    advisory: true,
  }
}

export const CAPACITY_VERDICT = {
  dentro: { label: 'Dentro de capacidad', tone: 'green' },
  ajustado: { label: 'Ajustado', tone: 'amber' },
  fuera: { label: 'Fuera de capacidad', tone: 'red' },
}
