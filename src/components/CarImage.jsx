import { useEffect, useRef, useState } from 'react'
import autordLogo from '../assets/autord-logo-reference.png'
import suv1 from '../assets/cars/suv-1.jpg'
import suv3 from '../assets/cars/suv-3.jpg'
import heroSuv from '../assets/cars/hero-suv.jpg'
import sedan1 from '../assets/cars/sedan-1.jpg'
import sedan2 from '../assets/cars/sedan-2.jpg'
import pickup1 from '../assets/cars/pickup-1.jpg'
import hatch1 from '../assets/cars/hatch-1.jpg'

// Local, bundled car photos — always load (preview + production, offline).
// Picked deterministically per vehicle by body type. A clean SVG car sits
// underneath so there is never a blank/broken card.
const CAR_PHOTOS = {
  SUV: [suv1, suv3, heroSuv],
  'Sedán': [sedan1, sedan2],
  Pickup: [pickup1],
  Hatchback: [hatch1],
}
const DEFAULT_BUCKET = [suv1, sedan1]

function hashOf(s) {
  return Math.abs([...String(s || 'x')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))
}
function photoFor(bodyType, seed, make, model) {
  const bucket = CAR_PHOTOS[bodyType] || DEFAULT_BUCKET
  return bucket[hashOf(seed || `${make}${model}`) % bucket.length]
}

export default function CarImage({ tone = '#4b5563', className = '', label, make, model, bodyType, seed, photo }) {
  const imgRef = useRef(null)
  const [ok, setOk] = useState(false)
  const [dead, setDead] = useState(false)
  const src = photo || (seed === 'hero' ? heroSuv : (make || bodyType ? photoFor(bodyType, seed, make, model) : null))

  useEffect(() => {
    setDead(false)
    setOk(false)
    const img = imgRef.current
    if (img?.complete) {
      if (img.naturalWidth > 0) setOk(true)
      else setDead(true)
    }
  }, [src])

  return (
    <div className={`vphoto ${className}`}>
      {/* Placeholder beneath the photo — visible while it loads and if it never
          arrives. A generic car drawing read as the actual vehicle; the AutoRD
          mark reads as "no photo yet" and can't be mistaken for the car. */}
      <div
        className="car-illus"
        role="img"
        aria-label={label || 'Vehículo'}
        // Fills the frame: `.vphoto .car-illus` sets width 62% and no height,
        // which an SVG got from its viewBox but a div does not. No background
        // either — .vphoto's gradient should show through.
        style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}
      >
        <img src={autordLogo} alt="" style={{ width: '38%', maxWidth: 120, opacity: 0.3 }} />
      </div>
      {src && !dead && (
        <img
          key={src}
          // A cached image can finish loading before React attaches onLoad, and
          // the mount effect can miss it too — leaving a fully decoded photo at
          // opacity 0 forever behind the placeholder. Checking here, the moment
          // the element is attached, closes that gap.
          ref={(el) => {
            imgRef.current = el
            if (el?.complete && el.naturalWidth > 0) setOk(true)
          }}
          src={src}
          alt={label || 'Vehículo'}
          className="vphoto-img"
          style={{ opacity: ok ? 1 : 0 }}
          onLoad={() => setOk(true)}
          onError={() => setDead(true)}
        />
      )}
    </div>
  )
}
