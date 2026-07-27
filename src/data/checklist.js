// "Qué falta" — one list of everything still standing between the client and a
// decision, built from the three places that information actually lives:
//
//   * the client's profile   (email, dirección, ocupación, WhatsApp)
//   * the KYC verification   (cédula + selfie)
//   * the documents table    (whatever a bank asked for)
//
// Before this, a client had to infer "requiere información" from a bank note in
// one place and a document request in another, and the profile fields were not
// surfaced at all. Pure function on purpose: no Supabase import, so it is unit
// testable and the page stays a renderer.

import { formatAddress } from './provincias'
import { isPlaceholderEmail } from './contact'

// The four states the client sees. Anything a bank does to a document collapses
// into one of these — the client does not need the bank's internal vocabulary.
export const CHECK_STATE = {
  done: { label: 'Completado', tone: 'green' },
  review: { label: 'En revisión', tone: 'amber' },
  requested: { label: 'Solicitado por el banco', tone: 'blue' },
  pending: { label: 'Pendiente', tone: 'slate' },
}

// documents.status (DOC_STATUS in bankDemo) -> client-facing state.
// 'rechazado' deliberately maps to pending, not to a failure state: for the
// client the action is the same as never having sent it, and a red "rechazado"
// on their own screen reads as a rejected application, which it is not.
const DOC_STATE = {
  aceptado: 'done',
  recibido: 'review',
  revision: 'review',
  solicitado: 'requested',
  rechazado: 'pending',
}

// What a bank can ask a client for. Shared by the bank's request modal and the
// client's checklist so the two always name the same things.
export const REQUESTABLE_FIELDS = [
  { id: 'cedula', label: 'Cédula', checklistKey: 'identidad' },
  { id: 'kyc', label: 'Selfie / KYC', checklistKey: 'identidad' },
  { id: 'email', label: 'Email', checklistKey: 'email' },
  { id: 'direccion', label: 'Dirección', checklistKey: 'direccion' },
  { id: 'ocupacion', label: 'Ocupación', checklistKey: 'ocupacion' },
  { id: 'estado_civil', label: 'Estado civil', checklistKey: 'estado_civil' },
  { id: 'comprobante_ingresos', label: 'Comprobante de ingresos', doc: true },
  { id: 'info_laboral', label: 'Información laboral', doc: true },
  { id: 'referencias', label: 'Referencias', doc: true },
  { id: 'inicial_disponible', label: 'Inicial disponible', doc: true },
  { id: 'otro', label: 'Otro', doc: true },
]
const FIELD_BY_ID = Object.fromEntries(REQUESTABLE_FIELDS.map((f) => [f.id, f]))

const has = (v) => v != null && String(v).trim() !== ''

/**
 * @param {object}  input
 * @param {object}  input.profile      profiles row (full_name, email, phone, occupation, provincia, address_line, phone_verified_at)
 * @param {boolean} input.kycApproved  whether identity is verified and still valid
 * @param {Array}   input.documents    mapped rows from getApplicationDocuments()
 * @param {Array}   input.requestedFields  field ids from open financing_info_requests
 * @returns {Array} items: { key, label, sub, state, cta: { label, href } | null, fromBank: boolean }
 */
