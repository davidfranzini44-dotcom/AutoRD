import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Search, Trash2, X, Clock } from 'lucide-react'
import {
  clearSearchAlerts,
  getSavedSearches,
  removeSearchAlert,
} from '../data/savedSearches'

function dateLabel(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

export default function SearchAlerts() {
  const [alerts, setAlerts] = useState(() => getSavedSearches())

  useEffect(() => {
    const sync = () => setAlerts(getSavedSearches())
    window.addEventListener('autord-search-alerts', sync)
    return () => window.removeEventListener('autord-search-alerts', sync)
  }, [])

  const remove = (id) => {
    removeSearchAlert(id)
    setAlerts(getSavedSearches())
  }
  const clear = () => {
    clearSearchAlerts()
    setAlerts([])
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 980 }}>
        <div className="row between center wrap gap-12" style={{ marginBottom: 18 }}>
          <div>
            <div className="row center gap-8">
              <Bell size={24} color="var(--teal-700)" />
              <h1 style={{ fontSize: 26 }}>Alertas de busqueda</h1>
            </div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Guarda filtros y vuelve rapido cuando lleguen carros similares.</p>
          </div>
          <div className="row gap-8">
            {alerts.length > 0 && <button className="btn btn-outline" onClick={clear}><Trash2 size={16} /> Limpiar</button>}
            <Link to="/buscar" className="btn btn-primary"><Search size={16} /> Crear alerta</Link>
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="card card-pad alerts-empty">
            <div className="verify-ic" style={{ margin: '0 auto 12px', color: 'var(--teal-700)', background: 'var(--teal-50)' }}><Bell size={24} /></div>
            <h2>Aun no tienes alertas</h2>
            <p className="muted small">Filtra por marca, modelo, precio, cuota o tipo de vehiculo y guarda la busqueda.</p>
            <Link to="/buscar" className="btn btn-primary" style={{ marginTop: 14 }}>Buscar vehiculos</Link>
          </div>
        ) : (
          <div className="alerts-list">
            {alerts.map((item) => (
              <div className="card alert-card" key={item.id}>
                <div className="alert-card-main">
                  <div className="alert-ic"><Bell size={19} /></div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row center gap-8 wrap">
                      <h2>{item.title}</h2>
                      <span className="chip chip-teal">{item.count || 0} resultados</span>
                    </div>
                    <div className="tiny muted row center gap-6 wrap" style={{ marginTop: 3 }}>
                      <Clock size={13} /> Guardada {dateLabel(item.createdAt)}
                    </div>
                    {item.filters?.length > 0 && (
                      <div className="alert-filter-row">
                        {item.filters.slice(0, 7).map((label) => <span key={label}>{label}</span>)}
                        {item.filters.length > 7 && <span>+{item.filters.length - 7} mas</span>}
                      </div>
                    )}
                  </div>
                </div>
                <div className="alert-actions">
                  <Link to={`/buscar${item.query ? `?${item.query}` : ''}`} className="btn btn-primary btn-sm">Ver resultados</Link>
                  <button className="btn btn-outline btn-sm" onClick={() => remove(item.id)}><X size={15} /> Quitar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="notice" style={{ marginTop: 16 }}>
          <Bell size={16} />
          <span>Por ahora las alertas quedan guardadas en este navegador. Luego podemos conectarlas a cuenta, WhatsApp y emails cuando definamos reglas de notificacion.</span>
        </div>
      </div>
    </main>
  )
}
