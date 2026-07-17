import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, BadgeCheck, ChevronLeft, SlidersHorizontal } from 'lucide-react'
import CarImage from '../components/CarImage'
import DealersMap from '../components/DealersMap'
import { listDealers } from '../data/api'
import { BODY_TYPES, TYPE_LABELS } from '../data/bodyTypes'
import { fmtRD } from '../data/demo'
import { useFicha } from '../context/FichaContext'

const PRICE_OPTIONS = [900000, 1300000, 1800000, 2450000, 3500000]
const YEAR_OPTIONS = [2024, 2022, 2020, 2018, 2015]

export default function Dealers() {
  const [dealers, setDealers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState('')
  const [precioMax, setPrecioMax] = useState('')
  const [anioMin, setAnioMin] = useState('')
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

  const hasFilter = !!(tipo || precioMax || anioMin)
  const filtered = useMemo(() => {
    return dealers.map((d) => ({
      ...d,
      matches: d.vehicles.filter((v) =>
        (!tipo || v.bodyType === tipo) &&
        (!precioMax || v.price <= Number(precioMax)) &&
        (!anioMin || v.year >= Number(anioMin))),
    })).filter((d) => (hasFilter ? d.matches.length > 0 : true))
  }, [dealers, tipo, precioMax, anioMin, hasFilter])

  const clear = () => { setTipo(''); setPrecioMax(''); setAnioMin('') }

  return (
    <main className="page">
      <div className="container">
        <Link to="/" className="btn btn-ghost btn-sm" style={{ paddingLeft: 4, marginBottom: 10 }}><ChevronLeft size={17} /> Inicio</Link>

        <div className="buscar-head">
          <div>
            <h1 style={{ fontSize: 24 }}>Dealers verificados</h1>
            <p className="muted small" style={{ marginTop: 2 }}>
              {loading ? 'Cargando…' : <><strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> dealer{filtered.length === 1 ? '' : 'es'} {hasFilter ? 'con lo que buscas' : 'en el mapa'}</>}
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
        <div className="row center gap-8" style={{ marginBottom: 16 }}>
          <SlidersHorizontal size={16} className="muted" />
          <select className="select" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} style={{ maxWidth: 200, height: 38 }}>
            <option value="">Cualquier precio</option>
            {PRICE_OPTIONS.map((p) => <option key={p} value={p}>Hasta {fmtRD(p)}</option>)}
          </select>
          <select className="select" value={anioMin} onChange={(e) => setAnioMin(e.target.value)} style={{ maxWidth: 150, height: 38 }}>
            <option value="">Cualquier año</option>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>Desde {y}</option>)}
          </select>
          {hasFilter && <button className="btn btn-outline btn-sm" onClick={clear}>Limpiar</button>}
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
              <DealerRow key={d.id} d={d} active={d.id === selId} onSelect={() => setSelId(d.id)} onOpenCar={open} showMatches={hasFilter} />
            ))}
          </div>

          <div className="dealers-map-wrap">
            <DealersMap dealers={filtered} selId={selId} onSelect={setSelId} />
          </div>
        </div>
      </div>
    </main>
  )
}

function DealerRow({ d, active, onSelect, onOpenCar, showMatches }) {
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
              <CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} label={`${v.make} ${v.model}`} />
              <div className="dealer-car-b">
                <span className="strong tiny">{v.make} {v.model}</span>
                <span className="tiny muted">{fmtRD(v.price)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </article>
  )
}
