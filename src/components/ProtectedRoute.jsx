import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// In demo mode (Supabase not connected) everything is open so the panels
// stay explorable. Once connected, routes require login and (optionally) a role.
export default function ProtectedRoute({ children, role }) {
  const { configured, user, profile, loading } = useAuth()
  const loc = useLocation()

  if (!configured) return children
  if (loading) return <main className="page"><div className="container muted">Cargando…</div></main>
  if (!user) {
    // Carry the destination through the login round-trip. Without this a
    // customer following a bank's "sube tus documentos" link signed in and
    // landed on the homepage, with the deep link silently lost -- and the whole
    // point of the link is to put them on the exact thing that is missing.
    // `login` is forwarded too so the screen offers the method they actually
    // have (WhatsApp-only customers must not be asked for an email).
    const dest = `${loc.pathname}${loc.search}${loc.hash}`
    const hint = new URLSearchParams(loc.search).get('login')
    const q = new URLSearchParams({ next: dest })
    if (hint) q.set('login', hint)
    return <Navigate to={`/ingresar?${q.toString()}`} replace />
  }

  if (role && profile && profile.role !== role && profile.role !== 'admin') {
    return (
      <main className="page"><div className="container" style={{ maxWidth: 520 }}>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Acceso restringido</h2>
          <p className="muted small">Esta sección es para cuentas de tipo <strong>{role}</strong>. Tu cuenta es <strong>{profile.role}</strong>.</p>
        </div>
      </div></main>
    )
  }
  return children
}
