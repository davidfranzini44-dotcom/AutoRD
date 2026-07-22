import { useEffect, useRef, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, Image as ImageIcon, Info, Plus, Star, UploadCloud, X,
  ChevronLeft, ChevronRight, Car,
} from 'lucide-react'
import { createVehicle, getMyDealer, listVehicles } from '../data/api'
import { useAuth } from '../context/AuthContext'
import BrandLogo from '../components/BrandLogo'
import { BODY_TYPES } from '../data/bodyTypes'

const FALLBACK_CITIES = ['Santo Domingo', 'Santiago', 'La Romana', 'Punta Cana']
// Equipment / accesorios (mirrors supercarros' list) — saved to vehicles.features.
const ACCESSORIES = [
  'Alarma', 'Bolsa de aire (chofer)', 'Bolsa de aire (laterales)', 'Bolsa de aire (pasajero)',
  'Frenos ABS', 'Seguros eléctricos', 'Sensores de parqueo', '3 filas de asientos',
  'Aire acondicionado digital', 'Aire acondicionado doble', 'Apple CarPlay', 'Asientos eléctricos',
  'Baúl eléctrico', 'Bluetooth', 'Calefacción', 'Cámara de reversa', 'CD box', 'Cruise control',
  'DVD', 'Guía hidráulico', 'Guía multifunción', 'Limpia vidrios traseros', 'Llave inteligente',
  'Pintura de fábrica', 'Radio AM/FM', 'Radio Multimedia', 'Retrovisores eléctricos',
  'Sistema de navegación', 'Sonido profesional', 'Sun roof', 'Vidrios eléctricos',
  'Versión americana', 'Aros de fábrica', 'Aros de magnesio',
]
// Brand tiles shown on step 1 (BrandLogo falls back to initials for the rest).
const BRANDS = ['Toyota', 'Honda', 'Hyundai', 'Kia', 'Nissan', 'Mazda', 'Mitsubishi', 'Ford', 'Lexus', 'Mercedes-Benz', 'BMW', 'Suzuki']
const YEARS = Array.from({ length: 2027 - 2005 + 1 }, (_, i) => 2027 - i)
const FUELS = ['Gasolina', 'Diésel', 'Híbrido', 'Eléctrico']
const COLORS = ['Blanco', 'Negro', 'Gris', 'Plata', 'Rojo', 'Azul', 'Verde', 'Beige']
const CONDITIONS = [{ v: 'usado', l: 'Usado' }, { v: 'nuevo', l: 'Nuevo' }, { v: 'certificado', l: 'Usado certificado' }]
const STEP_TITLES = ['', 'Elige la marca', 'Modelo y año', 'Detalles del vehículo', 'Fotos y publicar']

// Pill-style choice chip (storage/color chips in Reparando's wizard).
function Chip({ active, onClick, children, small }) {
  return (
    <button type="button" onClick={onClick} style={{
      borderRadius: 999, border: `1.5px solid ${active ? 'var(--teal-700)' : 'var(--line)'}`,
      background: active ? 'var(--teal-700)' : '#fff', color: active ? '#fff' : 'var(--ink-2, #334155)',
      fontWeight: 700, padding: small ? '5px 12px' : '7px 15px', fontSize: small ? 12 : 13, cursor: 'pointer',
    }}>{children}</button>
  )
}

function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>
}

