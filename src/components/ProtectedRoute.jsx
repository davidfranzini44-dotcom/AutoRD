import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// In demo mode (Supabase not connected) everything is open so the panels
// stay explorable. Once connected, routes require login and (optionally) a role.
export default function ProtectedRoute({ children, role }) {
  const { configured, user, profile, loading } = useAuth()

  if (!configured) return children
  if (loading) return <main className="page"><div className="container muted">Cargando…</div></main>
  if (!user) return <Navigate to="/ingresar" replace />

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
