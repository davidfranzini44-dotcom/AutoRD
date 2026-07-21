import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Landmark, Check } from 'lucide-react'
import { myNotifications, markNotificationsRead } from '../data/api'

const timeAgo = (iso) => {
  try {
    const d = (Date.now() - new Date(iso).getTime()) / 1000
    if (d < 60) return 'ahora'
    if (d < 3600) return `hace ${Math.floor(d / 60)} min`
    if (d < 86400) return `hace ${Math.floor(d / 3600)} h`
    return new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

export default function Notifications() {
  const [items, setItems] = useState(undefined)

  useEffect(() => {
    let alive = true
    myNotifications(50).then((d) => { if (alive) setItems(d) })
    // Mark everything read once the page is opened.
    markNotificationsRead()
    return () => { alive = false }
  }, [])

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 720 }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Notificaciones</h1>
        <p className="muted small" style={{ marginBottom: 18 }}>Respuestas de bancos y novedades de tu actividad.</p>

        {items === undefined ? (
          <div className="muted">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: 'center', padding: 40 }}>
            <div className="verify-ic" style={{ margin: '0 auto 12px', width: 52, height: 52, borderRadius: 14, background: 'var(--surface-3)', color: 'var(--muted)' }}><Bell size={24} /></div>
            <h2 style={{ marginBottom: 6 }}>Sin notificaciones</h2>
            <p className="muted small">Aquí verás cuando un banco responda a tu solicitud.</p>
          </div>
        ) : (
          <div className="col gap-10">
            {items.map((n) => {
              const inner = (
                <div className="card card-pad row center gap-12" style={{ borderColor: n.read ? 'var(--line)' : 'var(--teal-700)' }}>
                  <div className="verify-ic" style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--teal-50)', color: 'var(--teal-700)', flex: 'none' }}><Landmark size={19} /></div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="strong">{n.title}</div>
                    {n.body && <div className="tiny muted">{n.body}</div>}
                  </div>
                  <div className="tiny muted" style={{ flex: 'none' }}>{timeAgo(n.created_at)}</div>
                  {!n.read && <span className="dot-badge" style={{ position: 'static' }} />}
                </div>
              )
              return n.link ? <Link key={n.id} to={n.link} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : <div key={n.id}>{inner}</div>
            })}
          </div>
        )}
      </div>
    </main>
  )
}
