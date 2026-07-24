import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ShieldCheck, Landmark, Loader2, Lock, Car, CheckCircle2, Clock, AlertTriangle,
  ChevronRight, FileText, Info, ArrowRight,
} from 'lucide-react'
import BankLogo from '../components/BankLogo'
import WhatsAppIcon from '../components/WhatsAppIcon'
import { fmtRD } from '../data/demo'
import { estimateMonthly } from '../data/finance'
import {
  getFinancingPreview, verifyFinancingCedula, startFinancingOtp, verifyFinancingOtp, getFinancingByToken,
} from '../data/api'

const STATUS = {
  oferta:        { label: 'Aprobada',       tone: 'green', kind: 'approved' },
  condicional:   { label: 'Aprobada con condiciones', tone: 'teal', kind: 'approved' },
  preaprobada:   { label: 'Pre-aprobada',   tone: 'teal',  kind: 'preapproved' },
  pendiente_docs:{ label: 'Faltan documentos', tone: 'amber', kind: 'docs' },
  en_evaluacion: { label: 'En evaluación',  tone: 'blue',  kind: 'evaluating' },
  rechazada:     { label: 'No aprobada',    tone: 'red',   kind: 'rejected' },
  pendiente:     { label: 'En revisión',    tone: 'blue',  kind: 'evaluating' },
}
const TONE = {
  green: { bg: '#dcfce7', fg: '#166534' }, teal: { bg: '#e6f5f1', fg: '#0f766e' },
  amber: { bg: '#fef3c7', fg: '#b45309' }, blue: { bg: '#dbeafe', fg: '#1d4ed8' },
  red: { bg: '#fee2e2', fg: '#b91c1c' },
}
const Pill = ({ s }) => { const m = STATUS[s] || STATUS.pendiente; const t = TONE[m.tone]; return <span className="chip" style={{ background: t.bg, color: t.fg, fontWeight: 700 }}>{m.label}</span> }
const fmtDay = (d) => { if (!d) return null; const s = String(d).length === 10 ? `${d}T12:00:00` : d; const dt = new Date(s); return Number.isFinite(dt.getTime()) ? dt.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }) : null }

export default function FinancingPublic() {
  const { token } = useParams()
  const [preview, setPreview] = useState(undefined) // undefined=loading, null=error
  const [step, setStep] = useState('cedula')        // cedula | otp | portal
  const [full, setFull] = useState(null)

  useEffect(() => {
    let alive = true
    getFinancingPreview(token).then((p) => {
      if (!alive) return
      if (!p || !p.found) { setPreview(null); return }
      setPreview(p)
      if (p.otpVerified) { setStep('portal'); loadFull() }
      else if (p.cedulaVerified) setStep('otp')
      else setStep('cedula')
    }).catch(() => alive && setPreview(null))
    return () => { alive = false }
  }, [token]) // eslint-disable-line

  async function loadFull() {
    const d = await getFinancingByToken(token)
    if (d && d.authorized) { setFull(d); setStep('portal') }
  }

  if (preview === undefined) return <Centered><Loader2 size={26} className="spin" /><p className="muted small" style={{ marginTop: 10 }}>Cargando tu financiamiento…</p></Centered>
  if (preview === null) return (
    <Centered>
      <div className="verify-ic" style={{ background: '#fee2e2', color: '#b91c1c' }}><AlertTriangle size={22} /></div>
      <h2 style={{ margin: '12px 0 4px', fontSize: 18 }}>Enlace no válido</h2>
      <p className="muted small">Este enlace expiró o no existe. Pídele a tu banco o dealer uno nuevo.</p>
      <Link to="/" className="btn btn-outline" style={{ marginTop: 16 }}>Ir a AutoRD</Link>
    </Centered>
  )
  if (preview.expired) return (
    <Centered>
      <div className="verify-ic" style={{ background: '#fef3c7', color: '#b45309' }}><Clock size={22} /></div>
      <h2 style={{ margin: '12px 0 4px', fontSize: 18 }}>Este enlace expiró</h2>
      <p className="muted small">Por seguridad los enlaces vencen. Pídele a tu banco o dealer un enlace nuevo.</p>
    </Centered>
  )

  return (
    <div className="cfp-page">
      <div className="cfp-shell">
        <header className="cfp-brand">
          <Link to="/" className="cfp-logo">AutoRD</Link>
          <span className="cfp-secure"><Lock size={12} /> Seguro</span>
        </header>

        {step === 'portal' && full
          ? <Portal full={full} token={token} />
          : <Verify preview={preview} step={step} setStep={setStep} token={token} onDone={loadFull} />}
      </div>
      <PortalStyles />
    </div>
  )
}

