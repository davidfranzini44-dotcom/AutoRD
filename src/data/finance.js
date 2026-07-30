// ============================================================
// Shared financing math (single source of truth).
// Used by the homepage estimate and the pre-aprobación flow.
// ============================================================

// Indicative annual rates (%) per allied bank, keyed by slug.
export const BANK_RATES = { popular: 9.75, bhd: 9.5, banreservas: 9.95, scotiabank: 10.25 }

// Format a money field as the user types: keep digits, group thousands, prefix RD$.
// "85000" -> "RD$ 85,000"; "" -> "".
export function fmtMoneyInput(raw) {
  const digits = String(raw ?? '').replace(/[^\d]/g, '')
  if (!digits) return ''
  return 'RD$ ' + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function downRequirementLabel({ down = null, downPct = null, downRule = null, money = null } = {}) {
  if (downRule) return downRule
  const parts = []
  const fixed = Number(down)
  const pct = Number(downPct)
  if (Number.isFinite(fixed) && fixed > 0) parts.push(money ? money(fixed) : `RD$ ${Math.round(fixed).toLocaleString('es-DO')}`)
  if (Number.isFinite(pct) && pct > 0) parts.push(`${pct}% del vehiculo`)
  if (parts.length === 2) return `El mayor entre ${parts[0]} y ${parts[1]}`
  return parts[0] || ''
}

// Canonical "Desde RD$X/mes" for a vehicle: 20% down over the car's term, amortized
// with its APR. Used everywhere a car's headline monthly is shown so they agree.
export function carDefaultMonthly(v) {
  const price = Number(v?.price || 0)
  const principal = Math.max(0, price - Math.round(price * 0.20))
  const months = (Number(v?.termYears) || 7) * 12
  return estimateMonthly(principal, Number(v?.apr) || BANK_RATES.popular, months)
}

// Monthly payment for a `principal` financed at `apr`% over `months`.
export function estimateMonthly(principal, apr, months) {
  const rate = apr / 100 / 12
  if (!principal || !months) return 0
  if (!rate) return Math.round(principal / months)
  return Math.round((principal * rate) / (1 - Math.pow(1 + rate, -months)))
}

// Inverse of estimateMonthly: the largest principal whose monthly payment
// fits within `monthlyBudget` at `apr`% over `months`.
export function maxPrincipal(monthlyBudget, apr, months) {
  const rate = apr / 100 / 12
  if (!monthlyBudget || !months) return 0
  if (!rate) return Math.round(monthlyBudget * months)
  return Math.round((monthlyBudget * (1 - Math.pow(1 + rate, -months))) / rate)
}

// Rough affordability: given monthly income and cash for the down payment,
// what vehicle price can the customer likely finance? Max monthly payment is
// capped at `dtiPct`% of income (a common debt-to-income rule of thumb).
export function affordablePrice({ income, down = 0, apr, months, dtiPct = 30 }) {
  const inc = Number(income) || 0
  const dn = Number(down) || 0
  if (inc <= 0) return { maxMonthly: 0, principal: 0, price: 0 }
  const maxMonthly = Math.round(inc * (dtiPct / 100))
  const principal = maxPrincipal(maxMonthly, apr, months)
  return { maxMonthly, principal, price: principal + dn }
}

// Does this car fit the client's approval?
//
// Promoted out of FinancingPublic, where it lived as four loose consts inside a
// calculator and was therefore unavailable to the marketplace — the buyer could
// only find out whether a car fit after opening their token portal. Same maths,
// one home, so the hub, the vehicle cards and the portal cannot drift apart.
//
// Returns null when there is no approval to measure against; the caller shows a
// plain calculator instead of a fit verdict it cannot justify.
export function vehicleFit({ price, approvedAmount, apr = 12, termYears = 5, down = null, downPct = 20 } = {}) {
  const p = Number(price) || 0
  const ceiling = Number(approvedAmount) || 0
  if (!p || !ceiling) return null

  // What the client would normally put down, unless they named a figure.
  const assumedDown = down != null ? Math.max(0, Number(down) || 0) : Math.round(p * (downPct / 100))
  const financed = Math.max(0, p - assumedDown)
  const fits = financed <= ceiling

  // The total inicial that brings the rest under the bank's ceiling, and how
  // much MORE that is than they were planning on. "Necesitas RD$X más de
  // inicial" is the useful sentence; "no califica" is not.
  const minDown = Math.max(0, p - ceiling)
  const extraDownNeeded = Math.max(0, minDown - assumedDown)

  const months = Math.max(1, Math.round(Number(termYears) || 5) * 12)
  // Always quote an achievable payment: never finance above the ceiling.
  const monthly = estimateMonthly(Math.min(financed, ceiling), Number(apr) || 0, months)

  return { fits, price: p, ceiling, down: assumedDown, minDown, extraDownNeeded, financed, monthly, months }
}
