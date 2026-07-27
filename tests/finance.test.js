import { describe, it, expect } from 'vitest'
import { estimateMonthly, maxPrincipal, affordablePrice, fmtMoneyInput } from '../src/data/finance.js'

// These numbers are quoted to customers on the homepage calculator, the vehicle
// ficha and the client portal, so they need to be right and to agree with each
// other — a customer should never see one cuota here and another there.

describe('estimateMonthly', () => {
  it('matches a hand-computed amortisation', () => {
    // 1,000,000 at 12% over 12 months: i=0.01 -> 1e6*0.01/(1-1.01^-12) ≈ 88,848.79
    expect(Math.round(estimateMonthly(1_000_000, 12, 12))).toBe(88_849)
  })

  it('falls back to simple division at 0% interest', () => {
    expect(estimateMonthly(1_200_000, 0, 12)).toBeCloseTo(100_000, 5)
  })

  it('costs more per month over a shorter term', () => {
    const short = estimateMonthly(1_500_000, 10, 36)
    const long = estimateMonthly(1_500_000, 10, 84)
    expect(short).toBeGreaterThan(long)
  })

  it('costs more per month at a higher rate', () => {
    expect(estimateMonthly(1_500_000, 14, 60)).toBeGreaterThan(estimateMonthly(1_500_000, 9, 60))
  })

  it('is zero-safe', () => {
    expect(estimateMonthly(0, 10, 60)).toBe(0)
  })
})

describe('maxPrincipal is the inverse of estimateMonthly', () => {
  it('round-trips a budget back to roughly the same cuota', () => {
    const budget = 30_000
    const principal = maxPrincipal(budget, 9.5, 84)
    expect(Math.round(estimateMonthly(principal, 9.5, 84))).toBeCloseTo(budget, -1)
  })

  it('allows a bigger principal on a longer term', () => {
    expect(maxPrincipal(30_000, 9.5, 84)).toBeGreaterThan(maxPrincipal(30_000, 9.5, 48))
  })
})

describe('affordablePrice', () => {
  it('adds the down payment on top of what the income supports', () => {
    const withDown = affordablePrice({ income: 100_000, down: 500_000, apr: 10, months: 60 })
    const without = affordablePrice({ income: 100_000, down: 0, apr: 10, months: 60 })
    expect(withDown.price - without.price).toBe(500_000)
    expect(withDown.principal).toBe(without.principal) // the down payment is not financed
  })

  it('caps the monthly payment at the debt-to-income percentage', () => {
    const r = affordablePrice({ income: 100_000, apr: 10, months: 60, dtiPct: 30 })
    expect(r.maxMonthly).toBe(30_000)
  })

  it('scales with the debt-to-income ceiling', () => {
    const strict = affordablePrice({ income: 100_000, apr: 10, months: 60, dtiPct: 20 })
    const loose = affordablePrice({ income: 100_000, apr: 10, months: 60, dtiPct: 40 })
    expect(loose.price).toBeGreaterThan(strict.price)
  })

  it('is all zeros when there is no income — the down payment alone is not a budget', () => {
    expect(affordablePrice({ income: 0, down: 250_000, apr: 10, months: 60 }))
      .toEqual({ maxMonthly: 0, principal: 0, price: 0 })
  })

  it('agrees with estimateMonthly: the resulting price is actually affordable', () => {
    const r = affordablePrice({ income: 120_000, down: 300_000, apr: 9.5, months: 84 })
    expect(estimateMonthly(r.principal, 9.5, 84)).toBeLessThanOrEqual(r.maxMonthly + 1)
  })
})

describe('fmtMoneyInput — live comma formatting while typing', () => {
  it('groups thousands and prefixes RD$', () => {
    expect(fmtMoneyInput('1500000')).toBe('RD$ 1,500,000')
  })

  it('is idempotent — re-formatting its own output does not corrupt it', () => {
    expect(fmtMoneyInput(fmtMoneyInput('85000'))).toBe('RD$ 85,000')
  })

  it('returns empty for empty/garbage input', () => {
    expect(fmtMoneyInput('')).toBe('')
    expect(fmtMoneyInput('abc')).toBe('')
    expect(fmtMoneyInput(null)).toBe('')
    expect(fmtMoneyInput(undefined)).toBe('')
  })
})
