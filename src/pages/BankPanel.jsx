import { useState, useEffect, useMemo } from 'react'
import {
  Inbox, Loader2, FileWarning, CheckCircle2, XCircle, Search, ShieldCheck, FileCheck2,
  Car, Upload, Info, Send, FileText, ExternalLink, Plus, Clock, Users,
  AlertTriangle, ChevronLeft, UserCheck, Phone, Mail, MapPin, Briefcase, Eye, X,
  MessageSquare, ClipboardList, Filter, TimerReset, WalletCards, BadgeCheck,
} from 'lucide-react'
import { bankStatusMeta, fmtRD } from '../data/demo'
import {
  getApplicationDocuments, getBankApplications, getDocumentDownloadUrl,
  requestApplicationDocuments, submitBankResponse,
} from '../data/api'
import { useAuth } from '../context/AuthContext'
import StatusChip from '../components/StatusChip'
import BankLogo from '../components/BankLogo'
import CarImage from '../components/CarImage'
import useBankIdentity from '../hooks/useBankIdentity'
import { estimateMonthly } from '../data/finance'
import {
  REVIEWERS, DOC_TYPES, DOC_STATUS, TONE, enrichApp, bankStats,
} from '../data/bankDemo'

// Simple internal readiness score (0–100) derived from KYC / consent / docs / SLA.
const appScore = (a) => (a.kyc === 'aprobado' ? 40 : 0) + (a.consent ? 30 : 0) + (a.status !== 'docs' ? 20 : 0) + ((a.hoursWaiting || 0) < 24 ? 10 : 0)
const digits = (p) => String(p || '').replace(/[^\d]/g, '')
const waMsg = (a) => `Hola ${a.customer}, te contactamos por tu solicitud de financiamiento ${a.id}${a.vehicle ? ` del ${a.vehicle}` : ''}.`
const dash = (v) => (v == null || v === '' ? '—' : v)

const FILTERS = [
  { id: 'todas', label: 'Todas', tone: '' }, { id: 'nueva', label: 'Nuevas', tone: 'blue' },
  { id: 'evaluando', label: 'En evaluación', tone: '' }, { id: 'docs', label: 'Docs', tone: 'amber' },
  { id: 'preaprobada', label: 'Pre-aprobadas', tone: 'green' }, { id: 'rechazada', label: 'Rechazadas', tone: 'red' },
]
// status -> mockup pill palette
const STATUS_PILL = { nueva: 'blue', evaluando: '', docs: 'amber', preaprobada: 'green', rechazada: 'red' }
const statusPill = (s) => `pill ${STATUS_PILL[s] || ''}`

const Chip = ({ tone, children, style }) => {
  const t = TONE[tone] || TONE.slate
  return <span className="chip" style={{ background: t.bg, color: t.fg, ...style }}>{children}</span>
}

