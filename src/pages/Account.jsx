import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Heart, FileText, ShieldCheck, ShieldAlert, MessageCircle,
  ChevronRight, LogOut, User, Landmark, Clock, Bell, Loader2, Calculator, Pencil,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import WhatsAppIcon from '../components/WhatsAppIcon'
import { getMyFinancing, myUnreadCount, sendPhoneOtp, verifyPhoneOtp, updateMyProfile, isPlaceholderEmail } from '../data/api'
import { PROVINCIAS, formatAddress } from '../data/provincias'
import { fmtRD } from '../data/demo'
import { favoriteCount } from '../data/favorites'
import { savedSearchCount } from '../data/savedSearches'
import { recentlyViewedCount } from '../data/recentlyViewed'
import { kycValidity, fmtKycDate } from '../data/kyc'
import { isInstitutionProfile } from '../data/roles'

// Buyer account hub: one place for saved cars, financing status, verified
// identity and WhatsApp contact. Read-only summary that links out to the
// dedicated pages — the account itself lives in Supabase Auth + `profiles`.
export default function Account() {
  const { user, profile, signOut, refreshProfile } = useAuth() || {}
  const institutionUser = isInstitutionProfile(profile)
  const [favs, setFavs] = useState(favoriteCount())
  const [alerts, setAlerts] = useState(savedSearchCount())
  const [viewed, setViewed] = useState(recentlyViewedCount())
  const [fin, setFin] = useState(undefined)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    const sync = () => setFavs(favoriteCount())
    sync()
    window.addEventListener('autord-favs', sync)
    return () => window.removeEventListener('autord-favs', sync)
  }, [])

  useEffect(() => {
    const sync = () => setAlerts(savedSearchCount())
    sync()
    window.addEventListener('autord-search-alerts', sync)
    return () => window.removeEventListener('autord-search-alerts', sync)
  }, [])

  useEffect(() => {
    const sync = () => setViewed(recentlyViewedCount())
    sync()
    window.addEventListener('autord-recently-viewed', sync)
    return () => window.removeEventListener('autord-recently-viewed', sync)
  }, [])

  useEffect(() => {
    if (institutionUser) {
      setFin(null)
      return undefined
    }
    let alive = true
    getMyFinancing().then((d) => { if (alive) setFin(d) }).catch(() => { if (alive) setFin(null) })
    return () => { alive = false }
  }, [institutionUser])

  useEffect(() => {
    if (!user) { setUnread(0); return undefined }
    let alive = true
    const sync = () => myUnreadCount().then((n) => { if (alive) setUnread(n) })
    sync()
    window.addEventListener('autord-notifs', sync)
    return () => { alive = false; window.removeEventListener('autord-notifs', sync) }
  }, [user])

  const rawEmail = profile?.email || user?.email || ''
  const email = isPlaceholderEmail(rawEmail) ? '' : rawEmail
  const name = profile?.full_name || fin?.buyerName || (email && email.split('@')[0]) || 'Comprador'
  const phone = profile?.phone || ''
  const anon = !!user?.is_anonymous
  const kyc = kycValidity(profile)

  const finState = fin === undefined ? 'loading'
    : !fin ? 'none'
    : fin.approvedAmount > 0 ? 'preapproved'
    : (fin.responses || []).some((r) => r.status === 'offer') ? 'offers'
    : 'evaluating'
  // Selected/attached vehicle, if any — so the hub reflects the car choice.
  const finVeh = fin?.vehicle ? `${fin.vehicle.make} ${fin.vehicle.model} ${fin.vehicle.year}` : null
  const finSub = {
    loading: 'Cargando…',
    none: 'Aún no has solicitado financiamiento',
    evaluating: `Bancos evaluando tu ${fin?.isPreapproval ? 'pre-aprobación' : 'solicitud'}${finVeh ? ` · ${finVeh}` : ''}`,
    offers: `Tienes ofertas de bancos${finVeh ? ` · ${finVeh}` : ' para revisar'}`,
    preapproved: `Pre-aprobado${fin?.approvedAmount ? ` hasta ${fmtRD(fin.approvedAmount)}` : ''}${finVeh ? ` · ${finVeh}` : ''}`,
  }[finState]

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 780 }}>
        {/* Header card */}
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="row between center wrap gap-12">
            <div className="row center gap-12">
              <div className="verify-ic" style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--teal-50)', color: 'var(--teal-700)' }}>
                <User size={24} />
              </div>
              <div>
                <h1 style={{ fontSize: 22, lineHeight: 1.2 }}>Hola, {name}</h1>
                <p className="muted small" style={{ marginTop: 2 }}>{email || (anon ? 'Cuenta rápida (sin correo)' : 'Mi cuenta')}</p>
              </div>
            </div>
            {user && (
              <button className="btn btn-outline btn-sm" onClick={signOut}><LogOut size={15} /> Salir</button>
            )}
          </div>
        </div>

        {/* Mis datos — the client's own declaration, and the only version of
            these fields that every authorised bank sees. A bank can also record
            its own copy while working a case, but that stays private to it, so
            filling this in is what saves the client repeating themselves. */}
        {!institutionUser && <ProfileCard profile={profile} fallbackFullName={fin?.buyerName} onSaved={refreshProfile} />}

        <div className="col gap-12">
          {/* Notifications (bank responses etc.) */}
          <HubRow
            to="/notificaciones"
            icon={<Bell size={20} />}
            tone={unread > 0 ? 'green' : 'teal'}
            title="Notificaciones"
            sub={unread === 0 ? 'Respuestas de bancos y novedades' : `${unread} nueva${unread === 1 ? '' : 's'} sin leer`}
            badge={unread > 0 ? String(unread) : null}
          />

          {/* Saved cars */}
          <HubRow
            to="/favoritos"
            icon={<Heart size={20} />}
            tone="rose"
            title="Carros guardados"
            sub={favs === 0 ? 'Aún no has guardado carros' : `${favs} vehículo${favs === 1 ? '' : 's'} guardado${favs === 1 ? '' : 's'}`}
            badge={favs > 0 ? String(favs) : null}
          />

          <HubRow
            to="/alertas"
            icon={<Bell size={20} />}
            tone="teal"
            title="Alertas de busqueda"
            sub={alerts === 0 ? 'Guarda filtros para volver rapido' : `${alerts} alerta${alerts === 1 ? '' : 's'} guardada${alerts === 1 ? '' : 's'}`}
            badge={alerts > 0 ? String(alerts) : null}
          />

          <HubRow
            to="/vistos"
            icon={<Clock size={20} />}
            tone="teal"
            title="Vistos recientemente"
            sub={viewed === 0 ? 'Tu historial de carros aparecera aqui' : `${viewed} vehiculo${viewed === 1 ? '' : 's'} visto${viewed === 1 ? '' : 's'}`}
            badge={viewed > 0 ? String(viewed) : null}
          />

          {!institutionUser && (
            <>
              {/* Financing */}
              <HubRow
                to="/mi-financiamiento"
                icon={finState === 'evaluating' ? <Clock size={20} /> : <FileText size={20} />}
                tone="teal"
                title="Mi financiamiento"
                sub={finSub}
                badge={finState === 'offers' ? 'Ofertas' : finState === 'preapproved' ? 'Pre-aprobado' : null}
              />

              {/* Identity (KYC) — valid for 12 months, then re-verify */}
              <HubRow
                to="/verificar"
                icon={kyc.valid ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
                tone={kyc.valid ? 'green' : 'amber'}
                title="Identidad"
                sub={kyc.valid
                  ? `Verificada · válida hasta ${fmtKycDate(kyc.expires)}${kyc.daysLeft <= 30 ? ` · vence pronto` : ''}`
                  : kyc.verified
                    ? `Venció el ${fmtKycDate(kyc.expires)} — vuelve a verificar`
                    : 'Sin verificar — verifica tu cédula para agilizar el financiamiento'}
                badge={kyc.valid ? 'Vigente' : kyc.verified ? 'Vencida' : null}
              />
            </>
          )}

          {/* WhatsApp — add / verify the number right here (no dead-end link) */}
          <WhatsAppRow phone={phone} verifiedAt={profile?.phone_verified_at} onSaved={refreshProfile} institutionUser={institutionUser} />
        </div>

        {/* Discover */}
        <div className="card card-pad" style={{ marginTop: 16, background: 'var(--teal-50)', borderColor: 'var(--teal-200, var(--line))' }}>
          <div className="row between center wrap gap-12">
            <div className="row center gap-12">
              <div className="verify-ic" style={{ background: '#fff', color: 'var(--teal-700)' }}>{institutionUser ? <Calculator size={20} /> : <Landmark size={20} />}</div>
              <div>
                <div className="strong">{institutionUser ? 'Calculadora de cuota' : '¿Cuánto puedes financiar?'}</div>
                <div className="tiny muted">{institutionUser ? 'Calcula cuotas estimadas para orientar clientes sin iniciar KYC ni solicitud.' : 'Obtén una pre-aprobación con bancos antes de elegir tu carro.'}</div>
              </div>
            </div>
            <Link to={institutionUser ? '/?calculadora=1' : '/financiamiento'} className="btn btn-primary">
              {institutionUser ? 'Abrir calculadora' : 'Solicitar pre-aprobación'}
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

const TONE = {
  rose: { bg: '#fff1f2', fg: '#e11d48' },
  teal: { bg: 'var(--teal-50)', fg: 'var(--teal-700)' },
  green: { bg: 'var(--green-bg)', fg: 'var(--green)' },
  amber: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
}

// Add / verify the WhatsApp number in place — the row used to link to the
// financing wizard, which was a dead end for someone just managing their number.
function WhatsAppRow({ phone, verifiedAt, onSaved, institutionUser = false }) {
  const t = TONE.green
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(phone ? String(phone).replace(/^\+?1?/, '') : '')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('phone') // phone | code | done
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const digits = value.replace(/[^0-9]/g, '')

  async function send() {
    if (digits.length < 10) { setErr('Escribe tu número de 10 dígitos.'); return }
    setBusy(true); setErr('')
    const r = await sendPhoneOtp(`1${digits}`, 'claim')
    setBusy(false)
    if (r?.ok !== false) setStep('code')
    else setErr(r.error === 'gateway_offline' ? 'WhatsApp no está disponible ahora mismo.' : 'No pudimos enviar el código.')
  }
  async function verify() {
    if (code.length !== 6) return
    setBusy(true); setErr('')
    const r = await verifyPhoneOtp(`1${digits}`, code)
    setBusy(false)
    if (r?.verified || r?.ok) { setStep('done'); onSaved?.() }
    else setErr('Código incorrecto o vencido.')
  }

  return (
    <div className="card card-pad">
      <button type="button" className="hubrow-btn" onClick={() => setOpen((o) => !o)}>
        <div className="hubrow-main">
          <div className="verify-ic hubrow-ic" style={{ background: t.bg, color: t.fg }}><WhatsAppIcon size={20} /></div>
          <div className="hubrow-text">
            <div className="strong">WhatsApp</div>
            <div className="tiny muted hubrow-sub">
              {phone ? `+1 ${String(phone).replace(/^\+?1?/, '')}` : 'No has agregado un número'}
              {phone && verifiedAt ? ' · verificado' : ''}
            </div>
          </div>
        </div>
        <div className="hubrow-end">
          {phone && verifiedAt && <span className="chip chip-teal">Verificado</span>}
          <ChevronRight size={18} className="muted" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
          {step === 'done' ? (
            <div className="tiny" style={{ color: 'var(--green)' }}>{institutionUser ? 'Número verificado para tu cuenta.' : 'Número verificado. Te avisaremos por WhatsApp sobre tu financiamiento.'}</div>
          ) : step === 'code' ? (
            <>
              <div className="tiny muted" style={{ marginBottom: 8 }}>Escribe el código que enviamos a +1 {digits}.</div>
              <div className="row gap-8 wrap">
                <input className="input" inputMode="numeric" maxLength={6} placeholder="000000" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} style={{ maxWidth: 140, letterSpacing: '.2em', textAlign: 'center' }} />
                <button className="btn btn-primary btn-sm" disabled={busy || code.length !== 6} onClick={verify}>
                  {busy ? <Loader2 size={14} className="spin" /> : 'Verificar'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setStep('phone')}>Cambiar número</button>
              </div>
            </>
          ) : (
            <>
              <div className="tiny muted" style={{ marginBottom: 8 }}>{institutionUser ? 'Verifica tu WhatsApp para recibir avisos de tu cuenta.' : 'Verifica tu WhatsApp para recibir avisos de tu financiamiento.'}</div>
              <div className="row gap-8 wrap">
                <input className="input" inputMode="tel" placeholder="809 555 0100" value={value}
                  onChange={(e) => setValue(e.target.value.replace(/[^0-9\s-]/g, ''))} style={{ maxWidth: 180 }} />
                <button className="btn btn-primary btn-sm" disabled={busy || digits.length < 10} onClick={send}>
                  {busy ? <Loader2 size={14} className="spin" /> : 'Enviar código'}
                </button>
              </div>
            </>
          )}
          {err && <div className="tiny" style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </div>
  )
}

function HubRow({ to, icon, tone = 'teal', title, sub, badge }) {
  const t = TONE[tone] || TONE.teal
  return (
    <Link to={to} className="card card-pad hubrow-btn" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="hubrow-main">
        <div className="verify-ic hubrow-ic" style={{ background: t.bg, color: t.fg }}>{icon}</div>
        <div className="hubrow-text">
          <div className="strong">{title}</div>
          <div className="tiny muted hubrow-sub">{sub}</div>
        </div>
      </div>
      <div className="hubrow-end">
        {badge && <span className="chip chip-teal">{badge}</span>}
        <ChevronRight size={18} className="muted" />
      </div>
    </Link>
  )
}

// The client's own declaration of the details banks ask for. Read-only until
// "Editar", so the hub still reads as a summary rather than a form.
//
// Phone is deliberately not editable here: it is the WhatsApp identity the OTP
// and the passwordless account are keyed on, so changing it needs re-verification
// rather than a text box.
function ProfileCard({ profile, fallbackFullName = '', onSaved }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ fullName: '', email: '', occupation: '', provincia: '', addressLine: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  const current = {
    fullName: profile?.full_name || fallbackFullName || '',
    email: isPlaceholderEmail(profile?.email) ? '' : (profile?.email || ''),
    occupation: profile?.occupation || '',
    provincia: profile?.provincia || '',
    addressLine: profile?.address_line || '',
  }

  const open = () => { setForm(current); setErr(''); setOk(false); setEditing(true) }

  const save = async () => {
    setBusy(true); setErr('')
    try {
      await updateMyProfile(form)
      await onSaved?.()
      setEditing(false); setOk(true)
    } catch (e) {
      setErr(e?.message || 'No se pudo guardar')
    } finally { setBusy(false) }
  }

  const Row = ({ label, value }) => (
    <div className="bankx-infoline"><span>{label}</span>
      <b>{value || <span className="muted tiny">Sin completar</span>}</b>
    </div>
  )

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="row between center" style={{ marginBottom: 10 }}>
        <div>
          <div className="strong">Mis datos</div>
          <div className="tiny muted">Los bancos que autorices verán esta información.</div>
        </div>
        {!editing && <button className="btn btn-outline btn-sm" onClick={open}><Pencil size={14} /> Editar</button>}
      </div>

      {editing ? (
        <>
          <div className="field"><label>Nombre completo</label>
            <input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Como aparece en tu cédula" /></div>
          <div className="field" style={{ marginTop: 10 }}><label>Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="tucorreo@ejemplo.com" /></div>
          <div className="field" style={{ marginTop: 10 }}><label>Ocupación</label>
            <input className="input" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} placeholder="Ej: Ingeniero, comerciante…" /></div>
          <div className="field" style={{ marginTop: 10 }}><label>Provincia</label>
            <select className="select" value={form.provincia} onChange={(e) => setForm({ ...form, provincia: e.target.value })}>
              <option value="">Sin especificar</option>
              {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></div>
          <div className="field" style={{ marginTop: 10 }}><label>Dirección</label>
            <input className="input" value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} placeholder="Calle, número, sector" /></div>
          {err && <div className="tiny" style={{ color: '#b91c1c', marginTop: 10 }}>{err}</div>}
          <div className="row gap-8" style={{ marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? <Loader2 size={15} className="spin" /> : 'Guardar'}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          <Row label="Nombre" value={current.fullName} />
          <Row label="Email" value={current.email} />
          <Row label="Ocupación" value={current.occupation} />
          <Row label="Dirección" value={formatAddress(current.addressLine, current.provincia)} />
          {ok && <div className="tiny" style={{ color: 'var(--teal-700)', marginTop: 8 }}>Datos actualizados.</div>}
        </>
      )}
    </div>
  )
}
