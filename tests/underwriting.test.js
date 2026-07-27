import { describe, it, expect } from 'vitest'
import { riskFlags, riskSummary, assessCapacity, CAPACITY_VERDICT } from '../src/data/underwriting.js'

// A clean application: verified, consented, income declared, sane amounts.
const clean = {
  kyc: 'aprobado', consent: true, cedulaLast4: '8251', phone: '18099698833',
  income: 90000, amount: 1200000, down: 300000, term: 5, apr: 9.5,
  vehiclePrice: 1500000, expired: false,
}
const keys = (f) => f.map((x) => x.key)

describe('riskFlags — silent when there is nothing to say', () => {
  it('raises nothing on a clean application', () => {
    expect(riskFlags(clean)).toEqual([])
    const s = riskSummary(riskFlags(clean))
    expect(s.clean).toBe(true)
    expect(s.label).toBe('Sin alertas importantes detectadas')
    expect(s.tone).toBe('green')
  })

  it('does not throw on an empty application', () => {
    expect(() => riskFlags()).not.toThrow()
    expect(() => riskFlags({}, {})).not.toThrow()
  })
})

describe('riskFlags — never invents a flag it cannot compute', () => {
  // These are the flags the brief asks for that need data the panel does not
  // receive. Silence is correct; a red flag on a real applicant can cost them a
  // car, so "unknown" must never render as "problem".
  it('stays silent on duplicates and history unless told', () => {
    expect(keys(riskFlags(clean))).not.toContain('duplicada')
    expect(keys(riskFlags(clean))).not.toContain('sin_historial')
  })

  it('raises them once the caller supplies the context', () => {
    expect(keys(riskFlags(clean, { duplicateCount: 3 }))).toContain('duplicada')
    expect(keys(riskFlags(clean, { hasHistory: false }))).toContain('sin_historial')
  })

  it('a single application is not a duplicate', () => {
    expect(keys(riskFlags(clean, { duplicateCount: 1 }))).not.toContain('duplicada')
  })

  // A present phone with unknown verification is not an unverified phone.
  it('separates "no phone" from "phone not verified"', () => {
    expect(keys(riskFlags({ ...clean, phone: null }))).toContain('telefono')
    expect(keys(riskFlags(clean))).not.toContain('telefono_no_verificado')
    expect(keys(riskFlags(clean, { phoneVerified: false }))).toContain('telefono_no_verificado')
  })

  it('does not call a missing vehicle price an inconsistency', () => {
    expect(keys(riskFlags({ ...clean, vehiclePrice: null }))).not.toContain('precio_inconsistente')
  })

  it('does not report missing documents when none were requested', () => {
    expect(keys(riskFlags(clean, { documents: [] }))).not.toContain('documentos')
    expect(keys(riskFlags(clean))).not.toContain('documentos')
  })
})

describe('riskFlags — raises what the record does say', () => {
  it('flags unverified identity as high', () => {
    const f = riskFlags({ ...clean, kyc: 'pendiente' })
    expect(keys(f)).toContain('identidad')
    expect(f.find((x) => x.key === 'identidad').level).toBe('alta')
  })

  it('flags a missing income', () => {
    expect(keys(riskFlags({ ...clean, income: null }))).toContain('ingreso_pendiente')
  })

  it('flags a payment above 40% of income', () => {
    // 1.2M over 5y at 9.5% is roughly 25k/month; against 40k income that is >40%.
    expect(keys(riskFlags({ ...clean, income: 40000 }))).toContain('ingreso_insuficiente')
    expect(keys(riskFlags({ ...clean, income: 200000 }))).not.toContain('ingreso_insuficiente')
  })

  it('flags a low inicial but accepts a healthy one', () => {
    expect(keys(riskFlags({ ...clean, down: 50000 }))).toContain('inicial_bajo')
    expect(keys(riskFlags(clean))).not.toContain('inicial_bajo')
  })

  it('flags financing more than the car is worth', () => {
    expect(keys(riskFlags({ ...clean, amount: 2000000 }))).toContain('precio_inconsistente')
  })

  it('flags outstanding documents', () => {
    const docs = [{ status: 'aceptado' }, { status: 'solicitado' }]
    const f = riskFlags(clean, { documents: docs })
    expect(keys(f)).toContain('documentos')
    expect(f.find((x) => x.key === 'documentos').detail).toContain('1 documento')
  })

  it('flags an expired approval', () => {
    expect(keys(riskFlags({ ...clean, expired: true }))).toContain('expirada')
  })
})

