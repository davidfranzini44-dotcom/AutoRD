import toyota from '../assets/brands/toyota.png'
import honda from '../assets/brands/honda.png'
import hyundai from '../assets/brands/hyundai.png'
import kia from '../assets/brands/kia.png'
import nissan from '../assets/brands/nissan.png'
import bmw from '../assets/brands/bmw.png'
import mercedes from '../assets/brands/mercedes-benz.png'
import ford from '../assets/brands/ford.png'
import mazda from '../assets/brands/mazda.png'

// Real car-brand logos, bundled locally. Keyed by make name (case-insensitive,
// tolerant of "Mercedes-Benz"/"Mercedes"). Falls back to initials.
const LOGOS = {
  toyota, honda, hyundai, kia, nissan, bmw, ford, mazda,
  'mercedes-benz': mercedes, mercedes,
}

function keyFor(make) {
  return String(make || '').trim().toLowerCase()
}

export default function BrandLogo({ make, size = 40, className = '' }) {
  const src = LOGOS[keyFor(make)]
  if (!src) {
    return (
      <span className={`brand-mark ${className}`}>{String(make || '?').slice(0, 2).toUpperCase()}</span>
    )
  }
  return <img src={src} alt={make} className={`brand-logo-img ${className}`} style={{ width: size, height: size }} loading="lazy" />
}
