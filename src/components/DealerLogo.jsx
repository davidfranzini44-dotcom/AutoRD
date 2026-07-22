import { useEffect, useState } from 'react'

function initialsOf(name) {
  return String(name || '')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function DealerLogo({ dealer, className = '', style }) {
  const logoSrc = dealer?.logoUrl || dealer?.logo_url
  const [dead, setDead] = useState(false)
  const name = dealer?.name || 'Dealer'
  const initials = dealer?.initials || initialsOf(name)
  const logo = logoSrc && !dead

  useEffect(() => {
    setDead(false)
  }, [logoSrc])

  return (
    <div className={`dealer-mark dealer-logo-mark ${logo ? 'has-logo' : ''} ${className}`} style={style}>
      {logo ? <img src={logoSrc} alt={`${name} logo`} loading="lazy" onError={() => setDead(true)} /> : initials}
    </div>
  )
}
