import { describe, it, expect } from 'vitest'
import { mergeLeadSources } from '../src/data/leads.js'

const wa = (over = {}) => ({
  id: 'conv-1', customer: 'Stiven', phone: '+1 809 969 8833',
  stage: 'contactado', salesperson: 'Ana', notes: 'llamó', unread: 2,
  last: 'hace 1 h', vehicle: null, ...over,
})
const pipe = (over = {}) => ({
  buyerId: 'buyer-1', customer: 'Stiven Cabrera', phone: '18099698833',
  dealerStage: 'nuevo', approvedAmount: 1800000, needsDocs: false, inBank: false,
  kyc: 'aprobado', lastActivity: new Date(Date.now() - 3600000).toISOString(),
  vehicleId: 'v1', vehicle: 'Toyota Corolla 2021', vehiclePrice: 1500000, ...over,
})

describe('mergeLeadSources — the buyers that used to be invisible', () => {
  it('adds a pipeline buyer who never messaged on WhatsApp', () => {
    const out = mergeLeadSources([], [pipe()])
    expect(out).toHaveLength(1)
    expect(out[0].customer).toBe('Stiven Cabrera')
    expect(out[0].approvedAmount).toBe(1800000)
    // no conversation, so the inbox/updateLead path must not be used for it
    expect(out[0].conversationId).toBeNull()
    expect(out[0].buyerId).toBe('buyer-1')
  })

  it('keeps WhatsApp leads when there is no pipeline at all', () => {
    const out = mergeLeadSources([wa()], [])
    expect(out).toHaveLength(1)
    expect(out[0].conversationId).toBe('conv-1')
  })

  it('handles both sources being empty', () => {
    expect(mergeLeadSources([], [])).toEqual([])
    expect(mergeLeadSources()).toEqual([])
  })
})

describe('mergeLeadSources — the same person in both sources', () => {
  // Two cards for one human is worse than missing them: a salesperson calls
  // twice and neither card shows the whole picture.
  it('produces one card, not two, despite different phone formatting', () => {
    const out = mergeLeadSources([wa()], [pipe()])
    expect(out).toHaveLength(1)
  })

  it('keeps the WhatsApp row as the base so the conversation id survives', () => {
    const out = mergeLeadSources([wa()], [pipe()])
    expect(out[0].conversationId).toBe('conv-1')
    expect(out[0].unread).toBe(2)
    expect(out[0].stage).toBe('contactado') // not overwritten by the pipeline default
  })

  it('layers the financing state onto it', () => {
    const out = mergeLeadSources([wa()], [pipe({ needsDocs: true, inBank: true })])
    expect(out[0].approvedAmount).toBe(1800000)
    expect(out[0].needsDocs).toBe(true)
    expect(out[0].inBank).toBe(true)
    expect(out[0].buyerId).toBe('buyer-1')
  })

  it('does not merge two genuinely different people', () => {
    const out = mergeLeadSources([wa()], [pipe({ phone: '18295551234', buyerId: 'buyer-2' })])
    expect(out).toHaveLength(2)
  })

  // A pipeline buyer with no phone cannot be matched to anyone; guessing would
  // merge unrelated people.
  it('does not merge on an empty phone', () => {
    const out = mergeLeadSources([wa({ phone: null })], [pipe({ phone: null })])
    expect(out).toHaveLength(2)
  })
})

describe('mergeLeadSources — shape the card can render', () => {
  it('marks an approved buyer as hot', () => {
    expect(mergeLeadSources([], [pipe()])[0].hot).toBe(true)
    expect(mergeLeadSources([], [pipe({ approvedAmount: null })])[0].hot).toBe(false)
  })

  it('carries KYC through', () => {
    expect(mergeLeadSources([], [pipe()])[0].kycVerified).toBe(true)
    expect(mergeLeadSources([], [pipe({ kyc: 'pendiente' })])[0].kycVerified).toBe(false)
  })

  it('renders a relative time without throwing on a missing date', () => {
    expect(mergeLeadSources([], [pipe({ lastActivity: null })])[0].last).toBe('—')
    expect(mergeLeadSources([], [pipe({ lastActivity: 'no-es-fecha' })])[0].last).toBe('—')
    expect(mergeLeadSources([], [pipe()])[0].last).toMatch(/hace/)
  })

  it('leaves vehicle null when the buyer has not picked one', () => {
    expect(mergeLeadSources([], [pipe({ vehicleId: null })])[0].vehicle).toBeNull()
  })

  it('gives every merged lead an id', () => {
    const out = mergeLeadSources([wa()], [pipe({ phone: '18295551234', buyerId: 'b2' })])
    for (const l of out) expect(l.id).toBeTruthy()
    expect(new Set(out.map((l) => l.id)).size).toBe(out.length)
  })
})
