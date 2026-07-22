import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Scale, X, Trash2, Landmark, Gauge, BadgeCheck, Check, Sparkles, Trophy } from 'lucide-react'
import CarImage from '../components/CarImage'
import { listVehicles } from '../data/api'
import { fmtMoney } from '../data/demo'
import { carDefaultMonthly } from '../data/finance'
import { clearCompare, getCompareIds, removeCompare } from '../data/compare'
import { mileageLabel } from '../data/vehicleLabels'

// dir: 'low' = smaller wins, 'high' = bigger wins; money rows only score when currencies match.
const ROWS = [
  { label: 'Precio', value: (v) => fmtMoney(v.price, v.currency), metric: (v) => Number(v.price) || 0, dir: 'low', money: true },
  { label: 'Cuota estimada', value: (v) => `${fmtMoney(carDefaultMonthly(v), v.currency)}/mes`, metric: (v) => carDefaultMonthly(v), dir: 'low', money: true },
  { label: 'Año', value: (v) => v.year, metric: (v) => Number(v.year) || 0, dir: 'high' },
  { label: 'Kilometraje', value: (v) => mileageLabel(v, { newText: '0 km' }), metric: (v) => Number(v.mileage) || 0, dir: 'low' },
  { label: 'Condición', value: (v) => (v.certified ? 'Usado certificado' : v.condition), metric: (v) => (v.condition === 'Nuevo' ? 2 : v.certified ? 1 : 0), dir: 'high' },
  { label: 'Versión', value: (v) => v.trim || '—' },
  { label: 'Transmisión', value: (v) => v.transmission || '—' },
  { label: 'Combustible', value: (v) => v.fuel || '—' },
  { label: 'Motor', value: (v) => v.engine || '—' },
  { label: 'Ubicación', value: (v) => v.location || '—' },
  { label: 'Dealer', value: (v) => v.dealer || '—' },
]