describe('riskSummary', () => {
  it('escalates tone with the worst flag present', () => {
    expect(riskSummary(riskFlags({ ...clean, down: 50000 })).tone).toBe('amber')
    expect(riskSummary(riskFlags({ ...clean, kyc: 'pendiente' })).tone).toBe('red')
  })

  // A number invites being treated as a decision the bank did not make.
  it('does not produce a numeric risk score', () => {
    const s = riskSummary(riskFlags({ ...clean, kyc: 'pendiente' }))
    expect(s).not.toHaveProperty('score')
    expect(typeof s.label).toBe('string')
  })
})

describe('assessCapacity', () => {
  const base = { income: 90000, monthlyDebts: 10000, vehiclePrice: 1500000, downAvailable: 300000, apr: 9.5, termYears: 5 }

  it('returns null without an income, rather than guessing', () => {
    expect(assessCapacity({ ...base, income: null })).toBeNull()
    expect(assessCapacity()).toBeNull()
  })

  it('subtracts existing debts from the payment ceiling', () => {
    const noDebt = assessCapacity({ ...base, monthlyDebts: 0 })
    const withDebt = assessCapacity(base)
    expect(withDebt.maxMonthly).toBeLessThan(noDebt.maxMonthly)
    expect(noDebt.maxMonthly).toBe(90000 * 0.4)
    expect(withDebt.maxMonthly).toBe(90000 * 0.4 - 10000)
  })

  it('counts existing debts in the DTI, not just the new payment', () => {
    const r = assessCapacity(base)
    expect(r.dti).toBeGreaterThan(r.monthly / r.income)
  })

  it('grades dentro / ajustado / fuera by how much capacity is used', () => {
    const roomy = assessCapacity({ ...base, income: 300000, monthlyDebts: 0 })
    const tight = assessCapacity({ ...base, income: 33000, monthlyDebts: 0 })
    expect(roomy.verdict).toBe('dentro')
    expect(tight.verdict).toBe('fuera')
    expect(Object.keys(CAPACITY_VERDICT)).toEqual(['dentro', 'ajustado', 'fuera'])
  })

  it('always explains itself in Spanish', () => {
    for (const inc of [300000, 60000, 25000]) {
      const r = assessCapacity({ ...base, income: inc })
      expect(r.explanation.length).toBeGreaterThan(20)
      expect(r.explanation).toMatch(/cuota|capacidad|monto/i)
    }
  })

  // It must never look like an approval.
  it('never returns an approve/reject decision', () => {
    const r = assessCapacity(base)
    expect(r.advisory).toBe(true)
    expect(r).not.toHaveProperty('approved')
    expect(r).not.toHaveProperty('decision')
    expect(['dentro', 'ajustado', 'fuera', null]).toContain(r.verdict)
  })

  it('falls back to price minus down when no amount was requested', () => {
    const r = assessCapacity({ ...base, requestedAmount: null })
    expect(r.financed).toBe(1500000 - 300000)
  })

  it('prefers an explicitly requested amount over the price', () => {
    const r = assessCapacity({ ...base, requestedAmount: 900000 })
    expect(r.financed).toBe(900000)
  })

  it('says what is missing when it cannot estimate a payment', () => {
    const r = assessCapacity({ income: 90000 })
    expect(r.monthly).toBeNull()
    expect(r.verdict).toBeNull()
    expect(r.explanation).toMatch(/falta/i)
  })

  it('handles debts that already exceed the ceiling without going negative', () => {
    const r = assessCapacity({ ...base, monthlyDebts: 999999 })
    expect(r.maxMonthly).toBe(0)
    expect(r.maxFinanceable).toBe(0)
    expect(r.verdict).toBeNull()
  })
})
