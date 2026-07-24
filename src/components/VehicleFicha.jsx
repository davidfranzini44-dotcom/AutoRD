import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  X, Heart, MapPin, ShieldCheck, Gauge, Cog, Fuel, Palette, Calculator, ChevronLeft, ChevronRight, BadgeCheck, Scale, Share2, Store, Maximize2, ChevronDown,
} from 'lucide-react'
import CarImage from './CarImage'
import ContactDealer from './ContactDealer'
import DealerLogo from './DealerLogo'
import PriceSignal from './PriceSignal'
import { fmtMoney } from '../data/demo'
import { carDefaultMonthly } from '../data/finance'
import { isCompared, toggleCompare } from '../data/compare'
import { isFavorite, toggleFavorite } from '../data/favorites'
import { recordRecentlyViewed } from '../data/recentlyViewed'
import { shareVehicle } from '../data/shareVehicle'
import { mileageLabel } from '../data/vehicleLabels'
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
  const [cmp, setCmp] = useState(() => isCompared(v.id))
  const [shareMsg, setShareMsg] = useState('')
  const [activePhoto, setActivePhoto] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  // Swipe-down-to-dismiss (mobile bottom sheet). Drag starts on the grab handle
  // so it never fights scrolling inside the body.
  const panelRef = useRef(null)
  const drag = useRef({ y0: 0, dy: 0, on: false })
  const onDragStart = (e) => { drag.current = { y0: e.touches[0].clientY, dy: 0, on: true } }
  const onDragMove = (e) => {
    if (!drag.current.on || !panelRef.current) return
    const dy = e.touches[0].clientY - drag.current.y0
    drag.current.dy = dy
    if (dy > 0) { panelRef.current.style.transition = 'none'; panelRef.current.style.transform = `translateY(${dy}px)` }
  }
  const onDragEnd = () => {
    if (!drag.current.on || !panelRef.current) return
    const dy = drag.current.dy
    drag.current.on = false
    const panel = panelRef.current
    panel.style.transition = 'transform .2s ease'
    if (dy > 110) { panel.style.transform = 'translateY(100%)'; window.setTimeout(close, 170) }
    else { panel.style.transform = 'translateY(0)' }
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [close])

  useEffect(() => {
    recordRecentlyViewed(v)
  }, [v])

  const km = mileageLabel(v)
  const specs = [
    { ic: Gauge, l: 'Kilometraje', val: km },
    { ic: Cog, l: 'Transmisión', val: v.transmission },
    { ic: Fuel, l: 'Combustible', val: v.fuel },
    { ic: Palette, l: 'Color', val: v.color },
  ]
  const initials = String(v.dealer || '').split(' ').map((w) => w[0]).slice(0, 2).join('')
  const realGalleryPhotos = Array.isArray(v.photoUrls) ? v.photoUrls.filter(Boolean) : []
  const galleryPhotos = realGalleryPhotos.length ? realGalleryPhotos : (v.coverPhoto ? [v.coverPhoto] : [])
  const currentPhoto = galleryPhotos[Math.min(activePhoto, Math.max(0, galleryPhotos.length - 1))] || v.coverPhoto
  const canSwitchPhotos = galleryPhotos.length > 1
  const switchPhoto = (delta) => {
    if (!canSwitchPhotos) return
    setActivePhoto((i) => (i + delta + galleryPhotos.length) % galleryPhotos.length)
  }
  const shareCurrentVehicle = async () => {
    const result = await shareVehicle(v)
    if (result === 'cancelled') return
    setShareMsg(result === 'shared' ? 'Compartido' : 'Link copiado')
    window.setTimeout(() => setShareMsg(''), 1800)
  }

  return (
    <>
    <div className="ficha-overlay" onClick={close}>
      <aside ref={panelRef} className="ficha-panel" role="dialog" aria-modal="true" aria-label={`${v.make} ${v.model}`} onClick={(e) => e.stopPropagation()}>
        <div className="ficha-grab" onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}>
          <span className="ficha-grab-bar" />
          <span className="ficha-grab-hint"><ChevronDown size={13} /> Desliza para cerrar</span>
        </div>
        <div className="ficha-photo">
          <button type="button" className="ficha-photo-btn" onClick={() => setLightbox(true)} aria-label="Ver imagen grande">
            <CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={`${v.id}-${activePhoto}`} tone={v.tone} photo={currentPhoto} label={`${v.make} ${v.model}`} />
            <span className="ficha-zoom-hint"><Maximize2 size={14} /></span>
          </button>
          {canSwitchPhotos && (
            <>
              <button type="button" className="gallery-nav prev" aria-label="Foto anterior" onClick={() => switchPhoto(-1)}><ChevronLeft size={21} /></button>
              <button type="button" className="gallery-nav next" aria-label="Siguiente foto" onClick={() => switchPhoto(1)}><ChevronRight size={21} /></button>
              <span className="gallery-count ficha-photo-count">{activePhoto + 1} / {galleryPhotos.length}</span>
            </>
          )}
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
          <div className="ficha-price">{fmtMoney(v.price, v.currency)}</div>
          <div className="ficha-price-signal"><PriceSignal insight={v.priceInsight} /></div>

          {v.price ? (
            <div className="est-card ficha-payment-card">
              <div className="row between center">
                <div>
                  <div className="tiny" style={{ color: 'var(--teal-800)', fontWeight: 600 }}>Desde</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal-800)' }}>{fmtMoney(carDefaultMonthly(v), v.currency)}<span style={{ fontSize: 13 }}>/mes</span></div>
                  <div className="tiny" style={{ color: 'var(--teal-800)' }}>A {v.termYears} años · 20% inicial · Tasa {v.apr}%</div>
                </div>
                <div style={{ color: 'var(--teal-700)' }}><Calculator size={28} /></div>
              </div>
            </div>
          ) : null}

          <div className="ficha-mobile-quick-actions" aria-label="Acciones rápidas">
            {v.dealerSlug && (
              <Link to={`/dealers/${v.dealerSlug}`} className="btn btn-outline ficha-mobile-dealer-link" onClick={close} aria-label={`Ver perfil de ${v.dealer}`}>
                <Store size={15} /> Dealer
              </Link>
            )}
            <button className={`btn ${cmp ? 'btn-navy' : 'btn-outline'}`} onClick={() => setCmp(toggleCompare(v.id).on)}>
              <Scale size={15} /> Comparar
            </button>
            <button className="btn btn-outline" onClick={shareCurrentVehicle}>
              <Share2 size={15} /> {shareMsg || 'Compartir'}
            </button>
            <ContactDealer vehicle={v} triggerClass="btn btn-outline" triggerLabel="WhatsApp" />
          </div>

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
            <p className="small ficha-description" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}>
              {v.description.length > 170 ? v.description.slice(0, 170) + '…' : v.description}
            </p>
          )}

          {v.dealerSlug ? (
            <Link to={`/dealers/${v.dealerSlug}`} onClick={close} className="row center gap-12 ficha-dealer-row" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12, color: 'inherit' }}>
              <DealerLogo dealer={{ name: v.dealer, initials, logoUrl: v.dealerLogoUrl }} style={{ width: 36, height: 36, borderRadius: 9, fontSize: 12 }} />
              <div className="grow">
                <div className="row center gap-6"><span className="strong small">{v.dealer}</span>{v.dealerVerified && <BadgeCheck size={15} color="var(--teal-700)" />}</div>
                <div className="tiny link-teal">Ver perfil del dealer</div>
              </div>
              <ChevronRight size={18} className="muted" />
            </Link>
          ) : (
            <div className="row center gap-12 ficha-dealer-row" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
              <DealerLogo dealer={{ name: v.dealer, initials, logoUrl: v.dealerLogoUrl }} style={{ width: 36, height: 36, borderRadius: 9, fontSize: 12 }} />
              <div className="grow">
                <div className="row center gap-6"><span className="strong small">{v.dealer}</span>{v.dealerVerified && <BadgeCheck size={15} color="var(--teal-700)" />}</div>
                <div className="tiny muted">{v.dealerVerified ? 'Dealer verificado' : 'Vendedor particular'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="ficha-actions">
          <Link to={`/financiamiento?vehiculo=${v.id}`} className="btn btn-primary btn-block btn-lg ficha-action-primary" onClick={close}>Solicitar financiamiento</Link>
          <button className={`btn ${cmp ? 'btn-navy' : 'btn-outline'} btn-block ficha-action-secondary`} onClick={() => setCmp(toggleCompare(v.id).on)}>
            <Scale size={16} /> {cmp ? 'Quitar de comparar' : 'Comparar vehiculo'}
          </button>
          <button className="btn btn-outline btn-block ficha-action-secondary" onClick={shareCurrentVehicle}>
            <Share2 size={16} /> {shareMsg || 'Compartir link'}
          </button>
          <ContactDealer vehicle={v} block triggerClass="btn btn-outline btn-block ficha-action-contact" triggerLabel={`Contactar a ${v.dealer}`} />
          <Link to={`/vehiculo/${v.id}`} className="btn btn-ghost btn-block btn-sm ficha-action-full" onClick={close}>Ver todos los detalles <ChevronRight size={16} /></Link>
        </div>
      </aside>
    </div>

    {lightbox && (
      <div className="ficha-lightbox" onClick={() => setLightbox(false)}>
        <button type="button" className="ficha-lightbox-close" onClick={() => setLightbox(false)} aria-label="Cerrar"><X size={22} /></button>
        <div className="ficha-lightbox-stage" onClick={(e) => e.stopPropagation()}>
          <CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={`${v.id}-${activePhoto}`} tone={v.tone} photo={currentPhoto} label={`${v.make} ${v.model}`} />
          {canSwitchPhotos && (
            <>
              <button type="button" className="gallery-nav prev" aria-label="Foto anterior" onClick={() => switchPhoto(-1)}><ChevronLeft size={24} /></button>
              <button type="button" className="gallery-nav next" aria-label="Siguiente foto" onClick={() => switchPhoto(1)}><ChevronRight size={24} /></button>
              <span className="gallery-count ficha-lightbox-count">{activePhoto + 1} / {galleryPhotos.length}</span>
            </>
          )}
        </div>
      </div>
    )}
    </>
  )
}
