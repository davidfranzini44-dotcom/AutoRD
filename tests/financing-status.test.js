import { describe, it, expect } from 'vitest'
import { resolveFinancingStatus, FINANCING_STATUS } from '../src/data/financingStatus.js'

const approval = (over = {}) => ({
  bankName: 'BHD', rawStatus: 'preaprobada', status: 'offer',
  approvedAmount: 1800000, apr: 9.5, term: 5, monthly: null,
  validUntil: '2027-01-01', expired: false, ...over,
})
const car = { make: 'Toyota', model: 'Corolla', year: 2021 }

describe('precedence', () => {
  it('a live approval outranks another bank still asking for documents', () => {
    const s = resolveFinancingStatus({
      responses: [approval(), { rawStatus: 'pendiente_docs', status: 'docs', bankName: 'Popular' }],
    }, 3)
    expect(s.key).toBe('preaprobado')
  })

  // One bank declining while another evaluates is not a rejected case — showing
  // "Rechazado" there would tell a client they failed when they have not.
  it('is not rechazado while any bank is still evaluating', () => {
    const s = resolveFinancingStatus({
      responses: [
        { rawStatus: 'rechazada', status: 'rejected', bankName: 'BHD' },
        { rawStatus: 'en_evaluacion', status: 'evaluating', bankName: 'Popular' },
      ],
    })
    expect(s.key).toBe('en_revision')
  })

  it('is rechazado only when every bank has declined', () => {
    const s = resolveFinancingStatus({
      responses: [
        { rawStatus: 'rechazada', status: 'rejected', bankName: 'BHD' },
        { rawStatus: 'rechazada', status: 'rejected', bankName: 'Popular' },
      ],
    })
    expect(s.key).toBe('rechazado')
    expect(s.cta.label).toMatch(/intentar/i)
  })

  it('never shows rechazado when another bank approved', () => {
    const s = resolveFinancingStatus({
      responses: [approval(), { rawStatus: 'rechazada', status: 'rejected', bankName: 'Popular' }],
    })
    expect(s.key).toBe('preaprobado')
  })

  it('separates requiere_info from en_revision by who holds the ball', () => {
    const responses = [{ rawStatus: 'en_evaluacion', status: 'evaluating', bankName: 'BHD' }]
    expect(resolveFinancingStatus({ responses }, 2).key).toBe('requiere_info')
    expect(resolveFinancingStatus({ responses }, 0).key).toBe('en_revision')
  })
})

describe('aprobado vs preaprobado', () => {
  it('is preaprobado while no vehicle is attached', () => {
    const s = resolveFinancingStatus({ responses: [approval()], isPreapproval: true })
    expect(s.key).toBe('preaprobado')
    expect(s.cta.href).toBe('/buscar?precioMax=1800000')
  })

  // A ceiling with no car is a pre-approval whatever the bank called it.
  it('is aprobado once a vehicle is attached, even if the bank said preaprobada', () => {
    const s = resolveFinancingStatus({ responses: [approval()], vehicle: car })
    expect(s.key).toBe('aprobado')
    expect(s.headline).toContain('BHD')
  })

  it('picks the highest live ceiling across banks', () => {
    const s = resolveFinancingStatus({
      responses: [approval({ approvedAmount: 900000 }), approval({ bankName: 'Popular', approvedAmount: 2100000 })],
    })
    expect(s.amount).toBe(2100000)
    expect(s.bankName).toBe('Popular')
  })
})

describe('expirado is derived, never stored', () => {
  it('reports expirado when the only approval has lapsed', () => {
    const s = resolveFinancingStatus({ responses: [approval({ expired: true })] })
    expect(s.key).toBe('expirado')
    expect(s.cta.label).toMatch(/actualizar/i)
  })

  it('prefers a live approval over a lapsed one', () => {
    const s = resolveFinancingStatus({
      responses: [approval({ expired: true, approvedAmount: 3000000 }), approval({ approvedAmount: 1200000 })],
    })
    expect(s.key).toBe('preaprobado')
    expect(s.amount).toBe(1200000)
  })

  // Expiry outranks outstanding paperwork: renewing is the only useful action,
  // completing documents against a dead offer is not.
  it('outranks requiere_info', () => {
    expect(resolveFinancingStatus({ responses: [approval({ expired: true })] }, 4).key).toBe('expirado')
  })

  it('still exposes the lapsed amount and date so the card can explain', () => {
    const s = resolveFinancingStatus({ responses: [approval({ expired: true })] })
    expect(s.amount).toBe(1800000)
    expect(s.validUntil).toBe('2027-01-01')
  })
})

describe('amounts and monthly', () => {
  it("uses the bank's own monthly figure when given", () => {
    const s = resolveFinancingStatus({ responses: [approval({ monthly: 27950 })] })
    expect(s.monthly).toBe(27950)
  })

  it('estimates a monthly only when the bank left it blank', () => {
    const s = resolveFinancingStatus({ responses: [approval({ monthly: null })] })
    expect(s.monthly).toBeGreaterThan(0)
  })

  it('ignores an approval with no amount', () => {
    const s = resolveFinancingStatus({ responses: [approval({ approvedAmount: null })] })
    expect(s.key).not.toBe('preaprobado')
  })
})

describe('edges', () => {
  it('handles an empty case without throwing', () => {
    const s = resolveFinancingStatus()
    expect(s.key).toBe('en_revision')
    expect(s.cta).toBeNull()
  })

  it('every status carries a label and a tone', () => {
    for (const [key, v] of Object.entries(FINANCING_STATUS)) {
      expect(v.label, key).toBeTruthy()
      expect(v.tone, key).toBeTruthy()
    }
  })

  it('every resolved status has a headline the card can render', () => {
    const cases = [
      resolveFinancingStatus(),
      resolveFinancingStatus({ responses: [approval()] }),
      resolveFinancingStatus({ responses: [approval()], vehicle: car }),
      resolveFinancingStatus({ responses: [approval({ expired: true })] }),
      resolveFinancingStatus({ responses: [{ rawStatus: 'rechazada', status: 'rejected' }] }),
      resolveFinancingStatus({ responses: [] }, 3),
    ]
    for (const s of cases) {
      expect(s.headline, s.key).toBeTruthy()
      expect(s.sub, s.key).toBeTruthy()
      expect(FINANCING_STATUS[s.key], s.key).toBeTruthy()
    }
  })
})
