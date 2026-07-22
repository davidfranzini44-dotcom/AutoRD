import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, MessageCircle, Users, Landmark, Boxes, Bell, ImageOff, TrendingUp,
  BadgeCheck, ChevronRight, Eye, AlertTriangle, Clock, ArrowUpRight, CheckCircle2,
} from 'lucide-react'
import { getDealerData, getMyDealer } from '../data/api'
import { useAuth } from '../context/AuthContext'
import { fmtMoney } from '../data/demo'
import DealerLogo from '../components/DealerLogo'
import CarImage from '../components/CarImage'
import { buildLeads, buildFinancing, buildActivity, dashboardStats } from '../data/dealerDemo'

const KPI_IC = { leads: Users, financing: Landmark, inventory: Boxes, messages: MessageCircle, incomplete: ImageOff, sales: TrendingUp }
const ACT_IC = { lead: Users, financing: Landmark, offer: BadgeCheck, message: MessageCircle, view: Eye, sale: CheckCircle2 }
const TAREA_FG = { amber: '#b45309', red: '#b91c1c', blue: '#1d4ed8' }

export default function DealerDashboard() {
  const { profile } = useAuth() || {}
  const [dealer, setDealer] = useState(null)
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([
      getDealerData(profile?.dealer_id),
      getMyDealer(profile?.dealer_id).catch(() => null),
    ]).then(([d, dl]) => {
      if (!alive) return
      setInventory(d.inventory || [])
      setDealer(dl)
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [profile?.dealer_id])

  const leads = buildLeads(inventory)
  const financing = buildFinancing(inventory)
  const activity = buildActivity(inventory)
  const { kpis, tareas } = dashboardStats(inventory, leads, financing)

  const topVehicles = [...inventory]
    .map((v, i) => ({ ...v, views: [128, 94, 76, 52, 41][i] || 30, favs: [12, 8, 6, 4, 3][i] || 2, leadCount: [5, 3, 2, 1, 1][i] || 0, fin: [3, 2, 1, 1, 0][i] || 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)

  const name = dealer?.name || 'Tu dealer'

  return (
    <div>
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

      <div className="dash-kpis">
        {kpis.map((k) => {
          const Icon = KPI_IC[k.key] || Boxes
          return (
            <Link to={k.to} className="metric-card dash-kpi" key={k.key}>
              <div className="row between center">
                <div className="mc-ic"><Icon size={18} /></div>
                <ArrowUpRight size={15} className="muted" />
              </div>
              <div className="mc-v">{loading ? '—' : k.value}</div>
              <div className="mc-l">{k.label}</div>
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
              <div className="muted tiny" style={{ padding: '0 16px 16px' }}>¡Todo al día! No tienes tareas pendientes.</div>
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
  )
}
