import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import VehicleCard from '../components/VehicleCard'
import { listVehicles } from '../data/api'
import { resolveSeo, POPULAR_SEO } from '../data/seo'

// Set <title> + meta description client-side (Google renders JS). A prerender/
// SSR step would make these crawlable without JS — noted as a future step.
function setMeta(title, description) {
  if (title) document.title = title
  let m = document.querySelector('meta[name="description"]')
  if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'description'); document.head.appendChild(m) }
  if (description) m.setAttribute('content', description)
}

// SEO landing page: /toyota, /honda-civic, /suvs → a filtered, titled listing.
export default function SeoLanding() {
  const { seoSlug: slug } = useParams()
  const [all, setAll] = useState(null)

  useEffect(() => {
    let alive = true
    listVehicles().then((d) => { if (alive) setAll(d) }).catch(() => { if (alive) setAll([]) })
    return () => { alive = false }
  }, [slug])

  const seo = useMemo(() => (all ? resolveSeo(slug, all) : null), [all, slug])
  useEffect(() => {
    if (seo) setMeta(seo.title, seo.description)
    return () => setMeta('AutoRD — Marketplace y financiamiento de vehículos', '')
  }, [seo])

  if (all === null) return <main className="page"><div className="container muted">Cargando…</div></main>

  if (!seo) {
    return (
      <main className="page"><div className="container">
        <h1 style={{ fontSize: 24 }}>Página no encontrada</h1>
        <p className="muted" style={{ marginTop: 8 }}>No encontramos esa categoría. <Link to="/buscar" className="link-teal">Ver todos los vehículos</Link>.</p>
        <div className="row wrap gap-8" style={{ marginTop: 16 }}>
          {POPULAR_SEO.map((c) => <Link key={c.slug} to={`/${c.slug}`} className="chip chip-teal">{c.label}</Link>)}
        </div>
      </div></main>
    )
  }

  const results = all.filter(seo.match)
  const qs = new URLSearchParams(seo.params).toString()

  return (
    <main className="page">
      <div className="container">
        <nav className="tiny muted" style={{ marginBottom: 8 }}>
          <Link to="/" className="link-teal">Inicio</Link> · <Link to="/buscar" className="link-teal">Vehículos</Link> · <span>{seo.heading}</span>
        </nav>
        <h1 style={{ fontSize: 26 }}>{seo.heading}</h1>
        <p className="muted" style={{ margin: '6px 0 18px', maxWidth: 680, lineHeight: 1.6 }}>
          {seo.description} {results.length} disponible{results.length === 1 ? '' : 's'} ahora mismo.
        </p>

        {results.length === 0 ? (
          <div className="card card-pad">No hay unidades disponibles ahora mismo. <Link to="/buscar" className="link-teal">Ver todos los vehículos</Link>.</div>
        ) : (
          <>
            <div className="grid grid-4">{results.slice(0, 24).map((v) => <VehicleCard key={v.id} v={v} />)}</div>
            <div style={{ marginTop: 18 }}>
              <Link to={`/buscar?${qs}`} className="btn btn-primary">Ver todos en búsqueda avanzada</Link>
            </div>
          </>
        )}

        {/* Cross-category links for internal linking */}
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 28, paddingTop: 18 }}>
          <div className="small strong" style={{ marginBottom: 10 }}>Explora otras categorías</div>
          <div className="row wrap gap-8">
            {POPULAR_SEO.filter((c) => c.label !== seo.heading.replace(' en venta', '')).map((c) => (
              <Link key={c.slug} to={`/${c.slug}`} className="chip" style={{ background: 'var(--surface-2)' }}>{c.label}</Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
