import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { LogIn, UserPlus, ShieldCheck, Info, User, Store, Landmark } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { startPhoneLogin, verifyPhoneLogin, phoneLoginError } from '../data/api'
import { supabase } from '../lib/supabase'

// Public demo accounts (credentials already committed in scripts/seed-demo.mjs).
const DEMO_PASSWORD = 'AutoRD2026!'
const DEMO_ACCOUNTS = [
  { email: 'buyer@autord.demo', label: 'Comprador', icon: User, dest: '/' },
  { email: 'dealer@autord.demo', label: 'Dealer', icon: Store, dest: '/dealer' },
  { email: 'bank@autord.demo', label: 'Banco', icon: Landmark, dest: '/banco' },
]

export default function Login() {
  const { signIn, signUp, configured } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const next = sp.get('next') // return here after login (e.g. the financing flow)
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'buyer' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // Phone + WhatsApp code. Kept as its own little state machine rather than
  // another `mode`, because it is two steps (send, then verify) and the email
  // form's fields do not apply to it.
  // ?login=whatsapp means we already know this customer has no password and no
  // real inbox. Offering them an email form is a dead end, so open straight on
  // the phone flow and do not show the email escape hatch.
  const waOnly = sp.get('login') === 'whatsapp'
  const [phoneMode, setPhoneMode] = useState(waOnly)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [note, setNote] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const demoLogin = async (email, dest) => {
    setErr(''); setBusy(true)
    try {
      await signIn(email, DEMO_PASSWORD)
      nav(dest === '/' && next ? next : dest)
    } catch (e2) {
      setErr(e2.message || 'No se pudo iniciar la demo.')
    } finally { setBusy(false) }
  }

  const sendCode = async () => {
    setErr(''); setNote(''); setBusy(true)
    try {
      const r = await startPhoneLogin(phone)
      if (r?.ok === false) { setErr(phoneLoginError(r.error, 'No se pudo enviar el código.')); return }
      setSent(true)
      setNote('Te enviamos un código de 6 dígitos por WhatsApp.')
    } catch (e2) {
      setErr(e2.message || 'No se pudo enviar el código.')
    } finally { setBusy(false) }
  }

  const confirmCode = async () => {
    setErr(''); setBusy(true)
    try {
      const r = await verifyPhoneLogin(phone, code)
      if (!r?.ok) { setErr(phoneLoginError(r?.error, 'Código inválido.')); return }
      // Staff who log in by phone get a customer session on purpose; say so
      // rather than leaving them wondering where their console went.
      if (r.buyerOnly) setNote('Iniciaste sesión como comprador. Para tu panel, entra con correo y contraseña.')
      nav(next || '/mi-cuenta')
    } catch (e2) {
      setErr(e2.message || 'No se pudo verificar el código.')
    } finally { setBusy(false) }
  }

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(form.email, form.password)
        // Route each role to its home surface.
        let dest = '/'
        try {
          const { data: { user } } = await supabase.auth.getUser()
          const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
          dest = prof?.role === 'dealer' ? '/dealer' : prof?.role === 'bank' ? '/banco' : (next || '/')
        } catch (_) { /* default to home */ }
        nav(dest)
      } else {
        await signUp(form.email, form.password, { full_name: form.full_name, role: form.role })
        setErr('Cuenta creada. Revisa tu correo si se requiere confirmación, luego inicia sesión.')
        setMode('login')
      }
    } catch (e2) {
      setErr(e2.message || 'Ocurrió un error.')
    } finally { setBusy(false) }
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 440 }}>
        <div className="card card-pad login-card" style={{ marginTop: 20 }}>
          <div className="row center gap-8 login-title-row" style={{ marginBottom: 4 }}>
            <div className="verify-ic ok" style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }}>
              {mode === 'login' ? <LogIn size={20} /> : <UserPlus size={20} />}
            </div>
            <h1 style={{ fontSize: 22 }}>{mode === 'login' ? 'Ingresar' : 'Crear cuenta'}</h1>
          </div>
          <p className="muted small" style={{ marginBottom: 16 }}>
            {mode === 'login' ? 'Accede a tu cuenta de AutoRD.' : 'Regístrate para solicitar financiamiento o gestionar tu panel.'}
          </p>

          {!configured && (
            <div className="notice" style={{ marginBottom: 14 }}>
              <Info size={16} />
              <span>Modo demo: la autenticación se activa cuando se conecta Supabase. Puedes explorar todo el sitio sin iniciar sesión.</span>
            </div>
          )}

          {phoneMode && (
            <div className="phone-login-panel">
              <div className="phone-login-head">
                <div className="phone-login-ic"><ShieldCheck size={19} /></div>
                <div>
                  <div className="strong small">Entrar con WhatsApp</div>
                  <p className="tiny muted">No necesitas contraseña. Te enviamos un código a tu número.</p>
                </div>
              </div>
              <div className="field">
                <label>Número de WhatsApp</label>
                <input className="input phone-login-input" inputMode="tel" autoComplete="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value)} placeholder="809 000 0000" disabled={sent || busy} />
              </div>
              {sent && (
                <div className="field">
                  <label>Código de 6 dígitos</label>
                  <input className="input phone-login-input phone-login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))} placeholder="000000" />
                </div>
              )}
              {note && <div className="phone-login-note">{note}</div>}
              {err && <div className="phone-login-error">{err}</div>}
              {!sent ? (
                <button type="button" className="btn btn-primary btn-block btn-lg" disabled={busy || phone.replace(/[^0-9]/g, '').length < 10} onClick={sendCode}>
                  {busy ? 'Enviando…' : 'Enviarme el código'}
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-primary btn-block btn-lg" disabled={busy || code.length !== 6} onClick={confirmCode}>
                    {busy ? 'Verificando…' : 'Entrar'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm btn-block" disabled={busy}
                    onClick={() => { setSent(false); setCode(''); setNote('') }}>
                    Usar otro número
                  </button>
                </>
              )}
              {!waOnly && (
                <button type="button" className="btn btn-outline btn-sm btn-block"
                  onClick={() => { setPhoneMode(false); setErr(''); setNote(''); setSent(false); setCode('') }}>
                  Entrar con correo y contraseña
                </button>
              )}
            </div>
          )}

          {!phoneMode && (
          <form className="col gap-12" onSubmit={submit}>
            {mode === 'register' && (
              <div className="field">
                <label>Nombre completo</label>
                <input className="input" value={form.full_name} onChange={set('full_name')} placeholder="Nombre y apellido" required />
              </div>
            )}
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="nombre@correo.com" required />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required minLength={6} />
            </div>
            {mode === 'register' && (
              <div className="field">
                <label>Tipo de cuenta</label>
                <select className="select" value={form.role} onChange={set('role')}>
                  <option value="buyer">Comprador</option>
                  <option value="dealer">Dealer</option>
                  <option value="bank">Banco</option>
                </select>
                <span className="help">Los paneles de dealer y banco requieren aprobación en producción.</span>
              </div>
            )}

            {err && <div className="notice" style={{ borderColor: 'var(--amber-bd)', background: 'var(--amber-bg)' }}><Info size={16} /><span>{err}</span></div>}

            <button className="btn btn-primary btn-block btn-lg" disabled={busy || !configured}>
              {mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </form>
          )}

          {/* The way most customers get back in: they were created passwordless from
              a WhatsApp flow and never had an email or password to remember. */}
          {!phoneMode && (
            <button type="button" className="btn btn-outline btn-block" style={{ marginTop: 10 }}
              onClick={() => { setPhoneMode(true); setErr('') }}>
              Entrar con mi número de WhatsApp
            </button>
          )}

          <div className="row center" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}>
              {mode === 'login' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Ingresar'}
            </button>
          </div>

          {configured && (
            <div style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 14 }}>
              <div className="tiny muted" style={{ textAlign: 'center', marginBottom: 10 }}>Acceso de demostración</div>
              <div className="grid grid-3" style={{ gap: 8 }}>
                {DEMO_ACCOUNTS.map((d) => {
                  const Icon = d.icon
                  return (
                    <button key={d.email} className="btn btn-outline btn-sm" disabled={busy} onClick={() => demoLogin(d.email, d.dest)} style={{ flexDirection: 'column', height: 'auto', padding: '10px 6px', gap: 4 }}>
                      <Icon size={16} /> {d.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 14 }}>
          <ShieldCheck size={13} style={{ verticalAlign: -2 }} /> AutoRD protege tus datos. Los bancos evalúan el crédito de forma externa.
        </p>
      </div>
    </main>
  )
}
