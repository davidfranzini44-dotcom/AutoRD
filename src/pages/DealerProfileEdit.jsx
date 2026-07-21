import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, MapPin, MessageCircle, Clock, CheckCircle2, FileText, CalendarDays } from 'lucide-react'
import { getMyDealer, updateDealerProfile } from '../data/api'
import { useAuth } from '../context/AuthContext'

const emptyLoc = () => ({ name: '', address: '', city: '', lat: '', lng: '' })

export default function DealerProfileEdit() {
  const { profile } = useAuth() || {}
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [hours, setHours] = useState('')
  const [description, setDescription] = useState('')
  const [foundedYear, setFoundedYear] = useState('')
  const [locs, setLocs] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    getMyDealer(profile?.dealer_id).then((d) => {
      if (!alive) return
      if (d) {
        setName(d.name || '')
        setWhatsapp(d.whatsapp || '')
        setHours(d.hours || '')
        setDescription(d.description || '')
        setFoundedYear(d.founded_year ? String(d.founded_year) : '')
        setLocs((d.locations || []).map((l) => ({ name: l.name || '', address: l.address || '', city: l.city || '', lat: l.lat ?? '', lng: l.lng ?? '' })))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
    return () => { alive = false }
  }, [profile?.dealer_id])

  const setLoc = (i, k, v) => setLocs((arr) => arr.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const addLoc = () => setLocs((arr) => [...arr, emptyLoc()])
  const removeLoc = (i) => setLocs((arr) => arr.filter((_, idx) => idx !== i))

  const save = async () => {
    setSaving(true); setSaved(false)
    const cleanLocs = locs.filter((l) => l.name || l.address || l.city).map((l) => ({
      name: l.name || null, address: l.address || null, city: l.city || null,
      lat: l.lat === '' ? null : Number(l.lat), lng: l.lng === '' ? null : Number(l.lng),
    }))
    try {
      await updateDealerProfile(profile?.dealer_id, {
        whatsapp: whatsapp.replace(/[^\d]/g, ''), hours, locations: cleanLocs,
        description, foundedYear: foundedYear ? Number(foundedYear) : null,
      })
      setSaved(true)
    } catch (_) { /* offline/denied */ }
    setSaving(false)
  }

  if (loading) return <div className="muted">Cargando perfil…</div>

  return (
    <div>
      <div className="admin-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Perfil del dealer</h1>
          <p className="tiny muted">Tu contacto, horario y ubicaciones que ven los compradores</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : <><Save size={16} /> Guardar cambios</>}
        </button>
      </div>

      {saved && (
        <div className="notice" style={{ marginBottom: 16, borderColor: 'var(--green-bd)', background: 'var(--green-bg)' }}>
          <CheckCircle2 size={16} /><span>Cambios guardados. Ya aparecen en tu perfil público.</span>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 660 }}>
        {name && <div className="small strong" style={{ marginBottom: 14 }}>{name}</div>}
        <div className="field">
          <label><FileText size={13} style={{ verticalAlign: -2 }} /> Descripción</label>
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Cuenta a los compradores quién eres: tipo de vehículos, garantías, años de experiencia…" style={{ resize: 'vertical', minHeight: 72 }} />
          <span className="help">Aparece en tu perfil público, debajo de tu nombre.</span>
        </div>
        <div className="grid grid-2" style={{ gap: 12, marginTop: 12 }}>
          <div className="field">
            <label><MessageCircle size={13} style={{ verticalAlign: -2 }} /> WhatsApp</label>
            <input className="input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="18091234567" />
            <span className="help">Con código de país, solo números.</span>
          </div>
          <div className="field">
            <label><CalendarDays size={13} style={{ verticalAlign: -2 }} /> Año de fundación</label>
            <input className="input" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} placeholder="2015" inputMode="numeric" />
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label><Clock size={13} style={{ verticalAlign: -2 }} /> Horario</label>
          <input className="input" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Lun a Sáb: 9:00 AM – 6:00 PM · Dom: cerrado" />
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 660 }}>
        <div className="row between center" style={{ marginBottom: 12 }}>
          <div className="small strong"><MapPin size={13} style={{ verticalAlign: -2 }} /> Ubicaciones</div>
          <button className="btn btn-outline btn-sm" onClick={addLoc}><Plus size={14} /> Agregar ubicación</button>
        </div>
        {locs.length === 0 && <div className="tiny muted">Aún no has agregado ubicaciones. Agrega al menos una para que aparezca en tu perfil y el mapa.</div>}
        <div className="col gap-14">
          {locs.map((l, i) => (
            <div key={i} className="card" style={{ padding: 12, background: 'var(--surface-2)', boxShadow: 'none' }}>
              <div className="row between center" style={{ marginBottom: 8 }}>
                <span className="tiny strong">Ubicación {i + 1}</span>
                <button className="btn btn-outline btn-sm" onClick={() => removeLoc(i)} title="Eliminar"><Trash2 size={14} /></button>
              </div>
              <div className="grid grid-2" style={{ gap: 8 }}>
                <F label="Nombre / sucursal"><input className="input" value={l.name} onChange={(e) => setLoc(i, 'name', e.target.value)} placeholder="Casa matriz" /></F>
                <F label="Ciudad"><input className="input" value={l.city} onChange={(e) => setLoc(i, 'city', e.target.value)} placeholder="Santo Domingo" /></F>
                <F label="Dirección" full><input className="input" value={l.address} onChange={(e) => setLoc(i, 'address', e.target.value)} placeholder="Av. 27 de Febrero #250" /></F>
                <F label="Latitud (opcional)"><input className="input" value={l.lat} onChange={(e) => setLoc(i, 'lat', e.target.value)} placeholder="18.4719" /></F>
                <F label="Longitud (opcional)"><input className="input" value={l.lng} onChange={(e) => setLoc(i, 'lng', e.target.value)} placeholder="-69.9391" /></F>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function F({ label, full, children }) {
  return <div className="field" style={full ? { gridColumn: '1 / -1' } : undefined}><label>{label}</label>{children}</div>
}
