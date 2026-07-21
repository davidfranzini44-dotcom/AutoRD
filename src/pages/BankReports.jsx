import { Inbox, CheckCircle2, XCircle, Clock, TrendingUp } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BankLogo from '../components/BankLogo'
import useBankIdentity from '../hooks/useBankIdentity'
import { fmtRD } from '../data/demo'

const KPIS = [
  { icon: Inbox, v: 56, l: 'Solicitudes recibidas', s: 'Últimos 30 días' },
  { icon: CheckCircle2, v: 22, l: 'Pre-aprobadas', s: '39% de aprobación' },
  { icon: XCircle, v: 9, l: 'Rechazadas', s: '16%' },
  { icon: Clock, v: '2.4 h', l: 'Tiempo de respuesta', s: 'Promedio' },
]
const BY_DEALER = [
  { dealer: 'Auto América', apps: 21, approved: 9, volume: 18600000 },
  { dealer: 'Top Auto RD', apps: 18, approved: 8, volume: 15200000 },
  { dealer: 'Autoimport SRL', apps: 17, approved: 5, volume: 12900000 },
]
const max = Math.max(...BY_DEALER.map((d) => d.apps))

export default function BankReports() {
  const { profile } = useAuth() || {}
  const bank = useBankIdentity(profile)

  return (
    <div>
      <div className="admin-head">
        <div className="row center gap-8">
          <div className="bank-console-logo">
            <BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={32} />
          </div>
          <div>
            <h1 style={{ fontSize: 22 }}>Reportes - {bank.name}</h1>
            <p className="tiny muted">Desempeño de tu portafolio de solicitudes</p>
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        {KPIS.map((k) => {
          const Icon = k.icon
          return (
            <div className="metric-card" key={k.l}>
              <div className="mc-ic"><Icon size={19} /></div>
              <div className="mc-v">{k.v}</div>
              <div className="mc-l">{k.l}</div>
              <div className="tiny muted" style={{ marginTop: 2 }}>{k.s}</div>
            </div>
          )
        })}
      </div>

      <div className="card card-pad">
        <div className="row between center" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 15 }}>Solicitudes por dealer</h3>
          <span className="tiny muted"><TrendingUp size={13} style={{ verticalAlign: -2 }} /> Últimos 30 días</span>
        </div>
        <div className="col gap-16">
          {BY_DEALER.map((d) => (
            <div key={d.dealer}>
              <div className="row between center" style={{ marginBottom: 6 }}>
                <span className="small strong">{d.dealer}</span>
                <span className="tiny muted">{d.apps} solicitudes · {d.approved} aprobadas · {fmtRD(d.volume)}</span>
              </div>
              <div style={{ height: 10, background: 'var(--surface-3)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${(d.apps / max) * 100}%`, height: '100%', background: 'var(--teal-700)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
