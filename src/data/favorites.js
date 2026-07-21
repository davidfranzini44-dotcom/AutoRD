// Saved cars. localStorage is the instant, sync cache the UI reads; when a buyer
// is logged in we also persist to the Supabase `favorites` table (via slug RPCs)
// so their saved cars follow the account across devices. On login we merge the
// two; on logout we clear the local cache (the DB copy is safe).
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const KEY = 'autord_favs'
let userId = null

function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
function write(ids) {
  localStorage.setItem(KEY, JSON.stringify(ids))
  window.dispatchEvent(new Event('autord-favs'))
}

// Called by AuthContext on every session change.
export async function hydrateFavorites(uid) {
  const wasUser = userId
  userId = uid || null
  if (!userId) { if (wasUser) write([]); return } // logged out -> clear local cache
  if (!isSupabaseConfigured) return
  try {
    const { data } = await supabase.rpc('my_favorite_slugs')
    const dbSlugs = data || []
    const local = read()
    const dbSet = new Set(dbSlugs)
    // Push local-only saves up to the account, then show the union.
    for (const slug of local) if (!dbSet.has(slug)) supabase.rpc('toggle_favorite', { p_slug: slug }).catch(() => {})
    write([...new Set([...dbSlugs, ...local])])
  } catch { /* keep local */ }
}

// Resolve the signed-in user id. `userId` is normally primed by
// hydrateFavorites on auth change, but a click in the first moments after a
// reload can beat that — so fall back to a one-time getUser() and cache it.
async function currentUserId() {
  if (userId) return userId
  if (!isSupabaseConfigured) return null
  try { const { data } = await supabase.auth.getUser(); userId = data?.user?.id || null } catch { /* logged out */ }
  return userId
}

export function isFavorite(id) { return read().includes(id) }
export function toggleFavorite(id) {
  const ids = read()
  const on = !ids.includes(id)
  write(on ? [...ids, id] : ids.filter((x) => x !== id))
  if (isSupabaseConfigured) {
    currentUserId().then((uid) => { if (uid) supabase.rpc('toggle_favorite', { p_slug: id }).catch(() => {}) })
  }
  return on
}
export async function getFavoriteIds() { return read() }
export function favoriteCount() { return read().length }
