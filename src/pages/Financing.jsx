import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IdCard, ScanFace, FileSignature, Send, Check, Loader2, ShieldCheck,
  ChevronRight, ChevronLeft, Info, Building2, User, Users, Landmark,
} from 'lucide-react'
import { banks, financingCase, fmtRD } from '../data/demo'
import { createApplication } from '../data/api'
import StatusChip from '../components/StatusChip'

const CONSENT = 'Autorizo a AutoRD a compartir mi información personal, datos de identidad verificados, documentos suministrados y solicitud de financiamiento con las entidades financieras seleccionadas por mí para fines de evaluación crediticia. Autorizo expresamente a dichas entidades financieras a consultar mi historial crediticio exclusivamente para evaluar esta solicitud de financiamiento de vehículo.'

const STEPS = [
  { id: 'datos', label: 'Datos', icon: User },
  { id: 'cedula', label: 'Cédula', icon: IdCard },
  { id: 'vida', label: 'Prueba de vida', icon: ScanFace },
  { id: 'consent', label: 'Consentimiento', icon: FileSignature },
  { id: 'enviar', label: 'Enviar a bancos', icon: Send },
  { id: 'respuestas', label: 'Respuestas', icon: Landmark },
]

export default function Financing() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    nombre: 'Juan Pérez', cedula: '', telefono: '', email: '',
    ingreso: '', empleo: 'Asalariado', inicial: '', plazo: '7',
  })
  const [cedulaState, setCedulaState] = useState('idle') // idle|loading|ok
  const [vidaState, setVidaState] = useState('idle')
  const [consent, setConsent] = useState(false)
  const [selBanks, setSelBanks] = useState(banks.map((b) => b.id))
  const [notify, setNotify] = useState('ambos')

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  const runCedula = () => { setCedulaState('loading'); setTimeout(() => setCedulaState('ok'), 1400) }
  const runVida = () => { setVidaState('loading'); setTimeout(() => setVidaState('ok'), 1600) }
  const toggleBank = (id) => setSelBanks((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])

  const submitToBanks = async () => {
    try {
      await createApplication({
        ...form,
        requestedAmount: null,
        consentText: CONSENT,
        notify,
        bankDbIds: selBanks, // slugs in demo; real UUIDs once banks come from DB
      })
    } catch (_) { /* demo/offline: proceed to confirmation screen anyway */ }
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

        {/* Stepper */}
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

        {/* Step content */}
        <div className="card card-pad">
          {step === 0 && (
            <StepDatos form={form} set={set} />
          )}

          {step === 1 && (
            <StepCedula state={cedulaState} run={runCedula} value={form.cedula} onChange={set('cedula')} />
          )}

          {step === 2 && (
            <StepVida state={vidaState} run={runVida} />
          )}

          {step === 3 && (
            <StepConsent consent={consent} setConsent={setConsent} />
          )}

          {step === 4 && (
            <StepEnviar banks={banks} sel={selBanks} toggle={toggleBank} notify={notify} setNotify={setNotify} form={form} />
          )}

          {step === 5 && (
            <StepRespuestas />
          )}

          {/* Nav buttons */}
          {step < 5 && (
            <div className="row between" style={{ marginTop: 22, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
              <button className="btn btn-outline" onClick={back} disabled={step === 0}><ChevronLeft size={17} /> Atrás</button>
              <PrimaryNext
                step={step} next={next} submitToBanks={submitToBanks}
                cedulaState={cedulaState} vidaState={vidaState} consent={consent} selBanks={selBanks}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function PrimaryNext({ step, next, submitToBanks, cedulaState, vidaState, consent, selBanks }) {
  if (step === 1) return <button className="btn btn-primary" onClick={next} disabled={cedulaState !== 'ok'}>Continuar <ChevronRight size={17} /></button>
  if (step === 2) return <button className="btn btn-primary" onClick={next} disabled={vidaState !== 'ok'}>Continuar <ChevronRight size={17} /></button>
  if (step === 3) return <button className="btn btn-primary" onClick={next} disabled={!consent}>Firmar y continuar <ChevronRight size={17} /></button>
  if (step === 4) return <button className="btn btn-primary" onClick={submitToBanks} disabled={selBanks.length === 0}><Send size={16} /> Enviar solicitud a bancos</button>
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

/* ---------------- Step 2: Cédula ---------------- */
function StepCedula({ state, run, value, onChange }) {
  return (
    <>
      <StepHead icon={IdCard} title="Verificar cédula" sub="Validamos tu cédula de identidad y electoral con la Junta Central Electoral (KYC)." />
      <div className="grid grid-2" style={{ gap: 14, marginBottom: 16 }}>
        <F label="Número de cédula"><input className="input" value={value} onChange={onChange} placeholder="402-0000000-0" /></F>
        <div className="col" style={{ justifyContent: 'flex-end' }}>
          <div className="tiny muted" style={{ marginBottom: 6 }}>Documento</div>
          <div className="row gap-8">
            <UploadBox label="Frontal" /><UploadBox label="Reverso" />
          </div>
        </div>
      </div>

      {state === 'idle' && <button className="btn btn-navy" onClick={run}><IdCard size={17} /> Validar cédula</button>}
      {state === 'loading' && <div className="verify-row"><div className="verify-ic"><Loader2 size={20} className="spin" /></div><div><div className="strong">Validando cédula…</div><div className="tiny muted">Consultando padrón electoral</div></div></div>}
      {state === 'ok' && (
        <div className="verify-row ok">
          <div className="verify-ic"><IdCard size={20} /></div>
          <div className="grow"><div className="strong">Cédula validada</div><div className="tiny muted">Cédula de identidad y electoral verificada</div></div>
          <StatusChip status="approved">Completado</StatusChip>
        </div>
      )}
    </>
  )
}

/* ---------------- Step 3: Prueba de vida ---------------- */
function StepVida({ state, run }) {
  return (
    <>
      <StepHead icon={ScanFace} title="Prueba de vida" sub="Verificación facial en tiempo real para confirmar que eres tú (liveness). Tus datos biométricos no se comparten con dealers." />
      <div className="row center" style={{ justifyContent: 'center', padding: '18px 0 20px' }}>
        <div style={{ width: 168, height: 168, borderRadius: '50%', border: '3px dashed var(--teal-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--teal-50)', color: 'var(--teal-700)' }}>
          {state === 'ok' ? <Check size={64} strokeWidth={2.5} /> : state === 'loading' ? <Loader2 size={56} className="spin" /> : <ScanFace size={64} />}
        </div>
      </div>
      {state === 'idle' && <button className="btn btn-navy btn-block" onClick={run}><ScanFace size={17} /> Iniciar prueba de vida</button>}
      {state === 'loading' && <div className="text-center muted small" style={{ textAlign: 'center' }}>Analizando… mantén tu rostro dentro del círculo</div>}
      {state === 'ok' && (
        <div className="verify-row ok">
          <div className="verify-ic"><ScanFace size={20} /></div>
          <div className="grow"><div className="strong">Prueba de vida completada</div><div className="tiny muted">Verificación facial en tiempo real exitosa</div></div>
          <StatusChip status="approved">Completado</StatusChip>
        </div>
      )}
      {state === 'ok' && (
        <div className="kyc-banner" style={{ marginTop: 14 }}>
          <div className="ic"><ShieldCheck size={20} /></div>
          <div><div className="strong">KYC aprobado</div><div className="tiny" style={{ color: 'var(--green)' }}>Tu identidad ha sido verificada correctamente.</div></div>
        </div>
      )}
    </>
  )
}

/* ---------------- Step 4: Consent ---------------- */
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
          <div className="grow"><div className="strong">Consentimiento firmado</div><div className="tiny muted">Autorización registrada · 15 jul 2026</div></div>
          <StatusChip status="approved">Firmado</StatusChip>
        </div>
      )}
      <div className="notice" style={{ marginTop: 14 }}>
        <Info size={16} /><span>AutoRD comparte tu autorización con los bancos. La consulta de crédito la realiza cada banco de forma externa.</span>
      </div>
    </>
  )
}

/* ---------------- Step 5: Enviar ---------------- */
function StepEnviar({ banks, sel, toggle, notify, setNotify, form }) {
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
        <div className="kv"><span className="k">Solicitante</span><span className="v">{form.nombre || '—'}</span></div>
        <div className="kv"><span className="k">Inicial disponible</span><span className="v">{form.inicial || '—'}</span></div>
        <div className="kv"><span className="k">Plazo preferido</span><span className="v">{form.plazo} años</span></div>
        <div className="kv"><span className="k">Bancos</span><span className="v">{sel.length} seleccionados</span></div>
        <div className="kv"><span className="k">KYC</span><span className="v"><StatusChip status="approved">KYC aprobado</StatusChip></span></div>
      </div>
    </>
  )
}

/* ---------------- Step 6: Respuestas ---------------- */
function StepRespuestas() {
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
function UploadBox({ label }) {
  return (
    <div style={{ width: 90, height: 62, border: '1.5px dashed var(--line)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', background: 'var(--surface-2)', fontSize: 11, gap: 3 }}>
      <IdCard size={16} /> {label}
    </div>
  )
}
