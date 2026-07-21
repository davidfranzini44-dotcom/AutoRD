import { MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fmtRD } from '../data/demo'

// Normalize a DR number for wa.me (digits only, ensure the +1 country code).
function waDigits(s) {
  let d = String(s || '').replace(/[^0-9]/g, '')
  if (!d) return ''
  if (d.length === 10 && /^[89]/.test(d)) d = '1' + d // 809/829/849 local -> +1
  return d
}

// "Contactar a <dealer>" — opens WhatsApp straight to the dealer's number with a
// message about this specific car. If the dealer captured this number in the
// AutoRD inbox (worker linked), the message also shows up there.
export default function ContactDealer({ vehicle, triggerClass = 'btn btn-outline', triggerLabel, block = false }) {
  const dealer = vehicle?.dealer || 'el dealer'
  const num = waDigits(vehicle?.dealerWhatsapp || vehicle?.dealerPhone)
  const label = triggerLabel || `Contactar a ${dealer}`
  const style = block ? { width: '100%' } : undefined
  const msg = `Hola ${dealer}, me interesa el ${vehicle.make} ${vehicle.model} ${vehicle.year} (${fmtRD(vehicle.price)}) que vi en AutoRD. ¿Sigue disponible?`

  if (num) {
    const href = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
    // Always render as a clearly-WhatsApp (green) button, whatever the caller class.
    return (
      <a className={triggerClass} href={href} target="_blank" rel="noreferrer"
        style={{ ...style, background: '#25D366', borderColor: '#25D366', color: '#fff' }}>
        <MessageCircle size={block ? 16 : 15} /> {label}
      </a>
    )
  }
  // No WhatsApp on file — fall back to the dealer's profile.
  if (vehicle?.dealerSlug) {
    return (
      <Link className={triggerClass} to={`/dealers/${vehicle.dealerSlug}`} style={style}>
        <MessageCircle size={block ? 16 : 15} /> {label}
      </Link>
    )
  }
  return null
}
