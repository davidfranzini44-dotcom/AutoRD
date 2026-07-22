import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Boxes, Users, Landmark, UserCheck, TrendingUp, Search, Plus,
  Phone, UserPlus, Pencil, CheckCircle2, Eye, ShieldCheck, MoreHorizontal, ChevronRight,
  MessageCircle, Share2, FileText, RotateCcw, Trash2, ExternalLink, X,
} from 'lucide-react'
import { fmtRD } from '../data/demo'
import {
  getDealerData, getDealerLeadCounts, setVehicleStatus, updateVehicleFields, deleteVehicle,
} from '../data/api'
import { useAuth } from '../context/AuthContext'
import StatusChip from '../components/StatusChip'

const METRIC_IC = { inventory: Boxes, leads: Users, finance: Landmark, approved: UserCheck, sales: TrendingUp }
const bankLabel = {
  offer: ['chip-green', 'Oferta recibida'], evaluating: ['chip-amber', 'En evaluación'],
  pending: ['chip-blue', 'Pendiente'], docs: ['chip-amber', 'Pendiente docs'],
}
const TITLES = {
  resumen: ['Resumen', 'Vista general de tu actividad'],
  inventario: ['Inventario', 'Tus vehículos publicados'],
  leads: ['Leads de financiamiento', 'Clientes interesados y su estado'],
}

const MENU_ITEM = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '8px 10px', background: 'none', border: 'none', textAlign: 'left',
  cursor: 'pointer', borderRadius: 8, fontSize: 13, color: 'inherit', textDecoration: 'none',
}

function estadoChip(status) {
  if (status === 'reservado') return <span className="chip chip-amber">Reservado</span>
  if (status === 'vendido') return <span className="chip" style={{ background: '#e2e8f0', color: '#475569' }}>Vendido</span>
  if (status === 'borrador') return <span className="chip" style={{ background: '#e2e8f0', color: '#475569' }}>Borrador</span>
  return <span className="chip chip-green">Publicado</span>
}

