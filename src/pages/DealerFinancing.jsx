import { useEffect, useMemo, useState } from 'react'
import {
  MessageCircle, FileText, Landmark, X, AlertTriangle, Send, Eye, CheckCircle2, Wallet,
} from 'lucide-react'
import { getDealerData } from '../data/api'
import { useAuth } from '../context/AuthContext'
import { fmtMoney } from '../data/demo'
import CarImage from '../components/CarImage'
import { buildFinancing, FIN_STAGES, finStage } from '../data/dealerDemo'

const digits = (p) => String(p || '').replace(/[^\d]/g, '')
const waLink = (phone, text) => `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`
const TONE = {
  green: { bg: '#dcfce7', fg: '#166534' }, red: { bg: '#fee2e2', fg: '#b91c1c' },
  amber: { bg: '#fef3c7', fg: '#b45309' }, blue: { bg: '#dbeafe', fg: '#1d4ed8' },
}
const StatusBadge = ({ st }) => {
  const s = finStage(st); const t = TONE[s.tone] || TONE.blue
  return <span className="chip" style={{ background: t.bg, color: t.fg }}>{s.label}</span>
}

const docMsg = (a) => `Hola ${a.customer}, para avanzar con su financiamiento del ${a.vehicle.name} necesitamos: ${a.missing.length ? a.missing.join(', ') : 'sus documentos de ingreso'}. ¿Los puede enviar por aquí?`
const offerMsg = (a) => a.best
  ? `Hola ${a.customer}, ¡buenas noticias! ${a.best.bank} pre-aprobó su financiamiento del ${a.vehicle.name} al ${a.best.apr}% (cuota aprox. ${fmtMoney(a.best.monthly, 'DOP')}/mes). ¿Coordinamos la firma?`
  : `Hola ${a.customer}, tengo novedades sobre su financiamiento del ${a.vehicle.name}. ¿Podemos conversar?`

