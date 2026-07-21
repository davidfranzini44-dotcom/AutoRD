import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Heart, FileText, ShieldCheck, ShieldAlert, MessageCircle,
  ChevronRight, LogOut, User, Landmark, Clock, Bell,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getMyFinancing } from '../data/api'
import { favoriteCount } from '../data/favorites'
import { savedSearchCount } from '../data/savedSearches'
import { kycValidity, fmtKycDate } from '../data/kyc'

// Buyer account hub: one place for saved cars, financing status, verified
// identity and WhatsApp contact. Read-only summary that links out to the
// dedicated pages — the account itself lives in Supabase Auth + `profiles`.
export default function Account() {
  const { user, profile, signOut } = useAuth() || {}
  const [favs, setFavs] = useState(favoriteCount())
  const [alerts, setAlerts] = useState(savedSearchCount())
  const [fin, setFin] = useState(undefined)

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
    let alive = true
    getMyFinancing().then((d) => { if (alive) setFin(d) }).catch(() => { if (alive) setFin(null) })
    return () => { alive = false }
  }, [])

  const name = profile?.full_name || (user?.email && user.email.split('@')[0]) || 'Comprador'
  const email = profile?.email || user?.email || ''
  const phone = profile?.phone || ''
  const anon = !!user?.is_anonymous
  const kyc = kycValidity(profile)

  const finState = fin === undefined ? 'loading'
    : !fin ? 'none'
    : fin.approvedAmount > 0 ? 'preapproved'
    : (fin.responses || []).some((r) => r.status === 'offer') ? 'offers'
    : 'evaluating'
  const finSub = {
    loading: 'Cargando…',
    none: 'Aún no has solicitado financiamiento',
    evaluating: `Bancos evaluando tu ${fin?.isPreapproval ? 'pre-aprobación' : 'solicitud'}`,
    offers: 'Tienes ofertas de bancos para revisar',
    preapproved: `Pre-aprobado — revisa tu presupuesto`,
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

        <div className="col gap-12">
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
            to="/financiamiento"
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

          {/* WhatsApp */}
          <HubRow
            to="/financiamiento"
            icon={<MessageCircle size={20} />}
            tone="green"
            title="WhatsApp"
            sub={phone ? `+${String(phone).replace(/^\+/, '')}` : 'No has agregado un número'}
          />
        </div>

        {/* Discover */}
        <div className="card card-pad" style={{ marginTop: 16, background: 'var(--teal-50)', borderColor: 'var(--teal-200, var(--line))' }}>
          <div className="row between center wrap gap-12">
            <div className="row center gap-12">
              <div className="verify-ic" style={{ background: '#fff', color: 'var(--teal-700)' }}><Landmark size={20} /></div>
              <div>
                <div className="strong">¿Cuánto puedes financiar?</div>
                <div className="tiny muted">Obtén una pre-aprobación con bancos antes de elegir tu carro.</div>
              </div>
            </div>
            <Link to="/financiamiento" className="btn btn-primary">Solicitar pre-aprobación</Link>
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

function HubRow({ to, icon, tone = 'teal', title, sub, badge }) {
  const t = TONE[tone] || TONE.teal
  return (
    <Link to={to} className="card card-pad row between center" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="row center gap-12" style={{ minWidth: 0 }}>
        <div className="verify-ic" style={{ width: 44, height: 44, borderRadius: 12, background: t.bg, color: t.fg, flex: 'none' }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div className="strong">{title}</div>
          <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
        </div>
      </div>
      <div className="row center gap-8" style={{ flex: 'none' }}>
        {badge && <span className="chip chip-teal">{badge}</span>}
        <ChevronRight size={18} className="muted" />
      </div>
    </Link>
  )
}
