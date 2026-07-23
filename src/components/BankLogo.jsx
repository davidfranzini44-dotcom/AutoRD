// Real bank logos, bundled from src/assets/banks/<slug>.png. Any PNG dropped in
// that folder is auto-wired by its filename (which must equal the bank slug),
// so adding a new bank logo needs no code change. Falls back to a colored
// initials mark for any bank without a logo asset.
const files = import.meta.glob('../assets/banks/*.png', { eager: true, import: 'default' })
const LOGOS = {}
for (const path in files) {
  const key = path.split('/').pop().replace(/\.png$/i, '').toLowerCase()
  LOGOS[key] = files[path]
}

export default function BankLogo({ slug, name, initials, color, size = 24 }) {
  const src = slug ? LOGOS[String(slug).toLowerCase()] : null
  if (!src) {
    return (
      <span className="bank-mark" style={{ width: size + 6, height: size + 6, fontSize: Math.max(9, size * 0.4), background: color || 'var(--navy-800)' }}>
        {initials || (name || slug || '?').slice(0, 2).toUpperCase()}
      </span>
    )
  }
  return <img src={src} alt={name || slug} className="bank-logo-img" style={{ height: size }} loading="lazy" />
}
