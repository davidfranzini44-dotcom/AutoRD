import { NavLink, Link, useLocation, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Boxes, Users, PlusCircle, Inbox, FileCheck2, BarChart3,
  ArrowLeft, LogOut, Menu, X, Landmark, Store,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const DEALER_NAV = [
  { to: '/dealer', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/dealer/inventario', label: 'Inventario', icon: Boxes },
  { to: '/dealer/leads', label: 'Leads de financiamiento', icon: Users },
  { to: '/dealer/publicar', label: 'Publicar vehículo', icon: PlusCircle },
]
const BANK_NAV = [
  { to: '/banco', label: 'Bandeja de solicitudes', icon: Inbox, end: true },
  { to: '/banco/reportes', label: 'Reportes', icon: BarChart3 },
]

// Operational console shell (sidebar) for dealer + bank portals.
export default function ConsoleLayout() {
  const loc = useLocation()
  const { profile, signOut } = useAuth() || {}
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [loc.pathname])

  const isBank = loc.pathname.startsWith('/banco')
  const nav = isBank ? BANK_NAV : DEALER_NAV
  const RoleIcon = isBank ? Landmark : Store
  const orgName = isBank ? 'BHD' : 'Auto América'
  const roleLabel = isBank ? 'Portal de banco' : 'Portal de dealer'

  return (
    <div className="console">
      <aside className={`console-side ${open ? 'open' : ''}`}>
        <div className="side-brand">
          <Link to="/" className="logo" style={{ fontSize: 19 }}><span className="a1">Auto</span><span className="a2">RD</span></Link>
          <button className="icon-btn show-mobile" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={20} /></button>
        </div>

        <div className="side-org">
          <div className="side-org-ic"><RoleIcon size={18} /></div>
          <div>
            <div className="side-org-name">{orgName}</div>
            <div className="side-org-role">{roleLabel}</div>
          </div>
        </div>

        <nav className="side-nav">
          {nav.map((n) => {
            const Icon = n.icon
            return (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => isActive ? 'active' : ''}>
                <Icon size={18} /> {n.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="side-foot">
          <Link to="/" className="side-link"><ArrowLeft size={16} /> Volver al sitio</Link>
          <button className="side-link" onClick={signOut}><LogOut size={16} /> Cerrar sesión</button>
        </div>
      </aside>

      {open && <div className="console-scrim" onClick={() => setOpen(false)} />}

      <div className="console-body">
        <div className="console-topbar">
          <button className="hamburger" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
          <div className="logo" style={{ fontSize: 17 }}><span className="a1">Auto</span><span className="a2">RD</span></div>
          <span className="chip chip-navy" style={{ marginLeft: 'auto' }}>{roleLabel}</span>
        </div>
        <div className="console-main">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