function Centered({ children }) {
  return <div className="cfp-page"><div className="cfp-shell" style={{ textAlign: 'center', paddingTop: 60 }}>{children}</div><PortalStyles /></div>
}

/* ---------------- Verification gate ---------------- */
function Verify({ preview, step, setStep, token, onDone }) {
  return (
    <>
      {/* Non-sensitive summary — safe to show before identity is confirmed */}
      <div className="card cfp-preview">
        <div className="row center gap-12">
          <BankLogo slug={preview.bankSlug} name={preview.bankName} initials={preview.bankInitials} color={preview.bankColor} size={38} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="strong">{preview.bankName || 'Tu banco'} actualizó tu solicitud</div>
            <div className="tiny muted">{preview.dealerName || 'AutoRD'}{preview.vehicle ? ` · ${preview.vehicle}` : ''}</div>
          </div>
          <Pill s={preview.status} />
        </div>
        <div className="cfp-locknote"><Lock size={13} /> Los detalles (montos, tasa, ofertas) se muestran solo después de confirmar tu identidad.</div>
      </div>

      {step === 'cedula' && <CedulaStep preview={preview} token={token} onOk={() => setStep('otp')} />}
      {step === 'otp' && <OtpStep preview={preview} token={token} onOk={onDone} />}

      <div className="cfp-alt">
        <span className="tiny muted">¿Ya tienes cuenta AutoRD?</span>
        <Link to="/ingresar" className="btn btn-ghost btn-sm">Ya tengo cuenta <ChevronRight size={15} /></Link>
      </div>
    </>
  )
}

function CedulaStep({ preview, token, onOk }) {
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const locked = preview.cedulaLocked
  const noCedula = !preview.hasCedulaOnFile

  async function submit(e) {
    e?.preventDefault()
    if (val.length !== 4) return
    setBusy(true); setErr('')
    const r = await verifyFinancingCedula(token, val)
    setBusy(false)
    if (r.ok) { onOk(); return }
    if (r.reason === 'locked') setErr('Demasiados intentos. Contacta a tu banco o dealer.')
    else if (r.reason === 'no_cedula_on_file') setErr('No podemos verificar por cédula aún. Escríbenos por WhatsApp.')
    else setErr(`Cédula incorrecta.${r.attemptsLeft != null ? ` Te quedan ${r.attemptsLeft} intentos.` : ''}`)
  }

  return (
    <form className="card cfp-step" onSubmit={submit}>
      <div className="cfp-step-ic"><ShieldCheck size={20} /></div>
      <h2 className="cfp-step-title">Confirma tu identidad</h2>
      <p className="tiny muted" style={{ marginBottom: 14 }}>Ingresa los <b>últimos 4 dígitos de tu cédula</b> para continuar.</p>
      <input
        className="input cfp-code" inputMode="numeric" autoComplete="off" placeholder="0000"
        value={val} maxLength={4} disabled={locked || noCedula}
        onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
      />
      {err && <div className="cfp-err">{err}</div>}
      <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 14 }} disabled={busy || val.length !== 4 || locked || noCedula}>
        {busy ? <><Loader2 size={18} className="spin" /> Verificando…</> : <>Continuar <ArrowRight size={17} /></>}
      </button>
    </form>
  )
}

