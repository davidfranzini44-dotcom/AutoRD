// The single status a client sees for their financing case, resolved from the
// bank responses plus whatever is still outstanding on their side.
//
// A case can hold several bank responses at once — one bank pre-approves, a
// second asks for documents, a third declines — so "the status" is a precedence
// decision, not a field. That decision lives here, once, as a pure function,
// rather than being re-derived by each surface that renders it.
//
// Expirado is deliberately NOT a stored status. It is derived from valid_until
// at read time: storing it means a row can say "Aprobado" while the date says
// otherwise, and then there are two answers to "can this client still act?".

import { estimateMonthly } from './finance'

// Tones map onto the existing TONE palette in bankDemo.
export const FINANCING_STATUS = {
  aprobado:      { label: 'Aprobado', tone: 'green' },
  preaprobado:   { label: 'Pre-aprobado', tone: 'blue' },
  requiere_info: { label: 'Requiere información', tone: 'amber' },
  en_revision:   { label: 'En revisión', tone: 'slate' },
  expirado:      { label: 'Expirado', tone: 'red' },
  rechazado:     { label: 'Rechazado', tone: 'red' },
}

// Bank statuses that represent a real commitment (mirrors ACTIVE_APPROVAL in
// api.js getMyFinancing, which must agree with express_preapproval_interest()).
const ACTIVE_APPROVAL = ['preaprobada', 'oferta', 'condicional']

const fmt = (n) => `RD$ ${Math.round(n).toLocaleString('es-DO')}`

const isApproval = (r) => ACTIVE_APPROVAL.includes(r?.rawStatus) && Number(r?.approvedAmount) > 0

/**
 * @param {object}  c                       the case from getMyFinancing()
 * @param {number}  outstanding             count from checklistSummary().outstanding
 * @returns {{key,label,tone,headline,sub,cta,amount,monthly,apr,term,validUntil,bankName}}
 */
export function resolveFinancingStatus(c = {}, outstanding = 0) {
  const responses = Array.isArray(c.responses) ? c.responses : []
  const live = responses.filter((r) => isApproval(r) && !r.expired)
  const lapsed = responses.filter((r) => isApproval(r) && r.expired)

  // Best live offer = highest ceiling; that is the one the client can act on.
  const best = live.slice().sort((a, b) => (b.approvedAmount || 0) - (a.approvedAmount || 0))[0] || null
  const lastLapsed = lapsed.slice().sort((a, b) => (b.approvedAmount || 0) - (a.approvedAmount || 0))[0] || null

  const detail = (r) => ({
    amount: r ? Number(r.approvedAmount) || null : null,
    apr: r?.apr ?? null,
    term: r?.term ?? null,
    validUntil: r?.validUntil ?? null,
    bankName: r?.bankName ?? null,
    // Prefer the bank's own figure; it is authoritative and may include charges
    // our formula does not model. Only estimate when they left it blank.
    monthly: r?.monthly != null ? Number(r.monthly)
      : (r?.approvedAmount && r?.apr != null && r?.term
        ? estimateMonthly(Number(r.approvedAmount), Number(r.apr), Number(r.term) * 12)
        : null),
  })

  // 1. A live approval outranks everything: it is the outcome the client wanted,
  //    even if another bank is still asking for paperwork.
  if (best) {
    // "Aprobado" means it is attached to an actual car. A ceiling with no
    // vehicle is a pre-approval however the bank labelled it.
    if (c.vehicle) {
      return {
        key: 'aprobado', ...FINANCING_STATUS.aprobado, ...detail(best),
        headline: `Aprobado con ${best.bankName || 'tu banco'}`,
        sub: 'Coordina la entrega con el dealer. Revisa las condiciones antes de firmar.',
        cta: { label: 'Ver condiciones y próximos pasos', href: '#ofertas' },
      }
    }
    const d = detail(best)
    return {
      key: 'preaprobado', ...FINANCING_STATUS.preaprobado, ...d,
      headline: `Estás pre-aprobado hasta ${d.amount ? fmt(d.amount) : 'tu monto'}`,
      sub: 'Elige un vehículo dentro de tu presupuesto y lo vinculamos sin repetir tu verificación.',
      cta: { label: 'Ver carros que puedes financiar', href: `/buscar?precioMax=${d.amount || ''}` },
    }
  }

  // 2. Had an approval, and the date passed. Derived, never stored.
  if (lastLapsed) {
    return {
      key: 'expirado', ...FINANCING_STATUS.expirado, ...detail(lastLapsed),
      headline: 'Tu aprobación venció',
      sub: 'Las condiciones tenían fecha límite. Puedes actualizar tu solicitud y los bancos responden con su oferta vigente.',
      cta: { label: 'Actualizar solicitud', href: '/financiamiento' },
    }
  }

  // 3. Rejected only when every bank said no — one decline while another is
  //    still evaluating is not a rejected case.
  const decided = responses.filter((r) => r.status !== 'pending')
  if (responses.length > 0 && decided.length === responses.length
      && responses.every((r) => r.status === 'rejected')) {
    return {
      key: 'rechazado', ...FINANCING_STATUS.rechazado, ...detail(null),
      headline: 'Por ahora los bancos no aprobaron esta solicitud',
      sub: 'Esto puede cambiar: con un inicial mayor, un vehículo de menor precio o comprobantes de ingresos actualizados, puedes volver a intentarlo.',
      cta: { label: 'Intentar de nuevo', href: '/financiamiento' },
    }
  }

  // 4. The ball is in the client's court — that is what separates this from
  //    "en revisión", where they have already done everything they can.
  if (outstanding > 0) {
    return {
      key: 'requiere_info', ...FINANCING_STATUS.requiere_info, ...detail(null),
      headline: 'Falta información para continuar',
      sub: 'Los bancos no pueden avanzar hasta que completes lo pendiente.',
      cta: { label: 'Completar ahora', href: '#que-falta' },
    }
  }

  // 5. Everything submitted, waiting on the banks.
  return {
    key: 'en_revision', ...FINANCING_STATUS.en_revision, ...detail(null),
    headline: 'Tu solicitud está en revisión',
    sub: 'Ya enviaste todo. Los bancos suelen responder en 1 a 3 días laborables y te avisamos por WhatsApp.',
    cta: null,
  }
}
