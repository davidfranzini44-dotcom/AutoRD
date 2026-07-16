import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, LayoutGrid, Car, Truck, CheckCircle2, ChevronRight, ArrowRight,
  IdCard, ScanFace, ShieldCheck, Building2, FileCheck2, Lock, Landmark, Clock,
  BadgeCheck, CircleDollarSign, Users, MonitorSmartphone, Percent, Zap,
} from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import CarImage from '../components/CarImage'
import { listVehicles } from '../data/api'
import { banks } from '../data/demo'

const CHIPS = [
  { id: 'todos', label: 'Todos', icon: LayoutGrid },
  { id: 'SUV', label: 'SUV', icon: Car },
  { id: 'Sedán', label: 'Sedán', icon: Car },
  { id: 'Pickup', label: 'Pickup', icon: Truck },
  { id: 'fin', label: 'Financiamiento disponible', icon: CheckCircle2 },
]
const STEPS = [
  { n: 1, icon: IdCard, t: 'Verificar identidad', d: 'Cédula' },
  { n: 2, icon: ScanFace, t: 'Prueba de vida', d: 'Validamos que eres tú' },
  { n: 3, icon: ShieldCheck, t: 'Consentimiento', d: 'Autorizas la consulta a burós y bancos' },
  { n: 4, icon: Building2, t: 'Enviar a bancos', d: 'Compartimos tu perfil con bancos aliados' },
  { n: 5, icon: FileCheck2, t: 'Recibir ofertas', d: 'Compara y elige la mejor opción' },
]
const FEATURES = [
  { icon: BadgeCheck, t: 'Transparencia total', d: 'Sin letras pequeñas' },
  { icon: CircleDollarSign, t: 'Sin pago inicial oculto', d: 'Información clara desde el inicio' },
  { icon: Users, t: 'Acompañamiento', d: 'Te ayudamos en cada paso' },
  { icon: MonitorSmartphone, t: '100% online', d: 'Desde donde estés' },
]
const BOTTOM_TRUST = [
  { icon: ShieldCheck, t: 'Financiamiento real', d: 'Ofertas de bancos regulados en la República Dominicana.' },
  { icon: Percent, t: 'Mejores tasas', d: 'Compara opciones y elige la que más te convenga.' },
  { icon: Zap, t: 'Aprobación más rápida', d: 'Respuestas en minutos, no en días.' },
  { icon: Lock, t: 'Tus datos seguros', d: 'Cumplimos con los más altos estándares de seguridad.' },
]