// Returns the set of vehicle indices that win a given row (empty if not comparable / all equal).
function winnersFor(row, vehicles, sameCurrency) {
  if (!row.dir) return new Set()
  if (row.money && !sameCurrency) return new Set()
  const metrics = vehicles.map(row.metric)
  if (metrics.every((m) => m === metrics[0])) return new Set()
  const best = row.dir === 'low' ? Math.min(...metrics) : Math.max(...metrics)
  const s = new Set()
  metrics.forEach((m, i) => { if (m === best) s.add(i) })
  return s
}

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

  // Scoring: per-row winners, per-vehicle win counts, and the overall best.
  const scoring = useMemo(() => {
    if (vehicles.length < 2) return null
    const sameCurrency = vehicles.every((v) => v.currency === vehicles[0].currency)
    const rowWinners = ROWS.map((row) => winnersFor(row, vehicles, sameCurrency))
    const winCounts = vehicles.map((_, i) => rowWinners.reduce((n, w) => n + (w.has(i) ? 1 : 0), 0))
    const decided = rowWinners.filter((w) => w.size > 0).length
    const maxWins = Math.max(...winCounts, 0)
    const leaders = winCounts.reduce((acc, c, i) => (c === maxWins ? [...acc, i] : acc), [])
    const bestIdx = maxWins > 0 && leaders.length === 1 ? leaders[0] : -1
    return { sameCurrency, rowWinners, winCounts, decided, maxWins, bestIdx }
  }, [vehicles])

  const remove = (id) => { removeCompare(id); setIds(getCompareIds()) }
  const clear = () => { clearCompare(); setIds([]) }

  if (loading) return <main className="page"><div className="container muted">Cargando comparador...</div></main>

  return (
    <main className="page compare-page">
      <div className="container">
        <div className="row between center wrap gap-12" style={{ marginBottom: 18 }}>
          <div>
            <div className="row center gap-8">
              <Scale size={24} color="var(--teal-700)" />
              <h1 style={{ fontSize: 26 }}>Comparar vehículos</h1>
            </div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Compara hasta 4 opciones antes de solicitar financiamiento.</p>
          </div>
          <div className="row gap-8">
            {vehicles.length > 0 && <button className="btn btn-outline" onClick={clear}><Trash2 size={16} /> Limpiar</button>}
            <Link to="/buscar" className="btn btn-primary">Agregar vehículos</Link>
          </div>
        </div>

        {vehicles.length < 2 ? (
          <div className="card card-pad compare-empty">
            <div className="verify-ic" style={{ margin: '0 auto 12px', color: 'var(--teal-700)', background: 'var(--teal-50)' }}><Scale size={24} /></div>
            <h2>Selecciona por lo menos 2 vehículos</h2>
            <p className="muted small">Usa el botón Comparar en las tarjetas del marketplace. Puedes guardar hasta 4.</p>
            <Link to="/buscar" className="btn btn-primary" style={{ marginTop: 14 }}>Buscar vehículos</Link>
          </div>
        ) : (
          <>
            {/* Análisis rápido — highlights + per-car strengths */}
            {scoring && (
              <div className="card card-pad" style={{ marginBottom: 16 }}>
                <div className="row center gap-8" style={{ marginBottom: 10 }}>
                  <Sparkles size={16} color="var(--teal-700)" />
                  <div className="strong">Análisis rápido</div>
                </div>
                {scoring.bestIdx >= 0 ? (
                  <p className="small" style={{ margin: '0 0 4px' }}>
                    <strong>{vehicles[scoring.bestIdx].make} {vehicles[scoring.bestIdx].model}</strong> tiene la mejor valoración general:
                    gana en <strong>{scoring.winCounts[scoring.bestIdx]}</strong> de {scoring.decided} categorías comparables.
                  </p>
                ) : (
                  <p className="small" style={{ margin: '0 0 4px' }}>Empate técnico — cada vehículo destaca en distintas categorías.</p>
                )}
                {!scoring.sameCurrency && (
                  <p className="tiny muted" style={{ margin: '0 0 6px' }}>Precio y cuota no se comparan porque están en monedas distintas (RD$ / US$).</p>
                )}
                <div className="grid" style={{ gridTemplateColumns: `repeat(${vehicles.length}, minmax(0,1fr))`, gap: 10, marginTop: 8 }}>
                  {vehicles.map((v, i) => {
                    const strengths = ROWS.filter((row, ri) => scoring.rowWinners[ri].has(i)).map((row) => row.label)
                    const best = i === scoring.bestIdx
                    return (
                      <div key={v.id} className="card" style={{ padding: 12, border: best ? '1.5px solid var(--teal-600, #0d9488)' : '1px solid var(--line-2, #e2e8f0)' }}>
                        <div className="row between center gap-6">
                          <div className="strong small" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.make} {v.model}</div>
                          {best && <span className="chip chip-teal" style={{ flex: 'none' }}><Trophy size={12} /> Recomendado</span>}
                        </div>
                        <div className="tiny muted" style={{ marginTop: 6 }}>
                          {strengths.length ? <>Gana en: <span style={{ color: 'var(--teal-700)' }}>{strengths.join(', ')}</span></> : 'Sin ventajas destacadas'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="compare-scroll">
              <div className="compare-grid" style={{ '--compare-cols': vehicles.length }}>
                {vehicles.map((v, i) => (
                  <div className="compare-car" key={v.id}>
                    <button className="compare-remove" onClick={() => remove(v.id)} aria-label="Quitar de comparar"><X size={15} /></button>
                    {scoring && i === scoring.bestIdx && (
                      <span className="chip chip-teal" style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}><Trophy size={12} /> Recomendado</span>
                    )}
                    <CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} photo={v.coverPhoto} label={`${v.make} ${v.model}`} />
                    <div className="compare-car-body">
                      <div className="row center gap-6">
                        <h2>{v.make} {v.model}</h2>
                        {v.certified && <BadgeCheck size={16} color="var(--teal-700)" />}
                      </div>
                      <div className="tiny muted">{[v.year, v.trim, v.location].filter(Boolean).join(' · ')}</div>
                      <div className="compare-price">{fmtMoney(v.price, v.currency)}</div>
                      <div className="chip chip-teal"><Landmark size={13} /> {fmtMoney(carDefaultMonthly(v), v.currency)}/mes estimado</div>
                    </div>
                  </div>
                ))}

                {ROWS.map((row, ri) => (
                  <div className="compare-row" key={row.label}>
                    <div className="compare-label">{row.label}</div>
                    <div className="compare-values" style={{ '--compare-cols': vehicles.length }}>
                      {vehicles.map((v, i) => {
                        const win = scoring?.rowWinners[ri].has(i)
                        return (
                          <div className="compare-cell" key={`${v.id}-${row.label}`} style={win ? { color: 'var(--teal-700)', fontWeight: 700 } : undefined}>
                            {win && <Check size={14} style={{ verticalAlign: -2, marginRight: 2 }} />}{row.value(v)}
                          </div>
                        )
                      })}
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
          </>
        )}
      </div>
    </main>
  )
}
