import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, MessageCircle, Users, Landmark, Bell, TrendingUp,
  BadgeCheck, ChevronRight, Eye, AlertTriangle, Clock, CheckCircle2, CalendarClock,
} from 'lucide-react'
import { getDealerData, getMyDealer, getDealerLeads } from '../data/api'
import { useAuth } from '../context/AuthContext'
import { fmtMoney, fmtRD } from '../data/demo'
import DealerLogo from '../components/DealerLogo'
import CarImage from '../components/CarImage'
import { buildFinancing, buildActivity, dashboardStats, listingScore } from '../data/dealerDemo'

const ACT_IC = { lead: Users, financing: Landmark, offer: BadgeCheck, message: MessageCircle, view: Eye, sale: CheckCircle2 }
const TAREA_FG = { amber: '#b45309', red: '#b91c1c', blue: '#1d4ed8' }

export default function DealerDashboard() {
  const { profile } = useAuth() || {}
  const [dealer, setDealer] = useState(null)
  const [inventory, setInventory] = useState([])
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([
      getDealerData(profile?.dealer_id),
      getMyDealer(profile?.dealer_id).catch(() => null),
      getDealerLeads().catch(() => []),
    ]).then(([d, dl, ld]) => {
      if (!alive) return
      setInventory(d.inventory || [])
      setDealer(dl)
      setLeads(ld)
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [profile?.dealer_id])

  const financing = buildFinancing(inventory)
  const activity = buildActivity(inventory)
  const { tareas } = dashboardStats(inventory, leads, financing)
  const inventoryValue = inventory.reduce((sum, v) => sum + (Number(v.price) || 0), 0)
  const published = inventory.filter((v) => (v.status || 'publicado') === 'publicado').length
  const reserved = inventory.filter((v) => v.status === 'reservado').length
  const sold = inventory.filter((v) => v.status === 'vendido').length
  const scoreRows = inventory.map((v) => ({ vehicle: v, ...listingScore(v) }))
  const avgQuality = scoreRows.length
    ? Math.round(scoreRows.reduce((sum, row) => sum + row.score, 0) / scoreRows.length)
    : 0
  const weakListings = scoreRows
    .filter((row) => row.score < 80)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
  const completeListings = scoreRows.filter((row) => row.score >= 85).length
  const unreadLeads = leads.filter((l) => Number(l.unread || 0) > 0 || l.unread === true).length
  const hotLeads = leads.filter((l) => l.hot || ['financiamiento', 'negociando', 'reservado'].includes(l.stage)).length
  const followUps = leads.filter((l) => l.followUpAt || l.next).length
  const financeOffers = financing.filter((f) => f.status === 'preaprobado').length
  const financeDocs = financing.filter((f) => f.status === 'documentos').length
  const healthLabel = avgQuality >= 85 ? 'Excelente' : avgQuality >= 70 ? 'Buen estado' : 'Por mejorar'

  const topVehicles = [...inventory]
    .map((v, i) => ({
      ...v,
      views: [214, 142, 98, 76, 52][i] || 30,
      leadCount: leads.filter((l) => l.vehicle?.id === v.id).length,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)

  const name = dealer?.name || 'Tu dealer'

  return (
    <div className="dlrx">
      <div className="container dlrx-container">
        <div className="dlrx-head">
          <div className="row center gap-12">
            <DealerLogo dealer={dealer || { name }} style={{ width: 48, height: 48, borderRadius: 12, fontSize: 17 }} />
            <div style={{ minWidth: 0 }}>
              <h1 className="row center gap-8">{name} {dealer?.verified && <BadgeCheck size={19} color="var(--teal-700)" />}</h1>
              <p className="tiny muted">Centro de operaciones · {inventory.length} vehículo{inventory.length === 1 ? '' : 's'} en inventario</p>
            </div>
          </div>
          <div className="row gap-8 wrap">
            <Link to="/dealer/publicar" className="btn btn-primary"><Plus size={16} /> Publicar vehículo</Link>
            <Link to="/dealer/whatsapp" className="btn btn-outline"><MessageCircle size={16} /> WhatsApp</Link>
          </div>
        </div>

        {/* Hero + health */}
        <div className="dlrx-hero">
          <div className="dlrx-hero-main">
            <span className="chip green" style={{ width: 'max-content' }}>Panel del dealer</span>
            <h2>Responde lo que puede cerrar hoy.</h2>
            <p>Una vista para que el equipo sepa qué cliente responder, qué publicación mejorar y qué solicitud bancaria necesita atención.</p>
            <div className="dlrx-hero-actions">
              <Link to="/dealer/leads" className="btn btn-primary"><Users size={16} /> Ver leads calientes</Link>
              <Link to="/dealer/financiamiento" className="btn" style={{ background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'rgba(255,255,255,.28)' }}><Landmark size={16} /> Revisar financiamiento</Link>
            </div>
          </div>
          <aside className="card pad dlrx-health">
            <div className="row between center">
              <div><div className="tiny muted">Salud del inventario</div><b style={{ fontSize: 18, color: '#10233f' }}>{healthLabel}</b></div>
              <div className="dlrx-score">{loading ? '-' : `${avgQuality}%`}</div>
            </div>
            <div className="dlrx-track"><i style={{ width: `${Math.max(4, avgQuality)}%` }} /></div>
            <div className="dlrx-mini-grid">
              <Mini label="Publicados" value={published} />
              <Mini label="Reservados" value={reserved} />
              <Mini label="Vendidos" value={sold} />
              <Mini label="Completos" value={completeListings} />
            </div>
            <div className="row between center"><span className="small muted">Valor publicado</span><b style={{ color: '#10233f' }}>{fmtRD(inventoryValue)}</b></div>
          </aside>
        </div>

        {/* KPIs */}
        <div className="dlrx-kpis">
          <KpiCard label="Vehículos" value={loading ? '-' : inventory.length} chip={published ? { cls: 'green', t: `${published} publicados` } : null} to="/dealer/inventario" />
          <KpiCard label="Leads" value={loading ? '-' : leads.length} chip={unreadLeads ? { cls: 'red', t: `${unreadLeads} sin responder` } : { cls: 'green', t: 'Al día' }} to="/dealer/leads" />
          <KpiCard label="Financiamiento" value={loading ? '-' : financing.length} chip={financeDocs ? { cls: 'amber', t: `${financeDocs} docs` } : null} to="/dealer/financiamiento" />
          <KpiCard label="Pre-aprobados" value={loading ? '-' : financeOffers} chip={{ cls: 'green', t: 'Listos' }} to="/dealer/financiamiento" />
          <KpiCard label="WhatsApp" value={loading ? '-' : unreadLeads} chip={{ cls: 'blue', t: 'hoy' }} to="/dealer/whatsapp" />
          <KpiCard label="Vendido mes" value={loading ? '-' : sold} chip={{ cls: 'green', t: `${sold} unidad${sold === 1 ? '' : 'es'}` }} to="/dealer/inventario" />
        </div>

        {/* Work: tareas + top vehicles | pipeline + activity */}
        <div className="dlrx-two-col">
          <div className="col">
            <section className="card pad">
              <div className="row between center" style={{ marginBottom: 8 }}>
                <h3 className="row center gap-8"><AlertTriangle size={16} color="#f59e0b" /> Tareas urgentes</h3>
                {tareas.length > 0 && <span className="chip amber">{tareas.length}</span>}
              </div>
              {tareas.length === 0 ? (
                <p className="tiny muted">Todo al día. No tienes tareas pendientes.</p>
              ) : tareas.map((t) => (
                <Link key={t.key} to={t.to} className="dlrx-lead-card" style={{ textDecoration: 'none' }}>
                  <div className="row between center"><b style={{ color: TAREA_FG[t.tone] || TAREA_FG.blue }}>{t.label}</b><ChevronRight size={15} className="muted" /></div>
                </Link>
              ))}
            </section>

            {weakListings.length > 0 && (
              <section className="card pad">
                <div className="row between center" style={{ marginBottom: 8 }}>
                  <h3>Publicaciones que pueden vender mejor</h3>
                  <Link to="/dealer/inventario" className="chip">Optimizar</Link>
                </div>
                {weakListings.map(({ vehicle, score, missing }) => (
                  <Link key={vehicle.id} to="/dealer/inventario" className="dlrx-lead-card" style={{ gridTemplateColumns: '54px 1fr auto', display: 'grid', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                    <div className="dlrx-photo" style={{ width: 54, height: 40 }}><CarImage make={vehicle.make} model={vehicle.model} bodyType={vehicle.bodyType} seed={vehicle.id} tone={vehicle.tone} photo={vehicle.coverPhoto} /></div>
                    <div className="grow"><b className="small">{vehicle.make} {vehicle.model} {vehicle.year}</b><div className="tiny muted">{missing.slice(0, 2).join(', ') || 'Listo para publicar'}</div></div>
                    <b>{score}%</b>
                  </Link>
                ))}
              </section>
            )}

            <section className="card">
              <div className="row between center" style={{ padding: '14px 16px 6px' }}>
                <h3 className="row center gap-8"><TrendingUp size={16} color="var(--teal-700)" /> Top vehículos</h3>
                <Link to="/dealer/inventario" className="btn btn-outline btn-sm">Inventario</Link>
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Vehículo</th><th className="num">Precio</th><th className="num">Vistas</th><th className="num">Leads</th></tr></thead>
                  <tbody>
                    {topVehicles.map((v) => (
                      <tr key={v.id}>
                        <td><div className="row center gap-8"><span className="dlrx-photo"><CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} photo={v.coverPhoto} /></span><b className="small">{v.make} {v.model} {v.year}</b></div></td>
                        <td className="num small">{fmtMoney(v.price, v.currency)}</td>
                        <td className="num"><span className="row center gap-3" style={{ justifyContent: 'flex-end' }}><Eye size={12} className="muted" /> {v.views}</span></td>
                        <td className="num strong">{v.leadCount}</td>
                      </tr>
                    ))}
                    {topVehicles.length === 0 && <tr><td colSpan={4} className="muted tiny" style={{ textAlign: 'center', padding: 20 }}>Publica tu primer vehículo para ver métricas.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="col">
            <section className="card pad">
              <div className="row between center"><h3 className="row center gap-8"><CalendarClock size={16} color="var(--teal-700)" /> Pipeline comercial</h3><Link to="/dealer/leads" className="chip">Abrir CRM</Link></div>
              <div className="dlrx-mini-grid" style={{ marginTop: 12 }}>
                <Mini label="Clientes calientes" value={hotLeads} />
                <Mini label="Seguimientos" value={followUps} />
                <Mini label="Pre-aprobados" value={financeOffers} />
                <Mini label="Leads totales" value={leads.length} />
              </div>
            </section>

            <section className="card pad">
              <h3 className="row center gap-8" style={{ marginBottom: 10 }}><Clock size={16} color="var(--teal-700)" /> Actividad reciente</h3>
              <div className="col" style={{ gap: 0 }}>
                {activity.map((a, i) => {
                  const Icon = ACT_IC[a.kind] || Bell
                  return (
                    <div key={i} className="row gap-10 dash-activity"><div className="dash-act-ic"><Icon size={14} /></div><div className="grow"><div className="small">{a.text}</div><div className="tiny muted">{a.time}</div></div></div>
                  )
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function Mini({ label, value }) {
  return <div className="dlrx-mini"><b>{value}</b><span>{label}</span></div>
}
function KpiCard({ label, value, chip, to }) {
  return (
    <Link to={to} className="card dlrx-kpi">
      <span>{label}</span>
      <b>{value}</b>
      {chip ? <span className={`chip ${chip.cls}`}>{chip.t}</span> : <span />}
    </Link>
  )
}
