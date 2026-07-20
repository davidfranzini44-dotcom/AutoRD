import { useState, useRef, useEffect } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import {
  IdCard, ScanFace, FileSignature, Send, Check, Loader2, ShieldCheck,
  ChevronRight, ChevronLeft, Info, Building2, User, Users, Landmark, ExternalLink, X, Car, LogIn,
} from 'lucide-react'
import { banks as demoBanks, financingCase, fmtRD } from '../data/demo'
import { createApplication, createKycSession, getKycStatus, listBanks, getVehicleBySlug, parseMoney, getMyFinancing, attachVehicleToApplication } from '../data/api'
import { fmtMoneyInput } from '../data/finance'
import { useAuth } from '../context/AuthContext'
import StatusChip from '../components/StatusChip'
import BankLogo from '../components/BankLogo'
import CarImage from '../components/CarImage'

const CONSENT = 'Autorizo a AutoRD a compartir mi información personal, datos de identidad verificados, documentos suministrados y solicitud de financiamiento con las entidades financieras seleccionadas por mí para fines de evaluación crediticia. Autorizo expresamente a dichas entidades financieras a consultar mi historial crediticio exclusivamente para evaluar esta solicitud de financiamiento de vehículo.'

const STEPS = [
  { id: 'datos', label: 'Datos', icon: User },
  { id: 'identidad', label: 'Identidad', icon: ScanFace },
  { id: 'consent', label: 'Consentimiento', icon: FileSignature },
  { id: 'enviar', label: 'Enviar a bancos', icon: Send },
  { id: 'respuestas', label: 'Respuestas', icon: Landmark },
]

// Pre-approval "Datos" step, asked ONE question at a time. `param` = the
// homepage-calculator query param that pre-fills it; when present we skip that
// question (already answered on the calculator). Name/cédula come from KYC.
const PREAP_QUESTIONS = [
  { key: 'ingreso', param: 'ingreso', label: '¿Cuál es tu ingreso mensual?', help: 'Tu salario aproximado. Sin comprobante por ahora.', placeholder: 'RD$ 85,000', type: 'money' },
  { key: 'presupuesto', param: 'monto', label: '¿Cuánto quieres financiar?', help: 'Monto deseado. Déjalo en blanco si aún no lo sabes.', placeholder: 'RD$ 1,500,000', type: 'money', optional: true },
  { key: 'plazo', param: 'plazo', label: '¿A qué plazo quieres pagar?', help: 'El tiempo para pagar tu financiamiento.', type: 'plazo' },
  { key: 'telefono', label: '¿A qué WhatsApp te enviamos las respuestas?', help: 'Los bancos responderán por esta vía.', placeholder: '809-000-0000', type: 'tel' },
]

// Same conversational flow when financing a specific car. Price is known, so we
// ask for the down payment (inicial) instead of a desired amount.
const CAR_QUESTIONS = [
  { key: 'ingreso', param: 'ingreso', label: '¿Cuál es tu ingreso mensual?', help: 'Tu salario aproximado. Sin comprobante por ahora.', placeholder: 'RD$ 85,000', type: 'money' },
  { key: 'inicial', param: 'inicial', label: '¿Cuánto puedes dar de inicial?', help: 'Pago inicial disponible (opcional).', placeholder: 'RD$ 250,000', type: 'money', optional: true },
  { key: 'plazo', param: 'plazo', label: '¿A qué plazo quieres pagar?', help: 'El tiempo para pagar tu financiamiento.', type: 'plazo' },
  { key: 'telefono', label: '¿A qué WhatsApp te enviamos las respuestas?', help: 'Los bancos responderán por esta vía.', placeholder: '809-000-0000', type: 'tel' },
]

// Persisted homepage-calculator inputs, so any entry into the flow reuses them.
function readCalcSeed() { try { return JSON.parse(sessionStorage.getItem('autord_calc') || '{}') || {} } catch { return {} } }
const numStr = (n) => (n != null && n !== '' ? String(n) : '')

