import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Boxes, Users, Landmark, UserCheck, TrendingUp, Search, Plus,
  Phone, UserPlus, Pencil, CheckCircle2, Eye, ShieldCheck, MoreHorizontal, ChevronRight, ChevronLeft,
  MessageCircle, Share2, FileText, RotateCcw, Trash2, ExternalLink, X, Filter, Star, UploadCloud, ImageOff,
} from 'lucide-react'
import { fmtRD, fmtMoney } from '../data/demo'
import {
  getDealerData, getDealerLeadCounts, setVehicleStatus, updateVehicleFields, deleteVehicle,
  getVehiclePhotos, addVehiclePhotos, deleteVehiclePhoto, setVehicleCover, reorderVehiclePhotos,
} from '../data/api'
import { useAuth } from '../context/AuthContext'
import StatusChip from '../components/StatusChip'
import CarImage from '../components/CarImage'
import { BODY_TYPES } from '../data/bodyTypes'
import { BRANDS, YEARS, TRANSMISSIONS, FUELS, COLORS, CONDITIONS, ACCESSORIES } from '../data/vehicleOptions'
import { listingScore } from '../data/dealerDemo'

const STATUS_LABELS = [
  ['publicado', 'Publicado'], ['reservado', 'Reservado'], ['vendido', 'Vendido'], ['borrador', 'Borrador (oculto)'],
]
// Seed the raw condition enum from the display-mapped vehicle object.
const seedCondition = (v) => (v.certified ? 'certificado' : (v.condition === 'Nuevo' ? 'nuevo' : 'usado'))

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

// Listing-quality badge (score de publicación).
function scoreChip(v) {
  const { score, missing } = listingScore(v)
  const c = score >= 80 ? { bg: '#dcfce7', fg: '#166534' } : score >= 60 ? { bg: '#fef3c7', fg: '#b45309' } : { bg: '#fee2e2', fg: '#b91c1c' }
  return <span className="chip" title={missing.length ? `Mejora: ${missing.join(', ')}` : 'Publicación completa'} style={{ background: c.bg, color: c.fg, minWidth: 44, justifyContent: 'center' }}>{score}%</span>
}

const SEC = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)', margin: '4px 0 2px' }
const withCurrent = (list, cur) => (!cur || list.includes(cur) ? list : [cur, ...list])
const PHOTO_BTN = { padding: '4px 6px', minWidth: 0 }

// Field label wrapper.
function F({ label, children, min = 150 }) {
  return (
    <label className="col gap-4 grow" style={{ minWidth: min }}>
      <span className="tiny strong">{label}</span>
      {children}
    </label>
  )
}

