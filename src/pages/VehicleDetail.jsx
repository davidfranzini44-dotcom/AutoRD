import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Heart, Share2, MapPin, BadgeCheck, Gauge, Cog, Fuel, Palette,
  Calculator, Info, Check, ChevronRight, ShieldCheck,
} from 'lucide-react'
import CarImage from '../components/CarImage'
import { getVehicleBySlug, listVehicles, fmtRD } from '../data/api'

export default function VehicleDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [v, setV] = useState(undefined)
  const [similar, setSimilar] = useState([])
  const [active, setActive] = useState(0)
  const [fav, setFav] = useState(false)

  useEffect(() => {
    let alive = true
    setV(undefined)
    getVehicleBySlug(id).then((data) => { if (alive) setV(data) })
    listVehicles().then((all) => { if (alive) setSimilar(all.filter((x) => x.id !== id).slice(0, 4)) })
    return () => { alive = false }
  }, [id])

  if (v === undefined) {
    return <main className="page"><div className="container muted">Cargando vehículo…</div></main>
  }
  if (!v) {
    return (
      <main className="page"><div className="container">
        <p>Vehículo no encontrado. <Link to="/" className="link-teal">Volver al inicio</Link></p>
      </div></main>
    )
  }
  const specs = [
    { ic: Gauge, l: 'Kilometraje', v: v.mileage === 0 ? '0 km (nuevo)' : v.mileage.toLocaleString('es-DO') + ' km' },
    { ic: Cog, l: 'Transmisión', v: v.transmission },
    { ic: Fuel, l: 'Combustible', v: v.fuel },
    { ic: Palette, l: 'Color', v: v.color },
  ]

  return (
    <main className="page">
      <div className="container">
        <button className="btn btn-ghost btn-sm" onClick={() => nav(-1)} style={{ marginBottom: 14, paddingLeft: 4 }}>
          <ChevronLeft size={18} /> Volver
        </button>

        <div className="split">
          {/* Left: gallery + info */}
          <div className="col gap-16">
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ position: 'relative' }}>
                <CarImage tone={v.tone} className="tall" label={`${v.make} ${v.model}`} />
                <div className="row gap-8" style={{ position: 'absolute', top: 12, right: 12 }}>
                  <button className="fav-btn" style={{ position: 'static' }} aria-label="Compartir"><Share2 size={16} /></button>
                  <button className={`fav-btn ${fav ? 'active' : ''}`} style={{ position: 'static' }} onClick={() => setFav(!fav)} aria-label="Guardar"><Heart size={16} /></button>
                </div>
                <span style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(12,32,51,.8)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
                  {active + 1} / {v.photos}
                </span>
              </div>
              <div className="row gap-8" style={{ padding: 12, overflowX: 'auto' }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <button key={i} onClick={() => setActive(i)}
                    className="gallery-thumb"
                    style={{ width: 92, flex: 'none', outline: active === i ? '2px solid var(--teal-700)' : 'none' }}>
                    <CarImage tone={v.tone} />
                  </button>
                ))}
              </div>
            </div>

            <div className="card card-pad">
              <div className="row between center wrap gap-8">
                <div>
                  <h1 style={{ fontSize: 24 }}>{v.make} {v.model} {v.year}</h1>
                  <div className="vspecs" style={{ fontSize: 14, marginTop: 4 }}>{v.trim} · {v.transmission} · {v.fuel} · {v.mileage === 0 ? 'Nuevo' : v.mileage.toLocaleString('es-DO') + ' km'}</div>
                </div>
                <span className={`chip ${v.condition === 'Nuevo' ? 'chip-navy' : 'chip-teal'}`} style={{ height: 28 }}>{v.condition}</span>
              </div>
              <div className="vloc" style={{ fontSize: 14, marginTop: 10 }}><MapPin size={15} /> {v.location}</div>

              <div className="spec-grid" style={{ marginTop: 16 }}>
                {specs.map((s) => {
                  const Icon = s.ic
                  return (
                    <div className="spec-item" key={s.l}>
                      <Icon size={20} className="si-ic" />
                      <div><div className="si-l">{s.l}</div><div className="si-v">{s.v}</div></div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card card-pad">
              <h3 style={{ marginBottom: 8 }}>Descripción</h3>
              <p className="small" style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}>{v.description}</p>
              <h3 style={{ margin: '16px 0 10px', fontSize: 15 }}>Equipamiento</h3>
              <div className="grid grid-3" style={{ gap: 8 }}>
                {v.features.map((f) => (
                  <div key={f} className="row center gap-8 small"><Check size={15} color="var(--teal-700)" strokeWidth={2.5} /> {f}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: price + financing */}
          <aside className="side-panel col gap-16">
            <div className="card card-pad">
              <div className="tiny muted">Precio de venta</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', margin: '2px 0 2px' }}>{fmtRD(v.price)}</div>
              <div className="row center gap-6 tiny muted"><MapPin size={13} /> {v.location}</div>

              <div className="est-card" style={{ marginTop: 16 }}>
                <div className="row between center">
                  <div>
                    <div className="tiny" style={{ color: 'var(--teal-800)', fontWeight: 600 }}>Desde</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--teal-800)' }}>{fmtRD(v.monthly)}<span style={{ fontSize: 14 }}>/mes</span></div>
                    <div className="tiny" style={{ color: 'var(--teal-800)' }}>A {v.termYears} años · Tasa desde {v.apr}%</div>
                  </div>
                  <div className="est-ic" style={{ color: 'var(--teal-700)' }}><Calculator size={30} /></div>
                </div>
              </div>

              <Link to={`/financiamiento?vehiculo=${v.id}`} className="btn btn-primary btn-block btn-lg" style={{ marginTop: 14 }}>
                Solicitar financiamiento
              </Link>
              <button className="btn btn-outline btn-block" style={{ marginTop: 8 }}>Ver cálculo de cuota</button>

              <div className="notice" style={{ marginTop: 14 }}>
                <Info size={16} />
                <span>Los bancos evalúan y responden. AutoRD no realiza consulta crediticia ni aprueba préstamos.</span>
              </div>
            </div>

            {/* Dealer card */}
            <div className="card card-pad">
              <div className="small strong" style={{ marginBottom: 10 }}>Concesionario</div>
              <div className="row center gap-12">
                <div className="avatar" style={{ width: 44, height: 44, background: 'var(--navy-800)' }}>
                  {v.dealer.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </div>
                <div className="grow">
                  <div className="row center gap-6">
                    <span className="strong">{v.dealer}</span>
                    {v.dealerVerified && <BadgeCheck size={16} color="var(--teal-700)" />}
                  </div>
                  <div className="tiny muted">{v.dealerVerified ? 'Concesionario verificado' : 'Vendedor particular'}</div>
                </div>
                <Link to="/ingresar" className="link-teal">Contactar <ChevronRight size={14} /></Link>
              </div>
            </div>
          </aside>
        </div>

        {/* Similar */}
        <div style={{ marginTop: 28 }}>
          <div className="section-title"><h2>Vehículos similares</h2></div>
          <div className="grid grid-4">
            {similar.map((s) => <SimilarCard key={s.id} v={s} />)}
          </div>
        </div>
      </div>

      {/* Sticky mobile CTA */}
      <div className="sticky-cta">
        <div className="grow">
          <div className="tiny muted">Desde</div>
          <div className="strong" style={{ fontSize: 16, color: 'var(--teal-800)' }}>{fmtRD(v.monthly)}/mes</div>
        </div>
        <Link to={`/financiamiento?vehiculo=${v.id}`} className="btn btn-primary" style={{ flex: 1.4 }}>Solicitar financiamiento</Link>
      </div>
    </main>
  )
}

function SimilarCard({ v }) {
  return (
    <Link to={`/vehiculo/${v.id}`} className="vcard" style={{ display: 'block' }}>
      <CarImage tone={v.tone} label={`${v.make} ${v.model}`} />
      <div className="vcard-body">
        <div className="vtitle" style={{ fontSize: 14.5 }}>{v.make} {v.model}</div>
        <div className="vspecs">{v.year} · {v.mileage === 0 ? 'Nuevo' : v.mileage.toLocaleString('es-DO') + ' km'}</div>
        <div className="vprice" style={{ fontSize: 17 }}>{fmtRD(v.price)}</div>
      </div>
    </Link>
  )
}
