// Favorites store. Persists to localStorage now (works logged-out);
// can be upgraded to a Supabase `favorites` table for logged-in users.
const KEY = 'autord_favs'

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function write(ids) {
  localStorage.setItem(KEY, JSON.stringify(ids))
  window.dispatchEvent(new Event('autord-favs'))
}

export async function getFavoriteIds() { return read() }
export function isFavorite(id) { return read().includes(id) }
export function toggleFavorite(id) {
  const ids = read()
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
  write(next)
  return next.includes(id)
}
