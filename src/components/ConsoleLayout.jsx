import { NavLink, Link, useLocation, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Boxes, Users, PlusCircle, Inbox, FileCheck2, BarChart3,
  ArrowLeft, LogOut, Menu, X, Landmark, Store, MessageCircle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BankLogo from './BankLogo'
import DealerLogo from './DealerLogo'
import useBankIdentity from '../hooks/useBankIdentity'
import { getMyDealer } from '../data/api'

const DEALER_NAV = [
  { to: '/dealer', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/dealer/inventario', label: 'Inventario', icon: Boxes },
  { to: '/dealer/leads', label: 'Leads de financiamiento', icon: Users },
  { to: '/dealer/publicar', label: 'Publicar vehículo', icon: PlusCircle },
  { to: '/dealer/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { to: '/dealer/perfil', label: 'Perfil del dealer', icon: Store },
]
const BANK_NAV = [
  { to: '/banco', label: 'Bandeja de solicitudes', icon: Inbox, end: true },
  { to: '/banco/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { to: '/banco/reportes', label: 'Reportes', icon: BarChart3 },
]

// Operational console shell (sidebar) for dealer + bank portals.
export default function ConsoleLayout() {
  const loc = useLocation()
  const { profile, signOut } = useAuth() || {}
  const [open, setOpen] = useState(false)
  const bank = useBankIdentity(profile)
  const [dealer, setDealer] = useState(null)
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [loc.pathname])

  // Load the signed-in dealer so the console shows THEIR name + logo (not a placeholder).
  useEffect(() => {
    if (!profile?.dealer_id) { setDealer(null); return undefined }
    let alive = true
    getMyDealer(profile.dealer_id).then((d) => { if (alive) setDealer(d) }).catch(() => {})
    return () => { alive = false }
  }, [profile?.dealer_id])

  const isBank = loc.pathname.startsWith('/banco')
  const nav = isBank ? BANK_NAV : DEALER_NAV
  const RoleIcon = isBank ? Landmark : Store
  const orgName = isBank ? bank.name : (dealer?.name || 'Portal de dealer')
  const roleLabel = isBank ? 'Portal de banco' : 'Portal de dealer'

  return (
    <div className="console">
      <aside className={`console-side ${open ? 'open' : ''}`}>
        <div className="side-brand">
          <Link to="/" className="logo" style={{ fontSize: 19 }}><span className="a1">Auto</span><span className="a2">RD</span></Link>
          <button className="icon-btn show-mobile" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={20} /></button>
        </div>

        <div className="side-org">
          <div className={`side-org-ic ${isBank ? 'bank-side-logo' : ''}`}>
            {isBank ? (
              <BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={24} />
            ) : (
              <DealerLogo dealer={dealer || { name: orgName }} style={{ width: 32, height: 32, fontSize: 13, borderRadius: 8 }} />
            )}
          </div>
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
          {isBank ? (
            <span className="bank-topbar-logo" style={{ marginLeft: 'auto' }}>
              <BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={18} />
              <strong>{bank.name}</strong>
            </span>
          ) : (
            <span className="chip chip-navy" style={{ marginLeft: 'auto' }}>{roleLabel}</span>
          )}
        </div>
        <div className="console-main">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
