const KEY = 'autord_compare'
const MAX = 4

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function write(ids) {
  localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)))
  window.dispatchEvent(new Event('autord-compare'))
}

export function isCompared(id) {
  return read().includes(id)
}

export function toggleCompare(id) {
  const ids = read()
  const on = !ids.includes(id)
  if (on && ids.length >= MAX) return { on: false, full: true, ids }
  const next = on ? [...ids, id] : ids.filter((x) => x !== id)
  write(next)
  return { on, full: false, ids: next }
}

export function removeCompare(id) {
  write(read().filter((x) => x !== id))
}

export function clearCompare() {
  write([])
}

export function getCompareIds() {
  return read()
}

export function compareCount() {
  return read().length
}
