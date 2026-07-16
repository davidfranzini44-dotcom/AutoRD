import { Link } from 'react-router-dom'
import { Heart, MapPin, BadgeCheck } from 'lucide-react'
import { useState } from 'react'
import CarImage from './CarImage'
import { fmtRD } from '../data/demo'
import { isFavorite, toggleFavorite } from '../data/favorites'

export default function VehicleCard({ v }) {
  const [fav, setFav] = useState(() => isFavorite(v.id))
  const badge = v.condition === 'Nuevo' ? 'nuevo' : v.certified ? 'certified' : ''
  const badgeText = v.condition === 'Nuevo' ? 'Nuevo' : v.certified ? 'Usado certificado' : 'Usado'
  return (
    <article className="vcard">
      <div style={{ position: 'relative' }}>
        <span className={`badge-corner ${badge}`}>{badgeText}</span>
        <button
          className={`fav-btn ${fav ? 'active' : ''}`}
          aria-label="Guardar en favoritos"
          onClick={(e) => { e.preventDefault(); setFav(toggleFavorite(v.id)) }}
        >
          <Heart size={17} />
        </button>
        <Link to={`/vehiculo/${v.id}`}>
          <CarImage tone={v.tone} label={`${v.make} ${v.model}`} />
        </Link>
      </div>
      <div className="vcard-body">
        <Link to={`/vehiculo/${v.id}`}>
          <div className="vtitle">{v.make} {v.model}</div>
        </Link>
        <div className="vspecs">{v.year} · {v.trim} · {v.transmission} · {v.engine}</div>
        <div className="vloc"><MapPin size={13} /> {v.location}</div>
        <div className="vprice">{fmtRD(v.price)}</div>
        {v.financing && (
          <div style={{ marginTop: 10 }}>
            <span className="chip chip-teal"><BadgeCheck size={13} /> Financiamiento disponible</span>
          </div>
        )}
      </div>
    </article>
  )
}