export default function BankPanel() {
  const [filter, setFilter] = useState('todas')
  const [raw, setRaw] = useState([])
  const [selId, setSelId] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [expOpen, setExpOpen] = useState(false) // full expediente pop-up
  const [showFilters, setShowFilters] = useState(false)
  const [q, setQ] = useState('')
  const [dealerF, setDealerF] = useState('')
  const [reviewerF, setReviewerF] = useState('')
  const [kycOnly, setKycOnly] = useState(false)
  const [consentOnly, setConsentOnly] = useState(false)
  const [docsOnly, setDocsOnly] = useState(false)
  // Session overlays (no backend): reviewer assignment + internal notes per app.
  const [overrides, setOverrides] = useState({}) // { [id]: { reviewer, notes:[] } }
  const { profile } = useAuth() || {}
  const bank = useBankIdentity(profile)

  useEffect(() => {
    let alive = true
    getBankApplications(profile?.bank_id, 'todas').then((data) => {
      if (!alive) return
      const enriched = (data || []).map(enrichApp)
      setRaw(enriched)
      setSelId((cur) => cur || enriched[0]?.id || null)
    }).catch(() => {})
    return () => { alive = false }
  }, [profile?.bank_id])

  // Close the expediente pop-up with Escape.
  useEffect(() => {
    if (!expOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setExpOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expOpen])

  const apps = useMemo(() => raw.map((a) => {
    const o = overrides[a.id]
    return o ? { ...a, reviewer: o.reviewer !== undefined ? o.reviewer : a.reviewer, notes: o.notes || [] } : a
  }), [raw, overrides])

  const dealers = [...new Set(apps.map((a) => a.dealer).filter(Boolean))].sort()
  const stats = bankStats(apps)
  const readyApps = apps.filter((a) => ['nueva', 'evaluando'].includes(a.status) && a.kyc === 'aprobado' && a.consent).length
  const missingConsent = apps.filter((a) => a.kyc === 'aprobado' && !a.consent).length
  const slaRisk = stats.waiting.length
  const unassigned = apps.filter((a) => !a.reviewer && !['preaprobada', 'rechazada'].includes(a.status)).length
  const approvalVolume = stats.totalApproved || 0
  const reviewerLoad = REVIEWERS.map((r) => ({
    ...r,
    count: apps.filter((a) => a.reviewer?.id === r.id && !['preaprobada', 'rechazada'].includes(a.status)).length,
    ready: apps.filter((a) => a.reviewer?.id === r.id && a.kyc === 'aprobado' && a.consent && a.status === 'evaluando').length,
  }))
  const maxLoad = Math.max(1, ...reviewerLoad.map((r) => r.count))

  const list = apps.filter((a) => {
    if (filter !== 'todas' && a.status !== filter) return false
    if (dealerF && a.dealer !== dealerF) return false
    if (reviewerF && a.reviewer?.id !== reviewerF) return false
    if (kycOnly && a.kyc !== 'aprobado') return false
    if (consentOnly && !a.consent) return false
    if (docsOnly && a.status !== 'docs') return false
    if (q) {
      const hay = `${a.customer} ${a.cedula} ${a.vehicle} ${a.dealer} ${a.id}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })
  const sel = apps.find((a) => a.id === selId) || null
  const filterCount = (id) => id === 'todas' ? apps.length : apps.filter((a) => a.status === id).length

  const openApp = (id) => { setSelId(id); setSheetOpen(true) }
  const assignReviewer = (id, reviewer) => setOverrides((o) => ({ ...o, [id]: { ...(o[id] || {}), reviewer } }))
  const addNote = (id, note) => setOverrides((o) => ({ ...o, [id]: { ...(o[id] || {}), notes: [{ ...note }, ...((o[id]?.notes) || [])] } }))
  const reviewReady = () => { setFilter('evaluando'); setKycOnly(true); setConsentOnly(true); setDocsOnly(false) }

  // 5 top KPIs (mockup order).
  const kpis = [
    { l: 'Nuevas hoy', v: stats.nuevas, delta: 'Recibidas', icon: Inbox },
    { l: 'Listas decisión', v: readyApps, delta: 'KYC + consentimiento', icon: ClipboardList },
    { l: 'Pendiente docs', v: stats.docs, tone: 'amber', pill: 'Requiere acción', icon: FileWarning },
    { l: 'SLA +24 h', v: slaRisk, tone: 'red', pill: 'Prioridad alta', icon: TimerReset },
    { l: 'Aprobado mes', v: approvalVolume ? fmtRD(approvalVolume) : 'RD$0', delta: `${stats.preaprobadas} ofertas`, icon: WalletCards },
  ]

  // Smart queue — 4 cards that each filter the list.
  const priority = [
    { key: 'ready', n: readyApps, label: 'Listas para decisión', onClick: reviewReady },
    { key: 'sla', n: slaRisk, label: 'SLA en riesgo', onClick: () => { setFilter('todas'); setShowFilters(true) } },
    { key: 'docs', n: stats.docs, label: 'Faltan documentos', onClick: () => { setFilter('docs'); setDocsOnly(true) } },
    { key: 'unassigned', n: unassigned, label: 'Sin analista asignado', onClick: () => { setReviewerF(''); setShowFilters(true) } },
  ]

  return (
    <main className="page bankx" style={{ '--bank-accent': bank.color || '#0f766e' }}>
      {/* Sticky top search + actions bar */}
      <div className="bankx-topbar">
        <div className="bankx-search">
          <Search size={16} />
          <input placeholder="Buscar cliente, cédula, dealer, vehículo o solicitud…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row center gap-8">
          <button className={`btn btn-sm ${showFilters ? 'btn-navy' : 'btn-outline'}`} onClick={() => setShowFilters((s) => !s)}><Filter size={15} /> Filtros</button>
          <button className="btn btn-primary btn-sm" onClick={reviewReady}><BadgeCheck size={15} /> Revisar listas</button>
        </div>
      </div>

      <div className="container bankx-container">
        <div className="bankx-head">
          <div>
            <div className="row center gap-10">
              <div className="bankx-brand-logo"><BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={30} /></div>
              <div>
                <h1>Mesa de crédito · {bank.name}</h1>
                <p className="muted small">Solicitudes listas, documentos y SLA en una sola cola de decisión.</p>
              </div>
            </div>
          </div>
          <span className="chip chip-navy bankx-ext"><ShieldCheck size={14} /> Evaluación de crédito externa</span>
        </div>

        {/* KPIs */}
        <div className="bankx-kpis">
          {kpis.map((k) => { const Icon = k.icon; return (
            <div className="bankx-kpi" key={k.l}>
              <div className="bankx-kpi-top">{k.l} <Icon size={15} /></div>
              <strong>{k.v}</strong>
              {k.pill ? <span className={`pill ${k.tone}`}>{k.pill}</span> : <span className="bankx-delta">{k.delta}</span>}
            </div>
          ) })}
        </div>

        {/* Command center: smart queue + analyst workload */}
        <div className="bankx-command">
          <div className="card pad">
            <div className="split">
              <div><div className="strong">Cola inteligente</div><p className="tiny muted">Cada tarjeta filtra la lista para empezar por lo más importante.</p></div>
            </div>
            <div className="bankx-priority">
              {priority.map((p) => (
                <button key={p.key} className="bankx-priority-card" onClick={p.onClick}>
                  <b>{p.n}</b><span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card pad">
            <div className="strong">Carga por analista</div>
            <div className="bankx-heat">
              {reviewerLoad.map((r) => (
                <button key={r.id} className="bankx-heat-row" onClick={() => { setReviewerF(r.id); setShowFilters(true) }}>
                  <span className="bankx-heat-name">{r.name.split(' ')[0]}</span>
                  <span className="bankx-bar"><i style={{ width: `${Math.round((r.count / maxLoad) * 100)}%` }} /></span>
                  <b>{r.count}</b>
                </button>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 12 }}>{unassigned} sin asignar · rebalancea sin salir del portal.</p>
          </div>
        </div>

        {/* Advanced filters (collapsible) */}
        {showFilters && (
          <div className="card pad bankx-filters">
            <div className="row wrap gap-10">
              <label className="col gap-4"><span className="tiny strong">Dealer</span>
                <select className="input" value={dealerF} onChange={(e) => setDealerF(e.target.value)} style={{ height: 38, minWidth: 160 }}>
                  <option value="">Todos</option>{dealers.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="col gap-4"><span className="tiny strong">Analista</span>
                <select className="input" value={reviewerF} onChange={(e) => setReviewerF(e.target.value)} style={{ height: 38, minWidth: 160 }}>
                  <option value="">Todos</option>{REVIEWERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
            </div>
            <div className="row wrap gap-8" style={{ marginTop: 12 }}>
              <FilterToggle on={kycOnly} onClick={() => setKycOnly((v) => !v)}>KYC aprobado</FilterToggle>
              <FilterToggle on={consentOnly} onClick={() => setConsentOnly((v) => !v)}>Consentimiento firmado</FilterToggle>
              <FilterToggle on={docsOnly} onClick={() => setDocsOnly((v) => !v)}>Faltan documentos</FilterToggle>
              {(dealerF || reviewerF || kycOnly || consentOnly || docsOnly) && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setDealerF(''); setReviewerF(''); setKycOnly(false); setConsentOnly(false); setDocsOnly(false) }}><X size={14} /> Limpiar</button>
              )}
            </div>
          </div>
        )}

        {/* Full-width credit workspace: queue on top, expediente below */}
        <div className="bankx-cw">
          <div className="bankx-qboard">
            <section className="card bankx-list">
              <div className="bankx-toolbar">
                <div style={{ marginBottom: 10 }}>
                  <div className="strong">Solicitudes activas</div>
                  <p className="tiny muted">Selecciona un cliente y revisa el expediente completo debajo.</p>
                </div>
                <div className="bankx-pills">
                  {FILTERS.map((f) => (
                    <button key={f.id} className={`pill ${filter === f.id ? 'active' : f.tone}`} onClick={() => setFilter(f.id)}>
                      {f.label} {filterCount(f.id)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bankx-ctable">
                <div className="bankx-crow head"><span>Cliente</span><span>Vehículo</span><span>Dealer</span><span className="money">Monto</span><span>Estado</span><span>Riesgo</span></div>
                {list.map((a) => {
                  const sc = appScore(a)
                  return (
                    <button key={a.id} className={`bankx-crow ${a.id === selId ? 'selected' : ''}`} onClick={() => { setSelId(a.id); setExpOpen(true) }}>
                      <div className="nowrap"><b>{a.customer}</b><div className="tiny muted">{a.maskedCedula} · {a.kyc === 'aprobado' ? 'KYC aprobado' : 'KYC pendiente'}{a.hoursWaiting != null ? ` · ${a.hoursWaiting} h` : ''}</div></div>
                      <div className="nowrap">{a.vehicle || 'Pre-aprobación sin vehículo'}{a.down ? <div className="tiny muted">Inicial {fmtRD(a.down)}</div> : null}</div>
                      <div className="nowrap muted small">{a.dealer || 'Directo AutoRD'}</div>
                      <div className="money"><b>{a.amount ? fmtRD(a.amount) : '—'}</b>{a.income ? <div className="tiny muted">Ingreso {fmtRD(a.income)}</div> : null}</div>
                      <span className={statusPill(a.status)}>{bankStatusMeta[a.status].label}</span>
                      <span className={`bankx-risk ${sc >= 70 ? '' : sc >= 50 ? 'amber' : 'red'}`}>{sc}</span>
                    </button>
                  )
                })}
                {list.length === 0 && <div className="muted small" style={{ textAlign: 'center', padding: 28 }}>Sin solicitudes con estos filtros.</div>}
              </div>
            </section>

            <aside className="bankx-qsummary">
              <span className="pill">Próxima mejor acción</span>
              <div><strong>{readyApps}</strong><div className="small" style={{ color: 'rgba(255,255,255,.78)' }}>clientes listos para decisión, ordenados por SLA y completitud.</div></div>
              <div className="bankx-kv-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="bankx-expmini"><span>Sin analista</span><b>{unassigned}</b></div>
                <div className="bankx-expmini"><span>Docs</span><b>{stats.docs}</b></div>
              </div>
              <div className="bankx-qactions">
                <button className="btn" onClick={() => { setReviewerF(''); setShowFilters(true) }}>Rebalancear</button>
                <button className="btn btn-primary" onClick={() => sel && assignReviewer(sel.id, REVIEWERS[0])} disabled={!sel}>Asignar a mí</button>
              </div>
            </aside>
          </div>
        </div>

        {/* Full expediente — opens as a pop-up on row click */}
        {expOpen && sel && (
          <div className="bankx-expmodal-overlay" onClick={() => setExpOpen(false)}>
            <div className="bankx-expmodal" onClick={(e) => e.stopPropagation()}>
              <div className="bankx-expmodal-head">
                <div>
                  <div className="tiny muted">Expediente · {sel.id}</div>
                  <div className="strong">{sel.customer}</div>
                </div>
                <button className="icon-btn" onClick={() => setExpOpen(false)} aria-label="Cerrar"><X size={18} /></button>
              </div>
              <div className="bankx-expmodal-body">
                <Expediente key={sel.id} a={sel} onAssign={(r) => assignReviewer(sel.id, r)} onAddNote={(n) => addNote(sel.id, n)} bank={bank} />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function FilterToggle({ on, onClick, children }) {
  return <button type="button" className="chip" onClick={onClick} style={{ cursor: 'pointer', background: on ? 'var(--teal-50)' : 'transparent', color: on ? 'var(--teal-700)' : 'var(--muted)', border: on ? '1px solid var(--teal-100)' : '1px solid var(--line)' }}>{on ? <CheckCircle2 size={13} /> : <Plus size={13} />} {children}</button>
}

// Full-width expediente for the selected application (below the queue). Reuses
// the existing DocWorkflow (document request/review) and DecisionForm (submit).
function Expediente({ a, onAssign, onAddNote, bank }) {
  const [docs, setDocs] = useState([])
  const [docStatus, setDocStatus] = useState({})
  const [noteInput, setNoteInput] = useState('')

  useEffect(() => {
    let alive = true
    const appId = a.applicationId || (a.status === 'docs' ? a.id : null)
    if (!appId) { setDocs([]); return () => { alive = false } }
    getApplicationDocuments(appId).then((rows) => { if (alive) setDocs(rows) }).catch(() => { if (alive) setDocs([]) })
    return () => { alive = false }
  }, [a.applicationId, a.id, a.status])

  const sc = appScore(a)
  const cuota = a.amount ? estimateMonthly(a.amount, 9.5, (Number(a.term) || 7) * 12) : null
  const ratio = cuota && a.income ? Math.round((cuota / a.income) * 100) : null
  const precioVenta = (Number(a.amount) || 0) + (Number(a.down) || 0)
  const contractHref = a.contractToken ? `/contrato/${a.contractToken}` : null

  const readiness = [
    { key: 'kyc', ok: a.kyc === 'aprobado', title: 'KYC DIDIT aprobado', sub: a.kyc === 'aprobado' ? 'Cédula + prueba de vida' : 'Identidad sin verificar', href: contractHref, cta: 'Ver' },
    { key: 'consent', ok: !!a.consent, title: 'Consentimiento firmado', sub: a.consent ? 'Banco autorizado para evaluar' : 'Aún no firmado', href: contractHref, cta: 'Contrato' },
    { key: 'docs', ok: a.status !== 'docs', warn: a.status === 'docs', title: 'Estados de cuenta', sub: a.status === 'docs' ? 'Pendientes del cliente' : 'Sin pendientes' },
  ]
  const okCount = readiness.filter((r) => r.ok).length

  return (
    <section className="bankx-exp">
      {/* Hero + Resumen para decidir */}
      <div className="bankx-exphero">
        <div className="bankx-exphero-main">
          <div className="bankx-exptitle">
            <div>
              <span className="pill">Solicitud {a.id}</span>
              <h2>{a.customer}</h2>
              <p>{a.vehicle || 'Pre-aprobación sin vehículo'} · {a.dealer || 'Directo AutoRD'} · {a.reviewerState}</p>
            </div>
            <span className={statusPill(a.status)}>{bankStatusMeta[a.status].label}</span>
          </div>
          <div className="bankx-expmini-grid">
            <div className="bankx-expmini"><span>Monto</span><b>{a.amount ? fmtRD(a.amount) : '—'}</b></div>
            <div className="bankx-expmini"><span>Inicial</span><b>{a.down ? fmtRD(a.down) : '—'}</b></div>
            <div className="bankx-expmini"><span>Ingreso</span><b>{a.income ? fmtRD(a.income) : '—'}</b></div>
            <div className="bankx-expmini"><span>Score interno</span><b>{sc}/100</b></div>
          </div>
        </div>

        <aside className="card pad">
          <div className="row between center">
            <div><div className="strong">Resumen para decidir</div><div className="tiny muted">Todo lo crítico antes de aprobar</div></div>
            <span className={`pill ${okCount === 3 ? 'green' : 'amber'}`}>{okCount}/3 ok</span>
          </div>
          <div className="bankx-readiness" style={{ marginTop: 12 }}>
            {readiness.map((r) => (
              <div className="bankx-readiness-row" key={r.key}>
                <span className={`bankx-check-ic ${r.ok ? 'ok' : r.warn ? 'warn' : 'bad'}`}>{r.ok ? <CheckCircle2 size={16} /> : r.warn ? <AlertTriangle size={16} /> : <XCircle size={16} />}</span>
                <div className="grow" style={{ minWidth: 0 }}><b className="small">{r.title}</b><div className="tiny muted">{r.sub}</div></div>
                {r.href && <a className="btn btn-outline btn-sm" href={r.href} target="_blank" rel="noreferrer">{r.cta}</a>}
              </div>
            ))}
          </div>
          <label className="row center gap-6 tiny" style={{ marginTop: 12 }}><UserCheck size={14} className="muted" />
            <select className="input" style={{ height: 34, fontSize: 12, padding: '2px 8px' }} value={a.reviewer?.id || ''} onChange={(e) => onAssign(REVIEWERS.find((r) => r.id === e.target.value) || null)}>
              <option value="">Sin analista asignado</option>{REVIEWERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </aside>
      </div>

      {/* Cliente / Vehículo / Capacidad */}
      <div className="bankx-expgrid">
        <section className="card pad">
          <div className="row between center" style={{ marginBottom: 10 }}><h3 style={{ fontSize: 15, margin: 0 }}>Cliente</h3><span className={`pill ${a.kyc === 'aprobado' ? 'green' : 'amber'}`}>{a.kyc === 'aprobado' ? 'Verificado' : 'Pendiente'}</span></div>
          <div className="bankx-infoline"><span>Cédula</span><b className="mono-num">{a.maskedCedula}</b></div>
          <div className="bankx-infoline"><span>Teléfono</span><b>{dash(a.phone)}</b></div>
          <div className="bankx-infoline"><span>Email</span><b>{dash(a.email)}</b></div>
          <div className="bankx-infoline"><span>Dirección</span><b>{dash(a.city)}</b></div>
          <div className="bankx-infoline"><span>Ocupación</span><b>{dash(a.employment)}</b></div>
        </section>
        <section className="card pad">
          <div className="row between center" style={{ marginBottom: 10 }}><h3 style={{ fontSize: 15, margin: 0 }}>Vehículo</h3>{!a.isPreapproval && <span className="pill blue">Financiado</span>}</div>
          {a.isPreapproval ? (
            <div className="tiny muted">Pre-aprobación sin vehículo — el cliente elige el carro después.</div>
          ) : (<>
            <div className="bankx-infoline"><span>Modelo</span><b>{dash(a.vehicle)}</b></div>
            <div className="bankx-infoline"><span>Precio venta</span><b>{precioVenta ? fmtRD(precioVenta) : '—'}</b></div>
            <div className="bankx-infoline"><span>Inicial</span><b>{a.down ? fmtRD(a.down) : '—'}</b></div>
            <div className="bankx-infoline"><span>Monto a financiar</span><b>{a.amount ? fmtRD(a.amount) : '—'}</b></div>
            <div className="bankx-infoline"><span>Dealer</span><b>{dash(a.dealer)}</b></div>
          </>)}
        </section>
        <section className="card pad">
          <div className="row between center" style={{ marginBottom: 10 }}><h3 style={{ fontSize: 15, margin: 0 }}>Capacidad</h3><span className={`pill ${ratio == null ? '' : ratio <= 35 ? 'green' : 'amber'}`}>{ratio == null ? 'Sin datos' : ratio <= 35 ? 'Apto' : 'Revisar'}</span></div>
          <div className="bankx-infoline"><span>Ingreso mensual</span><b>{a.income ? fmtRD(a.income) : '—'}</b></div>
          <div className="bankx-infoline"><span>Cuota estimada</span><b>{cuota ? `${fmtRD(Math.round(cuota))}/mes` : '—'}</b></div>
          <div className="bankx-infoline"><span>Relación cuota/ingreso</span><b>{ratio != null ? `${ratio}%` : '—'}</b></div>
          <div className="bankx-infoline"><span>Plazo solicitado</span><b>{a.term ? `${a.term} años` : '—'}</b></div>
          <div className="bankx-infoline"><span>Tasa sugerida</span><b>9.25%</b></div>
        </section>
      </div>

      {/* Documentos + Actividad */}
      <div className="bankx-docgrid">
        <DocWorkflow app={a} docs={docs} setDocs={setDocs} docStatus={docStatus} setDocStatus={setDocStatus} />
        <section className="card pad">
          <div className="row between center" style={{ marginBottom: 4 }}>
            <div><h3 style={{ fontSize: 15, margin: 0 }}>Actividad y comunicación</h3><div className="tiny muted">Historial de banco, dealer y cliente</div></div>
            {a.phone && <a className="btn btn-primary btn-sm" href={`https://wa.me/${digits(a.phone)}?text=${encodeURIComponent(waMsg(a))}`} target="_blank" rel="noreferrer"><MessageSquare size={14} /> WhatsApp</a>}
          </div>
          <div className="bankx-timeline" style={{ marginTop: 12 }}>
            {[...a.timeline].reverse().map((e, i) => (
              <div className="bankx-tlitem" key={i}>
                <span className={`bankx-tldot ${/pendiente|solicit/i.test(e.name) ? 'amber' : ''}`} />
                <div><b className="small">{e.name}</b><div className="tiny muted">{e.when} · {e.actor}{e.note ? ` · ${e.note}` : ''}</div></div>
              </div>
            ))}
            {a.timeline.length === 0 && <div className="tiny muted">Sin actividad todavía.</div>}
          </div>
        </section>
      </div>

      {/* Decision panel */}
      <div className="bankx-decpanel">
        <div className="bankx-dec-wide"><DecisionForm a={a} bank={bank} /></div>
        <section className="card pad">
          <div className="row between center" style={{ marginBottom: 10 }}><h3 style={{ fontSize: 15, margin: 0 }}>Notas internas</h3><span className="pill">Banco</span></div>
          <div className="tiny muted" style={{ marginBottom: 8 }}>Solo visibles para el banco. No se comparten con el cliente ni el dealer.</div>
          <div className="row gap-6">
            <input className="input" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Nueva nota…" style={{ height: 36 }} />
            <button className="btn btn-outline btn-sm" disabled={!noteInput.trim()} onClick={() => { onAddNote({ text: noteInput.trim(), by: a.reviewer?.name || 'Analista', when: 'Ahora' }); setNoteInput('') }}><Plus size={14} /></button>
          </div>
          <div className="col gap-6" style={{ marginTop: 10 }}>
            {(a.notes || []).length === 0 && <div className="bankx-notebox tiny muted">Sin notas todavía.</div>}
            {(a.notes || []).map((n, i) => (<div className="bankx-notebox" key={i}><b className="small">{n.by}</b><div className="small muted">{n.text}</div><div className="tiny muted">{n.when}</div></div>))}
          </div>
        </section>
      </div>
    </section>
  )
}

function ApplicationDetail({ a, onBack, onAssign, onAddNote, bank }) {
  const [docs, setDocs] = useState([])
  const [docStatus, setDocStatus] = useState({}) // local overlay: { [docId]: status }
  const [noteInput, setNoteInput] = useState('')
  const [tab, setTab] = useState('revision') // revision | decision

  useEffect(() => {
    let alive = true
    const appId = a.applicationId || (a.status === 'docs' ? a.id : null)
    if (!appId) { setDocs([]); return () => { alive = false } }
    getApplicationDocuments(appId).then((rows) => { if (alive) setDocs(rows) }).catch(() => { if (alive) setDocs([]) })
    return () => { alive = false }
  }, [a.applicationId, a.id, a.status])

  const [make, model] = (a.vehicle || '').split(' ')
  // Requisitos-before-deciding checklist state.
  const checklist = [
    { key: 'kyc', ok: a.kyc === 'aprobado', title: 'KYC DIDIT', sub: a.kyc === 'aprobado' ? 'Cédula + prueba de vida' : 'Identidad sin verificar', action: null },
    { key: 'consent', ok: !!a.consent, title: 'Consentimiento', sub: a.consent ? 'Banco autorizado a evaluar' : 'Aún no firmado', action: a.contractToken ? { label: 'Contrato', href: `/contrato/${a.contractToken}` } : null },
    { key: 'docs', ok: a.status !== 'docs', warn: a.status === 'docs', title: 'Documentos', sub: a.status === 'docs' ? 'Pendientes del cliente' : 'Sin pendientes', action: null },
  ]

  return (
    <div className="col gap-12">
      <button className="btn btn-ghost btn-sm bankx-back" onClick={onBack}><ChevronLeft size={16} /> Volver a la lista</button>

      {/* Gradient hero */}
      <div className="bankx-detail-hero">
        <div className="split">
          <div><div className="tiny">Solicitud {a.id}</div><h2>{a.customer}</h2></div>
          <span className={statusPill(a.status)} style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>{bankStatusMeta[a.status].label}</span>
        </div>
        <p className="small bankx-hero-sub">{a.vehicle || 'Pre-aprobación sin vehículo'} · {a.dealer || 'Directo AutoRD'}</p>
      </div>

      {/* Expediente quick grid */}
      <div className="card pad">
        <div className="strong" style={{ marginBottom: 10 }}>Expediente</div>
        <div className="bankx-kv-grid">
          <div className="bankx-kv"><span>Monto solicitado</span><b>{a.amount ? fmtRD(a.amount) : '—'}</b></div>
          <div className="bankx-kv"><span>Inicial</span><b>{a.down ? fmtRD(a.down) : '—'}</b></div>
          <div className="bankx-kv"><span>Ingreso mensual</span><b>{a.income ? fmtRD(a.income) : '—'}</b></div>
          <div className="bankx-kv"><span>Plazo deseado</span><b>{a.term ? `${a.term} años` : '—'}</b></div>
        </div>
      </div>

      {/* Requisitos checklist */}
      <div className="card pad">
        <div className="strong" style={{ marginBottom: 10 }}>Requisitos antes de decidir</div>
        <div className="bankx-checklist">
          {checklist.map((c) => (
            <div className="bankx-check-full" key={c.key}>
              <span className={`bankx-check-ic ${c.ok ? 'ok' : c.warn ? 'warn' : 'bad'}`}>{c.ok ? <CheckCircle2 size={16} /> : c.warn ? <AlertTriangle size={16} /> : <XCircle size={16} />}</span>
              <div className="grow" style={{ minWidth: 0 }}><b className="small">{c.title}</b><div className="tiny muted">{c.sub}</div></div>
              {c.action && <a className="btn btn-outline btn-sm" href={c.action.href} target="_blank" rel="noreferrer">{c.action.label}</a>}
            </div>
          ))}
        </div>
      </div>

      {/* Reviewer assignment */}
      <div className="card pad">
        <div className="row wrap between center gap-8">
          <label className="row center gap-6 tiny"><UserCheck size={14} className="muted" />
            <select className="input" style={{ height: 34, fontSize: 12, padding: '2px 8px' }} value={a.reviewer?.id || ''} onChange={(e) => onAssign(REVIEWERS.find((r) => r.id === e.target.value) || null)}>
              <option value="">Sin analista asignado</option>{REVIEWERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <Chip tone={a.priority.tone}>{a.priority.label}</Chip>
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>{a.reviewerState} · recibida {a.receivedAt} · último cambio {a.lastTouched}</div>
      </div>

      {/* Tabs */}
      <div className="bankx-tabs">
        <button className={tab === 'revision' ? 'active' : ''} onClick={() => setTab('revision')}>Expediente completo</button>
        <button className={tab === 'decision' ? 'active' : ''} onClick={() => setTab('decision')}>Registrar respuesta</button>
      </div>

      {tab === 'revision' ? (
        <>
          <Block icon={Users} title="Solicitante">
            <KV k="Nombre completo" v={a.customer} />
            <KV k="Cédula" v={a.maskedCedula} mono />
            <KV k="Teléfono" v={<span className="row center gap-4"><Phone size={12} /> {a.phone}</span>} />
            <KV k="Correo" v={<span className="row center gap-4"><Mail size={12} /> {a.email}</span>} />
            <KV k="Ciudad" v={<span className="row center gap-4"><MapPin size={12} /> {a.city}</span>} />
            <KV k="Tipo de empleo" v={<span className="row center gap-4"><Briefcase size={12} /> {a.employment}</span>} />
            <KV k="Ingreso declarado" v={a.income ? `${fmtRD(a.income)}/mes` : '—'} />
            <KV k="Fuente / fecha" v={`${a.incomeSource} · ${a.kycAt}`} />
          </Block>

          <Block icon={ShieldCheck} title="Verificación de identidad (KYC)">
            <KV k="Estado DIDIT" v={<StatusChip status={a.kyc} />} />
            <KV k="Cédula verificada" v={a.cedulaVerified ? <Chip tone="green"><CheckCircle2 size={11} /> Sí</Chip> : <Chip tone="slate">No</Chip>} />
            <KV k="Prueba de vida" v={a.livenessPassed ? <Chip tone="green"><CheckCircle2 size={11} /> Aprobada</Chip> : <Chip tone="slate">Pendiente</Chip>} />
            <KV k="Completado" v={a.kyc === 'aprobado' ? a.kycAt : '—'} />
            {a.kyc !== 'aprobado' && <div className="notice" style={{ marginTop: 8, borderColor: 'var(--amber-bd)', background: 'var(--amber-bg)' }}><AlertTriangle size={15} color="#b45309" /><span className="tiny">KYC no completado — no se puede consultar el buró hasta verificar identidad.</span></div>}
          </Block>

          <Block icon={FileCheck2} title="Consentimiento de crédito">
            <KV k="Firmado" v={a.consent ? <Chip tone="green"><FileCheck2 size={11} /> Sí</Chip> : <Chip tone="red">No</Chip>} />
            {a.consent && <><KV k="Fecha" v={a.consentAt} /><KV k="Versión" v={a.consentVersion} /><KV k="Bancos autorizados" v={a.banksAuthorized} /></>}
            {a.consent && <div className="notice" style={{ marginTop: 8, background: 'var(--teal-50)', borderColor: 'var(--teal-100)' }}><ShieldCheck size={15} color="var(--teal-700)" /><span className="tiny">El cliente autorizó a este banco a consultar su historial crediticio.</span></div>}
            {a.contractToken && <a className="btn btn-outline btn-sm btn-block" href={`/contrato/${a.contractToken}`} target="_blank" rel="noreferrer" style={{ marginTop: 10 }}><FileText size={14} /> Ver contrato firmado (DIDIT)</a>}
          </Block>

          <Block icon={Car} title={a.isPreapproval ? 'Pre-aprobación (sin vehículo)' : 'Vehículo y dealer'}>
            {a.isPreapproval ? (
              <>
                <KV k="Tipo de solicitud" v="Pre-aprobación — sin vehículo aún" />
                <KV k="Monto deseado" v={a.amount ? fmtRD(a.amount) : 'Sin monto fijo'} />
                {a.down ? <KV k="Inicial disponible" v={fmtRD(a.down)} /> : null}
                <KV k="Plazo solicitado" v={a.term ? `${a.term} años` : '—'} />
              </>
            ) : (
              <>
                <div className="row center gap-10" style={{ marginBottom: 8 }}>
                  <div className="dash-top-photo" style={{ width: 66, height: 48 }}><CarImage make={make} model={model} seed={a.id} /></div>
                  <div><div className="strong small">{a.vehicle}</div><div className="tiny muted">{a.dealer}</div></div>
                </div>
                <KV k="Monto solicitado" v={fmtRD(a.amount)} />
                <KV k="Inicial" v={`${fmtRD(a.down)}${a.amount ? ` (${Math.round(a.down / a.amount * 100)}%)` : ''}`} />
                <KV k="Plazo solicitado" v={`${a.term} años`} />
                <KV k="Dealer" v={a.dealer} />
              </>
            )}
          </Block>

          <DocWorkflow app={a} docs={docs} setDocs={setDocs} docStatus={docStatus} setDocStatus={setDocStatus} />

          <Block icon={Clock} title="Historial de revisión">
            <div className="col">
              {a.timeline.map((e, i) => (
                <div key={i} className="row gap-10 dash-activity">
                  <div className="dash-act-ic"><CheckCircle2 size={13} /></div>
                  <div className="grow"><div className="small strong">{e.name}</div><div className="tiny muted">{e.actor} · {e.when}{e.note ? ` · ${e.note}` : ''}</div></div>
                </div>
              ))}
            </div>
          </Block>

          <Block icon={MessageSquare} title="Notas internas">
            <div className="tiny muted" style={{ marginBottom: 8 }}>Solo visibles para el banco. No se comparten con el cliente ni el dealer.</div>
            <div className="row gap-6">
              <input className="input" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Agregar nota interna…" style={{ height: 36 }} />
              <button className="btn btn-outline btn-sm" disabled={!noteInput.trim()} onClick={() => { onAddNote({ text: noteInput.trim(), by: a.reviewer?.name || 'Analista', when: 'Ahora' }); setNoteInput('') }}><Plus size={14} /></button>
            </div>
            <div className="col gap-6" style={{ marginTop: 10 }}>
              {(a.notes || []).length === 0 && <div className="tiny muted">Sin notas todavía.</div>}
              {(a.notes || []).map((n, i) => (
                <div key={i} style={{ borderLeft: '3px solid var(--teal-600, #0d9488)', paddingLeft: 10 }}>
                  <div className="small">{n.text}</div><div className="tiny muted">{n.by} · {n.when}</div>
                </div>
              ))}
            </div>
          </Block>
        </>
      ) : (
        <DecisionForm a={a} bank={bank} />
      )}
    </div>
  )
}

function DocWorkflow({ app, docs, setDocs, docStatus, setDocStatus }) {
  const [sel, setSel] = useState(['Comprobante de ingresos'])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [rejecting, setRejecting] = useState(null) // doc id awaiting reason
  const [reason, setReason] = useState('')

  const toggle = (d) => setSel((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]))
  const statusOf = (doc) => docStatus[doc.id] || (doc.status === 'subido' ? 'recibido' : 'solicitado')
  const setStatus = (id, s) => setDocStatus((m) => ({ ...m, [id]: s }))

  async function send() {
    setErr(''); setBusy(true)
    try {
      const res = await requestApplicationDocuments(app.responseId, sel, note)
      const next = res?.documents || []
      setDocs((cur) => { const seen = new Set(cur.map((d) => d.id)); return [...next.filter((d) => !seen.has(d.id)), ...cur] })
      setNote('')
    } catch (e) { setErr(e?.message || 'No se pudo enviar la solicitud.') } finally { setBusy(false) }
  }
  async function open(doc) {
    try { const url = await getDocumentDownloadUrl(doc); if (url) window.open(url, '_blank', 'noopener,noreferrer') }
    catch (e) { setErr(e?.message || 'No se pudo abrir el documento.') }
  }

  return (
    <Block icon={Upload} title="Documentos">
      <p className="tiny muted" style={{ margin: '-2px 0 8px' }}>El cliente recibe la solicitud en AutoRD y una notificación por WhatsApp.</p>
      <div className="row wrap gap-6">
        {DOC_TYPES.map((d) => { const on = sel.includes(d); return (
          <button key={d} type="button" className="chip" onClick={() => toggle(d)} style={{ cursor: 'pointer', border: on ? '1px solid var(--teal-100)' : '1px solid var(--line)', background: on ? 'var(--teal-50)' : '#fff', color: on ? 'var(--teal-700)' : undefined }}>{on ? <CheckCircle2 size={12} /> : <Plus size={12} />} {d}</button>
        ) })}
      </div>
      <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mensaje opcional para el cliente" style={{ marginTop: 10 }} />
      <button className="btn btn-outline btn-block btn-sm" style={{ marginTop: 10 }} disabled={busy || sel.length === 0} onClick={send}>{busy ? <Loader2 size={15} className="spin" /> : <Upload size={15} />} Solicitar documentos</button>
      {err && <div className="notice" style={{ marginTop: 10, borderColor: 'var(--red-bd)', background: 'var(--red-bg)' }}><FileWarning size={16} /><span className="tiny">{err}</span></div>}

      {docs.length > 0 && (
        <div className="col gap-8" style={{ marginTop: 14 }}>
          <div className="tiny strong muted">Documentos de esta solicitud</div>
          {docs.map((doc) => {
            const st = statusOf(doc); const meta = DOC_STATUS[st] || DOC_STATUS.solicitado; const t = TONE[meta.tone]
            const received = st !== 'solicitado'
            return (
              <div key={doc.id} className="doc-row" style={{ flexWrap: 'wrap' }}>
                <div className={`doc-icon ${received ? 'ok' : ''}`}>{received ? <FileCheck2 size={17} /> : <FileText size={17} />}</div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="strong tiny">{doc.type}</div>
                  <div className="tiny muted">{received ? doc.fileName || 'Archivo recibido' : 'Pendiente del cliente'}</div>
                </div>
                <span className="chip" style={{ background: t.bg, color: t.fg, fontSize: 10 }}>{meta.label}</span>
                {received && (
                  <div className="row gap-4" style={{ width: '100%', marginTop: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline btn-sm" style={{ padding: '3px 8px' }} onClick={() => open(doc)}><Eye size={13} /> Ver</button>
                    {st !== 'aceptado' && <button className="btn btn-outline btn-sm" style={{ padding: '3px 8px', color: '#166534' }} onClick={() => setStatus(doc.id, 'aceptado')}><CheckCircle2 size={13} /> Aceptar</button>}
                    {st !== 'rechazado' && <button className="btn btn-outline btn-sm" style={{ padding: '3px 8px', color: '#b91c1c' }} onClick={() => setRejecting(doc.id)}><XCircle size={13} /> Rechazar</button>}
                  </div>
                )}
                {rejecting === doc.id && (
                  <div className="row gap-4" style={{ width: '100%', marginTop: 6 }}>
                    <input className="input" style={{ height: 34 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del rechazo (requerido)" />
                    <button className="btn btn-navy btn-sm" disabled={!reason.trim()} onClick={() => { setStatus(doc.id, 'rechazado'); setRejecting(null); setReason('') }}>Rechazar</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Block>
  )
}

const num = (s) => { const n = Number(String(s).replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null }

function DecisionForm({ a, bank }) {
  const [decision, setDecision] = useState('')
  const [rate, setRate] = useState(''); const [term, setTerm] = useState('7')
  const [monthly, setMonthly] = useState(''); const [down, setDown] = useState('')
  const [amount, setAmount] = useState(a.approvedAmount ? String(a.approvedAmount) : '')
  const [expires, setExpires] = useState(''); const [conditions, setConditions] = useState('')
  const [custMsg, setCustMsg] = useState(''); const [internal, setInternal] = useState('')
  const [reason, setReason] = useState('')
  // A pre-approval has no vehicle/dealer, so there is no dealer to notify.
  const [toDealer, setToDealer] = useState(!a.isPreapproval); const [toCustomer, setToCustomer] = useState(true)
  const [docSel, setDocSel] = useState(['Comprobante de ingresos'])
  const [preview, setPreview] = useState(false)
  const [sent, setSent] = useState(false)

  const decisions = [
    { id: 'approved', label: 'Pre-aprobar', icon: CheckCircle2, cls: 'btn-navy' },
    { id: 'docs', label: 'Pedir docs', icon: FileWarning, cls: 'btn-outline' },
    { id: 'evaluando', label: 'En evaluación', icon: Loader2, cls: 'btn-outline' },
    { id: 'rejected', label: 'Rechazar', icon: XCircle, cls: 'btn-outline bankx-danger' },
  ]
  const isApprove = decision === 'approved'
  const canSubmit = decision && (!isApprove || (amount && rate)) && (decision !== 'rejected' || (reason && internal))

  async function submit() {
    const statusMap = { approved: 'preaprobada', evaluando: 'en_evaluacion', docs: 'pendiente_docs', rejected: 'rechazada' }
    const notes = [custMsg, decision === 'rejected' ? `Motivo: ${reason}` : '', conditions ? `Condiciones: ${conditions}` : '', internal ? `(interno) ${internal}` : ''].filter(Boolean).join(' · ')
    try {
      await submitBankResponse(a.responseId, {
        status: statusMap[decision], apr: num(rate), term: Number(term) || null,
        monthly: num(monthly), down: num(down), approvedAmount: num(amount), notes,
      })
    } catch (_) { /* demo/offline: still confirm */ }
    setSent(true)
  }

  if (sent) return (
    <div className="card pad"><div className="verify-row ok"><div className="verify-ic"><CheckCircle2 size={20} /></div><div className="grow"><div className="strong">Respuesta enviada</div><div className="tiny muted">{[toCustomer && 'cliente', toDealer && 'dealer'].filter(Boolean).join(' y ') || 'Nadie'} notificado{toCustomer && toDealer ? 's' : ''}.</div></div></div></div>
  )

  return (
    <div className="card pad">
      <div className="strong" style={{ marginBottom: 10 }}>Registrar respuesta</div>
      <div className="bankx-decision-grid">
        {decisions.map((d) => { const Icon = d.icon; const on = decision === d.id; return (
          <button key={d.id} className={`btn btn-sm ${on ? 'btn-navy' : d.cls}`} onClick={() => { setDecision(d.id); setPreview(false) }}><Icon size={15} /> {d.label}</button>
        ) })}
      </div>

      {isApprove && (
        <div style={{ marginTop: 12 }}>
          <F label={a.isPreapproval ? 'Monto pre-aprobado (RD$) — máximo a financiar' : 'Monto aprobado (RD$)'}><input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1,800,000" /></F>
          <div className="bankx-kv-grid" style={{ marginTop: 10 }}>
            <F label="Tasa (%)"><input className="input" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="9.25" /></F>
            <F label="Plazo (años)"><select className="select" value={term} onChange={(e) => setTerm(e.target.value)}><option>4</option><option>5</option><option>6</option><option>7</option></select></F>
            <F label="Cuota mensual"><input className="input" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="27,950" /></F>
            <F label="Inicial requerido"><input className="input" value={down} onChange={(e) => setDown(e.target.value)} placeholder="250,000" /></F>
            <F label="Vence"><input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></F>
          </div>
          <F label="Condiciones"><textarea className="input" rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Ej: sujeto a seguro de vida, comprobación de ingresos…" /></F>
        </div>
      )}

      {decision === 'docs' && (
        <div style={{ marginTop: 12 }}>
          <div className="tiny strong" style={{ marginBottom: 6 }}>Documentos a solicitar</div>
          <div className="row wrap gap-6">
            {DOC_TYPES.map((d) => { const on = docSel.includes(d); return (
              <button key={d} type="button" className="chip" onClick={() => setDocSel((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]))} style={{ cursor: 'pointer', border: on ? '1px solid var(--teal-100)' : '1px solid var(--line)', background: on ? 'var(--teal-50)' : '#fff', color: on ? 'var(--teal-700)' : undefined }}>{on ? <CheckCircle2 size={12} /> : <Plus size={12} />} {d}</button>
            ) })}
          </div>
        </div>
      )}

      {decision === 'rejected' && (
        <F label="Motivo del rechazo (requerido)" style={{ marginTop: 12 }}><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: relación cuota/ingreso alta" /></F>
      )}

      {decision && (
        <>
          <F label={decision === 'rejected' ? 'Mensaje al cliente (opcional)' : 'Mensaje al cliente'} style={{ marginTop: 10 }}><textarea className="input" rows={2} value={custMsg} onChange={(e) => setCustMsg(e.target.value)} placeholder="Texto que verá el cliente" /></F>
          <F label={`Nota interna${decision === 'rejected' ? ' (requerida)' : ''}`}><textarea className="input" rows={2} value={internal} onChange={(e) => setInternal(e.target.value)} placeholder="Solo para el banco" /></F>
          <div className="row wrap gap-14" style={{ marginTop: 8 }}>
            {!a.isPreapproval && <label className="row center gap-6 small"><input type="checkbox" checked={toDealer} onChange={(e) => setToDealer(e.target.checked)} /> Enviar al dealer</label>}
            <label className="row center gap-6 small"><input type="checkbox" checked={toCustomer} onChange={(e) => setToCustomer(e.target.checked)} /> Enviar al cliente</label>
          </div>
          {a.isPreapproval && <div className="tiny muted" style={{ marginTop: 4 }}><Info size={12} style={{ verticalAlign: -2 }} /> Pre-aprobación sin vehículo — no hay dealer, solo se notifica al cliente.</div>}
        </>
      )}

      {decision && !preview && (
        <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={!canSubmit} onClick={() => setPreview(true)}>Revisar respuesta <ExternalLink size={15} /></button>
      )}

      {preview && (
        <div className="card" style={{ marginTop: 14, border: '1.5px solid var(--teal-600, #0d9488)' }}>
          <div className="card-pad">
            <div className="row center gap-8" style={{ marginBottom: 10 }}>
              <BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={26} />
              <div><div className="small strong">{bank.name}</div><div className="tiny muted">Vista previa de la respuesta</div></div>
            </div>
            <KV k="Cliente" v={a.customer} />
            <KV k="Solicitud" v={a.isPreapproval ? 'Pre-aprobación' : a.vehicle} />
            <KV k="Decisión" v={decisions.find((d) => d.id === decision)?.label} />
            {isApprove && <>
              <KV k="Monto" v={num(amount) ? fmtRD(num(amount)) : '—'} />
              <KV k="Tasa" v={rate ? `${rate}%` : '—'} />
              <KV k="Plazo" v={`${term} años`} />
              <KV k="Cuota" v={num(monthly) ? `${fmtRD(num(monthly))}/mes` : '—'} />
              <KV k="Inicial requerido" v={num(down) ? fmtRD(num(down)) : '—'} />
              {expires && <KV k="Vence" v={expires} />}
              {conditions && <KV k="Condiciones" v={conditions} />}
            </>}
            {decision === 'rejected' && <KV k="Motivo" v={reason} />}
            <KV k="Recibe" v={[toCustomer && 'Cliente', toDealer && 'Dealer'].filter(Boolean).join(', ') || 'Nadie'} />
            <div className="row gap-8" style={{ marginTop: 12 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setPreview(false)}><ChevronLeft size={14} /> Editar</button>
              <button className="btn btn-primary grow" onClick={submit}><Send size={16} /> Confirmar y enviar respuesta</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Block({ icon: Icon, title, children }) {
  return (
    <div className="card pad">
      <div className="row center gap-8" style={{ margin: '0 0 10px' }}><Icon size={16} color="var(--teal-700)" /><span className="small strong">{title}</span></div>
      {children}
    </div>
  )
}
function KV({ k, v, mono }) {
  return <div className="kv"><span className="k">{k}</span><span className={`v ${mono ? 'mono-num' : ''}`}>{v}</span></div>
}
function F({ label, children, style }) {
  return <div className="field" style={style}><label>{label}</label>{children}</div>
}