function OtpStep({ preview, token, onOk }) {
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [hint, setHint] = useState(preview.phoneHint)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function send() {
    setBusy(true); setErr('')
    const r = await startFinancingOtp(token)
    setBusy(false)
    if (r.ok) { setSent(true); if (r.phoneHint) setHint(r.phoneHint) }
    else if (r.reason === 'too_soon') setErr('Espera unos segundos antes de reenviar.')
    else if (r.reason === 'rate_limited') setErr('Demasiados envíos. Intenta de nuevo en un rato.')
    else if (r.reason === 'no_phone_on_file') setErr('No hay un WhatsApp registrado. Escríbenos para continuar.')
    else setErr('No pudimos enviar el código. Intenta de nuevo.')
  }

  async function verify(e) {
    e?.preventDefault()
    if (code.length !== 6) return
    setBusy(true); setErr('')
    const r = await verifyFinancingOtp(token, code)
    setBusy(false)
    if (r.ok) { onOk(); return }
    if (r.reason === 'too_many_attempts') setErr('Demasiados intentos. Reenvía un código nuevo.')
    else if (r.reason === 'no_code') setErr('El código venció. Reenvía uno nuevo.')
    else setErr(`Código incorrecto.${r.attemptsLeft != null ? ` Te quedan ${r.attemptsLeft} intentos.` : ''}`)
  }

  return (
    <form className="card cfp-step" onSubmit={verify}>
      <div className="cfp-step-ic" style={{ background: '#e6f5f1', color: '#0f766e' }}><WhatsAppIcon size={20} /></div>
      <h2 className="cfp-step-title">Código por WhatsApp</h2>
      {!sent ? (
        <>
          <p className="tiny muted" style={{ marginBottom: 14 }}>Te enviaremos un código al WhatsApp que termina en <b>••{hint}</b>.</p>
          {err && <div className="cfp-err">{err}</div>}
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={send} disabled={busy}>
            {busy ? <><Loader2 size={18} className="spin" /> Enviando…</> : <>Enviarme el código</>}
          </button>
        </>
      ) : (
        <>
          <p className="tiny muted" style={{ marginBottom: 14 }}>Ingresa el código de 6 dígitos que enviamos a <b>••{hint}</b>.</p>
          <input className="input cfp-code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000"
            value={code} maxLength={6} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />
          {err && <div className="cfp-err">{err}</div>}
          <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 14 }} disabled={busy || code.length !== 6}>
            {busy ? <><Loader2 size={18} className="spin" /> Verificando…</> : <>Ver mi financiamiento <ArrowRight size={17} /></>}
          </button>
          <button type="button" className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 6 }} onClick={send} disabled={busy}>Reenviar código</button>
        </>
      )}
    </form>
  )
}

