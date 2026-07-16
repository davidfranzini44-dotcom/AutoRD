import { useState } from 'react'

// Builds a stable real-photo URL for a vehicle; falls back to a clean SVG
// illustration if the image can't load (offline, blocked, etc).
function photoUrl(make, model, bodyType, seed) {
  const tags = [make, model, bodyType || 'car']
    .filter(Boolean).join(',').toLowerCase().replace(/\s+/g, '')
  const lock = Math.abs([...String(seed || make || 'x')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % 900 + 10
  return `https://loremflickr.com/640/440/${encodeURIComponent(tags)}?lock=${lock}`
}

export default function CarImage({ tone = '#4b5563', className = '', label, make, model, bodyType, seed, photo }) {
  const [failed, setFailed] = useState(false)
  const src = photo || (make ? photoUrl(make, model, bodyType, seed) : null)

  return (
    <div className={`vphoto ${className}`}>
      {src && !failed ? (
        <img src={src} alt={label || 'Vehículo'} className="vphoto-img" loading="lazy" onError={() => setFailed(true)} />
      ) : (
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
      )}
    </div>
  )
}
