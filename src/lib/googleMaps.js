// Loads the Google Maps JS SDK once, using a Vite env key.
// Add VITE_GOOGLE_MAPS_API_KEY (a billing-enabled Google Cloud Maps JS key)
// locally in .env and in Vercel to enable the map. Without it, callers show a
// graceful "add your key" fallback.
let promise = null

export function isMapsConfigured() {
  return !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY
}

export function loadGoogleMaps() {
  if (typeof window !== 'undefined' && window.google?.maps) return Promise.resolve(window.google.maps)
  if (promise) return promise
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  promise = new Promise((resolve, reject) => {
    if (!key) { reject(new Error('missing-key')); return }
    // With loading=async, google.maps is NOT ready at script onload — resolve on
    // Google's official callback, which fires only once the API is fully loaded.
    window.__autordGmapsReady = () => resolve(window.google.maps)
    const s = document.createElement('script')
    s.id = 'gmaps-sdk'
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__autordGmapsReady`
    s.async = true
    s.onerror = () => reject(new Error('load-failed'))
    document.head.appendChild(s)
  })
  return promise
}
