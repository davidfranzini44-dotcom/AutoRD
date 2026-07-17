import { Car, Heart, MapPin, BadgeCheck, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import CarImage from './CarImage'
import { fmtRD } from '../data/demo'
import { isFavorite, toggleFavorite } from '../data/favorites'
import { useFicha } from '../context/FichaContext'

export default function VehicleCard({ v }) {
  const [fav, setFav] = useState(() => isFavorite(v.id))
  const { open } = useFicha()
  const badge = v.condition === 'Nuevo' ? 'nuevo' : v.certified ? 'certified' : 'used'
  const badgeText = v.condition === 'Nuevo' ? 'Nuevo' : v.certified ? 'Usado certificado' : 'Usado'
  const BadgeIcon = badge === 'nuevo' ? BadgeCheck : badge === 'certified' ? ShieldCheck : Car
  const specs = [v.year, v.trim, v.transmission, v.engine].filter(Boolean).join(' · ')

  return (
    <article
      className="vcard vcard-click"
      role="button"
      tabIndex={0}
      aria-label={`Ver ${v.make} ${v.model} ${v.year}`}
      onClick={() => open(v)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(v) } }}
    >
      <div className="vphoto-wrap">
        <span className={`badge-corner ${badge}`}>
          <BadgeIcon size={14} strokeWidth={2.5} />
          {badgeText}
        </span>
        <button
          className={`fav-btn ${fav ? 'active' : ''}`}
          aria-label="Guardar en favoritos"
          onClick={(e) => { e.stopPropagation(); setFav(toggleFavorite(v.id)) }}
        >
          <Heart size={17} />
        </button>
        {v.dealerVerified && (
          <span className="verified-shield" title="Dealer verificado"><ShieldCheck size={14} /></span>
        )}
        <CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} label={`${v.make} ${v.model}`} />
      </div>

      <div className="vcard-body">
        <div className="vtitle">{v.make} {v.model}</div>
        <div className="vspecs">{specs}</div>
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
