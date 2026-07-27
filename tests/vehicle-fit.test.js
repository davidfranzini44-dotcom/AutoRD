import { describe, it, expect } from 'vitest'
import { vehicleFit } from '../src/data/finance.js'

const CEILING = 1800000

describe('vehicleFit — no verdict without an approval', () => {
  // The caller shows a plain calculator instead. Returning fits:false here would
  // tell every logged-out browser their car "does not qualify", which is a lie.
  it('returns null when there is no approval to measure against', () => {
    expect(vehicleFit({ price: 1000000, approvedAmount: 0 })).toBeNull()
    expect(vehicleFit({ price: 1000000, approvedAmount: null })).toBeNull()
    expect(vehicleFit({ price: 1000000 })).toBeNull()
  })

  it('returns null for a car with no price', () => {
    expect(vehicleFit({ price: 0, approvedAmount: CEILING })).toBeNull()
  })

  it('does not throw on no arguments at all', () => {
    expect(vehicleFit()).toBeNull()
  })
})

describe('vehicleFit — the verdict', () => {
  it('fits when the financed amount is under the ceiling', () => {
    const f = vehicleFit({ price: 1500000, approvedAmount: CEILING })
    expect(f.fits).toBe(true)
    expect(f.financed).toBe(1200000) // 20% down assumed
    expect(f.extraDownNeeded).toBe(0)
  })

  it('does not fit when the financed amount exceeds the ceiling', () => {
    const f = vehicleFit({ price: 2600000, approvedAmount: CEILING })
    expect(f.fits).toBe(false)
    expect(f.financed).toBe(2080000)
    expect(f.extraDownNeeded).toBe(280000) // 2.6M - 1.8M = 800k needed, 520k assumed
  })

  it('fits exactly at the boundary', () => {
    // 20% down on 2.25M leaves exactly 1.8M to finance.
    const f = vehicleFit({ price: 2250000, approvedAmount: CEILING })
    expect(f.financed).toBe(CEILING)
    expect(f.fits).toBe(true)
    expect(f.extraDownNeeded).toBe(0)
  })

  it('honours an inicial the client actually chose over the assumed percentage', () => {
    const assumed = vehicleFit({ price: 2600000, approvedAmount: CEILING })
    const chosen = vehicleFit({ price: 2600000, approvedAmount: CEILING, down: 800000 })
    expect(assumed.fits).toBe(false)
    expect(chosen.fits).toBe(true)
    expect(chosen.down).toBe(800000)
  })

  it('treats a zero inicial as chosen, not as absent', () => {
    const f = vehicleFit({ price: 1500000, approvedAmount: CEILING, down: 0 })
    expect(f.down).toBe(0)
    expect(f.financed).toBe(1500000)
  })
})

describe('vehicleFit — the useful number', () => {
  // "Necesitas RD$X más de inicial" is actionable; "no califica" is a dead end.
  it('reports the total inicial that brings the car under the ceiling', () => {
    const f = vehicleFit({ price: 2600000, approvedAmount: CEILING })
    expect(f.minDown).toBe(800000)
  })

  it('needs no inicial at all when the price is already under the ceiling', () => {
    const f = vehicleFit({ price: 1200000, approvedAmount: CEILING })
    expect(f.minDown).toBe(0)
    expect(f.fits).toBe(true)
  })

  it('extraDownNeeded is what is missing beyond what they planned', () => {
    const f = vehicleFit({ price: 2600000, approvedAmount: CEILING, down: 500000 })
    expect(f.minDown).toBe(800000)
    expect(f.extraDownNeeded).toBe(300000)
  })
})

describe('vehicleFit — monthly is always achievable', () => {
  // Quoting a payment on more than the bank will lend advertises a deal that
  // does not exist.
  it('never quotes a payment on more than the ceiling', () => {
    const over = vehicleFit({ price: 5000000, approvedAmount: CEILING })
    const atCeiling = vehicleFit({ price: 2250000, approvedAmount: CEILING })
    expect(over.fits).toBe(false)
    expect(over.monthly).toBe(atCeiling.monthly)
  })

  it('scales the payment with the term', () => {
    const short = vehicleFit({ price: 1500000, approvedAmount: CEILING, termYears: 3 })
    const long = vehicleFit({ price: 1500000, approvedAmount: CEILING, termYears: 7 })
    expect(short.monthly).toBeGreaterThan(long.monthly)
    expect(short.months).toBe(36)
    expect(long.months).toBe(84)
  })

  it('handles a 0% rate without dividing by zero', () => {
    const f = vehicleFit({ price: 1200000, approvedAmount: CEILING, apr: 0, termYears: 5 })
    expect(f.monthly).toBe(Math.round(960000 / 60))
    expect(Number.isFinite(f.monthly)).toBe(true)
  })
})
