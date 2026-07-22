import { useState, useEffect } from 'react'
import { Plus, Save, MapPin, MessageCircle, Clock, CheckCircle2, FileText, CalendarDays, Image as ImageIcon, Trash2, Instagram, Facebook, Globe, ExternalLink } from 'lucide-react'
import { getMyDealer, updateDealerProfile, uploadDealerLogo } from '../data/api'
import { useAuth } from '../context/AuthContext'
import LocationPicker from '../components/LocationPicker'
import DealerLogo from '../components/DealerLogo'

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
  const [logoUrl, setLogoUrl] = useState('')
  const [logoBusy, setLogoBusy] = useState(false)
  const [slug, setSlug] = useState('')
  const [social, setSocial] = useState({})

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
        setLogoUrl(d.logoUrl || d.logo_url || '')
        setSlug(d.slug || '')
        setSocial(d.social && typeof d.social === 'object' ? d.social : {})
        setLocs((d.locations || []).map((l) => ({ name: l.name || '', address: l.address || '', city: l.city || '', lat: l.lat ?? '', lng: l.lng ?? '' })))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
    return () => { alive = false }
  }, [profile?.dealer_id])

  const addLoc = () => setLocs((arr) => [...arr, emptyLoc()])
  const removeLoc = (i) => setLocs((arr) => arr.filter((_, idx) => idx !== i))

  const onLogoFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoBusy(true)
    try {
      const { url } = await uploadDealerLogo(profile?.dealer_id, file)
      if (url) setLogoUrl(url)
    } catch (_) { /* denied */ }
    setLogoBusy(false)
  }

  const save = async () => {
    setSaving(true); setSaved(false)
    const cleanLocs = locs.filter((l) => l.name || l.address || l.city).map((l) => ({
      name: l.name || null, address: l.address || null, city: l.city || null,
      lat: l.lat === '' ? null : Number(l.lat), lng: l.lng === '' ? null : Number(l.lng),
    }))
    try {
      await updateDealerProfile(profile?.dealer_id, {
        whatsapp: whatsapp.replace(/[^\d]/g, ''), hours, locations: cleanLocs,
        description, foundedYear: foundedYear ? Number(foundedYear) : null, logoUrl, social,
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
        <div className="row gap-8 wrap">
          {slug && <a className="btn btn-outline" href={`/dealers/${slug}`} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Ver perfil público</a>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : <><Save size={16} /> Guardar cambios</>}
          </button>
        </div>
      </div>

      {saved && (
        <div className="notice" style={{ marginBottom: 16, borderColor: 'var(--green-bd)', background: 'var(--green-bg)' }}>
          <CheckCircle2 size={16} /><span>Cambios guardados. Ya aparecen en tu perfil público.</span>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 660 }}>
        <div className="row center gap-14" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--line-2, #e2e8f0)' }}>
          <DealerLogo dealer={{ name, logoUrl }} style={{ width: 64, height: 64, borderRadius: 12, fontSize: 20 }} />
          <div className="grow">
            {name && <div className="small strong">{name}</div>}
            <div className="tiny muted" style={{ marginTop: 2 }}>Logo de la empresa · PNG o JPG cuadrado (mín. 200×200)</div>
            <div className="row gap-8" style={{ marginTop: 8 }}>
              <label className="btn btn-outline btn-sm" style={{ cursor: logoBusy ? 'not-allowed' : 'pointer', opacity: logoBusy ? 0.6 : 1 }}>
                <ImageIcon size={14} /> {logoBusy ? 'Subiendo…' : (logoUrl ? 'Cambiar logo' : 'Subir logo')}
                <input type="file" accept="image/*" hidden disabled={logoBusy} onChange={onLogoFile} />
              </label>
              {logoUrl && <button className="btn btn-ghost btn-sm" onClick={() => setLogoUrl('')} disabled={logoBusy}><Trash2 size={14} /> Quitar</button>}
            </div>
          </div>
        </div>
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

      <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 660 }}>
        <div className="small strong" style={{ marginBottom: 12 }}>Redes sociales</div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field">
            <label><Instagram size={13} style={{ verticalAlign: -2 }} /> Instagram</label>
            <input className="input" value={social.instagram || ''} onChange={(e) => setSocial((s) => ({ ...s, instagram: e.target.value }))} placeholder="@tudealer" />
          </div>
          <div className="field">
            <label><Facebook size={13} style={{ verticalAlign: -2 }} /> Facebook</label>
            <input className="input" value={social.facebook || ''} onChange={(e) => setSocial((s) => ({ ...s, facebook: e.target.value }))} placeholder="facebook.com/tudealer" />
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label><Globe size={13} style={{ verticalAlign: -2 }} /> Sitio web</label>
          <input className="input" value={social.website || ''} onChange={(e) => setSocial((s) => ({ ...s, website: e.target.value }))} placeholder="https://tudealer.com" />
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
            <LocationPicker
              key={i}
              index={i}
              loc={l}
              onChange={(nl) => setLocs((arr) => arr.map((x, idx) => (idx === i ? nl : x)))}
              onRemove={() => removeLoc(i)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
