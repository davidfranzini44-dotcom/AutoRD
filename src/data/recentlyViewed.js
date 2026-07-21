// Recently-viewed vehicles. localStorage is the instant, sync cache the UI reads;
// for logged-in buyers we also persist to Supabase (via slug RPCs) so history
// follows the account across devices. Mirrors src/data/favorites.js.
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const KEY = 'autord_recently_viewed'
const MAX = 24
let userId = null

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function write(ids) {
  localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)))
  window.dispatchEvent(new Event('autord-recently-viewed'))
}

async function currentUserId() {
  if (userId) return userId
  if (!isSupabaseConfigured) return null
  try { const { data } = await supabase.auth.getUser(); userId = data?.user?.id || null } catch { /* logged out */ }
  return userId
}

// Called by AuthContext on every session change.
export async function hydrateRecentlyViewed(uid) {
  userId = uid || null
  if (!userId || !isSupabaseConfigured) return
  try {
    const { data } = await supabase.rpc('my_recent_slugs')
    const dbSlugs = data || []
    // DB is the source of truth for order; union any local-only ids after it.
    const local = read()
    const merged = [...new Set([...dbSlugs, ...local])].slice(0, MAX)
    write(merged)
  } catch { /* keep local */ }
}

export function getRecentlyViewedIds() { return read() }
export function recentlyViewedCount() { return read().length }

export function recordRecentlyViewed(vehicleOrId) {
  const id = typeof vehicleOrId === 'string' ? vehicleOrId : vehicleOrId?.id
  if (!id) return read()
  const next = [id, ...read().filter((item) => item !== id)].slice(0, MAX)
  write(next)
  if (isSupabaseConfigured) {
    currentUserId().then((uid) => { if (uid) supabase.rpc('record_view', { p_slug: id }).catch(() => {}) })
  }
  return next
}

export function removeRecentlyViewed(id) {
  write(read().filter((item) => item !== id))
}

export function clearRecentlyViewed() {
  write([])
}
