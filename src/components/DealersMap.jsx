import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { loadGoogleMaps, isMapsConfigured } from '../lib/googleMaps'
import { dealerCoords, DR_CENTER } from '../data/geo'

// Dealer pin: a teal marker with the dealer's initials (stands in for a logo).
function pinIcon(initials, color = '#0f766e') {
  const init = String(initials || '?').slice(0, 3)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="52" viewBox="0 0 42 52">
    <path d="M21 51S40 33 40 20A19 19 0 1 0 2 20C2 33 21 51 21 51Z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
    <circle cx="21" cy="20" r="12.5" fill="#ffffff"/>
    <text x="21" y="24.5" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="${color}" text-anchor="middle">${init}</text>
  </svg>`
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
}

// "You are here" dot for the customer's own location.
function userDot() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="7" fill="#2563eb" stroke="#ffffff" stroke-width="3"/></svg>`
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
}

export default function DealersMap({ dealers, selId, onSelect, userLoc }) {
  const ref = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const userMarkerRef = useRef(null)
  const infoRef = useRef(null)
  const [status, setStatus] = useState(isMapsConfigured() ? 'loading' : 'nokey')

  // Init the map once.
  useEffect(() => {
    if (!isMapsConfigured()) return
    let alive = true
    let ro = null
    loadGoogleMaps().then((maps) => {
      if (!alive || !ref.current || mapRef.current) return
      const map = new maps.Map(ref.current, {
        center: DR_CENTER, zoom: 8,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        // Raster tiles (image-based) render without WebGL, so the map shows on any
        // device/browser and in headless/GPU-less environments.
        renderingType: maps.RenderingType?.RASTER,
      })
      mapRef.current = map
      infoRef.current = new maps.InfoWindow()
      setStatus('ready')
      // A map created before its container is fully laid out paints gray tiles and
      // does not recover on its own — force a repaint on the first sizes it sees.
      const nudge = () => { maps.event.trigger(map, 'resize'); map.setCenter(DR_CENTER) }
      requestAnimationFrame(nudge)
      setTimeout(nudge, 400)
      ro = new ResizeObserver(() => maps.event.trigger(map, 'resize'))
      ro.observe(ref.current)
    }).catch(() => { if (alive) setStatus('error') })
    return () => { alive = false; if (ro) ro.disconnect() }
  }, [])

  const openInfo = (maps, d, marker) => {
    if (!infoRef.current) return
    infoRef.current.setContent(
      `<div style="min-width:150px;font-family:inherit">
        <strong style="font-size:14px">${d.name}</strong><br/>
        <span style="color:#64748b;font-size:12px">${d.city || 'RD'} · ${d.vehicles.length} vehículo${d.vehicles.length === 1 ? '' : 's'}</span>
      </div>`
    )
    infoRef.current.open({ map: mapRef.current, anchor: marker })
  }

  // (Re)draw markers whenever the filtered dealer list changes.
  useEffect(() => {
    if (status !== 'ready' || !window.google?.maps) return
    const maps = window.google.maps
    Object.values(markersRef.current).forEach((m) => m.setMap(null))
    markersRef.current = {}
    const bounds = new maps.LatLngBounds()
    dealers.forEach((d) => {
      const pos = dealerCoords(d)
      const marker = new maps.Marker({
        position: pos, map: mapRef.current, title: d.name,
        icon: { url: pinIcon(d.initials), scaledSize: new maps.Size(42, 52), anchor: new maps.Point(21, 52) },
      })
      marker.addListener('click', () => { onSelect(d.id); openInfo(maps, d, marker) })
      markersRef.current[d.id] = marker
      bounds.extend(pos)
    })
    // "You are here" marker from the customer's geolocation.
    if (userMarkerRef.current) { userMarkerRef.current.setMap(null); userMarkerRef.current = null }
    if (userLoc) {
      userMarkerRef.current = new maps.Marker({
        position: userLoc, map: mapRef.current, title: 'Tu ubicación', zIndex: 999,
        icon: { url: userDot(), scaledSize: new maps.Size(24, 24), anchor: new maps.Point(12, 12) },
      })
      bounds.extend(userLoc)
    }
    const points = dealers.length + (userLoc ? 1 : 0)
    if (points > 1) mapRef.current.fitBounds(bounds, 64)
    else if (points === 1) { mapRef.current.setCenter(bounds.getCenter()); mapRef.current.setZoom(12) }
  }, [dealers, status, userLoc]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pan + open info when a dealer is selected from the list.
  useEffect(() => {
    if (status !== 'ready' || !selId) return
    const marker = markersRef.current[selId]
    const d = dealers.find((x) => x.id === selId)
    if (marker && d) { mapRef.current.panTo(marker.getPosition()); openInfo(window.google.maps, d, marker) }
  }, [selId, status]) // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'nokey' || status === 'error') {
    return (
      <div className="dealers-map dealers-map--fallback">
        <div className="col center" style={{ textAlign: 'center', gap: 8, padding: 24 }}>
          <MapPin size={28} className="muted" />
          <div className="strong">Mapa no disponible</div>
          <div className="tiny muted" style={{ maxWidth: 300, lineHeight: 1.5 }}>
            {status === 'nokey'
              ? 'Agrega tu clave de Google Maps (VITE_GOOGLE_MAPS_API_KEY) para activar el mapa. La lista de dealers y los filtros funcionan igual.'
              : 'No se pudo cargar Google Maps. Verifica la clave de API y la facturación.'}
          </div>
        </div>
      </div>
    )
  }
  return <div className="dealers-map" ref={ref} />
}
