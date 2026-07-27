import { describe, it, expect } from 'vitest'
import { buildChecklist, checklistSummary, CHECK_STATE, REQUESTABLE_FIELDS } from '../src/data/checklist.js'

const complete = {
  full_name: 'Stiven Cabrera',
  email: 'stiven@correo.com',
  phone: '18099698833',
  phone_verified_at: '2026-07-20T10:00:00Z',
  occupation: 'Ingeniero',
  provincia: 'Santiago',
  address_line: 'Calle Duarte 45',
}
const find = (items, key) => items.find((i) => i.key === key)

describe('buildChecklist — profile fields', () => {
  it('marks everything done for a complete profile with KYC', () => {
    const items = buildChecklist({ profile: complete, kycApproved: true })
    expect(items.every((i) => i.state === 'done')).toBe(true)
    expect(checklistSummary(items).complete).toBe(true)
    expect(checklistSummary(items).next).toBeNull()
  })

  it('treats an empty profile as pending, not done', () => {
    const items = buildChecklist({ profile: null, kycApproved: false })
    expect(items.every((i) => i.state === 'pending')).toBe(true)
    expect(checklistSummary(items).outstanding).toBe(items.length)
  })

  // The synthetic login address is not an inbox; counting it as a completed
  // email is exactly how a client ends up never receiving their contract.
  it('does not accept the placeholder wa<digits>@autord.local as an email', () => {
    const items = buildChecklist({ profile: { ...complete, email: 'wa18099698833@autord.local' } })
    expect(find(items, 'email').state).toBe('pending')
  })

  it('requires the phone to be verified, not merely present', () => {
    const items = buildChecklist({ profile: { ...complete, phone_verified_at: null } })
    expect(find(items, 'telefono').state).toBe('pending')
  })

  it('needs a street line, not just a provincia', () => {
    const onlyProvincia = buildChecklist({ profile: { ...complete, address_line: null } })
    expect(find(onlyProvincia, 'direccion').state).toBe('done') // provincia alone still locates them
    const neither = buildChecklist({ profile: { ...complete, address_line: null, provincia: null } })
    expect(find(neither, 'direccion').state).toBe('pending')
  })

  it('ignores whitespace-only values', () => {
    const items = buildChecklist({ profile: { ...complete, occupation: '   ' } })
    expect(find(items, 'ocupacion').state).toBe('pending')
  })
})

describe('buildChecklist — bank documents', () => {
  const docs = [
    { id: 'd1', type: 'Comprobante de ingresos', status: 'solicitado', bankName: 'BHD' },
    { id: 'd2', type: 'Carta de trabajo', status: 'recibido' },
    { id: 'd3', type: 'Estados de cuenta', status: 'aceptado' },
  ]

  it('maps bank statuses onto the four client-facing states', () => {
    const items = buildChecklist({ profile: complete, kycApproved: true, documents: docs })
    expect(find(items, 'doc-d1').state).toBe('requested')
    expect(find(items, 'doc-d2').state).toBe('review')
    expect(find(items, 'doc-d3').state).toBe('done')
    expect(items.filter((i) => i.fromBank)).toHaveLength(3)
  })

  // A red "rechazado" on the client's own screen reads as a rejected
  // application. For them the action is identical to never having sent it.
  it('shows a rejected document as pending with the reason, not as a failure', () => {
    const items = buildChecklist({
      documents: [{ id: 'x', type: 'Carta de trabajo', status: 'rechazado', notes: 'ilegible' }],
    })
    const item = find(items, 'doc-x')
    expect(item.state).toBe('pending')
    expect(item.sub).toContain('ilegible')
    expect(Object.keys(CHECK_STATE)).not.toContain('rechazado')
  })

  it('falls back to "requested" for an unknown status rather than dropping the row', () => {
    const items = buildChecklist({ documents: [{ id: 'z', type: 'Otro', status: 'algo_nuevo' }] })
    expect(find(items, 'doc-z').state).toBe('requested')
  })

  it('gives every outstanding item an action, and completed ones none', () => {
    const items = buildChecklist({ profile: null, documents: docs })
    for (const i of items) {
      if (i.state === 'pending' || i.state === 'requested') expect(i.cta).toBeTruthy()
      else expect(i.cta).toBeNull()
    }
  })
})