export function buildChecklist({ profile = null, kycApproved = false, documents = [], requestedFields = [] } = {}) {
  const items = []
  // Which checklist rows a bank has explicitly asked for. An item the bank
  // requested reads "Solicitado por el banco" rather than a generic "Pendiente":
  // the client needs to know someone is waiting on them, not just that a field
  // is blank.
  const asked = new Set(
    (requestedFields || []).map((id) => FIELD_BY_ID[id]?.checklistKey).filter(Boolean),
  )

  items.push({
    key: 'identidad',
    label: 'Identidad verificada',
    sub: kycApproved ? 'Cédula y selfie validadas' : 'Verifica tu cédula con una selfie',
    state: kycApproved ? 'done' : 'pending',
    cta: kycApproved ? null : { label: 'Verificar ahora', href: '/verificar' },
    fromBank: false,
  })

  const phoneOk = has(profile?.phone) && has(profile?.phone_verified_at)
  items.push({
    key: 'telefono',
    label: 'WhatsApp confirmado',
    sub: phoneOk ? 'Te escribimos por aquí' : 'Confirma tu número para recibir avisos',
    state: phoneOk ? 'done' : 'pending',
    cta: phoneOk ? null : { label: 'Confirmar', href: '/mi-cuenta' },
    fromBank: false,
  })

  const emailOk = !isPlaceholderEmail(profile?.email)
  items.push({
    key: 'email',
    label: 'Correo electrónico',
    sub: emailOk ? profile.email : 'Lo usamos para enviarte tu contrato',
    state: emailOk ? 'done' : 'pending',
    cta: emailOk ? null : { label: 'Completar ahora', href: '/mi-cuenta' },
    fromBank: false,
  })

  const address = formatAddress(profile?.address_line, profile?.provincia)
  items.push({
    key: 'direccion',
    label: 'Dirección',
    sub: address || 'Los bancos la piden para evaluar tu solicitud',
    state: address ? 'done' : 'pending',
    cta: address ? null : { label: 'Completar ahora', href: '/mi-cuenta' },
    fromBank: false,
  })

  const occupation = has(profile?.occupation) ? profile.occupation : null
  items.push({
    key: 'ocupacion',
    label: 'Ocupación',
    sub: occupation || 'A qué te dedicas',
    state: occupation ? 'done' : 'pending',
    cta: occupation ? null : { label: 'Completar ahora', href: '/mi-cuenta' },
    fromBank: false,
  })

  // A requested item that is still missing becomes 'requested'. One already
  // satisfied stays 'done' — the client should not be chased for something they
  // have already provided just because a request row is still open.
  for (const item of items) {
    if (asked.has(item.key) && item.state === 'pending') {
      item.state = 'requested'
      item.sub = `Tu banco pidió este dato. ${item.sub}`
    }
  }

  // Requested things with no natural row of their own (estado civil today).
  for (const id of requestedFields || []) {
    const f = FIELD_BY_ID[id]
    if (!f || f.doc || items.some((i) => i.key === f.checklistKey)) continue
    items.push({
      key: f.checklistKey, label: f.label,
      sub: 'Tu banco pidió este dato para continuar.',
      state: 'requested',
      cta: { label: 'Completar ahora', href: '/mi-cuenta' },
      fromBank: true,
    })
  }

  for (const d of documents) {
    const state = DOC_STATE[d?.status] || 'requested'
    const bank = d?.bankName ? ` · ${d.bankName}` : ''
    items.push({
      key: `doc-${d.id}`,
      label: d?.type || 'Documento',
      sub: d?.status === 'rechazado' && has(d?.notes)
        ? `Vuelve a enviarlo: ${d.notes}`
        : (has(d?.notes) ? d.notes : `Solicitado por tu banco${bank}`.trim()),
      state,
      cta: state === 'done' || state === 'review' ? null : { label: 'Subir documento', href: '#documentos' },
      fromBank: true,
    })
  }

  return items
}

// What the top card needs: how much is left, and whether the ball is with the
// client or with the bank. "review" is not outstanding — the client already did
// their part and chasing them again would be wrong.
export function checklistSummary(items = []) {
  const outstanding = items.filter((i) => i.state === 'pending' || i.state === 'requested')
  return {
    total: items.length,
    done: items.filter((i) => i.state === 'done').length,
    inReview: items.filter((i) => i.state === 'review').length,
    outstanding: outstanding.length,
    complete: outstanding.length === 0,
    // The single next thing to do, so the top card can name it instead of
    // saying "faltan 3 cosas" and making the client hunt.
    next: outstanding[0] || null,
  }
}
