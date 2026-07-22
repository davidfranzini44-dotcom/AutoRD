import { useEffect, useMemo, useState } from 'react'
import {
  Search, MessageCircle, Phone, X, CalendarClock, Car, FileText, Landmark, User, Clock, ShieldCheck,
} from 'lucide-react'
import { getDealerData } from '../data/api'
import { useAuth } from '../context/AuthContext'
import { fmtMoney } from '../data/demo'
import CarImage from '../components/CarImage'
import { buildLeads, LEAD_STAGES, SALESPEOPLE, finStage, kycLink } from '../data/dealerDemo'

// A lead has verified identity once financing moved past the "KYC pendiente" gate.
const kycDone = (l) => !!l.fin && l.fin !== 'kyc_pendiente'

const digits = (p) => String(p || '').replace(/[^\d]/g, '')
const waLink = (phone, text) => `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`
const TONE = {
  green: { bg: '#dcfce7', fg: '#166534' }, red: { bg: '#fee2e2', fg: '#b91c1c' },
  amber: { bg: '#fef3c7', fg: '#b45309' }, blue: { bg: '#dbeafe', fg: '#1d4ed8' },
}
const FinChip = ({ finKey, size = 10 }) => {
  const s = finStage(finKey); const t = TONE[s.tone] || TONE.blue
  return <span className="chip" style={{ background: t.bg, color: t.fg, fontSize: size }}>{s.label}</span>
}

const TEMPLATES = [
  { label: 'Saludo', text: (l) => `Hola ${l.customer}, le saluda ${l.salesperson.name} de nuestro dealer. Vi su interés en el ${l.vehicle.name}. ¿Cómo le puedo ayudar?` },
  { label: 'Sigue disponible', text: (l) => `Hola ${l.customer}, el ${l.vehicle.name} sigue disponible. ¿Coordinamos una visita o prueba de manejo?` },
  { label: 'Financiamiento', text: (l) => `Hola ${l.customer}, con gusto le preparo opciones de financiamiento para el ${l.vehicle.name}. ¿Me confirma su inicial estimada?` },
  { label: 'Recordatorio de cita', text: (l) => `Hola ${l.customer}, le recuerdo nuestra cita para ver el ${l.vehicle.name}. ¿Confirmamos?` },
]

