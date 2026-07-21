const KEY = 'autord_recently_viewed'
const MAX = 12

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function write(ids) {
  localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)))
  window.dispatchEvent(new Event('autord-recently-viewed'))
}

export function getRecentlyViewedIds() {
  return read()
}

export function recentlyViewedCount() {
  return read().length
}

export function recordRecentlyViewed(vehicleOrId) {
  const id = typeof vehicleOrId === 'string' ? vehicleOrId : vehicleOrId?.id
  if (!id) return read()
  const next = [id, ...read().filter((item) => item !== id)]
  write(next)
  return next.slice(0, MAX)
}

export function removeRecentlyViewed(id) {
  write(read().filter((item) => item !== id))
}

export function clearRecentlyViewed() {
  write([])
}
