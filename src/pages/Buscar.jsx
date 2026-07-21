import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Search, SlidersHorizontal, X, ChevronLeft,
  Calculator, BadgeCheck, ShieldCheck, Landmark, Gauge, Bell, CheckCircle2,
  MapPin, Crosshair, Loader2,
} from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import BrandLogo from '../components/BrandLogo'
import { listVehicles } from '../data/api'
import { fmtRD } from '../data/demo'
import { carDefaultMonthly } from '../data/finance'
import { haversineKm, nearestCity } from '../data/geo'
import { BODY_TYPES, TYPE_LABELS } from '../data/bodyTypes'
import { isSearchSaved, saveSearchAlert } from '../data/savedSearches'

const PRICE_OPTIONS = [500000, 900000, 1300000, 1800000, 2450000, 3500000, 5000000]
const PAYMENT_OPTIONS = [20000, 35000, 50000, 75000, 100000, 150000]
const KM_OPTIONS = [10000, 25000, 50000, 75000, 100000, 150000]
const YEARS = Array.from({ length: 2026 - 2010 + 1 }, (_, i) => 2026 - i)

const CONDITION_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'certified', label: 'Usado certificado' },
  { value: 'usado', label: 'Usado' },
]

const FEATURE_OPTIONS = [
  { id: 'camara', label: 'Cámara reversa', terms: ['camara de retroceso', 'cámara de retroceso', 'camara reversa'] },
  { id: 'sunroof', label: 'Sunroof', terms: ['sunroof', 'techo panoramico', 'techo panorámico'] },
  { id: 'piel', label: 'Asientos en piel', terms: ['cuero', 'piel', 'leather'] },
  { id: 'pantalla', label: 'Pantalla / CarPlay', terms: ['pantalla', 'carplay', 'android auto', 'multimedia'] },
  { id: 'keyless', label: 'Llave inteligente', terms: ['keyless', 'llave inteligente', 'arranque por boton', 'arranque por botón'] },
  { id: 'tres-filas', label: '3 filas', terms: ['3 filas', 'tercera fila'] },
  { id: '4x4', label: '4x4', terms: ['4x4'] },
]

const SORT_OPTIONS = [
  { value: 'relevancia', label: 'Más relevantes' },
  { value: 'menor', label: 'Menor precio' },
  { value: 'mayor', label: 'Mayor precio' },
  { value: 'nuevo', label: 'Año más reciente' },
  { value: 'cuota', label: 'Menor cuota' },
  { value: 'km', label: 'Menor kilometraje' },
  { value: 'cerca', label: 'Más cerca de mí' },
]

const normalize = (value) =>
  String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const num = (value) => Number(value) || 0
const kmLabel = (value) => `${Number(value).toLocaleString('es-DO')} km`

// Same amortized "Desde /mes" used on the car page + ficha, so cuota sort/filter agree.
function monthlyFor(v) {
  return carDefaultMonthly(v)
}

function vehicleText(v) {
  return normalize([
    v.make, v.model, v.year, v.trim, v.transmission, v.fuel, v.engine,
    v.drivetrain, v.color, v.bodyType, v.dealer, v.location, v.description,
    ...(v.features || []),
  ].join(' '))
}

function hasFeature(v, featureId) {
  const feature = FEATURE_OPTIONS.find((item) => item.id === featureId)
  if (!feature) return true
  const text = vehicleText(v)
  return feature.terms.some((term) => text.includes(normalize(term)))
}

