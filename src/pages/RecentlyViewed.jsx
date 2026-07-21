import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Search, Trash2 } from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import { listVehicles } from '../data/api'
import { clearRecentlyViewed, getRecentlyViewedIds } from '../data/recentlyViewed'

export default function RecentlyViewed() {
  const [all, setAll] = useState([])
  const [ids, setIds] = useState(() => getRecentlyViewedIds())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    listVehicles()
      .then((list) => { if (alive) setAll(list) })
      .catch(() => { if (alive) setAll([]) })
      .finally(() => { if (alive) setLoading(false) })

    const sync = () => setIds(getRecentlyViewedIds())
    window.addEventListener('autord-recently-viewed', sync)
    return () => { alive = false; window.removeEventListener('autord-recently-viewed', sync) }
  }, [])

  const vehicles = useMemo(() => {
    const byId = new Map(all.map((v) => [v.id, v]))
    return ids.map((id) => byId.get(id)).filter(Boolean)
  }, [all, ids])

  const clear = () => {
    clearRecentlyViewed()
    setIds([])
  }

  return (
    <main className="page">
      <div className="container">
        <div className="row between center wrap gap-12" style={{ marginBottom: 18 }}>
          <div>
            <div className="row center gap-8">
              <Clock size={24} color="var(--teal-700)" />
              <h1 style={{ fontSize: 26 }}>Vistos recientemente</h1>
            </div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Carros que abriste en este navegador.</p>
          </div>
          <div className="row gap-8">
            {vehicles.length > 0 && <button className="btn btn-outline" onClick={clear}><Trash2 size={16} /> Limpiar</button>}
            <Link to="/buscar" className="btn btn-primary"><Search size={16} /> Buscar vehiculos</Link>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="vcard" style={{ height: 300, background: 'var(--surface-2)' }} />)}</div>
        ) : vehicles.length === 0 ? (
          <div className="card card-pad recently-empty">
            <div className="verify-ic" style={{ margin: '0 auto 12px', color: 'var(--teal-700)', background: 'var(--teal-50)' }}><Clock size={24} /></div>
            <h2>Aun no has visto vehiculos</h2>
            <p className="muted small">Abre una ficha o una pagina de vehiculo y AutoRD los guardara aqui para volver rapido.</p>
            <Link to="/buscar" className="btn btn-primary" style={{ marginTop: 14 }}>Explorar vehiculos</Link>
          </div>
        ) : (
          <div className="grid grid-4">{vehicles.map((v) => <VehicleCard key={v.id} v={v} />)}</div>
        )}
      </div>
    </main>
  )
}
