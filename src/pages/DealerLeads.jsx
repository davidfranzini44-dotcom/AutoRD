import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, FileText, Landmark,
  MessageCircle, Phone, Plus, Save, Search, ShieldCheck, X,
} from 'lucide-react'
import { getDealerLeads, updateLead, ibMessages, LIVE } from '../data/api'
import { useAuth } from '../context/AuthContext'
import { fmtMoney } from '../data/demo'
import CarImage from '../components/CarImage'
import { LEAD_STAGES, SALESPEOPLE, buildLeads, kycLink } from '../data/dealerDemo'
import './DealerLeads.css'

const digits = (p) => String(p || '').replace(/[^\d]/g, '')
const waLink = (phone, text) => `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`
const initialsOf = (name) => String(name || '').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
const stageIdx = (key) => Math.max(0, LEAD_STAGES.findIndex((s) => s.key === key))
const stageMeta = (key) => LEAD_STAGES.find((s) => s.key === key) || LEAD_STAGES[0]

const TEMPLATES = [
  { label: 'Saludo', text: (l) => `Hola ${l.customer}, le saluda ${l.salesperson || 'nuestro equipo'} del dealer. Vi su interés en el ${l.vehicle?.name || 'vehículo'}. ¿Cómo le puedo ayudar?` },
  { label: 'Sigue disponible', text: (l) => `Hola ${l.customer}, el ${l.vehicle?.name || 'vehículo'} sigue disponible. ¿Coordinamos una visita o prueba de manejo?` },
  { label: 'Financiamiento', text: (l) => `Hola ${l.customer}, con gusto le preparo opciones de financiamiento para el ${l.vehicle?.name || 'vehículo'}. ¿Me confirma su inicial estimada?` },
  { label: 'Recordatorio de cita', text: (l) => `Hola ${l.customer}, le recuerdo nuestra cita para ver el ${l.vehicle?.name || 'vehículo'}. ¿Confirmamos?` },
]

const VIEW_TABS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'citas', label: 'Citas' },
  { key: 'financ', label: 'Financ.' },
]

const PIPELINE_GROUPS = [
  { key: 'nuevo', label: 'Nuevo', stages: ['nuevo'] },
  { key: 'contactado', label: 'Contactado', stages: ['contactado'] },
  { key: 'financiamiento', label: 'Financiamiento', stages: ['financiamiento'] },
  { key: 'cierre', label: 'Cierre', stages: ['negociando', 'reservado', 'vendido', 'perdido'] },
]

function hasUnread(l) {
  return Number(l.unread || 0) > 0 || l.unread === true
}

function noteOf(l) {
  return l.notes || l.note || ''
}

function needsDocs(l) {
  return l.fin === 'documentos' || /document|carta|estado/i.test(noteOf(l))
}

function isPreApproved(l) {
  return l.fin === 'preaprobado' || l.stage === 'reservado'
}

function isFinanceLead(l) {
  return !!l.fin || ['financiamiento', 'negociando', 'reservado'].includes(l.stage)
}

function nextLabel(l) {
  if (l.followUpAt) {
    return new Date(l.followUpAt).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }
  return l.next || l.last || 'Sin seguimiento'
}

function kycMessage(l) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const verifyLink = kycLink(origin, { vehiculo: l.vehicle?.id, nombre: l.customer })
  return `Hola ${l.customer}, para avanzar con el ${l.vehicle?.name || 'vehículo'} necesitamos verificar tu identidad (cédula + prueba de vida, sin crear cuenta, ~2 min). Hazlo aquí: ${verifyLink}`
}

