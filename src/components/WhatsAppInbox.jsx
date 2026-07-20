import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageCircle, QrCode, Smartphone, ShieldCheck, Loader2, Power, Send, Info, ArrowLeft, RefreshCw,
} from 'lucide-react'
import { ibStatus, ibLink, ibPair, ibDisconnect, ibConversations, ibMessages, ibSend } from '../data/api'

const STATUS = {
  connected:    { label: 'Conectado',         cls: 'chip-green' },
  connecting:   { label: 'Conectando…',       cls: 'chip-navy' },
  qr:           { label: 'Esperando escaneo', cls: 'chip-navy' },
  pairing:      { label: 'Esperando código',  cls: 'chip-navy' },
  logout:       { label: 'Desconectando…',    cls: '' },
  disconnected: { label: 'Desconectado',      cls: '' },
}
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

export default function WhatsAppInbox() {
  const [conn, setConn] = useState(null)
  const [convs, setConvs] = useState([])
  const [active, setActive] = useState(null) // conversation object
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const timers = useRef([])
  const scrollRef = useRef(null)

  const loadStatus = useCallback(async () => { try { setConn(await ibStatus()) } catch (e) { setNote(e.message || String(e)) } }, [])
  const loadConvs = useCallback(async () => { try { setConvs(await ibConversations()) } catch {} }, [])
  const loadMsgs = useCallback(async (id) => { try { const m = await ibMessages(id); setMsgs(m) } catch {} }, [])

  useEffect(() => {
    loadStatus(); loadConvs()
    timers.current.push(setInterval(loadStatus, 4000))
    timers.current.push(setInterval(loadConvs, 5000))
    return () => { timers.current.forEach(clearInterval); timers.current = [] }
  }, [loadStatus, loadConvs])

  // Poll the open conversation's messages.
  useEffect(() => {
    if (!active) return
    loadMsgs(active.id)
    const t = setInterval(() => loadMsgs(active.id), 3000)
    return () => clearInterval(t)
  }, [active, loadMsgs])

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [msgs])

  const run = (fn) => async () => { setBusy(true); setNote(''); try { await fn(); await loadStatus() } catch (e) { setNote(e.message || String(e)) } finally { setBusy(false) } }
  const linkQr = run(() => ibLink())
  const startPair = run(() => { if (!phone.trim()) throw new Error('Ingresa el número'); return ibPair(phone) })
  const disconnect = run(() => ibDisconnect())

  const send = async () => {
    const b = text.trim()
    if (!b || !active) return
    setText('')
    // optimistic
    setMsgs((m) => [...m, { id: 'tmp' + Date.now(), direction: 'out', body: b, status: 'queued', created_at: new Date().toISOString() }])
    try { await ibSend(active.id, b); loadMsgs(active.id) } catch (e) { setNote(e.message || String(e)) }
  }

  const status = conn?.status || 'disconnected'
  const meta = STATUS[status] || STATUS.disconnected
  const connected = status === 'connected'

  return (
    <div className="wa">
      <div className="row between center" style={{ marginBottom: 12 }}>
        <div className="row center gap-8"><MessageCircle size={20} /><h1 style={{ fontSize: 20 }}>WhatsApp</h1></div>
        <span className={`chip ${meta.cls}`}>{meta.label}</span>
      </div>

      {/* Connection */}
      {connected ? (
        <div className="row between center wa-connbar">
          <span className="small"><ShieldCheck size={15} style={{ verticalAlign: -3, color: 'var(--green)' }} /> Conectado como <strong>{conn.phone_number ? `+${conn.phone_number}` : '—'}</strong></span>
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={disconnect}><Power size={14} /> Desconectar</button>
        </div>
      ) : (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <p className="muted small" style={{ marginBottom: 12 }}>Vincula tu WhatsApp para chatear con tus clientes desde aquí.</p>
          {status === 'qr' && conn?.qr ? (
            <div className="col center" style={{ alignItems: 'center', textAlign: 'center' }}>
              <img src={conn.qr} alt="Código QR" style={{ width: 240, height: 240, borderRadius: 12, border: '1px solid var(--line)' }} />
              <div className="tiny muted" style={{ marginTop: 8 }}>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</div>
            </div>
          ) : status === 'pairing' && conn?.pairing_code ? (
            <div className="col center" style={{ alignItems: 'center', textAlign: 'center' }}>
              <div className="tiny muted">Ingresa este código en WhatsApp → Dispositivos vinculados → Vincular con número</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 6, marginTop: 6 }}>{conn.pairing_code}</div>
            </div>
          ) : (
            <div className="col gap-12">
              <button className="btn btn-navy btn-lg" disabled={busy} onClick={linkQr}>{busy ? <Loader2 size={18} className="spin" /> : <QrCode size={18} />} Conectar por QR</button>
              <div className="field">
                <label>O vincular con tu número (sin QR)</label>
                <div className="row gap-8">
                  <input className="input" placeholder="1 809 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  <button className="btn btn-outline" disabled={busy} onClick={startPair}><Smartphone size={15} /> Obtener código</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {note && <div className="notice" style={{ marginBottom: 12 }}><Info size={16} /><span>{note}</span></div>}

      {/* Inbox */}
      {connected && (
        <div className={`wa-inbox ${active ? 'has-active' : ''}`}>
          <aside className="wa-list">
            <div className="row between center" style={{ padding: '4px 6px 8px' }}>
              <span className="tiny muted">{convs.length} conversaciones</span>
              <button className="icon-btn" onClick={loadConvs} title="Actualizar"><RefreshCw size={15} /></button>
            </div>
            {convs.length === 0 ? (
              <div className="muted small" style={{ padding: 10 }}>Aún no hay conversaciones. Cuando un cliente te escriba a este número, aparecerá aquí.</div>
            ) : convs.map((c) => (
              <button key={c.id} className={`wa-conv ${active?.id === c.id ? 'active' : ''}`} onClick={() => setActive(c)}>
                <div className="wa-avatar">{(c.wa_name || c.wa_phone || '?').slice(0, 1).toUpperCase()}</div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row between"><span className="strong small ellipsis">{c.wa_name || `+${c.wa_phone}`}</span><span className="tiny muted">{fmtTime(c.last_message_at)}</span></div>
                  <div className="tiny muted ellipsis">{c.last_direction === 'out' ? 'Tú: ' : ''}{c.last_text || ''}</div>
                </div>
                {c.unread > 0 && <span className="wa-unread">{c.unread}</span>}
              </button>
            ))}
          </aside>

          <section className="wa-chat">
            {!active ? (
              <div className="wa-empty muted small">Elige una conversación</div>
            ) : (
              <>
                <div className="wa-chat-head">
                  <button className="icon-btn show-mobile" onClick={() => setActive(null)}><ArrowLeft size={18} /></button>
                  <div className="wa-avatar sm">{(active.wa_name || active.wa_phone || '?').slice(0, 1).toUpperCase()}</div>
                  <div><div className="strong small">{active.wa_name || `+${active.wa_phone}`}</div><div className="tiny muted">+{active.wa_phone}</div></div>
                </div>
                <div className="wa-msgs" ref={scrollRef}>
                  {msgs.map((m) => (
                    <div key={m.id} className={`wa-bubble ${m.direction === 'out' ? 'out' : 'in'}`}>
                      <div>{m.body}</div>
                      <div className="wa-meta">{fmtTime(m.created_at)}{m.direction === 'out' ? ` · ${m.status === 'sent' ? '✓' : m.status === 'failed' ? '⚠' : '…'}` : ''}</div>
                    </div>
                  ))}
                </div>
                <div className="wa-compose">
                  <input className="input" placeholder="Escribe un mensaje…" value={text}
                    onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }} />
                  <button className="btn btn-primary" onClick={send} disabled={!text.trim()}><Send size={16} /></button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
