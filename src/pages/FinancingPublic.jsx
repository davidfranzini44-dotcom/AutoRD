import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ShieldCheck, Landmark, Loader2, Lock, Car, CheckCircle2, Clock, AlertTriangle,
  ChevronRight, FileText, Info, ArrowRight, Upload, UserPlus,
} from 'lucide-react'
import BankLogo from '../components/BankLogo'
import WhatsAppIcon from '../components/WhatsAppIcon'
import { useAuth } from '../context/AuthContext'
import { fmtRD } from '../data/demo'
import { estimateMonthly } from '../data/finance'
import {
  getFinancingPreview, verifyFinancingCedula, startFinancingOtp, verifyFinancingOtp, getFinancingByToken,
  acceptFinancingOffer, activateFinancingAccount, getApplicationDocuments, uploadApplicationDocument,
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
          ? <Portal full={full} token={token} onReload={loadFull} />
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
function Portal({ full, token, onReload }) {
  const { user } = useAuth() || {}
  const [accepting, setAccepting] = useState(null)
  const [acceptErr, setAcceptErr] = useState('')
  const [activated, setActivated] = useState(false)
  const [activating, setActivating] = useState(false)
  const [activateErr, setActivateErr] = useState('')
  const accountReady = activated || !!user
  const accepted = !!full.clientAcceptedAt
  const selectedSlug = full.selectedBankSlug
  async function activate() {
    setActivating(true); setActivateErr('')
    const r = await activateFinancingAccount(token)
    setActivating(false)
    if (r && r.ok) setActivated(true)
    else setActivateErr('No pudimos activar tu cuenta. Puedes seguir usando este enlace.')
  }
  async function accept(bankSlug) {
    setAccepting(bankSlug); setAcceptErr('')
    const r = await acceptFinancingOffer(token, bankSlug)
    setAccepting(null)
    if (r && r.ok) onReload(); else setAcceptErr('No pudimos registrar tu aceptación. Intenta de nuevo.')
  }
  const best = useMemo(() => {
    const order = { oferta: 5, condicional: 4, preaprobada: 3, pendiente_docs: 2, en_evaluacion: 1, pendiente: 0, rechazada: -1 }
    return [...(full.responses || [])].sort((a, b) => (order[b.status] ?? 0) - (order[a.status] ?? 0))[0] || null
  }, [full])
  const ceiling = Math.max(0, ...(full.responses || []).map((r) => Number(r.approvedAmount) || 0))
  const kind = best ? (STATUS[best.status]?.kind || 'evaluating') : 'evaluating'
  const monthly = best?.monthly || (ceiling ? estimateMonthly(ceiling, best?.apr || 12, (best?.term || full.term || 7) * 12) : null)
  const waText = encodeURIComponent(`Hola, soy ${full.customerName || 'un cliente'} (solicitud ${full.code}). Tengo una consulta sobre mi financiamiento${best ? ` con ${best.bankName}` : ''}${full.vehicle ? ` del ${full.vehicle.make} ${full.vehicle.model}` : ''}.`)
  const waNumber = String(full.dealerWhatsapp || '').replace(/[^0-9]/g, '')
  const waHref = waNumber ? `https://wa.me/${waNumber}?text=${waText}` : `https://wa.me/?text=${waText}`

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

      {/* Acceptance confirmation */}
      {accepted && (
        <div className="cfp-accepted">
          <CheckCircle2 size={20} />
          <div>
            <div className="strong small">Aceptaste {selectedSlug ? `la oferta de ${(full.responses.find((r) => r.bankSlug === selectedSlug) || {}).bankName || 'tu banco'}` : 'tu oferta'}</div>
            <div className="tiny">El dealer y el banco fueron notificados. Te contactarán para completar seguro, firma y entrega.{full.reservedUntil ? ` Vehículo reservado hasta ${fmtDay(full.reservedUntil)}.` : ''}</div>
          </div>
        </div>
      )}

      {/* Primary actions */}
      <div className="cfp-actions">
        {!accepted && best && ['preaprobada', 'oferta', 'condicional'].includes(best.status) && (
          <button className="btn btn-primary btn-block" disabled={!!accepting} onClick={() => accept(best.bankSlug)}>
            {accepting ? <><Loader2 size={16} className="spin" /> Registrando…</> : <><CheckCircle2 size={16} /> {kind === 'approved' ? 'Aceptar esta oferta' : 'Aceptar pre-aprobación'}</>}
          </button>
        )}
        {acceptErr && <div className="cfp-err" style={{ textAlign: 'center' }}>{acceptErr}</div>}
        {(kind === 'preapproved') && ceiling > 0 && (
          <Link to={`/buscar?precioMax=${ceiling}`} className="btn btn-outline btn-block"><Car size={16} /> Ver vehículos elegibles</Link>
        )}
        {kind === 'approved' && full.vehicle && (
          <Link to={`/vehiculo/${full.vehicle.slug || full.vehicle.id}`} className="btn btn-outline btn-block">Continuar con la compra <ChevronRight size={16} /></Link>
        )}
        {/* Carries the portal token so the (already verified) customer can accept
            the terms without signing in again. */}
        {full.contractToken && (
          <Link to={`/contrato/${full.contractToken}?portal=${token}`} className="btn btn-outline btn-block">
            <FileText size={16} /> {full.termsAcceptedAt ? 'Ver contrato' : 'Ver y aceptar contrato'}
          </Link>
        )}
        <a className="btn btn-block" style={{ background: '#25D366', color: '#fff', border: 'none' }} href={waHref} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} /> Preguntar por WhatsApp</a>
      </div>

      {/* Next steps */}
      <Section title="Próximos pasos">
        <NextSteps kind={kind} hasVehicle={!!full.vehicle} hasApproval={ceiling > 0} />
      </Section>

      {/* Bank offers — accept one; it becomes the active offer */}
      {(full.responses || []).filter((r) => r.status !== 'pendiente').length > 0 && (
        <Section title="Ofertas de los bancos">
          <div className="col gap-8">
            {full.responses.filter((r) => r.status !== 'pendiente').map((r, i) => {
              const positive = ['preaprobada', 'oferta', 'condicional'].includes(r.status)
              const isSel = r.selected || r.bankSlug === selectedSlug
              return (
                <div className={`cfp-offer ${isSel ? 'sel' : ''}`} key={i}>
                  <div className="row between center" style={{ gap: 10 }}>
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
                  {positive && (isSel ? (
                    <div className="cfp-offer-sel"><CheckCircle2 size={13} /> Oferta seleccionada</div>
                  ) : !accepted ? (
                    <button className="btn btn-outline btn-sm cfp-offer-btn" disabled={!!accepting} onClick={() => accept(r.bankSlug)}>
                      {accepting === r.bankSlug ? <><Loader2 size={13} className="spin" /> …</> : 'Elegir esta oferta'}
                    </button>
                  ) : null)}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Financing calculator */}
      {ceiling > 0 && <CalcSection ceiling={ceiling} apr={best?.apr || 12} defTerm={best?.term || full.term || 7} defPrice={full.vehicle?.price || ceiling} />}

      {/* Activity timeline (audit) */}
      {(full.events || []).length > 0 && (
        <Section title="Actividad">
          <div className="cfp-activity">
            {full.events.map((e, i) => (
              <div className="cfp-act-row" key={i}>
                <span className={`cfp-act-dot ${e.kind}`} />
                <div className="grow">
                  <div className="small">{eventLabel(e)}</div>
                  <div className="tiny muted">{e.actor} · {fmtWhen(e.at)}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Documents — upload once the account is active */}
      <DocsSection applicationId={full.applicationId} accountReady={accountReady} kind={kind} onActivate={activate} activating={activating} />

      {/* Lightweight account activation */}
      {!accountReady ? (
        <div className="cfp-account">
          <div className="row center gap-10">
            <div className="cfp-step-ic" style={{ margin: 0, width: 38, height: 38, background: '#e6f5f1', color: '#0f766e' }}><UserPlus size={18} /></div>
            <div className="grow">
              <div className="strong small">Activa tu cuenta AutoRD</div>
              <div className="tiny muted">Para subir documentos y entrar con tu WhatsApp la próxima vez — sin contraseñas.</div>
            </div>
          </div>
          {activateErr && <div className="cfp-err" style={{ marginTop: 8 }}>{activateErr}</div>}
          <button className="btn btn-navy btn-block btn-sm" style={{ marginTop: 10 }} disabled={activating} onClick={activate}>
            {activating ? <><Loader2 size={15} className="spin" /> Activando…</> : <><UserPlus size={15} /> Activar mi cuenta</>}
          </button>
        </div>
      ) : activated ? (
        <div className="cfp-account ready">
          <CheckCircle2 size={18} />
          <div><div className="strong small">Tu cuenta AutoRD ya está lista</div><div className="tiny">La próxima vez puedes entrar con tu WhatsApp — sin contraseña.</div></div>
        </div>
      ) : null}

      <div className="cfp-foot">
        <ShieldCheck size={13} /> Verificado por AutoRD · Solicitud {full.code}
      </div>
    </>
  )
}

function NextSteps({ kind, hasVehicle, hasApproval }) {
  // Only the first three steps are things AutoRD can actually observe.
  //
  // "Pre-aprobación" was hardcoded to done, so it showed a green tick to people
  // with no approval at all. It now follows a real approved amount.
  //
  // Seguro / Firma / Entrega happen off-platform and nothing reports them back,
  // so they were hardcoded false and could never complete — a client who got a
  // car and an approval would watch the list stop moving forever. They are now
  // marked untracked and rendered as what they are: what happens next, arranged
  // with the bank and the dealer, not a checklist AutoRD is driving.
  //
  // The signature step especially: clause 3 of the consent contract says AutoRD
  // does not issue loan contracts or host credit signatures — the credit
  // relationship is formalised directly between client and bank. Showing it as
  // an AutoRD step would contradict a document the client already signed.
  const steps = [
    { t: 'Pre-aprobación', who: 'Banco', done: !!hasApproval, tracked: true },
    { t: 'Elegir vehículo', who: 'Cliente', done: hasVehicle, tracked: true },
    { t: 'Validar documentos', who: 'Cliente + Banco', done: kind === 'approved', tracked: true },
    { t: 'Seguro', who: 'Cliente', done: false, tracked: false },
    { t: 'Firma del contrato', who: 'Banco + Cliente', done: false, tracked: false },
    { t: 'Entrega', who: 'Dealer', done: false, tracked: false },
  ]
  // "Ahora" only ever points at something the client can actually move.
  const current = steps.findIndex((s) => s.tracked && !s.done)
  return (
    <div className="cfp-timeline">
      {steps.map((s, i) => (
        <div className={`cfp-tl-row${s.tracked ? '' : ' cfp-tl-off'}`} key={i}>
          <span className={`cfp-tl-dot ${s.done ? 'done' : i === current ? 'now' : ''}`}>{s.done ? <CheckCircle2 size={14} /> : i + 1}</span>
          <div className="grow"><div className="small strong">{s.t}</div><div className="tiny muted">{s.who}</div></div>
          {i === current && <span className="chip" style={{ background: '#dbeafe', color: '#1d4ed8' }}>Ahora</span>}
        </div>
      ))}
      {/* Says plainly that the last steps are arranged off-platform, so a list
          that stops moving reads as expected rather than as something broken. */}
      <div className="tiny muted cfp-tl-note">
        El seguro, la firma y la entrega se coordinan directamente con tu banco y el dealer.
      </div>
    </div>
  )
}

const Fact = ({ k, v }) => <div className="cfp-fact"><span>{k}</span><b>{v}</b></div>
const Section = ({ title, children }) => <div className="cfp-section"><h3>{title}</h3>{children}</div>

const fmtWhen = (at) => { const d = new Date(at); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : '' }
function eventLabel(e) {
  if (e.kind === 'verified') return 'Confirmaste tu identidad'
  if (e.kind === 'accepted') return `Aceptaste la oferta${e.detail ? ` de ${e.detail}` : ''}`
  if (e.kind === 'vehicle_linked') return 'Se vinculó un vehículo a tu solicitud'
  if (e.kind === 'bank_decision') return `Un banco respondió: ${STATUS[e.detail]?.label || e.detail}`
  return e.detail || e.kind
}

// Client-side "what fits" calculator — adjust price / inicial / plazo.
function CalcSection({ ceiling, apr, defTerm, defPrice }) {
  const [price, setPrice] = useState(defPrice)
  const [down, setDown] = useState(Math.min(defPrice, Math.round(defPrice * 0.2)))
  const [term, setTerm] = useState(defTerm)
  const financed = Math.max(0, price - down)
  const monthly = financed > 0 ? estimateMonthly(financed, apr, term * 12) : 0
  const fits = financed <= ceiling
  const needMoreDown = fits ? 0 : financed - ceiling
  return (
    <Section title="Calcula tu cuota">
      <div className="cfp-calc">
        <label className="cfp-calc-field">
          <span>Precio del vehículo</span>
          <input className="input" inputMode="numeric" value={price ? fmtRD(price).replace('RD$', '').trim() : ''}
            onChange={(e) => setPrice(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)} />
        </label>
        <label className="cfp-calc-field">
          <span>Inicial: <b>{fmtRD(down)}</b> ({price ? Math.round((down / price) * 100) : 0}%)</span>
          <input type="range" min={0} max={price} step={10000} value={down} onChange={(e) => setDown(Number(e.target.value))} />
        </label>
        <div className="cfp-calc-terms">
          {[4, 5, 6, 7, 8].map((y) => (
            <button key={y} type="button" className={`chip ${term === y ? 'chip-teal' : ''}`} style={{ cursor: 'pointer', border: term === y ? 'none' : '1px solid var(--line)' }} onClick={() => setTerm(y)}>{y} años</button>
          ))}
        </div>
      </div>
      <div className="cfp-calc-out">
        <div><span className="tiny muted">Cuota estimada</span><div className="cfp-calc-monthly">{monthly ? `${fmtRD(Math.round(monthly))}/mes` : '—'}</div></div>
        <div className={`cfp-calc-fit ${fits ? 'ok' : 'bad'}`}>
          {fits ? <><CheckCircle2 size={14} /> Dentro de tu aprobación</> : <><Info size={14} /> Necesitas {fmtRD(needMoreDown)} más de inicial</>}
        </div>
      </div>
      <div className="tiny muted" style={{ marginTop: 6 }}>Cálculo aproximado a {apr}% · financiando {fmtRD(financed)}. La cuota final la confirma el banco.</div>
    </Section>
  )
}

const DOC_STATUS = {
  solicitado: { label: 'Falta subir', cls: 'warn', canUpload: true },
  rechazado: { label: 'Reenviar', cls: 'warn', canUpload: true },
  subido: { label: 'Documento recibido', cls: 'ok', canUpload: false },
  en_revision: { label: 'Banco revisando', cls: 'info', canUpload: false },
  aprobado: { label: 'Aprobado', cls: 'ok', canUpload: false },
}

// Smart document checklist — upload the exact docs the bank asked for. Needs an
// active account (RLS scopes uploads to the application owner).
function DocsSection({ applicationId, accountReady, kind, onActivate, activating }) {
  const [docs, setDocs] = useState(null)
  const [uploadingId, setUploadingId] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    if (!accountReady || !applicationId) { setDocs(null); return () => { alive = false } }
    getApplicationDocuments(applicationId).then((r) => { if (alive) setDocs(r) }).catch(() => { if (alive) setDocs([]) })
    return () => { alive = false }
  }, [accountReady, applicationId])

  async function upload(doc, file) {
    if (!file) return
    setUploadingId(doc.id); setErr('')
    try {
      await uploadApplicationDocument(doc, file)
      const rows = await getApplicationDocuments(applicationId)
      setDocs(rows)
    } catch { setErr('No pudimos subir el archivo. Intenta de nuevo.') }
    setUploadingId(null)
  }

  // Locked (no account yet): only nudge when the bank actually asked for docs.
  if (!accountReady) {
    if (kind !== 'docs') return null
    return (
      <Section title="Documentos">
        <div className="cfp-doc"><span className="cfp-doc-ic warn"><AlertTriangle size={14} /></span>
          <div><div className="small strong">El banco solicitó documentos</div>
            <div className="tiny muted">Activa tu cuenta para subirlos de forma segura.</div></div>
        </div>
        <button className="btn btn-outline btn-block btn-sm" style={{ marginTop: 10 }} disabled={activating} onClick={onActivate}>
          {activating ? <><Loader2 size={14} className="spin" /> Activando…</> : 'Activar cuenta para subir'}
        </button>
      </Section>
    )
  }

  if (docs == null) return <Section title="Documentos"><div className="tiny muted">Cargando…</div></Section>
  if (docs.length === 0) {
    if (kind !== 'docs') return null
    return <Section title="Documentos"><div className="tiny muted">No hay documentos pendientes por ahora.</div></Section>
  }

  return (
    <Section title="Documentos">
      {err && <div className="cfp-err" style={{ marginBottom: 8 }}>{err}</div>}
      <div className="col gap-8">
        {docs.map((d) => {
          const st = DOC_STATUS[d.status] || DOC_STATUS.solicitado
          return (
            <div className="cfp-doc" key={d.id}>
              <span className={`cfp-doc-ic ${st.cls}`}>{st.cls === 'ok' ? <CheckCircle2 size={14} /> : st.cls === 'info' ? <Clock size={14} /> : <FileText size={14} />}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small strong">{d.type}</div>
                <div className="tiny muted">{d.bankName ? `${d.bankName} · ` : ''}{st.label}{d.notes ? ` · ${d.notes}` : ''}</div>
              </div>
              {st.canUpload && (
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', flex: 'none' }}>
                  {uploadingId === d.id ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} {uploadingId === d.id ? '' : 'Subir'}
                  <input type="file" hidden onChange={(e) => upload(d, e.target.files?.[0])} accept="image/*,application/pdf" />
                </label>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

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
      .cfp-accepted { display: flex; align-items: flex-start; gap: 10px; background: #dcfce7; border: 1px solid #bbf7d0; color: #166534; border-radius: 12px; padding: 12px 14px; }
      .cfp-accepted .tiny { color: #15803d; line-height: 1.45; margin-top: 2px; }
      .cfp-section { background: #fff; border: 1px solid var(--line,#e2e8f0); border-radius: 14px; padding: 15px; box-shadow: var(--shadow-sm, 0 1px 2px rgba(16,41,63,.05)); }
      .cfp-section h3 { font-size: 14px; margin: 0 0 12px; }
      .cfp-timeline { display: flex; flex-direction: column; gap: 2px; }
      .cfp-tl-row { display: flex; align-items: center; gap: 11px; padding: 7px 0; }
      .cfp-tl-dot { width: 26px; height: 26px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; background: #eef2f4; color: #94a3b8; border: 1.5px solid #e2e8f0; }
      .cfp-tl-dot.done { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
      .cfp-tl-dot.now { background: #dbeafe; color: #1d4ed8; border-color: #bfdbfe; }
      .cfp-offer { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--line-2,#eef2f4); border-radius: 11px; }
      .cfp-offer.sel { border-color: var(--teal-600,#0f9d8f); background: #f2fbf8; }
      .cfp-offer-btn { align-self: stretch; }
      .cfp-offer-sel { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: #166534; }
      .cfp-calc { display: flex; flex-direction: column; gap: 12px; }
      .cfp-calc-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted,#64748b); }
      .cfp-calc-field input[type=range] { width: 100%; accent-color: var(--teal-600,#0f9d8f); }
      .cfp-calc-terms { display: flex; flex-wrap: wrap; gap: 6px; }
      .cfp-calc-out { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line-2,#eef2f4); }
      .cfp-calc-monthly { font-size: 20px; font-weight: 800; color: var(--ink,#0f172a); }
      .cfp-calc-fit { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; padding: 6px 10px; border-radius: 999px; }
      .cfp-calc-fit.ok { background: #dcfce7; color: #166534; }
      .cfp-calc-fit.bad { background: #fef3c7; color: #b45309; }
      /* Steps AutoRD cannot observe: dimmed so they do not read as a live
         checklist that has stalled. */
      .cfp-tl-off { opacity: .55; }
      .cfp-tl-note { margin-top: 10px; padding-top: 9px; border-top: 1px solid #e6edf6; }
      .cfp-activity { display: flex; flex-direction: column; }
      .cfp-act-row { display: flex; align-items: flex-start; gap: 10px; padding: 7px 0; }
      .cfp-act-dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 5px; flex: none; background: #cbd5e1; }
      .cfp-act-dot.accepted { background: #16a34a; } .cfp-act-dot.verified { background: #0f766e; } .cfp-act-dot.bank_decision { background: #2563eb; }
      .cfp-doc { display: flex; align-items: center; gap: 10px; }
      .cfp-doc-ic { width: 26px; height: 26px; border-radius: 8px; flex: none; display: inline-flex; align-items: center; justify-content: center; }
      .cfp-doc-ic.warn { background: #fef3c7; color: #b45309; }
      .cfp-doc-ic.ok { background: #dcfce7; color: #166534; }
      .cfp-doc-ic.info { background: #dbeafe; color: #1d4ed8; }
      .cfp-account { background: #fff; border: 1px solid var(--line,#e2e8f0); border-radius: 14px; padding: 14px; box-shadow: var(--shadow-sm, 0 1px 2px rgba(16,41,63,.05)); }
      .cfp-account.ready { display: flex; align-items: flex-start; gap: 10px; background: #eef6f3; border-color: #bfe3d8; color: #0f766e; }
      .cfp-account.ready .tiny { color: #0f766e; opacity: .85; margin-top: 2px; }
      .cfp-foot { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11.5px; color: var(--muted,#64748b); padding: 8px 0 4px; }
    `}</style>
  )
}