/* ---------------- Read-only portal (after verification) ---------------- */
function Portal({ full }) {
  const best = useMemo(() => {
    const order = { oferta: 5, condicional: 4, preaprobada: 3, pendiente_docs: 2, en_evaluacion: 1, pendiente: 0, rechazada: -1 }
    return [...(full.responses || [])].sort((a, b) => (order[b.status] ?? 0) - (order[a.status] ?? 0))[0] || null
  }, [full])
  const ceiling = Math.max(0, ...(full.responses || []).map((r) => Number(r.approvedAmount) || 0))
  const kind = best ? (STATUS[best.status]?.kind || 'evaluating') : 'evaluating'
  const monthly = best?.monthly || (ceiling ? estimateMonthly(ceiling, best?.apr || 12, (best?.term || full.term || 7) * 12) : null)
  const waText = encodeURIComponent(`Hola, soy ${full.customerName || 'un cliente'} (solicitud ${full.code}). Tengo una consulta sobre mi financiamiento${best ? ` con ${best.bankName}` : ''}${full.vehicle ? ` del ${full.vehicle.make} ${full.vehicle.model}` : ''}.`)

  return (
    <>
      {/* Approval Wallet */}
      <div className={`card cfp-wallet cfp-${kind}`}>
        <div className="row between center">
          <span className="cfp-wallet-eyebrow">{kind === 'approved' ? 'Financiamiento aprobado' : kind === 'preapproved' ? 'Financiamiento pre-aprobado' : kind === 'docs' ? 'Acción requerida' : kind === 'rejected' ? 'Solicitud' : 'En proceso'}</span>
          {best && <Pill s={best.status} />}
        </div>
        {kind === 'preapproved' || kind === 'approved' ? (
          <>
            <div className="cfp-wallet-amount">{fmtRD(ceiling || full.requestedAmount || 0)}</div>
            <div className="cfp-wallet-sub">{kind === 'approved' ? 'Monto aprobado' : 'Monto máximo pre-aprobado'}</div>
            <div className="cfp-wallet-grid">
              {monthly ? <Fact k="Cuota estimada" v={`${fmtRD(Math.round(monthly))}/mes`} /> : null}
              {best?.apr ? <Fact k="Tasa" v={`${best.apr}%`} /> : null}
              {best?.term ? <Fact k="Plazo" v={`${best.term} años`} /> : null}
              {best?.down ? <Fact k="Inicial" v={fmtRD(best.down)} /> : null}
              {best?.validUntil ? <Fact k="Vigencia" v={`Hasta ${fmtDay(best.validUntil)}`} /> : null}
              <Fact k="Banco" v={best?.bankName || '—'} />
            </div>
            {kind === 'preapproved' && (
              <div className="cfp-condition"><Info size={13} /> Esta pre-aprobación está sujeta a validación final de documentos, seguro, contrato y políticas del banco.</div>
            )}
          </>
        ) : kind === 'docs' ? (
          <>
            <div className="cfp-wallet-amount" style={{ fontSize: 22 }}>Faltan documentos para continuar</div>
            <div className="cfp-wallet-sub">{best?.bankName} necesita más información para avanzar.</div>
          </>
        ) : kind === 'rejected' ? (
          <>
            <div className="cfp-wallet-amount" style={{ fontSize: 22 }}>No pudimos aprobar esta solicitud</div>
            <div className="cfp-wallet-sub">Puedes intentar con otro vehículo o hablar con tu dealer.</div>
          </>
        ) : (
          <>
            <div className="cfp-wallet-amount" style={{ fontSize: 22 }}>Tu solicitud está en evaluación</div>
            <div className="cfp-wallet-sub">Te avisaremos por WhatsApp cuando el banco responda.</div>
          </>
        )}
        {full.vehicle && <div className="cfp-wallet-veh"><Car size={14} /> {full.vehicle.make} {full.vehicle.model} {full.vehicle.year} · {full.vehicle.dealer}</div>}
      </div>

      {/* Primary actions */}
      <div className="cfp-actions">
        {(kind === 'preapproved') && ceiling > 0 && (
          <Link to={`/buscar?precioMax=${ceiling}`} className="btn btn-primary btn-block"><Car size={16} /> Ver vehículos elegibles</Link>
        )}
        {kind === 'approved' && full.vehicle && (
          <Link to={`/vehiculo/${full.vehicle.slug || full.vehicle.id}`} className="btn btn-primary btn-block">Continuar con la compra <ChevronRight size={16} /></Link>
        )}
        <a className="btn btn-block" style={{ background: '#25D366', color: '#fff', border: 'none' }} href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} /> Preguntar por WhatsApp</a>
      </div>

      {/* Next steps */}
      <Section title="Próximos pasos">
        <NextSteps kind={kind} hasVehicle={!!full.vehicle} />
      </Section>

      {/* Bank offers */}
      {(full.responses || []).filter((r) => r.status !== 'pendiente').length > 0 && (
        <Section title="Ofertas de los bancos">
          <div className="col gap-8">
            {full.responses.filter((r) => r.status !== 'pendiente').map((r, i) => (
              <div className="cfp-offer" key={i}>
                <div className="row center gap-10" style={{ minWidth: 0 }}>
                  <BankLogo slug={r.bankSlug} name={r.bankName} initials={r.bankInitials} color={r.bankColor} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div className="strong small">{r.bankName}</div>
                    <div className="tiny muted">{r.apr ? `${r.apr}%` : '—'}{r.monthly ? ` · ${fmtRD(Math.round(r.monthly))}/mes` : ''}{r.term ? ` · ${r.term} años` : ''}</div>
                  </div>
                </div>
                <div className="row center gap-8">
                  {r.approvedAmount ? <span className="tiny strong" style={{ color: 'var(--teal-800)' }}>{fmtRD(r.approvedAmount)}</span> : null}
                  <Pill s={r.status} />
                </div>
              </div>
            ))}
          </div>
          <div className="tiny muted" style={{ marginTop: 8 }}>Aceptar una oferta y coordinar la firma estará disponible muy pronto.</div>
        </Section>
      )}

      {/* Documents (read-only in this phase) */}
      {kind === 'docs' && (
        <Section title="Documentos">
          <div className="cfp-doc"><span className="cfp-doc-ic warn"><AlertTriangle size={14} /></span><div><div className="small strong">El banco solicitó documentos</div><div className="tiny muted">Envíalos por WhatsApp para avanzar. La carga desde aquí llega muy pronto.</div></div></div>
        </Section>
      )}

      <div className="cfp-foot">
        <ShieldCheck size={13} /> Verificado por AutoRD · Solicitud {full.code}
      </div>
    </>
  )
}

