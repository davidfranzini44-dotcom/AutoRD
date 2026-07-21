const KEY = 'autord_saved_searches'
const MAX = 12

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function write(items) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)))
  window.dispatchEvent(new Event('autord-search-alerts'))
}

function cleanQuery(query) {
  return String(query || '').replace(/^\?/, '')
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function getSavedSearches() {
  return read()
}

export function savedSearchCount() {
  return read().length
}

export function isSearchSaved(query) {
  const q = cleanQuery(query)
  return read().some((item) => item.query === q)
}

export function saveSearchAlert({ title, query, count = 0, filters = [] }) {
  const q = cleanQuery(query)
  const items = read()
  const existing = items.find((item) => item.query === q)
  if (existing) {
    const updated = { ...existing, count, filters, lastSeenAt: new Date().toISOString() }
    write([updated, ...items.filter((item) => item.id !== existing.id)])
    return { saved: updated, existing: true }
  }

  const saved = {
    id: makeId(),
    title: title || 'Busqueda guardada',
    query: q,
    count,
    filters,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    channel: 'AutoRD',
  }
  write([saved, ...items])
  return { saved, existing: false }
}

export function removeSearchAlert(id) {
  write(read().filter((item) => item.id !== id))
}

export function clearSearchAlerts() {
  write([])
}