export default function PostVehicle() {
  const { profile } = useAuth() || {}
  const [step, setStep] = useState(1)
  const [otherMake, setOtherMake] = useState(false)
  const [f, setF] = useState({
    make: '', model: '', year: '2022', trim: '', transmission: 'Automática',
    fuel: 'Gasolina', engine: '', mileage: '', color: '', bodyType: 'SUV',
    price: '', currency: 'DOP', condition: 'usado', certified: false, location: '', description: '',
    lat: null, lng: null, features: [],
  })
  const toggleFeature = (name) => setF((prev) => ({
    ...prev,
    features: prev.features.includes(name) ? prev.features.filter((x) => x !== name) : [...prev.features, name],
  }))
  const [dealerLocs, setDealerLocs] = useState([])
  const [inventory, setInventory] = useState([])
  const [photos, setPhotos] = useState([])
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const photoUrls = useRef([])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const setV = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  useEffect(() => () => { photoUrls.current.forEach((url) => URL.revokeObjectURL(url)) }, [])

  // Load the dealer's own locations and default the vehicle's location to them.
  useEffect(() => {
    let alive = true
    getMyDealer(profile?.dealer_id).then((d) => {
      if (!alive || !d) return
      const raw = (d.locations || []).filter((l) => l && (l.city || l.name))
      const opts = raw.length
        ? raw.map((l) => {
            const nm = String(l.name || '').trim()
            const ct = String(l.city || '').trim()
            const label = nm && ct && !nm.toLowerCase().includes(ct.toLowerCase()) ? `${nm} — ${ct}` : (nm || ct)
            return { value: ct || nm, label, lat: l.lat ?? null, lng: l.lng ?? null }
          })
        : (d.city ? [{ value: d.city, label: d.city, lat: null, lng: null }] : [])
      const seen = new Set()
      const uniq = opts.filter((o) => (seen.has(o.value) ? false : seen.add(o.value)))
      setDealerLocs(uniq)
      if (uniq.length) setF((prev) => (prev.location ? prev : { ...prev, location: uniq[0].value, lat: uniq[0].lat, lng: uniq[0].lng }))
    }).catch(() => {})
    // Existing marketplace inventory → model quick-picks per brand.
    listVehicles().then((all) => { if (alive) setInventory(all || []) }).catch(() => {})
    return () => { alive = false }
  }, [profile?.dealer_id])

  const onLocationChange = (e) => {
    const val = e.target.value
    const branch = dealerLocs.find((o) => o.value === val)
    setF((prev) => ({ ...prev, location: val, lat: branch?.lat ?? null, lng: branch?.lng ?? null }))
  }

  // Distinct models already in the marketplace for the chosen make (quick picks).
  const brandModels = useMemo(() => {
    if (!f.make) return []
    return [...new Set(inventory.filter((v) => (v.make || '').toLowerCase() === f.make.toLowerCase()).map((v) => v.model).filter(Boolean))].slice(0, 12)
  }, [inventory, f.make])

  const addPhotos = (files) => {
    setError('')
    const accepted = []
    for (const file of Array.from(files || [])) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > 12 * 1024 * 1024) { setError('Cada foto debe pesar menos de 12 MB.'); continue }
      const preview = URL.createObjectURL(file)
      photoUrls.current.push(preview)
      accepted.push({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, preview })
    }
    if (accepted.length) setPhotos((cur) => [...cur, ...accepted].slice(0, 20))
  }
  const removePhoto = (id) => {
    setPhotos((cur) => {
      const photo = cur.find((p) => p.id === id)
      if (photo) { URL.revokeObjectURL(photo.preview); photoUrls.current = photoUrls.current.filter((u) => u !== photo.preview) }
      return cur.filter((p) => p.id !== id)
    })
  }
  const movePhoto = (index, dir) => {
    setPhotos((cur) => {
      const next = cur.slice(); const to = index + dir
      if (to < 0 || to >= next.length) return cur
      const [item] = next.splice(index, 1); next.splice(to, 0, item); return next
    })
  }

  const pickBrand = (b) => { setV('make', b); setOtherMake(false); setStep(2) }
  const canContinue =
    step === 1 ? !!f.make
    : step === 2 ? (!!f.model.trim() && !!f.year)
    : step === 3 ? (!!f.price && !!f.location)
    : true

  const publish = async () => {
    setError('')
    if (!photos.length) { setError('Agrega al menos una foto del vehículo antes de publicar.'); return }
    setBusy(true)
    try {
      await createVehicle({ ...f, photos: photos.map((p) => p.file) })
      setDone(true)
    } catch (e) { setError(e?.message || 'No se pudo publicar el vehículo.') } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 560 }}>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div className="verify-ic ok" style={{ background: 'var(--green-bg)', color: 'var(--green)', margin: '0 auto 12px', width: 52, height: 52, borderRadius: 14 }}><Check size={26} /></div>
          <h2>Vehículo publicado</h2>
          <p className="muted small" style={{ margin: '6px 0 16px' }}>{f.make} {f.model} {f.year} ya está en tu inventario.</p>
          <div className="row gap-8" style={{ justifyContent: 'center' }}>
            <Link to="/dealer/inventario" className="btn btn-primary">Ver inventario</Link>
            <button className="btn btn-outline" onClick={() => { setDone(false); setStep(1); setPhotos([]); setF({ ...f, make: '', model: '', trim: '', price: '', mileage: '', color: '', description: '' }) }}><Plus size={15} /> Publicar otro</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="admin-head">
        <div>
          <p className="tiny" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--muted)' }}>Inventario · paso {step} de 4</p>
          <h1 style={{ fontSize: 22 }}>{STEP_TITLES[step]}</h1>
        </div>
        <Link to="/dealer/inventario" className="btn btn-ghost btn-sm"><X size={15} /> Cerrar</Link>
      </div>

      {/* Breadcrumb chips (jump back) */}
      {(f.make || f.model) && (
        <div className="row wrap gap-6" style={{ marginBottom: 12 }}>
          {f.make && <button className="chip" onClick={() => setStep(1)} style={{ cursor: 'pointer' }}>{f.make}</button>}
          {step > 2 && f.model && <button className="chip" onClick={() => setStep(2)} style={{ cursor: 'pointer' }}>{f.model} {f.year}</button>}
        </div>
      )}

      <div className="card card-pad">
        {/* STEP 1 — Marca */}
        {step === 1 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
              {BRANDS.map((b) => (
                <button type="button" key={b} onClick={() => pickBrand(b)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 6px',
                  borderRadius: 14, border: `1.5px solid ${f.make === b ? 'var(--teal-700)' : 'var(--line)'}`,
                  background: f.make === b ? 'var(--teal-50)' : '#fff', cursor: 'pointer',
                }}>
                  <BrandLogo make={b} size={38} />
                  <span className="tiny strong">{b}</span>
                </button>
              ))}
              <button type="button" onClick={() => { setOtherMake(true); setV('make', '') }} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 6px',
                borderRadius: 14, border: `1.5px dashed ${otherMake ? 'var(--teal-700)' : 'var(--line)'}`,
                background: otherMake ? 'var(--teal-50)' : 'var(--surface-2)', cursor: 'pointer', color: 'var(--teal-700)',
              }}>
                <span style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--teal-50)', fontSize: 20, fontWeight: 800 }}>+</span>
                <span className="tiny strong">Otra marca</span>
              </button>
            </div>
            {otherMake && (
              <div className="row gap-8 center" style={{ marginTop: 14 }}>
                <input className="input" autoFocus value={f.make} onChange={set('make')} placeholder="Escribe la marca (ej: Volkswagen)" onKeyDown={(e) => { if (e.key === 'Enter' && f.make.trim()) setStep(2) }} />
                <button className="btn btn-primary" disabled={!f.make.trim()} onClick={() => setStep(2)}>Continuar</button>
              </div>
            )}
          </>
        )}

        {/* STEP 2 — Modelo y año */}
        {step === 2 && (
          <div className="col gap-16">
            <div className="row center gap-12" style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 12 }}>
              <BrandLogo make={f.make} size={36} /><div className="strong">{f.make}</div>
            </div>
            <Field label="Modelo">
              <input className="input" autoFocus value={f.model} onChange={set('model')} placeholder="CR-V, Corolla, Tucson…" />
              {brandModels.length > 0 && (
                <div className="row wrap gap-6" style={{ marginTop: 8 }}>
                  {brandModels.map((m) => <Chip key={m} small active={f.model === m} onClick={() => setV('model', m)}>{m}</Chip>)}
                </div>
              )}
            </Field>
            <div>
              <label className="field-label" style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Año</label>
              <div className="row wrap gap-6" style={{ maxHeight: 96, overflowY: 'auto' }}>
                {YEARS.map((y) => <Chip key={y} small active={String(f.year) === String(y)} onClick={() => setV('year', String(y))}>{y}</Chip>)}
              </div>
            </div>
            <Field label="Versión / trim (opcional)"><input className="input" value={f.trim} onChange={set('trim')} placeholder="EX-L, Limited…" /></Field>
          </div>
        )}

        {/* STEP 3 — Detalles */}
        {step === 3 && (
          <div className="col gap-16">
            <div className="grid grid-2" style={{ gap: 12 }}>
              <Field label="Precio">
                <div className="row gap-8">
                  <select className="select" value={f.currency} onChange={set('currency')} style={{ width: 92, flex: 'none' }}>
                    <option value="DOP">RD$</option>
                    <option value="USD">US$</option>
                  </select>
                  <input className="input" type="number" inputMode="numeric" value={f.price} onChange={set('price')} placeholder={f.currency === 'USD' ? '22000' : '1250000'} style={{ flex: 1, minWidth: 0 }} />
                </div>
              </Field>
              <Field label="Kilometraje (km)"><input className="input" type="number" inputMode="numeric" value={f.mileage} onChange={set('mileage')} placeholder="42000" /></Field>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Tipo</label>
              <div className="bodytype-row bodytype-row--compact">
                {BODY_TYPES.map((b) => (
                  <button type="button" key={b.type} className={`bt-item ${f.bodyType === b.type ? 'active' : ''}`} onClick={() => setV('bodyType', b.type)}>
                    <img className="bt-image" src={b.image} alt="" aria-hidden="true" />
                    <span className="bt-label">{b.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Transmisión</label>
              <div className="row wrap gap-6">{['Automática', 'Manual'].map((t) => <Chip key={t} active={f.transmission === t} onClick={() => setV('transmission', t)}>{t}</Chip>)}</div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Combustible</label>
              <div className="row wrap gap-6">{FUELS.map((fl) => <Chip key={fl} active={f.fuel === fl} onClick={() => setV('fuel', fl)}>{fl}</Chip>)}</div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Color</label>
              <div className="row wrap gap-6" style={{ marginBottom: 8 }}>{COLORS.map((c) => <Chip key={c} small active={f.color === c} onClick={() => setV('color', c)}>{c}</Chip>)}</div>
              <input className="input" value={f.color} onChange={set('color')} placeholder="Otro color" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Condición</label>
              <div className="row wrap gap-6">{CONDITIONS.map((c) => <Chip key={c.v} active={f.condition === c.v} onClick={() => setV('condition', c.v)}>{c.l}</Chip>)}</div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
                Accesorios {f.features.length > 0 && <span className="tiny muted">· {f.features.length} seleccionados</span>}
              </label>
              <div className="row wrap gap-6">{ACCESSORIES.map((a) => <Chip key={a} small active={f.features.includes(a)} onClick={() => toggleFeature(a)}>{a}</Chip>)}</div>
            </div>

            <Field label="Ubicación">
              {dealerLocs.length > 1 ? (
                <>
                  <select className="select" value={f.location} onChange={onLocationChange}>
                    {dealerLocs.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span className="help">Sucursal donde está el vehículo · <Link to="/dealer/perfil" className="link-teal">editar sucursales</Link></span>
                </>
              ) : dealerLocs.length === 1 ? (
                <>
                  <input className="input" value={dealerLocs[0].label} readOnly disabled />
                  <span className="help">Ubicación de tu dealer · <Link to="/dealer/perfil" className="link-teal">editar sucursales</Link></span>
                </>
              ) : (
                <select className="select" value={f.location} onChange={set('location')}>
                  <option value="" disabled>Selecciona…</option>
                  {FALLBACK_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </Field>

            <Field label="Descripción (opcional)">
              <textarea className="input" rows={3} value={f.description} onChange={set('description')} placeholder="Detalles, mantenimientos, equipamiento…" style={{ resize: 'vertical' }} />
            </Field>
          </div>
        )}

        {/* STEP 4 — Fotos y publicar */}
        {step === 4 && (
          <div className="col gap-14">
            <div className="row center gap-12" style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface-2)' }}>
              <div className="verify-ic" style={{ background: 'var(--teal-50)', color: 'var(--teal-700)', width: 42, height: 42, borderRadius: 10 }}><Car size={20} /></div>
              <div className="grow">
                <div className="strong">{f.make} {f.model} {f.year}{f.trim ? ` · ${f.trim}` : ''}</div>
                <div className="tiny muted">{f.bodyType} · {f.transmission} · {f.fuel}{f.color ? ` · ${f.color}` : ''} · {f.price ? `${f.currency === 'USD' ? 'US$' : 'RD$'} ${Number(f.price).toLocaleString('es-DO')}` : 'sin precio'}</div>
              </div>
            </div>

            <div className="field">
              <label>Fotos del vehículo</label>
              <input id="vehicle-photo-upload" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple
                onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
              <label htmlFor="vehicle-photo-upload" className="photo-drop">
                <span className="photo-drop-ic"><UploadCloud size={22} /></span>
                <span>
                  <span className="strong small">Agrega fotos reales del vehículo</span>
                  <span className="tiny muted">JPG, PNG o WebP. Hasta 20 fotos, 12 MB por imagen. La primera es la portada.</span>
                </span>
                <span className="btn btn-outline btn-sm"><ImageIcon size={15} /> Elegir fotos</span>
              </label>

              {photos.length > 0 && (
                <div className="photo-editor-grid">
                  {photos.map((p, i) => (
                    <div className="photo-edit-card" key={p.id}>
                      <img src={p.preview} alt={`Foto ${i + 1}`} />
                      {i === 0 && <span className="photo-cover-badge"><Star size={12} /> Portada</span>}
                      <div className="photo-edit-actions">
                        <button type="button" className="icon-mini" disabled={i === 0} onClick={() => movePhoto(i, -1)} aria-label="Mover a la izquierda"><ArrowLeft size={14} /></button>
                        <button type="button" className="icon-mini" disabled={i === photos.length - 1} onClick={() => movePhoto(i, 1)} aria-label="Mover a la derecha"><ArrowRight size={14} /></button>
                        <button type="button" className="icon-mini danger" onClick={() => removePhoto(p.id)} aria-label="Eliminar foto"><X size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="notice"><Info size={16} /><span>La cuota estimada se calcula automáticamente. Podrás editarla luego.</span></div>
          </div>
        )}

        {error && <div className="notice" style={{ marginTop: 14, borderColor: 'var(--red-bd)', background: 'var(--red-bg)' }}><Info size={16} /><span>{error}</span></div>}

        {/* Footer nav */}
        <div className="row between center" style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          {step > 1
            ? <button className="btn btn-outline" onClick={() => setStep((s) => s - 1)}><ChevronLeft size={16} /> Atrás</button>
            : <Link to="/dealer/inventario" className="btn btn-ghost">Cancelar</Link>}
          {step < 4
            ? <button className="btn btn-primary" disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>Continuar <ChevronRight size={16} /></button>
            : <button className="btn btn-primary" disabled={busy} onClick={publish}><Plus size={16} /> {busy ? 'Publicando…' : 'Publicar vehículo'}</button>}
        </div>
      </div>
    </div>
  )
}
