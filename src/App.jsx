import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import VehicleDetail from './pages/VehicleDetail'
import Financing from './pages/Financing'
import MyFinancing from './pages/MyFinancing'
import DealerPanel from './pages/DealerPanel'
import BankPanel from './pages/BankPanel'
import Login from './pages/Login'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/vehiculo/:id" element={<VehicleDetail />} />
        <Route path="/ingresar" element={<Login />} />
        <Route path="/financiamiento" element={<Financing />} />
        <Route path="/mi-financiamiento" element={<ProtectedRoute><MyFinancing /></ProtectedRoute>} />
        <Route path="/dealer" element={<ProtectedRoute role="dealer"><DealerPanel /></ProtectedRoute>} />
        <Route path="/banco" element={<ProtectedRoute role="bank"><BankPanel /></ProtectedRoute>} />
      </Routes>
    </Layout>
  )
}
