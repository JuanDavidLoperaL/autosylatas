import { useEffect, useState } from 'react'
import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { useCurrentUser, getRoleLabel } from '../hooks/useCurrentUser'
import logo from '../assets/logo.png'
import './DashboardPage.css'

function formatCOP(amount: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(amount)
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user, role, isAdmin, loading } = useCurrentUser()
  const isOwner = role === 'owner'
  const [pendingCount, setPendingCount] = useState(0)
  const [inventoryCount, setInventoryCount] = useState<number | null>(null)
  const [salesToday, setSalesToday] = useState<number | null>(null)
  const [salesMonth, setSalesMonth] = useState<number | null>(null)
  const [expensesMonth, setExpensesMonth] = useState<number | null>(null)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) navigate('/login')
  }, [loading, user])

  // Count pending approvals (only load if admin/owner)
  useEffect(() => {
    if (!isAdmin) return
    const q = query(collection(db, 'pendingChanges'), where('status', '==', 'pending'))
    const unsub = onSnapshot(q, snap => setPendingCount(snap.size))
    return unsub
  }, [isAdmin])

  // Real stats — only for owner
  useEffect(() => {
    if (!isOwner || loading || !user) return

    // Inventory count (real-time)
    const unsub = onSnapshot(collection(db, 'products'), snap => setInventoryCount(snap.size))

    // Sales today
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
    const tsStart = Timestamp.fromDate(todayStart)
    const tsEnd = Timestamp.fromDate(todayEnd)

    getDocs(query(collection(db, 'sales'), where('soldAt', '>=', tsStart), where('soldAt', '<=', tsEnd)))
      .then(snap => setSalesToday(snap.docs.reduce((s, d) => s + (d.data().total ?? 0), 0)))

    // Sales this month
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1)
    const tsMonthStart = Timestamp.fromDate(monthStart)
    getDocs(query(collection(db, 'sales'), where('soldAt', '>=', tsMonthStart), where('soldAt', '<=', tsEnd)))
      .then(snap => setSalesMonth(snap.docs.reduce((s, d) => s + (d.data().total ?? 0), 0)))

    // Expenses this month
    getDocs(query(collection(db, 'expenses'), where('createdAt', '>=', tsMonthStart), where('createdAt', '<=', tsEnd)))
      .then(snap => setExpensesMonth(snap.docs.reduce((s, d) => s + (d.data().amount ?? 0), 0)))

    return unsub
  }, [isOwner, loading, user])

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/')
  }

  if (loading) return null

  return (
    <div className="dashboard">

      {/* ── HEADER ── */}
      <header className="dash-header">
        <div className="dash-header-left">
          <img src={logo} alt="Autos y Latas" className="dash-logo" />
          <div className="dash-brand">
            <span>Autos &amp; Latas</span>
            <span>Panel interno</span>
          </div>
        </div>
        <div className="dash-user">
          <span className={`role-badge role-${role}`}>{getRoleLabel(role)}</span>
          <span className="dash-user-email">{user?.email}</span>
          <button className="btn-logout" onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </header>

      <main className="dash-main">

        {/* Bienvenida */}
        <div className="dash-welcome">
          <div>
            <h2>¡Bienvenido de nuevo! 👋</h2>
            <p>Gestiona tu inventario, ventas y clientes desde aquí.</p>
          </div>
          <span className="dash-welcome-badge">🔧 Autos &amp; Latas · Desde 2004</span>
        </div>

        {/* Alerta de pendientes (solo admin/owner) */}
        {isAdmin && pendingCount > 0 && (
          <div className="pending-alert" onClick={() => navigate('/aprobaciones')}>
            <span className="pending-alert-icon">🔔</span>
            <div>
              <strong>{pendingCount} solicitud{pendingCount !== 1 ? 'es' : ''} pendiente{pendingCount !== 1 ? 's' : ''} de aprobación</strong>
              <span>Haz clic aquí para revisarlas</span>
            </div>
            <span className="pending-alert-arrow">→</span>
          </div>
        )}

        {/* Stats rápidas — solo owner */}
        {isOwner && (
          <>
            <div className="dash-section-label">
              <h3>Resumen</h3>
              <div className="dash-section-line" />
            </div>
            <div className="dash-stats">
              <div className="stat-card">
                <div className="stat-number">{inventoryCount ?? '...'}</div>
                <div className="stat-label">Piezas en inventario</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{salesToday === null ? '...' : formatCOP(salesToday)}</div>
                <div className="stat-label">Ventas hoy</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{salesMonth === null ? '...' : formatCOP(salesMonth)}</div>
                <div className="stat-label">Ventas este mes</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{expensesMonth === null ? '...' : formatCOP(expensesMonth)}</div>
                <div className="stat-label">Gastos este mes</div>
              </div>
            </div>
          </>
        )}

        {/* Módulos */}
        <div className="dash-section-label">
          <h3>Módulos</h3>
          <div className="dash-section-line" />
        </div>
        <div className="dash-cards">
          <div className="dash-card">
            <div className="dash-card-icon">📦</div>
            <h3>Inventario</h3>
            <p>Consulta, agrega y edita las piezas disponibles en el local.</p>
            <button className="btn-card" onClick={() => navigate('/inventario')}>Ver inventario →</button>
          </div>
          {isAdmin && (
            <div className="dash-card dash-card--approvals">
              <div className="dash-card-icon">
                🔍
                {pendingCount > 0 && (
                  <span className="card-badge">{pendingCount}</span>
                )}
              </div>
              <h3>Aprobaciones</h3>
              <p>Revisa y aprueba las solicitudes de cambio enviadas por vendedores.</p>
              <button className="btn-card" onClick={() => navigate('/aprobaciones')}>
                Ver aprobaciones →
              </button>
            </div>
          )}
          <div className="dash-card">
            <div className="dash-card-icon">🔍</div>
            <h3>Buscar / Vender producto</h3>
            <p>Encuentra rápidamente cualquier repuesto por nombre o referencia y registra la venta.</p>
            <button className="btn-card" onClick={() => navigate('/buscar')}>Buscar →</button>
          </div>
          <div className="dash-card">
            <div className="dash-card-icon">🧾</div>
            <h3>Historial de ventas</h3>
            <p>Consulta las ventas del día, detalle por factura y reimprime recibos.</p>
            <button className="btn-card" onClick={() => navigate('/ventas')}>Ver ventas →</button>
          </div>
          <div className="dash-card">
            <div className="dash-card-icon">🛡️</div>
            <h3>Garantías</h3>
            <p>Busca el historial de compras y garantías de un cliente por cédula.</p>
            <button className="btn-card" onClick={() => navigate('/garantias')}>Buscar cliente →</button>
          </div>
          <div className="dash-card">
            <div className="dash-card-icon">🚕</div>
            <h3>Taxis nuevos</h3>
            <p>Administra el inventario de taxis nuevos disponibles para venta.</p>
            <button className="btn-card">Ver taxis →</button>
          </div>
          <div className="dash-card">
            <div className="dash-card-icon">🚛</div>
            <h3>Envíos</h3>
            <p>Consulta y gestiona los pedidos enviados a otras ciudades del país.</p>
            <button className="btn-card">Ver envíos →</button>
          </div>
          {isAdmin && (
            <div className="dash-card">
              <div className="dash-card-icon">📊</div>
              <h3>Reportes</h3>
              <p>Visualiza ventas, gastos y rendimiento del negocio.</p>
              <button className="btn-card" onClick={() => navigate('/reportes')}>Ver reportes →</button>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
