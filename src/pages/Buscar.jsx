import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, X, ChevronLeft } from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import BrandLogo from '../components/BrandLogo'
import { listVehicles } from '../data/api'
import { fmtRD } from '../data/demo'
import { BODY_TYPES, TYPE_LABELS } from '../data/bodyTypes'

const PRICE_OPTIONS = [900000, 1300000, 1800000, 2450000, 3500000]
const YEAR_OPTIONS = [2024, 2022, 2020, 2018, 2015]

export default function Buscar() {
  const [params, setParams] = useSearchParams()
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)

  const marca = params.get('marca') || ''
  const tipo = params.get('tipo') || ''
  const ubicacion = params.get('ubicacion') || ''
  const precioMax = params.get('precioMax') || ''
  const anioMin = params.get('anioMin') || ''
  const q = params.get('q') || ''
  const sort = params.get('sort') || 'relevancia'

  const setParam = (k, v) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    if (v) p.set(k, v); else p.delete(k)
    return p
  }, { replace: true })

  useEffect(() => {
    let alive = true
    listVehicles({ tab: 'todos' })
      .then((d) => { if (alive) setAll(d) })
      .catch(() => { if (alive) setAll([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const options = useMemo(() => {
    const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es-DO'))
    return {
      makes: uniq(all.map((v) => v.make)),
      types: uniq(all.map((v) => v.bodyType)),
      locations: uniq(all.map((v) => v.location)),
    }
  }, [all])

  const list = useMemo(() => {
    let r = all.filter((v) => {
      if (marca && v.make !== marca) return false
      if (tipo && v.bodyType !== tipo) return false
      if (ubicacion && v.location !== ubicacion) return false
      if (precioMax && v.price > Number(precioMax)) return false
      if (anioMin && v.year < Number(anioMin)) return false
      if (q.trim()) {
        const s = `${v.make} ${v.model} ${v.year} ${v.trim || ''}`.toLowerCase()
        if (!s.includes(q.trim().toLowerCase())) return false
      }
      return true
    })
    r = [...r].sort((a, b) => {
      if (sort === 'menor') return a.price - b.price
      if (sort === 'mayor') return b.price - a.price
      if (sort === 'nuevo') return b.year - a.year
      return 0
    })
    return r
  }, [all, marca, tipo, ubicacion, precioMax, anioMin, q, sort])

  const activeCount = [marca, tipo, ubicacion, precioMax, anioMin, q].filter(Boolean).length
  const clearAll = () => setParams({}, { replace: true })
  const title = marca || (tipo ? (TYPE_LABELS[tipo] || tipo) : 'Todos los vehículos')

  return (
    <main className="page">
      <div className="container">
        <Link to="/" className="btn btn-ghost btn-sm" style={{ paddingLeft: 4, marginBottom: 10 }}><ChevronLeft size={17} /> Inicio</Link>

        <div className="buscar-head">
          <div className="row center gap-12" style={{ minWidth: 0 }}>
            {marca && <span className="buscar-brand"><BrandLogo make={marca} size={34} /></span>}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 24 }}>{title}</h1>
              <p className="muted small" style={{ marginTop: 2 }}>
                {loading ? 'Cargando…' : <><strong style={{ color: 'var(--ink)' }}>{list.length}</strong> vehículo{list.length === 1 ? '' : 's'} {activeCount ? 'encontrados' : 'disponibles'}</>}
              </p>
            </div>
          </div>
          <label className="row center gap-8 small muted">
            Ordenar:
            <select className="select" value={sort} onChange={(e) => setParam('sort', e.target.value === 'relevancia' ? '' : e.target.value)} style={{ height: 38, width: 170 }}>
              <option value="relevancia">Más relevantes</option>
              <option value="menor">Menor precio</option>
              <option value="mayor">Mayor precio</option>
              <option value="nuevo">Año más reciente</option>
            </select>
          </label>
        </div>

        {/* Brand picker */}
        <div className="brand-chips">
          <button className={`brand-chip ${!marca ? 'active' : ''}`} onClick={() => setParam('marca', '')}>
            <span className="brand-chip-all">Todas</span>
          </button>
          {options.makes.map((m) => (
            <button key={m} className={`brand-chip ${marca === m ? 'active' : ''}`} onClick={() => setParam('marca', marca === m ? '' : m)}>
              <BrandLogo make={m} size={22} />
              <span>{m}</span>
            </button>
          ))}
        </div>

        {/* Body-type tabs */}
        <div className="bodytype-row bodytype-row--compact" style={{ marginBottom: 14 }}>
          {BODY_TYPES.map((b) => (
            <button
              key={b.type}
              className={`bt-item ${tipo === b.type ? 'active' : ''}`}
              onClick={() => setParam('tipo', tipo === b.type ? '' : b.type)}
            >
              <img className="bt-image" src={b.image} alt="" aria-hidden="true" />
              <span className="bt-label">{b.label}</span>
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="buscar-filters card">
          <div className="bf-search">
            <Search size={17} className="muted" />
            <input value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Buscar marca, modelo o año…" />
            {q && <button onClick={() => setParam('q', '')} aria-label="Limpiar"><X size={15} /></button>}
          </div>
          <select className="select" value={tipo} onChange={(e) => setParam('tipo', e.target.value)}>
            <option value="">Todos los tipos</option>
            {options.types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select" value={anioMin} onChange={(e) => setParam('anioMin', e.target.value)}>
            <option value="">Año desde</option>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="select" value={precioMax} onChange={(e) => setParam('precioMax', e.target.value)}>
            <option value="">Precio máx.</option>
            {PRICE_OPTIONS.map((p) => <option key={p} value={p}>{fmtRD(p)}</option>)}
          </select>
          <select className="select" value={ubicacion} onChange={(e) => setParam('ubicacion', e.target.value)}>
            <option value="">Toda ubicación</option>
            {options.locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {activeCount > 0 && <button className="btn btn-outline btn-sm bf-clear" onClick={clearAll}><X size={15} /> Limpiar</button>}
        </div>

        {/* Results */}
        {loading ? (
          <div className="grid grid-4" style={{ marginTop: 18 }}>{Array.from({ length: 8 }).map((_, i) => <div key={i} className="vcard" style={{ height: 320, background: 'var(--surface-2)' }} />)}</div>
        ) : list.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: 'center', marginTop: 18, padding: 44 }}>
            <SlidersHorizontal size={26} className="muted" style={{ margin: '0 auto 10px' }} />
            <h2 style={{ marginBottom: 6 }}>Sin resultados</h2>
            <p className="muted small" style={{ marginBottom: 16 }}>No encontramos vehículos con estos filtros. Prueba ampliándolos.</p>
            <button className="btn btn-primary" onClick={clearAll}>Ver todos los vehículos</button>
          </div>
        ) : (
          <div className="grid grid-4" style={{ marginTop: 18 }}>{list.map((v) => <VehicleCard key={v.id} v={v} />)}</div>
        )}
      </div>
    </main>
  )
}
