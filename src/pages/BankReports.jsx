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
  const statusDist = ['nueva', 'evaluando', 'docs', 'preaprobada', 'rechazada'].map((k) => ({ k, label: bankStatusMeta[k].label, chip: bankStatusMeta[k].chip, n: apps.filter((a) => a.status === k).length }))
  const maxStatus = Math.max(1, ...statusDist.map((d) => d.n))
  const maxDealer = Math.max(1, ...dealers.map((d) => d.apps))
  const maxRange = Math.max(1, ...ranges.map((r) => r.n))
  const bottlenecks = [
    { label: 'Esperando más de 24 h', n: s.waiting.length, tone: 'red' },
    { label: 'Faltan documentos', n: s.docs, tone: 'amber' },
    { label: 'Sin revisor asignado', n: apps.filter((a) => !a.reviewer).length, tone: 'blue' },
    { label: 'Pre-aprobado esperando cliente', n: s.pendingCustomer, tone: 'teal' },
  ]

  const kpis = [
    { icon: Inbox, v: total, l: 'Solicitudes', sub: 'Total en cartera' },
    { icon: CheckCircle2, v: s.preaprobadas, l: 'Pre-aprobadas', sub: `${s.approvalRate}% de aprobación` },
    { icon: XCircle, v: s.rechazadas, l: 'Rechazadas', sub: `${s.rejectionRate}% de rechazo` },
    { icon: Clock, v: s.avgResponse, l: 'Tiempo de respuesta', sub: 'Promedio' },
    { icon: Wallet, v: fmtRD(s.totalApproved), l: 'Monto aprobado', sub: 'Pre-aprobado total' },
    { icon: Hourglass, v: s.pendingCustomer, l: 'Esperando cliente', sub: 'Pre-aprobado pendiente' },
  ]

  return (
    <div>
      <div className="admin-head">
        <div className="row center gap-8">
          <div className="bank-console-logo"><BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={32} /></div>
          <div>
            <h1 style={{ fontSize: 22 }}>Reportes · {bank.name}</h1>
            <p className="tiny muted">Métricas operativas de tu cartera de solicitudes</p>
          </div>
        </div>
      </div>

      <div className="bank-kpis">
        {kpis.map((k) => { const Icon = k.icon; return (
          <div className="metric-card" key={k.l}>
            <div className="mc-ic"><Icon size={18} /></div>
            <div className="mc-v" style={{ fontSize: String(k.v).length > 7 ? 18 : 26 }}>{k.v}</div>
            <div className="mc-l">{k.l}</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{k.sub}</div>
          </div>
        ) })}
      </div>

      <div className="bank-cmd">
        <div className="card card-pad">
          <div className="small strong row center gap-8" style={{ marginBottom: 14 }}><TrendingUp size={15} color="var(--teal-700)" /> Solicitudes por estado</div>
          <div className="col gap-12">
            {statusDist.map((d) => (
              <div key={d.k}>
                <div className="row between center" style={{ marginBottom: 5 }}>
                  <span className={`chip ${d.chip}`}>{d.label}</span>
                  <span className="tiny muted">{d.n} · {total ? Math.round((d.n / total) * 100) : 0}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--surface-3, #eef2f6)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${(d.n / maxStatus) * 100}%`, height: '100%', background: 'var(--teal-700)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="small strong row center gap-8" style={{ marginBottom: 12 }}><AlertTriangle size={15} color="#f59e0b" /> Cuellos de botella</div>
          <div className="col gap-8">
            {bottlenecks.map((b) => { const t = TONE[b.tone]; return (
              <div key={b.label} className="row between center" style={{ border: '1px solid var(--line-2, #e2e8f0)', borderRadius: 10, padding: '10px 12px', borderLeft: `3px solid ${t.fg}` }}>
                <span className="small">{b.label}</span>
                <span className="strong" style={{ color: t.fg, fontSize: 18 }}>{b.n}</span>
              </div>
            ) })}
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between center" style={{ marginBottom: 14 }}>
          <div className="small strong row center gap-8"><Landmark size={15} color="var(--teal-700)" /> Solicitudes por dealer</div>
          <span className="tiny muted">Ordenado por volumen</span>
        </div>
        <div className="col gap-16">
          {dealers.map((d) => (
            <div key={d.dealer}>
              <div className="row between center" style={{ marginBottom: 6 }}>
                <span className="small strong">{d.dealer}</span>
                <span className="tiny muted">{d.apps} solicitudes · {d.approved} aprobadas · {fmtRD(d.volume)}</span>
              </div>
              <div style={{ height: 10, background: 'var(--surface-3, #eef2f6)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${(d.apps / maxDealer) * 100}%`, height: '100%', background: 'var(--teal-700)' }} />
              </div>
            </div>
          ))}
          {dealers.length === 0 && <div className="tiny muted">Sin datos de dealers todavía.</div>}
        </div>
      </div>

      <div className="card card-pad">
        <div className="small strong row center gap-8" style={{ marginBottom: 14 }}><Wallet size={15} color="var(--teal-700)" /> Volumen por rango de monto</div>
        <div className="col gap-12">
          {ranges.map((r) => (
            <div key={r.label}>
              <div className="row between center" style={{ marginBottom: 5 }}>
                <span className="small">{r.label}</span>
                <span className="tiny muted">{r.n} solicitud{r.n === 1 ? '' : 'es'}</span>
              </div>
              <div style={{ height: 8, background: 'var(--surface-3, #eef2f6)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${(r.n / maxRange) * 100}%`, height: '100%', background: 'var(--navy, #1e3a8a)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
