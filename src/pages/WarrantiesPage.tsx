import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useCurrentUser, getRoleLabel } from '../hooks/useCurrentUser'
import logo from '../assets/logo.png'
import './WarrantiesPage.css'

interface SaleItem {
  productId: string
  name: string
  brand: string
  price: number
  discount: number
  finalPrice: number
  quantity: number
  subtotal: number
  hasWarranty: boolean
  warrantyStart?: string
  warrantyEnd?: string
  warrantyHours?: string
}

interface Sale {
  id: string
  items: SaleItem[]
  subtotalSinDescuento: number
  totalDescuento: number
  total: number
  customer?: { cedula: string; name: string | null }
  soldBy: { uid: string; email: string }
  soldAt: Timestamp
  notes: string
}

const todayStr = () => new Date().toISOString().split('T')[0]

const fmtTimestamp = (ts: Timestamp): string =>
  ts.toDate().toLocaleString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

const fmtDateShort = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

const warrantyStatus = (endDate: string): 'vigente' | 'vencida' =>
  endDate >= todayStr() ? 'vigente' : 'vencida'

export default function WarrantiesPage() {
  const navigate = useNavigate()
  const { role } = useCurrentUser()

  const [cedula, setCedula] = useState('')
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [sales, setSales] = useState<Sale[]>([])

  const handleSearch = async () => {
    const term = cedula.trim()
    if (!term) return
    setSearching(true)
    setSearched(false)
    try {
      const q = query(
        collection(db, 'sales'),
        where('customer.cedula', '==', term)
      )
      const snap = await getDocs(q)
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Sale))
        .sort((a, b) => b.soldAt?.toMillis() - a.soldAt?.toMillis())
      setSales(data)
    } catch (err) {
      console.error(err)
      setSales([])
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const hasAnyWarranty = (sale: Sale) => sale.items.some(i => i.hasWarranty)

  return (
    <div className="warranties-page">

      <header className="warranties-header">
        <div className="warranties-header-left">
          <img src={logo} alt="Autos y Latas" className="warranties-logo" />
          <div className="warranties-brand">
            <span>Autos &amp; Latas</span>
            <span>Panel interno</span>
          </div>
        </div>
        <div className="warranties-header-right">
          <span className={`role-badge role-${role}`}>{getRoleLabel(role)}</span>
          <button className="btn-back" onClick={() => navigate('/dashboard')}>← Panel</button>
        </div>
      </header>

      <main className="warranties-main">

        <div className="warranties-title-row">
          <div>
            <h1>🛡️ Garantías e historial</h1>
            <p className="warranties-subtitle">
              Busca las compras de un cliente por número de cédula
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="cedula-search-box">
          <div className="cedula-input-wrap">
            <span className="cedula-icon">🪪</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Número de cédula del cliente..."
              value={cedula}
              onChange={e => setCedula(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            {cedula && (
              <button className="cedula-clear" onClick={() => { setCedula(''); setSales([]); setSearched(false) }}>✕</button>
            )}
          </div>
          <button className="btn-search-cedula" onClick={handleSearch} disabled={!cedula.trim() || searching}>
            {searching ? 'Buscando...' : 'Buscar compras'}
          </button>
        </div>

        {/* Results */}
        {!searched && !searching && (
          <div className="warranties-placeholder">
            <div className="placeholder-icon">🔍</div>
            <p>Ingresa el número de cédula del cliente y presiona <strong>Buscar compras</strong> o <strong>Enter</strong>.</p>
            <span>Encontrarás todas sus compras, con o sin garantía.</span>
          </div>
        )}

        {searching && (
          <div className="warranties-placeholder">Buscando compras para cédula {cedula}...</div>
        )}

        {searched && sales.length === 0 && (
          <div className="warranties-placeholder">
            <div className="placeholder-icon">📭</div>
            <p>No se encontraron compras para la cédula <strong>{cedula}</strong>.</p>
            <span>Verifica que el número esté correcto o que la venta haya sido registrada con cédula.</span>
          </div>
        )}

        {searched && sales.length > 0 && (
          <>
            <div className="results-summary">
              <span className="results-count-badge">{sales.length}</span>
              <div>
                <strong>
                  {sales.length} compra{sales.length !== 1 ? 's' : ''} encontrada{sales.length !== 1 ? 's' : ''}
                </strong>
                <span> · Cédula {cedula}</span>
                {sales[0].customer?.name && (
                  <span className="customer-name-display"> · {sales[0].customer.name}</span>
                )}
              </div>
            </div>

            <div className="sales-list">
              {sales.map(sale => (
                <div key={sale.id} className="sale-card">

                  {/* Sale header */}
                  <div className="sale-card-header">
                    <div className="sale-header-left">
                      <div className="sale-date">{sale.soldAt ? fmtTimestamp(sale.soldAt) : '—'}</div>
                      <div className="sale-seller">
                        Vendedor: <strong>{sale.soldBy.email}</strong>
                      </div>
                      {sale.notes && (
                        <div className="sale-notes">📝 {sale.notes}</div>
                      )}
                    </div>
                    <div className="sale-header-right">
                      {hasAnyWarranty(sale) && (
                        <span className="sale-warranty-badge">🛡️ Con garantía</span>
                      )}
                      <div className="sale-total">${sale.total.toLocaleString('es-CO')}</div>
                      {sale.totalDescuento > 0 && (
                        <div className="sale-discount-note">
                          Descuento: -${sale.totalDescuento.toLocaleString('es-CO')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  <div className="sale-items">
                    {sale.items.map((item, idx) => (
                      <div key={idx} className={`sale-item ${item.hasWarranty ? 'sale-item--warranty' : ''}`}>
                        <div className="sale-item-main">
                          <div className="sale-item-name">{item.name}</div>
                          <span className="sale-item-brand">{item.brand}</span>
                        </div>

                        <div className="sale-item-pricing">
                          {item.discount > 0 ? (
                            <>
                              <span className="price-original">${item.price.toLocaleString('es-CO')}</span>
                              <span className="price-discount">-${item.discount.toLocaleString('es-CO')}</span>
                              <span className="price-final">${item.finalPrice.toLocaleString('es-CO')}</span>
                            </>
                          ) : (
                            <span className="price-final">${item.finalPrice.toLocaleString('es-CO')}</span>
                          )}
                          <span className="price-qty">× {item.quantity}</span>
                          <span className="price-subtotal">${item.subtotal.toLocaleString('es-CO')}</span>
                        </div>

                        {/* Warranty block */}
                        {item.hasWarranty && item.warrantyEnd && (
                          <div className="warranty-block">
                            <div className={`warranty-status warranty-status--${warrantyStatus(item.warrantyEnd)}`}>
                              {warrantyStatus(item.warrantyEnd) === 'vigente' ? '✅ Garantía vigente' : '⏰ Garantía vencida'}
                            </div>
                            <div className="warranty-dates">
                              <span>
                                Del <strong>{item.warrantyStart ? fmtDateShort(item.warrantyStart) : '—'}</strong>
                                {' '}al{' '}
                                <strong>{fmtDateShort(item.warrantyEnd)}</strong>
                              </span>
                              <span className="warranty-hours-badge">
                                🕐 {item.warrantyHours ?? '9:00am – 3:00pm'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