function NextSteps({ kind, hasVehicle }) {
  const steps = [
    { t: 'Pre-aprobación', who: 'Banco', done: true },
    { t: 'Elegir vehículo', who: 'Cliente', done: hasVehicle },
    { t: 'Validar documentos', who: 'Cliente + Banco', done: kind === 'approved' },
    { t: 'Seguro', who: 'Cliente', done: false },
    { t: 'Firma del contrato', who: 'Banco + Cliente', done: false },
    { t: 'Entrega', who: 'Dealer', done: false },
  ]
  const current = steps.findIndex((s) => !s.done)
  return (
    <div className="cfp-timeline">
      {steps.map((s, i) => (
        <div className="cfp-tl-row" key={i}>
          <span className={`cfp-tl-dot ${s.done ? 'done' : i === current ? 'now' : ''}`}>{s.done ? <CheckCircle2 size={14} /> : i + 1}</span>
          <div className="grow"><div className="small strong">{s.t}</div><div className="tiny muted">{s.who}</div></div>
          {i === current && <span className="chip" style={{ background: '#dbeafe', color: '#1d4ed8' }}>Ahora</span>}
        </div>
      ))}
    </div>
  )
}

const Fact = ({ k, v }) => <div className="cfp-fact"><span>{k}</span><b>{v}</b></div>
const Section = ({ title, children }) => <div className="cfp-section"><h3>{title}</h3>{children}</div>