export default function DealerLeads() {
  const { profile } = useAuth() || {}
  const [inventory, setInventory] = useState([])
  const [q, setQ] = useState('')
  const [sales, setSales] = useState('')
  const [active, setActive] = useState(null)

  useEffect(() => {
    let alive = true
    getDealerData(profile?.dealer_id).then((d) => { if (alive) setInventory(d.inventory || []) }).catch(() => {})
    return () => { alive = false }
  }, [profile?.dealer_id])

  const leads = useMemo(() => buildLeads(inventory), [inventory])
  const filtered = leads.filter((l) => {
    if (sales && l.salesperson.id !== sales) return false
    if (q && !`${l.customer} ${l.vehicle.name}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return (
    <div>
      <div className="admin-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Leads</h1>
          <p className="tiny muted">Pipeline de ventas · da clic en un lead para ver el detalle</p>
        </div>
      </div>

      <div className="row wrap gap-8" style={{ marginBottom: 14 }}>
        <div className="row center" style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--muted)' }} />
          <input className="input" placeholder="Buscar cliente o vehículo…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 38, paddingLeft: 32, width: 240 }} />
        </div>
        <select className="input" value={sales} onChange={(e) => setSales(e.target.value)} style={{ height: 38, width: 190 }}>
          <option value="">Todos los vendedores</option>
          {SALESPEOPLE.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="tiny muted" style={{ alignSelf: 'center' }}>{filtered.length} leads</span>
      </div>

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
                {items.map((l) => (
                  <div className="crm-card" key={l.id} onClick={() => setActive(l)}>
                    <div className="row between center gap-6">
                      <span className="strong small" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.customer}</span>
                      {l.unread && <span className="crm-dot" style={{ background: '#ef4444' }} title="Sin responder" />}
                    </div>
                    <div className="tiny muted row center gap-4" style={{ margin: '3px 0 6px' }}><Car size={11} /> <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.vehicle.name}</span></div>
                    {l.fin && <div className="row" style={{ marginBottom: 6 }}><FinChip finKey={l.fin} /></div>}
                    <div className="row between center" style={{ marginTop: 4 }}>
                      <span className="crm-avatar" title={l.salesperson.name}>{l.salesperson.initials}</span>
                      <span className="tiny muted row center gap-3"><CalendarClock size={11} /> {l.next}</span>
                      <a href={waLink(l.phone, TEMPLATES[0].text(l))} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="WhatsApp" style={{ color: '#25D366', display: 'flex' }}><MessageCircle size={17} /></a>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="tiny muted" style={{ textAlign: 'center', padding: '10px 0' }}>—</div>}
              </div>
            </div>
          )
        })}
      </div>

      {active && <LeadDrawer lead={active} onClose={() => setActive(null)} />}
    </div>
  )
}

function LeadDrawer({ lead, onClose }) {
  const st = LEAD_STAGES.find((s) => s.key === lead.stage)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const verifyLink = kycLink(origin, { vehiculo: lead.vehicle?.id, nombre: lead.customer })
  const kycMsg = `Hola ${lead.customer}, para avanzar con el ${lead.vehicle?.name || 'vehículo'} necesitamos verificar tu identidad (cédula + prueba de vida, sin crear cuenta, ~2 min). Hazlo aquí: ${verifyLink}`
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 70, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <aside style={{ width: 'min(440px, 100%)', height: '100%', background: 'var(--surface, #fff)', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
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

          <Section title="Vehículo de interés">
            <div className="row center gap-10">
              <div className="dash-top-photo" style={{ width: 64, height: 46 }}><CarImage make={lead.vehicle.make} model={lead.vehicle.model} bodyType={lead.vehicle.bodyType} seed={lead.vehicle.id || lead.id} tone={lead.vehicle.tone} photo={lead.vehicle.photo} /></div>
              <div>
                <div className="strong small">{lead.vehicle.name}</div>
                {lead.vehicle.price ? <div className="tiny muted">{fmtMoney(lead.vehicle.price, lead.vehicle.currency)}</div> : null}
              </div>
            </div>
          </Section>

          <Section title="Financiamiento / KYC">
            {lead.fin ? <FinChip finKey={lead.fin} size={11} /> : <span className="tiny muted">Sin solicitud de financiamiento</span>}
            {(lead.amount || lead.income || lead.down) && (
              <div className="col gap-4" style={{ marginTop: 8 }}>
                {lead.amount ? <Row k="Monto solicitado" v={fmtMoney(lead.amount, 'DOP')} /> : null}
                {lead.down ? <Row k="Inicial" v={fmtMoney(lead.down, 'DOP')} /> : null}
                {lead.income ? <Row k="Ingreso mensual" v={fmtMoney(lead.income, 'DOP')} /> : null}
              </div>
            )}
          </Section>

          <Section title="Verificación de identidad">
            {kycDone(lead) ? (
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
              <Row k="Vendedor asignado" v={lead.salesperson.name} />
              <Row k="Último contacto" v={lead.last} />
              <Row k="Próximo seguimiento" v={lead.next} />
            </div>
          </Section>

          {lead.note && (
            <Section title="Nota interna">
              <p className="small" style={{ color: 'var(--ink-2)', margin: 0 }}>{lead.note}</p>
            </Section>
          )}

          <Section title="Historial">
            <div className="col">
              {lead.timeline.map((t, i) => (
                <div key={i} className="row gap-10 dash-activity">
                  <div className="dash-act-ic"><Clock size={13} /></div>
                  <div className="grow"><div className="small">{t.text}</div><div className="tiny muted">{t.t}</div></div>
                </div>
              ))}
            </div>
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