export default function Buscar() {
  const [params, setParams] = useSearchParams()
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')
  // "Near me" filter: capture the buyer's location once (kept for the session).
  const [userLoc, setUserLoc] = useState(() => { try { return JSON.parse(sessionStorage.getItem('autord_userloc') || 'null') } catch { return null } })
  const [geoBusy, setGeoBusy] = useState(false)

  const marca = params.get('marca') || ''
  const modelo = params.get('modelo') || ''
  const tipo = params.get('tipo') || ''
  const ubicacion = params.get('ubicacion') || ''
  const precioMin = params.get('precioMin') || ''
  const precioMax = params.get('precioMax') || ''
  const cuotaMax = params.get('cuotaMax') || ''
  const distKm = params.get('distKm') || ''
  const anioMin = params.get('anioMin') || ''
  const anioMax = params.get('anioMax') || ''
  const kmMax = params.get('kmMax') || ''
  const condicion = params.get('condicion') || ''
  const transmision = params.get('transmision') || ''
  const combustible = params.get('combustible') || ''
  const traccion = params.get('traccion') || ''
  const color = params.get('color') || ''
  const financiamiento = params.get('financiamiento') || ''
  const dealerVerificado = params.get('dealerVerificado') || ''
  const q = params.get('q') || ''
  const sort = params.get('sort') || 'relevancia'
  const selectedFeatures = (params.get('features') || '').split(',').filter(Boolean)

  const setParam = (key, value) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    if (value) next.set(key, value)
    else next.delete(key)
    return next
  }, { replace: true })

  const setMarca = (value) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    if (value) next.set('marca', value)
    else next.delete('marca')
    next.delete('modelo')
    return next
  }, { replace: true })

  const toggleFeature = (featureId) => {
    const next = selectedFeatures.includes(featureId)
      ? selectedFeatures.filter((id) => id !== featureId)
      : [...selectedFeatures, featureId]
    setParam('features', next.join(','))
  }

  const askLocation = () => {
    if (!navigator.geolocation) return
    setGeoBusy(true)
    navigator.geolocation.getCurrentPosition((pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setUserLoc(loc)
      try { sessionStorage.setItem('autord_userloc', JSON.stringify(loc)) } catch { /* private mode */ }
      setGeoBusy(false)
      if (!distKm) setParam('distKm', '25') // sensible default radius once located
    }, () => setGeoBusy(false), { enableHighAccuracy: true, timeout: 10000 })
  }

  useEffect(() => {
    let alive = true
    listVehicles({ tab: 'todos' })
      .then((data) => { if (alive) setAll(data) })
      .catch(() => { if (alive) setAll([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const options = useMemo(() => {
    const uniq = (items) => [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es-DO'))
    return {
      makes: uniq(all.map((v) => v.make)),
      models: uniq(all.filter((v) => !marca || v.make === marca).map((v) => v.model)),
      types: uniq(all.map((v) => v.bodyType)),
      locations: uniq(all.map((v) => v.location)),
      transmissions: uniq(all.map((v) => v.transmission)),
      fuels: uniq(all.map((v) => v.fuel)),
      drivetrains: uniq(all.map((v) => v.drivetrain)),
      colors: uniq(all.map((v) => v.color)),
    }
  }, [all, marca])

  const list = useMemo(() => {
    let results = all.filter((v) => {
      if (marca && v.make !== marca) return false
      if (modelo && v.model !== modelo) return false
      if (tipo && v.bodyType !== tipo) return false
      if (ubicacion && v.location !== ubicacion) return false
      if (precioMin && v.price < num(precioMin)) return false
      if (precioMax && v.price > num(precioMax)) return false
      if (cuotaMax && monthlyFor(v) > num(cuotaMax)) return false
      if (distKm && userLoc) {
        if (v.lat == null || v.lng == null) return false
        const d = haversineKm(userLoc, { lat: Number(v.lat), lng: Number(v.lng) })
        if (d == null || d > num(distKm)) return false
      }
      if (anioMin && v.year < num(anioMin)) return false
      if (anioMax && v.year > num(anioMax)) return false
      if (kmMax && Number(v.mileage || 0) > num(kmMax)) return false
      if (transmision && v.transmission !== transmision) return false
      if (combustible && v.fuel !== combustible) return false
      if (traccion && v.drivetrain !== traccion) return false
      if (color && v.color !== color) return false
      if (financiamiento === 'si' && !v.financing) return false
      if (dealerVerificado === 'si' && !v.dealerVerified) return false
      if (condicion === 'nuevo' && !(v.condition === 'Nuevo' || v.mileage === 0)) return false
      if (condicion === 'certified' && !v.certified) return false
      if (condicion === 'usado' && (v.condition !== 'Usado' || v.certified)) return false
      if (selectedFeatures.length && !selectedFeatures.every((featureId) => hasFeature(v, featureId))) return false
      if (q.trim() && !vehicleText(v).includes(normalize(q.trim()))) return false
      return true
    })

    results = [...results].sort((a, b) => {
      if (sort === 'menor') return a.price - b.price
      if (sort === 'mayor') return b.price - a.price
      if (sort === 'nuevo') return b.year - a.year
      if (sort === 'cuota') return monthlyFor(a) - monthlyFor(b)
      if (sort === 'km') return Number(a.mileage || 0) - Number(b.mileage || 0)
      if (sort === 'cerca' && userLoc) {
        const dOf = (v) => (v.lat == null || v.lng == null) ? Infinity : (haversineKm(userLoc, { lat: Number(v.lat), lng: Number(v.lng) }) ?? Infinity)
        return dOf(a) - dOf(b)
      }
      return 0
    })
    return results
  }, [
    all, marca, modelo, tipo, ubicacion, precioMin, precioMax, cuotaMax, distKm, userLoc,
    anioMin, anioMax, kmMax, condicion, transmision, combustible, traccion,
    color, financiamiento, dealerVerificado, selectedFeatures, q, sort,
  ])

  const title = modelo
    ? `${marca ? `${marca} ` : ''}${modelo}`
    : marca || (tipo ? (TYPE_LABELS[tipo] || tipo) : 'Todos los vehículos')

  const activeFilters = [
    q && { key: 'q', label: `"${q}"`, clear: () => setParam('q', '') },
    marca && { key: 'marca', label: marca, clear: () => setMarca('') },
    modelo && { key: 'modelo', label: modelo, clear: () => setParam('modelo', '') },
    tipo && { key: 'tipo', label: TYPE_LABELS[tipo] || tipo, clear: () => setParam('tipo', '') },
    ubicacion && { key: 'ubicacion', label: ubicacion, clear: () => setParam('ubicacion', '') },
    condicion && { key: 'condicion', label: CONDITION_OPTIONS.find((item) => item.value === condicion)?.label, clear: () => setParam('condicion', '') },
    precioMin && { key: 'precioMin', label: `Desde ${fmtRD(precioMin)}`, clear: () => setParam('precioMin', '') },
    precioMax && { key: 'precioMax', label: `Hasta ${fmtRD(precioMax)}`, clear: () => setParam('precioMax', '') },
    cuotaMax && { key: 'cuotaMax', label: `Cuota hasta ${fmtRD(cuotaMax)}`, clear: () => setParam('cuotaMax', '') },
    distKm && userLoc && { key: 'distKm', label: `A ${distKm} km o menos`, clear: () => setParam('distKm', '') },
    anioMin && { key: 'anioMin', label: `Año desde ${anioMin}`, clear: () => setParam('anioMin', '') },
    anioMax && { key: 'anioMax', label: `Año hasta ${anioMax}`, clear: () => setParam('anioMax', '') },
    kmMax && { key: 'kmMax', label: `Hasta ${kmLabel(kmMax)}`, clear: () => setParam('kmMax', '') },
    transmision && { key: 'transmision', label: transmision, clear: () => setParam('transmision', '') },
    combustible && { key: 'combustible', label: combustible, clear: () => setParam('combustible', '') },
    traccion && { key: 'traccion', label: traccion, clear: () => setParam('traccion', '') },
    color && { key: 'color', label: color, clear: () => setParam('color', '') },
    financiamiento && { key: 'financiamiento', label: 'Financiamiento disponible', clear: () => setParam('financiamiento', '') },
    dealerVerificado && { key: 'dealerVerificado', label: 'Dealer verificado', clear: () => setParam('dealerVerificado', '') },
    ...selectedFeatures.map((featureId) => ({
      key: `feature-${featureId}`,
      label: FEATURE_OPTIONS.find((item) => item.id === featureId)?.label || featureId,
      clear: () => toggleFeature(featureId),
    })),
  ].filter(Boolean)

  const activeCount = activeFilters.length
  const clearAll = () => setParams({}, { replace: true })
  const bestMonthly = list.length ? Math.min(...list.map(monthlyFor)) : 0
  const avgPrice = list.length ? Math.round(list.reduce((sum, v) => sum + Number(v.price || 0), 0) / list.length) : 0
  const currentQuery = params.toString()
  const alertSaved = activeCount > 0 && isSearchSaved(currentQuery)
  const saveCurrentSearch = () => {
    if (!activeCount) return
    const res = saveSearchAlert({
      title,
      query: currentQuery,
      count: list.length,
      filters: activeFilters.map((item) => item.label),
    })
    setAlertMsg(res.existing ? 'Alerta actualizada' : 'Alerta guardada')
    window.setTimeout(() => setAlertMsg(''), 2200)
  }

  const filterPanel = (
    <div className="buscar-filter-panel">
      <div className="buscar-filter-head">
        <div>
          <span className="section-kicker"><SlidersHorizontal size={14} /> Filtros</span>
          <h2>Búsqueda avanzada</h2>
        </div>
        <button className="btn btn-ghost btn-sm filter-mobile-close" type="button" onClick={() => setFiltersOpen(false)}>
          <X size={16} /> Cerrar
        </button>
      </div>

      <div className="filter-group">
        <label className="filter-label">Buscar</label>
        <div className="bf-search advanced-search-input">
          <Search size={17} className="muted" />
          <input value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Marca, modelo, versión..." />
          {q && <button type="button" onClick={() => setParam('q', '')} aria-label="Limpiar búsqueda"><X size={15} /></button>}
        </div>
      </div>

      <div className="filter-group">
        <label className="filter-label">Condición</label>
        <div className="filter-segmented">
          {CONDITION_OPTIONS.map((item) => (
            <button
              type="button"
              key={item.value || 'todos'}
              className={condicion === item.value ? 'active' : ''}
              onClick={() => setParam('condicion', item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-group-title">
          <MapPin size={16} />
          <span>Cerca de mí</span>
        </div>
        <button type="button" className="btn btn-outline btn-block btn-sm" onClick={askLocation} disabled={geoBusy}>
          {geoBusy ? <Loader2 size={14} className="spin" /> : <Crosshair size={14} />}
          {userLoc ? `Ubicación activa${nearestCity(userLoc) ? ` · ${nearestCity(userLoc)}` : ''}` : 'Usar mi ubicación'}
        </button>
        <select className="select" style={{ marginTop: 8 }} value={distKm} onChange={(e) => setParam('distKm', e.target.value)} disabled={!userLoc}>
          <option value="">Cualquier distancia</option>
          <option value="5">Hasta 5 km</option>
          <option value="10">Hasta 10 km</option>
          <option value="25">Hasta 25 km</option>
          <option value="50">Hasta 50 km</option>
          <option value="100">Hasta 100 km</option>
        </select>
        {!userLoc && <span className="help">Activa tu ubicación para filtrar y ordenar por distancia.</span>}
      </div>

      <div className="filter-group finance-filter-group">
        <div className="filter-group-title">
          <Calculator size={16} />
          <span>Buscar por cuota</span>
        </div>
        <select className="select" value={cuotaMax} onChange={(e) => setParam('cuotaMax', e.target.value)}>
          <option value="">Cualquier cuota</option>
          {PAYMENT_OPTIONS.map((p) => <option key={p} value={p}>Hasta {fmtRD(p)}/mes</option>)}
        </select>
        <div className="quick-payment-grid">
          {PAYMENT_OPTIONS.slice(0, 4).map((p) => (
            <button
              type="button"
              key={p}
              className={cuotaMax === String(p) ? 'active' : ''}
              onClick={() => setParam('cuotaMax', cuotaMax === String(p) ? '' : String(p))}
            >
              {fmtRD(p)}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ marginTop: 8 }}
          inputMode="numeric"
          placeholder="Otra cuota máx. (RD$/mes)"
          value={cuotaMax ? Number(cuotaMax).toLocaleString('es-DO') : ''}
          onChange={(e) => setParam('cuotaMax', e.target.value.replace(/[^0-9]/g, ''))}
        />
        <button
          type="button"
          className={`filter-check ${financiamiento === 'si' ? 'active' : ''}`}
          onClick={() => setParam('financiamiento', financiamiento === 'si' ? '' : 'si')}
        >
          <Landmark size={15} /> Financiamiento disponible
        </button>
      </div>

      <div className="filter-group">
        <label className="filter-label">Precio</label>
        <div className="filter-grid-2">
          <select className="select" value={precioMin} onChange={(e) => setParam('precioMin', e.target.value)}>
            <option value="">Desde</option>
            {PRICE_OPTIONS.filter((p) => !precioMax || p <= num(precioMax)).map((p) => <option key={p} value={p}>{fmtRD(p)}</option>)}
          </select>
          <select className="select" value={precioMax} onChange={(e) => setParam('precioMax', e.target.value)}>
            <option value="">Hasta</option>
            {PRICE_OPTIONS.filter((p) => !precioMin || p >= num(precioMin)).map((p) => <option key={p} value={p}>{fmtRD(p)}</option>)}
          </select>
        </div>
      </div>

      <div className="filter-group">
        <label className="filter-label">Año y kilometraje</label>
        <div className="filter-grid-2">
          <select className="select" value={anioMin} onChange={(e) => setParam('anioMin', e.target.value)}>
            <option value="">Año desde</option>
            {YEARS.filter((year) => !anioMax || year <= num(anioMax)).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <select className="select" value={anioMax} onChange={(e) => setParam('anioMax', e.target.value)}>
            <option value="">Año hasta</option>
            {YEARS.filter((year) => !anioMin || year >= num(anioMin)).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <select className="select" value={kmMax} onChange={(e) => setParam('kmMax', e.target.value)}>
          <option value="">Cualquier kilometraje</option>
          {KM_OPTIONS.map((km) => <option key={km} value={km}>Hasta {kmLabel(km)}</option>)}
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">Marca, modelo y tipo</label>
        <select className="select" value={marca} onChange={(e) => setMarca(e.target.value)}>
          <option value="">Todas las marcas</option>
          {options.makes.map((make) => <option key={make} value={make}>{make}</option>)}
        </select>
        <select className="select" value={modelo} onChange={(e) => setParam('modelo', e.target.value)}>
          <option value="">Todos los modelos</option>
          {options.models.map((model) => <option key={model} value={model}>{model}</option>)}
        </select>
        <select className="select" value={tipo} onChange={(e) => setParam('tipo', e.target.value)}>
          <option value="">Todos los tipos</option>
          {options.types.map((bodyType) => <option key={bodyType} value={bodyType}>{TYPE_LABELS[bodyType] || bodyType}</option>)}
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">Especificaciones</label>
        <select className="select" value={transmision} onChange={(e) => setParam('transmision', e.target.value)}>
          <option value="">Cualquier transmisión</option>
          {options.transmissions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="select" value={combustible} onChange={(e) => setParam('combustible', e.target.value)}>
          <option value="">Cualquier combustible</option>
          {options.fuels.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="select" value={traccion} onChange={(e) => setParam('traccion', e.target.value)}>
          <option value="">Cualquier tracción</option>
          {options.drivetrains.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="select" value={color} onChange={(e) => setParam('color', e.target.value)}>
          <option value="">Cualquier color</option>
          {options.colors.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">Ubicación y confianza</label>
        <select className="select" value={ubicacion} onChange={(e) => setParam('ubicacion', e.target.value)}>
          <option value="">Toda ubicación</option>
          {options.locations.map((location) => <option key={location} value={location}>{location}</option>)}
        </select>
        <button
          type="button"
          className={`filter-check ${dealerVerificado === 'si' ? 'active' : ''}`}
          onClick={() => setParam('dealerVerificado', dealerVerificado === 'si' ? '' : 'si')}
        >
          <ShieldCheck size={15} /> Dealer verificado
        </button>
      </div>

      <div className="filter-group">
        <label className="filter-label">Equipamiento</label>
        <div className="feature-pill-grid">
          {FEATURE_OPTIONS.map((feature) => (
            <button
              type="button"
              key={feature.id}
              className={selectedFeatures.includes(feature.id) ? 'active' : ''}
              onClick={() => toggleFeature(feature.id)}
            >
              {feature.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-actions">
        <button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
          {loading ? 'Ver resultados' : `Ver ${list.length} resultados`}
        </button>
        {activeCount > 0 && <button type="button" className="btn btn-outline" onClick={clearAll}>Limpiar filtros</button>}
      </div>
    </div>
  )

  return (
    <main className="page buscar-page">
      <div className="container">
        <Link to="/" className="btn btn-ghost btn-sm" style={{ paddingLeft: 4, marginBottom: 10 }}><ChevronLeft size={17} /> Inicio</Link>

        <div className="buscar-head">
          <div className="buscar-head-main">
            {marca && <span className="buscar-brand"><BrandLogo make={marca} size={34} /></span>}
            <div style={{ minWidth: 0 }}>
              <h1>{title}</h1>
              <p>
                {loading ? 'Cargando...' : <><strong>{list.length}</strong> vehículo{list.length === 1 ? '' : 's'} {activeCount ? 'encontrados' : 'disponibles'}</>}
              </p>
            </div>
          </div>
          <div className="buscar-head-actions">
            <button
              type="button"
              className={`btn ${alertSaved ? 'btn-navy' : 'btn-outline'} buscar-save-alert`}
              disabled={!activeCount}
              onClick={saveCurrentSearch}
              title={!activeCount ? 'Aplica filtros antes de guardar una alerta' : undefined}
            >
              {alertSaved ? <CheckCircle2 size={16} /> : <Bell size={16} />}
              {alertSaved ? 'Alerta guardada' : 'Guardar alerta'}
            </button>
            <button
              type="button"
              className="btn btn-outline buscar-filter-toggle"
              onClick={() => setFiltersOpen(true)}
              aria-expanded={filtersOpen}
              aria-controls="advanced-search-filters"
            >
              <SlidersHorizontal size={16} /> Filtros
              {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
            </button>
            <label className="sort-control">
              Ordenar:
              <select className="select" value={sort} onChange={(e) => setParam('sort', e.target.value === 'relevancia' ? '' : e.target.value)}>
                {SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {alertMsg && (
          <div className="saved-alert-toast">
            <CheckCircle2 size={16} />
            <span>{alertMsg}</span>
            <Link to="/alertas">Ver alertas</Link>
          </div>
        )}

        {filtersOpen && <button type="button" className="buscar-filter-scrim" aria-label="Cerrar filtros" onClick={() => setFiltersOpen(false)} />}

        <div className="buscar-layout">
          <aside className={`buscar-sidebar ${filtersOpen ? 'open' : ''}`} id="advanced-search-filters">
            {filterPanel}
          </aside>

          <section className="buscar-results" aria-label="Resultados de vehículos">
            <div className="brand-chips buscar-brand-strip">
              <button className={`brand-chip ${!marca ? 'active' : ''}`} type="button" onClick={() => setMarca('')}>
                <span className="brand-chip-all">Todas</span>
              </button>
              {options.makes.map((make) => (
                <button key={make} type="button" className={`brand-chip ${marca === make ? 'active' : ''}`} onClick={() => setMarca(marca === make ? '' : make)}>
                  <BrandLogo make={make} size={22} />
                  <span>{make}</span>
                </button>
              ))}
            </div>

            <div className="bodytype-row bodytype-row--compact buscar-type-strip">
              {BODY_TYPES.map((bodyType) => (
                <button
                  type="button"
                  key={bodyType.type}
                  className={`bt-item ${tipo === bodyType.type ? 'active' : ''}`}
                  onClick={() => setParam('tipo', tipo === bodyType.type ? '' : bodyType.type)}
                >
                  <img className="bt-image" src={bodyType.image} alt="" aria-hidden="true" />
                  <span className="bt-label">{bodyType.label}</span>
                </button>
              ))}
            </div>

            <div className="buscar-insights">
              <div><BadgeCheck size={16} /><span>{list.filter((v) => v.certified).length} certificados</span></div>
              <div><Landmark size={16} /><span>{list.filter((v) => v.financing).length} con financiamiento</span></div>
              <div><Gauge size={16} /><span>{bestMonthly ? `Desde ${fmtRD(bestMonthly)}/mes` : 'Sin cuota estimada'}</span></div>
            </div>

            {activeCount > 0 && (
              <div className="active-filter-row" aria-label="Filtros activos">
                {activeFilters.map((item) => (
                  <button type="button" key={item.key} className="active-filter-chip" onClick={item.clear}>
                    {item.label} <X size={13} />
                  </button>
                ))}
                <button type="button" className="active-filter-clear" onClick={clearAll}>Limpiar todo</button>
              </div>
            )}

            <div className="results-toolbar">
              <span>{loading ? 'Cargando inventario...' : `Precio promedio ${avgPrice ? fmtRD(avgPrice) : 'N/D'}`}</span>
              {cuotaMax ? <span>Filtrando por cuota máxima de {fmtRD(cuotaMax)}/mes</span> : <span>Compra por precio o por cuota</span>}
            </div>

            {loading ? (
              <div className="grid grid-4 buscar-grid">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="vcard" style={{ height: 320, background: 'var(--surface-2)' }} />)}</div>
            ) : list.length === 0 ? (
              <div className="empty-search card card-pad">
                <SlidersHorizontal size={26} className="muted" />
                <h2>Sin resultados</h2>
                <p>Prueba ampliando precio, año, cuota o kilometraje.</p>
                <button className="btn btn-primary" type="button" onClick={clearAll}>Ver todos los vehículos</button>
              </div>
            ) : (
              <div className="grid grid-4 buscar-grid">{list.map((v) => <VehicleCard key={v.id} v={v} />)}</div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
