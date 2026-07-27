import { describe, it, expect, vi, afterEach } from 'vitest'
import { kycValidity, KYC_VALID_DAYS } from '../src/data/kyc.js'

// A verified identity is reusable for 12 months. This drives whether the
// financing wizard skips the identity step and what "Mi cuenta" shows, so an
// off-by-one here either forces needless re-verification or honours a stale one.
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString()

afterEach(() => vi.useRealTimers())

describe('kycValidity', () => {
  it('is unverified when there is no timestamp', () => {
    expect(kycValidity({})).toMatchObject({ verified: false, valid: false })
    expect(kycValidity(null)).toMatchObject({ verified: false, valid: false })
  })

  it('is unverified when the timestamp is garbage', () => {
    expect(kycValidity({ kyc_verified_at: 'not a date' })).toMatchObject({ verified: false, valid: false })
  })

  it('is valid right after verifying', () => {
    const r = kycValidity({ kyc_verified_at: new Date().toISOString() })
    expect(r.verified).toBe(true)
    expect(r.valid).toBe(true)
    expect(r.daysLeft).toBeGreaterThan(360)
  })

  it('is still valid one day before expiry', () => {
    const r = kycValidity({ kyc_verified_at: daysAgo(KYC_VALID_DAYS - 1) })
    expect(r.valid).toBe(true)
  })

  it('has expired well past the window — verified but not valid', () => {
    const r = kycValidity({ kyc_verified_at: daysAgo(KYC_VALID_DAYS + 5) })
    expect(r.verified).toBe(true)
    expect(r.valid).toBe(false)
  })

  it('reports an expiry exactly 365 days after verification', () => {
    const at = '2026-07-25T18:13:36.000Z'
    const r = kycValidity({ kyc_verified_at: at })
    const expected = new Date(Date.parse(at) + KYC_VALID_DAYS * 86_400_000)
    expect(r.expires.toISOString()).toBe(expected.toISOString())
  })
})
