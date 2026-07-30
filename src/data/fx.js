// USD -> DOP conversion for a marketplace that prices most of its inventory in
// dollars but finances exclusively in pesos.
//
// The whole module exists because of one bug: Financing.jsx used vehicle.price
// as a DOP figure regardless of currency, so a US$96,000 car asked a bank to
// finance RD$96,000. Everything here is built so that a MISSING rate is loud
// rather than silently substituted — an invented rate on a multi-million-peso
// loan is worse than a visibly absent one.

export const RATE_MIN = 20
export const RATE_MAX = 200

/** A rate is usable only if it is a finite number inside a sane band. */
export function isValidRate(rate) {
  const n = Number(rate)
  return Number.isFinite(n) && n >= RATE_MIN && n <= RATE_MAX
}

/**
 * Convert a price to DOP.
 * @returns {number|null} null when the conversion cannot be made honestly —
 *          i.e. USD with no usable rate. Callers must render that as
 *          "no disponible", never as the unconverted number.
 */
export function toDop(amount, currency, rate) {
  // Number('') and Number(null) are both 0, and 0 is finite — the exact trap
  // that made "Uso: N/D" import as a confident 0 km. Reject them first.
  if (amount === '' || amount == null) return null
  const n = Number(amount)
  if (!Number.isFinite(n)) return null
  if (currency !== 'USD') return n
  if (!isValidRate(rate)) return null
  return Math.round(n * Number(rate))
}

/**
 * What a bank is actually asked to finance, in DOP.
 * The down payment is assumed to already be in DOP, because that is what the
 * buyer types into a peso-denominated form.
 * @returns {number|null} null when the price cannot be converted.
 */
export function financedAmountDop({ price, currency, downDop = 0, rate }) {
  const priceDop = toDop(price, currency, rate)
  if (priceDop == null) return null
  const down = Number(downDop)
  return Math.max(0, priceDop - (Number.isFinite(down) ? down : 0))
}

/**
 * Display helper: the listed price plus its peso equivalent.
 * @returns {{primary: string, secondary: string|null, dop: number|null}}
 *          secondary is null for DOP cars (nothing to convert) and carries an
 *          explicit "sin tasa" note for USD cars we cannot convert.
 */
export function priceDisplay({ price, currency, rate }, fmt) {
  const n = Number(price)
  const money = typeof fmt === 'function' ? fmt : (v) => String(v)
  if (!Number.isFinite(n)) return { primary: '—', secondary: null, dop: null }
  if (currency !== 'USD') return { primary: money(n), secondary: null, dop: n }
  const dop = toDop(n, 'USD', rate)
  return {
    primary: `US$ ${n.toLocaleString('en-US')}`,
    secondary: dop == null ? 'Tasa USD no configurada' : `≈ ${money(dop)}`,
    dop,
  }
}
