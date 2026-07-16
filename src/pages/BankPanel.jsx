import { useState, useEffect } from 'react'
import {
  Inbox, Loader2, FileWarning, CheckCircle2, XCircle, Search,
  ShieldCheck, FileCheck2, Car, Building2, Upload, Info, Landmark, Send,
} from 'lucide-react'
import { bankStatusMeta, fmtRD } from '../data/demo'
import { getBankApplications, submitBankResponse } from '../data/api'
import { useAuth } from '../context/AuthContext'
import StatusChip from '../components/StatusChip'

const FILTERS = [
  { id: 'todas', label: 'Todas' },
  { id: 'nueva', label: 'Nueva' },
  { id: 'evaluando', label: 'En evaluación' },
  { id: 'docs', label: 'Pendiente documentos' },
  { id: 'preaprobada', label: 'Pre-aprobada' },
  { id: 'rechazada', label: 'Rechazada' },
]

const METRIC = [
  { icon: Inbox, value: 12, label: 'Nuevas hoy' },
  { icon: Loader2, value: 18, label: 'En evaluación' },
  { icon: FileWarning, value: 5, label: 'Pendiente docs' },
  { icon: CheckCircle2, value: 22, label: 'Pre-aprobadas' },
]

export default function BankPanel() {
  const [filter, setFilter] = useState('todas')
  const [apps, setApps] = useState([])
  const [selId, setSelId] = useState(null)
  const { profile } = useAuth() || {}

  useEffect(() => {
    let alive = true
    getBankApplications(profile?.bank_id, 'todas').then((data) => {
      if (!alive) return
      setApps(data)
      setSelId((cur) => cur || data[0]?.id || null)
    })
    return () => { alive = false }
  }, [profile?.bank_id])

  const list = apps.filter((a) => filter === 'todas' || a.status === filter)
  const sel = apps.find((a) => a.id === selId) || list[0]

  return (
    <main className="page">
      <div className="container">
        <div className="admin-head">
          <div className="row center gap-8">
            <div className="avatar" style={{ background: '#12805c' }}>BHD</div>
            <div>
              <h1 style={{ fontSize: 22 }}>Panel del banco — BHD</h1>
              <p className="tiny muted">Revisa solicitudes y registra tus respuestas de crédito</p>
            </div>
          </div>
          <span className="chip chip-navy" style={{ height: 30 }}><ShieldCheck size={14} /> La evaluación de crédito la realiza el banco de forma externa</span>
        </div>

        {/* Metrics */}
        <div className="grid grid-4" style={{ marginBottom: 18 }}>
          {METRIC.map((m) => {
            const Icon = m.icon
            return (
              <div className="metric-card" key={m.label}>
                <div className="mc-ic"><Icon size={19} /></div>
                <div className="mc-v">{m.value}</div>
                <div className="mc-l">{m.label}</div>
              </div>
            )
          })}
        </div>

        {/* Filters */}
        <div className="row between center wrap gap-12" style={{ marginBottom: 14 }}>
          <div className="tabbar">
            {FILTERS.map((f) => (
              <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          <div className="row center" style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--muted)' }} />
            <input className="input" placeholder="Buscar por cliente o cédula…" style={{ height: 38, paddingLeft: 32, width: 240 }} />
          </div>
        </div>

        <div className="split">
          {/* Queue */}
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>ID</th><th>Solicitante</th><th>Vehículo</th><th className="num">Monto</th><th>KYC</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <tr key={a.id} onClick={() => setSelId(a.id)}
                      style={{ cursor: 'pointer', background: a.id === selId ? 'var(--teal-50)' : undefined }}>
                      <td className="mono-num tiny muted">{a.id}</td>
                      <td className="strong">{a.customer}</td>
                      <td className="muted">{a.vehicle}</td>
                      <td className="num">{fmtRD(a.amount)}</td>
                      <td><StatusChip status={a.kyc} /></td>
                      <td><span className={`chip ${bankStatusMeta[a.status].chip}`}>{bankStatusMeta[a.status].label}</span></td>
                    </tr>
                  ))}
                  {list.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 28 }}>Sin solicitudes en este estado.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail + response */}
          {sel && <ApplicationDetail key={sel.id} a={sel} />}
        </div>
      </div>
    </main>
  )
}

