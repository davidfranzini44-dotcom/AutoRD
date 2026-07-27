import { describe, it, expect } from 'vitest'
import {
  leadReadiness, readinessRank, matchVehicles, READINESS, MATCH, NO_FINANCING_MSG,
} from '../src/data/leadScoring.js'

const ago = (days) => new Date(Date.now() - days * 86_400_000).toISOString()
const lead = (over = {}) => ({
  customer: 'Stiven', phone: '18099698833', kycVerified: false,
  approvedAmount: null, needsDocs: false, inBank: false,
  vehicle: null, lastAt: ago(1), ...over,
})
const car = (price, extra = {}) => ({ id: `v${price}`, price, make: 'Toyota', model: 'Corolla', year: 2021, ...extra })

describe('leadReadiness — precedence', () => {
  it('is listo when approved and a car is picked', () => {
    expect(leadReadiness(lead({ approvedAmount: 1800000, vehicle: { name: 'Corolla' } })).key).toBe('listo')
  })

  it('is preaprobado when approved with no car yet', () => {
    expect(leadReadiness(lead({ approvedAmount: 1800000 })).key).toBe('preaprobado')
  })

  it('puts missing documents ahead of bank review', () => {
    expect(leadReadiness(lead({ needsDocs: true, inBank: true })).key).toBe('faltan_docs')
  })

  it('falls through KYC, interest, then browsing', () => {
    expect(leadReadiness(lead({ kycVerified: true })).key).toBe('precalificado')
    expect(leadReadiness(lead({ vehicle: { name: 'x' } })).key).toBe('interesado')
    expect(leadReadiness(lead()).key).toBe('navegando')
  })
})

describe('leadReadiness — going cold', () => {
  it('marks a long-silent browser as frío', () => {
    expect(leadReadiness(lead({ lastAt: ago(30) })).key).toBe('frio')
  })

  // Calling a pre-approved buyer "Frío" tells a dealer to stop chasing the one
  // person most likely to buy.
  it('never calls an approved lead cold, however long the silence', () => {
    const l = leadReadiness(lead({ approvedAmount: 1800000, lastAt: ago(90) }))
    expect(l.key).toBe('preaprobado')
    expect(l.reasons.join(' ')).toMatch(/sin seguimiento/)
  })

  it('does not cool a lead the bank is actively working', () => {
    expect(leadReadiness(lead({ inBank: true, lastAt: ago(60) })).key).toBe('en_banco')
  })

  it('handles a missing or unparseable date without throwing', () => {
    expect(leadReadiness(lead({ lastAt: null })).stale).toBeNull()
    expect(leadReadiness(lead({ lastAt: 'no-es-fecha' })).stale).toBeNull()
    expect(leadReadiness({}).key).toBe('navegando')
  })
})

describe('leadReadiness — reasons a dealer can act on', () => {
  it('explains missing documents in plain Spanish', () => {
    expect(leadReadiness(lead({ needsDocs: true })).reasons).toContain('Le faltan documentos')
  })

  it('warns when an approval is about to lapse', () => {
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    const r = leadReadiness(lead({ approvedAmount: 1800000, approvalValidUntil: soon }))
    expect(r.reasons.join(' ')).toMatch(/vence en 3 días/)
  })

  it('says so when the approval already lapsed', () => {
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10)
    expect(leadReadiness(lead({ approvedAmount: 1800000, approvalValidUntil: past })).reasons)
      .toContain('Su aprobación venció')
  })

  it('flags a lead with no phone, since nobody can call them', () => {
    expect(leadReadiness(lead({ phone: null })).reasons).toContain('Sin teléfono registrado')
  })

  // Risk lives in bank-private flags a dealer cannot see. Showing it would mean
  // leaking or inventing it.
  it('has no "Riesgo alto" badge at all', () => {
    expect(Object.keys(READINESS)).not.toContain('riesgo_alto')
    for (const key of Object.keys(READINESS)) expect(READINESS[key].label).not.toMatch(/riesgo/i)
  })
})

describe('readinessRank', () => {
  it('sorts the buyers worth calling first', () => {
    const leads = [lead(), lead({ inBank: true }), lead({ approvedAmount: 1800000, vehicle: {} }), lead({ needsDocs: true })]
    const sorted = [...leads].sort((a, b) => readinessRank(a) - readinessRank(b))
    expect(leadReadiness(sorted[0]).key).toBe('listo')
    expect(leadReadiness(sorted[sorted.length - 1]).key).toBe('navegando')
  })
})

describe('matchVehicles', () => {
  const stock = [car(900000), car(1400000), car(2000000), car(4000000)]

  it('asks for pre-qualification instead of guessing when there is no approval', () => {
    const r = matchVehicles(lead(), stock)
    expect(r.matches).toEqual([])
    expect(r.message).toBe(NO_FINANCING_MSG)
  })

  it('ranks comfortable cars above tight ones', () => {
    const r = matchVehicles(lead({ approvedAmount: 1800000 }), stock)
    expect(r.message).toBeNull()
    expect(r.matches[0].key).toBe('excelente')
    const order = r.matches.map((m) => m.key)
    expect(order).toEqual([...order].sort((a, b) => ['excelente','dentro','ajustado','fuera'].indexOf(a) - ['excelente','dentro','ajustado','fuera'].indexOf(b)))
  })

  // A car needing a slightly bigger inicial is a conversation; one far past the
  // ceiling is not a recommendation.
  it('separates "needs more inicial" from "out of reach"', () => {
    const r = matchVehicles(lead({ approvedAmount: 1800000 }), stock)
    const reasons = r.matches.map((m) => m.reason)
    expect(reasons.every((x) => typeof x === 'string' && x.length > 5)).toBe(true)
    expect(r.matches.some((m) => m.key === 'fuera')).toBe(false) // hidden while better options exist
  })

  it('falls back to showing out-of-reach cars only when nothing else fits', () => {
    const r = matchVehicles(lead({ approvedAmount: 100000 }), [car(4000000)])
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].key).toBe('fuera')
    expect(r.matches[0].reason).toBe('Sobrepasa aprobación')
  })

  it('ignores stock with no price rather than ranking it as free', () => {
    const r = matchVehicles(lead({ approvedAmount: 1800000 }), [car(0), car(1200000), { id: 'x' }])
    expect(r.matches.every((m) => m.vehicle.price > 0)).toBe(true)
  })

  it('says so when the dealer has no priced stock', () => {
    const r = matchVehicles(lead({ approvedAmount: 1800000 }), [])
    expect(r.matches).toEqual([])
    expect(r.message).toMatch(/inventario/i)
  })

  it('respects the limit and carries a payment for each match', () => {
    const many = Array.from({ length: 20 }, (_, i) => car(800000 + i * 20000))
    const r = matchVehicles(lead({ approvedAmount: 1800000 }), many, { limit: 4 })
    expect(r.matches).toHaveLength(4)
    for (const m of r.matches) {
      expect(m.fit.monthly).toBeGreaterThan(0)
      expect(MATCH[m.key]).toBeTruthy()
    }
  })

  it('does not throw on missing arguments', () => {
    expect(() => matchVehicles()).not.toThrow()
    expect(matchVehicles().matches).toEqual([])
  })
})