function actionForLead(l) {
  if (hasUnread(l)) return { label: 'Responder', tone: 'red', cta: 'WhatsApp', detail: 'Mensaje sin responder', href: waLink(l.phone, TEMPLATES[0].text(l)) }
  if (needsDocs(l)) return { label: 'Docs', tone: 'amber', cta: 'Enviar plantilla', detail: 'Banco pidió documentos', href: waLink(l.phone, TEMPLATES[2].text(l)) }
  if (!l.kycVerified) return { label: 'KYC', tone: 'blue', cta: 'Solicitar KYC', detail: 'Falta verificar identidad', href: waLink(l.phone, kycMessage(l)) }
  if (isPreApproved(l)) return { label: 'Oferta', tone: 'green', cta: 'WhatsApp', detail: 'Oferta bancaria lista', href: waLink(l.phone, TEMPLATES[2].text(l)) }
  if (l.followUpAt || l.next) return { label: 'Cita', tone: 'teal', cta: 'Confirmar', detail: `Seguimiento: ${nextLabel(l)}`, href: waLink(l.phone, TEMPLATES[3].text(l)) }
  return { label: 'Lead', tone: 'teal', cta: 'WhatsApp', detail: 'Listo para contactar', href: waLink(l.phone, TEMPLATES[0].text(l)) }
}

function priorityScore(l) {
  let score = 0
  if (hasUnread(l)) score += 120
  if (needsDocs(l)) score += 100
  if (isPreApproved(l)) score += 88
  if (!l.kycVerified) score += 74
  if (l.hot) score += 56
  if (l.today) score += 32
  if (l.followUpAt || l.next) score += 18
  const lastAt = l.lastAt || l.createdAt
  if (lastAt) score += Math.max(0, 20 - Math.round((Date.now() - new Date(lastAt).getTime()) / 3_600_000))
  return score
}

function viewIncludesLead(view, l) {
  if (view === 'pipeline') return true
  if (view === 'citas') return !!l.followUpAt || !!l.next || ['negociando', 'reservado'].includes(l.stage)
  if (view === 'financ') return isFinanceLead(l) || needsDocs(l) || !l.kycVerified
  return hasUnread(l) || l.today || l.hot || needsDocs(l) || !l.kycVerified || isPreApproved(l)
}

