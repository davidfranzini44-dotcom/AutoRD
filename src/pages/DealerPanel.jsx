import { useState, useEffect } from 'react'
import {
  Boxes, Users, Landmark, UserCheck, TrendingUp, Search, Plus,
  Phone, UserPlus, Pencil, CheckCircle2, Eye, ShieldCheck, MoreHorizontal,
} from 'lucide-react'
import { dealerMetrics, fmtRD } from '../data/demo'
import { getDealerData } from '../data/api'
import { useAuth } from '../context/AuthContext'
import StatusChip from '../components/StatusChip'

const METRIC_IC = { inventory: Boxes, leads: Users, finance: Landmark, approved: UserCheck, sales: TrendingUp }
const bankLabel = {
  offer: ['chip-green', 'Oferta recibida'], evaluating: ['chip-amber', 'En evaluación'],
  pending: ['chip-blue', 'Pendiente'], docs: ['chip-amber', 'Pendiente docs'],
}

export default function DealerPanel() {
  const [tab, setTab] = useState('leads')
  const { profile } = useAuth() || {}
  const [dealerInventory, setInventory] = useState([])
  const [dealerLeads, setLeads] = useState([])

  useEffect(() => {
    let alive = true
    getDealerData(profile?.dealer_id).then((d) => {
      if (!alive) return
      setInventory(d.inventory || [])
      setLeads(d.leads || [])
    })
    return () => { alive = false }
  }, [profile?.dealer_id])

  return (
    <main className="page">
      <div className="container">
        <div className="admin-head">
          <div>
            <div className="row center gap-8">
              <div className="avatar" style={{ background: 'var(--navy-800)' }}>AA</div>
              <div>
                <h1 style={{ fontSize: 22 }}>Panel del dealer — Auto América</h1>
                <p className="tiny muted">Gestiona tu inventario y tus leads de financiamiento</p>
              </div>
            </div>
          </div>
          <button className="btn btn-primary"><Plus size={17} /> Publicar vehículo</button>
        </div>

        {/* Metrics */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 18 }}>
          {dealerMetrics.map((m) => {
            const Icon = METRIC_IC[m.icon]
            return (
              <div className="metric-card" key={m.label}>
                <div className="mc-ic"><Icon size={19} /></div>
                <div className="mc-v">{m.value}</div>
                <div className="mc-l">{m.label}</div>
              </div>
            )
          })}
        </div>

        <div className="row between center wrap gap-12" style={{ marginBottom: 14 }}>
          <div className="tabbar">
            <button className={tab === 'leads' ? 'active' : ''} onClick={() => setTab('leads')}>Leads de financiamiento</button>
            <button className={tab === 'inv' ? 'active' : ''} onClick={() => setTab('inv')}>Inventario</button>
          </div>
          <div className="row center gap-8">
            <div className="row center" style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--muted)' }} />
              <input className="input" placeholder="Buscar…" style={{ height: 38, paddingLeft: 32, width: 220 }} />
            </div>
          </div>
        </div>

        {tab === 'leads' && (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th><th>Vehículo</th><th className="num">Monto</th>
                    <th>KYC</th><th>Estado banco</th><th>Vendedor</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {dealerLeads.map((l, i) => {
                    const [cls, lbl] = bankLabel[l.bank] || ['chip', l.bank]
                    return (
                      <tr key={i}>
                        <td>
                          <div className="row center gap-8">
                            <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{l.customer.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
                            <span className="strong">{l.customer}</span>
                          </div>
                        </td>
                        <td className="muted">{l.vehicle}</td>
                        <td className="num strong">{fmtRD(l.amount)}</td>
                        <td><StatusChip status={l.kyc} /></td>
                        <td><span className={`chip ${cls}`}>{lbl}</span></td>
                        <td className={l.salesperson === 'Sin asignar' ? 'muted' : ''}>{l.salesperson}</td>
                        <td>
                          <div className="row gap-4">
                            <button className="btn btn-outline btn-sm" title="Contactar cliente"><Phone size={14} /></button>
                            <button className="btn btn-outline btn-sm" title="Asignar vendedor"><UserPlus size={14} /></button>
                            <button className="btn btn-outline btn-sm" title="Marcar vendido"><CheckCircle2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="notice" style={{ margin: 14, borderStyle: 'solid' }}>
              <ShieldCheck size={16} />
              <span>El dealer ve el estado de KYC (aprobado / pendiente) pero <strong>nunca</strong> accede a datos biométricos, selfies ni al historial crediticio del cliente.</span>
            </div>
          </div>
        )}

        {tab === 'inv' && (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Vehículo</th><th className="num">Precio</th><th>Estado</th>
                    <th className="num">Vistas</th><th className="num">Leads</th><th className="num">Solicitudes fin.</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {dealerInventory.map((r) => {
                    const name = r.vehicle || `${r.make} ${r.model} ${r.year}`
                    const estado = r.status === 'reservado' ? 'Reservado' : r.status === 'Reservado' ? 'Reservado' : 'Publicado'
                    return (
                    <tr key={r.id}>
                      <td className="strong">{name}</td>
                      <td className="num">{fmtRD(r.price)}</td>
                      <td><span className={`chip ${estado === 'Publicado' ? 'chip-green' : 'chip-amber'}`}>{estado}</span></td>
                      <td className="num"><span className="row center gap-4" style={{ justifyContent: 'flex-end' }}><Eye size={13} className="muted" /> {(r.views || 0).toLocaleString('es-DO')}</span></td>
                      <td className="num">{r.leads ?? '—'}</td>
                      <td className="num strong">{r.requests ?? '—'}</td>
                      <td>
                        <div className="row gap-4">
                          <button className="btn btn-outline btn-sm" title="Editar"><Pencil size={14} /></button>
                          <button className="btn btn-outline btn-sm" title="Marcar vendido"><CheckCircle2 size={14} /></button>
                          <button className="btn btn-outline btn-sm" title="Más"><MoreHorizontal size={14} /></button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