function ApplicationDetail({ a }) {
  const [decision, setDecision] = useState('')
  const [rate, setRate] = useState('')
  const [term, setTerm] = useState('7')
  const [monthly, setMonthly] = useState('')
  const [down, setDown] = useState('')
  const [notes, setNotes] = useState('')
  const [sent, setSent] = useState(false)

  const decisions = [
    { id: 'approved', label: 'Pre-aprobar', icon: CheckCircle2, cls: 'btn-primary' },
    { id: 'conditional', label: 'Condicional', icon: FileCheck2, cls: 'btn-navy' },
    { id: 'docs', label: 'Pedir docs', icon: FileWarning, cls: 'btn-outline' },
    { id: 'rejected', label: 'Rechazar', icon: XCircle, cls: 'btn-outline' },
  ]
  const needTerms = decision === 'approved' || decision === 'conditional'

  return (
    <aside className="side-panel col gap-16">
      <div className="card card-pad">
        <div className="row between center" style={{ marginBottom: 12 }}>
          <div>
            <div className="strong">{a.customer}</div>
            <div className="tiny muted mono-num">{a.id} · Cédula {a.cedula}</div>
          </div>
          <span className={`chip ${bankStatusMeta[a.status].chip}`}>{bankStatusMeta[a.status].label}</span>
        </div>

        {/* Applicant summary */}
        <SectionLabel icon={ShieldCheck} text="Solicitante y KYC" />
        <div className="kv"><span className="k">Ingreso declarado</span><span className="v">{fmtRD(a.income)}/mes</span></div>
        <div className="kv"><span className="k">Tipo de empleo</span><span className="v">{a.employment}</span></div>
        <div className="kv"><span className="k">Estado KYC</span><span className="v"><StatusChip status={a.kyc} /></span></div>
        <div className="kv"><span className="k">Consentimiento de crédito</span><span className="v"><span className="chip chip-green"><FileCheck2 size={13} /> Firmado</span></span></div>

        {/* Vehicle + dealer */}
        <SectionLabel icon={Car} text="Vehículo y dealer" style={{ marginTop: 14 }} />
        <div className="kv"><span className="k">Vehículo</span><span className="v">{a.vehicle}</span></div>
        <div className="kv"><span className="k">Dealer</span><span className="v">{a.dealer}</span></div>
        <div className="kv"><span className="k">Monto solicitado</span><span className="v">{fmtRD(a.amount)}</span></div>
        <div className="kv"><span className="k">Inicial</span><span className="v">{fmtRD(a.down)} ({Math.round(a.down / a.amount * 100)}%)</span></div>
        <div className="kv"><span className="k">Plazo solicitado</span><span className="v">{a.term} años</span></div>

        <div className="notice" style={{ marginTop: 12 }}>
          <Info size={16} /><span>La consulta al buró y la decisión de crédito se realizan en los sistemas del banco. AutoRD solo transmite la solicitud y el consentimiento.</span>
        </div>
      </div>

      {/* Document request */}
      <div className="card card-pad">
        <SectionLabel icon={Upload} text="Solicitar documentos" />
        <div className="row wrap gap-8" style={{ marginTop: 4 }}>
          {['Comprobante de ingresos', 'Carta de trabajo', 'Estados de cuenta'].map((d) => (
            <button key={d} className="chip" style={{ cursor: 'pointer', height: 30, border: '1px solid var(--line)', background: '#fff' }}>+ {d}</button>
          ))}
        </div>
        <button className="btn btn-outline btn-block btn-sm" style={{ marginTop: 12 }}><Upload size={15} /> Enviar solicitud de documentos</button>
      </div>

      {/* Manual response form */}
      <div className="card card-pad">
        <SectionLabel icon={Send} text="Registrar respuesta" />
        {sent ? (
          <div className="verify-row ok" style={{ marginTop: 6 }}>
            <div className="verify-ic"><CheckCircle2 size={20} /></div>
            <div className="grow"><div className="strong">Respuesta enviada</div><div className="tiny muted">El cliente y el dealer fueron notificados.</div></div>
          </div>
        ) : (
          <>
            <div className="grid grid-2" style={{ gap: 8, marginTop: 6 }}>
              {decisions.map((d) => {
                const Icon = d.icon
                const on = decision === d.id
                return (
                  <button key={d.id}
                    className={`btn btn-sm ${on ? d.cls : 'btn-outline'}`}
                    onClick={() => setDecision(d.id)}>
                    <Icon size={15} /> {d.label}
                  </button>
                )
              })}
            </div>

            {needTerms && (
              <div className="grid grid-2" style={{ gap: 10, marginTop: 12 }}>
                <F label="Tasa (%)"><input className="input" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="9.25" /></F>
                <F label="Plazo (años)">
                  <select className="select" value={term} onChange={(e) => setTerm(e.target.value)}>
                    <option>4</option><option>5</option><option>6</option><option>7</option>
                  </select>
                </F>
                <F label="Cuota mensual"><input className="input" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="RD$ 27,950" /></F>
                <F label="Inicial requerido"><input className="input" value={down} onChange={(e) => setDown(e.target.value)} placeholder="RD$ 250,000" /></F>
              </div>
            )}

            <div className="field" style={{ marginTop: 12 }}>
              <label>Notas para el cliente / dealer</label>
              <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Comentarios sobre la decisión, condiciones, requisitos…" />
            </div>

            <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={!decision} onClick={async () => {
              const statusMap = { approved: 'preaprobada', conditional: 'condicional', docs: 'pendiente_docs', rejected: 'rechazada' }
              try {
                await submitBankResponse(a.responseId, {
                  status: statusMap[decision], apr: rate || null, term: Number(term) || null,
                  monthly: monthly || null, down: down || null, notes,
                })
              } catch (_) { /* demo mode / offline: still confirm visually */ }
              setSent(true)
            }}>
              <Send size={16} /> Enviar respuesta al cliente
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

function SectionLabel({ icon: Icon, text, style }) {
  return (
    <div className="row center gap-8" style={{ margin: '2px 0 8px', ...style }}>
      <Icon size={16} color="var(--teal-700)" />
      <span className="small strong">{text}</span>
    </div>
  )
}
function F({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>
}
