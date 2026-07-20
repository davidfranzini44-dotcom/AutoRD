import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { QrCode, Smartphone, ShieldCheck, Loader2, Power, Send, Info, ArrowLeft, History, KeyRound, Bell } from 'lucide-react'
import { getWaStatus, waLinkQr, waStartPairing, waDisconnect, sendPhoneOtp, checkWaGateway, getNotifications } from '../data/api'

const TYPE_META = {
  otp:           { label: 'OTP', icon: KeyRound },
  test:          { label: 'Prueba', icon: KeyRound },
  bank_response: { label: 'Banco respondió', icon: Bell },
  other:         { label: 'Notificación', icon: Bell },
}
const HIST_FILTERS = [{ label: 'Todos', val: null }, { label: 'OTP', val: 'otp' }, { label: 'Notificaciones', val: 'notif' }]
const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

const STATUS_META = {
  connected:    { label: 'Conectado',          cls: 'chip-green' },
  connecting:   { label: 'Conectando…',        cls: 'chip-navy' },
  qr:           { label: 'Esperando escaneo',  cls: 'chip-navy' },
  pairing:      { label: 'Esperando código',   cls: 'chip-navy' },
  disconnected: { label: 'Desconectado',       cls: '' },
}

export default function AdminPanel() {
  const [wa, setWa] = useState(null)
  const [gw, setGw] = useState(null) // gateway status (reuse Reparando's worker)
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState('')
  const [testTo, setTestTo] = useState('')
  const [msg, setMsg] = useState('')
  const [hist, setHist] = useState([])
  const [histKind, setHistKind] = useState(null) // null | 'otp' | 'notif'
  const timer = useRef(null)

  const loadHist = (k = histKind) => getNotifications(k).then(setHist).catch(() => {})
  useEffect(() => { loadHist() }, [histKind]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => { try { setWa(await getWaStatus()) } catch (e) { setMsg(e.message || String(e)) } }
  useEffect(() => {
    load(); checkWaGateway().then(setGw).catch(() => {})
    timer.current = setInterval(load, 4000)
    return () => clearInterval(timer.current)
  }, [])

  const run = (fn) => async () => { setBusy(true); setMsg(''); try { await fn(); await load() } catch (e) { setMsg(e.message || String(e)) } finally { setBusy(false) } }
  const linkQr = run(() => waLinkQr())
  const startPair = run(() => { if (!phone.trim()) throw new Error('Ingresa el número'); return waStartPairing(phone) })
  const disconnect = run(() => waDisconnect())
  const testSend = async () => {
    setBusy(true); setMsg('')
    try { const r = await sendPhoneOtp(testTo, 'test'); setMsg(r.ok ? `Código de prueba enviado a ${r.phone || testTo}` : `Error: ${r.error || 'no se pudo enviar'}`); loadHist() }
    catch (e) { setMsg(e.message || String(e)) } finally { setBusy(false) }
  }

  const status = wa?.status || 'disconnected'
  const meta = STATUS_META[status] || STATUS_META.disconnected
  const connected = status === 'connected'
  // Gateway mode: AutoRD reuses Reparando's running worker + linked number.
  // When active, the QR/pairing UI here is irrelevant.
  const gateway = gw?.mode === 'reparando'
  // Heuristic: enabled but no recent heartbeat -> the worker probably isn't running.
  const stale = !gateway && wa?.enabled && wa?.last_seen_at && (Date.now() - new Date(wa.last_seen_at).getTime() > 30000)

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
            <span className={`chip ${gateway ? 'chip-green' : meta.cls}`}>{gateway ? 'Conectado (Reparando)' : meta.label}</span>
          </div>
          <p className="muted small" style={{ marginBottom: 16 }}>
            {gateway
              ? 'Los códigos se envían por WhatsApp reutilizando tu conexión de Reparando — sin costos de SMS.'
              : 'Vincula tu WhatsApp para enviar los códigos de verificación desde tu número — sin costos de SMS.'}
          </p>

          {stale && (
            <div className="notice" style={{ marginBottom: 14, borderColor: 'var(--amber-bd)', background: 'var(--amber-bg)' }}>
              <Info size={16} /><span>El worker de WhatsApp no está respondiendo. Asegúrate de que <code>autord-wa-worker</code> esté corriendo.</span>
            </div>
          )}
          {wa?.worker_error && <div className="notice" style={{ marginBottom: 14, borderColor: 'var(--red-bd)', background: 'var(--red-bg)' }}><Info size={16} /><span>{wa.worker_error}</span></div>}

          {gateway ? (
            <div className="col gap-12">
              <div className="kyc-banner">
                <div className="ic"><ShieldCheck size={20} /></div>
                <div><div className="strong">Conectado vía Reparando</div><div className="tiny" style={{ color: 'var(--green)' }}>Los códigos se envían desde {gw.sender ? `+${gw.sender}` : 'tu número de Reparando'}. No necesitas vincular nada aquí.</div></div>
              </div>
              <div className="field">
                <label>Enviar código de prueba</label>
                <div className="row gap-8">
                  <input className="input" placeholder="809-000-0000" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                  <button className="btn btn-primary" disabled={busy || !testTo} onClick={testSend}><Send size={15} /> Enviar</button>
                </div>
              </div>
            </div>
          ) : connected ? (
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

        {/* History of sent WhatsApp messages */}
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <div className="row between center" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div className="row center gap-8"><History size={18} /><h2 style={{ fontSize: 16 }}>Historial de notificaciones</h2></div>
            <div className="row gap-8">
              {HIST_FILTERS.map((f) => (
                <button key={f.label} className={`btn btn-sm ${histKind === f.val ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setHistKind(f.val)}>{f.label}</button>
              ))}
            </div>
          </div>
          {hist.length === 0 ? (
            <div className="muted small">Sin notificaciones todavía.</div>
          ) : (
            <div className="col">
              {hist.map((h) => {
                const t = TYPE_META[h.type] || TYPE_META.other
                const TI = t.icon
                const ok = h.status === 'sent', fail = h.status === 'failed'
                return (
                  <div key={h.id} className="row between center" style={{ borderTop: '1px solid var(--line)', padding: '10px 0', gap: 10 }}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row center gap-8">
                        <span className="chip" style={{ fontSize: 11 }}><TI size={12} /> {t.label}</span>
                        <span className="small strong">+{h.to_phone}</span>
                      </div>
                      <div className="tiny muted" style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.body}</div>
                    </div>
                    <div className="col" style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                      <span className="chip" style={{ fontSize: 11, background: ok ? 'var(--green-bg)' : fail ? 'var(--red-bg)' : 'var(--line)', color: ok ? 'var(--green)' : fail ? 'var(--red)' : 'var(--muted)' }}>
                        {ok ? 'Enviado' : fail ? 'Falló' : 'En cola'}
                      </span>
                      <span className="tiny muted" style={{ marginTop: 3 }}>{fmtWhen(h.created_at)}{h.via ? ` · ${h.via}` : ''}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 12 }}>
          {gateway
            ? 'Modo gateway: usa el worker de Reparando. No requiere un worker de AutoRD.'
            : <>Requiere el worker <code>autord-wa-worker</code> corriendo 24/7.</>}
        </p>
      </div>
    </main>
  )
}
