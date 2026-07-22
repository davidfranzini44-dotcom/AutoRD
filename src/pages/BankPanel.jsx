import { useState, useEffect, useMemo } from 'react'
import {
  Inbox, Loader2, FileWarning, CheckCircle2, XCircle, Search, ShieldCheck, FileCheck2,
  Car, Upload, Info, Landmark, Send, FileText, ExternalLink, Plus, Clock, Users,
  AlertTriangle, ChevronLeft, UserCheck, Phone, Mail, MapPin, Briefcase, Eye, X,
  MessageSquare, ClipboardList, CalendarClock, Filter, TimerReset, WalletCards,
  BarChart3, BadgeCheck, ArrowUpRight, Building2,
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
import {
  REVIEWERS, DOC_TYPES, DOC_STATUS, TONE, enrichApp, bankStats,
} from '../data/bankDemo'

const FILTERS = [
  { id: 'todas', label: 'Todas' }, { id: 'nueva', label: 'Nueva' },
  { id: 'evaluando', label: 'En evaluación' }, { id: 'docs', label: 'Pendiente docs' },
  { id: 'preaprobada', label: 'Pre-aprobada' }, { id: 'rechazada', label: 'Rechazada' },
]
const Chip = ({ tone, children, style }) => {
  const t = TONE[tone] || TONE.slate
  return <span className="chip" style={{ background: t.bg, color: t.fg, ...style }}>{children}</span>
}

export default function BankPanel() {
  const [filter, setFilter] = useState('todas')
  const [raw, setRaw] = useState([])
  const [selId, setSelId] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
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

  const apps = useMemo(() => raw.map((a) => {
    const o = overrides[a.id]
    return o ? { ...a, reviewer: o.reviewer !== undefined ? o.reviewer : a.reviewer, notes: o.notes || [] } : a
  }), [raw, overrides])

  const dealers = [...new Set(apps.map((a) => a.dealer).filter(Boolean))].sort()
  const stats = bankStats(apps)
  const activeApps = apps.filter((a) => !['preaprobada', 'rechazada'].includes(a.status)).length
  const completeDossiers = apps.filter((a) => a.kyc === 'aprobado' && a.consent && a.status !== 'docs').length
  const readyApps = apps.filter((a) => ['nueva', 'evaluando'].includes(a.status) && a.kyc === 'aprobado' && a.consent).length
  const missingConsent = apps.filter((a) => a.kyc === 'aprobado' && !a.consent).length
  const slaRisk = stats.waiting.length
  const decisionScore = apps.length ? Math.round((completeDossiers / apps.length) * 100) : 0
  const decisionLabel = decisionScore >= 75 ? 'Flujo saludable' : decisionScore >= 50 ? 'Revisión activa' : 'Necesita atención'
  const approvalVolume = stats.totalApproved || 0
  const reviewerLoad = REVIEWERS.map((r) => ({
    ...r,
    count: apps.filter((a) => a.reviewer?.id === r.id && !['preaprobada', 'rechazada'].includes(a.status)).length,
    ready: apps.filter((a) => a.reviewer?.id === r.id && a.kyc === 'aprobado' && a.consent && a.status === 'evaluando').length,
  }))

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

  const openApp = (id) => { setSelId(id); setSheetOpen(true) }
  const assignReviewer = (id, reviewer) => setOverrides((o) => ({ ...o, [id]: { ...(o[id] || {}), reviewer } }))
  const addNote = (id, note) => setOverrides((o) => ({ ...o, [id]: { ...(o[id] || {}), notes: [{ ...note }, ...((o[id]?.notes) || [])] } }))

  const queue = [
    { key: 'lista', icon: CheckCircle2, tone: 'green', label: 'KYC + consentimiento — listas', n: apps.filter((a) => a.kyc === 'aprobado' && a.consent && a.status === 'evaluando').length, f: () => { setFilter('evaluando'); setKycOnly(true); setConsentOnly(true) } },
    { key: 'ready', icon: FileCheck2, tone: 'teal', label: 'Documentos completos', n: apps.filter((a) => a.kyc === 'aprobado' && a.consent && a.status !== 'docs' && a.status !== 'nueva').length, f: () => { setKycOnly(true); setConsentOnly(true) } },
    { key: 'wait', icon: AlertTriangle, tone: 'red', label: 'Esperando +24 h', n: stats.waiting.length, f: () => setFilter('todas') },
    { key: 'docs', icon: FileWarning, tone: 'amber', label: 'Faltan documentos', n: stats.docs, f: () => { setFilter('docs'); setDocsOnly(true) } },
  ]

  const kpis = [
    { icon: Inbox, v: stats.nuevas, l: 'Nuevas hoy' },
    { icon: Loader2, v: stats.evaluando, l: 'En evaluación' },
    { icon: FileWarning, v: stats.docs, l: 'Pendiente documentos' },
    { icon: ClipboardList, v: stats.ready, l: 'Listas para decisión' },
    { icon: CheckCircle2, v: stats.preaprobadas, l: 'Pre-aprobadas' },
    { icon: Clock, v: stats.avgResponse, l: 'Tiempo prom. respuesta' },
  ]

  const activity = apps.slice(0, 6).map((a) => {
    const ev = a.timeline[a.timeline.length - 1]
    return { text: `${ev?.name || 'Actualización'} · ${a.customer}`, when: ev?.when || a.receivedAt }
  })
  const commandCards = [
    {
      key: 'ready', icon: BadgeCheck, tone: 'green', label: 'Listas para decisión',
      value: readyApps, hint: 'KYC y consentimiento completos',
      onClick: () => { setFilter('evaluando'); setKycOnly(true); setConsentOnly(true); setDocsOnly(false) },
    },
    {
      key: 'sla', icon: TimerReset, tone: slaRisk ? 'red' : 'teal', label: 'SLA en riesgo',
      value: slaRisk, hint: 'solicitudes con más de 24 h',
      onClick: () => { setFilter('todas'); setShowFilters(true) },
    },
    {
      key: 'consent', icon: ShieldCheck, tone: missingConsent ? 'amber' : 'green', label: 'Falta consentimiento',
      value: missingConsent, hint: 'clientes con KYC aprobado',
      onClick: () => { setFilter('todas'); setKycOnly(true); setConsentOnly(false); setShowFilters(true) },
    },
    {
      key: 'volume', icon: WalletCards, tone: 'blue', label: 'Volumen aprobado',
      value: approvalVolume ? fmtRD(approvalVolume) : 'RD$0', hint: 'ofertas pre-aprobadas',
      onClick: () => setFilter('preaprobada'),
    },
  ]

  return (
    <main className="page bank-console-page">
      <div className="container">
        <div className="admin-head">
          <div className="row center gap-8">
            <div className="bank-console-logo"><BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={32} /></div>
            <div>
              <h1 style={{ fontSize: 22 }}>Panel del banco · {bank.name}</h1>
              <p className="tiny muted">Revisa solicitudes y registra tus respuestas de crédito</p>
            </div>
          </div>
          <span className="chip chip-navy" style={{ height: 30 }}><ShieldCheck size={14} /> La evaluación de crédito la realiza el banco de forma externa</span>
        </div>

        <section className="bank-hero-panel">
          <div className="bank-hero-main">
            <div className="bank-hero-brand">
              <div className="bank-console-logo"><BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={42} /></div>
              <span><Building2 size={14} /> Mesa de crédito</span>
            </div>
            <h2>Solicitudes listas, SLA y documentos al frente.</h2>
            <p>Revisa KYC, consentimiento, ingresos y documentos desde una cola pensada para que el analista tome la próxima decisión sin perder contexto.</p>
            <div className="bank-hero-actions">
              <button className="btn btn-primary" onClick={() => { setFilter('evaluando'); setKycOnly(true); setConsentOnly(true) }}><BadgeCheck size={16} /> Revisar listas</button>
              <button className="btn btn-outline" onClick={() => setShowFilters((s) => !s)}><Filter size={16} /> Filtros avanzados</button>
            </div>
          </div>
          <div className="bank-readiness-card">
            <div className="row between center">
              <div>
                <div className="tiny muted">Preparación para decisión</div>
                <strong>{decisionLabel}</strong>
              </div>
              <div className="bank-readiness-score">{decisionScore}%</div>
            </div>
            <div className="bank-readiness-track"><span style={{ width: `${Math.max(4, decisionScore)}%` }} /></div>
            <div className="bank-readiness-grid">
              <MiniStat label="Activas" value={activeApps} />
              <MiniStat label="Listas" value={readyApps} />
              <MiniStat label="Docs" value={stats.docs} />
              <MiniStat label="SLA +24 h" value={slaRisk} />
            </div>
            <div className="bank-privacy-line"><ShieldCheck size={14} /> El banco realiza la evaluación crediticia externa.</div>
          </div>
        </section>

        {/* KPI cards */}
        <div className="bank-kpis">
          {kpis.map((k) => { const Icon = k.icon; return (
            <div className="metric-card" key={k.l}><div className="mc-ic"><Icon size={18} /></div><div className="mc-v">{k.v}</div><div className="mc-l">{k.l}</div></div>
          ) })}
        </div>

        <div className="bank-command-grid">
          {commandCards.map((c) => {
            const Icon = c.icon
            const t = TONE[c.tone] || TONE.slate
            return (
              <button key={c.key} className="bank-command-card" onClick={c.onClick}>
                <span style={{ background: t.bg, color: t.fg }}><Icon size={17} /></span>
                <b>{c.value}</b>
                <strong>{c.label}</strong>
                <small>{c.hint}</small>
                <ArrowUpRight size={15} className="muted" />
              </button>
            )
          })}
        </div>

        {/* Priority queue + recent activity */}
        <div className="bank-cmd">
          <div className="card card-pad">
            <div className="small strong row center gap-8" style={{ marginBottom: 10 }}><AlertTriangle size={15} color="#f59e0b" /> Cola de prioridad</div>
            <div className="bank-queue">
              {queue.map((p) => { const Icon = p.icon; const t = TONE[p.tone]; return (
                <button key={p.key} className="bank-queue-item" onClick={p.f}>
                  <div className="verify-ic" style={{ width: 34, height: 34, borderRadius: 9, background: t.bg, color: t.fg, flex: 'none' }}><Icon size={16} /></div>
                  <div className="grow" style={{ minWidth: 0 }}><div className="strong" style={{ fontSize: 18 }}>{p.n}</div><div className="tiny muted">{p.label}</div></div>
                </button>
              ) })}
            </div>
          </div>
          <div className="card card-pad">
            <div className="small strong row center gap-8" style={{ marginBottom: 10 }}><Clock size={15} color="var(--teal-700)" /> Actividad reciente</div>
            <div className="col">
              {activity.map((e, i) => (
                <div key={i} className="row gap-10 dash-activity"><div className="dash-act-ic"><FileText size={13} /></div><div className="grow"><div className="small">{e.text}</div><div className="tiny muted">{e.when}</div></div></div>
              ))}
            </div>
            <div className="bank-workload">
              <div className="small strong row center gap-8"><BarChart3 size={15} color="var(--teal-700)" /> Carga por analista</div>
              {reviewerLoad.map((r) => (
                <button key={r.id} className="bank-workload-row" onClick={() => { setReviewerF(r.id); setShowFilters(true) }}>
                  <span className="avatar">{r.initials}</span>
                  <span className="grow"><strong>{r.name}</strong><small>{r.ready} listas para decisión</small></span>
                  <b>{r.count}</b>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="row between center wrap gap-10" style={{ marginBottom: 12 }}>
          <div className="tabbar bank-tabbar">
            {FILTERS.map((f) => <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>)}
          </div>
          <div className="row center gap-8">
            <div className="row center" style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--muted)' }} />
              <input className="input" placeholder="Cliente, cédula, vehículo, ID…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 38, paddingLeft: 32, width: 240 }} />
            </div>
            <button className={`btn btn-sm ${showFilters ? 'btn-navy' : 'btn-outline'}`} onClick={() => setShowFilters((s) => !s)}><Filter size={14} /> Filtros</button>
          </div>
        </div>

        {showFilters && (
          <div className="card card-pad bank-filters" style={{ marginBottom: 12 }}>
            <div className="row wrap gap-10">
              <label className="col gap-4"><span className="tiny strong">Dealer</span>
                <select className="input" value={dealerF} onChange={(e) => setDealerF(e.target.value)} style={{ height: 38, minWidth: 160 }}>
                  <option value="">Todos</option>{dealers.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="col gap-4"><span className="tiny strong">Revisor</span>
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

        <div className="bank-layout">
          {/* List — table on desktop, cards on mobile */}
          <div>
            <div className="card bank-table-card">
              <div className="table-wrap">
                <table className="table bank-table">
                  <thead><tr>
                    <th>ID</th><th>Cliente</th><th>Vehículo</th><th>Dealer</th><th className="num">Monto</th>
                    <th className="num">Ingreso</th><th>KYC</th><th>Consent.</th><th>Estado</th><th>Prioridad</th><th>Revisor</th>
                  </tr></thead>
                  <tbody>
                    {list.map((a) => (
                      <tr key={a.id} onClick={() => openApp(a.id)} style={{ cursor: 'pointer', background: a.id === selId ? 'var(--teal-50)' : undefined }}>
                        <td className="mono-num tiny muted">{a.id}</td>
                        <td><div className="strong small">{a.customer}</div><div className="tiny muted mono-num">{a.maskedCedula}</div></td>
                        <td className="muted small">{a.vehicle || (a.isPreapproval ? <Chip tone="teal"><Landmark size={11} /> Pre-aprobación</Chip> : '—')}</td>
                        <td className="muted small">{a.dealer || '—'}</td>
                        <td className="num small">{a.amount ? fmtRD(a.amount) : '—'}</td>
                        <td className="num tiny muted">{a.income ? fmtRD(a.income) : '—'}</td>
                        <td><StatusChip status={a.kyc} /></td>
                        <td>{a.consent ? <Chip tone="green"><FileCheck2 size={11} /> Sí</Chip> : <Chip tone="slate">No</Chip>}</td>
                        <td><span className={`chip ${bankStatusMeta[a.status].chip}`}>{bankStatusMeta[a.status].label}</span></td>
                        <td><Chip tone={a.priority.tone}>{a.priority.label}</Chip></td>
                        <td className="tiny muted">{a.reviewer ? a.reviewer.name.split(' ')[0] : '—'}</td>
                      </tr>
                    ))}
                    {list.length === 0 && <tr><td colSpan={11} className="muted" style={{ textAlign: 'center', padding: 28 }}>Sin solicitudes con estos filtros.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bank-cards">
              {list.map((a) => (
                <button key={a.id} className="card card-pad bank-app-card" onClick={() => openApp(a.id)}>
                  <div className="row between center gap-8">
                    <div className="strong small">{a.customer}</div>
                    <span className={`chip ${bankStatusMeta[a.status].chip}`}>{bankStatusMeta[a.status].label}</span>
                  </div>
                  <div className="tiny muted mono-num" style={{ marginBottom: 6 }}>{a.id} · {a.maskedCedula}</div>
                  <div className="tiny muted row center gap-4"><Car size={12} /> {a.vehicle || 'Pre-aprobación'} · {a.dealer || '—'}</div>
                  <div className="row between center" style={{ marginTop: 8 }}>
                    <span className="strong small">{a.amount ? fmtRD(a.amount) : 'Sin monto'}</span>
                    <div className="row gap-4"><StatusChip status={a.kyc} /><Chip tone={a.priority.tone} style={{ fontSize: 10 }}>{a.priority.label}</Chip></div>
                  </div>
                </button>
              ))}
              {list.length === 0 && <div className="card card-pad muted small" style={{ textAlign: 'center' }}>Sin solicitudes con estos filtros.</div>}
            </div>
          </div>

          {/* Detail — side panel (desktop) / full-screen sheet (mobile) */}
          <div className={`bank-detail ${sheetOpen ? 'sheet-open' : ''}`}>
            {sel ? (
              <ApplicationDetail key={sel.id} a={sel} onBack={() => setSheetOpen(false)}
                onAssign={(r) => assignReviewer(sel.id, r)} onAddNote={(n) => addNote(sel.id, n)} bank={bank} />
            ) : <div className="card card-pad muted small">Selecciona una solicitud para revisarla.</div>}
          </div>
        </div>
      </div>
    </main>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="bank-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function FilterToggle({ on, onClick, children }) {
  return <button type="button" className="chip" onClick={onClick} style={{ cursor: 'pointer', background: on ? 'var(--teal-50)' : 'transparent', color: on ? 'var(--teal-700)' : 'var(--muted)', border: on ? '1px solid var(--teal-100)' : '1px solid var(--line)' }}>{on ? <CheckCircle2 size={13} /> : <Plus size={13} />} {children}</button>
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

  const [make, model, yr] = (a.vehicle || '').split(' ')

  return (
    <aside className="col gap-14">
      <button className="btn btn-ghost btn-sm bank-back" style={{ alignSelf: 'flex-start' }} onClick={onBack}><ChevronLeft size={16} /> Volver a la lista</button>

      {/* Header + reviewer */}
      <div className="card card-pad">
        <div className="row between center" style={{ marginBottom: 10 }}>
          <div>
            <div className="row center gap-8"><div className="strong">{a.customer}</div>{a.isPreapproval && <Chip tone="teal"><Landmark size={11} /> Pre-aprobación</Chip>}</div>
            <div className="tiny muted mono-num">{a.id} · Cédula {a.maskedCedula}</div>
          </div>
          <span className={`chip ${bankStatusMeta[a.status].chip}`}>{bankStatusMeta[a.status].label}</span>
        </div>
        <div className="row wrap between center gap-8" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
          <label className="row center gap-6 tiny"><UserCheck size={14} className="muted" />
            <select className="input" style={{ height: 32, fontSize: 12, padding: '2px 8px' }} value={a.reviewer?.id || ''} onChange={(e) => onAssign(REVIEWERS.find((r) => r.id === e.target.value) || null)}>
              <option value="">Sin asignar</option>{REVIEWERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <span className="tiny muted"><Chip tone={a.priority.tone}>{a.priority.label}</Chip></span>
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>{a.reviewerState} · recibida {a.receivedAt} · último cambio {a.lastTouched}</div>
      </div>

      {/* Tabs */}
      <div className="tabbar" style={{ alignSelf: 'stretch' }}>
        <button className={tab === 'revision' ? 'active' : ''} onClick={() => setTab('revision')}>Expediente</button>
        <button className={tab === 'decision' ? 'active' : ''} onClick={() => setTab('decision')}>Decisión</button>
      </div>

      {tab === 'revision' ? (
        <>
          {/* Customer */}
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

          {/* KYC */}
          <Block icon={ShieldCheck} title="Verificación de identidad (KYC)">
            <KV k="Estado DIDIT" v={<StatusChip status={a.kyc} />} />
            <KV k="Cédula verificada" v={a.cedulaVerified ? <Chip tone="green"><CheckCircle2 size={11} /> Sí</Chip> : <Chip tone="slate">No</Chip>} />
            <KV k="Prueba de vida" v={a.livenessPassed ? <Chip tone="green"><CheckCircle2 size={11} /> Aprobada</Chip> : <Chip tone="slate">Pendiente</Chip>} />
            <KV k="Completado" v={a.kyc === 'aprobado' ? a.kycAt : '—'} />
            {a.kyc !== 'aprobado' && <div className="notice" style={{ marginTop: 8, borderColor: 'var(--amber-bd)', background: 'var(--amber-bg)' }}><AlertTriangle size={15} color="#b45309" /><span className="tiny">KYC no completado — no se puede consultar el buró hasta verificar identidad.</span></div>}
          </Block>

          {/* Consent */}
          <Block icon={FileCheck2} title="Consentimiento de crédito">
            <KV k="Firmado" v={a.consent ? <Chip tone="green"><FileCheck2 size={11} /> Sí</Chip> : <Chip tone="red">No</Chip>} />
            {a.consent && <><KV k="Fecha" v={a.consentAt} /><KV k="Versión" v={a.consentVersion} /><KV k="Bancos autorizados" v={a.banksAuthorized} /></>}
            {a.consent && <div className="notice" style={{ marginTop: 8, background: 'var(--teal-50)', borderColor: 'var(--teal-100)' }}><ShieldCheck size={15} color="var(--teal-700)" /><span className="tiny">El cliente autorizó a este banco a consultar su historial crediticio.</span></div>}
          </Block>

          {/* Vehicle / dealer */}
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

          {/* Documents */}
          <DocWorkflow app={a} docs={docs} setDocs={setDocs} docStatus={docStatus} setDocStatus={setDocStatus} />

          {/* Timeline */}
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

          {/* Internal notes */}
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
    </aside>
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
    { id: 'evaluando', label: 'En evaluación', icon: Loader2 },
    { id: 'docs', label: 'Solicitar documentos', icon: FileWarning },
    { id: 'approved', label: 'Pre-aprobar', icon: CheckCircle2 },
    { id: 'rejected', label: 'Rechazar', icon: XCircle },
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
    <div className="card card-pad"><div className="verify-row ok"><div className="verify-ic"><CheckCircle2 size={20} /></div><div className="grow"><div className="strong">Respuesta enviada</div><div className="tiny muted">{[toCustomer && 'cliente', toDealer && 'dealer'].filter(Boolean).join(' y ') || 'Nadie'} notificado{toCustomer && toDealer ? 's' : ''}.</div></div></div></div>
  )

  return (
    <div className="card card-pad">
      <div className="small strong row center gap-8" style={{ marginBottom: 10 }}><Send size={15} color="var(--teal-700)" /> Registrar respuesta</div>
      <div className="grid grid-2" style={{ gap: 8 }}>
        {decisions.map((d) => { const Icon = d.icon; const on = decision === d.id; return (
          <button key={d.id} className={`btn btn-sm ${on ? 'btn-navy' : 'btn-outline'}`} onClick={() => { setDecision(d.id); setPreview(false) }}><Icon size={15} /> {d.label}</button>
        ) })}
      </div>

      {isApprove && (
        <div style={{ marginTop: 12 }}>
          <F label={a.isPreapproval ? 'Monto pre-aprobado (RD$) — máximo a financiar' : 'Monto aprobado (RD$)'}><input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1,800,000" /></F>
          <div className="grid grid-2" style={{ gap: 10, marginTop: 10 }}>
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
    <div className="card card-pad">
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
