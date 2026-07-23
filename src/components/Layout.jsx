import { NavLink, Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import {
  MapPin, Heart, Bell, Menu, X, ChevronDown,
  Home, Search, Landmark, User, LogOut, LayoutDashboard, Scale,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { FichaProvider } from '../context/FichaContext'
import VehicleFicha from './VehicleFicha'
import autordLogo from '../assets/autord-logo-reference.png'
import { compareCount } from '../data/compare'
import { savedSearchCount } from '../data/savedSearches'

function Logo() {
  return (
    <Link to="/" className="logo" aria-label="AutoRD inicio">
      <img src={autordLogo} alt="AutoRD" />
    </Link>
  )
}

const DR_CITIES = ['Santo Domingo', 'Santiago', 'La Romana', 'Punta Cana', 'San Cristóbal', 'Puerto Plata', 'La Vega', 'San Pedro de Macorís']

// Header location selector — pick a city to browse inventory there.
function LocationPill() {
  const navigate = useNavigate()
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const [city, setCity] = useState(() => { try { return localStorage.getItem('autord-city') || 'Santo Domingo' } catch (_) { return 'Santo Domingo' } })
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const pick = (c) => {
    setCity(c); setOpen(false)
    try { localStorage.setItem('autord-city', c) } catch (_) { /* ignore */ }
    navigate(c === 'Todo el país' ? '/buscar' : `/buscar?ubicacion=${encodeURIComponent(c)}`)
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="loc-pill" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <MapPin size={15} /><span>{city}</span><ChevronDown size={14} />
      </button>
      {open && (
        <div role="listbox" aria-label="Elegir ubicación" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 70, minWidth: 210, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 18px 44px rgba(12,32,51,.18)', padding: 6, maxHeight: 340, overflowY: 'auto' }}>
          {['Todo el país', ...DR_CITIES].map((c) => (
            <button key={c} role="option" aria-selected={c === city} onClick={() => pick(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 8, border: 0, cursor: 'pointer', fontSize: 14, background: c === city ? 'var(--surface-2)' : 'transparent', color: c === city ? 'var(--teal-800)' : 'var(--ink)', fontWeight: c === city ? 700 : 500 }}>
              <MapPin size={13} style={{ opacity: .55 }} /> {c}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Buyer-facing shell: marketplace header + mobile bottom nav + footer.
export default function Layout() {
  const [menu, setMenu] = useState(false)
  const [cmp, setCmp] = useState(compareCount())
  const [alerts, setAlerts] = useState(savedSearchCount())
  const { user, profile, signOut } = useAuth() || {}
  const loc = useLocation()
  useEffect(() => { setMenu(false); window.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => {
    const sync = () => setCmp(compareCount())
    window.addEventListener('autord-compare', sync)
    return () => window.removeEventListener('autord-compare', sync)
  }, [])
  useEffect(() => {
    const sync = () => setAlerts(savedSearchCount())
    window.addEventListener('autord-search-alerts', sync)
    return () => window.removeEventListener('autord-search-alerts', sync)
  }, [])

  const links = [
    { to: '/', label: 'Comprar', end: true },
    { to: '/dealers', label: 'Dealers' },
    { to: '/ingresar', label: 'Vender' },
    { to: '/financiamiento', label: 'Financiamiento' },
    { to: '/como-funciona', label: 'Cómo funciona' },
  ]

  const consoleLink = profile?.role === 'dealer' ? '/dealer'
    : profile?.role === 'bank' ? '/banco' : null

  return (
    <FichaProvider>
    <div className="app">
      <header className="header">
        <div className="container header-inner">
          <button className="hamburger" onClick={() => setMenu(true)} aria-label="Abrir menú"><Menu size={24} /></button>
          <Logo />
          <nav className="nav">
            {links.map((l) => (
              <NavLink key={l.label} to={l.to} end={l.end} className={({ isActive }) => isActive ? 'active' : ''}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="header-right">
            <LocationPill />
            <Link to="/comparar" className="icon-label"><Scale size={18} /><span className="hide-mobile">Comparar</span>{cmp > 0 && <span className="dot-badge">{cmp}</span>}</Link>
            <Link to="/favoritos" className="icon-label"><Heart size={18} /><span className="hide-mobile">Favoritos</span></Link>
            <Link to="/alertas" className="icon-label" aria-label="Alertas"><Bell size={18} /><span className="hide-mobile">Alertas</span>{alerts > 0 && <span className="dot-badge">{alerts}</span>}</Link>
            {consoleLink && (
              <Link to={consoleLink} className="btn btn-outline btn-sm hide-mobile" style={{ height: 40 }}>
                <LayoutDashboard size={15} /> Mi panel
              </Link>
            )}
            {user ? (
              <>
                <Link to="/mi-cuenta" className="icon-label hide-mobile" aria-label="Mi cuenta"><User size={18} /><span className="hide-mobile">Mi cuenta</span></Link>
                <button className="btn btn-outline btn-sm hide-mobile" style={{ height: 40 }} onClick={signOut}>
                  <LogOut size={15} /> Salir
                </button>
              </>
            ) : (
              <Link to="/ingresar" className="btn btn-primary btn-sm hide-mobile" style={{ height: 40, background: 'var(--teal-800)' }}>Ingresar / Registrar</Link>
            )}
          </div>
        </div>
      </header>

      {menu && (
        <div className="mobile-drawer" role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(12,32,51,.45)' }}
          onClick={() => setMenu(false)}>
          <div style={{ background: '#fff', width: 'min(84vw,320px)', height: '100%', padding: '18px 18px' }} onClick={(e) => e.stopPropagation()}>
            <div className="row between center" style={{ marginBottom: 18 }}>
              <Logo />
              <button className="icon-btn" onClick={() => setMenu(false)} aria-label="Cerrar"><X size={22} /></button>
            </div>
            <nav className="col gap-4">
              {links.map((l) => (
                <NavLink key={l.label} to={l.to} end={l.end}
                  className={({ isActive }) => isActive ? 'active' : ''}
                  style={{ padding: '12px 10px', borderRadius: 8, fontWeight: 600, fontSize: 15 }}>
                  {l.label}
                </NavLink>
              ))}
              {consoleLink && <Link to={consoleLink} className="btn btn-outline btn-block" style={{ marginTop: 8 }}><LayoutDashboard size={15} /> Mi panel</Link>}
              {user
                ? <button className="btn btn-outline btn-block" style={{ marginTop: 8 }} onClick={signOut}><LogOut size={15} /> Salir</button>
                : <Link to="/ingresar" className="btn btn-navy btn-block" style={{ marginTop: 8 }}>Ingresar / Registrar</Link>}
            </nav>
          </div>
        </div>
      )}

      <Outlet />

      <Footer />

      <nav className="bottom-nav">
        <NavLink to="/" end><Home size={20} /> Inicio</NavLink>
        <NavLink to="/buscar"><Search size={20} /> Buscar</NavLink>
        <NavLink to="/comparar"><Scale size={20} /> Comparar</NavLink>
        <NavLink to="/financiamiento"><Landmark size={20} /> Financiamiento</NavLink>
        <NavLink to={user ? '/mi-cuenta' : '/ingresar'}><User size={20} /> Perfil</NavLink>
      </nav>

      <VehicleFicha />
    </div>
    </FichaProvider>
  )
}

function Footer() {
  return (
    <footer style={{ background: '#0c2033', color: '#c6d3df', marginTop: 40 }}>
      <div className="container" style={{ padding: '30px 22px' }}>
        <div className="row between wrap gap-24">
          <div style={{ maxWidth: 320 }}>
            <div className="logo" style={{ fontSize: 22 }}><span style={{ color: '#4fd1c5' }}>Auto</span><span style={{ color: '#fff' }}>RD</span></div>
            <p className="small" style={{ color: '#93a6b8', marginTop: 10, lineHeight: 1.6 }}>
              Marketplace y orquestación de financiamiento de vehículos en la República Dominicana.
              AutoRD conecta compradores, dealers y bancos. Los bancos evalúan y aprueban el crédito.
            </p>
          </div>
          <div className="row gap-24 wrap" style={{ fontSize: 13.5 }}>
            <div className="col gap-8">
              <strong style={{ color: '#fff' }}>Producto</strong>
              <Link to="/">Comprar</Link><Link to="/financiamiento">Financiamiento</Link><Link to="/como-funciona">Cómo funciona</Link>
            </div>
            <div className="col gap-8">
              <strong style={{ color: '#fff' }}>Aliados</strong>
              <Link to="/ingresar">Portal de bancos</Link><Link to="/ingresar">Portal de dealers</Link>
            </div>
            <div className="col gap-8">
              <strong style={{ color: '#fff' }}>Legal</strong>
              <span>Privacidad</span><span>Consentimiento</span><span>Términos</span>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #1c3448', marginTop: 22 }} />
        <p className="tiny" style={{ color: '#7d90a3', marginTop: 18 }}>
          © 2026 AutoRD. AutoRD no es una entidad financiera y no realiza consultas de crédito ni otorga préstamos.
        </p>
      </div>
    </footer>
  )
}
