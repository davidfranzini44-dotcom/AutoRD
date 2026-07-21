import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Scale, X, Trash2, Landmark, Gauge, BadgeCheck } from 'lucide-react'
import CarImage from '../components/CarImage'
import { fmtRD, listVehicles } from '../data/api'
import { carDefaultMonthly } from '../data/finance'
import { clearCompare, getCompareIds, removeCompare } from '../data/compare'

const ROWS = [
  ['Precio', (v) => fmtRD(v.price)],
  ['Cuota estimada', (v) => `${fmtRD(carDefaultMonthly(v))}/mes`],
  ['Ano', (v) => v.year],
  ['Kilometraje', (v) => (v.mileage === 0 ? '0 km' : `${Number(v.mileage || 0).toLocaleString('es-DO')} km`)],
  ['Condicion', (v) => v.certified ? 'Usado certificado' : v.condition],
  ['Version', (v) => v.trim || '-'],
  ['Transmision', (v) => v.transmission || '-'],
  ['Combustible', (v) => v.fuel || '-'],
  ['Motor', (v) => v.engine || '-'],
  ['Ubicacion', (v) => v.location || '-'],
  ['Dealer', (v) => v.dealer || '-'],
]

export default function Compare() {
  const [ids, setIds] = useState(() => getCompareIds())
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    listVehicles().then((vehicles) => {
      if (!alive) return
      setAll(vehicles)
      setLoading(false)
    }).catch(() => setLoading(false))
    const sync = () => setIds(getCompareIds())
    window.addEventListener('autord-compare', sync)
    return () => { alive = false; window.removeEventListener('autord-compare', sync) }
  }, [])

  const vehicles = useMemo(() => {
    const byId = new Map(all.map((v) => [v.id, v]))
    return ids.map((id) => byId.get(id)).filter(Boolean)
  }, [all, ids])

  const remove = (id) => {
    removeCompare(id)
    setIds(getCompareIds())
  }
  const clear = () => {
    clearCompare()
    setIds([])
  }

  if (loading) return <main className="page"><div className="container muted">Cargando comparador...</div></main>

  return (
    <main className="page compare-page">
      <div className="container">
        <div className="row between center wrap gap-12" style={{ marginBottom: 18 }}>
          <div>
            <div className="row center gap-8">
              <Scale size={24} color="var(--teal-700)" />
              <h1 style={{ fontSize: 26 }}>Comparar vehiculos</h1>
            </div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Compara hasta 4 opciones antes de solicitar financiamiento.</p>
          </div>
          <div className="row gap-8">
            {vehicles.length > 0 && <button className="btn btn-outline" onClick={clear}><Trash2 size={16} /> Limpiar</button>}
            <Link to="/buscar" className="btn btn-primary">Agregar vehiculos</Link>
          </div>
        </div>

        {vehicles.length < 2 ? (
          <div className="card card-pad compare-empty">
            <div className="verify-ic" style={{ margin: '0 auto 12px', color: 'var(--teal-700)', background: 'var(--teal-50)' }}><Scale size={24} /></div>
            <h2>Selecciona por lo menos 2 vehiculos</h2>
            <p className="muted small">Usa el boton Comparar en las tarjetas del marketplace. Puedes guardar hasta 4.</p>
            <Link to="/buscar" className="btn btn-primary" style={{ marginTop: 14 }}>Buscar vehiculos</Link>
          </div>
        ) : (
          <div className="compare-scroll">
            <div className="compare-grid" style={{ '--compare-cols': vehicles.length }}>
              {vehicles.map((v) => (
                <div className="compare-car" key={v.id}>
                  <button className="compare-remove" onClick={() => remove(v.id)} aria-label="Quitar de comparar"><X size={15} /></button>
                  <CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} photo={v.coverPhoto} label={`${v.make} ${v.model}`} />
                  <div className="compare-car-body">
                    <div className="row center gap-6">
                      <h2>{v.make} {v.model}</h2>
                      {v.certified && <BadgeCheck size={16} color="var(--teal-700)" />}
                    </div>
                    <div className="tiny muted">{[v.year, v.trim, v.location].filter(Boolean).join(' · ')}</div>
                    <div className="compare-price">{fmtRD(v.price)}</div>
                    <div className="chip chip-teal"><Landmark size={13} /> {fmtRD(carDefaultMonthly(v))}/mes estimado</div>
                  </div>
                </div>
              ))}

              {ROWS.map(([label, value]) => (
                <div className="compare-row" key={label}>
                  <div className="compare-label">{label}</div>
                  <div className="compare-values" style={{ '--compare-cols': vehicles.length }}>
                    {vehicles.map((v) => <div className="compare-cell" key={`${v.id}-${label}`}>{value(v)}</div>)}
                  </div>
                </div>
              ))}

              <div className="compare-row">
                <div className="compare-label">Acciones</div>
                <div className="compare-values" style={{ '--compare-cols': vehicles.length }}>
                  {vehicles.map((v) => (
                    <div className="compare-cell" key={`${v.id}-actions`}>
                      <Link to={`/vehiculo/${v.id}`} className="btn btn-outline btn-sm btn-block">Ver ficha</Link>
                      <Link to={`/financiamiento?vehiculo=${v.id}`} className="btn btn-primary btn-sm btn-block" style={{ marginTop: 8 }}>
                        <Gauge size={14} /> Financiar
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
