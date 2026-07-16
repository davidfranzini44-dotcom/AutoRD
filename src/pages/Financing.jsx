import { useState, useRef, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  IdCard, ScanFace, FileSignature, Send, Check, Loader2, ShieldCheck,
  ChevronRight, ChevronLeft, Info, Building2, User, Users, Landmark, ExternalLink, X, Car,
} from 'lucide-react'
import { banks as demoBanks, financingCase, fmtRD } from '../data/demo'
import { createApplication, createKycSession, getKycStatus, listBanks, getVehicleBySlug } from '../data/api'
import { useAuth } from '../context/AuthContext'
import StatusChip from '../components/StatusChip'

const CONSENT = 'Autorizo a AutoRD a compartir mi información personal, datos de identidad verificados, documentos suministrados y solicitud de financiamiento con las entidades financieras seleccionadas por mí para fines de evaluación crediticia. Autorizo expresamente a dichas entidades financieras a consultar mi historial crediticio exclusivamente para evaluar esta solicitud de financiamiento de vehículo.'

const STEPS = [
  { id: 'datos', label: 'Datos', icon: User },
  { id: 'identidad', label: 'Identidad', icon: ScanFace },
  { id: 'consent', label: 'Consentimiento', icon: FileSignature },
  { id: 'enviar', label: 'Enviar a bancos', icon: Send },
  { id: 'respuestas', label: 'Respuestas', icon: Landmark },
]

