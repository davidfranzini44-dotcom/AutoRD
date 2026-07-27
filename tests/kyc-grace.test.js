import { describe, it, expect } from 'vitest'
import {
  expiredCedulaOnly, collectWarnings, checkPassed, documentExpired,
  extractCedulaLast4, cedulaGraceActive, CEDULA_GRACE_UNTIL_MS,
} from '../supabase/functions/didit-webhook/kyc-grace.ts'

// ---------------------------------------------------------------------------
// Fixtures are the REAL Didit payloads from two production incidents on
// 2026-07-25, reduced to the fields the logic reads.
// ---------------------------------------------------------------------------

// INCIDENT 1 — a real applicant was DECLINED. Liveness and face match had both
// passed and the only error was the expired cédula, but two advisory notes
// (log_type 'information') were treated as blocking, cancelling the grace.
const declinedWithAdvisoryNotes = {
  id_verification: {
    status: 'Declined',
    document_number: '40233618251',
    date_of_expiration: '2024-09-18',
    warnings: [
      { risk: 'UNPARSED_ADDRESS', log_type: 'information' },
      { risk: 'POSSIBLE_DUPLICATED_USER', log_type: 'information' },
      { risk: 'DOCUMENT_EXPIRED', log_type: 'error' },
    ],
  },
  liveness_checks: [{ status: 'Approved', method: 'PASSIVE', score: 93.94 }],
  face_matches: [{ status: 'Approved', score: 98.33 }],
}

// INCIDENT 2 — the same session EARLIER, while still "In Progress": the document
// step had finished but liveness/face match had not run yet. The fix at the time
// treated absent checks as passed and graced it prematurely.
const inProgressNoBiometricsYet = {
  id_verification: {
    status: 'Declined',
    document_number: '40233618251',
    warnings: [
      { risk: 'UNPARSED_ADDRESS', log_type: 'information' },
      { risk: 'DOCUMENT_EXPIRED', log_type: 'error' },
    ],
  },
  liveness_checks: null,
  face_matches: null,
}

const clone = (o) => JSON.parse(JSON.stringify(o))

describe('expiredCedulaOnly — the two production incidents', () => {
  it('grants the grace for the applicant who was wrongly declined', () => {
    expect(expiredCedulaOnly(declinedWithAdvisoryNotes)).toBe(true)
  })

  it('refuses a session whose liveness has not run yet', () => {
    expect(expiredCedulaOnly(inProgressNoBiometricsYet)).toBe(false)
  })
})

describe('expiredCedulaOnly — advisory notes must not block', () => {
  it('ignores information-severity warnings', () => {
    const d = clone(declinedWithAdvisoryNotes)
    d.id_verification.warnings.push({ risk: 'SOMETHING_CHATTY', log_type: 'information' })
    expect(expiredCedulaOnly(d)).toBe(true)
  })

  it('treats a warning with no severity as blocking (fail closed)', () => {
    const d = clone(declinedWithAdvisoryNotes)
    d.id_verification.warnings.push({ risk: 'MYSTERY_RISK' }) // no log_type
    expect(expiredCedulaOnly(d)).toBe(false)
  })

  it('treats a bare string warning as blocking', () => {
    const d = clone(declinedWithAdvisoryNotes)
    d.id_verification.warnings.push('SOME_RAW_RISK')
    expect(expiredCedulaOnly(d)).toBe(false)
  })
})

describe('expiredCedulaOnly — fraud signals still refuse', () => {
  it('refuses a tampered document', () => {
    const d = clone(declinedWithAdvisoryNotes)
    d.id_verification.warnings.push({ risk: 'DOCUMENT_TAMPERED', log_type: 'error' })
    expect(expiredCedulaOnly(d)).toBe(false)
  })

  it('refuses a failed face match', () => {
    const d = clone(declinedWithAdvisoryNotes)
    d.face_matches = [{ status: 'Declined', score: 12 }]
    expect(expiredCedulaOnly(d)).toBe(false)
  })

  it('refuses failed liveness', () => {
    const d = clone(declinedWithAdvisoryNotes)
    d.liveness_checks = [{ status: 'Declined' }]
    expect(expiredCedulaOnly(d)).toBe(false)
  })

  it('refuses when nothing flags an expiry at all', () => {
    const d = clone(declinedWithAdvisoryNotes)
    d.id_verification.warnings = [{ risk: 'UNPARSED_ADDRESS', log_type: 'information' }]
    delete d.id_verification.date_of_expiration
    expect(expiredCedulaOnly(d)).toBe(false)
  })

  it('refuses a null/absent decision', () => {
    expect(expiredCedulaOnly(null)).toBe(false)
    expect(expiredCedulaOnly(undefined)).toBe(false)
  })
})

