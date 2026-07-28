import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Inbox, Loader2, FileWarning, CheckCircle2, XCircle, Search, ShieldCheck, FileCheck2,
  Car, Upload, Info, Send, FileText, ExternalLink, Plus, Clock, Users,
  AlertTriangle, ChevronLeft, UserCheck, Phone, Mail, MapPin, Briefcase, Eye, X,
  MessageSquare, ClipboardList, Filter, TimerReset, WalletCards, BadgeCheck, Pencil,
} from 'lucide-react'
import { bankStatusMeta, fmtRD } from '../data/demo'
import {
  getApplicationDocuments, getBankApplications, getDocumentDownloadUrl,
  requestApplicationDocuments, submitBankResponse, getClientHistoryForBank,
  updateApplicationDocumentStatus,
  getOrCreateFinancingToken, getFinancingEvents, getApplicationCedula,
  getBankClientInfo, saveBankClientInfo, realEmail,
  getBankOfficers, setUnderwriting, unassignOfficer, addInternalNote, getInternalNotes,
  generateApprovalPackage, getPackageState,
  requestClientInfo, getOpenInfoRequests,
  UNDERWRITING_STAGES,
} from '../data/api'
import { PROVINCIAS, formatAddress } from '../data/provincias'
import { riskFlags, riskSummary, assessCapacity, FLAG_LEVEL, CAPACITY_VERDICT } from '../data/underwriting'
import { REQUESTABLE_FIELDS } from '../data/checklist'
import { renderWaTemplate, waLink } from '../data/waTemplates'
import { useAuth } from '../context/AuthContext'
import StatusChip from '../components/StatusChip'
import BankLogo from '../components/BankLogo'
import CarImage from '../components/CarImage'
import WhatsAppIcon from '../components/WhatsAppIcon'
import useBankIdentity from '../hooks/useBankIdentity'
import { estimateMonthly } from '../data/finance'
import {
  DOC_TYPES, DOC_STATUS, TONE, enrichApp, bankStats,
} from '../data/bankDemo'

