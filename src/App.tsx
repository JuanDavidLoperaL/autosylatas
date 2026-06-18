import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AddProductPage from './pages/AddProductPage'
import InventoryPage from './pages/InventoryPage'
import PendingApprovalsPage from './pages/PendingApprovalsPage'
import SearchPage from './pages/SearchPage'
import WarrantiesPage from './pages/WarrantiesPage'
import ReportsPage from './pages/ReportsPage'
import SalesHistoryPage from './pages/SalesHistoryPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/agregar" element={<AddProductPage />} />
        <Route path="/inventario" element={<InventoryPage />} />
        <Route path="/aprobaciones" element={<PendingApprovalsPage />} />
        <Route path="/buscar" element={<SearchPage />} />
        <Route path="/garantias" element={<WarrantiesPage />} />
        <Route path="/reportes" element={<ReportsPage />} />
        <Route path="/ventas" element={<SalesHistoryPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
