// Approximate coordinates for Dominican Republic cities, used to place dealer
// pins from their `city`. Street-level accuracy would need real lat/lng per dealer.
export const DR_CITY_COORDS = {
  'Santo Domingo': { lat: 18.4861, lng: -69.9312 },
  'Santiago': { lat: 19.4517, lng: -70.6970 },
  'La Romana': { lat: 18.4273, lng: -68.9728 },
  'Punta Cana': { lat: 18.5820, lng: -68.4055 },
  'Bávaro': { lat: 18.6420, lng: -68.4530 },
  'Puerto Plata': { lat: 19.7934, lng: -70.6884 },
  'San Cristóbal': { lat: 18.4167, lng: -70.1000 },
  'La Vega': { lat: 19.2220, lng: -70.5290 },
  'San Pedro de Macorís': { lat: 18.4539, lng: -69.3086 },
  'San Francisco de Macorís': { lat: 19.3009, lng: -70.2528 },
}

export const DR_CENTER = { lat: 18.9357, lng: -70.1627 }

function hashOf(s) {
  return Math.abs([...String(s || 'x')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))
}

// City coords + a small deterministic offset so dealers in the same city don't
// stack on the exact same point.
export function dealerCoords(dealer) {
  const base = DR_CITY_COORDS[dealer.city] || DR_CENTER
  const h = hashOf(dealer.slug || dealer.name || dealer.id)
  const jitter = (n) => ((n % 1000) / 1000 - 0.5) * 0.05 // ~±0.025°
  return { lat: base.lat + jitter(h), lng: base.lng + jitter(Math.floor(h / 1000) + 7) }
}