// Simple internal readiness score (0–100) derived from KYC / consent / docs / SLA.
const appScore = (a) => (a.kyc === 'aprobado' ? 40 : 0) + (a.consent ? 30 : 0) + (a.status !== 'docs' ? 20 : 0) + ((a.hoursWaiting || 0) < 24 ? 10 : 0)
const digits = (p) => String(p || '').replace(/[^\d]/g, '')
const waMsg = (a) => `Hola ${a.customer}, te contactamos por tu solicitud de financiamiento ${a.id}${a.vehicle ? ` del ${a.vehicle}` : ''}.`
const docEffectiveStatus = (doc, overlay = {}) => overlay[doc.id] || (doc.status === 'subido' ? 'recibido' : doc.status)
const docsForReview = (docs = [], overlay = {}) => docs.map((doc) => ({ ...doc, status: docEffectiveStatus(doc, overlay) }))
const docsMissing = (docs = []) => docs.some((doc) => !['aceptado', 'recibido', 'subido', 'revision'].includes(doc.status))
// The last four digits, and only from a source that actually contains them.
//
// Deliberately NOT derived from cedula_masked: that mask has the shape
// ###-•••••••-#, which keeps the FIRST three digits and the check digit and
// bullets out the middle seven. Taking its "last 4" produced the municipality
// prefix plus the check digit, displayed under a last-4 label — a wrong number
// that looked right. The real digits come from cedula_last4 (stored at KYC time,
// verified against the same peppered hash the client portal gate uses), or from
// the full cédula once an analyst has revealed it.
const cedulaLast4 = (app) => {
  const full = digits(app?.cedula)
  if (full.length >= 4) return full.slice(-4)
  const stored = digits(app?.cedulaLast4)
  return stored.length === 4 ? stored : ''
}
// A DR cédula is 3-7-1, so the last four sit at the tail of the middle group
// plus the check digit — masking to those positions keeps it recognisable.
const maskedCedulaLabel = (app) => {
  const l4 = cedulaLast4(app)
  return l4 ? `•••-••••${l4.slice(0, 3)}-${l4.slice(3)}` : ''
}
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
  const { profile } = useAuth() || {}
  const bank = useBankIdentity(profile)

  const [officers, setOfficers] = useState([])

  const reloadApps = useCallback(() => {
    // No bank_id guard: getBankApplications falls back to demo data when the
    // app is not wired to Supabase, and short-circuiting here left the queue
    // permanently empty in that mode.
    return getBankApplications(profile?.bank_id, 'todas').then((data) => {
      const enriched = (data || []).map(enrichApp)
      setRaw(enriched)
      setSelId((cur) => cur || enriched[0]?.id || null)
    }).catch(() => {})
  }, [profile?.bank_id])

  useEffect(() => { reloadApps() }, [reloadApps])

  // The bank's real team, replacing the three invented analysts the panel used
  // to assign by hashing the application id.
  useEffect(() => {
    let alive = true
    getBankOfficers(profile?.bank_id).then((list) => { if (alive) setOfficers(list) })
    return () => { alive = false }
  }, [profile?.bank_id])

  // Close the expediente pop-up with Escape.
  useEffect(() => {
    if (!expOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setExpOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expOpen])

  // reviewer and notes used to be layered on from local `overrides` state, which
  // is why they never survived a refresh. Both now arrive with the row.
  const apps = raw

  const dealers = [...new Set(apps.map((a) => a.dealer).filter(Boolean))].sort()
  const stats = bankStats(apps)
  const readyApps = apps.filter((a) => ['nueva', 'evaluando'].includes(a.status) && a.kyc === 'aprobado' && a.consent).length
  const missingConsent = apps.filter((a) => a.kyc === 'aprobado' && !a.consent).length
  const slaRisk = stats.waiting.length
  const unassigned = apps.filter((a) => !a.reviewer && !['preaprobada', 'rechazada'].includes(a.status)).length
  const approvalVolume = stats.totalApproved || 0
  // Workload per REAL team member (0056); this used to chart three invented ones.
  const reviewerLoad = officers.map((r) => ({
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

  // Internal notes for the open expediente only — one query, not one per row.
  const [selNotes, setSelNotes] = useState([])
  const loadNotes = useCallback(() => {
    const appId = apps.find((a) => a.id === selId)?.applicationId
    if (!appId) { setSelNotes([]); return Promise.resolve() }
    return getInternalNotes(appId).then((rows) => setSelNotes(rows.map((n) => ({
      by: n.author,
      text: n.note + (n.nextAction ? ` · Próximo paso: ${n.nextAction}` : ''),
      when: new Date(n.createdAt).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    })))).catch(() => setSelNotes([]))
  }, [apps, selId])
  useEffect(() => { loadNotes() }, [loadNotes])

  const addNoteFor = async (n) => {
    const appId = apps.find((a) => a.id === selId)?.applicationId
    if (!appId || !n?.text) return
    try { await addInternalNote(appId, { note: n.text }); await loadNotes() } catch (_) { /* no-op */ }
  }
  const filterCount = (id) => id === 'todas' ? apps.length : apps.filter((a) => a.status === id).length

  const openApp = (id) => { setSelId(id); setSheetOpen(true) }
  // Both of these used to write to React state, so reassigning an analyst or
  // writing a note was lost on refresh and never reached the audit trail.
  const assignOfficer = async (responseId, officerId) => {
    if (!responseId) return
    try {
      if (officerId) await setUnderwriting(responseId, { officerId })
      else await unassignOfficer(responseId)
      await reloadApps()
    } catch (_) { /* surfaced by the row staying put */ }
  }
  const changeStage = async (responseId, stage) => {
    if (!responseId || !stage) return
    try { await setUnderwriting(responseId, { stage }); await reloadApps() } catch (_) { /* no-op */ }
  }
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
                <h1>Mesa de crédito</h1>
                <p className="muted small">{bank.name} · solicitudes con identidad verificada y consentimiento firmado.</p>
              </div>
            </div>
          </div>
          {/* Was "Evaluación de crédito externa" — external to whom? The reader
              IS the bank. What it needs to say is that AutoRD does not decide. */}
          <span className="chip chip-navy bankx-ext"><ShieldCheck size={14} /> La decisión es del banco</span>
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
                  <option value="">Todos</option>{officers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
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
                <button className="btn btn-primary" onClick={() => sel && assignOfficer(sel.responseId, profile?.id)} disabled={!sel}>Asignar a mí</button>
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
                <Expediente key={sel.id} a={{ ...sel, notes: selNotes }} onAssign={assignOfficer} onStage={changeStage}
                  onAddNote={addNoteFor} officers={officers} bank={bank} />
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
// Format a date-only ('YYYY-MM-DD') or timestamp for display, tz-safe for dates.
const fmtDay = (d) => {
  if (!d) return '—'
  const s = String(d).length === 10 ? `${d}T12:00:00` : d
  const dt = new Date(s)
  return Number.isFinite(dt.getTime()) ? dt.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }) : String(d)
}

// The bank needs the real cédula to pull credit — a mask is useless for that —
// but it stays hidden until the analyst asks, and every reveal is recorded
// server-side (financing_events) so there is a trail of who read what.
function CedulaLine({ app }) {
  const [full, setFull] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const reveal = async () => {
    setBusy(true); setErr(false)
    const c = await getApplicationCedula(app.applicationId)
    setBusy(false)
    if (c) setFull(c); else setErr(true)
  }

  return (
    <div className="bankx-infoline">
      <span>Cédula</span>
      <b className="mono-num row center gap-8" style={{ justifyContent: 'flex-end' }}>
        {full ? (
          <>{full}<span className="chip" style={{ fontSize: 10 }}>verificada</span></>
        ) : (
          <>
            {maskedCedulaLabel(app) || <span className="muted tiny">No disponible</span>}
            {app.applicationId && !err && (
              <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', height: 24 }} disabled={busy} onClick={reveal}>
                {busy ? <Loader2 size={12} className="spin" /> : 'Ver completa'}
              </button>
            )}
            {err && <span className="muted tiny">Sin cédula verificada</span>}
          </>
        )}
      </b>
    </div>
  )
}

function RequestInfoButton({ app, field, faltaKey }) {
  if (!app?.phone) return <span className="pill">Sin teléfono</span>
  // Deep-link straight to the item in the client's "Qué falta" list. Asking for
  // a field and then making them hunt for where to enter it is how these
  // requests go unanswered.
  // Tell the login screen which method this customer actually has, so a
  // WhatsApp-only client is never asked for an email they do not own.
  const waOnly = !app?.email && !!app?.phone
  const link = faltaKey
    ? ` ${window.location.origin}/mi-financiamiento?falta=${faltaKey}${waOnly ? '&login=whatsapp' : ''}`
    : ''
  const text = `Hola ${app.customer}, para completar tu solicitud ${app.id}, por favor confírmame tu ${field}.${link}`
  return (
    <a className="btn btn-outline btn-sm bankx-info-btn" href={`https://wa.me/${digits(app.phone)}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
      <MessageSquare size={13} /> Pedir info
    </a>
  )
}

// One Cliente row: the effective value, where it came from, and a way to chase
// it if it is missing. A value the bank recorded takes precedence over the
// client's declared one for that bank only.
function ClientInfoLine({ app, label, declared, recorded, field, faltaKey }) {
  const value = recorded || declared || null
  const source = recorded ? 'Registrado por tu banco' : (declared ? 'Declarado por el cliente' : null)
  return (
    <div className="bankx-infoline bankx-infoline-action">
      <span>{label}</span>
      <b>
        <span className="bankx-info-val">
          {value || <span className="muted tiny">No registrado</span>}
          {source && <em className="bankx-info-src">{source}</em>}
        </span>
        {!value && <RequestInfoButton app={app} field={field || label.toLowerCase()} faltaKey={faltaKey} />}
      </b>
    </div>
  )
}

// The Cliente panel. Chasing the client on WhatsApp is only half a loop — when
// they answer, the analyst needs somewhere to put it. Anything typed here is
// private to this bank (RLS on bank_client_details): what BHD researches is
// never handed to Popular bidding on the same client. The client's own declared
// values come live from their profile and are shared with every bank they
// consented to.
function ClientInfoPanel({ app }) {
  const { profile } = useAuth() || {}
  const bankDbId = profile?.bank_id || null
  const [info, setInfo] = useState(undefined)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ email: '', occupation: '', provincia: '', addressLine: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    if (!app.applicationId) { setInfo(null); return }
    getBankClientInfo(app.applicationId).then(setInfo).catch(() => setInfo(null))
  }, [app.applicationId])
  useEffect(load, [load])

  const declared = info?.declared || {}
  const rec = info?.bank || null
  // The synthetic wa<digits>@autord.local address is not a real inbox.
  const declaredEmail = realEmail(declared.email)
  const declaredAddress = formatAddress(declared.addressLine, declared.provincia)
  const recordedAddress = formatAddress(rec?.addressLine, rec?.provincia)

  const openEdit = () => {
    setForm({
      email: rec?.email || '', occupation: rec?.occupation || '',
      provincia: rec?.provincia || '', addressLine: rec?.addressLine || '',
    })
    setErr(''); setEditing(true)
  }

  const save = async () => {
    setBusy(true); setErr('')
    try {
      await saveBankClientInfo(app.applicationId, bankDbId, form)
      load(); setEditing(false)
    } catch (e) {
      setErr(e?.message || 'No se pudo guardar')
    } finally { setBusy(false) }
  }

  return (
    <>
      <CedulaLine app={app} />
      <div className="bankx-infoline"><span>Teléfono</span><b>{app.phone ? `+${String(app.phone).replace(/^\+/, '')}` : <span className="muted tiny">No registrado</span>}</b></div>
      {info === undefined ? (
        <div className="bankx-infoline"><span>Cargando</span><b><Loader2 size={14} className="spin muted" /></b></div>
      ) : editing ? (
        <div className="bankx-clientedit">
          <F label="Email"><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="cliente@correo.com" /></F>
          <F label="Ocupación"><input className="input" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} placeholder="Ej: Ingeniero, comerciante…" /></F>
          <F label="Provincia">
            <select className="select" value={form.provincia} onChange={(e) => setForm({ ...form, provincia: e.target.value })}>
              <option value="">Sin especificar</option>
              {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </F>
          <F label="Dirección"><input className="input" value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} placeholder="Calle, número, sector" /></F>
          {err && <div className="tiny" style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div>}
          <div className="row gap-8" style={{ marginTop: 12 }}>
            <button className="btn btn-navy btn-sm" disabled={busy} onClick={save}>{busy ? <Loader2 size={14} className="spin" /> : 'Guardar'}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>Cancelar</button>
          </div>
          <div className="tiny muted" style={{ marginTop: 8 }}>Solo tu banco ve lo que registres aquí.</div>
        </div>
      ) : (
        <>
          <ClientInfoLine app={app} label="Email" faltaKey="email" declared={declaredEmail} recorded={rec?.email} field="email" />
          <ClientInfoLine app={app} label="Ocupación" faltaKey="ocupacion" declared={declared.occupation || app.employment} recorded={rec?.occupation} field="ocupación" />
          <ClientInfoLine app={app} label="Dirección" faltaKey="direccion" declared={declaredAddress} recorded={recordedAddress} field="dirección completa" />
          {app.applicationId && bankDbId && (
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={openEdit}>
              <Pencil size={13} /> {rec ? 'Editar datos del cliente' : 'Registrar datos del cliente'}
            </button>
          )}
        </>
      )}
    </>
  )
}

// Generate (or reuse) the client's secure /f/:token link and copy it. The client
// must still verify (last-4 cédula + WhatsApp OTP) before any detail is shown.
function ClientLinkButton({ applicationId }) {
  const [state, setState] = useState('idle') // idle | busy | copied | error
  async function go() {
    if (!applicationId) return
    setState('busy')
    try {
      const token = await getOrCreateFinancingToken(applicationId)
      if (!token) { setState('error'); return }
      const link = `${window.location.origin}/f/${token}`
      try { await navigator.clipboard.writeText(link) } catch { /* clipboard may be blocked */ }
      setState('copied')
      window.setTimeout(() => setState('idle'), 2500)
    } catch { setState('error') }
  }
  return (
    <button className="btn btn-outline btn-sm" onClick={go} disabled={state === 'busy'} title="Copiar enlace seguro para el cliente">
      {state === 'busy' ? <Loader2 size={14} className="spin" /> : state === 'copied' ? <CheckCircle2 size={14} /> : <ExternalLink size={14} />}
      {state === 'copied' ? 'Enlace copiado' : state === 'error' ? 'Error' : 'Enlace del cliente'}
    </button>
  )
}

function PaymentCapacityTool({ app }) {
  const [amount, setAmount] = useState(app.amount ? String(app.amount) : '')
  const [income, setIncome] = useState(app.income ? String(app.income) : '')
  const [term, setTerm] = useState(app.term ? String(app.term) : '7')
  const [rate, setRate] = useState('9.25')
  const [maxRatio, setMaxRatio] = useState('35')
  const [insurance, setInsurance] = useState('3800')

  const amountN = num(amount)
  const incomeN = num(income)
  const termN = Number(term) || 7
  const rateN = Number(String(rate).replace(',', '.')) || 0
  const maxRatioN = Number(String(maxRatio).replace(',', '.')) || 35
  const insuranceN = num(insurance) || 0
  const monthly = amountN ? estimateMonthly(amountN, rateN, termN * 12) : null
  const ratio = monthly && incomeN ? Math.round((monthly / incomeN) * 100) : null
  const monthlyWithInsurance = monthly ? monthly + insuranceN : null
  const ratioWithInsurance = monthlyWithInsurance && incomeN ? Math.round((monthlyWithInsurance / incomeN) * 100) : null
  const maxMonthly = incomeN ? incomeN * (maxRatioN / 100) : null
  const maxFinance = monthly && amountN && maxMonthly ? Math.round(amountN * (maxMonthly / monthly)) : null
  const lowerMonthly = amountN ? estimateMonthly(amountN, rateN, 8 * 12) : null
  const ringPct = ratio == null || !maxRatioN ? 0 : Math.min(100, Math.round((ratio / maxRatioN) * 100))
  const insuredPct = ratioWithInsurance == null || !maxRatioN ? 0 : Math.min(100, Math.round((ratioWithInsurance / maxRatioN) * 100))
  const tone = ratio == null ? '' : ratio <= maxRatioN ? 'green' : ratio <= maxRatioN + 10 ? 'amber' : 'red'
  const label = ratio == null ? 'Sin datos' : ratio <= maxRatioN ? 'Dentro de regla' : ratio <= maxRatioN + 10 ? 'Revisar' : 'Fuera de regla'
  const recommendation = ratio == null
    ? 'Completa ingreso y monto para simular la capacidad.'
    : ratio <= maxRatioN
      ? 'Recomendacion: capacidad favorable. Validar estados de cuenta antes de emitir oferta final.'
      : ratio <= maxRatioN + 10
        ? 'Recomendacion: revisar soporte de ingresos o bajar la cuota antes de aprobar.'
        : 'Recomendacion: fuera de politica. Considera pedir mas inicial, reducir monto o rechazar.'

  return (
    <section className="card bankx-capacity-tool">
      <div className="bankx-capacity-hero">
        <div>
          <span className={`pill ${tone}`}>{label}</span>
          <h3>Herramienta de capacidad de pago</h3>
          <p>Compara lo que el cliente pidio contra su ingreso declarado, inicial disponible y politica del banco antes de aprobar, pedir documentos o ajustar condiciones.</p>
          <div className="bankx-capacity-request" style={{ marginTop: 14 }}>
            <div><span>Monto solicitado</span><b>{amountN ? fmtRD(amountN) : '-'}</b></div>
            <div><span>Ingreso declarado</span><b>{incomeN ? `${fmtRD(incomeN)}/mes` : '-'}</b></div>
            <div><span>Inicial disponible</span><b>{app.down ? fmtRD(app.down) : '-'}</b></div>
          </div>
        </div>
        <div className="bankx-capacity-score">
          <div className="bankx-capacity-ring" style={{ background: `conic-gradient(#22c55e 0 ${ringPct}%, rgba(255,255,255,.18) ${ringPct}% 100%)` }}>
            <div><span><strong>{ratio != null ? `${ratio}%` : '-'}</strong><small>cuota / ingreso</small></span></div>
          </div>
          <div className="small strong" style={{ marginTop: 10, color: '#fff' }}>{ratio == null ? 'Sin datos' : ratio <= maxRatioN ? 'Margen saludable' : 'Necesita revision'}</div>
          <div className="tiny" style={{ color: 'rgba(255,255,255,.72)' }}>Regla banco: max {maxRatioN}%</div>
        </div>
      </div>

      <div className="bankx-capacity-body">
        <div className="bankx-capacity-panel">
          <div>
            <div className="strong small">Supuestos editables</div>
            <div className="tiny muted">El analista puede ajustar tasa, plazo, ingreso y politica para simular.</div>
          </div>
          <div className="bankx-capacity-inputs">
            <label><span>Monto</span><input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1,800,000" /></label>
            <label><span>Ingreso</span><input className="input" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="85,000" /></label>
            <label><span>Plazo</span><select className="select" value={term} onChange={(e) => setTerm(e.target.value)}><option>4</option><option>5</option><option>6</option><option>7</option><option>8</option></select></label>
            <label><span>Tasa</span><input className="input" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="9.25" /></label>
            <label><span>Max % ingreso</span><input className="input" value={maxRatio} onChange={(e) => setMaxRatio(e.target.value)} placeholder="35" /></label>
            <label><span>Seguro estimado</span><input className="input" value={insurance} onChange={(e) => setInsurance(e.target.value)} placeholder="3,800" /></label>
          </div>
          <div className="bankx-capacity-result">
            <div><span>Cuota estimada</span><b>{monthly ? `${fmtRD(Math.round(monthly))}/mes` : '-'}</b></div>
            <div><span>Puede financiar aprox.</span><b>{maxFinance ? fmtRD(maxFinance) : '-'}</b></div>
          </div>
        </div>

        <div className="bankx-capacity-panel">
          <div>
            <div className="strong small">Lectura rapida</div>
            <div className="tiny muted">Visual para decidir si aprueba, ajusta o pide soporte adicional.</div>
          </div>
          <div className="bankx-capacity-breakdown">
            <div className="bankx-capacity-bar-row"><span>Cuota actual</span><div className="bankx-capacity-track"><i style={{ width: `${ringPct}%` }} /></div><b>{ratio != null ? `${ratio}%` : '-'}</b></div>
            <div className="bankx-capacity-bar-row"><span>Con seguro</span><div className="bankx-capacity-track amber"><i style={{ width: `${insuredPct}%` }} /></div><b>{ratioWithInsurance != null ? `${ratioWithInsurance}%` : '-'}</b></div>
            <div className="bankx-capacity-bar-row"><span>Limite banco</span><div className="bankx-capacity-track"><i style={{ width: '100%' }} /></div><b>{maxRatioN}%</b></div>
          </div>
          <div className="bankx-capacity-scenarios">
            <div className="bankx-scenario-card active"><b>Aprobar</b><span>{amountN ? fmtRD(amountN) : 'Monto'} · {termN} anos · {rateN}%</span></div>
            <div className="bankx-scenario-card"><b>Bajar cuota</b><span>8 anos · {lowerMonthly ? `${fmtRD(Math.round(lowerMonthly))}/mes` : 'simular'}</span></div>
            <div className="bankx-scenario-card"><b>Pedir docs</b><span>Validar ingreso promedio</span></div>
          </div>
          <div className={`bankx-capacity-note ${tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : ''}`}>{recommendation}</div>
        </div>
      </div>
    </section>
  )
}

// This client's past applications + THIS bank's own past decisions. Privacy-scoped
// server-side (get_client_history_for_bank never returns another bank's response).
function ClientHistoryBank({ buyerId, currentAppId }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    if (!buyerId) { setRows([]); return () => { alive = false } }
    getClientHistoryForBank(buyerId).then((r) => { if (alive) setRows(r) }).catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [buyerId])
  const past = (rows || []).filter((r) => r.applicationId !== currentAppId)
  return (
    <section className="card pad">
      <div className="row between center" style={{ marginBottom: 4 }}>
        <div><h3 style={{ fontSize: 15, margin: 0 }}>Historial del cliente</h3><div className="tiny muted">Solicitudes previas con tu banco y tu decisión de entonces</div></div>
        <span className="pill">{past.length} previa{past.length === 1 ? '' : 's'}</span>
      </div>
      {rows == null ? (
        <div className="tiny muted" style={{ marginTop: 10 }}>Cargando…</div>
      ) : past.length === 0 ? (
        <div className="tiny muted" style={{ marginTop: 10 }}>Primera solicitud de este cliente con tu banco.</div>
      ) : (
        <div className="col gap-8" style={{ marginTop: 10 }}>
          {past.map((r) => (
            <div className="bankx-notebox" key={r.applicationId}>
              <div className="row between center">
                <b className="small">{r.code} · {r.isPreapproval ? 'Pre-aprobación' : (r.vehicle || 'Con vehículo')}</b>
                <span className={statusPill(r.status)}>{bankStatusMeta[r.status]?.label || r.statusLabel}</span>
              </div>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                {fmtDay(r.createdAt)}
                {r.approvedAmount ? ` · aprobado ${fmtRD(r.approvedAmount)}` : ''}
                {r.apr ? ` · ${r.apr}%` : ''}
                {r.validUntil ? ` · vigencia hasta ${fmtDay(r.validUntil)}${r.expired ? ' (vencida)' : ''}` : ''}
                {` · KYC ${r.kyc === 'aprobado' ? 'ok' : 'pend.'}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// Friendly, bank-perspective label for a cross-system audit event.
function bankEventLabel(e) {
  if (e.kind === 'verified') return 'El cliente confirmó su identidad'
  if (e.kind === 'accepted') return `El cliente aceptó la oferta${e.detail ? ` de ${e.detail}` : ''}`
  if (e.kind === 'vehicle_linked') return 'El cliente vinculó un vehículo'
  if (e.kind === 'doc') return 'El cliente subió un documento'
  if (e.kind === 'bank_decision') return `Respuesta del banco registrada${e.detail ? ` (${e.detail})` : ''}`
  return e.detail || e.kind
}
const fmtEventWhen = (at) => {
  const d = new Date(at)
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })
    : ''
}

function Expediente({ a, onAssign, onStage, onAddNote, officers, bank }) {
  const [docs, setDocs] = useState([])
  const [docStatus, setDocStatus] = useState({})
  const [noteInput, setNoteInput] = useState('')
  const [events, setEvents] = useState([])

  useEffect(() => {
    let alive = true
    if (!a.applicationId) { setEvents([]); return () => { alive = false } }
    getFinancingEvents(a.applicationId).then((r) => { if (alive) setEvents(r) }).catch(() => { if (alive) setEvents([]) })
    return () => { alive = false }
  }, [a.applicationId])

  useEffect(() => {
    let alive = true
    const appId = a.applicationId || (a.status === 'docs' ? a.id : null)
    if (!appId) { setDocs([]); return () => { alive = false } }
    getApplicationDocuments(appId).then((rows) => { if (alive) setDocs(rows) }).catch(() => { if (alive) setDocs([]) })
    return () => { alive = false }
  }, [a.applicationId, a.id, a.status])

  const sc = appScore(a)
  const effectiveDocs = useMemo(() => docsForReview(docs, docStatus), [docs, docStatus])
  const hasMissingDocs = docsMissing(effectiveDocs)
  const cuota = a.amount ? estimateMonthly(a.amount, 9.5, (Number(a.term) || 7) * 12) : null
  const ratio = cuota && a.income ? Math.round((cuota / a.income) * 100) : null
  const precioVenta = (Number(a.amount) || 0) + (Number(a.down) || 0)
  const contractHref = a.contractToken ? `/contrato/${a.contractToken}` : null

  const readiness = [
    { key: 'kyc', ok: a.kyc === 'aprobado', title: 'KYC DIDIT aprobado', sub: a.kyc === 'aprobado' ? 'Cédula + prueba de vida' : 'Identidad sin verificar', href: contractHref, cta: 'Ver' },
    { key: 'consent', ok: !!a.consent, title: 'Consentimiento firmado', sub: a.consent ? 'Banco autorizado para evaluar' : 'Aún no firmado', href: contractHref, cta: 'Contrato' },
    { key: 'docs', ok: !hasMissingDocs, warn: hasMissingDocs, title: 'Estados de cuenta', sub: hasMissingDocs ? 'Pendientes del cliente' : 'Documentos recibidos' },
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
              {(a.validUntil || (a.vehicleLinkedAt && !a.isPreapproval) || a.clientAccepted) && (
                <div className="row wrap gap-6" style={{ marginTop: 8 }}>
                  {a.validUntil && (
                    <span className="pill" style={{ background: a.expired ? 'rgba(220,38,38,.14)' : 'rgba(22,128,92,.14)', color: a.expired ? '#dc2626' : '#12805c' }}>
                      {a.expired ? 'Vigencia vencida' : 'Vigencia'} · hasta {fmtDay(a.validUntil)}
                    </span>
                  )}
                  {a.vehicleLinkedAt && !a.isPreapproval && (
                    <span className="pill" style={{ background: 'rgba(37,99,235,.14)', color: '#2563eb' }}>Cliente eligió vehículo · {fmtDay(a.vehicleLinkedAt)}</span>
                  )}
                  {a.selectedByClient && (
                    <span className="pill" style={{ background: 'rgba(22,163,74,.16)', color: '#166534', fontWeight: 700 }}><CheckCircle2 size={12} /> El cliente aceptó tu oferta</span>
                  )}
                  {a.clientAccepted && !a.selectedByClient && (
                    <span className="pill" style={{ background: 'rgba(100,116,139,.14)', color: '#475569' }}>Cliente aceptó otra oferta</span>
                  )}
                </div>
              )}
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
          <div className="row wrap center gap-8" style={{ marginTop: 10 }}>
            <label className="row center gap-6 tiny"><UserCheck size={14} className="muted" />
              <select className="input bankx-minisel" style={{ height: 34, padding: '2px 8px' }}
                value={a.reviewer?.id || ''} onChange={(e) => onAssign(a.responseId, e.target.value || null)}>
                <option value="">Sin analista asignado</option>
                {(officers || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="row center gap-6 tiny"><ClipboardList size={14} className="muted" />
              <select className="input bankx-minisel" style={{ height: 34, padding: '2px 8px' }}
                value={a.underwritingStage || 'nuevo'} onChange={(e) => onStage(a.responseId, e.target.value)}>
                {UNDERWRITING_STAGES.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
              </select>
            </label>
          </div>
        </aside>
      </div>

      {/* Cliente / Vehículo / Capacidad */}
      <div className="bankx-expgrid">
        <section className="card pad">
          <div className="row between center" style={{ marginBottom: 10 }}><h3 style={{ fontSize: 15, margin: 0 }}>Cliente</h3><span className={`pill ${a.kyc === 'aprobado' ? 'green' : 'amber'}`}>{a.kyc === 'aprobado' ? 'Verificado' : 'Pendiente'}</span></div>
          {/* Ocupación and Dirección are never inferred. They show what the client
              declared, or what this bank recorded itself — they used to be filled
              from a hash, and a bank must not see details AutoRD invented. */}
          <ClientInfoPanel app={a} />
        </section>

        <section className="card pad">
          <RequestInfoPanel a={a} bank={bank} />
        </section>

        <section className="card pad">
          <RiskPanel a={a} documents={effectiveDocs} />
        </section>

        <section className="card pad">
          <CapacityTool a={a} />
        </section>

        <section className="card pad">
          <PackagePanel a={a} />
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
        <PaymentCapacityTool app={a} />
      </div>

      {/* Documentos + Actividad */}
      <div className="bankx-docgrid">
        <DocWorkflow app={a} docs={docs} setDocs={setDocs} docStatus={docStatus} setDocStatus={setDocStatus} />
        <section className="card pad">
          <div className="row between center" style={{ marginBottom: 4 }}>
            <div><h3 style={{ fontSize: 15, margin: 0 }}>Actividad y comunicación</h3><div className="tiny muted">Historial de banco, dealer y cliente</div></div>
            <div className="row center gap-6">
              <ClientLinkButton applicationId={a.applicationId} />
              {a.phone && <a className="btn btn-primary btn-sm" href={`https://wa.me/${digits(a.phone)}?text=${encodeURIComponent(waMsg(a))}`} target="_blank" rel="noreferrer"><WhatsAppIcon size={15} /> WhatsApp</a>}
            </div>
          </div>
          <div className="bankx-timeline" style={{ marginTop: 12 }}>
            {events.map((e, i) => (
              <div className="bankx-tlitem" key={`ev-${i}`}>
                <span className="bankx-tldot" style={{ background: e.kind === 'accepted' ? '#16a34a' : e.kind === 'verified' ? '#0f766e' : '#2563eb' }} />
                <div><b className="small">{bankEventLabel(e)}</b><div className="tiny muted">{fmtEventWhen(e.at)} · {e.actor}</div></div>
              </div>
            ))}
            {[...a.timeline].reverse().map((e, i) => (
              <div className="bankx-tlitem" key={i}>
                <span className={`bankx-tldot ${/pendiente|solicit/i.test(e.name) ? 'amber' : ''}`} />
                <div><b className="small">{e.name}</b><div className="tiny muted">{e.when} · {e.actor}{e.note ? ` · ${e.note}` : ''}</div></div>
              </div>
            ))}
            {events.length === 0 && a.timeline.length === 0 && <div className="tiny muted">Sin actividad todavía.</div>}
          </div>
        </section>
      </div>

      {/* Client history (this bank's own past decisions for the client) */}
      <ClientHistoryBank buyerId={a.buyerId} currentAppId={a.applicationId} />

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

function ApplicationDetail({ a, onBack, onAssign, onStage, onAddNote, officers, bank }) {
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
  const effectiveDocs = useMemo(() => docsForReview(docs, docStatus), [docs, docStatus])
  const hasMissingDocs = docsMissing(effectiveDocs)
  // Requisitos-before-deciding checklist state.
  const checklist = [
    { key: 'kyc', ok: a.kyc === 'aprobado', title: 'KYC DIDIT', sub: a.kyc === 'aprobado' ? 'Cédula + prueba de vida' : 'Identidad sin verificar', action: null },
    { key: 'consent', ok: !!a.consent, title: 'Consentimiento', sub: a.consent ? 'Banco autorizado a evaluar' : 'Aún no firmado', action: a.contractToken ? { label: 'Contrato', href: `/contrato/${a.contractToken}` } : null },
    { key: 'docs', ok: !hasMissingDocs, warn: hasMissingDocs, title: 'Documentos', sub: hasMissingDocs ? 'Pendientes del cliente' : 'Documentos recibidos', action: null },
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
          <div className="row wrap center gap-8" style={{ marginTop: 10 }}>
            <label className="row center gap-6 tiny"><UserCheck size={14} className="muted" />
              <select className="input bankx-minisel" style={{ height: 34, padding: '2px 8px' }}
                value={a.reviewer?.id || ''} onChange={(e) => onAssign(a.responseId, e.target.value || null)}>
                <option value="">Sin analista asignado</option>
                {(officers || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="row center gap-6 tiny"><ClipboardList size={14} className="muted" />
              <select className="input bankx-minisel" style={{ height: 34, padding: '2px 8px' }}
                value={a.underwritingStage || 'nuevo'} onChange={(e) => onStage(a.responseId, e.target.value)}>
                {UNDERWRITING_STAGES.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
              </select>
            </label>
          </div>
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
            <KV k="Cédula" v={maskedCedulaLabel(a) || 'No disponible'} mono />
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

          <PaymentCapacityTool app={a} />

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
  const [statusBusy, setStatusBusy] = useState(null)
  const [err, setErr] = useState('')
  const [rejecting, setRejecting] = useState(null) // doc id awaiting reason
  const [reason, setReason] = useState('')

  const toggle = (d) => setSel((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]))
  const statusOf = (doc) => docEffectiveStatus(doc, docStatus)
  const applyLocalStatus = (id, status, patch = {}) => {
    setDocStatus((m) => ({ ...m, [id]: status }))
    setDocs((cur) => cur.map((d) => (d.id === id ? { ...d, ...patch, status } : d)))
  }
  const setStatus = async (doc, status, notes = null) => {
    const prior = docs.find((d) => d.id === doc.id) || doc
    const priorOverlay = docStatus[doc.id]
    setErr('')
    setStatusBusy(doc.id)
    applyLocalStatus(doc.id, status, notes != null ? { notes } : {})
    try {
      const updated = await updateApplicationDocumentStatus(doc, status, notes)
      setDocs((cur) => cur.map((d) => (d.id === doc.id ? updated : d)))
      setDocStatus((m) => ({ ...m, [doc.id]: docEffectiveStatus(updated, {}) }))
    } catch (e) {
      setDocs((cur) => cur.map((d) => (d.id === doc.id ? prior : d)))
      setDocStatus((m) => {
        const next = { ...m }
        if (priorOverlay) next[doc.id] = priorOverlay
        else delete next[doc.id]
        return next
      })
      setErr(e?.message || 'No se pudo actualizar el documento.')
    } finally {
      setStatusBusy(null)
    }
  }

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
                    {st !== 'aceptado' && <button className="btn btn-outline btn-sm" disabled={statusBusy === doc.id} style={{ padding: '3px 8px', color: '#166534' }} onClick={() => setStatus(doc, 'aceptado')}><CheckCircle2 size={13} /> Aceptar</button>}
                    {st !== 'rechazado' && <button className="btn btn-outline btn-sm" disabled={statusBusy === doc.id} style={{ padding: '3px 8px', color: '#b91c1c' }} onClick={() => setRejecting(doc.id)}><XCircle size={13} /> Rechazar</button>}
                  </div>
                )}
                {rejecting === doc.id && (
                  <div className="row gap-4" style={{ width: '100%', marginTop: 6 }}>
                    <input className="input" style={{ height: 34 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del rechazo (requerido)" />
                    <button className="btn btn-navy btn-sm" disabled={!reason.trim() || statusBusy === doc.id} onClick={() => { setStatus(doc, 'rechazado', reason.trim()); setRejecting(null); setReason('') }}>Rechazar</button>
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
        validUntil: expires || null,
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

// Risk summary. Only shows flags the record can actually justify — a red flag
// against a real applicant can cost them a car, so anything we cannot compute
// stays silent rather than appearing as a warning.
function RiskPanel({ a, documents }) {
  const flags = riskFlags(a, { documents })
  const summary = riskSummary(flags)
  const tone = TONE[summary.tone] || TONE.slate
  return (
    <>
      <div className="row between center" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Riesgo</h3>
        <span className="chip" style={{ background: tone.bg, color: tone.fg }}>{summary.label}</span>
      </div>
      {summary.clean ? (
        <div className="tiny muted">No se detectaron alertas con la información disponible.</div>
      ) : (
        <div className="col gap-8">
          {flags.map((f) => {
            const lt = TONE[(FLAG_LEVEL[f.level] || {}).tone] || TONE.slate
            return (
              <div className="bankx-flag" key={f.key}>
                <span className="bankx-flag-dot" style={{ background: lt.fg }} />
                <div style={{ minWidth: 0 }}>
                  <div className="strong small">{f.label}</div>
                  <div className="tiny muted">{f.detail}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// Decision SUPPORT. It never approves or rejects, and says so on screen — an
// analyst reading a green pill under time pressure should not mistake it for a
// credit decision the bank did not make.
function CapacityTool({ a }) {
  const [income, setIncome] = useState(a.income ?? '')
  const [debts, setDebts] = useState('')
  const [down, setDown] = useState(a.down ?? '')
  const [price, setPrice] = useState(a.vehiclePrice ?? '')
  const [amount, setAmount] = useState(a.amount ?? '')
  const [apr, setApr] = useState(a.apr ?? 12)
  const [term, setTerm] = useState(a.term ?? 5)
  const [maxDti, setMaxDti] = useState(40)

  const r = assessCapacity({
    income, monthlyDebts: debts, downAvailable: down, vehiclePrice: price,
    requestedAmount: amount, apr, termYears: term, maxDtiPct: maxDti,
  })
  const verdict = r?.verdict ? CAPACITY_VERDICT[r.verdict] : null
  const vt = verdict ? (TONE[verdict.tone] || TONE.slate) : TONE.slate

  return (
    <>
      <div className="row between center" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Herramienta de capacidad</h3>
        <span className="pill">Solo referencia</span>
      </div>

      <div className="bankx-kv-grid">
        <F label="Ingreso mensual"><input className="input" inputMode="numeric" value={income} onChange={(e) => setIncome(e.target.value.replace(/[^0-9]/g, ''))} /></F>
        <F label="Deudas mensuales"><input className="input" inputMode="numeric" value={debts} onChange={(e) => setDebts(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" /></F>
        <F label="Inicial disponible"><input className="input" inputMode="numeric" value={down} onChange={(e) => setDown(e.target.value.replace(/[^0-9]/g, ''))} /></F>
        <F label="Precio del vehículo"><input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} /></F>
        <F label="Monto a financiar"><input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} /></F>
        <F label="Tasa (%)"><input className="input" value={apr} onChange={(e) => setApr(e.target.value)} /></F>
        <F label="Plazo (años)"><input className="input" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value.replace(/[^0-9]/g, ''))} /></F>
        <F label="Máx. cuota/ingreso (%)"><input className="input" inputMode="numeric" value={maxDti} onChange={(e) => setMaxDti(e.target.value.replace(/[^0-9]/g, ''))} /></F>
      </div>

      {!r ? (
        <div className="tiny muted" style={{ marginTop: 12 }}>Ingresa el ingreso mensual para calcular.</div>
      ) : (
        <>
          <div className="bankx-cap-out">
            <div><span>Cuota estimada</span><b>{r.monthly != null ? fmtRD(r.monthly) : '—'}</b></div>
            <div><span>Capacidad máxima</span><b>{fmtRD(Math.round(r.maxMonthly))}/mes</b></div>
            <div><span>Monto máximo</span><b>{fmtRD(Math.round(r.maxFinanceable))}</b></div>
            <div><span>Cuota/ingreso</span><b>{r.dti != null ? `${Math.round(r.dti * 100)}%` : '—'}</b></div>
          </div>
          {verdict && (
            <div className="row center gap-8" style={{ marginTop: 12 }}>
              <span className="chip" style={{ background: vt.bg, color: vt.fg }}>{verdict.label}</span>
            </div>
          )}
          <div className="tiny muted" style={{ marginTop: 8 }}>{r.explanation}</div>
          <div className="notice" style={{ marginTop: 12 }}>
            <Info size={15} />
            <span>Cálculo de referencia. No aprueba ni rechaza: la decisión y las condiciones finales son del banco.</span>
          </div>
        </>
      )}
    </>
  )
}

// Approval package. Deliberately NOT a new document: the terms already live on
// application_banks and /contrato/:token already renders them under
// "Condiciones ofrecidas por {banco}". Generating seals a hash of those terms
// and stamps who/when, so an edit afterwards is surfaced rather than silently
// changing a document the client may already have acted on.
function PackagePanel({ a }) {
  const [state, setState] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    if (!a.responseId) { setState(null); return }
    getPackageState(a.responseId).then(setState).catch(() => setState(null))
  }, [a.responseId])
  useEffect(load, [load])

  const generate = async () => {
    setBusy(true); setErr('')
    try { await generateApprovalPackage(a.responseId); load() }
    catch (e) { setErr(e?.message || 'No se pudo generar') }
    finally { setBusy(false) }
  }

  const fmtWhen = (d) => (d ? new Date(d).toLocaleString('es-DO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null)

  return (
    <>
      <div className="row between center" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Paquete de condiciones</h3>
        {state?.hasPackage && !state?.stale && <span className="chip chip-green">Generado</span>}
        {state?.stale && <span className="chip chip-amber">Condiciones cambiaron</span>}
      </div>

      {state === undefined ? (
        <div className="tiny muted"><Loader2 size={13} className="spin" /> Cargando…</div>
      ) : !state?.canGenerate && !state?.hasPackage ? (
        <div className="tiny muted">Disponible una vez registres una decisión con condiciones (pre-aprobación, oferta o condicional).</div>
      ) : (
        <>
          {state?.hasPackage && (
            <div className="bankx-infoline">
              <span>Generado</span>
              <b>{fmtWhen(state.generatedAt)}{state.generatedBy ? ` · ${state.generatedBy}` : ''}</b>
            </div>
          )}
          {state?.stale && (
            <div className="notice" style={{ marginTop: 10 }}>
              <AlertTriangle size={15} />
              <span>Las condiciones cambiaron desde que se generó el paquete. Vuelve a generarlo para que el cliente vea los términos vigentes.</span>
            </div>
          )}
          {err && <div className="tiny" style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div>}
          <div className="row wrap gap-8" style={{ marginTop: 12 }}>
            <button className="btn btn-navy btn-sm" disabled={busy || !state?.canGenerate} onClick={generate}>
              {busy ? <Loader2 size={14} className="spin" /> : <FileCheck2 size={14} />}
              {state?.hasPackage ? ' Regenerar paquete' : ' Generar paquete'}
            </button>
            {a.contractToken && (
              <a className="btn btn-outline btn-sm" href={`/contrato/${a.contractToken}`} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Ver como lo ve el cliente
              </a>
            )}
          </div>
          <div className="tiny muted" style={{ marginTop: 8 }}>
            El cliente y el dealer ven las condiciones en el contrato; las notas internas y el análisis de riesgo nunca se incluyen.
          </div>
        </>
      )}
    </>
  )
}

// "Solicitar información". An inline panel rather than a modal: this already
// lives inside the expediente modal, and a dialog on top of a dialog is close to
// unusable on a phone — which is where these get sent from.
//
// It does not send anything by itself. Saving records the request (and creates
// the document rows the client uploads into); the WhatsApp is a wa.me link an
// analyst clicks, so a message to a real customer always has a human behind it.
function RequestInfoPanel({ a, bank }) {
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState([])
  const [message, setMessage] = useState('')
  const [urgency, setUrgency] = useState('normal')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [openReqs, setOpenReqs] = useState([])
  const [waHref, setWaHref] = useState(null)

  const load = useCallback(() => {
    if (!a.applicationId) return
    getOpenInfoRequests(a.applicationId).then(setOpenReqs).catch(() => setOpenReqs([]))
  }, [a.applicationId])
  useEffect(load, [load])

  const toggle = (id) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const save = async () => {
    setBusy(true); setErr(''); setWaHref(null)
    try {
      await requestClientInfo(a.applicationId, {
        fields: sel, message: message.trim() || null, urgency, dueDate: dueDate || null,
      })
      // Build the link only after the request exists, so we never send a client
      // to a page asking for something we failed to record.
      try {
        const token = await getOrCreateFinancingToken(a.applicationId)
        if (token && a.phone) {
          const body = renderWaTemplate('banco_solicita_info', {
            cliente: a.customer, banco: bank?.name || 'tu banco',
            link: `${window.location.origin}/f/${token}`,
          })
          setWaHref(waLink(a.phone, body))
        }
      } catch (_) { /* the request is saved either way */ }
      setSel([]); setMessage(''); setUrgency('normal'); setDueDate(''); setOpen(false)
      load()
    } catch (e) {
      setErr(e?.message || 'No se pudo guardar la solicitud')
    } finally { setBusy(false) }
  }

  const openFields = [...new Set(openReqs.flatMap((r) => r.fields))]
  const labelOf = (id) => REQUESTABLE_FIELDS.find((f) => f.id === id)?.label || id

  return (
    <>
      <div className="row between center" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Solicitar información</h3>
        {openFields.length > 0 && <span className="chip chip-blue">{openFields.length} pendiente{openFields.length === 1 ? '' : 's'}</span>}
      </div>

      {openFields.length > 0 && (
        <div className="tiny muted" style={{ marginBottom: 10 }}>
          Ya solicitado: {openFields.map(labelOf).join(', ')}.
        </div>
      )}

      {waHref && (
        <div className="notice" style={{ marginBottom: 10 }}>
          <MessageSquare size={15} />
          <span>Solicitud guardada. <a href={waHref} target="_blank" rel="noreferrer"><b>Enviar por WhatsApp</b></a></span>
        </div>
      )}

      {!open ? (
        <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)} disabled={!a.applicationId}>
          <Send size={14} /> Pedir datos al cliente
        </button>
      ) : (
        <div className="bankx-clientedit">
          <div className="bankx-reqgrid">
            {REQUESTABLE_FIELDS.map((f) => (
              <label key={f.id} className="row center gap-6 small">
                <input type="checkbox" checked={sel.includes(f.id)} onChange={() => toggle(f.id)} />
                {f.label}
              </label>
            ))}
          </div>
          <F label="Mensaje para el cliente (opcional)" style={{ marginTop: 10 }}>
            <textarea className="input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Ej: necesitamos el comprobante de los últimos 3 meses." />
          </F>
          <div className="bankx-kv-grid" style={{ marginTop: 10 }}>
            <F label="Urgencia">
              <select className="select" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                <option value="normal">Normal</option>
                <option value="urgente">Urgente</option>
              </select>
            </F>
            <F label="Fecha límite (opcional)">
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </F>
          </div>
          {err && <div className="tiny" style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div>}
          <div className="row gap-8" style={{ marginTop: 12 }}>
            <button className="btn btn-navy btn-sm" disabled={busy || !sel.length} onClick={save}>
              {busy ? <Loader2 size={14} className="spin" /> : 'Guardar solicitud'}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button>
          </div>
          <div className="tiny muted" style={{ marginTop: 8 }}>
            Aparecerá en la lista del cliente como “Solicitado por el banco”. El WhatsApp lo envías tú.
          </div>
        </div>
      )}
    </>
  )
}
