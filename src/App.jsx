import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ConsoleLayout from './components/ConsoleLayout'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import VehicleDetail from './pages/VehicleDetail'
import Financing from './pages/Financing'
import MyFinancing from './pages/MyFinancing'
import Favorites from './pages/Favorites'
import ComoFunciona from './pages/ComoFunciona'
import Login from './pages/Login'
import DealerPanel from './pages/DealerPanel'
import PostVehicle from './pages/PostVehicle'
import BankPanel from './pages/BankPanel'
import BankReports from './pages/BankReports'

export default function App() {
  return (
    <Routes>
      {/* ---------- Buyer marketplace ---------- */}
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/buscar" element={<Home />} />
        <Route path="/vehiculo/:id" element={<VehicleDetail />} />
        <Route path="/financiamiento" element={<Financing />} />
        <Route path="/como-funciona" element={<ComoFunciona />} />
        <Route path="/ingresar" element={<Login />} />
        <Route path="/favoritos" element={<Favorites />} />
        <Route path="/mi-financiamiento" element={<ProtectedRoute><MyFinancing /></ProtectedRoute>} />
      </Route>

      {/* ---------- Dealer console ---------- */}
      <Route element={<ProtectedRoute role="dealer"><ConsoleLayout /></ProtectedRoute>}>
        <Route path="/dealer" element={<DealerPanel view="resumen" />} />
        <Route path="/dealer/inventario" element={<DealerPanel view="inventario" />} />
        <Route path="/dealer/leads" element={<DealerPanel view="leads" />} />
        <Route path="/dealer/publicar" element={<PostVehicle />} />
      </Route>

      {/* ---------- Bank console ---------- */}
      <Route element={<ProtectedRoute role="bank"><ConsoleLayout /></ProtectedRoute>}>
        <Route path="/banco" element={<BankPanel />} />
        <Route path="/banco/reportes" element={<BankReports />} />
      </Route>
    </Routes>
  )
}