export default function Financing() {
  const [params] = useSearchParams()
  const location = useLocation()
  const vehiculoSlug = params.get('vehiculo')
  const isPreapproval = !vehiculoSlug
  const { profile, user, configured } = useAuth() || {}
  // Identity verification needs a real account (the KYC session is tied to the
  // user's id). In demo mode (no Supabase) we let it through as a simulation.
  const authed = !configured || !!user
  const loginHref = `/ingresar?next=${encodeURIComponent(location.pathname + location.search)}`
  const [editAll, setEditAll] = useState(false)

  // Reuse whatever the customer entered on the homepage calculator (URL params
  // first, then a saved calc session) so we don't ask for it again.
  const calcSeed = readCalcSeed()
  const seed = {
    ingreso: params.get('ingreso') || numStr(calcSeed.ingreso),
    monto: params.get('monto') || numStr(calcSeed.monto),
    plazo: params.get('plazo') || numStr(calcSeed.plazo),
    inicial: params.get('inicial') || '',
  }
  // One-question-at-a-time flow for BOTH pre-approval and a specific car. Questions
  // the calculator already answered are skipped (but shown in a recap the customer
  // can review + edit) — WhatsApp is always asked.
  const seededByCalc = (q) => (
    (q.key === 'ingreso' && seed.ingreso) ||
    (q.key === 'presupuesto' && seed.monto) ||
    (q.key === 'inicial' && seed.inicial) ||
    (q.key === 'plazo' && seed.plazo)
  )
  const baseQuestions = isPreapproval ? PREAP_QUESTIONS : CAR_QUESTIONS
  const questions = editAll ? baseQuestions : baseQuestions.filter((q) => !seededByCalc(q))

  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => ({
    nombre: '', cedula: '', telefono: '', email: '',
    ingreso: seed.ingreso ? fmtMoneyInput(seed.ingreso) : '',
    presupuesto: seed.monto ? fmtMoneyInput(seed.monto) : '',
    inicial: seed.inicial ? fmtMoneyInput(seed.inicial) : '',
    plazo: seed.plazo || '7',
  }))
  const [kyc, setKyc] = useState('idle') // idle|launching|pending|ok|error
  const [kycError, setKycError] = useState('')
  const [session, setSession] = useState(null) // { url, session_id }
  const [consent, setConsent] = useState(false)
  const [bankList, setBankList] = useState(demoBanks)
  const [selBanks, setSelBanks] = useState(demoBanks.map((b) => b.id))
  const [notify, setNotify] = useState('ambos')
  const [vehicle, setVehicle] = useState(null)
  const [preApp, setPreApp] = useState(null) // existing open pre-approval to reuse
  const pollRef = useRef(null)

  useEffect(() => () => clearInterval(pollRef.current), [])

  // Load the real bank list (with DB ids) and the vehicle being financed.
  useEffect(() => {
    let alive = true
    listBanks().then((bs) => {
      if (!alive || !bs?.length) return
      setBankList(bs)
      setSelBanks(bs.map((b) => b.id))
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!vehiculoSlug) return
    let alive = true
    getVehicleBySlug(vehiculoSlug).then((v) => { if (alive) setVehicle(v) }).catch(() => {})
    return () => { alive = false }
  }, [vehiculoSlug])

  // Prefill contact details from the logged-in buyer's profile.
  useEffect(() => {
    if (!profile) return
    setForm((f) => ({
      ...f,
      nombre: f.nombre || profile.full_name || '',
      email: f.email || profile.email || '',
      telefono: f.telefono || profile.phone || '',
    }))
  }, [profile])

  // If the buyer already did a pre-approval (identity + consent done), reuse it
  // for this car: don't make them verify again, and attach the car to it on submit.
  useEffect(() => {
    if (isPreapproval) return
    let alive = true
    getMyFinancing().then((d) => {
      if (!alive || !d || !d.isPreapproval || d.vehicle) return
      setPreApp(d)
      setKyc('ok')
      setConsent(true)
      setForm((f) => ({ ...f, inicial: f.inicial || (d.down ? fmtMoneyInput(String(d.down)) : '') }))
    }).catch(() => {})
    return () => { alive = false }
  }, [isPreapproval])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  // Money fields format as the user types: "85000" -> "RD$ 85,000".
  const setMoney = (k) => (e) => setForm((f) => ({ ...f, [k]: fmtMoneyInput(e.target.value) }))
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))
  const toggleBank = (id) => setSelBanks((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])

  const startPoll = (sid) => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const st = await getKycStatus(sid)
      if (st.approved) { clearInterval(pollRef.current); setKyc('ok') }
      else if (st.declined) { clearInterval(pollRef.current); setKyc('error') }
    }, 4000)
  }

  const runKyc = async () => {
    if (!authed) { setKycError('Inicia sesión o crea tu cuenta para verificar tu identidad.'); setKyc('error'); return }
    setKyc('launching'); setKycError('')
    const res = await createKycSession()
    if (res.simulated) { setTimeout(() => setKyc('ok'), 1800); return } // demo mode only (no Supabase)
    if (res.error || !res.url) { setKycError(res.error || 'No disponible'); setKyc('error'); return }
    setSession(res)
    window.open(res.url, '_blank', 'noopener')
    setKyc('pending')
    startPoll(res.session_id)
  }
  const recheck = async () => {
    if (!session) return
    const st = await getKycStatus(session.session_id)
    if (st.approved) { clearInterval(pollRef.current); setKyc('ok') }
    else if (st.declined) { clearInterval(pollRef.current); setKyc('error') }
  }

  const submitToBanks = async () => {
    // Map selected bank ids (slugs) to real DB uuids for routing.
    const bankDbIds = selBanks.map((id) => bankList.find((b) => b.id === id)?.dbId).filter(Boolean)
    // Car flow: amount = price − inicial. Pre-approval: the (optional) desired budget.
    const requestedAmount = vehicle
      ? vehicle.price - (parseMoney(form.inicial) || 0)
      : parseMoney(form.presupuesto)
    try {
      if (preApp && vehicle) {
        // Reuse the existing pre-approval: attach this car, no new KYC/consent.
        await attachVehicleToApplication(preApp.id, {
          vehicleDbId: vehicle.dbId, dealerDbId: vehicle.dealerDbId, requestedAmount,
        })
      } else {
        await createApplication({
          ...form,
          consentText: CONSENT,
          notify,
          bankDbIds,
          vehicleDbId: vehicle?.dbId || null,
          dealerDbId: vehicle?.dealerDbId || null,
          requestedAmount,
        })
      }
    } catch (_) { /* demo/offline */ }
    next()
  }

  // What the calculator already captured — shown at the top so the customer still
  // sees (and can edit) their salary/plazo instead of it silently disappearing.
  const recap = editAll ? [] : [
    seed.ingreso && { label: 'Ingreso mensual', value: form.ingreso },
    isPreapproval && seed.monto && { label: 'Monto deseado', value: form.presupuesto },
    !isPreapproval && seed.inicial && { label: 'Inicial', value: form.inicial },
    seed.plazo && { label: 'Plazo', value: `${form.plazo} años` },
  ].filter(Boolean)

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 860 }}>
        <div className="row between center" style={{ marginBottom: 6 }}>
          <h1 style={{ fontSize: 24 }}>{isPreapproval ? 'Pre-aprobación de financiamiento' : 'Solicitud de financiamiento'}</h1>
          <Link to="/mi-financiamiento" className="link-teal hide-mobile">Mi financiamiento <ChevronRight size={14} /></Link>
        </div>
        <p className="muted small" style={{ marginBottom: 20 }}>
          {isPreapproval
            ? 'Descubre cuánto pueden financiarte los bancos antes de elegir tu carro. Verificamos tu identidad y enviamos tu solicitud a los bancos que elijas — ellos evalúan y deciden.'
            : 'Verificamos tu identidad y enviamos tu solicitud a los bancos que elijas. AutoRD no realiza la consulta de crédito: los bancos evalúan y deciden.'}
        </p>

        {isPreapproval && (
          <div className="card card-pad row center gap-12" style={{ marginBottom: 14 }}>
            <div className="verify-ic ok" style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }}><Landmark size={20} /></div>
            <div className="grow">
              <div className="tiny muted">Pre-aprobación · sin vehículo</div>
              <div className="strong">Averigua tu monto pre-aprobado y luego compra dentro de tu presupuesto</div>
            </div>
          </div>
        )}

        {vehicle && (
          <div className="card card-pad row center gap-12" style={{ marginBottom: 14 }}>
            <div style={{ width: 96, flex: 'none', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
              <CarImage make={vehicle.make} model={vehicle.model} bodyType={vehicle.bodyType} seed={vehicle.id} tone={vehicle.tone} label={`${vehicle.make} ${vehicle.model}`} />
            </div>
            <div className="grow">
              <div className="tiny muted">Financiando</div>
              <div className="strong">{vehicle.make} {vehicle.model} {vehicle.year}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="tiny muted">{vehicle.dealer}</div>
              <div className="strong">{fmtRD(vehicle.price)}</div>
            </div>
          </div>
        )}

        {preApp && vehicle && (
          <div className="notice" style={{ marginBottom: 14, borderColor: 'var(--teal-700)', background: 'var(--teal-50)' }}>
            <ShieldCheck size={16} /><span>Estás usando tu pre-aprobación: ya verificaste tu identidad y firmaste el consentimiento. Solo confirma tus datos y vinculamos este vehículo.</span>
          </div>
        )}

        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <div className="stepper">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const state = i < step ? 'done' : i === step ? 'active' : 'pending'
              return (
                <div key={s.id} className={`st ${state}`}>
                  <div className="circle">{state === 'done' ? <Check size={18} strokeWidth={3} /> : <Icon size={18} />}</div>
                  <div className="lbl">{s.label}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card card-pad">
          {/* Key by step so each step slides in smoothly, consistent with the pre-approval questions. */}
          <div className="preap-slide" key={step}>
            {step === 0 && <PreapDatos form={form} set={set} setMoney={setMoney} questions={questions} onComplete={next} reused={!!preApp} recap={recap} onEdit={() => setEditAll(true)} />}
            {step === 1 && <StepIdentidad state={kyc} run={runKyc} recheck={recheck} session={session} reused={!!preApp} error={kycError} authed={authed} loginHref={loginHref} />}
            {step === 2 && <StepConsent consent={consent} setConsent={setConsent} reused={!!preApp} />}
            {step === 3 && <StepEnviar banks={bankList} sel={selBanks} toggle={toggleBank} notify={notify} setNotify={setNotify} form={form} vehicle={vehicle} isPreapproval={isPreapproval} reused={!!preApp} />}
            {step === 4 && <StepRespuestas banks={bankList.filter((b) => selBanks.includes(b.id))} />}
          </div>

          {/* Step 0 (Datos) has its own in-card controls (one question at a time). */}
          {step > 0 && step < 4 && (
            <div className="row between" style={{ marginTop: 22, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
              <button className="btn btn-outline" onClick={back} disabled={step === 0}><ChevronLeft size={17} /> Atrás</button>
              <PrimaryNext step={step} next={next} submitToBanks={submitToBanks} kyc={kyc} consent={consent} selBanks={selBanks} />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function PrimaryNext({ step, next, submitToBanks, kyc, consent, selBanks }) {
  if (step === 1) return <button className="btn btn-primary" onClick={next} disabled={kyc !== 'ok'}>Continuar <ChevronRight size={17} /></button>
  if (step === 2) return <button className="btn btn-primary" onClick={next} disabled={!consent}>Firmar y continuar <ChevronRight size={17} /></button>
  if (step === 3) return <button className="btn btn-primary" onClick={submitToBanks} disabled={selBanks.length === 0}><Send size={16} /> Enviar solicitud a bancos</button>
  return <button className="btn btn-primary" onClick={next}>Continuar <ChevronRight size={17} /></button>
}

/* ---------------- Step 1: Datos ---------------- */
/* Pre-approval Datos — one question at a time with smooth transitions.
   Name + cédula come from the Didit KYC step, so we never ask them here. */
function PreapDatos({ form, set, setMoney, questions, onComplete, reused, recap = [], onEdit }) {
  const [i, setI] = useState(0)
  const idx = Math.min(i, questions.length - 1)
  const q = questions[idx]
  const isLast = idx === questions.length - 1
  const val = form[q.key]
  const ready = q.optional || (val != null && String(val).trim() !== '')
  const go = (d) => setI((x) => Math.min(questions.length - 1, Math.max(0, x + d)))
  const advance = () => { if (!ready) return; if (isLast) onComplete(); else go(1) }
  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); advance() } }
  const onChange = (q.type === 'money' ? setMoney : set)(q.key)

  return (
    <div className="preap">
      {recap.length > 0 && (
        <div className="preap-recap">
          <span className="preap-recap-label">De tu calculadora</span>
          <div className="preap-recap-items">
            {recap.map((r) => <span key={r.label}>{r.label}: <strong>{r.value}</strong></span>)}
            {onEdit && <button type="button" className="preap-recap-edit" onClick={onEdit}>Editar</button>}
          </div>
        </div>
      )}

      <div className="preap-progress">
        <div className="preap-track"><div className="preap-fill" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} /></div>
        <span className="preap-count">{idx + 1} de {questions.length}</span>
      </div>

      <div className="preap-slide" key={q.key}>
        <div className="preap-q">{q.label}</div>
        <div className="preap-help">{q.help}</div>
        {q.type === 'plazo' ? (
          <select className="select preap-input" value={form.plazo} onChange={set('plazo')} autoFocus>
            <option value="4">4 años</option><option value="5">5 años</option><option value="6">6 años</option><option value="7">7 años</option>
          </select>
        ) : (
          <input
            className="input preap-input"
            value={val || ''}
            onChange={onChange}
            onKeyDown={onKey}
            placeholder={q.placeholder}
            inputMode={q.type === 'money' || q.type === 'tel' ? 'numeric' : 'text'}
            autoFocus
          />
        )}
      </div>

      <div className="preap-actions">
        {idx > 0
          ? <button className="btn btn-outline" onClick={() => go(-1)}><ChevronLeft size={17} /> Atrás</button>
          : <span className="tiny muted"><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> {reused ? 'Identidad ya verificada en tu pre-aprobación' : 'Tu identidad se verifica en el siguiente paso'}</span>}
        <button className="btn btn-primary" onClick={advance} disabled={!ready}>
          {isLast ? (reused ? 'Continuar' : 'Continuar a verificación') : 'Continuar'} <ChevronRight size={17} />
        </button>
      </div>
    </div>
  )
}

/* ---------------- Step 2: Identidad (Didit) ---------------- */
function StepIdentidad({ state, run, recheck, session, reused, error, authed = true, loginHref = '/ingresar' }) {
  return (
    <>
      <StepHead icon={ScanFace} title="Verificar identidad" sub="Validamos tu cédula dominicana y hacemos una prueba de vida (verificación facial en tiempo real). Tus datos biométricos no se comparten con dealers." />

      {!authed && (
        <div className="col gap-12">
          <div className="notice"><Info size={16} /><span>Para verificar tu identidad y recibir respuestas de los bancos necesitas una cuenta. Tus datos de la solicitud se conservan.</span></div>
          <Link className="btn btn-navy btn-lg" to={loginHref}><LogIn size={18} /> Inicia sesión o crea tu cuenta</Link>
        </div>
      )}

      {authed && reused && (
        <div className="notice" style={{ marginBottom: 14, borderColor: 'var(--teal-700)', background: 'var(--teal-50)' }}>
          <ShieldCheck size={16} /><span>Ya verificaste tu identidad en tu pre-aprobación — no necesitas repetirla.</span>
        </div>
      )}

      {authed && (<>
      <div className="row center gap-8" style={{ marginBottom: 16 }}>
        <span className="chip chip-navy"><ShieldCheck size={13} /> Verificación de identidad segura</span>
        <span className="tiny muted">Cédula (OCR) · Prueba de vida · Face match</span>
      </div>

      {state === 'idle' && (
        <button className="btn btn-navy btn-lg" onClick={run}><IdCard size={18} /> Verificar mi identidad</button>
      )}

      {state === 'launching' && (
        <div className="verify-row"><div className="verify-ic"><Loader2 size={20} className="spin" /></div><div><div className="strong">Iniciando verificación…</div><div className="tiny muted">Creando tu sesión segura</div></div></div>
      )}

      {state === 'pending' && (
        <div className="col gap-12">
          <div className="notice"><Info size={16} /><span>Se abrió la verificación de identidad en una nueva pestaña. Complétala (foto de cédula + selfie) y vuelve aquí.</span></div>
          <div className="verify-row"><div className="verify-ic"><Loader2 size={20} className="spin" /></div><div className="grow"><div className="strong">Esperando tu verificación…</div><div className="tiny muted">Se actualizará automáticamente al terminar</div></div></div>
          <div className="row gap-8">
            <button className="btn btn-primary" onClick={recheck}><Check size={16} /> Ya completé la verificación</button>
            {session?.url && <a className="btn btn-outline" href={session.url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir de nuevo</a>}
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="col gap-12">
          <div className="verify-row" style={{ borderColor: 'var(--red-bd)', background: 'var(--red-bg)' }}>
            <div className="verify-ic" style={{ background: '#fff', color: 'var(--red)' }}><X size={20} /></div>
            <div className="grow"><div className="strong">No pudimos verificar tu identidad</div><div className="tiny" style={{ color: 'var(--red)' }}>{error || 'La verificación fue rechazada o quedó incompleta.'}</div></div>
          </div>
          <button className="btn btn-navy" onClick={run}><IdCard size={16} /> Intentar de nuevo</button>
        </div>
      )}

      {state === 'ok' && (
        <div className="col gap-8">
          <VRow icon={IdCard} title="Cédula validada" sub="Cédula de identidad y electoral verificada" />
          <VRow icon={ScanFace} title="Prueba de vida completada" sub="Verificación facial en tiempo real exitosa" />
          <div className="kyc-banner" style={{ marginTop: 6 }}>
            <div className="ic"><ShieldCheck size={20} /></div>
            <div><div className="strong">KYC aprobado</div><div className="tiny" style={{ color: 'var(--green)' }}>Tu identidad ha sido verificada correctamente.</div></div>
          </div>
        </div>
      )}
      </>)}
    </>
  )
}
function VRow({ icon: Icon, title, sub }) {
  return (
    <div className="verify-row ok">
      <div className="verify-ic"><Icon size={20} /></div>
      <div className="grow"><div className="strong">{title}</div><div className="tiny muted">{sub}</div></div>
      <StatusChip status="approved">Completado</StatusChip>
    </div>
  )
}

/* ---------------- Step 3: Consent ---------------- */
function StepConsent({ consent, setConsent, reused }) {
  return (
    <>
      <StepHead icon={FileSignature} title="Consentimiento de consulta crediticia" sub="Autorizas a los bancos seleccionados a consultar tu historial de crédito para evaluar esta solicitud." />
      {reused && (
        <div className="notice" style={{ marginBottom: 12, borderColor: 'var(--teal-700)', background: 'var(--teal-50)' }}>
          <ShieldCheck size={16} /><span>Ya firmaste este consentimiento en tu pre-aprobación. Puedes continuar.</span>
        </div>
      )}
      <div className="consent-box">{CONSENT}</div>
      <label className="check-row">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span className="small">He leído y acepto la autorización. Firmo digitalmente este consentimiento.</span>
      </label>
      {consent && (
        <div className="verify-row ok" style={{ marginTop: 14 }}>
          <div className="verify-ic"><FileSignature size={20} /></div>
          <div className="grow"><div className="strong">Consentimiento firmado</div><div className="tiny muted">Autorización registrada</div></div>
          <StatusChip status="approved">Firmado</StatusChip>
        </div>
      )}
      <div className="notice" style={{ marginTop: 14 }}>
        <Info size={16} /><span>AutoRD comparte tu autorización con los bancos. La consulta de crédito la realiza cada banco de forma externa.</span>
      </div>
    </>
  )
}

/* ---------------- Step 4: Enviar ---------------- */
function StepEnviar({ banks, sel, toggle, notify, setNotify, form, vehicle, isPreapproval, reused }) {
  return (
    <>
      <StepHead icon={Send} title={reused ? 'Vincular vehículo a tu pre-aprobación' : (isPreapproval ? 'Enviar pre-aprobación a bancos' : 'Enviar solicitud a bancos')} sub="Elige a qué bancos enviar tu solicitud y quién debe recibir las respuestas." />
      {reused && (
        <div className="notice" style={{ marginBottom: 14 }}>
          <Info size={16} /><span>Tu pre-aprobación ya fue enviada a estos bancos. Vincularemos este vehículo a esa solicitud para que finalicen la oferta.</span>
        </div>
      )}
      <div className="small strong" style={{ marginBottom: 10 }}>Bancos seleccionados</div>
      <div className="grid grid-2" style={{ gap: 10 }}>
        {banks.map((b) => (
          <div key={b.id} className={`selectable ${sel.includes(b.id) ? 'sel' : ''}`} onClick={() => toggle(b.id)}>
            <span className="box">{sel.includes(b.id) && <Check size={14} strokeWidth={3} />}</span>
            <BankLogo slug={b.id} name={b.name} initials={b.initials} color={b.color} size={20} />
            <span className="strong small">{b.name}</span>
          </div>
        ))}
      </div>

      <div className="small strong" style={{ margin: '18px 0 10px' }}>Enviar respuesta a</div>
      <div className="segmented" style={{ maxWidth: 420 }}>
        {[['cliente', 'Cliente', User], ['dealer', 'Dealer', Building2], ['ambos', 'Ambos', Users]].map(([id, lbl, Icon]) => (
          <button key={id} className={notify === id ? 'on' : ''} onClick={() => setNotify(id)}><Icon size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{lbl}</button>
        ))}
      </div>

      <div className="card" style={{ background: 'var(--surface-2)', marginTop: 18, padding: 14 }}>
        <div className="small strong" style={{ marginBottom: 8 }}>{isPreapproval ? 'Resumen de la pre-aprobación' : 'Resumen de la solicitud'}</div>
        {vehicle && <div className="kv"><span className="k">Vehículo</span><span className="v">{vehicle.make} {vehicle.model} {vehicle.year}</span></div>}
        {vehicle && <div className="kv"><span className="k">Precio</span><span className="v">{fmtRD(vehicle.price)}</span></div>}
        {isPreapproval && form.presupuesto && <div className="kv"><span className="k">Monto deseado</span><span className="v">{form.presupuesto}</span></div>}
        {isPreapproval
          ? <div className="kv"><span className="k">WhatsApp</span><span className="v">{form.telefono || '—'}</span></div>
          : <><div className="kv"><span className="k">Solicitante</span><span className="v">{form.nombre || '—'}</span></div>
            <div className="kv"><span className="k">Inicial disponible</span><span className="v">{form.inicial || '—'}</span></div></>}
        <div className="kv"><span className="k">Plazo preferido</span><span className="v">{form.plazo} años</span></div>
        <div className="kv"><span className="k">Bancos</span><span className="v">{sel.length} seleccionados</span></div>
        <div className="kv"><span className="k">KYC</span><span className="v"><StatusChip status="approved">KYC aprobado</StatusChip></span></div>
      </div>
    </>
  )
}

/* ---------------- Step 5: Respuestas ---------------- */
function StepRespuestas({ banks }) {
  return (
    <>
      <div className="col center" style={{ alignItems: 'center', textAlign: 'center', padding: '6px 0 18px' }}>
        <div className="verify-ic ok" style={{ width: 56, height: 56, background: 'var(--green-bg)', color: 'var(--green)', borderRadius: 14 }}><Send size={26} /></div>
        <h2 style={{ marginTop: 14 }}>Solicitud enviada a bancos</h2>
        <p className="muted small" style={{ maxWidth: 440, marginTop: 6 }}>
          Tu solicitud fue enviada correctamente. Los bancos evaluarán tu historial de forma externa y responderán en la plataforma.
        </p>
      </div>
      <div className="col gap-8" style={{ maxWidth: 520, margin: '0 auto' }}>
        {banks.map((b) => (
          <div className="bank-card" key={b.id}>
            <BankLogo slug={b.id} name={b.name} initials={b.initials} color={b.color} size={22} />
            <div className="grow"><div className="strong small">{b.name}</div><div className="tiny muted">Solicitud enviada · esperando respuesta</div></div>
            <StatusChip status="pending" />
          </div>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
        <Link to="/mi-financiamiento" className="btn btn-primary btn-lg">Ver ofertas recibidas <ChevronRight size={17} /></Link>
      </div>
    </>
  )
}

/* ---------------- helpers ---------------- */
function StepHead({ icon: Icon, title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="row center gap-12">
        <div className="verify-ic ok" style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }}><Icon size={20} /></div>
        <h2>{title}</h2>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>{sub}</p>
    </div>
  )
}
