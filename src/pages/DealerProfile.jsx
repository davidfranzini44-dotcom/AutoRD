import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, MapPin, BadgeCheck, Navigation, Phone, Car } from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import { getDealerBySlug } from '../data/api'
import { dealerCoords, directionsUrl } from '../data/geo'

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

  return (
    <main className="page">
      <div className="container">
        <Link to="/dealers" className="btn btn-ghost btn-sm" style={{ paddingLeft: 4, marginBottom: 10 }}><ChevronLeft size={17} /> Dealers</Link>

        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <div className="row center wrap gap-16">
            <div className="dealer-mark" style={{ width: 64, height: 64, fontSize: 20 }}>{d.initials}</div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row center gap-8"><h1 style={{ fontSize: 24 }}>{d.name}</h1>{d.verified && <BadgeCheck size={20} color="var(--teal-700)" />}</div>
              <div className="muted small row center gap-4" style={{ marginTop: 4 }}>
                <MapPin size={14} /> {d.city || 'República Dominicana'} · {d.vehicles.length} vehículo{d.vehicles.length === 1 ? '' : 's'}
              </div>
              {d.phone && <div className="tiny muted row center gap-4" style={{ marginTop: 3 }}><Phone size={12} /> {d.phone}</div>}
              {d.verified && <span className="chip chip-teal" style={{ marginTop: 10 }}><BadgeCheck size={13} /> Dealer verificado</span>}
            </div>
            <a className="btn btn-primary" href={directionsUrl(dealerCoords(d))} target="_blank" rel="noreferrer">
              <Navigation size={16} /> Cómo llegar
            </a>
          </div>
        </div>

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
