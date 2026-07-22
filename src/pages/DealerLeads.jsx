import { useEffect, useMemo, useState } from 'react'
import {
  Search, MessageCircle, Phone, X, CalendarClock, Car, Clock, ShieldCheck,
  ChevronLeft, ChevronRight, Save, User,
} from 'lucide-react'
import { getDealerLeads, updateLead, ibMessages } from '../data/api'
import { useAuth } from '../context/AuthContext'
import { fmtMoney } from '../data/demo'
import CarImage from '../components/CarImage'
import { LEAD_STAGES, SALESPEOPLE, kycLink } from '../data/dealerDemo'

const digits = (p) => String(p || '').replace(/[^\d]/g, '')
const waLink = (phone, text) => `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`
const initialsOf = (name) => String(name || '').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
const stageIdx = (key) => Math.max(0, LEAD_STAGES.findIndex((s) => s.key === key))

const TEMPLATES = [
  { label: 'Saludo', text: (l) => `Hola ${l.customer}, le saluda ${l.salesperson || 'nuestro equipo'} del dealer. Vi su interés en el ${l.vehicle?.name || 'vehículo'}. ¿Cómo le puedo ayudar?` },
  { label: 'Sigue disponible', text: (l) => `Hola ${l.customer}, el ${l.vehicle?.name || 'vehículo'} sigue disponible. ¿Coordinamos una visita o prueba de manejo?` },
  { label: 'Financiamiento', text: (l) => `Hola ${l.customer}, con gusto le preparo opciones de financiamiento para el ${l.vehicle?.name || 'vehículo'}. ¿Me confirma su inicial estimada?` },
  { label: 'Recordatorio de cita', text: (l) => `Hola ${l.customer}, le recuerdo nuestra cita para ver el ${l.vehicle?.name || 'vehículo'}. ¿Confirmamos?` },
]

