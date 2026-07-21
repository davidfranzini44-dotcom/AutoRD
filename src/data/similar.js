// "Similar vehicles" ranking — smarter than "first 4". Scores each candidate by
// how close it is to the target across body type, make/model, price, year,
// mileage, fuel/transmission and location, then returns the top matches.
export function similarityScore(target, c) {
  if (!target || !c || c.id === target.id) return -1
  let s = 0
  if (c.bodyType && c.bodyType === target.bodyType) s += 40
  if (c.make && c.make === target.make) s += 20
  if (c.make === target.make && c.model === target.model) s += 15

  // Price closeness (within a ±25% window, weighted by how close).
  if (target.price && c.price) {
    const diff = Math.abs(c.price - target.price) / target.price
    if (diff <= 0.25) s += 25 * (1 - diff / 0.25)
  }
  // Year closeness (within 4 years).
  if (target.year && c.year) {
    const d = Math.abs(c.year - target.year)
    if (d <= 4) s += 15 * (1 - d / 4)
  }
  // Mileage closeness (within 60k km).
  const tm = Number(target.mileage), cm = Number(c.mileage)
  if (Number.isFinite(tm) && Number.isFinite(cm)) {
    const d = Math.abs(cm - tm)
    if (d <= 60000) s += 10 * (1 - d / 60000)
  }
  if (c.fuel && c.fuel === target.fuel) s += 6
  if (c.transmission && c.transmission === target.transmission) s += 4
  if (c.location && c.location === target.location) s += 8
  if (c.certified && target.certified) s += 3
  return s
}

// Top-N most similar vehicles to `target` from `all`. Falls back to filling any
// remaining slots with the nearest-priced others so we always show something.
export function pickSimilar(target, all, n = 4) {
  if (!target) return (all || []).slice(0, n)
  const scored = (all || [])
    .filter((v) => v && v.id !== target.id)
    .map((v) => ({ v, s: similarityScore(target, v) }))
    .sort((a, b) => b.s - a.s)

  const strong = scored.filter((x) => x.s > 0).map((x) => x.v)
  if (strong.length >= n) return strong.slice(0, n)
  // Backfill by closest price so the row is never sparse.
  const chosen = new Set(strong.map((v) => v.id))
  const backfill = (all || [])
    .filter((v) => v && v.id !== target.id && !chosen.has(v.id))
    .sort((a, b) => Math.abs((a.price || 0) - (target.price || 0)) - Math.abs((b.price || 0) - (target.price || 0)))
  return [...strong, ...backfill].slice(0, n)
}
