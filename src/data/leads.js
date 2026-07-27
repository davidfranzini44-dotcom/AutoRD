// Merging the dealer's two lead sources.
//
// WhatsApp conversations were the only leads that existed; everyone else -
// including buyers a bank already pre-approved - was invisible. This joins them
// into one list, which means deciding what happens when the same person appears
// in both.

// relTime lives in api.js and is not exported; a pipeline-only lead would have
// thrown ReferenceError on first render. Local, and null-safe.
const agoText = (iso) => {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  const days = Math.round(hrs / 24)
  return days === 1 ? 'ayer' : `hace ${days} días`
}

const phoneKey = (p) => String(p || '').replace(/[^\d]/g, '').slice(-8)

// Merge WhatsApp conversations with pipeline buyers into one list.
//
// Dedup is by the last 8 digits of the phone: the same person messaging on
// WhatsApp AND holding a financing application must be one card, not two, and
// the WhatsApp row wins as the base because it carries the conversation id the
// inbox and updateLead() need. Their financing state is layered on top.
export function mergeLeadSources(waLeads = [], pipeline = []) {
  const out = (waLeads || []).map((l) => ({ ...l, conversationId: l.id }))
  const byPhone = new Map(out.map((l) => [phoneKey(l.phone), l]))

  for (const p of pipeline || []) {
    const key = phoneKey(p.phone)
    const existing = key ? byPhone.get(key) : null
    const fin = {
      buyerId: p.buyerId,
      approvedAmount: p.approvedAmount ?? null,
      approvalValidUntil: p.approvalValidUntil ?? null,
      needsDocs: !!p.needsDocs,
      inBank: !!p.inBank,
      applicationId: p.applicationId ?? null,
    }
    if (existing) { Object.assign(existing, fin); continue }
    out.push({
      id: `buyer-${p.buyerId}`,
      conversationId: null,
      customer: p.customer || 'Cliente',
      phone: p.phone,
      stage: p.dealerStage || 'nuevo',
      salesperson: p.salesperson || null,
      notes: p.nextAction || '',
      followUpAt: p.nextActionDate || null,
      unread: 0,
      last: agoText(p.lastActivity),
      lastAt: p.lastActivity || null,
      lastText: '',
      createdAt: p.lastActivity || null,
      today: false,
      hot: Number(p.approvedAmount) > 0,
      kycVerified: p.kyc === 'aprobado',
      kycAt: null,
      vehicle: p.vehicleId ? { id: p.vehicleId, name: p.vehicle || '', price: p.vehiclePrice, currency: 'DOP' } : null,
      ...fin,
    })
  }
  return out
}

