import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, MapPin, BadgeCheck, Navigation, Phone, Car, Clock, MessageCircle } from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import { getDealerBySlug } from '../data/api'
import { dealerCoords, directionsUrl } from '../data/geo'

const locCoords = (loc, d) => (loc && loc.lat != null ? { lat: loc.lat, lng: loc.lng } : dealerCoords(d))

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

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="row center wrap gap-16">
            <div className="dealer-mark" style={{ width: 64, height: 64, fontSize: 20 }}>{d.initials}</div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row center gap-8"><h1 style={{ fontSize: 24 }}>{d.name}</h1>{d.verified && <BadgeCheck size={20} color="var(--teal-700)" />}</div>
              <div className="muted small row center gap-4" style={{ marginTop: 4 }}>
                <MapPin size={14} /> {d.city || 'República Dominicana'} · {d.vehicles.length} vehículo{d.vehicles.length === 1 ? '' : 's'}
              </div>
              {d.hours && <div className="tiny muted row center gap-4" style={{ marginTop: 4 }}><Clock size={12} /> {d.hours}</div>}
              {d.phone && <div className="tiny muted row center gap-4" style={{ marginTop: 3 }}><Phone size={12} /> {d.phone}</div>}
              {d.verified && <span className="chip chip-teal" style={{ marginTop: 10 }}><BadgeCheck size={13} /> Dealer verificado</span>}
            </div>
            <div className="col gap-8" style={{ alignItems: 'stretch', minWidth: 160 }}>
              {waLink && (
                <a className="btn" style={{ background: '#25D366', color: '#fff', border: 'none' }} href={waLink} target="_blank" rel="noreferrer">
                  <MessageCircle size={16} /> WhatsApp
                </a>
              )}
              <a className="btn btn-outline" href={directionsUrl(primaryCoords)} target="_blank" rel="noreferrer"><Navigation size={16} /> Cómo llegar</a>
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
