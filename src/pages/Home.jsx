import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, ShieldCheck, Landmark, Clock, FileCheck, Lock, ChevronRight,
  MonitorSmartphone, SlidersHorizontal, X, RotateCcw,
} from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import { listVehicles } from '../data/api'
import { banks } from '../data/demo'

const CHIPS = [
  { id: 'todos', label: 'Todos' },
  { id: 'nuevos', label: 'Nuevos' },
  { id: 'cert', label: 'Usados certificados' },
  { id: 'fin', label: 'Financiamiento disponible' },
]
const EMPTY = { marca: '', tipo: '', anioMin: '', precioMax: '', ubicacion: '', transmision: '', combustible: '', condicion: '' }

export default function Home() {
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [chip, setChip] = useState('todos')
  const [sort, setSort] = useState('relevancia')
  const [f, setF] = useState(EMPTY)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    let alive = true
    listVehicles({ tab: 'todos' })
      .then((d) => { if (alive) setAll(d) })
      .catch(() => { if (alive) setAll([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const opts = useMemo(() => ({
    marcas: [...new Set(all.map((v) => v.make))].sort(),
    tipos: [...new Set(all.map((v) => v.bodyType))].sort(),
    ubicaciones: [...new Set(all.map((v) => v.location))].sort(),
  }), [all])

  const list = useMemo(() => {
    let r = all.filter((v) => {
      if (chip === 'nuevos' && v.condition !== 'Nuevo') return false
      if (chip === 'cert' && !v.certified) return false
      if (chip === 'fin' && !v.financing) return false
      if (f.marca && v.make !== f.marca) return false
      if (f.tipo && v.bodyType !== f.tipo) return false
      if (f.anioMin && v.year < Number(f.anioMin)) return false
      if (f.precioMax && v.price > Number(f.precioMax)) return false
      if (f.ubicacion && v.location !== f.ubicacion) return false
      if (f.transmision && v.transmission !== f.transmision) return false
      if (f.combustible && v.fuel !== f.combustible) return false
      if (f.condicion === 'nuevo' && v.condition !== 'Nuevo') return false
      if (f.condicion === 'usado' && v.condition !== 'Usado') return false
      if (f.condicion === 'cert' && !v.certified) return false
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
  }, [all, chip, f, q, sort])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const activeCount = Object.values(f).filter(Boolean).length + (chip !== 'todos' ? 1 : 0)

  return (
    <main className="page">
      <div className="container">
        <section className="hero" style={{ minHeight: 210, marginBottom: 20 }}>
          <div className="hero-media" style={{ background: 'radial-gradient(circle at 78% 30%, rgba(255,255,255,.16), transparent 60%)' }} />
          <div className="hero-inner" style={{ padding: '26px 32px' }}>
            <h1 style={{ fontSize: 30 }}>Compra tu vehículo con financiamiento real</h1>
            <p className="lead">Encuentra tu carro, verifica tu identidad y recibe ofertas de varios bancos en un solo lugar.</p>
            <div className="hero-trust">
              <div className="t"><MonitorSmartphone size={18} /> 100% Online</div>
              <div className="t"><Landmark size={18} /> Respuesta de bancos</div>
              <div className="t"><ShieldCheck size={18} /> Seguridad y transparencia</div>
            </div>
          </div>
        </section>

        {/* Search bar */}
        <div className="mk-search">
          <div className="mk-search-input">
            <Search size={18} className="muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por marca, modelo o año…" />
            {q && <button onClick={() => setQ('')} aria-label="Limpiar"><X size={16} /></button>}
          </div>
          <button className="btn btn-outline mk-filter-toggle" onClick={() => setShowFilters(true)}>
            <SlidersHorizontal size={16} /> Filtros{activeCount ? ` (${activeCount})` : ''}
          </button>
        </div>

        <div className="mk-layout">
          {/* Filters */}
          <aside className={`mk-filters ${showFilters ? 'open' : ''}`}>
            <div className="mk-filters-head">
              <span className="strong">Filtros</span>
              <div className="row center gap-8">
                {activeCount > 0 && <button className="link-teal" onClick={() => { setF(EMPTY); setChip('todos') }}><RotateCcw size={13} /> Limpiar</button>}
                <button className="icon-btn show-mobile" onClick={() => setShowFilters(false)} aria-label="Cerrar"><X size={20} /></button>
              </div>
            </div>
            <FField label="Marca"><select className="select" value={f.marca} onChange={set('marca')}><option value="">Todas</option>{opts.marcas.map((m) => <option key={m}>{m}</option>)}</select></FField>
            <FField label="Tipo"><select className="select" value={f.tipo} onChange={set('tipo')}><option value="">Todos</option>{opts.tipos.map((m) => <option key={m}>{m}</option>)}</select></FField>
            <FField label="Ubicación"><select className="select" value={f.ubicacion} onChange={set('ubicacion')}><option value="">Todas</option>{opts.ubicaciones.map((m) => <option key={m}>{m}</option>)}</select></FField>
            <FField label="Año desde"><select className="select" value={f.anioMin} onChange={set('anioMin')}><option value="">Cualquiera</option>{[2024, 2022, 2020, 2018, 2015].map((y) => <option key={y} value={y}>{y}</option>)}</select></FField>
            <FField label="Precio máximo"><select className="select" value={f.precioMax} onChange={set('precioMax')}><option value="">Sin límite</option><option value="900000">RD$ 900,000</option><option value="1300000">RD$ 1,300,000</option><option value="1800000">RD$ 1,800,000</option><option value="2500000">RD$ 2,500,000</option></select></FField>
            <FField label="Transmisión"><select className="select" value={f.transmision} onChange={set('transmision')}><option value="">Todas</option><option>Automática</option><option>Manual</option></select></FField>
            <FField label="Combustible"><select className="select" value={f.combustible} onChange={set('combustible')}><option value="">Todos</option><option>Gasolina</option><option>Diésel</option><option>Híbrido</option><option>Eléctrico</option></select></FField>
            <FField label="Condición"><select className="select" value={f.condicion} onChange={set('condicion')}><option value="">Todas</option><option value="nuevo">Nuevo</option><option value="usado">Usado</option><option value="cert">Certificado</option></select></FField>
            <button className="btn btn-primary btn-block show-mobile" style={{ marginTop: 6 }} onClick={() => setShowFilters(false)}>Ver {list.length} resultados</button>
          </aside>
          {showFilters && <div className="mk-scrim" onClick={() => setShowFilters(false)} />}

          {/* Results */}
          <div>
            <div className="row between center wrap gap-8" style={{ marginBottom: 14 }}>
              <div className="small muted"><strong style={{ color: 'var(--ink)' }}>{loading ? '…' : list.length}</strong> vehículo{list.length === 1 ? '' : 's'} {activeCount ? (list.length === 1 ? 'encontrado' : 'encontrados') : (list.length === 1 ? 'disponible' : 'disponibles')}</div>
              <label className="row center gap-8 small muted">
                Ordenar:
                <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} style={{ height: 34, width: 168 }}>
                  <option value="relevancia">Más relevantes</option>
                  <option value="menor">Menor precio</option>
                  <option value="mayor">Mayor precio</option>
                  <option value="nuevo">Año más reciente</option>
                </select>
              </label>
            </div>

            <div className="row gap-8 wrap" style={{ marginBottom: 16 }}>
              {CHIPS.map((c) => (
                <button key={c.id}
                  className={`chip ${chip === c.id ? 'chip-teal' : ''}`}
                  style={{ height: 32, cursor: 'pointer', border: chip === c.id ? undefined : '1px solid var(--line)', background: chip === c.id ? undefined : '#fff' }}
                  onClick={() => setChip(c.id)}>{c.label}</button>
              ))}
            </div>

            {loading ? (
              <div className="grid mk-grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="vcard" style={{ height: 300, background: 'var(--surface-2)' }} />)}</div>
            ) : list.length === 0 ? (
              <div className="card card-pad" style={{ textAlign: 'center', padding: 40 }}>
                <div className="strong" style={{ marginBottom: 6 }}>Sin resultados</div>
                <p className="muted small" style={{ marginBottom: 14 }}>Prueba ampliando los filtros o cambiando la búsqueda.</p>
                <button className="btn btn-outline" onClick={() => { setF(EMPTY); setChip('todos'); setQ('') }}>Limpiar todo</button>
              </div>
            ) : (
              <div className="grid mk-grid">{list.map((v) => <VehicleCard key={v.id} v={v} />)}</div>
            )}

            <div className="trust-strip" style={{ marginTop: 26 }}>
              <Trust icon={FileCheck} lbl="Financiamiento real" sub="con múltiples bancos" />
              <Trust icon={Clock} lbl="Respuesta rápida" sub="en minutos" />
              <Trust icon={MonitorSmartphone} lbl="100% online" sub="sin filas, sin papeleo" />
              <Trust icon={Lock} lbl="Tus datos protegidos" sub="KYC seguro" />
            </div>

            <div className="fin-banner" style={{ marginTop: 20 }}>
              <div className="shield"><ShieldCheck size={28} color="#9fe0d4" /></div>
              <div>
                <h3>Financiamiento seguro, rápido y transparente</h3>
                <p>Nuestro proceso 100% digital te conecta con los mejores bancos de la República Dominicana.</p>
              </div>
              <div className="banks-row">
                {banks.map((b) => <span key={b.id} className="bank-logo">{b.name}</span>)}
                <Link to="/como-funciona" className="link-teal" style={{ color: '#bfe7e0' }}>Cómo funciona <ChevronRight size={14} /></Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function FField({ label, children }) {
  return <div className="field" style={{ marginBottom: 12 }}><label>{label}</label>{children}</div>
}
function Trust({ icon: Icon, lbl, sub }) {
  return (
    <div className="t">
      <div className="trust-ic"><Icon size={19} /></div>
      <div><div className="lbl">{lbl}</div><div className="sub">{sub}</div></div>
    </div>
  )
}
