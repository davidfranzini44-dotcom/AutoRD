import { useEffect, useRef, useState } from 'react'
import { MapPin, Crosshair, Loader2, Trash2 } from 'lucide-react'
import { loadGoogleMaps, isMapsConfigured } from '../lib/googleMaps'

// Pull a clean address + city + coords out of a Google place / geocoder result.
function parsePlace(place) {
  const comp = place.address_components || []
  const get = (type) => comp.find((c) => c.types.includes(type))?.long_name || ''
  const city = get('locality') || get('administrative_area_level_2') || get('administrative_area_level_1') || ''
  const loc = place.geometry?.location
  const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat
  const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng
  return { address: place.formatted_address || '', city, lat, lng }
}

// One dealer location: Google Places autocomplete on the address + "use my
// location" (geolocation → reverse-geocode). Falls back to manual entry when the
// Maps key/APIs aren't available. Coordinates are captured automatically.
export default function LocationPicker({ index, loc, onChange, onRemove }) {
  const addrRef = useRef(null)
  const acRef = useRef(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoErr, setGeoErr] = useState('')
  const configured = isMapsConfigured()
  const set = (k) => (e) => onChange({ ...loc, [k]: e.target.value })

  // Keep latest loc/onChange for the Autocomplete listener (attached once).
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange
  const locRef = useRef(loc); locRef.current = loc

  // Attach Places Autocomplete to the address input (once).
  useEffect(() => {
    if (!configured || !addrRef.current) return
    let alive = true
    loadGoogleMaps().then(async () => {
      if (!alive || acRef.current) return
      try {
        await window.google.maps.importLibrary('places')
        const Autocomplete = window.google.maps.places?.Autocomplete
        if (!Autocomplete || !alive) return
        const ac = new Autocomplete(addrRef.current, {
          componentRestrictions: { country: 'do' },
          fields: ['formatted_address', 'geometry', 'address_components'],
        })
        acRef.current = ac
        ac.addListener('place_changed', () => {
          const place = ac.getPlace()
          if (!place?.geometry) return
          const p = parsePlace(place)
          onChangeRef.current({ ...locRef.current, address: p.address, city: p.city || locRef.current.city, lat: p.lat ?? locRef.current.lat, lng: p.lng ?? locRef.current.lng })
        })
      } catch { /* Places API not enabled — manual entry still works */ }
    }).catch(() => {})
    return () => { alive = false }
  }, [configured])

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoErr('Tu navegador no permite ubicación.'); return }
    setGeoBusy(true); setGeoErr('')
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude
      let address = loc.address, city = loc.city
      if (configured) {
        try {
          await loadGoogleMaps()
          await window.google.maps.importLibrary('geocoding')
          const res = await new window.google.maps.Geocoder().geocode({ location: { lat, lng } })
          const best = res.results?.[0]
          if (best) { const p = parsePlace(best); address = p.address || address; city = p.city || city }
        } catch { /* keep coords, skip address */ }
      }
      onChange({ ...loc, lat, lng, address, city })
      setGeoBusy(false)
    }, (err) => {
      setGeoErr(err.code === 1 ? 'Permiso de ubicación denegado.' : 'No pudimos obtener tu ubicación.')
      setGeoBusy(false)
    }, { enableHighAccuracy: true, timeout: 10000 })
  }

  const hasCoords = loc.lat !== '' && loc.lat != null && loc.lng !== '' && loc.lng != null

  return (
    <div className="card" style={{ padding: 12, background: 'var(--surface-2)', boxShadow: 'none' }}>
      <div className="row between center" style={{ marginBottom: 8 }}>
        <span className="tiny strong">Ubicación {index + 1}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={onRemove} title="Eliminar"><Trash2 size={14} /></button>
      </div>

      <div className="field">
        <label>Nombre / sucursal</label>
        <input className="input" value={loc.name} onChange={set('name')} placeholder="Casa matriz" />
      </div>

      <div className="field" style={{ marginTop: 8 }}>
        <label>Dirección {configured && <span className="tiny muted">· busca en Google Maps</span>}</label>
        <input ref={addrRef} className="input" value={loc.address} onChange={set('address')}
          placeholder={configured ? 'Escribe y elige de las sugerencias…' : 'Av. 27 de Febrero #250'} autoComplete="off" />
      </div>

      <div className="grid grid-2" style={{ gap: 8, marginTop: 8, alignItems: 'end' }}>
        <div className="field"><label>Ciudad</label><input className="input" value={loc.city} onChange={set('city')} placeholder="Santo Domingo" /></div>
        <button type="button" className="btn btn-outline btn-block" onClick={useMyLocation} disabled={geoBusy} style={{ height: 42 }}>
          {geoBusy ? <Loader2 size={15} className="spin" /> : <Crosshair size={15} />} Usar mi ubicación
        </button>
      </div>

      {hasCoords && (
        <div className="tiny muted" style={{ marginTop: 8 }}>
          <MapPin size={12} style={{ verticalAlign: -2 }} /> Ubicación fijada: {Number(loc.lat).toFixed(5)}, {Number(loc.lng).toFixed(5)}
        </div>
      )}
      {geoErr && <div className="tiny" style={{ color: 'var(--red)', marginTop: 6 }}>{geoErr}</div>}
      {!configured && <div className="tiny muted" style={{ marginTop: 6 }}>Las sugerencias de Google no están disponibles (falta la clave de Maps). Escribe la dirección y usa “Usar mi ubicación” para las coordenadas.</div>}
    </div>
  )
}