describe('expiredCedulaOnly — payload shape tolerance', () => {
  it('handles the singular id_verification shape', () => {
    expect(expiredCedulaOnly(declinedWithAdvisoryNotes)).toBe(true)
  })

  it('handles the plural id_verifications array shape', () => {
    const d = {
      id_verifications: [clone(declinedWithAdvisoryNotes).id_verification],
      liveness_checks: [{ status: 'Approved' }],
      face_matches: [{ status: 'Approved' }],
    }
    expect(expiredCedulaOnly(d)).toBe(true)
  })

  it('handles singular liveness/face_match objects', () => {
    const d = clone(declinedWithAdvisoryNotes)
    delete d.liveness_checks
    delete d.face_matches
    d.liveness = { status: 'Approved' }
    d.face_match = { status: 'Approved' }
    expect(expiredCedulaOnly(d)).toBe(true)
  })

  it('still grants when face match was never part of the workflow', () => {
    const d = clone(declinedWithAdvisoryNotes)
    d.face_matches = null // workflow without FACE_MATCH
    expect(expiredCedulaOnly(d)).toBe(true)
  })
})

describe('the grace has an end date', () => {
  it('is active before 2027-01-01', () => {
    expect(cedulaGraceActive(Date.UTC(2026, 11, 31))).toBe(true)
  })

  it('is over on 2027-01-01', () => {
    expect(cedulaGraceActive(CEDULA_GRACE_UNTIL_MS)).toBe(false)
    expect(cedulaGraceActive(Date.UTC(2027, 0, 2))).toBe(false)
  })
})

describe('collectWarnings', () => {
  it('marks information severity as non-blocking and error as blocking', () => {
    const w = collectWarnings(declinedWithAdvisoryNotes)
    expect(w.find((x) => x.text === 'unparsed_address').blocking).toBe(false)
    expect(w.find((x) => x.text === 'document_expired').blocking).toBe(true)
  })

  it('returns an empty list when there are no warnings', () => {
    expect(collectWarnings({})).toEqual([])
  })
})

describe('checkPassed', () => {
  it('passes Approved and fails Declined', () => {
    expect(checkPassed({ status: 'Approved' })).toBe(true)
    expect(checkPassed({ status: 'Declined' })).toBe(false)
  })

  it('does NOT pass an in-progress status', () => {
    expect(checkPassed({ status: 'Not Started' })).toBe(false)
  })
})

describe('documentExpired', () => {
  const now = Date.UTC(2026, 6, 25)
  it('is true for a past printed expiry', () => {
    expect(documentExpired({ id_verification: { date_of_expiration: '2024-09-18' } }, now)).toBe(true)
  })
  it('is false for a future expiry, and when absent or unparseable', () => {
    expect(documentExpired({ id_verification: { date_of_expiration: '2030-01-01' } }, now)).toBe(false)
    expect(documentExpired({ id_verification: {} }, now)).toBe(false)
    expect(documentExpired({ id_verification: { date_of_expiration: 'no idea' } }, now)).toBe(false)
  })
})

describe('extractCedulaLast4 — feeds the client-portal identity gate', () => {
  it('takes the last 4 digits of the real cédula', () => {
    expect(extractCedulaLast4(declinedWithAdvisoryNotes)).toBe('8251')
  })

  it('strips non-digits before slicing', () => {
    expect(extractCedulaLast4({ id_verification: { document_number: '402-3361825-1' } })).toBe('8251')
  })

  it('returns null when there is no usable number', () => {
    expect(extractCedulaLast4({})).toBe(null)
    expect(extractCedulaLast4({ id_verification: { document_number: '12' } })).toBe(null)
  })
})
