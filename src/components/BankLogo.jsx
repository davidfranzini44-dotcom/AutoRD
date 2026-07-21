import popular from '../assets/banks/popular.png'
import banreservas from '../assets/banks/banreservas.png'
import bhd from '../assets/banks/bhd.png'
import scotiabank from '../assets/banks/scotiabank.png'

// Real bank logos, bundled locally. Falls back to the colored-initials
// mark for any bank without a logo asset.
const LOGOS = { popular, banreservas, bhd, scotiabank }

export default function BankLogo({ slug, name, initials, color, size = 24 }) {
  const src = LOGOS[slug]
  if (!src) {
    return (
      <span className="bank-mark" style={{ width: size + 6, height: size + 6, fontSize: Math.max(9, size * 0.4), background: color || 'var(--navy-800)' }}>
        {initials || (name || slug || '?').slice(0, 2).toUpperCase()}
      </span>
    )
  }
  return <img src={src} alt={name || slug} className="bank-logo-img" style={{ height: size }} loading="lazy" />
}
