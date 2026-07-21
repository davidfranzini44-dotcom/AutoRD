// Saved search alerts. localStorage is the instant, sync cache the UI reads; for
// logged-in buyers we also persist to Supabase (saved_searches) so alerts follow
// the account across devices. Mirrors src/data/favorites.js.
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const KEY = 'autord_saved_searches'
const MAX = 24
let userId = null

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function write(items) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)))
  window.dispatchEvent(new Event('autord-search-alerts'))
}
function cleanQuery(query) { return String(query || '').replace(/^\?/, '') }
function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
async function currentUserId() {
  if (userId) return userId
  if (!isSupabaseConfigured) return null
  try { const { data } = await supabase.auth.getUser(); userId = data?.user?.id || null } catch { /* logged out */ }
  return userId
}

// Called by AuthContext on every session change: pull DB alerts, push local-only.
export async function hydrateSavedSearches(uid) {
  userId = uid || null
  if (!userId || !isSupabaseConfigured) return
  try {
    const { data } = await supabase.rpc('my_saved_searches')
    const dbRows = (data || []).map((r) => ({
      id: r.id, title: r.title, query: r.query, count: r.count || 0,
      filters: Array.isArray(r.filters) ? r.filters : [],
      createdAt: r.created_at, lastSeenAt: r.last_seen_at, channel: 'AutoRD',
    }))
    const dbQueries = new Set(dbRows.map((r) => r.query))
    // Push any local-only alerts up to the account.
    for (const item of read()) {
      if (!dbQueries.has(item.query)) {
        supabase.rpc('save_search', { p_query: item.query, p_title: item.title, p_filters: item.filters || [], p_count: item.count || 0 }).catch(() => {})
      }
    }
    // Show DB rows first (source of truth), then any local-only ones.
    const localOnly = read().filter((i) => !dbQueries.has(i.query))
    write([...dbRows, ...localOnly])
  } catch { /* keep local */ }
}

export function getSavedSearches() { return read() }
export function savedSearchCount() { return read().length }
export function isSearchSaved(query) {
  const q = cleanQuery(query)
  return read().some((item) => item.query === q)
}

export function saveSearchAlert({ title, query, count = 0, filters = [] }) {
  const q = cleanQuery(query)
  const items = read()
  const existing = items.find((item) => item.query === q)
  const persist = () => {
    if (isSupabaseConfigured) {
      currentUserId().then((uid) => { if (uid) supabase.rpc('save_search', { p_query: q, p_title: title || 'Búsqueda guardada', p_filters: filters, p_count: count }).catch(() => {}) })
    }
  }
  if (existing) {
    const updated = { ...existing, count, filters, lastSeenAt: new Date().toISOString() }
    write([updated, ...items.filter((item) => item.id !== existing.id)])
    persist()
    return { saved: updated, existing: true }
  }
  const saved = {
    id: makeId(), title: title || 'Búsqueda guardada', query: q, count, filters,
    createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), channel: 'AutoRD',
  }
  write([saved, ...items])
  persist()
  return { saved, existing: false }
}

export function removeSearchAlert(id) {
  const item = read().find((i) => i.id === id)
  write(read().filter((i) => i.id !== id))
  if (item && isSupabaseConfigured) {
    currentUserId().then((uid) => { if (uid) supabase.rpc('delete_saved_search_by_query', { p_query: item.query }).catch(() => {}) })
  }
}

export function clearSearchAlerts() {
  const items = read()
  write([])
  if (isSupabaseConfigured) {
    currentUserId().then((uid) => { if (uid) items.forEach((i) => supabase.rpc('delete_saved_search_by_query', { p_query: i.query }).catch(() => {})) })
  }
}