export default function DealerLeads() {
  const { profile } = useAuth() || {}
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [q, setQ] = useState('')
  const [sales, setSales] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [active, setActive] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getDealerLeads().then((rows) => { if (alive) { setLeads(rows); setLoading(false) } }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [profile?.dealer_id, reload])
  const refetch = () => setReload((x) => x + 1)

  const filtered = useMemo(() => leads.filter((l) => {
    if (sales && l.salesperson !== sales) return false
    if (q && !`${l.customer} ${l.vehicle?.name || ''} ${l.phone}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [leads, sales, q])

  async function moveStage(l, dir) {
    const i = stageIdx(l.stage) + dir
    if (i < 0 || i >= LEAD_STAGES.length) return
    setBusyId(l.id)
    try { await updateLead(l.id, { stage: LEAD_STAGES[i].key }); refetch() }
    catch (e) { alert(e?.message || 'No se pudo mover el lead') }
    finally { setBusyId(null) }
  }

  return (
    <div>
      <div className="admin-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Leads</h1>
          <p className="tiny muted">Pipeline en vivo desde tus conversaciones de WhatsApp</p>
        </div>
      </div>

      <div className="row wrap gap-8" style={{ marginBottom: 14 }}>
        <div className="row center" style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--muted)' }} />
          <input className="input" placeholder="Buscar cliente, vehículo o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 38, paddingLeft: 32, width: 260 }} />
        </div>
        <select className="input" value={sales} onChange={(e) => setSales(e.target.value)} style={{ height: 38, width: 190 }}>
          <option value="">Todos los vendedores</option>
          {SALESPEOPLE.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <span className="tiny muted" style={{ alignSelf: 'center' }}>{loading ? 'Cargando…' : `${filtered.length} leads`}</span>
      </div>

      {!loading && leads.length === 0 ? (
        <div className="card card-pad muted small" style={{ textAlign: 'center', padding: 30 }}>
          <MessageCircle size={22} className="muted" style={{ margin: '0 auto 8px' }} />
          Aún no tienes leads. Cuando un comprador te contacte por un vehículo desde el marketplace, aparecerá aquí.
        </div>
      ) : (
        <div className="crm-board">
          {LEAD_STAGES.map((st) => {
            const items = filtered.filter((l) => l.stage === st.key)
            return (
              <div className="crm-col" key={st.key}>
                <div className="crm-col-head">
                  <span className="row center gap-6 small strong"><span className="crm-dot" style={{ background: st.color }} /> {st.label}</span>
                  <span className="chip" style={{ background: 'var(--surface-3, #eef2f6)', color: 'var(--muted)' }}>{items.length}</span>
                </div>
                <div className="crm-col-body">
                  {items.map((l) => {
                    const i = stageIdx(l.stage)
                    return (
                      <div className="crm-card" key={l.id} onClick={() => setActive(l)}>
                        <div className="row between center gap-6">
                          <span className="strong small" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.customer}</span>
                          {l.unread > 0 && <span className="crm-dot" style={{ background: '#ef4444' }} title="Sin responder" />}
                        </div>
                        {l.vehicle && <div className="tiny muted row center gap-4" style={{ margin: '3px 0 6px' }}><Car size={11} /> <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.vehicle.name}</span></div>}
                        <div className="row wrap gap-4" style={{ marginBottom: 6 }}>
                          {l.kycVerified
                            ? <span className="chip" style={{ background: '#dcfce7', color: '#166534', fontSize: 10 }}><ShieldCheck size={11} /> Verificado</span>
                            : <span className="chip" style={{ background: '#fef3c7', color: '#b45309', fontSize: 10 }}>KYC pendiente</span>}
                        </div>
                        <div className="row between center">
                          <div className="row gap-3">
                            <button className="btn btn-outline btn-sm" style={{ padding: '3px 5px' }} title="Etapa anterior" disabled={busyId === l.id || i === 0} onClick={(e) => { e.stopPropagation(); moveStage(l, -1) }}><ChevronLeft size={13} /></button>
                            <button className="btn btn-outline btn-sm" style={{ padding: '3px 5px' }} title="Etapa siguiente" disabled={busyId === l.id || i === LEAD_STAGES.length - 1} onClick={(e) => { e.stopPropagation(); moveStage(l, 1) }}><ChevronRight size={13} /></button>
                          </div>
                          {l.salesperson ? <span className="crm-avatar" title={l.salesperson}>{initialsOf(l.salesperson)}</span> : <span className="tiny muted">Sin asignar</span>}
                          <a href={waLink(l.phone, TEMPLATES[0].text(l))} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="WhatsApp" style={{ color: '#25D366', display: 'flex' }}><MessageCircle size={17} /></a>
                        </div>
                      </div>
                    )
                  })}
                  {items.length === 0 && <div className="tiny muted" style={{ textAlign: 'center', padding: '10px 0' }}>—</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {active && <LeadDrawer lead={active} onClose={() => setActive(null)} onChange={refetch} />}
    </div>
  )
}

function LeadDrawer({ lead, onClose, onChange }) {
  const [stage, setStage] = useState(lead.stage)
  const [salesperson, setSalesperson] = useState(lead.salesperson || '')
  const [notes, setNotes] = useState(lead.notes || '')
  const [savingNote, setSavingNote] = useState(false)
  const [messages, setMessages] = useState(null)

  const st = LEAD_STAGES.find((s) => s.key === stage) || LEAD_STAGES[0]
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const verifyLink = kycLink(origin, { vehiculo: lead.vehicle?.id, nombre: lead.customer })
  const kycMsg = `Hola ${lead.customer}, para avanzar con el ${lead.vehicle?.name || 'vehículo'} necesitamos verificar tu identidad (cédula + prueba de vida, sin crear cuenta, ~2 min). Hazlo aquí: ${verifyLink}`

  useEffect(() => {
    let alive = true
    ibMessages(lead.id).then((m) => { if (alive) setMessages(m || []) }).catch(() => { if (alive) setMessages([]) })
    return () => { alive = false }
  }, [lead.id])

  const patch = async (fields) => { try { await updateLead(lead.id, fields); onChange?.() } catch (e) { alert(e?.message || 'No se pudo guardar') } }
  const onStage = (v) => { setStage(v); patch({ stage: v }) }
  const onSales = (v) => { setSalesperson(v); patch({ salesperson: v }) }
  const saveNote = async () => { setSavingNote(true); await patch({ notes }); setSavingNote(false) }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 70, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <aside style={{ width: 'min(460px, 100%)', height: '100%', background: 'var(--surface, #fff)', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between center" style={{ padding: '16px 18px', borderBottom: '1px solid var(--line-2, #e2e8f0)', position: 'sticky', top: 0, background: 'var(--surface, #fff)', zIndex: 1 }}>
          <div>
            <h3 style={{ fontSize: 17 }}>{lead.customer}</h3>
            <span className="chip" style={{ background: `${st.color}22`, color: st.color, marginTop: 4 }}>{st.label}</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="col gap-14" style={{ padding: 18 }}>
          <div className="row gap-8">
            <a href={waLink(lead.phone, TEMPLATES[0].text(lead))} target="_blank" rel="noreferrer" className="btn btn-block" style={{ background: '#25D366', color: '#fff', border: 'none' }}><MessageCircle size={16} /> WhatsApp</a>
            <a href={`tel:${digits(lead.phone)}`} className="btn btn-outline btn-block"><Phone size={16} /> Llamar</a>
          </div>

          {lead.vehicle && (
            <Section title="Vehículo de interés">
              <div className="row center gap-10">
                <div className="dash-top-photo" style={{ width: 64, height: 46 }}><CarImage make={lead.vehicle.make} model={lead.vehicle.model} bodyType={lead.vehicle.bodyType} seed={lead.vehicle.id || lead.id} photo={lead.vehicle.photo} /></div>
                <div><div className="strong small">{lead.vehicle.name}</div>{lead.vehicle.price ? <div className="tiny muted">{fmtMoney(lead.vehicle.price, lead.vehicle.currency)}</div> : null}</div>
              </div>
            </Section>
          )}

          <div className="row gap-12">
            <label className="col gap-4 grow"><span className="tiny strong">Etapa</span>
              <select className="input" value={stage} onChange={(e) => onStage(e.target.value)}>
                {LEAD_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <label className="col gap-4 grow"><span className="tiny strong">Vendedor</span>
              <select className="input" value={salesperson} onChange={(e) => onSales(e.target.value)}>
                <option value="">Sin asignar</option>
                {SALESPEOPLE.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </label>
          </div>

          <Section title="Verificación de identidad">
            {lead.kycVerified ? (
              <span className="chip" style={{ background: '#dcfce7', color: '#166534' }}><ShieldCheck size={12} /> Identidad verificada</span>
            ) : (
              <div className="col gap-8">
                <div className="tiny muted">Este cliente aún no ha verificado su identidad. Envíale el enlace para que lo haga en 2 minutos (sin crear cuenta).</div>
                <a className="btn btn-navy btn-block" href={waLink(lead.phone, kycMsg)} target="_blank" rel="noreferrer" style={{ justifyContent: 'center' }}>
                  <ShieldCheck size={15} /> Solicitar verificación (KYC)
                </a>
              </div>
            )}
          </Section>

          <Section title="Seguimiento">
            <div className="col gap-4">
              <Row k="Teléfono" v={lead.phone} />
              <Row k="Último contacto" v={lead.last} />
              {lead.followUpAt && <Row k="Próximo seguimiento" v={new Date(lead.followUpAt).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} />}
            </div>
          </Section>

          <div>
            <div className="tiny strong" style={{ textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)', marginBottom: 6 }}>Nota interna</div>
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalles del cliente, acuerdos, seguimiento…" style={{ resize: 'vertical' }} />
            <button className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={saveNote} disabled={savingNote || notes === (lead.notes || '')}><Save size={14} /> {savingNote ? 'Guardando…' : 'Guardar nota'}</button>
          </div>

          <Section title="Conversación">
            {messages == null ? <div className="tiny muted">Cargando mensajes…</div>
              : messages.length === 0 ? <div className="tiny muted">Sin mensajes registrados.</div>
                : (
                  <div className="col gap-6">
                    {messages.slice(-8).map((m) => (
                      <div key={m.id} className="small" style={{ alignSelf: m.direction === 'out' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.direction === 'out' ? 'var(--teal-50)' : 'var(--surface-2, #f1f5f9)', borderRadius: 10, padding: '7px 10px' }}>
                        {m.body}
                      </div>
                    ))}
                  </div>
                )}
          </Section>

          <Section title="Plantillas de WhatsApp">
            <div className="col gap-6">
              {TEMPLATES.map((tpl) => (
                <a key={tpl.label} href={waLink(lead.phone, tpl.text(lead))} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm btn-block" style={{ justifyContent: 'space-between' }}>
                  {tpl.label} <MessageCircle size={14} style={{ color: '#25D366' }} />
                </a>
              ))}
            </div>
          </Section>
        </div>
      </aside>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div className="tiny strong" style={{ textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}
function Row({ k, v }) {
  return <div className="row between center" style={{ fontSize: 13 }}><span className="muted">{k}</span><span className="strong">{v}</span></div>
}
