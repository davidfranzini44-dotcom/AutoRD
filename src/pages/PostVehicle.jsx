import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, Image as ImageIcon, Info, Plus, Star, UploadCloud, X,
} from 'lucide-react'
import { createVehicle } from '../data/api'

export default function PostVehicle() {
  const [f, setF] = useState({
    make: '', model: '', year: '2022', trim: '', transmission: 'Automática',
    fuel: 'Gasolina', engine: '', mileage: '', color: '', bodyType: 'SUV',
    price: '', condition: 'usado', certified: false, location: 'Santo Domingo', description: '',
  })
  const [photos, setPhotos] = useState([])
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const photoUrls = useRef([])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  useEffect(() => () => {
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const addPhotos = (files) => {
    setError('')
    const accepted = []
    for (const file of Array.from(files || [])) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > 12 * 1024 * 1024) {
        setError('Cada foto debe pesar menos de 12 MB.')
        continue
      }
      const preview = URL.createObjectURL(file)
      photoUrls.current.push(preview)
      accepted.push({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, preview })
    }
    if (accepted.length) setPhotos((cur) => [...cur, ...accepted].slice(0, 20))
  }

  const removePhoto = (id) => {
    setPhotos((cur) => {
      const photo = cur.find((p) => p.id === id)
      if (photo) {
        URL.revokeObjectURL(photo.preview)
        photoUrls.current = photoUrls.current.filter((url) => url !== photo.preview)
      }
      return cur.filter((p) => p.id !== id)
    })
  }

  const movePhoto = (index, dir) => {
    setPhotos((cur) => {
      const next = cur.slice()
      const to = index + dir
      if (to < 0 || to >= next.length) return cur
      const [item] = next.splice(index, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!photos.length) {
      setError('Agrega al menos una foto del vehiculo antes de publicar.')
      return
    }
    setBusy(true)
    try {
      await createVehicle({ ...f, photos: photos.map((p) => p.file) })
      setDone(true)
    } catch (e) {
      setError(e?.message || 'No se pudo publicar el vehiculo.')
    } finally {
      setBusy(false)
    }
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
            <button className="btn btn-outline" onClick={() => { setDone(false); setF({ ...f, make: '', model: '', price: '', mileage: '' }) }}>Publicar otro</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="admin-head"><div><h1 style={{ fontSize: 22 }}>Publicar vehículo</h1><p className="tiny muted">Añade un vehículo a tu inventario</p></div></div>

      <form className="card card-pad" onSubmit={submit}>
        <div className="grid grid-3" style={{ gap: 14 }}>
          <F label="Marca"><input className="input" value={f.make} onChange={set('make')} placeholder="Honda" required /></F>
          <F label="Modelo"><input className="input" value={f.model} onChange={set('model')} placeholder="CR-V" required /></F>
          <F label="Año"><input className="input" type="number" value={f.year} onChange={set('year')} min="1990" max="2027" required /></F>
          <F label="Versión / trim"><input className="input" value={f.trim} onChange={set('trim')} placeholder="EX-L" /></F>
          <F label="Motor"><input className="input" value={f.engine} onChange={set('engine')} placeholder="1.5L Turbo" /></F>
          <F label="Kilometraje"><input className="input" type="number" value={f.mileage} onChange={set('mileage')} placeholder="42000" /></F>
          <F label="Transmisión"><select className="select" value={f.transmission} onChange={set('transmission')}><option>Automática</option><option>Manual</option></select></F>
          <F label="Combustible"><select className="select" value={f.fuel} onChange={set('fuel')}><option>Gasolina</option><option>Diésel</option><option>Híbrido</option><option>Eléctrico</option></select></F>
          <F label="Tipo"><select className="select" value={f.bodyType} onChange={set('bodyType')}><option>SUV</option><option>Sedán</option><option>Pickup</option><option>Coupé</option><option>Hatchback</option></select></F>
          <F label="Color"><input className="input" value={f.color} onChange={set('color')} placeholder="Gris" /></F>
          <F label="Precio (RD$)"><input className="input" type="number" value={f.price} onChange={set('price')} placeholder="1250000" required /></F>
          <F label="Ubicación"><select className="select" value={f.location} onChange={set('location')}><option>Santo Domingo</option><option>Santiago</option><option>La Romana</option><option>Punta Cana</option></select></F>
          <F label="Condición"><select className="select" value={f.condition} onChange={set('condition')}><option value="usado">Usado</option><option value="nuevo">Nuevo</option><option value="certificado">Usado certificado</option></select></F>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Descripción</label>
          <textarea className="input" rows={3} value={f.description} onChange={set('description')} placeholder="Detalles, mantenimientos, equipamiento…" />
        </div>

        <label className="check-row" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={f.certified} onChange={set('certified')} />
          <span className="small">Marcar como <strong>usado certificado</strong></span>
        </label>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Fotos del vehiculo</label>
          <input
            id="vehicle-photo-upload"
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => {
              addPhotos(e.target.files)
              e.target.value = ''
            }}
          />
          <label htmlFor="vehicle-photo-upload" className="photo-drop">
            <span className="photo-drop-ic"><UploadCloud size={22} /></span>
            <span>
              <span className="strong small">Agrega fotos reales del vehiculo</span>
              <span className="tiny muted">JPG, PNG o WebP. Hasta 20 fotos, 12 MB por imagen.</span>
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

        <div hidden style={{ marginTop: 14, border: '1.5px dashed var(--line)', borderRadius: 8, padding: 20, textAlign: 'center', color: 'var(--muted)', background: 'var(--surface-2)' }}>
          <ImageIcon size={22} style={{ marginBottom: 4 }} /><div className="small">Subida de fotos — próximamente</div>
        </div>

        <div className="notice" style={{ marginTop: 14 }}>
          <Info size={16} /><span>La cuota estimada se calcula automáticamente. Podrás editarla luego.</span>
        </div>

        {error && (
          <div className="notice" style={{ marginTop: 12, borderColor: 'var(--red-bd)', background: 'var(--red-bg)' }}>
            <Info size={16} /><span>{error}</span>
          </div>
        )}

        <div className="row between" style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <Link to="/dealer/inventario" className="btn btn-ghost">Cancelar</Link>
          <button className="btn btn-primary" disabled={busy}><Plus size={16} /> {busy ? 'Publicando…' : 'Publicar vehículo'}</button>
        </div>
      </form>
    </div>
  )
}

function F({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>
}
