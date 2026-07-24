import waLogo from '../assets/whatsapp.png'

// Official WhatsApp brand mark. Drop-in replacement for a generic message icon
// on any WhatsApp-branded surface (wa.me action buttons, WhatsApp channel
// headers, nav items). Accepts `size` like a lucide icon so it composes with
// existing `<Icon size={n} />` call sites.
export default function WhatsAppIcon({ size = 16, style, className, alt = '' }) {
  return (
    <img
      src={waLogo}
      alt={alt}
      aria-hidden={alt ? undefined : 'true'}
      width={size}
      height={size}
      className={className}
      draggable={false}
      style={{ display: 'inline-block', objectFit: 'contain', flex: 'none', verticalAlign: 'text-bottom', ...style }}
    />
  )
}