export default function DealerLeads() {
  const { profile } = useAuth() || {}
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [q, setQ] = useState('')
  const [sales, setSales] = useState('')
  const [view, setView] = useState('hoy')
  const [busyId, setBusyId] = useState(null)
  const [active, setActive] = useState(null)
  const [manualOpen, setManualOpen] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getDealerLeads()
      .then((rows) => {
        if (!alive) return
        const nextRows = !LIVE && (!rows || rows.length === 0) ? buildLeads([]) : (rows || [])
        setLeads(nextRows)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setLeads(!LIVE ? buildLeads([]) : [])
        setLoading(false)
      })
    return () => { alive = false }
  }, [profile?.dealer_id, reload])
  const refetch = () => setReload((x) => x + 1)

  const filtered = useMemo(() => leads.filter((l) => {
    if (sales && l.salesperson !== sales) return false
    if (q && !`${l.customer} ${l.vehicle?.name || ''} ${l.phone} ${noteOf(l)}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [leads, sales, q])

  const boardLeads = useMemo(() => filtered.filter((l) => viewIncludesLead(view, l)), [filtered, view])
  const priorityLeads = useMemo(() => [...filtered].sort((a, b) => priorityScore(b) - priorityScore(a)).slice(0, 5), [filtered])
  const selectedLead = priorityLeads.find(isPreApproved) || priorityLeads[0] || filtered[0] || null
  const unreadCount = filtered.filter(hasUnread).length
  const preApprovedCount = filtered.filter(isPreApproved).length
  const docsCount = filtered.filter(needsDocs).length
  const kycCount = filtered.filter((l) => !l.kycVerified).length
  const followUps = filtered.filter((l) => l.followUpAt || l.next).length
  const hotCount = filtered.filter((l) => l.hot || isPreApproved(l)).length

  const signals = [
    filtered.find(needsDocs) && { key: 'docs', lead: filtered.find(needsDocs), title: 'Banco pidió documentos', detail: 'Enviar requisitos al cliente', tone: 'amber' },
    filtered.find(hasUnread) && { key: 'unread', lead: filtered.find(hasUnread), title: 'Lead caliente sin respuesta', detail: 'Responder antes de perder intención', tone: 'red' },
    filtered.find((l) => l.followUpAt || l.next) && { key: 'follow', lead: filtered.find((l) => l.followUpAt || l.next), title: 'Cita por confirmar', detail: nextLabel(filtered.find((l) => l.followUpAt || l.next)), tone: 'blue' },
  ].filter(Boolean)

  async function moveStage(l, dir) {
    const i = stageIdx(l.stage) + dir
    if (i < 0 || i >= LEAD_STAGES.length) return
    setBusyId(l.id)
    const nextStage = LEAD_STAGES[i].key
    try {
      await updateLead(l.id, { stage: nextStage })
      setLeads((rows) => rows.map((row) => row.id === l.id ? { ...row, stage: nextStage } : row))
      refetch()
    } catch (e) {
      alert(e?.message || 'No se pudo mover el lead')
    } finally {
      setBusyId(null)
    }
  }

  function addManualLead(data) {
    const manualLead = {
      id: `manual-${Date.now()}`,
      customer: data.customer,
      phone: data.phone,
      stage: 'nuevo',
      salesperson: data.salesperson || '',
      notes: data.notes || 'Lead creado manualmente desde el panel.',
      unread: 0,
      last: 'Ahora',
      createdAt: new Date().toISOString(),
      today: true,
      hot: false,
      kycVerified: false,
      vehicle: data.vehicle ? { name: data.vehicle, currency: 'DOP' } : null,
    }
    setLeads((rows) => [manualLead, ...rows])
    setManualOpen(false)
    setActive(manualLead)
  }

  return (
    <div className="dealer-leads-v2" data-view={view} data-testid="dealer-leads-page">
      <div className="dl-page-head">
        <div>
          <h1>Responde lo que puede cerrar hoy</h1>
          <p>Leads ordenados por intención, KYC, financiamiento y tiempo sin respuesta.</p>
        </div>
        <div className="dl-head-actions">
          <Link to="/dealer/whatsapp" className="btn btn-primary"><MessageCircle size={16} /> Abrir WhatsApp</Link>
          <button className="btn btn-outline" data-testid="manual-lead-open" onClick={() => setManualOpen(true)}><Plus size={16} /> Crear lead manual</button>
        </div>
      </div>

      <section className="dl-focus-grid">
        <article className="dl-focus-card">
          <span className="dl-eyebrow">Prioridad del día</span>
          <h2>{loading ? 'Cargando leads' : `${priorityLeads.length || filtered.length} leads necesitan respuesta`}</h2>
          <p>AutoRD agrupa nuevos mensajes, KYC pendiente, documentos solicitados y clientes pre-aprobados para que el vendedor no empiece desde cero.</p>
          <div className="dl-metric-row">
            <MiniMetric value={unreadCount} label="Sin responder" />
            <MiniMetric value={preApprovedCount} label="Pre-aprobados" />
            <MiniMetric value={followUps} label="Seguimientos" />
          </div>
        </article>

        <SelectedActionCard lead={selectedLead} onOpen={() => selectedLead && setActive(selectedLead)} />

        <aside className="dl-signal-card">
          <div className="dl-panel-head tight">
            <h3>Señales vivas</h3>
            <span>{loading ? 'Cargando' : 'Actualizado ahora'}</span>
          </div>
          <div className="dl-signal-list">
            {signals.map((s) => (
              <button key={s.key} className="dl-signal-row" onClick={() => setActive(s.lead)}>
                <span className={`dl-dot ${s.tone}`} />
                <span>
                  <strong>{s.title}</strong>
                  <small>{s.lead.customer} · {s.detail}</small>
                </span>
              </button>
            ))}
            {signals.length === 0 && <div className="dl-empty-mini">No hay alertas urgentes ahora.</div>}
          </div>
        </aside>
      </section>

      <section className="dl-filter-bar">
        <label className="dl-search">
          <Search size={16} />
          <input className="input" placeholder="Buscar cliente, vehículo, teléfono o monto" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input" value={sales} onChange={(e) => setSales(e.target.value)}>
          <option value="">Todos los vendedores</option>
          {SALESPEOPLE.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select className="input" value={view} onChange={(e) => setView(e.target.value)}>
          {VIEW_TABS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <div className="dl-tabs" role="tablist" aria-label="Vista de leads">
          {VIEW_TABS.map((t) => (
            <button key={t.key} data-testid={`lead-view-${t.key}`} className={view === t.key ? 'active' : ''} onClick={() => setView(t.key)}>{t.label}</button>
          ))}
        </div>
      </section>

      {!loading && leads.length === 0 ? (
        <div className="card card-pad muted small dl-empty">
          <MessageCircle size={24} className="muted" />
          <strong>Aún no tienes leads.</strong>
          <span>Cuando un comprador te contacte por un vehículo desde el marketplace, aparecerá aquí.</span>
        </div>
      ) : (
        <section className="dl-work-grid">
          <article className="dl-panel">
            <div className="dl-panel-head">
              <h3>Prioridad de hoy</h3>
              <span>{loading ? 'Cargando' : `${priorityLeads.length} en cola`}</span>
            </div>
            <div className="dl-priority-list">
              {priorityLeads.map((l) => <PriorityLeadCard key={l.id} lead={l} onOpen={() => setActive(l)} />)}
              {!loading && priorityLeads.length === 0 && <div className="dl-empty-mini">No hay leads que coincidan con los filtros.</div>}
            </div>
          </article>

          <article className="dl-panel dl-pipeline-panel">
            <div className="dl-panel-head">
              <h3>Pipeline compacto</h3>
              <span>{boardLeads.length} leads en esta vista</span>
            </div>
            <div className="dl-pipeline">
              {PIPELINE_GROUPS.map((group) => {
                const items = boardLeads.filter((l) => group.stages.includes(l.stage))
                return (
                  <div className="dl-stage" key={group.key}>
                    <div className="dl-stage-head">
                      <strong>{group.label}</strong>
                      <span className="dl-pill blue">{items.length}</span>
                    </div>
                    <div className="dl-stage-body">
                      {items.map((l) => (
                        <PipelineLeadCard key={l.id} lead={l} busy={busyId === l.id} onOpen={() => setActive(l)} onMove={moveStage} />
                      ))}
                      {items.length === 0 && <span className="dl-stage-empty">Sin leads</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </article>

          <aside className="dl-side-summary">
            <div className="dl-panel-head">
              <h3>Resumen comercial</h3>
              <span>{filtered.length} leads</span>
            </div>
            <div className="dl-summary-grid">
              <SummaryItem icon={AlertTriangle} label="Sin responder" value={unreadCount} tone="red" />
              <SummaryItem icon={ShieldCheck} label="KYC pendiente" value={kycCount} tone="blue" />
              <SummaryItem icon={FileText} label="Docs banco" value={docsCount} tone="amber" />
              <SummaryItem icon={Landmark} label="Alta intención" value={hotCount} tone="green" />
            </div>
            {selectedLead && (
              <div className="dl-next-card">
                <span className="dl-eyebrow">Siguiente caso</span>
                <strong>{selectedLead.customer}</strong>
                <p>{actionForLead(selectedLead).detail}</p>
                <button className="btn btn-primary btn-block" onClick={() => setActive(selectedLead)}>Abrir caso <ArrowRight size={15} /></button>
              </div>
            )}
          </aside>
        </section>
      )}

      {active && <LeadDrawer lead={active} onClose={() => setActive(null)} onChange={refetch} setLeads={setLeads} />}
      {manualOpen && <ManualLeadModal onClose={() => setManualOpen(false)} onCreate={addManualLead} />}
    </div>
  )
}

function SelectedActionCard({ lead, onOpen }) {
  if (!lead) {
    return (
      <article className="dl-selected-card empty">
        <span className="dl-eyebrow">Siguiente mejor acción</span>
        <h3>Sin leads activos</h3>
        <p>Cuando entren conversaciones, AutoRD destacará el caso más importante aquí.</p>
      </article>
    )
  }
  const action = actionForLead(lead)
  return (
    <article className="dl-selected-card">
      <div className="dl-avatar">{initialsOf(lead.customer)}</div>
      <div className="dl-selected-main">
        <span className="dl-eyebrow">Siguiente mejor acción</span>
        <h3>{lead.customer} {isPreApproved(lead) ? 'ya tiene pre-aprobación' : 'necesita seguimiento'}</h3>
        <p>{action.detail}. {lead.vehicle?.name ? `Interesado en ${lead.vehicle.name}.` : 'Lead recibido desde WhatsApp.'}</p>
        {lead.vehicle && (
          <div className="dl-vehicle-line">
            <span className="dl-vehicle-thumb"><CarImage make={lead.vehicle.make} model={lead.vehicle.model} bodyType={lead.vehicle.bodyType} seed={lead.vehicle.id || lead.id} photo={lead.vehicle.photo} /></span>
            <span>{lead.vehicle.name}{lead.vehicle.price ? ` · ${fmtMoney(lead.vehicle.price, lead.vehicle.currency)}` : ''}</span>
          </div>
        )}
      </div>
      <div className="dl-selected-actions">
        <SmallStat label="Estado" value={stageMeta(lead.stage).label} />
        <SmallStat label="Próximo paso" value={action.label} />
        <a className="btn btn-primary" href={action.href} target="_blank" rel="noreferrer">{action.cta}</a>
        <button className="btn btn-outline" data-testid="selected-lead-open" onClick={onOpen}>Ver caso</button>
      </div>
    </article>
  )
}

function PriorityLeadCard({ lead, onOpen }) {
  const action = actionForLead(lead)
  return (
    <div className="dl-lead-card">
      <div className="dl-lead-top">
        <div>
          <strong>{lead.customer}</strong>
          <span>{lead.last || 'Ahora'} · {action.detail}</span>
        </div>
        <span className={`dl-pill ${action.tone}`}>{action.label}</span>
      </div>
      <div className="dl-lead-meta">
        {lead.vehicle?.name || 'Vehículo por confirmar'}{lead.vehicle?.price ? ` · ${fmtMoney(lead.vehicle.price, lead.vehicle.currency)}` : ''}
      </div>
      <div className="dl-lead-actions">
        <a className="btn btn-primary" href={action.href} target="_blank" rel="noreferrer">{action.cta}</a>
        <button className="btn btn-outline" data-testid="priority-lead-open" onClick={onOpen}>Ver caso</button>
      </div>
    </div>
  )
}

function PipelineLeadCard({ lead, busy, onOpen, onMove }) {
  const action = actionForLead(lead)
  return (
    <div className="dl-stage-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}>
      <strong>{lead.customer}</strong>
      <span>{lead.vehicle?.name || 'Vehículo por confirmar'}</span>
      <div className="dl-stage-card-foot">
        <span className="dl-owner">{initialsOf(lead.salesperson || lead.customer)}</span>
        <span className={`dl-pill ${action.tone}`}>{action.label}</span>
      </div>
      <div className="dl-stage-move" onClick={(e) => e.stopPropagation()}>
        <button type="button" disabled={busy || stageIdx(lead.stage) === 0} onClick={() => onMove(lead, -1)} aria-label="Etapa anterior"><ChevronLeft size={12} /></button>
        <button type="button" disabled={busy || stageIdx(lead.stage) === LEAD_STAGES.length - 1} onClick={() => onMove(lead, 1)} aria-label="Etapa siguiente"><ChevronRight size={12} /></button>
      </div>
    </div>
  )
}

function LeadDrawer({ lead, onClose, onChange, setLeads }) {
  const [stage, setStage] = useState(lead.stage)
  const [salesperson, setSalesperson] = useState(lead.salesperson || '')
  const [notes, setNotes] = useState(noteOf(lead))
  const [savingNote, setSavingNote] = useState(false)
  const [messages, setMessages] = useState(null)

  const st = stageMeta(stage)
  const action = actionForLead({ ...lead, stage })

  useEffect(() => {
    let alive = true
    ibMessages(lead.id).then((m) => { if (alive) setMessages(m || []) }).catch(() => { if (alive) setMessages([]) })
    return () => { alive = false }
  }, [lead.id])

  const patch = async (fields) => {
    try {
      await updateLead(lead.id, fields)
      setLeads((rows) => rows.map((row) => row.id === lead.id ? { ...row, ...fields } : row))
      onChange?.()
    } catch (e) {
      alert(e?.message || 'No se pudo guardar')
    }
  }
  const onStage = (v) => { setStage(v); patch({ stage: v }) }
  const onSales = (v) => { setSalesperson(v); patch({ salesperson: v }) }
  const saveNote = async () => { setSavingNote(true); await patch({ notes }); setSavingNote(false) }

  return (
    <div className="dl-drawer-overlay" onClick={onClose}>
      <aside className="dl-drawer" data-testid="lead-drawer" onClick={(e) => e.stopPropagation()} aria-label={`Lead de ${lead.customer}`}>
        <div className="dl-drawer-head">
          <div className="dl-drawer-title">
            <div className="dl-avatar">{initialsOf(lead.customer)}</div>
            <div>
              <h3>{lead.customer}</h3>
              <p>{lead.vehicle?.name || 'Vehículo por confirmar'}</p>
            </div>
          </div>
          <button className="icon-btn" data-testid="lead-drawer-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="dl-drawer-body">
          <div className="dl-drawer-actions">
            <a href={action.href} target="_blank" rel="noreferrer" className="btn btn-primary btn-block"><MessageCircle size={16} /> {action.cta}</a>
            <a href={`tel:${digits(lead.phone)}`} className="btn btn-outline btn-block"><Phone size={16} /> Llamar</a>
          </div>

          <div className="dl-detail-block">
            <SectionTitle>Vehículo e intención</SectionTitle>
            {lead.vehicle && (
              <div className="dl-vehicle-detail">
                <div className="dash-top-photo"><CarImage make={lead.vehicle.make} model={lead.vehicle.model} bodyType={lead.vehicle.bodyType} seed={lead.vehicle.id || lead.id} photo={lead.vehicle.photo} /></div>
                <div>
                  <strong>{lead.vehicle.name}</strong>
                  {lead.vehicle.price ? <span>{fmtMoney(lead.vehicle.price, lead.vehicle.currency)}</span> : null}
                </div>
              </div>
            )}
            <KeyValue k="Estado" v={st.label} />
            <KeyValue k="Último contacto" v={lead.last || 'Ahora'} />
            <KeyValue k="Próximo seguimiento" v={nextLabel(lead)} />
          </div>

          <div className="dl-form-grid">
            <label className="col gap-4"><span className="tiny strong">Etapa</span>
              <select className="input" value={stage} onChange={(e) => onStage(e.target.value)}>
                {LEAD_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <label className="col gap-4"><span className="tiny strong">Vendedor</span>
              <select className="input" value={salesperson} onChange={(e) => onSales(e.target.value)}>
                <option value="">Sin asignar</option>
                {SALESPEOPLE.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </label>
          </div>

          <div className="dl-detail-block">
            <SectionTitle>Verificación y financiamiento</SectionTitle>
            <KeyValue k="KYC" v={lead.kycVerified ? 'Verificado' : 'Pendiente'} />
            <KeyValue k="Financiamiento" v={lead.fin ? stageMeta(lead.stage).label : (isFinanceLead(lead) ? 'En proceso' : 'No iniciado')} />
            {!lead.kycVerified && (
              <a className="btn btn-navy btn-block" href={waLink(lead.phone, kycMessage(lead))} target="_blank" rel="noreferrer">
                <ShieldCheck size={15} /> Solicitar verificación KYC
              </a>
            )}
          </div>

          <div>
            <SectionTitle>Nota interna</SectionTitle>
            <textarea className="input dl-note" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalles del cliente, acuerdos, seguimiento..." />
            <button className="btn btn-outline btn-sm" onClick={saveNote} disabled={savingNote || notes === noteOf(lead)}><Save size={14} /> {savingNote ? 'Guardando...' : 'Guardar nota'}</button>
          </div>

          <div className="dl-detail-block">
            <SectionTitle>Timeline</SectionTitle>
            <div className="dl-timeline">
              <TimelineItem title={lead.last || 'Ahora'} text={lead.lastText || action.detail} />
              {lead.kycVerified && <TimelineItem title="KYC completado" text="Identidad verificada y lista para avanzar." />}
              <TimelineItem title="Lead recibido" text="Conversación iniciada desde AutoRD." />
            </div>
          </div>

          <div className="dl-detail-block">
            <SectionTitle>Conversación</SectionTitle>
            {messages == null ? <div className="tiny muted">Cargando mensajes...</div>
              : messages.length === 0 ? <div className="tiny muted">Sin mensajes registrados.</div>
                : (
                  <div className="dl-message-list">
                    {messages.slice(-8).map((m) => (
                      <div key={m.id} className={m.direction === 'out' ? 'out' : ''}>{m.body}</div>
                    ))}
                  </div>
                )}
          </div>

          <div className="dl-detail-block">
            <SectionTitle>Plantillas de WhatsApp</SectionTitle>
            <div className="dl-template-list">
              {TEMPLATES.map((tpl) => (
                <a key={tpl.label} href={waLink(lead.phone, tpl.text(lead))} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm btn-block">
                  {tpl.label} <MessageCircle size={14} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

function ManualLeadModal({ onClose, onCreate }) {
  const [customer, setCustomer] = useState('')
  const [phone, setPhone] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [salesperson, setSalesperson] = useState('')
  const [notes, setNotes] = useState('')
  const ready = customer.trim() && phone.trim()
  return (
    <div className="dl-drawer-overlay modal" onClick={onClose}>
      <form className="dl-manual-modal" data-testid="manual-lead-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (ready) onCreate({ customer, phone, vehicle, salesperson, notes }) }}>
        <div className="row between center">
          <div>
            <h3>Crear lead manual</h3>
            <p className="tiny muted">Útil cuando el cliente llama o escribe fuera del flujo automático.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <label className="col gap-4"><span className="tiny strong">Cliente</span><input className="input" data-testid="manual-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Nombre del cliente" /></label>
        <label className="col gap-4"><span className="tiny strong">Teléfono</span><input className="input" data-testid="manual-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="8090000000" /></label>
        <label className="col gap-4"><span className="tiny strong">Vehículo</span><input className="input" data-testid="manual-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Ej. Lexus RX 2023" /></label>
        <label className="col gap-4"><span className="tiny strong">Vendedor</span>
          <select className="input" value={salesperson} onChange={(e) => setSalesperson(e.target.value)}>
            <option value="">Sin asignar</option>
            {SALESPEOPLE.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </label>
        <label className="col gap-4"><span className="tiny strong">Nota</span><textarea className="input dl-note" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qué quiere comprar, presupuesto, seguimiento..." /></label>
        <button className="btn btn-primary btn-block" data-testid="manual-submit" disabled={!ready}>Agregar a la cola</button>
      </form>
    </div>
  )
}

function MiniMetric({ value, label }) {
  return <div className="dl-mini-metric"><strong>{value}</strong><span>{label}</span></div>
}

function SmallStat({ label, value }) {
  return <div className="dl-small-stat"><span>{label}</span><strong>{value}</strong></div>
}

function SummaryItem({ icon: Icon, label, value, tone }) {
  return (
    <div className={`dl-summary-item ${tone}`}>
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SectionTitle({ children }) {
  return <div className="dl-section-title">{children}</div>
}

function KeyValue({ k, v }) {
  return <div className="dl-kv"><span>{k}</span><strong>{v || '-'}</strong></div>
}

function TimelineItem({ title, text }) {
  return <div className="dl-time-item"><i /><div><strong>{title}</strong><span>{text}</span></div></div>
}
