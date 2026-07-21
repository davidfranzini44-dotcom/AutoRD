import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { loadGoogleMaps, isMapsConfigured } from '../lib/googleMaps'

// Small single-pin Google map (e.g. a vehicle's precise location). Renders
// nothing without coords; shows a graceful fallback when the Maps key is absent.
export default function MiniMap({ lat, lng, label, height = 200 }) {
  const ref = useRef(null)
  const mapRef = useRef(null)
  const hasCoords = lat != null && lat !== '' && lng != null && lng !== ''
  const [status, setStatus] = useState(isMapsConfigured() ? 'loading' : 'nokey')

  useEffect(() => {
    if (!isMapsConfigured() || !hasCoords) return
    let alive = true
    const pos = { lat: Number(lat), lng: Number(lng) }
    loadGoogleMaps().then((maps) => {
      if (!alive || !ref.current || mapRef.current) return
      const map = new maps.Map(ref.current, {
        center: pos, zoom: 14,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        renderingType: maps.RenderingType?.RASTER,
      })
      mapRef.current = map
      new maps.Marker({ position: pos, map, title: label || '' })
      setStatus('ready')
      const nudge = () => { maps.event.trigger(map, 'resize'); map.setCenter(pos) }
      requestAnimationFrame(nudge)
      setTimeout(nudge, 400)
    }).catch(() => { if (alive) setStatus('error') })
    return () => { alive = false }
  }, [lat, lng]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasCoords) return null
  if (status === 'nokey' || status === 'error') {
    return (
      <div style={{ height, borderRadius: 10, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', border: '1px solid var(--line)' }}>
        <span className="tiny muted"><MapPin size={15} style={{ verticalAlign: -3 }} /> {label || 'Ubicación'}</span>
      </div>
    )
  }
  return <div ref={ref} style={{ height, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }} />
}
