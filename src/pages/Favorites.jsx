import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import { listVehicles } from '../data/api'
import { getFavoriteIds } from '../data/favorites'

export default function Favorites() {
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([listVehicles(), getFavoriteIds()]).then(([all, ids]) => {
      if (!alive) return
      setVehicles(all.filter((v) => ids.includes(v.id)))
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  return (
    <main className="page">
      <div className="container">
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Favoritos</h1>
        <p className="muted small" style={{ marginBottom: 20 }}>Los vehículos que guardaste.</p>

        {loading ? (
          <div className="grid grid-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="vcard" style={{ height: 300, background: 'var(--surface-2)' }} />)}</div>
        ) : vehicles.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: 'center', padding: 40 }}>
            <div className="verify-ic" style={{ margin: '0 auto 12px', width: 52, height: 52, borderRadius: 14, background: 'var(--surface-3)', color: 'var(--muted)' }}><Heart size={24} /></div>
            <h2 style={{ marginBottom: 6 }}>Aún no tienes favoritos</h2>
            <p className="muted small" style={{ marginBottom: 16 }}>Toca el corazón en cualquier vehículo para guardarlo aquí.</p>
            <Link to="/" className="btn btn-primary">Explorar vehículos</Link>
          </div>
        ) : (
          <div className="grid grid-4">{vehicles.map((v) => <VehicleCard key={v.id} v={v} />)}</div>
        )}
      </div>
    </main>
  )
}
