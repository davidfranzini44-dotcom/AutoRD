import { useEffect, useState } from 'react'
import {
  Inbox, CheckCircle2, XCircle, Clock, TrendingUp, Wallet, Hourglass, AlertTriangle, Landmark,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BankLogo from '../components/BankLogo'
import useBankIdentity from '../hooks/useBankIdentity'
import { fmtRD, bankStatusMeta } from '../data/demo'
import { getBankApplications } from '../data/api'
import { enrichApp, bankStats, byDealer, byAmountRange, TONE } from '../data/bankDemo'

export default function BankReports() {
  const { profile } = useAuth() || {}
  const bank = useBankIdentity(profile)
  const [apps, setApps] = useState([])

  useEffect(() => {
    let alive = true
    getBankApplications(profile?.bank_id, 'todas').then((d) => { if (alive) setApps((d || []).map(enrichApp)) }).catch(() => {})
    return () => { alive = false }
  }, [profile?.bank_id])

  const s = bankStats(apps)
  const dealers = byDealer(apps)
  const ranges = byAmountRange(apps)
  const total = apps.length
  const statusDist = ['nueva', 'evaluando', 'docs', 'preaprobada', 'rechazada'].map((k) => ({ k, label: bankStatusMeta[k].label, n: apps.filter((a) => a.status === k).length }))
  const maxStatus = Math.max(1, ...statusDist.map((d) => d.n))
  const maxDealer = Math.max(1, ...dealers.map((d) => d.apps))
  const maxRange = Math.max(1, ...ranges.map((r) => r.n))
  const bottlenecks = [
    { label: 'Esperando más de 24 h', n: s.waiting.length, tone: 'red' },
    { label: 'Faltan documentos', n: s.docs, tone: 'amber' },
    { label: 'Sin analista asignado', n: apps.filter((a) => !a.reviewer).length, tone: 'blue' },
    { label: 'Pre-aprobado esperando cliente', n: s.pendingCustomer, tone: 'teal' },
  ]

  const kpis = [
    { icon: Inbox, v: total, l: 'Solicitudes', sub: 'Total en cartera' },
    { icon: CheckCircle2, v: s.preaprobadas, l: 'Pre-aprobadas', sub: `${s.approvalRate}% de aprobación` },
    { icon: XCircle, v: s.rechazadas, l: 'Rechazadas', sub: `${s.rejectionRate}% de rechazo` },
    { icon: Clock, v: s.avgResponse, l: 'Respuesta prom.', sub: 'Promedio' },
    { icon: Wallet, v: fmtRD(s.totalApproved), l: 'Monto aprobado', sub: 'Pre-aprobado total' },
    { icon: Hourglass, v: s.pendingCustomer, l: 'Esperando cliente', sub: 'Pre-aprobado pendiente' },
  ]

  return (
    <div className="bankx" style={{ '--bank-accent': bank.color || '#0f766e' }}>
      <div className="container bankx-container">
        <div className="bankx-head">
          <div className="row center gap-10">
            <div className="bankx-brand-logo"><BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={30} /></div>
            <div>
              <h1>Reportes · {bank.name}</h1>
              <p className="muted small">Métricas operativas de tu cartera de solicitudes.</p>
            </div>
          </div>
        </div>

        <div className="bankx-kpis bankx-kpis-6">
          {kpis.map((k) => { const Icon = k.icon; return (
            <div className="bankx-kpi" key={k.l}>
              <div className="bankx-kpi-top">{k.l} <Icon size={15} /></div>
              <strong style={{ fontSize: String(k.v).length > 7 ? 18 : 25 }}>{k.v}</strong>
              <span className="bankx-delta">{k.sub}</span>
            </div>
          ) })}
        </div>

        <div className="bankx-command">
          <div className="card pad">
            <div className="strong row center gap-8" style={{ marginBottom: 14 }}><TrendingUp size={15} color="var(--teal-700)" /> Solicitudes por estado</div>
            <div className="bankx-heat">
              {statusDist.map((d) => (
                <div key={d.k} className="bankx-heat-row" style={{ cursor: 'default' }}>
                  <span className="bankx-heat-name">{d.label}</span>
                  <span className="bankx-bar"><i style={{ width: `${(d.n / maxStatus) * 100}%` }} /></span>
                  <b>{d.n}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="card pad">
            <div className="strong row center gap-8" style={{ marginBottom: 12 }}><AlertTriangle size={15} color="#b45309" /> Cuellos de botella</div>
            <div className="col gap-8">
              {bottlenecks.map((b) => { const t = TONE[b.tone]; return (
                <div key={b.label} className="row between center" style={{ border: '1px solid #edf2f7', borderRadius: 11, padding: '10px 12px', borderLeft: `3px solid ${t.fg}` }}>
                  <span className="small">{b.label}</span>
                  <span className="strong" style={{ color: t.fg, fontSize: 18 }}>{b.n}</span>
                </div>
              ) })}
            </div>
          </div>
        </div>

        <div className="card pad" style={{ marginBottom: 16 }}>
          <div className="row between center" style={{ marginBottom: 14 }}>
            <div className="strong row center gap-8"><Landmark size={15} color="var(--teal-700)" /> Dealers con más volumen</div>
            <span className="tiny muted">Ordenado por volumen</span>
          </div>
          <div className="bankx-heat">
            {dealers.map((d) => (
              <div key={d.dealer} className="bankx-heat-row" style={{ gridTemplateColumns: '130px 1fr 84px', cursor: 'default' }}>
                <span className="bankx-heat-name nowrap">{d.dealer}</span>
                <span className="bankx-bar"><i style={{ width: `${(d.apps / maxDealer) * 100}%` }} /></span>
                <b style={{ fontSize: 12 }}>{fmtRD(d.volume)}</b>
              </div>
            ))}
            {dealers.length === 0 && <div className="tiny muted">Sin datos de dealers todavía.</div>}
          </div>
        </div>

        <div className="card pad">
          <div className="strong row center gap-8" style={{ marginBottom: 14 }}><Wallet size={15} color="var(--teal-700)" /> Volumen por rango de monto</div>
          <div className="bankx-heat">
            {ranges.map((r) => (
              <div key={r.label} className="bankx-heat-row" style={{ gridTemplateColumns: '150px 1fr 40px', cursor: 'default' }}>
                <span className="bankx-heat-name nowrap">{r.label}</span>
                <span className="bankx-bar"><i style={{ width: `${(r.n / maxRange) * 100}%`, background: '#10233f' }} /></span>
                <b>{r.n}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
