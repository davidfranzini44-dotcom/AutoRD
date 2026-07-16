import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Car, BadgeCheck, ShieldCheck, Building2, Landmark, Clock,
  FileCheck, Lock, ChevronRight, Check, MonitorSmartphone,
} from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import StatusChip from '../components/StatusChip'
import { listVehicles } from '../data/api'
import {
  banks, fmtRD, dealerLeads, bankApplications, bankStatusMeta,
} from '../data/demo'

const TABS = [
  { id: 'todos', label: 'Todos los vehículos', icon: Car },
  { id: 'nuevos', label: 'Nuevos', icon: BadgeCheck },
  { id: 'cert', label: 'Usados certificados', icon: ShieldCheck },
  { id: 'fin', label: 'Financiamiento disponible', icon: Landmark },
]

export default function Home() {
  const [tab, setTab] = useState('todos')
  const [sort, setSort] = useState('relevancia')
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    listVehicles({ tab })
      .then((data) => { if (alive) setVehicles(data) })
      .catch(() => { if (alive) setVehicles([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tab])

  const list = [...vehicles].sort((a, b) => {
    if (sort === 'menor') return a.price - b.price
    if (sort === 'mayor') return b.price - a.price
    return 0
  })

  return (
    <main className="page">
      <div className="container">
        <div className="home-layout">
          {/* ---------------- Main column ---------------- */}
          <div>
            <section className="hero">
              <div className="hero-media" style={{ background: 'radial-gradient(circle at 75% 30%, rgba(255,255,255,.18), transparent 60%)' }} />
              <div className="hero-inner">
                <h1>Compra tu vehículo<br />con financiamiento real</h1>
                <p className="lead">Encuentra tu carro, verifica tu identidad y recibe ofertas de varios bancos en un solo lugar.</p>
                <div className="hero-trust">
                  <div className="t"><MonitorSmartphone size={18} /> 100% Online</div>
                  <div className="t"><Landmark size={18} /> Respuesta de bancos</div>
                  <div className="t"><ShieldCheck size={18} /> Seguridad y transparencia</div>
                </div>
              </div>
            </section>

            {/* Search */}
            <div className="search-bar">
              <div className="search-tabs">
                {TABS.slice(0, 3).map((t) => {
                  const Icon = t.icon
                  return (
                    <button key={t.id} className={`search-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                      <Icon size={15} /> {t.label}
                    </button>
                  )
                })}
              </div>
              <div className="search-fields">
                <Field label="Tipo"><select className="select" defaultValue=""><option value="">Todos</option><option>SUV</option><option>Sedán</option><option>Pickup</option></select></Field>
                <Field label="Marca"><select className="select" defaultValue=""><option value="">Todas</option><option>Honda</option><option>Toyota</option><option>Kia</option><option>Mazda</option></select></Field>
                <Field label="Modelo"><select className="select" defaultValue=""><option value="">Todos</option></select></Field>
                <Field label="Año"><select className="select" defaultValue="2015-2024"><option>2015 - 2024</option><option>2020 - 2024</option></select></Field>
                <Field label="Precio máx."><select className="select" defaultValue="2450000"><option value="2450000">RD$ 2,450,000</option><option>RD$ 1,500,000</option><option>RD$ 1,000,000</option></select></Field>
                <Field label="Ubicación"><select className="select" defaultValue="sd"><option value="sd">Santo Domingo</option><option>Santiago</option><option>La Romana</option></select></Field>
                <button className="btn btn-primary" style={{ height: 44 }}><Search size={17} /> Buscar</button>
              </div>
            </div>

            {/* Search bar text (mobile-friendly) */}
            <div className="card card-pad show-mobile" style={{ marginTop: 14, display: 'none' }} />

            <div className="row between center" style={{ margin: '18px 2px 14px' }}>
              <div className="small muted"><strong style={{ color: 'var(--ink)' }}>{list.length}</strong> vehículos disponibles</div>
              <label className="row center gap-8 small muted">
                Ordenar por:
                <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} style={{ height: 34, width: 160 }}>
                  <option value="relevancia">Más relevantes</option>
                  <option value="menor">Menor precio</option>
                  <option value="mayor">Mayor precio</option>
                </select>
              </label>
            </div>

            {/* Filter chips */}
            <div className="row gap-8 wrap" style={{ marginBottom: 16 }}>
              {TABS.map((t) => (
                <button key={t.id}
                  className={`chip ${tab === t.id ? 'chip-teal' : ''}`}
                  style={{ height: 32, cursor: 'pointer', border: tab === t.id ? undefined : '1px solid var(--line)', background: tab === t.id ? undefined : '#fff' }}
                  onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="section-title">
              <h2>Vehículos destacados</h2>
              <Link to="/financiamiento" className="link-teal">Ver todos <ChevronRight size={15} /></Link>
            </div>

            <div className="grid grid-4">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="vcard" style={{ height: 300, background: 'var(--surface-2)' }} />)
                : list.map((v) => <VehicleCard key={v.id} v={v} />)}
            </div>
            {!loading && list.length === 0 && (
              <div className="card card-pad muted" style={{ textAlign: 'center' }}>No hay vehículos en esta categoría todavía.</div>
            )}

            {/* Trust strip */}
            <div className="trust-strip" style={{ marginTop: 22 }}>
              <Trust icon={FileCheck} lbl="Financiamiento real" sub="con múltiples bancos" />
              <Trust icon={Clock} lbl="Respuesta rápida" sub="en minutos" />
              <Trust icon={MonitorSmartphone} lbl="100% online" sub="sin filas, sin papeleo" />
              <Trust icon={Lock} lbl="Tus datos protegidos" sub="KYC seguro" />
            </div>

            {/* Financing banner */}
            <div className="fin-banner" style={{ marginTop: 22 }}>
              <div className="shield"><ShieldCheck size={28} color="#9fe0d4" /></div>
              <div>
                <h3>Financiamiento seguro, rápido y transparente</h3>
                <p>Nuestro proceso 100% digital te conecta con los mejores bancos de la República Dominicana.</p>
              </div>
              <div className="banks-row">
                {banks.map((b) => <span key={b.id} className="bank-logo">{b.name}</span>)}
                <Link to="/financiamiento" className="link-teal" style={{ color: '#bfe7e0' }}>Ver todos los bancos <ChevronRight size={14} /></Link>
              </div>
            </div>
          </div>

          {/* ---------------- Right rail ---------------- */}
          <aside className="side-panel col gap-16">
            <FinancePathCard />
            <DealerMiniCard />
            <BankMiniCard />
          </aside>
        </div>
      </div>
    </main>
  )
}

function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>
}
function Trust({ icon: Icon, lbl, sub }) {
  return (
    <div className="t">
      <div className="trust-ic"><Icon size={19} /></div>
      <div><div className="lbl">{lbl}</div><div className="sub">{sub}</div></div>
    </div>
  )
}

function FinancePathCard() {
  const steps = [
    { n: 1, name: 'Verificar identidad', sub: 'Validación de cédula', state: 'done', chip: <StatusChip status="aprobado">KYC aprobado</StatusChip> },
    { n: 2, name: 'Prueba de vida', sub: 'Validación biométrica', state: 'done', chip: <span className="chip chip-green"><Check size={13} strokeWidth={3} /></span> },
    { n: 3, name: 'Autorización de buró de crédito', sub: 'Autorizas a bancos a consultar tu historial', state: 'done', chip: <span className="chip chip-green"><Check size={13} strokeWidth={3} /></span> },
    { n: 4, name: 'Solicitud enviada a bancos', sub: 'Estamos procesando tu solicitud', state: 'active', chip: <span className="chip chip-amber">En proceso</span> },
    { n: 5, name: 'Ofertas de bancos', sub: 'Recibe y compara ofertas', state: 'pending', chip: <span className="chip chip-blue">Pendiente</span> },
  ]
  return (
    <div className="card card-pad">
      <div className="panel-title">Tu camino al financiamiento</div>
      <div className="steps">
        {steps.map((s) => (
          <div key={s.n} className={`step ${s.state}`}>
            <div className="step-num">{s.state === 'done' ? <Check size={14} strokeWidth={3} /> : s.n}</div>
            <div className="grow">
              <div className="row between center gap-8">
                <div className="st-name">{s.name}</div>
                {s.chip}
              </div>
              <div className="st-sub">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>
      <Link to="/financiamiento" className="btn btn-primary btn-block" style={{ marginTop: 14 }}>Solicitar financiamiento</Link>
    </div>
  )
}

function DealerMiniCard() {
  const m = [
    { v: 128, l: 'Inventario', s: 'Activos' },
    { v: 24, l: 'Solicitudes', s: 'En proceso' },
    { v: 8, l: 'Aprobadas', s: 'Este mes' },
    { v: 15, l: 'Ventas', s: 'Este mes' },
  ]
  return (
    <div className="card card-pad">
      <div className="row between center" style={{ marginBottom: 12 }}>
        <div className="panel-title" style={{ margin: 0 }}>Dealer panel</div>
        <Link to="/dealer" className="link-teal">Ir al panel <ChevronRight size={14} /></Link>
      </div>
      <div className="metric-row" style={{ marginBottom: 12 }}>
        {m.map((x) => <div key={x.l} className="metric"><div className="mv">{x.v}</div><div className="ml">{x.l}</div><div className="ms">{x.s}</div></div>)}
      </div>
      <div className="small strong" style={{ margin: '4px 0 6px' }}>Solicitudes recientes</div>
      <table className="table">
        <thead><tr><th>Cliente</th><th>Vehículo</th><th className="num">Monto</th><th>Estado</th></tr></thead>
        <tbody>
          {dealerLeads.slice(0, 3).map((l, i) => (
            <tr key={i}>
              <td>{l.customer}</td>
              <td className="muted">{l.vehicle}</td>
              <td className="num">{fmtRD(l.amount)}</td>
              <td><MiniBankChip s={l.bank} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BankMiniCard() {
  const m = [
    { v: 56, l: 'Solicitudes', s: 'Hoy' },
    { v: 18, l: 'En evaluación', s: 'Hoy' },
    { v: 22, l: 'Pre-aprobadas', s: 'Hoy' },
    { v: 16, l: 'Aprobadas', s: 'Hoy' },
  ]
  return (
    <div className="card card-pad">
      <div className="row between center" style={{ marginBottom: 12 }}>
        <div className="panel-title" style={{ margin: 0 }}>Bank panel</div>
        <Link to="/banco" className="link-teal">Ir al panel <ChevronRight size={14} /></Link>
      </div>
      <div className="metric-row" style={{ marginBottom: 12 }}>
        {m.map((x) => <div key={x.l} className="metric"><div className="mv">{x.v}</div><div className="ml">{x.l}</div><div className="ms">{x.s}</div></div>)}
      </div>
      <div className="small strong" style={{ margin: '4px 0 6px' }}>Solicitudes para evaluar</div>
      <table className="table">
        <thead><tr><th>Cliente</th><th>Dealer</th><th className="num">Monto</th><th>Estado</th></tr></thead>
        <tbody>
          {bankApplications.slice(0, 3).map((a) => (
            <tr key={a.id}>
              <td>{a.customer}</td>
              <td className="muted">{a.dealer}</td>
              <td className="num">{fmtRD(a.amount)}</td>
              <td><span className={`chip ${bankStatusMeta[a.status].chip}`}>{bankStatusMeta[a.status].label}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MiniBankChip({ s }) {
  const map = {
    offer: ['chip-green', 'Aprobada'], evaluating: ['chip-amber', 'En evaluación'],
    pending: ['chip-blue', 'Pendiente'], docs: ['chip-amber', 'Docs'],
  }
  const [cls, lbl] = map[s] || ['chip', s]
  return <span className={`chip ${cls}`}>{lbl}</span>
}
