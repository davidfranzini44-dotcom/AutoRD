import { describe, it, expect } from 'vitest'
import { toDop, financedAmountDop, priceDisplay, isValidRate } from './fx'

const RATE = 61.5

describe('isValidRate', () => {
  it('rejects what would silently corrupt a loan amount', () => {
    for (const bad of [null, undefined, '', 'abc', 0, -61.5, NaN, Infinity, 1, 5000]) {
      expect(isValidRate(bad)).toBe(false)
    }
  })
  it('accepts a realistic DOP rate as number or numeric string', () => {
    expect(isValidRate(61.5)).toBe(true)
    expect(isValidRate('61.5')).toBe(true)
  })
})

describe('toDop', () => {
  it('leaves DOP prices untouched', () => {
    expect(toDop(2750000, 'DOP', RATE)).toBe(2750000)
    // No rate needed for a peso car, so a missing one must not break it.
    expect(toDop(2750000, 'DOP', null)).toBe(2750000)
  })

  it('converts USD at the given rate', () => {
    expect(toDop(96000, 'USD', RATE)).toBe(5904000)
  })

  it('returns null rather than the unconverted number when the rate is missing', () => {
    // This is the whole point: 96000 must never reach a bank as RD$96,000.
    expect(toDop(96000, 'USD', null)).toBeNull()
    expect(toDop(96000, 'USD', 0)).toBeNull()
    expect(toDop(96000, 'USD', 'abc')).toBeNull()
  })

  it('returns null for a non-numeric price', () => {
    expect(toDop(undefined, 'USD', RATE)).toBeNull()
    expect(toDop('', 'DOP', RATE)).toBeNull()
  })
})

describe('financedAmountDop', () => {
  it('subtracts a peso down payment from the converted price', () => {
    expect(financedAmountDop({ price: 96000, currency: 'USD', downDop: 900000, rate: RATE }))
      .toBe(5004000)
  })

  it('never goes negative when the down payment exceeds the price', () => {
    expect(financedAmountDop({ price: 4200, currency: 'USD', downDop: 500000, rate: RATE }))
      .toBe(0)
  })

  it('treats a missing down payment as zero', () => {
    expect(financedAmountDop({ price: 96000, currency: 'USD', rate: RATE })).toBe(5904000)
  })

  it('refuses to produce an amount for USD without a rate', () => {
    expect(financedAmountDop({ price: 96000, currency: 'USD', downDop: 900000, rate: null }))
      .toBeNull()
  })
})

describe('priceDisplay', () => {
  const fmt = (v) => `RD$ ${v.toLocaleString('en-US')}`

  it('shows no conversion line for a peso car', () => {
    const d = priceDisplay({ price: 2750000, currency: 'DOP', rate: RATE }, fmt)
    expect(d.secondary).toBeNull()
    expect(d.dop).toBe(2750000)
  })

  it('shows the USD original with a peso equivalent', () => {
    const d = priceDisplay({ price: 96000, currency: 'USD', rate: RATE }, fmt)
    expect(d.primary).toBe('US$ 96,000')
    expect(d.secondary).toBe('RD$ 5,904,000'.replace('RD$', '≈ RD$'))
    expect(d.dop).toBe(5904000)
  })

  it('says the rate is missing instead of showing a peso figure', () => {
    const d = priceDisplay({ price: 96000, currency: 'USD', rate: null }, fmt)
    expect(d.primary).toBe('US$ 96,000')
    expect(d.secondary).toBe('Tasa USD no configurada')
    expect(d.dop).toBeNull()
  })
})
