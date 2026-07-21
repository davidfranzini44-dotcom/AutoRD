import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, BadgeCheck, ChevronLeft, SlidersHorizontal, LocateFixed, Loader2, Navigation, ChevronRight, MessageCircle } from 'lucide-react'
import CarImage from '../components/CarImage'
import DealersMap from '../components/DealersMap'
import { listDealers } from '../data/api'
import { BODY_TYPES, TYPE_LABELS } from '../data/bodyTypes'
import { fmtRD } from '../data/demo'
import { useFicha } from '../context/FichaContext'
import { dealerCoords, haversineKm, directionsUrl, nearestCity } from '../data/geo'

const PRICE_OPTIONS = [500000, 900000, 1300000, 1800000, 2450000, 3500000, 5000000]
const YEARS = Array.from({ length: 2025 - 2010 + 1 }, (_, i) => 2025 - i) // 2025 → 2010

export default function Dealers() {
  const [dealers, setDealers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState('')
  const [precioMin, setPrecioMin] = useState('')
  const [precioMax, setPrecioMax] = useState('')
  const [anioMin, setAnioMin] = useState('')
  const [anioMax, setAnioMax] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [userLoc, setUserLoc] = useState(null) // { lat, lng } from "usar mi ubicación"
  const [locStatus, setLocStatus] = useState('idle') // idle|loading|ok|denied|unsupported
  const [selId, setSelId] = useState(null)
  const { open } = useFicha()

  useEffect(() => {
    let alive = true
    listDealers()
      .then((d) => { if (alive) setDealers(d) })
      .catch(() => { if (alive) setDealers([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const cities = useMemo(() => [...new Set(dealers.map((d) => d.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es-DO')), [dealers])

  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocStatus('unsupported'); return }
    setLocStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocStatus('ok') },
      () => setLocStatus('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    )
  }

  // Auto-detect the customer's location on load so dealers sort by proximity to their city.
  useEffect(() => { useMyLocation() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const myCity = userLoc ? nearestCity(userLoc) : null

  const vehicleFilter = !!(tipo || precioMin || precioMax || anioMin || anioMax)
  const hasFilter = vehicleFilter || !!ciudad
  const filtered = useMemo(() => {
    let list = dealers.map((d) => ({
      ...d,
      matches: d.vehicles.filter((v) =>
        (!tipo || v.bodyType === tipo) &&
        (!precioMin || v.price >= Number(precioMin)) &&
        (!precioMax || v.price <= Number(precioMax)) &&
        (!anioMin || v.year >= Number(anioMin)) &&
        (!anioMax || v.year <= Number(anioMax))),
      distanceKm: userLoc ? haversineKm(userLoc, dealerCoords(d)) : null,
    }))
      .filter((d) => (!ciudad || d.city === ciudad))
      .filter((d) => (vehicleFilter ? d.matches.length > 0 : true))
    if (userLoc) list = [...list].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    return list
  }, [dealers, tipo, precioMin, precioMax, anioMin, anioMax, ciudad, vehicleFilter, userLoc])

  const clear = () => { setTipo(''); setPrecioMin(''); setPrecioMax(''); setAnioMin(''); setAnioMax(''); setCiudad('') }

  return (
    <main className="page">
      <div className="container">
        <Link to="/" className="btn btn-ghost btn-sm" style={{ paddingLeft: 4, marginBottom: 10 }}><ChevronLeft size={17} /> Inicio</Link>

        <div className="buscar-head">
          <div>
            <h1 style={{ fontSize: 24 }}>Dealers verificados</h1>
            <p className="muted small" style={{ marginTop: 2 }}>
              {loading ? 'Cargando…' : <><strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> dealer{filtered.length === 1 ? '' : 'es'} {hasFilter ? 'con lo que buscas' : 'en el mapa'}{myCity ? ` · tu zona: ${myCity}` : ''}{userLoc ? ' · ordenados por cercanía' : ''}</>}
            </p>
          </div>
        </div>

        {/* Filter by the type of car the customer wants */}
        <div className="bodytype-row bodytype-row--compact" style={{ marginBottom: 12 }}>
          <button className={`bt-item ${!tipo ? 'active' : ''}`} onClick={() => setTipo('')}><span className="bt-label">Todos</span></button>
          {BODY_TYPES.map((b) => (
            <button key={b.type} className={`bt-item ${tipo === b.type ? 'active' : ''}`} onClick={() => setTipo(tipo === b.type ? '' : b.type)}>
              <img className="bt-image" src={b.image} alt="" aria-hidden="true" />
              <span className="bt-label">{b.label}</span>
            </button>
          ))}
        </div>
        <div className="row center wrap gap-8" style={{ marginBottom: 16 }}>
          <SlidersHorizontal size={16} className="muted" />
          <select className="select" value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} style={{ maxWidth: 160, height: 38 }}>
            <option value="">Precio desde</option>
            {PRICE_OPTIONS.filter((p) => !precioMax || p <= Number(precioMax)).map((p) => <option key={p} value={p}>{fmtRD(p)}</option>)}
          </select>
          <select className="select" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} style={{ maxWidth: 160, height: 38 }}>
            <option value="">Precio hasta</option>
            {PRICE_OPTIONS.filter((p) => !precioMin || p >= Number(precioMin)).map((p) => <option key={p} value={p}>{fmtRD(p)}</option>)}
          </select>
          <select className="select" value={anioMin} onChange={(e) => setAnioMin(e.target.value)} style={{ maxWidth: 130, height: 38 }}>
            <option value="">Año desde</option>
            {YEARS.filter((y) => !anioMax || y <= Number(anioMax)).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="select" value={anioMax} onChange={(e) => setAnioMax(e.target.value)} style={{ maxWidth: 130, height: 38 }}>
            <option value="">Año hasta</option>
            {YEARS.filter((y) => !anioMin || y >= Number(anioMin)).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="select" value={ciudad} onChange={(e) => setCiudad(e.target.value)} style={{ maxWidth: 180, height: 38 }}>
            <option value="">Toda ubicación</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={useMyLocation} disabled={locStatus === 'loading'}>
            {locStatus === 'loading' ? <Loader2 size={15} className="spin" /> : <LocateFixed size={15} />} {locStatus === 'ok' ? 'Ubicación activa' : 'Usar mi ubicación'}
          </button>
          {hasFilter && <button className="btn btn-outline btn-sm" onClick={clear}>Limpiar</button>}
          {(locStatus === 'denied' || locStatus === 'unsupported') && <span className="tiny muted">No pudimos obtener tu ubicación.</span>}
        </div>

        <div className="dealers-split">
          <div className="dealers-list">
            {loading ? (
              <div className="muted small" style={{ padding: 12 }}>Cargando dealers…</div>
            ) : filtered.length === 0 ? (
              <div className="card card-pad muted small" style={{ textAlign: 'center' }}>
                Ningún dealer tiene ese tipo de vehículo en ese rango. <button className="link-teal" onClick={clear}>Ver todos</button>
              </div>
            ) : filtered.map((d) => (
              <DealerRow key={d.id} d={d} active={d.id === selId} onSelect={() => setSelId(d.id)} onOpenCar={open} showMatches={hasFilter} userLoc={userLoc} />
            ))}
          </div>

          <div className="dealers-map-wrap">
            <DealersMap dealers={filtered} selId={selId} onSelect={setSelId} userLoc={userLoc} />
          </div>
        </div>
      </div>
    </main>
  )
}

function DealerRow({ d, active, onSelect, onOpenCar, showMatches, userLoc }) {
  const wa = String(d.whatsapp || d.phone || '').replace(/[^\d]/g, '')
  const cars = showMatches ? d.matches : d.vehicles
  const prices = d.vehicles.map((v) => v.price).filter(Boolean)
  const min = prices.length ? Math.min(...prices) : 0
  const max = prices.length ? Math.max(...prices) : 0
  const types = [...new Set(d.vehicles.map((v) => v.bodyType).filter(Boolean))]

  return (
    <article className={`dealer-row ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="row center gap-12">
        <div className="dealer-mark">{d.initials}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row center gap-6"><strong>{d.name}</strong>{d.verified && <BadgeCheck size={15} color="var(--teal-700)" />}</div>
          <div className="tiny muted row center gap-4" style={{ marginTop: 2 }}>
            <MapPin size={12} /> {d.city || 'RD'} · {d.vehicles.length} vehículo{d.vehicles.length === 1 ? '' : 's'}
            {showMatches ? ` · ${d.matches.length} coincidencia${d.matches.length === 1 ? '' : 's'}` : ''}
            {d.distanceKm != null ? ` · a ${d.distanceKm < 10 ? d.distanceKm.toFixed(1) : Math.round(d.distanceKm)} km` : ''}
          </div>
        </div>
        {prices.length > 0 && (
          <div className="tiny muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtRD(min)}{max !== min ? ` – ${fmtRD(max)}` : ''}</div>
        )}
      </div>

      {types.length > 0 && (
        <div className="row wrap gap-6" style={{ marginTop: 10 }}>
          {types.slice(0, 5).map((t) => <span key={t} className="chip" style={{ height: 24 }}>{TYPE_LABELS[t] || t}</span>)}
        </div>
      )}

      {active && cars.length > 0 && (
        <div className="dealer-cars">
          {cars.slice(0, 6).map((v) => (
            <button key={v.id} type="button" className="dealer-car" onClick={(e) => { e.stopPropagation(); onOpenCar(v) }}>
              <CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} photo={v.coverPhoto} label={`${v.make} ${v.model}`} />
              <div className="dealer-car-b">
                <span className="strong tiny">{v.make} {v.model}</span>
                <span className="tiny muted">{fmtRD(v.price)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="row wrap gap-8" style={{ marginTop: 12 }}>
        <Link to={`/dealers/${d.slug}`} className="btn btn-outline btn-sm" onClick={(e) => e.stopPropagation()}>Ver dealer <ChevronRight size={14} /></Link>
        {wa && (
          <a className="btn btn-sm" style={{ background: '#25D366', color: '#fff', border: 'none' }} href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            <MessageCircle size={14} /> WhatsApp
          </a>
        )}
        <a className="btn btn-outline btn-sm" href={directionsUrl(dealerCoords(d), userLoc)} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation(); onSelect() }}>
          <Navigation size={14} /> Cómo llegar
        </a>
      </div>
    </article>
  )
}