describe('checklistSummary', () => {
  it('does not count items already in review as outstanding', () => {
    const items = buildChecklist({
      profile: complete, kycApproved: true,
      documents: [{ id: 'd', type: 'Carta', status: 'recibido' }],
    })
    const s = checklistSummary(items)
    expect(s.inReview).toBe(1)
    expect(s.outstanding).toBe(0)
    expect(s.complete).toBe(true)
  })

  it('names the single next action instead of only a count', () => {
    const items = buildChecklist({ profile: { ...complete, email: null }, kycApproved: true })
    const s = checklistSummary(items)
    expect(s.outstanding).toBe(1)
    expect(s.next.key).toBe('email')
    expect(s.next.cta.href).toBe('/mi-cuenta')
  })

  it('is safe on empty input', () => {
    expect(checklistSummary().outstanding).toBe(0)
    expect(checklistSummary([]).complete).toBe(true)
  })
})

describe('bank info requests reaching the client checklist', () => {
  const empty = { phone: '1809', phone_verified_at: null }

  it('turns a missing requested field into "solicitado por el banco"', () => {
    const items = buildChecklist({ profile: empty, requestedFields: ['email'] })
    expect(find(items, 'email').state).toBe('requested')
    expect(find(items, 'email').sub).toMatch(/banco/i)
    expect(CHECK_STATE.requested.label).toBe('Solicitado por el banco')
  })

  // Chasing someone for what they already gave you is how a request loop turns
  // into noise the client learns to ignore.
  it('leaves an already-satisfied field alone even with an open request', () => {
    const items = buildChecklist({ profile: complete, requestedFields: ['email', 'ocupacion'] })
    expect(find(items, 'email').state).toBe('done')
    expect(find(items, 'ocupacion').state).toBe('done')
  })

  it('maps cédula and selfie onto the single identity row', () => {
    const items = buildChecklist({ profile: empty, kycApproved: false, requestedFields: ['cedula', 'kyc'] })
    expect(find(items, 'identidad').state).toBe('requested')
    expect(items.filter((i) => i.key === 'identidad')).toHaveLength(1)
  })

  it('adds a row for a requested field that has none of its own', () => {
    const items = buildChecklist({ profile: complete, kycApproved: true, requestedFields: ['estado_civil'] })
    const item = find(items, 'estado_civil')
    expect(item).toBeTruthy()
    expect(item.state).toBe('requested')
    expect(item.fromBank).toBe(true)
  })

  // Document-type requests already arrive as `documents` rows; adding them here
  // as well would show the client the same ask twice.
  it('does not duplicate document-type requests', () => {
    const items = buildChecklist({
      profile: complete, kycApproved: true,
      requestedFields: ['comprobante_ingresos'],
      documents: [{ id: 'd1', type: 'Comprobante de ingresos', status: 'solicitado' }],
    })
    expect(items.filter((i) => /Comprobante/i.test(i.label))).toHaveLength(1)
  })

  it('counts requested items as outstanding work', () => {
    const s = checklistSummary(buildChecklist({ profile: empty, requestedFields: ['email'] }))
    expect(s.outstanding).toBeGreaterThan(0)
    expect(s.complete).toBe(false)
  })

  it('ignores unknown field ids instead of inventing rows', () => {
    const before = buildChecklist({ profile: complete, kycApproved: true }).length
    const after = buildChecklist({ profile: complete, kycApproved: true, requestedFields: ['no_existe'] }).length
    expect(after).toBe(before)
  })

  it('every requestable field is either a checklist key or a document', () => {
    for (const f of REQUESTABLE_FIELDS) {
      expect(Boolean(f.checklistKey) || Boolean(f.doc), f.id).toBe(true)
    }
  })
})
