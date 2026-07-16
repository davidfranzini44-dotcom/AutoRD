import { NavLink, Link, useLocation, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  MapPin, Heart, Bell, Menu, X, ChevronDown,
  Home, Search, Landmark, User, LogOut, LayoutDashboard,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import autordLogo from '../assets/autord-logo-reference.png'

function Logo() {
  return (
    <Link to="/" className="logo" aria-label="AutoRD inicio">
      <img src={autordLogo} alt="AutoRD" />
    </Link>
  )
}

// Buyer-facing shell: marketplace header + mobile bottom nav + footer.
export default function Layout() {
  const [menu, setMenu] = useState(false)
  const { user, profile, signOut } = useAuth() || {}
  const loc = useLocation()
  useEffect(() => { setMenu(false); window.scrollTo(0, 0) }, [loc.pathname])

  const links = [
    { to: '/', label: 'Comprar', end: true },
    { to: '/ingresar', label: 'Vender' },
    { to: '/financiamiento', label: 'Financiamiento' },
    { to: '/como-funciona', label: 'Cómo funciona' },
    { to: '/como-funciona', label: 'Blog' },
  ]

  const consoleLink = profile?.role === 'dealer' ? '/dealer'
    : profile?.role === 'bank' ? '/banco' : null

  return (
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
            <button className="loc-pill"><MapPin size={15} /><span>Santo Domingo</span><ChevronDown size={14} /></button>
            <Link to="/favoritos" className="icon-label"><Heart size={18} /><span className="hide-mobile">Favoritos</span></Link>
            <button className="icon-label" aria-label="Notificaciones"><Bell size={18} /><span className="dot-badge">3</span></button>
            {consoleLink && (
              <Link to={consoleLink} className="btn btn-outline btn-sm hide-mobile" style={{ height: 40 }}>
                <LayoutDashboard size={15} /> Mi panel
              </Link>
            )}
            {user ? (
              <button className="btn btn-outline btn-sm hide-mobile" style={{ height: 40 }} onClick={signOut}>
                <LogOut size={15} /> Salir
              </button>
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
        <NavLink to="/financiamiento"><Landmark size={20} /> Financiamiento</NavLink>
        <NavLink to="/favoritos"><Heart size={20} /> Favoritos</NavLink>
        <NavLink to={user ? '/mi-financiamiento' : '/ingresar'}><User size={20} /> Perfil</NavLink>
      </nav>
    </div>
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