export default function Financing() {
  const [params] = useSearchParams()
  const vehiculoSlug = params.get('vehiculo')
  const { profile } = useAuth() || {}
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    nombre: '', cedula: '', telefono: '', email: '',
    ingreso: '', empleo: 'Asalariado', inicial: '', plazo: '7',
  })
  const [kyc, setKyc] = useState('idle') // idle|launching|pending|ok|error
  const [session, setSession] = useState(null) // { url, session_id }
  const [consent, setConsent] = useState(false)
  const [bankList, setBankList] = useState(demoBanks)
  const [selBanks, setSelBanks] = useState(demoBanks.map((b) => b.id))
  const [notify, setNotify] = useState('ambos')
  const [vehicle, setVehicle] = useState(null)
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

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
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
    setKyc('launching')
    const res = await createKycSession()
    if (res.simulated) { setTimeout(() => setKyc('ok'), 1800); return } // fallback until backend deployed
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
    try {
      await createApplication({
        ...form,
        consentText: CONSENT,
        notify,
        bankDbIds,
        vehicleDbId: vehicle?.dbId || null,
        dealerDbId: vehicle?.dealerDbId || null,
        requestedAmount: vehicle ? vehicle.price - (parseInt(String(form.inicial).replace(/[^\d]/g, ''), 10) || 0) : null,
      })
    } catch (_) { /* demo/offline */ }
    next()
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 860 }}>
        <div className="row between center" style={{ marginBottom: 6 }}>
          <h1 style={{ fontSize: 24 }}>Solicitud de financiamiento</h1>
          <Link to="/mi-financiamiento" className="link-teal hide-mobile">Mi financiamiento <ChevronRight size={14} /></Link>
        </div>
        <p className="muted small" style={{ marginBottom: 20 }}>
          Verificamos tu identidad y enviamos tu solicitud a los bancos que elijas. AutoRD no realiza la consulta de crédito: los bancos evalúan y deciden.
        </p>

        {vehicle && (
          <div className="card card-pad row center gap-12" style={{ marginBottom: 14 }}>
            <div className="verify-ic ok" style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }}><Car size={20} /></div>
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
          {step === 0 && <StepDatos form={form} set={set} />}
          {step === 1 && <StepIdentidad state={kyc} run={runKyc} recheck={recheck} session={session} />}
          {step === 2 && <StepConsent consent={consent} setConsent={setConsent} />}
          {step === 3 && <StepEnviar banks={bankList} sel={selBanks} toggle={toggleBank} notify={notify} setNotify={setNotify} form={form} vehicle={vehicle} />}
          {step === 4 && <StepRespuestas banks={bankList} />}

          {step < 4 && (
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
function StepDatos({ form, set }) {
  return (
    <>
      <StepHead icon={User} title="Datos básicos" sub="Empecemos con tu información de contacto y capacidad de pago. No pedimos comprobantes todavía." />
      <div className="grid grid-2" style={{ gap: 14 }}>
        <F label="Nombre completo"><input className="input" value={form.nombre} onChange={set('nombre')} placeholder="Nombre y apellido" /></F>
        <F label="Cédula" help="Formato 000-0000000-0"><input className="input" value={form.cedula} onChange={set('cedula')} placeholder="402-0000000-0" /></F>
        <F label="Teléfono"><input className="input" value={form.telefono} onChange={set('telefono')} placeholder="809-000-0000" /></F>
        <F label="Email"><input className="input" value={form.email} onChange={set('email')} placeholder="nombre@correo.com" /></F>
        <F label="Ingreso aproximado (mensual)" help="Estimado, sin comprobante por ahora"><input className="input" value={form.ingreso} onChange={set('ingreso')} placeholder="RD$ 85,000" /></F>
        <F label="Tipo de empleo">
          <select className="select" value={form.empleo} onChange={set('empleo')}>
            <option>Asalariado</option><option>Negocio propio</option><option>Independiente</option><option>Pensionado</option>
          </select>
        </F>
        <F label="Inicial disponible"><input className="input" value={form.inicial} onChange={set('inicial')} placeholder="RD$ 250,000" /></F>
        <F label="Plazo preferido">
          <select className="select" value={form.plazo} onChange={set('plazo')}>
            <option value="4">4 años</option><option value="5">5 años</option><option value="6">6 años</option><option value="7">7 años</option>
          </select>
        </F>
      </div>
      <div className="notice" style={{ marginTop: 16 }}>
        <Info size={16} /><span>Solo se solicitarán documentos financieros adicionales si un banco los requiere durante su evaluación.</span>
      </div>
    </>
  )
}

/* ---------------- Step 2: Identidad (Didit) ---------------- */
function StepIdentidad({ state, run, recheck, session }) {
  return (
    <>
      <StepHead icon={ScanFace} title="Verificar identidad" sub="Validamos tu cédula dominicana y hacemos una prueba de vida (verificación facial en tiempo real). Tus datos biométricos no se comparten con dealers." />

      <div className="row center gap-8" style={{ marginBottom: 16 }}>
        <span className="chip chip-navy"><ShieldCheck size={13} /> Verificación provista por Didit</span>
        <span className="tiny muted">Cédula (OCR) · Prueba de vida · Face match</span>
      </div>

      {state === 'idle' && (
        <button className="btn btn-navy btn-lg" onClick={run}><IdCard size={18} /> Verificar mi identidad con Didit</button>
      )}

      {state === 'launching' && (
        <div className="verify-row"><div className="verify-ic"><Loader2 size={20} className="spin" /></div><div><div className="strong">Iniciando verificación…</div><div className="tiny muted">Creando tu sesión segura</div></div></div>
      )}

      {state === 'pending' && (
        <div className="col gap-12">
          <div className="notice"><Info size={16} /><span>Se abrió la verificación de Didit en una nueva pestaña. Complétala (foto de cédula + selfie) y vuelve aquí.</span></div>
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
            <div className="grow"><div className="strong">No pudimos verificar tu identidad</div><div className="tiny" style={{ color: 'var(--red)' }}>La verificación fue rechazada o quedó incompleta.</div></div>
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
function StepConsent({ consent, setConsent }) {
  return (
    <>
      <StepHead icon={FileSignature} title="Consentimiento de consulta crediticia" sub="Autorizas a los bancos seleccionados a consultar tu historial de crédito para evaluar esta solicitud." />
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
function StepEnviar({ banks, sel, toggle, notify, setNotify, form, vehicle }) {
  return (
    <>
      <StepHead icon={Send} title="Enviar solicitud a bancos" sub="Elige a qué bancos enviar tu solicitud y quién debe recibir las respuestas." />
      <div className="small strong" style={{ marginBottom: 10 }}>Bancos seleccionados</div>
      <div className="grid grid-2" style={{ gap: 10 }}>
        {banks.map((b) => (
          <div key={b.id} className={`selectable ${sel.includes(b.id) ? 'sel' : ''}`} onClick={() => toggle(b.id)}>
            <span className="box">{sel.includes(b.id) && <Check size={14} strokeWidth={3} />}</span>
            <span className="bank-mark" style={{ width: 30, height: 30, fontSize: 11, background: b.color }}>{b.initials}</span>
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
        <div className="small strong" style={{ marginBottom: 8 }}>Resumen de la solicitud</div>
        {vehicle && <div className="kv"><span className="k">Vehículo</span><span className="v">{vehicle.make} {vehicle.model} {vehicle.year}</span></div>}
        {vehicle && <div className="kv"><span className="k">Precio</span><span className="v">{fmtRD(vehicle.price)}</span></div>}
        <div className="kv"><span className="k">Solicitante</span><span className="v">{form.nombre || '—'}</span></div>
        <div className="kv"><span className="k">Inicial disponible</span><span className="v">{form.inicial || '—'}</span></div>
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
        {financingCase.responses.map((r) => {
          const b = banks.find((x) => x.id === r.bankId)
          return (
            <div className="bank-card" key={r.bankId}>
              <span className="bank-mark" style={{ background: b.color }}>{b.initials}</span>
              <div className="grow"><div className="strong small">{b.name}</div><div className="tiny muted">{r.label}</div></div>
              <StatusChip status={r.status} />
            </div>
          )
        })}
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
function F({ label, help, children }) {
  return <div className="field"><label>{label}</label>{children}{help && <span className="help">{help}</span>}</div>
}
