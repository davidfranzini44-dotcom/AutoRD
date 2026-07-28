import { useEffect, useMemo, useState } from 'react'
import {
  MessageCircle, FileText, Landmark, X, AlertTriangle, Send, Eye, CheckCircle2, Wallet, ShieldCheck, BadgeCheck,
} from 'lucide-react'
import { getDealerData, getClientHistoryForDealer, getDealerPreapprovalInterests, getDealerApplications, LIVE } from '../data/api'
import { useAuth } from '../context/AuthContext'
import { fmtMoney } from '../data/demo'
import CarImage from '../components/CarImage'
import WhatsAppIcon from '../components/WhatsAppIcon'
import { buildFinancing, FIN_STAGES, finStage, kycLink } from '../data/dealerDemo'

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : ''
// Real applications may have no vehicle yet (an open pre-approval), so every
// message has to read correctly with or without one.
const vehName = (a) => (a.vehicle ? a.vehicle.name : 'tu financiamiento')
const ofVeh = (a) => (a.vehicle ? ` del ${a.vehicle.name}` : '')
const kycAppMsg = (a) => `Hola ${a.customer}, para continuar con tu financiamiento${ofVeh(a)} primero verifica tu identidad (cédula + prueba de vida, sin crear cuenta, ~2 min): ${kycLink(ORIGIN, { vehiculo: a.vehicle?.id, nombre: a.customer })}`

const digits = (p) => String(p || '').replace(/[^\d]/g, '')
const waLink = (phone, text) => `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`
const TONE = {
  green: { bg: '#dcfce7', fg: '#166534' }, red: { bg: '#fee2e2', fg: '#b91c1c' },
  amber: { bg: '#fef3c7', fg: '#b45309' }, blue: { bg: '#dbeafe', fg: '#1d4ed8' },
}
// Covers BOTH the demo vocabulary and the real bank_response_status enum.
const BANK_STATUS = {
  en_evaluacion: { label: 'En evaluación', tone: 'blue' },
  pendiente: { label: 'Enviado, sin respuesta', tone: 'blue' },
  preaprobado: { label: 'Pre-aprobado', tone: 'green' },
  preaprobada: { label: 'Pre-aprobado', tone: 'green' },
  oferta: { label: 'Aprobado', tone: 'green' },
  condicional: { label: 'Aprobado con condiciones', tone: 'green' },
  rechazado: { label: 'Rechazado', tone: 'red' },
  rechazada: { label: 'Rechazado', tone: 'red' },
  documentos: { label: 'Solicita documentos', tone: 'amber' },
  pendiente_docs: { label: 'Solicita documentos', tone: 'amber' },
}
const APPROVED_STATUS = ['preaprobado', 'preaprobada', 'oferta', 'condicional']
const StatusBadge = ({ st }) => {
  const s = finStage(st); const t = TONE[s.tone] || TONE.blue
  return <span className="chip" style={{ background: t.bg, color: t.fg }}>{s.label}</span>
}

// The dealer cannot see WHICH documents the bank asked for (that stays between
// the client and the bank), so the nudge stays general.
const docMsg = (a) => `Hola ${a.customer}, el banco solicitó documentos para avanzar con su financiamiento${ofVeh(a)}. Puede subirlos desde el enlace que le enviamos. ¿Necesita ayuda?`
const offerMsg = (a) => a.best
  ? `Hola ${a.customer}, ¡buenas noticias! ${a.best.bank} aprobó su financiamiento${ofVeh(a)}${a.best.apr ? ` al ${a.best.apr}%` : ''}${a.best.monthly ? ` (cuota aprox. ${fmtMoney(a.best.monthly, 'DOP')}/mes)` : ''}. ¿Coordinamos la firma?`
  : `Hola ${a.customer}, tengo novedades sobre su financiamiento${ofVeh(a)}. ¿Podemos conversar?`