function PortalStyles() {
  return (
    <style>{`
      .cfp-page { min-height: 100dvh; background: linear-gradient(180deg,#eef3f6,#f6f9fb 220px); padding: 16px 14px 40px; }
      .cfp-shell { max-width: 520px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
      .cfp-brand { display: flex; align-items: center; justify-content: space-between; padding: 2px 2px 4px; }
      .cfp-logo { font-weight: 800; font-size: 18px; letter-spacing: -.02em; color: var(--navy-800, #12233f); }
      .cfp-secure { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: var(--teal-700,#0f766e); background: #e6f5f1; padding: 4px 9px; border-radius: 999px; }
      .cfp-preview { padding: 14px 15px; }
      .cfp-locknote { display: flex; align-items: flex-start; gap: 6px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line-2,#eef2f4); font-size: 11.5px; color: var(--muted,#64748b); line-height: 1.4; }
      .cfp-step { padding: 20px 18px; text-align: center; }
      .cfp-step-ic { width: 44px; height: 44px; border-radius: 12px; background: #eaf0fb; color: #1d4ed8; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; }
      .cfp-step-title { font-size: 18px; margin: 0 0 6px; }
      .cfp-code { text-align: center; font-size: 26px; font-weight: 800; letter-spacing: .3em; padding: 12px; height: auto; }
      .cfp-err { color: #b91c1c; font-size: 12.5px; font-weight: 600; margin-top: 10px; }
      .cfp-alt { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 4px; }
      .cfp-wallet { padding: 18px; color: #fff; border: none; background: linear-gradient(135deg,#10233f,#0f766e); box-shadow: 0 14px 32px rgba(16,41,63,.18); }
      .cfp-wallet.cfp-preapproved { background: linear-gradient(135deg,#10233f, var(--bank-accent,#0f766e)); }
      .cfp-wallet.cfp-approved { background: linear-gradient(135deg,#0b3b2e,#16a34a); }
      .cfp-wallet.cfp-docs { background: linear-gradient(135deg,#7a4d0b,#d69028); }
      .cfp-wallet.cfp-rejected { background: linear-gradient(135deg,#3f1113,#b91c1c); }
      .cfp-wallet.cfp-evaluating { background: linear-gradient(135deg,#10233f,#2563eb); }
      .cfp-wallet .chip { background: rgba(255,255,255,.9) !important; }
      .cfp-wallet-eyebrow { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; opacity: .85; }
      .cfp-wallet-amount { font-size: 34px; font-weight: 800; letter-spacing: -.02em; margin-top: 8px; line-height: 1.05; }
      .cfp-wallet-sub { font-size: 12.5px; opacity: .85; margin-top: 2px; }
      .cfp-wallet-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
      .cfp-fact { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.14); border-radius: 10px; padding: 8px 10px; }
      .cfp-fact span { display: block; font-size: 10.5px; opacity: .8; }
      .cfp-fact b { font-size: 14px; }
      .cfp-condition { display: flex; align-items: flex-start; gap: 6px; margin-top: 14px; font-size: 11px; line-height: 1.45; background: rgba(255,255,255,.12); padding: 9px 11px; border-radius: 9px; }
      .cfp-wallet-veh { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; font-size: 12px; font-weight: 600; opacity: .95; }
      .cfp-actions { display: flex; flex-direction: column; gap: 8px; }
      .cfp-section { background: #fff; border: 1px solid var(--line,#e2e8f0); border-radius: 14px; padding: 15px; box-shadow: var(--shadow-sm, 0 1px 2px rgba(16,41,63,.05)); }
      .cfp-section h3 { font-size: 14px; margin: 0 0 12px; }
      .cfp-timeline { display: flex; flex-direction: column; gap: 2px; }
      .cfp-tl-row { display: flex; align-items: center; gap: 11px; padding: 7px 0; }
      .cfp-tl-dot { width: 26px; height: 26px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; background: #eef2f4; color: #94a3b8; border: 1.5px solid #e2e8f0; }
      .cfp-tl-dot.done { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
      .cfp-tl-dot.now { background: #dbeafe; color: #1d4ed8; border-color: #bfdbfe; }
      .cfp-offer { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--line-2,#eef2f4); border-radius: 11px; }
      .cfp-doc { display: flex; align-items: flex-start; gap: 10px; }
      .cfp-doc-ic { width: 26px; height: 26px; border-radius: 8px; flex: none; display: inline-flex; align-items: center; justify-content: center; }
      .cfp-doc-ic.warn { background: #fef3c7; color: #b45309; }
      .cfp-foot { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11.5px; color: var(--muted,#64748b); padding: 8px 0 4px; }
    `}</style>
  )
}
