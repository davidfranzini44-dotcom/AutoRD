import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { QrCode, Smartphone, ShieldCheck, Loader2, Power, Send, Info, ArrowLeft } from 'lucide-react'
import { getWaStatus, waLinkQr, waStartPairing, waDisconnect, sendPhoneOtp } from '../data/api'

const STATUS_META = {
  connected:    { label: 'Conectado',          cls: 'chip-green' },
  connecting:   { label: 'Conectando…',        cls: 'chip-navy' },
  qr:           { label: 'Esperando escaneo',  cls: 'chip-navy' },
  pairing:      { label: 'Esperando código',   cls: 'chip-navy' },
  disconnected: { label: 'Desconectado',       cls: '' },
}

export default function AdminPanel() {
  const [wa, setWa] = useState(null)
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState('')
  const [testTo, setTestTo] = useState('')
  const [msg, setMsg] = useState('')
  const timer = useRef(null)

  const load = async () => { try { setWa(await getWaStatus()) } catch (e) { setMsg(e.message || String(e)) } }
  useEffect(() => { load(); timer.current = setInterval(load, 4000); return () => clearInterval(timer.current) }, [])

  const run = (fn) => async () => { setBusy(true); setMsg(''); try { await fn(); await load() } catch (e) { setMsg(e.message || String(e)) } finally { setBusy(false) } }
  const linkQr = run(() => waLinkQr())
  const startPair = run(() => { if (!phone.trim()) throw new Error('Ingresa el número'); return waStartPairing(phone) })
  const disconnect = run(() => waDisconnect())
  const testSend = async () => {
    setBusy(true); setMsg('')
    try { const r = await sendPhoneOtp(testTo); setMsg(r.ok ? `Código de prueba enviado a ${r.phone || testTo}` : `Error: ${r.error || 'no se pudo enviar'}`) }
    catch (e) { setMsg(e.message || String(e)) } finally { setBusy(false) }
  }

  const status = wa?.status || 'disconnected'
  const meta = STATUS_META[status] || STATUS_META.disconnected
  const connected = status === 'connected'
  // Heuristic: enabled but no recent heartbeat -> the worker probably isn't running.
  const stale = wa?.enabled && wa?.last_seen_at && (Date.now() - new Date(wa.last_seen_at).getTime() > 30000)

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 640 }}>
        <Link to="/" className="side-link" style={{ display: 'inline-flex', gap: 6, marginTop: 12 }}><ArrowLeft size={16} /> Volver al sitio</Link>

        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="row between center" style={{ marginBottom: 4 }}>
            <div className="row center gap-8">
              <div className="verify-ic ok" style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }}><ShieldCheck size={20} /></div>
              <h1 style={{ fontSize: 20 }}>WhatsApp del sistema</h1>
            </div>
            <span className={`chip ${meta.cls}`}>{meta.label}</span>
          </div>
          <p className="muted small" style={{ marginBottom: 16 }}>
            Vincula tu WhatsApp para enviar los códigos de verificación desde tu número — sin costos de SMS.
          </p>

          {stale && (
            <div className="notice" style={{ marginBottom: 14, borderColor: 'var(--amber-bd)', background: 'var(--amber-bg)' }}>
              <Info size={16} /><span>El worker de WhatsApp no está respondiendo. Asegúrate de que <code>autord-wa-worker</code> esté corriendo.</span>
            </div>
          )}
          {wa?.worker_error && <div className="notice" style={{ marginBottom: 14, borderColor: 'var(--red-bd)', background: 'var(--red-bg)' }}><Info size={16} /><span>{wa.worker_error}</span></div>}

          {connected ? (
            <div className="col gap-12">
              <div className="kyc-banner">
                <div className="ic"><ShieldCheck size={20} /></div>
                <div><div className="strong">Conectado como {wa.phone_number || '—'}</div><div className="tiny" style={{ color: 'var(--green)' }}>Los códigos se envían desde este número.</div></div>
              </div>
              <div className="field">
                <label>Enviar código de prueba</label>
                <div className="row gap-8">
                  <input className="input" placeholder="809-000-0000" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                  <button className="btn btn-primary" disabled={busy || !testTo} onClick={testSend}><Send size={15} /> Enviar</button>
                </div>
              </div>
              <button className="btn btn-outline" disabled={busy} onClick={disconnect}><Power size={15} /> Desconectar</button>
            </div>
          ) : (
            <div className="col gap-14">
              {/* QR mode */}
              {status === 'qr' && wa?.qr ? (
                <div className="col center" style={{ alignItems: 'center', textAlign: 'center' }}>
                  <img src={wa.qr} alt="Código QR de WhatsApp" style={{ width: 260, height: 260, borderRadius: 12, border: '1px solid var(--line)' }} />
                  <div className="tiny muted" style={{ marginTop: 8 }}>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</div>
                </div>
              ) : (
                <button className="btn btn-navy btn-lg" disabled={busy} onClick={linkQr}>
                  {busy ? <Loader2 size={18} className="spin" /> : <QrCode size={18} />} Conectar por QR
                </button>
              )}

              {/* Pairing-code mode */}
              {status === 'pairing' && wa?.pairing_code ? (
                <div className="col center" style={{ alignItems: 'center', textAlign: 'center' }}>
                  <div className="tiny muted">Ingresa este código en WhatsApp → Dispositivos vinculados → Vincular con número</div>
                  <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 6, marginTop: 6 }}>{wa.pairing_code}</div>
                </div>
              ) : (
                <div className="field">
                  <label>O vincular con tu número (sin QR)</label>
                  <div className="row gap-8">
                    <input className="input" placeholder="1 809 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    <button className="btn btn-outline" disabled={busy} onClick={startPair}><Smartphone size={15} /> Obtener código</button>
                  </div>
                  <span className="help">Incluye el código de país (RD = 1).</span>
                </div>
              )}
            </div>
          )}

          {msg && <div className="notice" style={{ marginTop: 14 }}><Info size={16} /><span>{msg}</span></div>}
        </div>

        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 12 }}>
          Requiere el worker <code>autord-wa-worker</code> corriendo 24/7.
        </p>
      </div>
    </main>
  )
}