export default function DealerFinancing() {
  const { profile } = useAuth() || {}
  const [inventory, setInventory] = useState([])
  const [leads, setLeads] = useState([])
  const [filter, setFilter] = useState('')
  const [active, setActive] = useState(null)

  const [interests, setInterests] = useState([])
  const [realApps, setRealApps] = useState([])
  const isDemo = !LIVE

  useEffect(() => {
    let alive = true
    getDealerData(profile?.dealer_id).then((d) => { if (alive) { setInventory(d.inventory || []); setLeads(d.leads || []) } }).catch(() => {})
    getDealerPreapprovalInterests().then((r) => { if (alive) setInterests(r) }).catch(() => {})
    getDealerApplications(profile?.dealer_id).then((r) => { if (alive) setRealApps(r) }).catch(() => {})
    return () => { alive = false }
  }, [profile?.dealer_id])

  // Real leads whose buyer arrives with an active bank pre-approval for this car —
  // the fast path: identity already verified, budget already blessed by a bank.
  const preApproved = leads.filter((l) => l.preApproval)

  // REAL applications for this dealer. (Offline demo mode still gets sample rows
  // so the console is explorable without a backend — but a live dealer must only
  // ever see their own customers.)
  const apps = useMemo(() => (isDemo ? buildFinancing(inventory) : realApps), [isDemo, inventory, realApps])
  const shown = filter ? apps.filter((a) => a.status === filter) : apps
  const countFor = (key) => apps.filter((a) => a.status === key).length

  return (
    <div className="dlrx">
      <div className="container dlrx-container">
      <div className="dlrx-head">
        <div>
          <h1>Financiamiento</h1>
          <p className="small muted">Solicitudes por vehículo, bancos, KYC, documentos y ofertas.</p>
        </div>
      </div>

      <div className="fin-tabs-strip" style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', gap: 8, marginBottom: 16, paddingBottom: 4, scrollbarWidth: 'none' }}>
        <button className={`chip ${filter === '' ? 'chip-teal' : ''}`} style={{ cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', height: 34, padding: '0 14px', border: filter === '' ? 'none' : '1px solid var(--line-2, #e2e8f0)', background: filter === '' ? undefined : 'transparent' }} onClick={() => setFilter('')}>Todas ({apps.length})</button>
        {FIN_STAGES.map((s) => {
          const n = countFor(s.key); if (!n) return null
          const t = TONE[s.tone] || TONE.blue
          const on = filter === s.key
          return (
            <button key={s.key} className="chip" style={{ cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', height: 34, padding: '0 14px', background: on ? t.bg : 'transparent', color: on ? t.fg : 'var(--muted)', border: on ? 'none' : '1px solid var(--line-2, #e2e8f0)' }} onClick={() => setFilter(on ? '' : s.key)}>
              {s.label} ({n})
            </button>
          )
        })}
      </div>

      {interests.length > 0 && filter === '' && (
        <div className="col gap-8" style={{ marginBottom: 16 }}>
          <div className="row center gap-8"><BadgeCheck size={16} color="var(--teal-700)" /><h2 style={{ fontSize: 15, margin: 0 }}>Interesados con pre-aprobación</h2></div>
          <p className="tiny muted" style={{ margin: '-2px 0 2px' }}>Ya tienen financiamiento aprobado y pueden comprar estos vehículos ahora mismo.</p>
          {interests.map((it) => (
            <div className="card card-pad" key={it.id} style={{ borderLeft: '3px solid var(--teal-600, #0f9d8f)' }}>
              <div className="row between center wrap gap-10">
                <div style={{ minWidth: 0 }}>
                  <div className="strong">{it.customer || 'Cliente'}</div>
                  <div className="tiny muted">Interesado en {it.vehicle}{it.price ? ` · ${fmtMoney(it.price, 'DOP')}` : ''}</div>
                </div>
                <span className="chip" style={{ background: '#dcfce7', color: '#166534' }}>
                  <BadgeCheck size={13} /> {it.approvedAmount ? `Aprobado hasta ${fmtMoney(it.approvedAmount, 'DOP')}` : 'Pre-aprobado'}
                </span>
              </div>
              <div className="row wrap gap-16" style={{ margin: '10px 0' }}>
                <Metric label="KYC" value={it.kyc === 'aprobado' ? 'Verificado' : 'Pendiente'} />
                <Metric label="Vigencia" value={it.validUntil ? `Hasta ${fmtDay(it.validUntil)}` : 'Sin vencimiento'} />
                <Metric label="Mostró interés" value={fmtDay(it.createdAt) || '—'} />
              </div>
              {it.phone && (
                <a className="btn btn-sm" style={{ background: '#25D366', color: '#fff', border: 'none' }} target="_blank" rel="noreferrer"
                  href={waLink(it.phone, `Hola ${it.customer || ''}, vi que estás interesado en el ${it.vehicle} y ya tienes tu financiamiento pre-aprobado. ¿Coordinamos una cita para verlo?`)}>
                  <WhatsAppIcon size={15} /> Contactar ahora
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {preApproved.length > 0 && filter === '' && (
        <div className="col gap-8" style={{ marginBottom: 16 }}>
          <div className="row center gap-8"><Landmark size={16} color="var(--teal-700)" /><h2 style={{ fontSize: 15, margin: 0 }}>Clientes pre-aprobados · cierre rápido</h2></div>
          <p className="tiny muted" style={{ margin: '-2px 0 2px' }}>Identidad verificada y presupuesto aprobado por un banco. Solo falta coordinar la firma.</p>
          {preApproved.map((l, i) => <PreApprovedCard key={l.buyerId || i} lead={l} />)}
        </div>
      )}

      <div className="col gap-12">
        {shown.map((a) => (
          <div className="card card-pad" key={a.id}>
            <div className="row between center wrap gap-10" style={{ marginBottom: 10 }}>
              <div role="button" tabIndex={0} className="row center gap-10 dl-customer-open" onClick={() => setActive(a)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(a) } }} style={{ minWidth: 0, cursor: 'pointer' }}>
                <div className="dash-top-photo fin-thumb" style={{ width: 60, height: 44 }}>
                  {a.vehicle
                    ? <CarImage make={a.vehicle.make} model={a.vehicle.model} bodyType={a.vehicle.bodyType} seed={a.vehicle.id || a.id} tone={a.vehicle.tone} photo={a.vehicle.photo} />
                    : <div className="row center" style={{ width: '100%', height: '100%', justifyContent: 'center', background: 'var(--teal-50)', color: 'var(--teal-700)' }}><Landmark size={18} /></div>}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="strong" style={{ textDecoration: 'underline', textDecorationColor: 'var(--line, #d9e5e7)', textUnderlineOffset: 3 }}>{a.customer}</div>
                  <div className="tiny muted">{a.id} · {a.vehicle ? a.vehicle.name : 'Pre-aprobación sin vehículo'}</div>
                </div>
              </div>
              <StatusBadge st={a.status} />
            </div>

            <div className="row wrap gap-16" style={{ marginBottom: 10 }}>
              <Metric label="Monto solicitado" value={a.amount ? fmtMoney(a.amount, 'DOP') : '—'} />
              <Metric label="Inicial" value={a.down ? fmtMoney(a.down, 'DOP') : '—'} />
              <Metric label="Plazo" value={a.term ? `${a.term} años` : '—'} />
              <Metric label="Bancos" value={a.banks.length ? `${a.banks.length} enviados` : '—'} />
              {a.best && <Metric label="Mejor oferta" value={`${a.best.bank}${a.best.apr ? ` · ${a.best.apr}%` : ''}`} accent />}
            </div>

            {a.clientAccepted && (
              <div className="notice" style={{ borderColor: '#bbf7d0', background: '#f0fdf4', marginBottom: 10 }}>
                <CheckCircle2 size={15} color="#166534" /><span className="small">Cliente aceptó{a.acceptedBank ? ` la oferta de ${a.acceptedBank}` : ''} — coordina seguro, firma y entrega.</span>
              </div>
            )}
            {a.docsRequested && !a.clientAccepted && (
              <div className="notice" style={{ borderColor: '#fde68a', background: '#fffbeb', marginBottom: 10 }}>
                <AlertTriangle size={15} color="#b45309" /><span className="small">Un banco solicitó documentos al cliente.</span>
              </div>
            )}

            <div className="row wrap gap-8">
              <button className="btn btn-outline btn-sm" onClick={() => setActive(a)}><Eye size={14} /> Ver solicitud</button>
              {a.status === 'kyc_pendiente' && a.vehicle && <a className="btn btn-navy btn-sm" href={waLink(a.phone, kycAppMsg(a))} target="_blank" rel="noreferrer"><ShieldCheck size={14} /> Solicitar KYC</a>}
              {a.docsRequested && a.status !== 'kyc_pendiente' && <a className="btn btn-outline btn-sm" href={waLink(a.phone, docMsg(a))} target="_blank" rel="noreferrer"><FileText size={14} /> Recordar documentos</a>}
              <a className="btn btn-outline btn-sm" href={waLink(a.phone, offerMsg(a))} target="_blank" rel="noreferrer"><Send size={14} /> Enviar oferta</a>
              <a className="btn btn-sm" href={waLink(a.phone, `Hola ${a.customer}, le contactamos por su financiamiento${a.vehicle ? ` del ${a.vehicle.name}` : ''}.`)} target="_blank" rel="noreferrer" style={{ background: '#25D366', color: '#fff', border: 'none' }}><WhatsAppIcon size={15} /> WhatsApp</a>
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="card card-pad" style={{ textAlign: 'center' }}>
            {filter ? (
              <div className="muted tiny">No hay solicitudes en este estado.</div>
            ) : (
              <>
                <div className="verify-ic" style={{ width: 44, height: 44, borderRadius: 12, margin: '0 auto 10px', background: 'var(--teal-50)', color: 'var(--teal-700)' }}><Landmark size={20} /></div>
                <div className="strong small">Aún no tienes solicitudes de financiamiento</div>
                <div className="tiny muted" style={{ marginTop: 4, maxWidth: 420, marginInline: 'auto', lineHeight: 1.45 }}>
                  Cuando un cliente solicite financiamiento por uno de tus vehículos, aparecerá aquí con su estado de KYC y las respuestas de los bancos.
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {active && <AppDrawer app={active} onClose={() => setActive(null)} />}
      </div>
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

const fmtDay = (d) => {
  if (!d) return null
  const s = String(d).length === 10 ? `${d}T12:00:00` : d
  const dt = new Date(s)
  return Number.isFinite(dt.getTime()) ? dt.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }) : null
}
const OUTCOME = {
  aprobado: { label: 'Aprobado', bg: '#dcfce7', fg: '#166534' },
  condicional: { label: 'Aprobado condicional', bg: '#dcfce7', fg: '#166534' },
  preaprobado: { label: 'Pre-aprobado', bg: '#e0f2fe', fg: '#0369a1' },
  docs: { label: 'Pidió documentos', bg: '#fef3c7', fg: '#b45309' },
  evaluando: { label: 'En evaluación', bg: '#dbeafe', fg: '#1d4ed8' },
  rechazado: { label: 'No aprobado', bg: '#fee2e2', fg: '#b91c1c' },
  sin_respuesta: { label: 'Sin respuesta', bg: '#f1f5f9', fg: '#64748b' },
}

// A real, pre-approved lead: fast-track badge + past outcomes (no credit detail).
function PreApprovedCard({ lead }) {
  const [showHist, setShowHist] = useState(false)
  const pa = lead.preApproval || {}
  const until = fmtDay(pa.validUntil)
  return (
    <div className="card card-pad" style={{ borderLeft: '3px solid var(--teal-600, #0f9d8f)' }}>
      <div className="row between center wrap gap-10">
        <div style={{ minWidth: 0 }}>
          <div className="strong">{lead.customer}</div>
          <div className="tiny muted">{lead.vehicle}</div>
        </div>
        {lead.clientAccepted
          ? <span className="chip" style={{ background: '#16a34a', color: '#fff' }}><BadgeCheck size={13} /> Cliente aceptó{lead.acceptedBank ? ` · ${lead.acceptedBank}` : ''}</span>
          : <span className="chip" style={{ background: '#dcfce7', color: '#166534' }}><BadgeCheck size={13} /> {pa.approvedAmount ? `Pre-aprobado hasta ${fmtMoney(pa.approvedAmount, 'DOP')}` : 'Pre-aprobado'}</span>}
      </div>
      <div className="row wrap gap-16" style={{ margin: '10px 0' }}>
        <Metric label="Banco" value={pa.bankName || '—'} />
        <Metric label="KYC" value={lead.kyc === 'aprobado' ? 'Verificado' : 'Pendiente'} />
        <Metric label="Vigencia" value={until ? `Válido hasta ${until}` : 'Sin fecha de vencimiento'} />
      </div>
      <div className="row wrap gap-8">
        <button className="btn btn-outline btn-sm" onClick={() => setShowHist((v) => !v)}>
          <FileText size={14} /> {showHist ? 'Ocultar historial' : 'Ver historial del cliente'}
        </button>
      </div>
      {showHist && <ClientHistoryDealer buyerId={lead.buyerId} />}
    </div>
  )
}

// Outcomes-only history for the dealer — never income, cédula, or credit detail.
function ClientHistoryDealer({ buyerId }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    if (!buyerId) { setRows([]); return () => { alive = false } }
    getClientHistoryForDealer(buyerId).then((r) => { if (alive) setRows(r) }).catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [buyerId])
  if (rows == null) return <div className="tiny muted" style={{ marginTop: 10 }}>Cargando historial…</div>
  if (rows.length === 0) return <div className="tiny muted" style={{ marginTop: 10 }}>Sin solicitudes previas con tu concesionario.</div>
  return (
    <div className="col gap-6" style={{ marginTop: 10 }}>
      {rows.map((r) => {
        const o = OUTCOME[r.outcome] || OUTCOME.sin_respuesta
        return (
          <div className="row between center" key={r.applicationId} style={{ borderTop: '1px solid var(--line-2, #eef2f4)', paddingTop: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div className="small strong">{r.vehicle || 'Pre-aprobación'}</div>
              <div className="tiny muted">{fmtDay(r.createdAt)} · KYC {r.kyc === 'aprobado' ? 'ok' : 'pend.'}</div>
            </div>
            <span className="chip" style={{ background: o.bg, color: o.fg }}>{o.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function AppDrawer({ app, onClose }) {
  const banks = Array.isArray(app.banks) ? app.banks : []
  const missing = Array.isArray(app.missing) ? app.missing : []
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
          {app.vehicle ? (
            <div className="row center gap-10">
              <div className="dash-top-photo fin-thumb" style={{ width: 72, height: 52 }}><CarImage make={app.vehicle.make} model={app.vehicle.model} bodyType={app.vehicle.bodyType} seed={app.vehicle.id || app.id} tone={app.vehicle.tone} photo={app.vehicle.photo} /></div>
              <div><div className="strong small">{app.vehicle.name}</div>{app.vehicle.price ? <div className="tiny muted">{fmtMoney(app.vehicle.price, app.vehicle.currency)}</div> : null}</div>
            </div>
          ) : (
            <div className="notice"><Landmark size={15} /><span className="small">Pre-aprobación sin vehículo — el cliente aún no ha elegido carro.</span></div>
          )}

          <div className="card" style={{ padding: 12 }}>
            <Row k="Teléfono" v={app.phone || '—'} />
            <Row k="Identidad (KYC)" v={app.kyc === 'aprobado' ? 'Verificada' : 'Pendiente'} />
            <Row k="Consentimiento" v={app.consent ? 'Firmado' : 'Pendiente'} />
          </div>

          <div className="card" style={{ padding: 12 }}>
            <Row k="Monto solicitado" v={app.amount ? fmtMoney(app.amount, 'DOP') : '—'} />
            <Row k="Inicial" v={app.down ? fmtMoney(app.down, 'DOP') : '—'} />
            <Row k="Plazo" v={app.term ? `${app.term} años` : '—'} />
            {app.clientAccepted && <Row k="Aceptada por el cliente" v={app.acceptedBank || 'Sí'} />}
          </div>
          {/* Income and the buyer's documents are deliberately absent: RLS keeps
              them between the client and the bank. */}

          <div>
            <div className="tiny strong" style={{ textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)', marginBottom: 6 }}>Bancos</div>
            {banks.length ? (
              <div className="col gap-6">
                {banks.map((b) => {
                  const info = BANK_STATUS[b.status] || BANK_STATUS.en_evaluacion
                  const t = TONE[info.tone] || TONE.blue
                  return (
                    <div key={b.name} className="row between center" style={{ border: '1px solid var(--line-2, #e2e8f0)', borderRadius: 8, padding: '8px 12px' }}>
                      <span className="small row center gap-6"><Landmark size={14} className="muted" /> {b.name}</span>
                      {APPROVED_STATUS.includes(b.status)
                        ? <span className="chip" style={{ background: '#dcfce7', color: '#166534' }}><CheckCircle2 size={12} /> {info.label}{b.apr ? ` · ${b.apr}%` : ''}</span>
                        : <span className="chip" style={{ background: t.bg, color: t.fg }}>{info.label}</span>}
                    </div>
                  )
                })}
              </div>
            ) : <span className="tiny muted">Aún no enviado a bancos</span>}
          </div>

          {app.best && (
            <div className="notice" style={{ borderColor: 'var(--green-bd, #bbf7d0)', background: 'var(--green-bg, #f0fdf4)' }}>
              <Wallet size={15} color="#166534" /><span className="small">Aprobado por {app.best.bank}{app.best.apr ? ` al ${app.best.apr}%` : ''}{app.best.monthly ? ` · cuota aprox. ${fmtMoney(app.best.monthly, 'DOP')}/mes` : ''}</span>
            </div>
          )}

          {missing.length > 0 && (
            <div>
              <div className="tiny strong" style={{ textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)', marginBottom: 6 }}>Documentos faltantes</div>
              <div className="col gap-4">
                {missing.map((m) => <div key={m} className="row center gap-6 small"><AlertTriangle size={13} color="#b45309" /> {m}</div>)}
              </div>
            </div>
          )}

          <div className="row wrap gap-8">
            {app.status === 'kyc_pendiente' && <a className="btn btn-navy btn-block" href={waLink(app.phone, kycAppMsg(app))} target="_blank" rel="noreferrer"><ShieldCheck size={15} /> Solicitar verificación (KYC)</a>}
            {missing.length > 0 && app.status !== 'kyc_pendiente' && <a className="btn btn-outline btn-block" href={waLink(app.phone, docMsg(app))} target="_blank" rel="noreferrer"><FileText size={15} /> Solicitar documentos</a>}
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