export default function DealerFinancing() {
  const { profile } = useAuth() || {}
  const [inventory, setInventory] = useState([])
  const [filter, setFilter] = useState('')
  const [active, setActive] = useState(null)

  useEffect(() => {
    let alive = true
    getDealerData(profile?.dealer_id).then((d) => { if (alive) setInventory(d.inventory || []) }).catch(() => {})
    return () => { alive = false }
  }, [profile?.dealer_id])

  const apps = useMemo(() => buildFinancing(inventory), [inventory])
  const shown = filter ? apps.filter((a) => a.status === filter) : apps
  const countFor = (key) => apps.filter((a) => a.status === key).length

  return (
    <div>
      <div className="admin-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Financiamiento</h1>
          <p className="tiny muted">Solicitudes de financiamiento de tus vehículos</p>
        </div>
      </div>

      <div className="row wrap gap-6" style={{ marginBottom: 16 }}>
        <button className={`chip ${filter === '' ? 'chip-teal' : ''}`} style={{ cursor: 'pointer', border: filter === '' ? 'none' : '1px solid var(--line-2, #e2e8f0)', background: filter === '' ? undefined : 'transparent' }} onClick={() => setFilter('')}>Todas ({apps.length})</button>
        {FIN_STAGES.map((s) => {
          const n = countFor(s.key); if (!n) return null
          const t = TONE[s.tone] || TONE.blue
          const on = filter === s.key
          return (
            <button key={s.key} className="chip" style={{ cursor: 'pointer', background: on ? t.bg : 'transparent', color: on ? t.fg : 'var(--muted)', border: on ? 'none' : '1px solid var(--line-2, #e2e8f0)' }} onClick={() => setFilter(on ? '' : s.key)}>
              {s.label} ({n})
            </button>
          )
        })}
      </div>

      <div className="col gap-12">
        {shown.map((a) => (
          <div className="card card-pad" key={a.id}>
            <div className="row between center wrap gap-10" style={{ marginBottom: 10 }}>
              <div className="row center gap-10" style={{ minWidth: 0 }}>
                <div className="dash-top-photo" style={{ width: 60, height: 44 }}><CarImage make={a.vehicle.make} model={a.vehicle.model} bodyType={a.vehicle.bodyType} seed={a.vehicle.id || a.id} tone={a.vehicle.tone} photo={a.vehicle.photo} /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="strong">{a.customer}</div>
                  <div className="tiny muted">{a.id} · {a.vehicle.name}</div>
                </div>
              </div>
              <StatusBadge st={a.status} />
            </div>

            <div className="row wrap gap-16" style={{ marginBottom: 10 }}>
              <Metric label="Monto solicitado" value={fmtMoney(a.amount, 'DOP')} />
              <Metric label="Inicial" value={fmtMoney(a.down, 'DOP')} />
              <Metric label="Ingreso mensual" value={fmtMoney(a.income, 'DOP')} />
              <Metric label="Bancos" value={a.banks.length ? `${a.banks.length} enviados` : '—'} />
              {a.best && <Metric label="Mejor oferta" value={`${a.best.bank} · ${a.best.apr}%`} accent />}
            </div>

            {a.missing.length > 0 && (
              <div className="notice" style={{ borderColor: '#fde68a', background: '#fffbeb', marginBottom: 10 }}>
                <AlertTriangle size={15} color="#b45309" /><span className="small">Faltan documentos: {a.missing.join(', ')}</span>
              </div>
            )}

            <div className="row wrap gap-8">
              <button className="btn btn-outline btn-sm" onClick={() => setActive(a)}><Eye size={14} /> Ver solicitud</button>
              {a.missing.length > 0 && <a className="btn btn-outline btn-sm" href={waLink(a.phone, docMsg(a))} target="_blank" rel="noreferrer"><FileText size={14} /> Solicitar documentos</a>}
              <a className="btn btn-outline btn-sm" href={waLink(a.phone, offerMsg(a))} target="_blank" rel="noreferrer"><Send size={14} /> Enviar oferta</a>
              <a className="btn btn-sm" href={waLink(a.phone, `Hola ${a.customer}, le contactamos por su financiamiento del ${a.vehicle.name}.`)} target="_blank" rel="noreferrer" style={{ background: '#25D366', color: '#fff', border: 'none' }}><MessageCircle size={14} /> WhatsApp</a>
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="card card-pad muted tiny" style={{ textAlign: 'center' }}>No hay solicitudes en este estado.</div>}
      </div>

      {active && <AppDrawer app={active} onClose={() => setActive(null)} />}
    </div>
  )
}

function Metric({ label, value, accent }) {
  return (
    <div>
      <div className="tiny muted">{label}</div>
      <div className="strong small" style={accent ? { color: 'var(--teal-700)' } : undefined}>{value}</div>
    </div>
  )
}

function AppDrawer({ app, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 70, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <aside style={{ width: 'min(460px, 100%)', height: '100%', background: 'var(--surface, #fff)', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between center" style={{ padding: '16px 18px', borderBottom: '1px solid var(--line-2, #e2e8f0)', position: 'sticky', top: 0, background: 'var(--surface, #fff)' }}>
          <div>
            <h3 style={{ fontSize: 17 }}>{app.customer}</h3>
            <div className="tiny muted" style={{ marginBottom: 4 }}>{app.id}</div>
            <StatusBadge st={app.status} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="col gap-14" style={{ padding: 18 }}>
          <div className="row center gap-10">
            <div className="dash-top-photo" style={{ width: 72, height: 52 }}><CarImage make={app.vehicle.make} model={app.vehicle.model} bodyType={app.vehicle.bodyType} seed={app.vehicle.id || app.id} tone={app.vehicle.tone} photo={app.vehicle.photo} /></div>
            <div><div className="strong small">{app.vehicle.name}</div>{app.vehicle.price ? <div className="tiny muted">{fmtMoney(app.vehicle.price, app.vehicle.currency)}</div> : null}</div>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <Row k="Monto solicitado" v={fmtMoney(app.amount, 'DOP')} />
            <Row k="Inicial" v={fmtMoney(app.down, 'DOP')} />
            <Row k="Ingreso mensual" v={fmtMoney(app.income, 'DOP')} />
          </div>

          <div>
            <div className="tiny strong" style={{ textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)', marginBottom: 6 }}>Bancos</div>
            {app.banks.length ? (
              <div className="col gap-6">
                {app.banks.map((b) => (
                  <div key={b} className="row between center" style={{ border: '1px solid var(--line-2, #e2e8f0)', borderRadius: 8, padding: '8px 12px' }}>
                    <span className="small row center gap-6"><Landmark size={14} className="muted" /> {b}</span>
                    {app.best?.bank === b ? <span className="chip" style={{ background: '#dcfce7', color: '#166534' }}><CheckCircle2 size={12} /> {app.best.apr}%</span> : <span className="tiny muted">En evaluación</span>}
                  </div>
                ))}
              </div>
            ) : <span className="tiny muted">Aún no enviado a bancos</span>}
          </div>

          {app.best && (
            <div className="notice" style={{ borderColor: 'var(--green-bd, #bbf7d0)', background: 'var(--green-bg, #f0fdf4)' }}>
              <Wallet size={15} color="#166534" /><span className="small">Pre-aprobado por {app.best.bank} al {app.best.apr}% · cuota aprox. {fmtMoney(app.best.monthly, 'DOP')}/mes</span>
            </div>
          )}

          {app.missing.length > 0 && (
            <div>
              <div className="tiny strong" style={{ textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)', marginBottom: 6 }}>Documentos faltantes</div>
              <div className="col gap-4">
                {app.missing.map((m) => <div key={m} className="row center gap-6 small"><AlertTriangle size={13} color="#b45309" /> {m}</div>)}
              </div>
            </div>
          )}

          <div className="row wrap gap-8">
            {app.missing.length > 0 && <a className="btn btn-outline btn-block" href={waLink(app.phone, docMsg(app))} target="_blank" rel="noreferrer"><FileText size={15} /> Solicitar documentos</a>}
            <a className="btn btn-primary btn-block" href={waLink(app.phone, offerMsg(app))} target="_blank" rel="noreferrer"><Send size={15} /> Enviar oferta al cliente</a>
          </div>
        </div>
      </aside>
    </div>
  )
}
function Row({ k, v }) {
  return <div className="row between center" style={{ fontSize: 13, padding: '3px 0' }}><span className="muted">{k}</span><span className="strong">{v}</span></div>
}