// Inline edit for the fields a dealer changes most after publishing.
function EditVehicleModal({ vehicle, onClose, onSaved }) {
  const [price, setPrice] = useState(String(vehicle.price ?? ''))
  const [mileage, setMileage] = useState(String(vehicle.mileage ?? ''))
  const [location, setLocation] = useState(vehicle.location || '')
  const [status, setStatus] = useState(vehicle.status || 'publicado')
  const [description, setDescription] = useState(vehicle.description || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setSaving(true)
    setErr('')
    try {
      await updateVehicleFields(vehicle.dbId, { price, mileage, location, status, description })
      onSaved()
    } catch (e) {
      setErr(e?.message || 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between center" style={{ padding: '16px 18px', borderBottom: '1px solid var(--line-2, #e2e8f0)' }}>
          <div>
            <h3 style={{ fontSize: 16 }}>Editar vehículo</h3>
            <div className="tiny muted">{vehicle.make} {vehicle.model} {vehicle.year}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="col gap-12" style={{ padding: 18 }}>
          <label className="col gap-4">
            <span className="tiny strong">Precio (RD$)</span>
            <input className="input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <div className="row gap-12">
            <label className="col gap-4 grow">
              <span className="tiny strong">Kilometraje</span>
              <input className="input" type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} />
            </label>
            <label className="col gap-4 grow">
              <span className="tiny strong">Estado</span>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="publicado">Publicado</option>
                <option value="reservado">Reservado</option>
                <option value="vendido">Vendido</option>
                <option value="borrador">Borrador (oculto)</option>
              </select>
            </label>
          </div>
          <label className="col gap-4">
            <span className="tiny strong">Ubicación</span>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label className="col gap-4">
            <span className="tiny strong">Descripción</span>
            <textarea className="input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} style={{ resize: 'vertical' }} />
          </label>
          {err && <div className="tiny" style={{ color: '#dc2626' }}>{err}</div>}
        </div>
        <div className="row between center" style={{ padding: '12px 18px', borderTop: '1px solid var(--line-2, #e2e8f0)' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  )
}

export default function DealerPanel({ view = 'resumen' }) {
  const { profile } = useAuth() || {}
  const [inventory, setInventory] = useState([])
  const [leads, setLeads] = useState([])
  const [engagement, setEngagement] = useState({})
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(null)
  const [menuFor, setMenuFor] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let alive = true
    getDealerData(profile?.dealer_id).then((d) => {
      if (!alive) return
      setInventory(d.inventory || [])
      setLeads(d.leads || [])
    })
    getDealerLeadCounts().then((c) => { if (alive) setEngagement(c || {}) })
    return () => { alive = false }
  }, [profile?.dealer_id, reload])

  const refetch = () => setReload((x) => x + 1)

  async function toggleSold(r) {
    setMenuFor(null)
    setBusyId(r.dbId)
    try {
      await setVehicleStatus(r.dbId, r.status === 'vendido' ? 'publicado' : 'vendido')
      refetch()
    } catch (e) {
      alert(`No se pudo actualizar el estado. ${e?.message || ''}`)
    } finally {
      setBusyId(null)
    }
  }

  async function removeVehicle(r) {
    setMenuFor(null)
    if (!window.confirm(`¿Eliminar "${r.make} ${r.model} ${r.year}"? Esta acción no se puede deshacer.`)) return
    setBusyId(r.dbId)
    try {
      await deleteVehicle(r.dbId)
      refetch()
    } catch (e) {
      alert(`No se pudo eliminar. Puede tener solicitudes de financiamiento asociadas.\n${e?.message || ''}`)
    } finally {
      setBusyId(null)
    }
  }

  const [title, sub] = TITLES[view]

  // Real dashboard stats, computed from this dealer's own inventory + leads.
  const invValue = inventory.reduce((s, v) => s + (Number(v.price) || 0), 0)
  const offers = leads.filter((l) => l.bank === 'offer').length
  const evaluating = leads.filter((l) => ['evaluating', 'pending', 'docs'].includes(l.bank)).length
  const metrics = [
    { icon: 'inventory', label: 'Vehículos', value: inventory.length },
    { icon: 'sales', label: 'Valor inventario', value: fmtRD(invValue) },
    { icon: 'leads', label: 'Leads', value: leads.length },
    { icon: 'finance', label: 'En evaluación', value: evaluating },
    { icon: 'approved', label: 'Con oferta', value: offers },
  ]

  return (
    <div>
      <div className="admin-head">
        <div>
          <h1 style={{ fontSize: 22 }}>{title}</h1>
          <p className="tiny muted">{sub}</p>
        </div>
        {view !== 'leads' && (
          <Link to="/dealer/publicar" className="btn btn-primary"><Plus size={17} /> Publicar vehículo</Link>
        )}
      </div>

      {view === 'resumen' && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 18 }}>
            {metrics.map((m) => {
              const Icon = METRIC_IC[m.icon]
              return (
                <div className="metric-card" key={m.label}>
                  <div className="mc-ic"><Icon size={19} /></div>
                  <div className="mc-v">{m.value}</div>
                  <div className="mc-l">{m.label}</div>
                </div>
              )
            })}
          </div>

          {/* Buyer engagement — real events tracked from the marketplace */}
          <div className="card card-pad" style={{ marginBottom: 18 }}>
            <div className="small strong" style={{ marginBottom: 12 }}>Interés de compradores</div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {[
                { ic: Eye, label: 'Vistas', v: engagement.view || 0 },
                { ic: MessageCircle, label: 'Contactos WhatsApp', v: engagement.contact || 0 },
                { ic: FileText, label: 'Clics de financiamiento', v: engagement.financing || 0 },
                { ic: Share2, label: 'Compartidos', v: engagement.share || 0 },
              ].map((e) => {
                const Icon = e.ic
                return (
                  <div key={e.label} className="row center gap-10" style={{ padding: '4px 2px' }}>
                    <div className="verify-ic" style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--teal-50)', color: 'var(--teal-700)', flex: 'none' }}><Icon size={18} /></div>
                    <div>
                      <div className="strong" style={{ fontSize: 18 }}>{Number(e.v).toLocaleString('es-DO')}</div>
                      <div className="tiny muted">{e.label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <div className="row between center" style={{ padding: '14px 16px 4px' }}>
              <h3 style={{ fontSize: 15 }}>Leads recientes</h3>
              <Link to="/dealer/leads" className="link-teal">Ver todos <ChevronRight size={14} /></Link>
            </div>
            <LeadsTable leads={leads.slice(0, 5)} />
          </div>
          <PrivacyNote />
        </>
      )}

      {view === 'leads' && (
        <div className="card">
          <div className="row between center" style={{ padding: '14px 16px' }}>
            <div className="row center" style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--muted)' }} />
              <input className="input" placeholder="Buscar cliente…" style={{ height: 38, paddingLeft: 32, width: 240 }} />
            </div>
          </div>
          <LeadsTable leads={leads} full />
          <PrivacyNote inset />
        </div>
      )}

      {view === 'inventario' && (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Vehículo</th><th className="num">Precio</th><th>Estado</th>
                  <th className="num">Vistas</th><th className="num">Leads</th><th className="num">Solicitudes fin.</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((r) => {
                  const name = r.vehicle || `${r.make} ${r.model} ${r.year}`
                  const isSold = r.status === 'vendido'
                  const busy = busyId === r.dbId
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="strong">{name}</div>
                        <div className="tiny muted">{r.photos || 0} foto{Number(r.photos || 0) === 1 ? '' : 's'}</div>
                      </td>
                      <td className="num">{fmtRD(r.price)}</td>
                      <td>{estadoChip(r.status)}</td>
                      <td className="num"><span className="row center gap-4" style={{ justifyContent: 'flex-end' }}><Eye size={13} className="muted" /> {(r.views || 0).toLocaleString('es-DO')}</span></td>
                      <td className="num">{r.leads ?? '—'}</td>
                      <td className="num strong">{r.requests ?? '—'}</td>
                      <td>
                        <div className="row gap-4" style={{ position: 'relative' }}>
                          <button className="btn btn-outline btn-sm" title="Editar" disabled={busy} onClick={() => { setMenuFor(null); setEditing(r) }}><Pencil size={14} /></button>
                          <button className="btn btn-outline btn-sm" title={isSold ? 'Reactivar' : 'Marcar vendido'} disabled={busy} onClick={() => toggleSold(r)}>
                            {isSold ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
                          </button>
                          <button className="btn btn-outline btn-sm" title="Más" disabled={busy} onClick={() => setMenuFor(menuFor === r.dbId ? null : r.dbId)}><MoreHorizontal size={14} /></button>
                          {menuFor === r.dbId && (
                            <>
                              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuFor(null)} />
                              <div className="card" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41, minWidth: 190, padding: 6, boxShadow: '0 10px 28px rgba(15,23,42,.16)' }}>
                                <a href={`/vehiculo/${r.id}`} target="_blank" rel="noreferrer" style={MENU_ITEM} onClick={() => setMenuFor(null)}><ExternalLink size={14} /> Ver en el sitio</a>
                                <button type="button" style={MENU_ITEM} onClick={() => { setMenuFor(null); setEditing(r) }}><Pencil size={14} /> Editar detalles</button>
                                <button type="button" style={{ ...MENU_ITEM, color: '#dc2626' }} onClick={() => removeVehicle(r)}><Trash2 size={14} /> Eliminar</button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {inventory.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 26 }}>Aún no tienes vehículos publicados. <Link to="/dealer/publicar" className="link-teal">Publica el primero</Link>.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <EditVehicleModal
          vehicle={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch() }}
        />
      )}
    </div>
  )
}

function LeadsTable({ leads, full }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Cliente</th><th>Vehículo</th><th className="num">Monto</th>
            <th>KYC</th><th>Estado banco</th>{full && <th>Vendedor</th>}<th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l, i) => {
            const [cls, lbl] = bankLabel[l.bank] || ['chip', l.bank]
            return (
              <tr key={i}>
                <td>
                  <div className="row center gap-8">
                    <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{(l.customer || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
                    <span className="strong">{l.customer}</span>
                  </div>
                </td>
                <td className="muted">{l.vehicle || '—'}</td>
                <td className="num strong">{fmtRD(l.amount)}</td>
                <td><StatusChip status={l.kyc} /></td>
                <td><span className={`chip ${cls}`}>{lbl}</span></td>
                {full && <td className={l.salesperson === 'Sin asignar' ? 'muted' : ''}>{l.salesperson}</td>}
                <td>
                  <div className="row gap-4">
                    <button className="btn btn-outline btn-sm" title="Contactar"><Phone size={14} /></button>
                    <button className="btn btn-outline btn-sm" title="Asignar vendedor"><UserPlus size={14} /></button>
                  </div>
                </td>
              </tr>
            )
          })}
          {leads.length === 0 && <tr><td colSpan={full ? 7 : 6} className="muted" style={{ textAlign: 'center', padding: 26 }}>Sin leads todavía.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function PrivacyNote({ inset }) {
  return (
    <div className="notice" style={{ margin: inset ? 14 : '16px 0 0', borderStyle: 'solid' }}>
      <ShieldCheck size={16} />
      <span>Ves el estado de KYC (aprobado / pendiente) pero <strong>nunca</strong> los datos biométricos, selfies ni el historial crediticio del cliente.</span>
    </div>
  )
}
