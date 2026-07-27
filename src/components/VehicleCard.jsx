import { Car, Heart, MapPin, BadgeCheck, ShieldCheck, Scale, Calculator, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import CarImage from './CarImage'
import PriceSignal from './PriceSignal'
import { fmtMoney } from '../data/demo'
import { isCompared, toggleCompare } from '../data/compare'
import { isFavorite, toggleFavorite } from '../data/favorites'
import { useFicha } from '../context/FichaContext'
import { useAuth } from '../context/AuthContext'
import { isInstitutionProfile } from '../data/roles'
import useApproval from '../hooks/useApproval'
import { vehicleFit } from '../data/finance'

export default function VehicleCard({ v }) {
  const [fav, setFav] = useState(() => isFavorite(v.id))
  const [cmp, setCmp] = useState(() => isCompared(v.id))
  const { open } = useFicha()
  const { profile } = useAuth() || {}
  const institutionUser = isInstitutionProfile(profile)
  const { ceiling, apr, term } = useApproval()
  // null when there is no approval to measure against — the card then offers the
  // calculator instead of a verdict it cannot justify.
  const fit = institutionUser ? null : vehicleFit({
    price: v.price, approvedAmount: ceiling,
    apr: apr ?? undefined, termYears: term ?? undefined,
  })
  const badge = v.condition === 'Nuevo' ? 'nuevo' : v.certified ? 'certified' : 'used'
  const badgeText = v.condition === 'Nuevo' ? 'Nuevo' : v.certified ? 'Usado certificado' : 'Usado'
  const BadgeIcon = badge === 'nuevo' ? BadgeCheck : badge === 'certified' ? ShieldCheck : Car
  const specs = [v.year, v.trim, v.transmission, v.engine].filter(Boolean).join(' · ')

  useEffect(() => {
    const sync = () => setCmp(isCompared(v.id))
    window.addEventListener('autord-compare', sync)
    return () => window.removeEventListener('autord-compare', sync)
  }, [v.id])

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
        <button
          className={`compare-float ${cmp ? 'active' : ''}`}
          aria-label={cmp ? 'Quitar de comparar' : 'Comparar vehiculo'}
          onClick={(e) => { e.stopPropagation(); setCmp(toggleCompare(v.id).on) }}
        >
          <Scale size={14} />
          <span>{cmp ? 'Comparando' : 'Comparar'}</span>
        </button>
        {v.dealerVerified && (
          <span className="verified-shield" title="Dealer verificado"><ShieldCheck size={14} /></span>
        )}
        <CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} photo={v.coverPhoto} label={`${v.make} ${v.model}`} />
      </div>

      <div className="vcard-body">
        <div className="vtitle">{v.make} {v.model}</div>
        <div className="vspecs">{specs}</div>
        <div className="vloc"><MapPin size={13} /> {v.location}</div>
        <div className="vprice">{fmtMoney(v.price, v.currency)}</div>
        <PriceSignal insight={v.priceInsight} />
        {/* "¿Puedo financiar este?" answered on the card itself. Kept to a
            short chip plus the number on its own line: in the 2-up phone grid a
            card is ~147px wide, and the full sentence wrapped to two lines.
            Dealer and bank staff get the calculator instead — they are not
            shopping on a personal approval, so a fit verdict is meaningless. */}
        <div className="vcard-fin">
          {institutionUser ? (
            <span className="chip"><Calculator size={13} /> Calculadora de cuota</span>
          ) : fit ? (
            <>
              <span className={`chip ${fit.fits ? 'chip-green' : 'chip-amber'}`}>
                {fit.fits ? <><BadgeCheck size={13} /> Te alcanza</> : <><Info size={13} /> Falta inicial</>}
              </span>
              <div className="tiny muted vcard-fin-num">
                {fit.fits
                  ? `${fmtMoney(fit.monthly, v.currency)}/mes`
                  : `+${fmtMoney(fit.extraDownNeeded, v.currency)} de inicial`}
              </div>
            </>
          ) : (
            <span className="chip chip-teal">¿Puedo financiarlo?</span>
          )}
        </div>
      </div>
    </article>
  )
}
