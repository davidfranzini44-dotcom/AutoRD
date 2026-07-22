import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ShieldCheck, IdCard, Loader2, X, ExternalLink, Info, ChevronRight } from 'lucide-react'
import { createKycSession, getKycStatus, markKycVerified, getVehicleBySlug } from '../data/api'
import { useAuth } from '../context/AuthContext'
import { kycValidity, fmtKycDate } from '../data/kyc'
import CarImage from '../components/CarImage'

// Standalone identity verification — the link a dealer sends a customer who
// contacted about a car but hasn't verified. Reuses the same embedded Didit
// flow as the financing step (no account required; anonymous session).
export default function Verificar() {
  const [params] = useSearchParams()
  const { profile, user, configured, signInAnon, refreshProfile } = useAuth() || {}
  const [state, setState] = useState('idle') // idle | onfile | launching | pending | ok | error
  const [kyc, setKyc] = useState(null) // { url, session_id }
  const [error, setError] = useState('')
  const [vehicle, setVehicle] = useState(null)
  const pollRef = useRef(null)

  const vehiculoSlug = params.get('vehiculo')
  const nombre = (params.get('nombre') || '').trim()
  const onFile = kycValidity(profile)

  useEffect(() => {
    if (!vehiculoSlug) return undefined
    let alive = true
    getVehicleBySlug(vehiculoSlug).then((v) => { if (alive) setVehicle(v) }).catch(() => {})
    return () => { alive = false }
  }, [vehiculoSlug])

  useEffect(() => {
    if (onFile.valid) setState((s) => (s === 'idle' ? 'onfile' : s))
  }, [onFile.valid]) // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    clearInterval(pollRef.current)
    setState('ok')
    markKycVerified().then(() => refreshProfile?.()).catch(() => {})
  }
  const checkStatus = async (sid) => {
    if (!sid) return
    const st = await getKycStatus(sid)
    if (st.approved) finish()
    else if (st.declined) { clearInterval(pollRef.current); setError('La verificación fue rechazada o quedó incompleta.'); setState('error') }
  }

  const run = async () => {
    setState('launching'); setError('')
    try {
      if (configured && !user) await signInAnon()
    } catch (_) {
      setError('No pudimos iniciar tu verificación. Si ya tienes cuenta, inicia sesión.'); setState('error'); return
    }
    const res = await createKycSession()
    if (res.simulated) { setTimeout(finish, 1800); return }
    if (res.error || !res.url) { setError(res.error || 'La verificación no está disponible ahora mismo.'); setState('error'); return }
    setKyc(res)
    setState('pending')
  }

  const onFrameLoad = (e) => {
    try {
      const href = e.target.contentWindow.location.href
      if (href && href.includes('kyc=done')) checkStatus(kyc?.session_id)
    } catch (_) { /* cross-origin — still on Didit */ }
  }

  useEffect(() => {
    if (state !== 'pending' || !kyc?.session_id) return undefined
    pollRef.current = setInterval(() => checkStatus(kyc.session_id), 4000)
    const onFocus = () => checkStatus(kyc.session_id)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(pollRef.current); window.removeEventListener('focus', onFocus) }
  }, [state, kyc]) // eslint-disable-line react-hooks/exhaustive-deps

  const financeHref = vehiculoSlug ? `/financiamiento?vehiculo=${vehiculoSlug}` : '/financiamiento'

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="row center gap-8" style={{ marginBottom: 6 }}>
          <ShieldCheck size={22} color="var(--teal-700)" />
          <h1 style={{ fontSize: 24 }}>Verifica tu identidad</h1>
        </div>
        <p className="muted small" style={{ marginBottom: 18 }}>
          {nombre ? `Hola ${nombre}. ` : ''}Validamos tu cédula dominicana y hacemos una prueba de vida — sin crear cuenta y en unos 2 minutos. Tus datos biométricos no se comparten con los dealers.
        </p>

        {vehicle && (
          <div className="card card-pad row center gap-10" style={{ marginBottom: 16 }}>
            <div className="dash-top-photo" style={{ width: 64, height: 46 }}>
              <CarImage make={vehicle.make} model={vehicle.model} bodyType={vehicle.bodyType} seed={vehicle.id} tone={vehicle.tone} photo={vehicle.coverPhoto} />
            </div>
            <div>
              <div className="tiny muted">Verificas para avanzar con</div>
              <div className="strong small">{vehicle.make} {vehicle.model} {vehicle.year}</div>
            </div>
          </div>
        )}

        <div className="card card-pad">
          <div className="row center gap-8" style={{ marginBottom: 16 }}>
            <span className="chip chip-navy"><ShieldCheck size={13} /> Verificación segura</span>
            <span className="tiny muted">Cédula (OCR) · Prueba de vida · Face match</span>
          </div>

          {state === 'idle' && (
            <div className="col gap-8">
              {onFile.verified && !onFile.valid && (
                <div className="notice" style={{ borderColor: 'var(--amber-bd)', background: 'var(--amber-bg)', marginBottom: 4 }}>
                  <Info size={16} /><span>Tu verificación anterior venció el {fmtKycDate(onFile.expires)}. Verifícala de nuevo.</span>
                </div>
              )}
              <button className="btn btn-navy btn-lg" onClick={run}><IdCard size={18} /> Verificar mi identidad</button>
              <div className="tiny muted">Sin crear cuenta — validamos tu identidad con tu cédula.</div>
            </div>
          )}

          {state === 'onfile' && (
            <div className="col gap-10">
              <div className="verify-row ok">
                <div className="verify-ic"><ShieldCheck size={20} /></div>
                <div className="grow">
                  <div className="strong">Ya estás verificado</div>
                  <div className="tiny muted">Verificada el {fmtKycDate(onFile.at)} · válida hasta {fmtKycDate(onFile.expires)}</div>
                </div>
              </div>
              <Link to={financeHref} className="btn btn-primary btn-block">Continuar con financiamiento <ChevronRight size={16} /></Link>
              <button className="btn btn-outline btn-block" onClick={run}><IdCard size={16} /> Volver a verificar</button>
            </div>
          )}

          {state === 'launching' && (
            <div className="verify-row"><div className="verify-ic"><Loader2 size={20} className="spin" /></div><div><div className="strong">Iniciando verificación…</div><div className="tiny muted">Creando tu sesión segura</div></div></div>
          )}

          {state === 'pending' && (
            <div className="col gap-10">
              <div className="kyc-frame-wrap">
                <iframe title="Verificación de identidad" src={kyc?.url} onLoad={onFrameLoad} allow="camera; microphone; fullscreen" className="kyc-frame" />
              </div>
              <div className="row center gap-8" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className="tiny muted"><Loader2 size={13} className="spin" style={{ verticalAlign: -2 }} /> Toma la foto de tu cédula y la selfie — se detecta automáticamente al terminar.</span>
                {kyc?.url && <a className="tiny" href={kyc.url} target="_blank" rel="noreferrer" style={{ color: 'var(--teal-700)' }}><ExternalLink size={12} style={{ verticalAlign: -2 }} /> ¿La cámara no abre? Ábrela en una pestaña</a>}
              </div>
            </div>
          )}

          {state === 'ok' && (
            <div className="col gap-12">
              <div className="verify-row ok">
                <div className="verify-ic"><ShieldCheck size={20} /></div>
                <div className="grow"><div className="strong">¡Identidad verificada!</div><div className="tiny muted">Ya puedes avanzar con el dealer y solicitar financiamiento.</div></div>
              </div>
              <Link to={financeHref} className="btn btn-primary btn-block">Continuar con financiamiento <ChevronRight size={16} /></Link>
              {!vehiculoSlug && <Link to="/buscar" className="btn btn-outline btn-block">Ver vehículos</Link>}
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
        </div>
      </div>
    </main>
  )
}
