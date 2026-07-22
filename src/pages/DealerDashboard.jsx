import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, MessageCircle, Users, Landmark, Boxes, Bell, ImageOff, TrendingUp,
  BadgeCheck, ChevronRight, Eye, AlertTriangle, Clock, ArrowUpRight, CheckCircle2,
  Wallet, ClipboardCheck, CalendarClock, Gauge,
} from 'lucide-react'
import { getDealerData, getMyDealer, getDealerLeads } from '../data/api'
import { useAuth } from '../context/AuthContext'
import { fmtMoney, fmtRD } from '../data/demo'
import DealerLogo from '../components/DealerLogo'
import CarImage from '../components/CarImage'
import { buildFinancing, buildActivity, dashboardStats, listingScore } from '../data/dealerDemo'

const KPI_IC = { leads: Users, financing: Landmark, inventory: Boxes, messages: MessageCircle, incomplete: ImageOff, sales: TrendingUp }
const ACT_IC = { lead: Users, financing: Landmark, offer: BadgeCheck, message: MessageCircle, view: Eye, sale: CheckCircle2 }
const ACTION_IC = { docs: ClipboardCheck, quality: Gauge, whatsapp: MessageCircle, finance: Wallet }
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
  const { kpis, tareas } = dashboardStats(inventory, leads, financing)
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
    .slice(0, 4)
  const completeListings = scoreRows.filter((row) => row.score >= 85).length
  const unreadLeads = leads.filter((l) => Number(l.unread || 0) > 0 || l.unread === true).length
  const hotLeads = leads.filter((l) => l.hot || ['financiamiento', 'negociando', 'reservado'].includes(l.stage)).length
  const followUps = leads.filter((l) => l.followUpAt || l.next).length
  const financeOffers = financing.filter((f) => f.status === 'preaprobado').length
  const financeDocs = financing.filter((f) => f.status === 'documentos').length
  const financeRate = financing.length ? Math.round((financeOffers / financing.length) * 100) : 0
  const healthLabel = avgQuality >= 85 ? 'Excelente' : avgQuality >= 70 ? 'Buen estado' : 'Por mejorar'

  const topVehicles = [...inventory]
    .map((v, i) => ({
      ...v,
      views: [128, 94, 76, 52, 41][i] || 30,
      favs: [12, 8, 6, 4, 3][i] || 2,
      leadCount: leads.filter((l) => l.vehicle?.id === v.id).length,
      fin: [3, 2, 1, 1, 0][i] || 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)

  const name = dealer?.name || 'Tu dealer'
  const nextActions = [
    financeDocs && { key: 'docs', label: 'Documentos pendientes', value: financeDocs, text: 'clientes necesitan completar archivos', to: '/dealer/financiamiento' },
    weakListings.length && { key: 'quality', label: 'Mejorar publicaciones', value: weakListings.length, text: 'vehículos pueden recibir más leads', to: '/dealer/inventario' },
    unreadLeads && { key: 'whatsapp', label: 'Responder WhatsApp', value: unreadLeads, text: 'conversaciones sin respuesta', to: '/dealer/whatsapp' },
    financing.length && { key: 'finance', label: 'Ofertas activas', value: financeOffers, text: `${financeRate}% con pre-aprobación`, to: '/dealer/financiamiento' },
  ].filter(Boolean).slice(0, 4)

  return (
    <div className="dealer-console-page">
      <div className="admin-head">
        <div className="row center gap-12">
          <DealerLogo dealer={dealer || { name }} style={{ width: 48, height: 48, borderRadius: 12, fontSize: 17 }} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22 }} className="row center gap-8">{name} {dealer?.verified && <BadgeCheck size={19} color="var(--teal-700)" />}</h1>
            <p className="tiny muted">Centro de operaciones · {inventory.length} vehículo{inventory.length === 1 ? '' : 's'} en inventario</p>
          </div>
        </div>
        <div className="row gap-8 wrap">
          <Link to="/dealer/publicar" className="btn btn-primary"><Plus size={16} /> Publicar vehículo</Link>
          <Link to="/dealer/whatsapp" className="btn btn-outline"><MessageCircle size={16} /> WhatsApp</Link>
        </div>
      </div>

      <section className="dealer-hero-panel">
        <div className="dealer-hero-copy">
          <span className="dealer-eyebrow">Panel del dealer</span>
          <h2>Prioriza leads, financiamiento e inventario desde un solo lugar.</h2>
          <p>Diseñado para que el equipo sepa qué responder, qué publicación mejorar y qué solicitud bancaria necesita atención hoy.</p>
          <div className="dealer-hero-actions">
            <Link to="/dealer/leads" className="btn btn-primary"><Users size={16} /> Ver leads</Link>
            <Link to="/dealer/financiamiento" className="btn btn-outline"><Landmark size={16} /> Revisar financiamiento</Link>
          </div>
        </div>
        <div className="dealer-health-card">
          <div className="row between center">
            <div>
              <div className="tiny muted">Salud del inventario</div>
              <strong>{healthLabel}</strong>
            </div>
            <div className="dealer-health-score">{loading ? '-' : `${avgQuality}%`}</div>
          </div>
          <div className="dealer-health-track" aria-label="Calidad promedio de publicaciones">
            <span style={{ width: `${Math.max(4, avgQuality)}%` }} />
          </div>
          <div className="dealer-health-grid">
            <MetricLite label="Publicados" value={published} />
            <MetricLite label="Reservados" value={reserved} />
            <MetricLite label="Vendidos" value={sold} />
            <MetricLite label="Completos" value={completeListings} />
          </div>
          <div className="dealer-hero-value">
            <span>Valor publicado</span>
            <strong>{fmtRD(inventoryValue)}</strong>
          </div>
        </div>
      </section>

      <div className="dash-kpis">
        {kpis.map((k) => {
          const Icon = KPI_IC[k.key] || Boxes
          return (
            <Link to={k.to} className="metric-card dash-kpi" key={k.key}>
              <div className="row between center">
                <div className="mc-ic"><Icon size={18} /></div>
                <ArrowUpRight size={15} className="muted" />
              </div>
              <div className="mc-v">{loading ? '-' : k.value}</div>
              <div className="mc-l">{k.label}</div>
            </Link>
          )
        })}
      </div>

      <div className="dealer-action-grid">
        {(nextActions.length ? nextActions : [
          { key: 'quality', label: 'Todo al día', value: completeListings, text: 'publicaciones con buena calidad', to: '/dealer/inventario' },
          { key: 'finance', label: 'Financiamiento', value: financing.length, text: 'solicitudes listas para revisar', to: '/dealer/financiamiento' },
        ]).map((a) => {
          const Icon = ACTION_IC[a.key] || ClipboardCheck
          return (
            <Link to={a.to} className="dealer-action-card" key={a.key}>
              <span className="dealer-action-ic"><Icon size={17} /></span>
              <span>
                <strong>{a.label}</strong>
                <small><b>{a.value}</b> {a.text}</small>
              </span>
              <ChevronRight size={17} />
            </Link>
          )
        })}
      </div>

      <div className="dash-grid">
        <div className="col gap-16">
          <div className="card">
            <div className="row between center" style={{ padding: '14px 16px 8px' }}>
              <h3 className="row center gap-8" style={{ fontSize: 15 }}><AlertTriangle size={16} color="#f59e0b" /> Tareas urgentes</h3>
              {tareas.length > 0 && <span className="chip chip-amber">{tareas.length}</span>}
            </div>
            {tareas.length === 0 ? (
              <div className="muted tiny" style={{ padding: '0 16px 16px' }}>Todo al día. No tienes tareas pendientes.</div>
            ) : (
              <div className="col" style={{ padding: '0 12px 12px' }}>
                {tareas.map((t) => (
                  <Link key={t.key} to={t.to} className="row between center dash-tarea" style={{ borderLeft: `3px solid ${TAREA_FG[t.tone] || TAREA_FG.blue}` }}>
                    <span className="small" style={{ color: TAREA_FG[t.tone] || TAREA_FG.blue, fontWeight: 600 }}>{t.label}</span>
                    <ChevronRight size={16} className="muted" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {weakListings.length > 0 && (
            <div className="card dealer-quality-panel">
              <div className="row between center">
                <div>
                  <h3>Publicaciones que pueden vender mejor</h3>
                  <p className="tiny muted">Sube fotos, agrega descripción y completa specs para subir el ranking.</p>
                </div>
                <Link to="/dealer/inventario" className="link-teal tiny">Optimizar <ChevronRight size={13} /></Link>
              </div>
              <div className="dealer-quality-list">
                {weakListings.map(({ vehicle, score, missing }) => (
                  <Link to="/dealer/inventario" className="dealer-quality-row" key={vehicle.id}>
                    <div className="dash-top-photo"><CarImage make={vehicle.make} model={vehicle.model} bodyType={vehicle.bodyType} seed={vehicle.id} tone={vehicle.tone} photo={vehicle.coverPhoto} /></div>
                    <span className="grow">
                      <strong>{vehicle.make} {vehicle.model} {vehicle.year}</strong>
                      <small>{missing.slice(0, 3).join(', ') || 'Listo para publicar'}</small>
                    </span>
                    <b>{score}%</b>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="row between center" style={{ padding: '14px 16px 6px' }}>
              <h3 className="row center gap-8" style={{ fontSize: 15 }}><TrendingUp size={16} color="var(--teal-700)" /> Top vehículos</h3>
              <Link to="/dealer/inventario" className="link-teal tiny">Ver inventario <ChevronRight size={13} /></Link>
            </div>
            <div className="table-wrap">
              <table className="table dash-top-table">
                <thead><tr><th>Vehículo</th><th className="num">Precio</th><th className="num">Vistas</th><th className="num">Favs</th><th className="num">Leads</th><th className="num">Fin.</th></tr></thead>
                <tbody>
                  {topVehicles.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <div className="row center gap-8">
                          <div className="dash-top-photo"><CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} photo={v.coverPhoto} /></div>
                          <span className="strong small">{v.make} {v.model} {v.year}</span>
                        </div>
                      </td>
                      <td className="num small">{fmtMoney(v.price, v.currency)}</td>
                      <td className="num"><span className="row center gap-3" style={{ justifyContent: 'flex-end' }}><Eye size={12} className="muted" /> {v.views}</span></td>
                      <td className="num">{v.favs}</td>
                      <td className="num strong">{v.leadCount}</td>
                      <td className="num">{v.fin}</td>
                    </tr>
                  ))}
                  {topVehicles.length === 0 && <tr><td colSpan={6} className="muted tiny" style={{ textAlign: 'center', padding: 20 }}>Publica tu primer vehículo para ver métricas.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col gap-16">
          <div className="card dealer-pipeline-card">
            <div className="row between center">
              <h3><CalendarClock size={16} /> Pipeline comercial</h3>
              <Link to="/dealer/leads" className="link-teal tiny">Abrir CRM</Link>
            </div>
            <div className="dealer-pipeline-grid">
              <MetricLite label="Clientes calientes" value={hotLeads} />
              <MetricLite label="Seguimientos" value={followUps} />
              <MetricLite label="Pre-aprobados" value={financeOffers} />
              <MetricLite label="Leads totales" value={leads.length} />
            </div>
          </div>

          <div className="card">
            <div className="row between center" style={{ padding: '14px 16px 8px' }}>
              <h3 className="row center gap-8" style={{ fontSize: 15 }}><Clock size={16} color="var(--teal-700)" /> Actividad reciente</h3>
            </div>
            <div className="col" style={{ padding: '0 16px 16px' }}>
              {activity.map((a, i) => {
                const Icon = ACT_IC[a.kind] || Bell
                return (
                  <div key={i} className="row gap-10 dash-activity">
                    <div className="dash-act-ic"><Icon size={14} /></div>
                    <div className="grow"><div className="small">{a.text}</div><div className="tiny muted">{a.time}</div></div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricLite({ label, value }) {
  return (
    <div className="dealer-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}
