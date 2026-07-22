import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, MapPin, BadgeCheck, Navigation, Phone, Car, Clock, MessageCircle, Star, CalendarDays } from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import DealerLogo from '../components/DealerLogo'
import { getDealerBySlug } from '../data/api'
import { dealerCoords, directionsUrl } from '../data/geo'

const locCoords = (loc, d) => (loc && loc.lat != null ? { lat: loc.lat, lng: loc.lng } : dealerCoords(d))

function Stars({ rating, count }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <span className="row center gap-4" title={`${rating} de 5`}>
      <span className="row center" style={{ gap: 1 }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const on = i < full
          const isHalf = i === full && half
          return <Star key={i} size={15} strokeWidth={2}
            fill={on || isHalf ? '#f5a623' : 'none'} color={on || isHalf ? '#f5a623' : 'var(--line-2, #cbd5e1)'}
            style={isHalf ? { clipPath: 'inset(0 50% 0 0)' } : undefined} />
        })}
      </span>
      <span className="small strong" style={{ color: '#b8860b' }}>{rating.toFixed(1)}</span>
      {count > 0 && <span className="tiny muted">({count})</span>}
    </span>
  )
}

function Stat({ icon: Icon, label }) {
  return (
    <span className="chip" style={{ background: 'var(--surface-2)', color: 'var(--text-2, var(--muted))' }}>
      <Icon size={13} /> {label}
    </span>
  )
}

export default function DealerProfile() {
  const { slug } = useParams()
  const [d, setD] = useState(undefined)

  useEffect(() => {
    let alive = true
    setD(undefined)
    getDealerBySlug(slug).then((data) => { if (alive) setD(data) }).catch(() => { if (alive) setD(null) })
    return () => { alive = false }
  }, [slug])

  if (d === undefined) return <main className="page"><div className="container muted">Cargando dealer…</div></main>
  if (!d) {
    return (
      <main className="page"><div className="container">
        <p>Dealer no encontrado. <Link to="/dealers" className="link-teal">Ver todos los dealers</Link></p>
      </div></main>
    )
  }

  const wa = String(d.whatsapp || d.phone || '').replace(/[^\d]/g, '')
  const waLink = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hola ${d.name}, vi sus vehículos en AutoRD y quiero más información.`)}` : null
  const locations = d.locations || []
  const primaryCoords = locCoords(locations[0], d)

  return (
    <main className="page">
      <div className="container">
        <Link to="/dealers" className="btn btn-ghost btn-sm" style={{ paddingLeft: 4, marginBottom: 10 }}><ChevronLeft size={17} /> Dealers</Link>

        <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
          {/* Banner */}
          <div style={{ height: 96, background: 'linear-gradient(120deg, var(--teal-800), var(--teal-600, #0f766e))' }} />
          <div className="card-pad" style={{ paddingTop: 0 }}>
            <div className="row wrap gap-16" style={{ alignItems: 'flex-end', marginTop: -32 }}>
              <DealerLogo dealer={d} style={{ width: 76, height: 76, fontSize: 24, border: '3px solid var(--surface, #fff)', boxShadow: 'var(--shadow-sm, 0 2px 8px rgba(0,0,0,.12))' }} />
              <div className="grow" style={{ minWidth: 0, paddingBottom: 2 }}>
                <div className="row center gap-8"><h1 style={{ fontSize: 24 }}>{d.name}</h1>{d.verified && <BadgeCheck size={20} color="var(--teal-700)" />}</div>
                <div className="row center gap-10 wrap" style={{ marginTop: 4 }}>
                  {d.rating != null && <Stars rating={d.rating} count={d.ratingCount} />}
                  <span className="muted small row center gap-4"><MapPin size={14} /> {d.city || 'República Dominicana'}</span>
                  {d.foundedYear && <span className="muted small row center gap-4"><CalendarDays size={13} /> Desde {d.foundedYear}</span>}
                </div>
              </div>
              <div className="col gap-8" style={{ alignItems: 'stretch', minWidth: 160, paddingBottom: 2 }}>
                {waLink && (
                  <a className="btn" style={{ background: '#25D366', color: '#fff', border: 'none' }} href={waLink} target="_blank" rel="noreferrer">
                    <MessageCircle size={16} /> WhatsApp
                  </a>
                )}
                <a className="btn btn-outline" href={directionsUrl(primaryCoords)} target="_blank" rel="noreferrer"><Navigation size={16} /> Cómo llegar</a>
              </div>
            </div>

            {d.description && <p className="small" style={{ marginTop: 14, color: 'var(--text-2, var(--muted))', lineHeight: 1.6, maxWidth: 720 }}>{d.description}</p>}

            {/* Stat strip */}
            <div className="row wrap gap-8" style={{ marginTop: 14 }}>
              <Stat icon={Car} label={`${d.vehicles.length} en inventario`} />
              {d.rating != null && <Stat icon={Star} label={`${d.rating.toFixed(1)} · ${d.ratingCount} reseñas`} />}
              {d.verified && <span className="chip chip-teal"><BadgeCheck size={13} /> Dealer verificado</span>}
              {d.hours && <Stat icon={Clock} label={d.hours} />}
              {d.phone && <Stat icon={Phone} label={d.phone} />}
            </div>
          </div>
        </div>

        {locations.length > 0 && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="small strong" style={{ marginBottom: 12 }}>{locations.length > 1 ? `Ubicaciones (${locations.length})` : 'Ubicación'}</div>
            <div className="col gap-10">
              {locations.map((loc, i) => (
                <div key={i} className="row between center wrap gap-8" style={{ borderTop: i ? '1px solid var(--line-2)' : 'none', paddingTop: i ? 10 : 0 }}>
                  <div className="row center gap-10" style={{ minWidth: 0 }}>
                    <div className="verify-ic ok" style={{ background: 'var(--teal-50)', color: 'var(--teal-700)', width: 36, height: 36, flex: 'none' }}><MapPin size={16} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div className="strong small">{loc.name || loc.city}</div>
                      <div className="tiny muted">{loc.address || loc.city}</div>
                    </div>
                  </div>
                  <a className="btn btn-outline btn-sm" href={directionsUrl(locCoords(loc, d))} target="_blank" rel="noreferrer"><Navigation size={14} /> Cómo llegar</a>
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(d.photos) && d.photos.length > 0 && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="small strong" style={{ marginBottom: 12 }}>Fotos del local</div>
            <div className="dealer-gallery">
              {d.photos.map((p, i) => {
                const src = typeof p === 'string' ? p : p.url
                return <img key={i} src={src} alt={`${d.name} — foto ${i + 1}`} loading="lazy" className="dealer-gallery-img" />
              })}
            </div>
          </div>
        )}

        <div className="section-title"><h2 style={{ fontSize: 18 }}>Vehículos de {d.name}</h2></div>
        {d.vehicles.length === 0 ? (
          <div className="card card-pad muted small" style={{ textAlign: 'center' }}><Car size={22} className="muted" style={{ margin: '0 auto 8px' }} /> Este dealer no tiene vehículos publicados por ahora.</div>
        ) : (
          <div className="grid grid-4" style={{ marginTop: 6 }}>
            {d.vehicles.map((v) => <VehicleCard key={v.id} v={v} />)}
          </div>
        )}
      </div>
    </main>
  )
}
