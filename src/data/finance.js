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
