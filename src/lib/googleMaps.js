// Loads the Google Maps JS SDK once.
//
// ▼▼▼ PASTE YOUR GOOGLE MAPS API KEY BETWEEN THE QUOTES BELOW ▼▼▼
// One paste enables maps everywhere (local dev + the deployed Vercel site) —
// no env vars needed. A Vite env var (VITE_GOOGLE_MAPS_API_KEY) still overrides
// this if you ever prefer to set it per-environment.
//
// In Google Cloud, enable on this key: Maps JavaScript API, Places API, and
// Geocoding API. Then RESTRICT the key by HTTP referrer to your domains
// (https://auto-rd-2uh5.vercel.app/* and http://localhost:*) so it can't be
// abused for billing if it leaks (the key ships in the browser bundle).
const DEFAULT_MAPS_KEY = '' // ← PASTE KEY HERE, e.g. 'AIzaSy...'
// ▲▲▲ PASTE YOUR GOOGLE MAPS API KEY BETWEEN THE QUOTES ABOVE ▲▲▲

const mapsKey = () => import.meta.env.VITE_GOOGLE_MAPS_API_KEY || DEFAULT_MAPS_KEY

let promise = null

export function isMapsConfigured() {
  return !!mapsKey()
}

export function loadGoogleMaps() {
  if (typeof window !== 'undefined' && window.google?.maps) return Promise.resolve(window.google.maps)
  if (promise) return promise
  const key = mapsKey()
  promise = new Promise((resolve, reject) => {
    if (!key) { reject(new Error('missing-key')); return }
    // With loading=async, google.maps is NOT ready at script onload — resolve on
    // Google's official callback, which fires only once the API is fully loaded.
    window.__autordGmapsReady = () => resolve(window.google.maps)
    const s = document.createElement('script')
    s.id = 'gmaps-sdk'
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=places&callback=__autordGmapsReady`
    s.async = true
    s.onerror = () => reject(new Error('load-failed'))
    document.head.appendChild(s)
  })
  return promise
}