export default function Home() {
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [precioMax, setPrecioMax] = useState('')
  const [anioMin, setAnioMin] = useState('')
  const [tab, setTab] = useState('buscar')

  useEffect(() => {
    let alive = true
    listVehicles({ tab: 'todos' })
      .then((d) => { if (alive) setAll(d) })
      .catch(() => { if (alive) setAll([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const list = useMemo(() => all.filter((v) => {
    if (tipo === 'SUV' || tipo === 'Sedán' || tipo === 'Pickup') { if (v.bodyType !== tipo) return false }
    if (tipo === 'fin' && !v.financing) return false
    if (precioMax && v.price > Number(precioMax)) return false
    if (anioMin && v.year < Number(anioMin)) return false
    if (q.trim()) {
      const s = `${v.make} ${v.model} ${v.year} ${v.trim || ''}`.toLowerCase()
      if (!s.includes(q.trim().toLowerCase())) return false
    }
    return true
  }), [all, tipo, precioMax, anioMin, q])

  return (
    <main className="page">
      <div className="container">
        <div className="home-layout">
          {/* ---------------- LEFT: marketplace ---------------- */}
          <div>
            <section className="hero2">
              <div className="hero2-photo"><CarImage make="Toyota" model="RAV4" bodyType="SUV" seed="hero" label="Vehículo" /></div>
              <div className="hero2-text">
                <h1>Compra tu vehículo<br />con financiamiento real</h1>
                <p>Encuentra tu próximo vehículo y obtén ofertas de los mejores bancos de la República Dominicana.</p>
              </div>
            </section>

            <div className="search-panel">
              <div className="sp-tabs">
                <button className={`sp-tab ${tab === 'buscar' ? 'active' : ''}`} onClick={() => setTab('buscar')}><Search size={15} /> Buscar vehículos</button>
                <button className={`sp-tab ${tab === 'fin' ? 'active' : ''}`} onClick={() => setTab('fin')}><Landmark size={15} /> Financiamiento</button>
              </div>
              <div className="sp-fields">
                <div className="sp-search"><Search size={17} className="muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por marca, modelo o año" /></div>
                <select className="select" value={tipo === 'fin' ? 'todos' : tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="todos">Todos</option><option value="SUV">SUV</option><option value="Sedán">Sedán</option><option value="Pickup">Pickup</option>
                </select>
                <select className="select" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)}>
                  <option value="">Precio máx.</option><option value="900000">RD$ 900,000</option><option value="1300000">RD$ 1,300,000</option><option value="1800000">RD$ 1,800,000</option><option value="2500000">RD$ 2,500,000</option>
                </select>
                <select className="select" value={anioMin} onChange={(e) => setAnioMin(e.target.value)}>
                  <option value="">Año mín.</option><option value="2024">2024</option><option value="2022">2022</option><option value="2020">2020</option><option value="2018">2018</option>
                </select>
                <button className="btn btn-navy sp-btn"><Search size={17} /> Buscar</button>
              </div>
            </div>

            <div className="chips-row">
              {CHIPS.map((c) => {
                const Icon = c.icon
                const on = tipo === c.id
                return (
                  <button key={c.id} className={`cat-chip ${on ? 'on' : ''} ${c.id === 'fin' ? 'fin' : ''}`} onClick={() => setTipo(c.id)}>
                    <Icon size={16} /> {c.label}
                  </button>
                )
              })}
            </div>

            <div className="section-title" style={{ marginTop: 22 }}>
              <h2>Vehículos destacados</h2>
              <Link to="/buscar" className="link-teal">Ver todos <ArrowRight size={15} /></Link>
            </div>

            {loading ? (
              <div className="grid grid-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="vcard" style={{ height: 340, background: 'var(--surface-2)' }} />)}</div>
            ) : list.length === 0 ? (
              <div className="card card-pad muted" style={{ textAlign: 'center' }}>Sin resultados. <button className="link-teal" onClick={() => { setQ(''); setTipo('todos'); setPrecioMax(''); setAnioMin('') }}>Limpiar filtros</button></div>
            ) : (
              <div className="grid grid-3">{list.map((v) => <VehicleCard key={v.id} v={v} />)}</div>
            )}

            <div className="bottom-trust">
              {BOTTOM_TRUST.map((t) => {
                const Icon = t.icon
                return (
                  <div className="bt-item" key={t.t}>
                    <div className="bt-ic"><Icon size={18} /></div>
                    <div><div className="bt-t">{t.t}</div><div className="bt-d">{t.d}</div></div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ---------------- RIGHT: customer financing ---------------- */}
          <aside className="col gap-16" style={{ minWidth: 0 }}>
            <div className="card card-pad fin-panel">
              <h2 style={{ fontSize: 20 }}>Tu camino al financiamiento</h2>
              <p className="muted small" style={{ marginTop: 4, marginBottom: 16 }}>Un proceso 100% digital, seguro y confiable.</p>
              <div className="fin-steps">
                {STEPS.map((s) => {
                  const Icon = s.icon
                  return (
                    <div className="fin-step" key={s.n}>
                      <div className="fin-step-ic"><Icon size={18} /></div>
                      <div className="fin-step-body">
                        <div className="fin-step-t"><span className="fin-step-n">{s.n}</span> {s.t}</div>
                        <div className="fin-step-d">{s.d}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="fin-trust">
                <div className="ft"><div className="ft-ic"><Lock size={16} /></div><div><div className="ft-t">KYC seguro</div><div className="ft-d">Tus datos protegidos</div></div></div>
                <div className="ft"><div className="ft-ic"><Landmark size={16} /></div><div><div className="ft-t">Bancos aliados</div><div className="ft-d">Entidades reguladas</div></div></div>
                <div className="ft"><div className="ft-ic"><Clock size={16} /></div><div><div className="ft-t">Respuesta rápida</div><div className="ft-d">Ofertas en minutos</div></div></div>
              </div>

              <Link to="/financiamiento" className="btn btn-navy btn-block btn-lg" style={{ marginTop: 16 }}>Solicitar financiamiento</Link>
              <div className="row center gap-6" style={{ justifyContent: 'center', marginTop: 10 }}>
                <Lock size={13} className="muted" /><span className="tiny muted">Es gratis y no afecta tu historial de crédito</span>
              </div>
            </div>

            <div className="card card-pad">
              <div className="row between center" style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: 15 }}>Bancos aliados</h3>
                <Link to="/como-funciona" className="link-teal">Ver todos <ArrowRight size={14} /></Link>
              </div>
              <div className="banks-grid">
                {banks.map((b) => (
                  <div className="bank-chip" key={b.id}>
                    <span className="bank-mark" style={{ width: 26, height: 26, fontSize: 10, background: b.color }}>{b.initials}</span>
                    <span className="bank-name">{b.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card card-pad">
              <div className="features-grid">
                {FEATURES.map((f) => {
                  const Icon = f.icon
                  return (
                    <div className="feat" key={f.t}>
                      <div className="feat-ic"><Icon size={18} /></div>
                      <div className="feat-t">{f.t}</div>
                      <div className="feat-d">{f.d}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
