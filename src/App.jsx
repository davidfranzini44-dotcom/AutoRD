import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ConsoleLayout from './components/ConsoleLayout'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Buscar from './pages/Buscar'
import Dealers from './pages/Dealers'
import DealerProfile from './pages/DealerProfile'
import VehicleDetail from './pages/VehicleDetail'
import Financing from './pages/Financing'
import Verificar from './pages/Verificar'
import MyFinancing from './pages/MyFinancing'
import Account from './pages/Account'
import Favorites from './pages/Favorites'
import Compare from './pages/Compare'
import SearchAlerts from './pages/SearchAlerts'
import RecentlyViewed from './pages/RecentlyViewed'
import SeoLanding from './pages/SeoLanding'
import Notifications from './pages/Notifications'
import ComoFunciona from './pages/ComoFunciona'
import Login from './pages/Login'
import DealerPanel from './pages/DealerPanel'
import DealerProfileEdit from './pages/DealerProfileEdit'
import DealerTeam from './pages/DealerTeam'
import DealerDashboard from './pages/DealerDashboard'
import DealerLeads from './pages/DealerLeads'
import DealerFinancing from './pages/DealerFinancing'
import PostVehicle from './pages/PostVehicle'
import BankPanel from './pages/BankPanel'
import BankReports from './pages/BankReports'
import AdminPanel from './pages/AdminPanel'
import WhatsAppInbox from './components/WhatsAppInbox'

export default function App() {
  return (
    <Routes>
      {/* ---------- Buyer marketplace ---------- */}
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/buscar" element={<Buscar />} />
        <Route path="/dealers" element={<Dealers />} />
        <Route path="/dealers/:slug" element={<DealerProfile />} />
        <Route path="/vehiculo/:id" element={<VehicleDetail />} />
        <Route path="/financiamiento" element={<Financing />} />
        <Route path="/verificar" element={<Verificar />} />
        <Route path="/como-funciona" element={<ComoFunciona />} />
        <Route path="/ingresar" element={<Login />} />
        <Route path="/favoritos" element={<Favorites />} />
        <Route path="/comparar" element={<Compare />} />
        <Route path="/alertas" element={<SearchAlerts />} />
        <Route path="/vistos" element={<RecentlyViewed />} />
        <Route path="/mi-cuenta" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="/mi-financiamiento" element={<ProtectedRoute><MyFinancing /></ProtectedRoute>} />
        <Route path="/notificaciones" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        {/* SEO landing pages (/toyota, /honda-civic, /suvs) — keep LAST so it only
            catches single-segment paths not matched above. */}
        <Route path="/:seoSlug" element={<SeoLanding />} />
      </Route>

      {/* ---------- Dealer console ---------- */}
      <Route element={<ProtectedRoute role="dealer"><ConsoleLayout /></ProtectedRoute>}>
        <Route path="/dealer" element={<DealerDashboard />} />
        <Route path="/dealer/inventario" element={<DealerPanel view="inventario" />} />
        <Route path="/dealer/leads" element={<DealerLeads />} />
        <Route path="/dealer/financiamiento" element={<DealerFinancing />} />
        <Route path="/dealer/perfil" element={<DealerProfileEdit />} />
        <Route path="/dealer/equipo" element={<DealerTeam />} />
        <Route path="/dealer/publicar" element={<PostVehicle />} />
        <Route path="/dealer/whatsapp" element={<WhatsAppInbox />} />
      </Route>

      {/* ---------- Bank console ---------- */}
      <Route element={<ProtectedRoute role="bank"><ConsoleLayout /></ProtectedRoute>}>
        <Route path="/banco" element={<BankPanel />} />
        <Route path="/banco/reportes" element={<BankReports />} />
        <Route path="/banco/whatsapp" element={<WhatsAppInbox />} />
      </Route>

      {/* ---------- Super admin ---------- */}
      <Route path="/admin" element={<ProtectedRoute role="admin"><AdminPanel /></ProtectedRoute>} />
    </Routes>
  )
}
