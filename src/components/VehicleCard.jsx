import { Link } from 'react-router-dom'
import { Heart, MapPin, Gauge, BadgeCheck, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import CarImage from './CarImage'
import { fmtRD } from '../data/demo'
import { isFavorite, toggleFavorite } from '../data/favorites'

export default function VehicleCard({ v }) {
  const [fav, setFav] = useState(() => isFavorite(v.id))
  const specs = [v.trim, v.transmission, v.fuel, v.drivetrain || v.engine].filter(Boolean).join(' · ')
  const km = v.mileage === 0 ? 'Nuevo' : `${v.mileage.toLocaleString('es-DO')} km`

  return (
    <article className="vcard">
      <div className="vphoto-wrap">
        <button
          className={`fav-btn ${fav ? 'active' : ''}`}
          aria-label="Guardar en favoritos"
          onClick={(e) => { e.preventDefault(); setFav(toggleFavorite(v.id)) }}
        >
          <Heart size={17} />
        </button>
        {v.financing && (
          <span className="fin-badge"><BadgeCheck size={13} /> Financiamiento disponible</span>
        )}
        <Link to={`/vehiculo/${v.id}`}>
          <CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} label={`${v.make} ${v.model}`} />
        </Link>
      </div>

      <div className="vcard-body">
        <div className="row between" style={{ alignItems: 'baseline', gap: 8 }}>
          <Link to={`/vehiculo/${v.id}`}><div className="vtitle">{v.make} {v.model} {v.year}</div></Link>
          <div className="vprice">{fmtRD(v.price)}</div>
        </div>

        <div className="row between center" style={{ gap: 8, marginTop: 6 }}>
          <div className="vspecs">{specs}</div>
          {v.monthly && <span className="monthly-pill">Desde {fmtRD(v.monthly)}/mes</span>}
        </div>

        <div className="vmeta">
          <span><Gauge size={14} /> {km}</span>
          <span><MapPin size={14} /> {v.location}</span>
        </div>

        <div className="vcard-foot">
          <Link to={`/vehiculo/${v.id}`} className="link-teal">Ver detalles <ArrowRight size={15} /></Link>
        </div>
      </div>
    </article>
  )
}
