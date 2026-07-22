import { useEffect, useRef, useState } from 'react'
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
      <svg className="car-illus" viewBox="0 0 260 120" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={label || 'Vehículo'}>
        <ellipse cx="130" cy="104" rx="112" ry="9" fill="#000" opacity="0.06" />
        <path d="M18 84c-2-14 4-20 14-22 8-14 20-28 34-33 20-7 52-7 72 0 12 4 24 12 34 22l30 5c10 2 16 8 18 18 1 6-1 11-8 11H26c-6 0-7-4-8-9Z" fill={tone} />
        <path d="M74 32c16-5 44-5 60 0 9 3 18 9 25 17H55c5-7 12-13 19-17Z" fill="#fff" opacity="0.82" />
        <path d="M96 30c10-2 22-2 32 0v19H96V30Z" fill="#cbd5e1" opacity="0.5" />
        <circle cx="76" cy="86" r="19" fill="#1f2937" /><circle cx="76" cy="86" r="9" fill="#e5e7eb" />
        <circle cx="188" cy="86" r="19" fill="#1f2937" /><circle cx="188" cy="86" r="9" fill="#e5e7eb" />
        <rect x="210" y="58" width="16" height="8" rx="2" fill="#fbbf24" opacity="0.9" />
        <rect x="34" y="60" width="12" height="8" rx="2" fill="#fca5a5" opacity="0.85" />
      </svg>
      {src && !dead && (
        <img
          key={src}
          ref={imgRef}
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
