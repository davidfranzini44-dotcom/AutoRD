import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  X, Heart, MapPin, ShieldCheck, Gauge, Cog, Fuel, Palette, Calculator, ChevronRight, BadgeCheck,
} from 'lucide-react'
import CarImage from './CarImage'
import ContactDealer from './ContactDealer'
import { fmtRD } from '../data/demo'
import { carDefaultMonthly } from '../data/finance'
import { isFavorite, toggleFavorite } from '../data/favorites'
import { useFicha } from '../context/FichaContext'

// Slide-in "ficha" drawer: preview a vehicle without leaving the current page.
// Rendered once inside the buyer Layout; opened via useFicha().open(vehicle).
export default function VehicleFicha() {
  const { vehicle, close } = useFicha()
  const loc = useLocation()
  // Close automatically if the route changes underneath us.
  useEffect(() => { close() }, [loc.pathname, close])
  if (!vehicle) return null
  return <FichaShell key={vehicle.id} v={vehicle} close={close} />
}

function FichaShell({ v, close }) {
  const [fav, setFav] = useState(() => isFavorite(v.id))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [close])

  const km = v.mileage === 0 ? '0 km (nuevo)' : Number(v.mileage).toLocaleString('es-DO') + ' km'
  const specs = [
    { ic: Gauge, l: 'Kilometraje', val: km },
    { ic: Cog, l: 'Transmisión', val: v.transmission },
    { ic: Fuel, l: 'Combustible', val: v.fuel },
    { ic: Palette, l: 'Color', val: v.color },
  ]
  const initials = String(v.dealer || '').split(' ').map((w) => w[0]).slice(0, 2).join('')

  return (
    <div className="ficha-overlay" onClick={close}>
      <aside className="ficha-panel" role="dialog" aria-modal="true" aria-label={`${v.make} ${v.model}`} onClick={(e) => e.stopPropagation()}>
        <div className="ficha-photo">
          <CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} label={`${v.make} ${v.model}`} />
          <button className="ficha-close" onClick={close} aria-label="Cerrar"><X size={19} /></button>
          <button className={`fav-btn ${fav ? 'active' : ''}`} style={{ position: 'absolute', top: 12, right: 54 }} onClick={() => setFav(toggleFavorite(v.id))} aria-label="Guardar en favoritos"><Heart size={17} /></button>
          {v.dealerVerified && <span className="verified-shield" title="Dealer verificado" style={{ left: 12, top: 12, right: 'auto' }}><ShieldCheck size={14} /></span>}
        </div>

        <div className="ficha-body">
          <div className="row between center wrap gap-8">
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 20, lineHeight: 1.2 }}>{v.make} {v.model} {v.year}</h2>
              <div className="muted small" style={{ marginTop: 2 }}>{[v.trim, km].filter(Boolean).join(' · ')}</div>
            </div>
            <span className={`chip ${v.condition === 'Nuevo' ? 'chip-navy' : 'chip-teal'}`} style={{ height: 26 }}>{v.condition}</span>
          </div>

          <div className="vloc small"><MapPin size={14} /> {v.location}</div>
          <div className="ficha-price">{fmtRD(v.price)}</div>

          {v.price ? (
            <div className="est-card">
              <div className="row between center">
                <div>
                  <div className="tiny" style={{ color: 'var(--teal-800)', fontWeight: 600 }}>Desde</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal-800)' }}>{fmtRD(carDefaultMonthly(v))}<span style={{ fontSize: 13 }}>/mes</span></div>
                  <div className="tiny" style={{ color: 'var(--teal-800)' }}>A {v.termYears} años · 20% inicial · Tasa {v.apr}%</div>
                </div>
                <div style={{ color: 'var(--teal-700)' }}><Calculator size={28} /></div>
              </div>
            </div>
          ) : null}

          <div className="ficha-specs">
            {specs.map((s) => {
              const Icon = s.ic
              return (
                <div className="spec-item" key={s.l}>
                  <Icon size={18} className="si-ic" />
                  <div><div className="si-l">{s.l}</div><div className="si-v">{s.val}</div></div>
                </div>
              )
            })}
          </div>

          {v.description && (
            <p className="small" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}>
              {v.description.length > 170 ? v.description.slice(0, 170) + '…' : v.description}
            </p>
          )}

          <div className="row center gap-10" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
            <div className="avatar" style={{ width: 36, height: 36, fontSize: 12, background: 'var(--navy-800)' }}>{initials}</div>
            <div className="grow">
              <div className="row center gap-6"><span className="strong small">{v.dealer}</span>{v.dealerVerified && <BadgeCheck size={15} color="var(--teal-700)" />}</div>
              <div className="tiny muted">{v.dealerVerified ? 'Dealer verificado' : 'Vendedor particular'}</div>
            </div>
          </div>
        </div>

        <div className="ficha-actions">
          <Link to={`/financiamiento?vehiculo=${v.id}`} className="btn btn-primary btn-block btn-lg" onClick={close}>Solicitar financiamiento</Link>
          <ContactDealer vehicle={v} block triggerClass="btn btn-outline btn-block" triggerLabel={`Contactar a ${v.dealer}`} />
          <Link to={`/vehiculo/${v.id}`} className="btn btn-ghost btn-block btn-sm" onClick={close}>Ver ficha completa <ChevronRight size={16} /></Link>
        </div>
      </aside>
    </div>
  )
}
