import { useState } from 'react'
import { MessageCircle, X, Loader2, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { startDealerChat } from '../data/api'
import { fmtRD } from '../data/demo'

// Buyer -> dealer chat launcher. Opens a small modal to send a first message
// about a specific car; the message lands in the dealer's WhatsApp inbox and
// they reply from there (delivered to the buyer's WhatsApp by the worker).
export default function ContactDealer({ vehicle, triggerClass = 'link-teal', triggerLabel = 'Contactar', block = false }) {
  const { user, profile, configured, signInAnon } = useAuth() || {}
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const dealer = vehicle?.dealer || 'el dealer'
  const defaultMsg = `Hola, me interesa el ${vehicle.make} ${vehicle.model} ${vehicle.year} (${fmtRD(vehicle.price)}) que vi en AutoRD. ¿Sigue disponible?`

  const openModal = () => {
    setPhone(profile?.phone || '')
    setText(defaultMsg)
    setErr(''); setDone(false); setBusy(false); setOpen(true)
  }
  const close = () => setOpen(false)

  const send = async () => {
    const digits = (phone || '').replace(/[^0-9]/g, '')
    if (digits.length < 10) { setErr('Ingresa tu WhatsApp con código de país (ej: 1809…).'); return }
    if (!text.trim()) { setErr('Escribe un mensaje para el dealer.'); return }
    setBusy(true); setErr('')
    try {
      if (configured && !user) await signInAnon() // account-less: chat still works
      const r = await startDealerChat({ vehicleSlug: vehicle.id, phone: digits, name: profile?.full_name || '', text: text.trim() })
      if (r.ok) setDone(true)
      else setErr(
        r.error === 'invalid_phone' ? 'Número de WhatsApp inválido.'
          : r.error === 'dealer_not_found' ? 'No pudimos ubicar a este dealer.'
            : 'No se pudo enviar el mensaje. Intenta de nuevo.')
    } catch (_) {
      setErr('No se pudo enviar el mensaje. Intenta de nuevo.')
    } finally { setBusy(false) }
  }

  return (
    <>
      <button type="button" className={triggerClass} onClick={openModal} style={block ? { width: '100%' } : undefined}>
        <MessageCircle size={block ? 16 : 15} /> {triggerLabel}
      </button>

      {open && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(12,32,51,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card card-pad" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%' }}>
            <div className="row between center" style={{ marginBottom: 12 }}>
              <div className="row center gap-8">
                <div className="verify-ic" style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--green-bg)', color: 'var(--green)' }}><MessageCircle size={18} /></div>
                <div>
                  <div className="strong">Contactar a {dealer}</div>
                  <div className="tiny muted">{vehicle.make} {vehicle.model} {vehicle.year}</div>
                </div>
              </div>
              <button className="icon-btn" onClick={close} aria-label="Cerrar" style={{ background: 'none', border: 0, cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {done ? (
              <div className="col gap-10" style={{ alignItems: 'center', textAlign: 'center', padding: '10px 0 4px' }}>
                <div className="verify-ic ok" style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--green-bg)', color: 'var(--green)' }}><Check size={24} strokeWidth={3} /></div>
                <div className="strong">Mensaje enviado a {dealer}</div>
                <p className="tiny muted" style={{ maxWidth: 320 }}>Te responderán por WhatsApp al número que indicaste. Puedes cerrar esta ventana.</p>
                <button className="btn btn-primary btn-block" onClick={close}>Entendido</button>
              </div>
            ) : (
              <>
                <div className="field">
                  <label>Tu WhatsApp</label>
                  <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="1809 000 0000" inputMode="numeric" />
                  <span className="help">Con código de país. El dealer te responderá aquí.</span>
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label>Mensaje</label>
                  <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} style={{ resize: 'vertical', minHeight: 76 }} />
                </div>
                {err && <div className="tiny" style={{ color: 'var(--red)', marginTop: 8 }}>{err}</div>}
                <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 14, background: '#25D366', borderColor: '#25D366' }} disabled={busy} onClick={send}>
                  {busy ? <Loader2 size={18} className="spin" /> : <MessageCircle size={18} />} Enviar por WhatsApp
                </button>
                <p className="tiny muted" style={{ textAlign: 'center', marginTop: 10 }}>AutoRD envía tu mensaje al dealer. No compartimos tu número con terceros.</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