// Full editable ficha for a vehicle — opened from the inventory row.
function EditVehicleModal({ vehicle, onClose, onSaved, onChanged }) {
  const [f, setF] = useState({
    make: vehicle.make || '', model: vehicle.model || '', year: String(vehicle.year || ''),
    trim: vehicle.trim || '', transmission: vehicle.transmission || 'Automática',
    fuel: vehicle.fuel || 'Gasolina', engine: vehicle.engine || '', color: vehicle.color || '',
    bodyType: vehicle.bodyType || 'SUV', condition: seedCondition(vehicle),
    mileage: String(vehicle.mileage ?? ''), price: String(vehicle.price ?? ''),
    currency: vehicle.currency === 'USD' ? 'USD' : 'DOP',
    status: vehicle.status || 'publicado', location: vehicle.location || '',
    description: vehicle.description || '',
  })
  const [features, setFeatures] = useState(Array.isArray(vehicle.features) ? vehicle.features : [])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const toggleFeature = (a) => setFeatures((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]))

  // Photos are managed live — upload/delete/cover/reorder persist immediately, independent of "Guardar".
  const [photoRows, setPhotoRows] = useState(vehicle.photoRows || [])
  const [photoBusy, setPhotoBusy] = useState(false)
  const cover = photoRows.find((p) => p.isCover) || photoRows[0]
  const refreshPhotos = async () => {
    const rows = await getVehiclePhotos(vehicle.dbId)
    setPhotoRows(rows)
    onChanged?.()
  }
  const runPhoto = async (fn) => {
    setPhotoBusy(true)
    setErr('')
    try { await fn(); await refreshPhotos() } catch (e) { setErr(e?.message || 'Error al procesar las fotos') } finally { setPhotoBusy(false) }
  }
  const onAddFiles = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) runPhoto(() => addVehiclePhotos(vehicle.dbId, files))
  }
  const onDeletePhoto = (p) => {
    if (window.confirm('¿Eliminar esta foto?')) runPhoto(() => deleteVehiclePhoto(vehicle.dbId, p))
  }
  const onSetCover = (p) => runPhoto(() => setVehicleCover(vehicle.dbId, p.id))
  const onMovePhoto = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= photoRows.length) return
    const arr = [...photoRows]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setPhotoRows(arr)
    runPhoto(() => reorderVehiclePhotos(vehicle.dbId, arr.map((p) => p.id)))
  }

  async function save() {
    setSaving(true)
    setErr('')
    try {
      await updateVehicleFields(vehicle.dbId, { ...f, features })
      onSaved()
    } catch (e) {
      setErr(e?.message || 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 720, maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {/* Header: cover + identity + quick stats */}
        <div className="row center gap-12" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-2, #e2e8f0)' }}>
          <div style={{ width: 88, height: 60, borderRadius: 8, overflow: 'hidden', flex: 'none', background: 'var(--surface-2, #f1f5f9)' }}>
            {cover?.url && <img src={cover.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <div className="grow" style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 16 }}>{f.make} {f.model} {f.year}</h3>
            <div className="row center gap-8" style={{ marginTop: 3 }}>
              {estadoChip(f.status)}
              <a href={`/vehiculo/${vehicle.id}`} target="_blank" rel="noreferrer" className="tiny link-teal row center gap-4"><ExternalLink size={12} /> Ver en el sitio</a>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="row wrap gap-14" style={{ padding: '10px 18px 0' }}>
          {[['Vistas', vehicle.views || 0, Eye], ['Leads', vehicle.leads ?? 0, Users], ['Solic. fin.', vehicle.requests ?? 0, FileText], ['Fotos', photoRows.length, ImgCount]].map(([l, v, Ic]) => (
            <div key={l} className="row center gap-6"><Ic size={14} className="muted" /><span className="strong">{Number(v).toLocaleString('es-DO')}</span><span className="tiny muted">{l}</span></div>
          ))}
        </div>

        <div className="col gap-10" style={{ padding: 18 }}>
          <div style={SEC}>Vehículo</div>
          <div className="row wrap gap-12">
            <F label="Marca">
              <input className="input" list="dp-brands" value={f.make} onChange={set('make')} />
              <datalist id="dp-brands">{BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
            </F>
            <F label="Modelo"><input className="input" value={f.model} onChange={set('model')} /></F>
            <F label="Año" min={100}>
              <select className="input" value={f.year} onChange={set('year')}>{withCurrent(YEARS.map(String), f.year).map((y) => <option key={y} value={y}>{y}</option>)}</select>
            </F>
            <F label="Versión / trim"><input className="input" value={f.trim} onChange={set('trim')} /></F>
          </div>

          <div style={SEC}>Especificaciones</div>
          <div className="row wrap gap-12">
            <F label="Transmisión">
              <select className="input" value={f.transmission} onChange={set('transmission')}>{withCurrent(TRANSMISSIONS, f.transmission).map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </F>
            <F label="Combustible">
              <select className="input" value={f.fuel} onChange={set('fuel')}>{withCurrent(FUELS, f.fuel).map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </F>
            <F label="Motor"><input className="input" value={f.engine} onChange={set('engine')} placeholder="Ej: 2.5L / 6 cil." /></F>
            <F label="Tipo">
              <select className="input" value={f.bodyType} onChange={set('bodyType')}>{withCurrent(BODY_TYPES.map((b) => b.type), f.bodyType).map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </F>
            <F label="Color">
              <input className="input" list="dp-colors" value={f.color} onChange={set('color')} />
              <datalist id="dp-colors">{COLORS.map((c) => <option key={c} value={c} />)}</datalist>
            </F>
            <F label="Kilometraje" min={120}><input className="input" type="number" value={f.mileage} onChange={set('mileage')} /></F>
            <F label="Condición">
              <select className="input" value={f.condition} onChange={set('condition')}>{CONDITIONS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
            </F>
          </div>

          <div style={SEC}>Precio y estado</div>
          <div className="row wrap gap-12">
            <F label="Precio">
              <div className="row gap-6">
                <select className="input" value={f.currency} onChange={set('currency')} style={{ width: 80, flex: 'none' }}>
                  <option value="DOP">RD$</option>
                  <option value="USD">US$</option>
                </select>
                <input className="input" type="number" value={f.price} onChange={set('price')} style={{ flex: 1, minWidth: 0 }} />
              </div>
            </F>
            <F label="Estado">
              <select className="input" value={f.status} onChange={set('status')}>{STATUS_LABELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </F>
            <F label="Ubicación"><input className="input" value={f.location} onChange={set('location')} /></F>
          </div>

          <div style={SEC}>Descripción</div>
          <textarea className="input" rows={4} value={f.description} onChange={set('description')} style={{ resize: 'vertical' }} />

          <div style={SEC}>Accesorios · {features.length}</div>
          <div className="row wrap gap-6">
            {ACCESSORIES.map((a) => {
              const on = features.includes(a)
              return (
                <button key={a} type="button" onClick={() => toggleFeature(a)}
                  className={`chip ${on ? 'chip-teal' : ''}`}
                  style={{ cursor: 'pointer', border: on ? 'none' : '1px solid var(--line-2, #e2e8f0)', background: on ? undefined : 'transparent' }}>
                  {on && <CheckCircle2 size={12} />} {a}
                </button>
              )
            })}
          </div>

          <div className="row between center">
            <div style={{ ...SEC, margin: 0 }}>Fotos · {photoRows.length}</div>
            {photoBusy && <span className="tiny muted">Procesando…</span>}
          </div>
          <div className="row wrap gap-8">
            {photoRows.map((p, i) => (
              <div key={p.id} style={{ width: 108 }}>
                <div style={{ position: 'relative' }}>
                  <img src={p.url} alt="" style={{ width: 108, height: 76, objectFit: 'cover', borderRadius: 8, display: 'block', border: p.isCover ? '2px solid var(--teal-600, #0d9488)' : '1px solid var(--line-2, #e2e8f0)' }} />
                  {p.isCover && <span className="chip chip-teal" style={{ position: 'absolute', top: 4, left: 4, padding: '1px 6px', fontSize: 10 }}><Star size={10} /> Portada</span>}
                </div>
                <div className="row gap-4" style={{ marginTop: 4, justifyContent: 'center' }}>
                  <button className="btn btn-outline btn-sm" title="Mover a la izquierda" style={PHOTO_BTN} disabled={photoBusy || i === 0} onClick={() => onMovePhoto(i, -1)}><ChevronLeft size={13} /></button>
                  <button className="btn btn-outline btn-sm" title="Usar como portada" style={PHOTO_BTN} disabled={photoBusy || p.isCover} onClick={() => onSetCover(p)}><Star size={13} /></button>
                  <button className="btn btn-outline btn-sm" title="Mover a la derecha" style={PHOTO_BTN} disabled={photoBusy || i === photoRows.length - 1} onClick={() => onMovePhoto(i, 1)}><ChevronRight size={13} /></button>
                  <button className="btn btn-outline btn-sm" title="Eliminar foto" style={{ ...PHOTO_BTN, color: '#dc2626' }} disabled={photoBusy} onClick={() => onDeletePhoto(p)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            <label className="col center gap-4" title="Agregar fotos" style={{ width: 108, height: 76, border: '1.5px dashed var(--line-2, #cbd5e1)', borderRadius: 8, cursor: photoBusy ? 'not-allowed' : 'pointer', color: 'var(--muted)', justifyContent: 'center', opacity: photoBusy ? 0.6 : 1 }}>
              <UploadCloud size={18} />
              <span className="tiny">Agregar</span>
              <input type="file" accept="image/*" multiple hidden disabled={photoBusy} onChange={onAddFiles} />
            </label>
          </div>

          {err && <div className="tiny" style={{ color: '#dc2626' }}>{err}</div>}
        </div>

        <div className="row between center" style={{ padding: '12px 18px', borderTop: '1px solid var(--line-2, #e2e8f0)', position: 'sticky', bottom: 0, background: 'var(--surface, #fff)' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  )
}

// Tiny image-count glyph (avoids adding another lucide import).
function ImgCount({ size = 14, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
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
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState('')
  const [statusF, setStatusF] = useState('')
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)

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

  // Inventory lookup: text (marca/modelo/versión/año) + brand + status filters.
  const invBrands = [...new Set(inventory.map((v) => v.make).filter(Boolean))].sort()
  const ql = q.trim().toLowerCase()
  const filteredInventory = inventory.filter((v) => {
    if (brand && v.make !== brand) return false
    if (statusF && (v.status || 'publicado') !== statusF) return false
    if (onlyIncomplete && listingScore(v).score >= 70) return false
    if (ql && !`${v.make} ${v.model} ${v.trim || ''} ${v.year}`.toLowerCase().includes(ql)) return false
    return true
  })
  const inventoryScores = inventory.map((v) => listingScore(v))
  const avgListingScore = inventoryScores.length
    ? Math.round(inventoryScores.reduce((s, r) => s + r.score, 0) / inventoryScores.length)
    : 0
  const publishedCount = inventory.filter((v) => (v.status || 'publicado') === 'publicado').length
  const reservedCount = inventory.filter((v) => v.status === 'reservado').length
  const soldCount = inventory.filter((v) => v.status === 'vendido').length
  const draftCount = inventory.filter((v) => v.status === 'borrador').length
  const totalViews = inventory.reduce((s, v) => s + Number(v.views || 0), 0)
  const totalRequests = inventory.reduce((s, v) => s + Number(v.requests || 0), 0)

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
        <>
        <div className="dealer-inventory-summary">
          <div className="dealer-inventory-health">
            <span>Calidad promedio</span>
            <strong>{avgListingScore}%</strong>
            <div className="dealer-health-track"><i style={{ width: `${Math.max(4, avgListingScore)}%` }} /></div>
          </div>
          <div className="dealer-inventory-summary-grid">
            <div><strong>{publishedCount}</strong><span>Publicados</span></div>
            <div><strong>{reservedCount}</strong><span>Reservados</span></div>
            <div><strong>{soldCount}</strong><span>Vendidos</span></div>
            <div><strong>{draftCount}</strong><span>Borradores</span></div>
            <div><strong>{totalViews.toLocaleString('es-DO')}</strong><span>Vistas</span></div>
            <div><strong>{totalRequests}</strong><span>Solic. fin.</span></div>
          </div>
        </div>

        <div className="card dealer-inventory-shell">
          {/* Lookup toolbar — text + brand + status for faster management */}
          <div className="row wrap between center gap-8" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-2, #e2e8f0)' }}>
            <div className="row wrap center gap-8">
              <div className="row center" style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--muted)' }} />
                <input className="input" placeholder="Buscar marca, modelo…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 38, paddingLeft: 32, width: 220 }} />
              </div>
              <select className="input" value={brand} onChange={(e) => setBrand(e.target.value)} style={{ height: 38, width: 150 }}>
                <option value="">Todas las marcas</option>
                {invBrands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select className="input" value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ height: 38, width: 150 }}>
                <option value="">Todos los estados</option>
                {STATUS_LABELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button className={`btn btn-sm ${onlyIncomplete ? 'btn-primary' : 'btn-outline'}`} onClick={() => setOnlyIncomplete((x) => !x)}><ImageOff size={14} /> Incompletos</button>
              {(q || brand || statusF || onlyIncomplete) && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setBrand(''); setStatusF(''); setOnlyIncomplete(false) }}><X size={14} /> Limpiar</button>
              )}
            </div>
            <span className="tiny muted row center gap-4"><Filter size={13} /> {filteredInventory.length} de {inventory.length}</span>
          </div>
          <div className="table-wrap dealer-inventory-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Vehículo</th><th className="num">Precio</th><th>Estado</th><th>Calidad</th>
                  <th className="num">Vistas</th><th className="num">Leads</th><th className="num">Solicitudes fin.</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((r) => {
                  const name = r.vehicle || `${r.make} ${r.model} ${r.year}`
                  const isSold = r.status === 'vendido'
                  const busy = busyId === r.dbId
                  return (
                    <tr key={r.id}>
                      <td>
                        <button type="button" onClick={() => { setMenuFor(null); setEditing(r) }}
                          title="Ver ficha y editar"
                          style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                          <div className="strong" style={{ color: 'var(--teal-700)' }}>{name}</div>
                          <div className="tiny muted">{r.trim ? `${r.trim} · ` : ''}{r.photos || 0} foto{Number(r.photos || 0) === 1 ? '' : 's'}</div>
                        </button>
                      </td>
                      <td className="num">{fmtMoney(r.price, r.currency)}</td>
                      <td>{estadoChip(r.status)}</td>
                      <td>{scoreChip(r)}</td>
                      <td className="num"><span className="row center gap-4" style={{ justifyContent: 'flex-end' }}><Eye size={13} className="muted" /> {(r.views || 0).toLocaleString('es-DO')}</span></td>
                      <td className="num">{r.leads ?? '—'}</td>
                      <td className="num strong">{r.requests ?? '—'}</td>
                      <td>
                        <div className="row gap-4" style={{ position: 'relative' }}>
                          <button className="btn btn-outline btn-sm" title="Ver ficha y editar" disabled={busy} onClick={() => { setMenuFor(null); setEditing(r) }}><Pencil size={14} /></button>
                          <button className="btn btn-outline btn-sm" title={isSold ? 'Reactivar' : 'Marcar vendido'} disabled={busy} onClick={() => toggleSold(r)}>
                            {isSold ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
                          </button>
                          <button className="btn btn-outline btn-sm" title="Más" disabled={busy} onClick={() => setMenuFor(menuFor === r.dbId ? null : r.dbId)}><MoreHorizontal size={14} /></button>
                          {menuFor === r.dbId && (
                            <>
                              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuFor(null)} />
                              <div className="card" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41, minWidth: 190, padding: 6, boxShadow: '0 10px 28px rgba(15,23,42,.16)' }}>
                                <a href={`/vehiculo/${r.id}`} target="_blank" rel="noreferrer" style={MENU_ITEM} onClick={() => setMenuFor(null)}><ExternalLink size={14} /> Ver en el sitio</a>
                                <button type="button" style={MENU_ITEM} onClick={() => { setMenuFor(null); setEditing(r) }}><Pencil size={14} /> Ver ficha y editar</button>
                                <button type="button" style={{ ...MENU_ITEM, color: '#dc2626' }} onClick={() => removeVehicle(r)}><Trash2 size={14} /> Eliminar</button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {inventory.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 26 }}>Aún no tienes vehículos publicados. <Link to="/dealer/publicar" className="link-teal">Publica el primero</Link>.</td></tr>}
                {inventory.length > 0 && filteredInventory.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 26 }}>Ningún vehículo coincide con tu búsqueda.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="dealer-inventory-mobile">
            {filteredInventory.map((r) => {
              const name = r.vehicle || `${r.make} ${r.model} ${r.year}`
              const isSold = r.status === 'vendido'
              const busy = busyId === r.dbId
              const quality = listingScore(r)
              return (
                <article className="dealer-inventory-card" key={r.id}>
                  <button type="button" className="dealer-inventory-card-head" onClick={() => { setMenuFor(null); setEditing(r) }}>
                    <div className="dealer-inventory-photo">
                      <CarImage make={r.make} model={r.model} bodyType={r.bodyType} seed={r.id} tone={r.tone} photo={r.coverPhoto} />
                    </div>
                    <span className="grow">
                      <span className="row wrap center gap-6">{estadoChip(r.status)}{scoreChip(r)}</span>
                      <strong>{name}</strong>
                      <small>{r.trim ? `${r.trim} · ` : ''}{r.photos || 0} foto{Number(r.photos || 0) === 1 ? '' : 's'}</small>
                      <b>{fmtMoney(r.price, r.currency)}</b>
                    </span>
                    <ChevronRight size={17} className="muted" />
                  </button>
                  <div className="dealer-inventory-stats">
                    <span><Eye size={13} /> {(r.views || 0).toLocaleString('es-DO')} vistas</span>
                    <span><Users size={13} /> {r.leads ?? 0} leads</span>
                    <span><FileText size={13} /> {r.requests ?? 0} fin.</span>
                  </div>
                  {quality.missing.length > 0 && (
                    <div className="dealer-inventory-warning">Falta: {quality.missing.slice(0, 3).join(', ')}</div>
                  )}
                  <div className="dealer-inventory-actions">
                    <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => { setMenuFor(null); setEditing(r) }}><Pencil size={14} /> Editar</button>
                    <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => toggleSold(r)}>
                      {isSold ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
                      {isSold ? 'Reactivar' : 'Vendido'}
                    </button>
                    <a href={`/vehiculo/${r.id}`} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm"><ExternalLink size={14} /> Ver</a>
                  </div>
                </article>
              )
            })}
            {inventory.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: 24 }}>Aún no tienes vehículos publicados.</div>}
            {inventory.length > 0 && filteredInventory.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: 24 }}>Ningún vehículo coincide con tu búsqueda.</div>}
          </div>
        </div>
        </>
      )}

      {editing && (
        <EditVehicleModal
          vehicle={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch() }}
          onChanged={refetch}
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
