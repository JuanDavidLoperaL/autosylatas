import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, onSnapshot, doc, writeBatch, serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useCurrentUser, getRoleLabel } from '../hooks/useCurrentUser'
import logo from '../assets/logo.png'
import './SearchPage.css'

interface Product {
  id: string
  brand: string
  name: string
  nameLower: string
  otherNames: string[]
  price: number
  unitsPrincipal: number
  unitsBodega: number
  unitsTotal: number
  available: boolean
  condition: string
  compatibleModels: string
  notes: string
}

interface CartItem {
  productId: string
  name: string
  brand: string
  price: number
  quantity: number
  maxQuantity: number
  unitsPrincipal: number
  unitsBodega: number
  condition: string
}

interface ItemExtra {
  discountStr: string
  discount: number
  hasWarranty: boolean
  warrantyEnd: string  // YYYY-MM-DD
}

const formatCOP = (value: string): string => {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('es-CO')
}

const parseCOP = (value: string): number =>
  Number(value.replace(/\./g, '').replace(/,/g, ''))

const todayStr = () => new Date().toISOString().split('T')[0]

const defaultWarrantyEnd = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1) // domingo → lunes
  return d.toISOString().split('T')[0]
}

export default function SearchPage() {
  const navigate = useNavigate()
  const { user, role } = useCurrentUser()

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('Todas')
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)

  // Checkout state
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [itemExtras, setItemExtras] = useState<Record<string, ItemExtra>>({})
  const [customer, setCustomer] = useState({ cedula: '', name: '' })
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [saleNotes, setSaleNotes] = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [selling, setSelling] = useState(false)
  const [saleResult, setSaleResult] = useState<'success' | 'error' | null>(null)
  const [saleError, setSaleError] = useState('')
  const [lastSaleTotal, setLastSaleTotal] = useState(0)
  const [lastPaymentMethod, setLastPaymentMethod] = useState<'efectivo' | 'transferencia'>('efectivo')

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), snap => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Product))
        .filter(p => p.available && p.unitsTotal > 0)
      setProducts(data)
      setLoading(false)
    })
    return unsub
  }, [])

  const brands = ['Todas', ...Array.from(new Set(products.map(p => p.brand))).sort()]

  const filtered = products.filter(p => {
    const matchBrand = brandFilter === 'Todas' || p.brand === brandFilter
    const term = search.toLowerCase().trim()
    const matchSearch = !term ||
      p.nameLower?.includes(term) ||
      p.brand.toLowerCase().includes(term) ||
      p.otherNames?.some(n => n.toLowerCase().includes(term)) ||
      p.compatibleModels?.toLowerCase().includes(term)
    return matchBrand && matchSearch
  })

  // Cart helpers
  const cartSubtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)
  const cartQty = (productId: string) => cart.find(i => i.productId === productId)?.quantity ?? 0

  const addToCart = (p: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === p.id)
      if (existing) {
        if (existing.quantity >= p.unitsTotal) return prev
        return prev.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, {
        productId: p.id, name: p.name, brand: p.brand, price: p.price,
        quantity: 1, maxQuantity: p.unitsTotal,
        unitsPrincipal: p.unitsPrincipal, unitsBodega: p.unitsBodega,
        condition: p.condition,
      }]
    })
  }

  const updateQty = (productId: string, qty: number) => {
    const max = products.find(p => p.id === productId)?.unitsTotal ?? 999
    const clamped = Math.max(0, Math.min(qty, max))
    if (clamped === 0) setCart(prev => prev.filter(i => i.productId !== productId))
    else setCart(prev => prev.map(i => i.productId === productId ? { ...i, quantity: clamped } : i))
  }

  const removeFromCart = (productId: string) =>
    setCart(prev => prev.filter(i => i.productId !== productId))

  // Open checkout: initialize per-item extras
  const openCheckout = () => {
    const end = defaultWarrantyEnd()
    const extras: Record<string, ItemExtra> = {}
    cart.forEach(item => {
      extras[item.productId] = { discountStr: '', discount: 0, hasWarranty: false, warrantyEnd: end }
    })
    setItemExtras(extras)
    setCustomer({ cedula: '', name: '' })
    setPaymentMethod('efectivo')
    setSaleNotes('')
    setCheckoutError('')
    setCheckoutOpen(true)
  }

  const setExtra = (productId: string, patch: Partial<ItemExtra>) =>
    setItemExtras(prev => ({ ...prev, [productId]: { ...prev[productId], ...patch } }))

  const handleDiscountInput = (productId: string, raw: string) => {
    const formatted = formatCOP(raw)
    const discount = parseCOP(formatted)
    setExtra(productId, { discountStr: formatted, discount })
  }

  // Derived checkout totals — discount is flat per line, NOT per unit
  const finalTotal = cart.reduce((sum, item) => {
    const discount = itemExtras[item.productId]?.discount ?? 0
    return sum + Math.max(0, item.price * item.quantity - discount)
  }, 0)

  const totalDiscount = cart.reduce((sum, item) => {
    const discount = itemExtras[item.productId]?.discount ?? 0
    return sum + discount
  }, 0)

  const anyWarranty = cart.some(i => itemExtras[i.productId]?.hasWarranty)

  const confirmSale = async () => {
    if (!user || cart.length === 0) return

    // Validate warranty requires cédula
    if (anyWarranty && !customer.cedula.trim()) {
      setCheckoutError('La cédula del cliente es obligatoria cuando se otorga garantía.')
      return
    }

    setSelling(true)
    setCheckoutError('')
    try {
      const batch = writeBatch(db)
      const actor = { uid: user.uid, email: user.email ?? '' }
      const saleDate = todayStr()

      const saleRef = doc(collection(db, 'sales'))
      batch.set(saleRef, {
        items: cart.map(item => {
          const extra = itemExtras[item.productId]
          const discount = extra?.discount ?? 0
          const subtotal = Math.max(0, item.price * item.quantity - discount)
          return {
            productId: item.productId,
            name: item.name,
            brand: item.brand,
            price: item.price,
            discount,
            quantity: item.quantity,
            subtotal,
            hasWarranty: extra?.hasWarranty ?? false,
            ...(extra?.hasWarranty ? {
              warrantyStart: saleDate,
              warrantyEnd: extra.warrantyEnd,
              warrantyHours: '9:00am - 3:00pm',
            } : {}),
          }
        }),
        subtotalSinDescuento: cartSubtotal,
        totalDescuento: totalDiscount,
        total: finalTotal,
        paymentMethod,
        ...(customer.cedula.trim() ? {
          customer: {
            cedula: customer.cedula.trim(),
            name: customer.name.trim() || null,
          }
        } : {}),
        soldBy: actor,
        soldAt: serverTimestamp(),
        notes: saleNotes.trim(),
      })

      // Update inventory
      for (const item of cart) {
        const product = products.find(p => p.id === item.productId)
        if (!product) continue
        let principal = product.unitsPrincipal
        let bodega = product.unitsBodega
        let toDeduct = item.quantity
        if (principal >= toDeduct) {
          principal -= toDeduct
        } else {
          toDeduct -= principal
          principal = 0
          bodega = Math.max(0, bodega - toDeduct)
        }
        const newTotal = principal + bodega
        batch.update(doc(db, 'products', item.productId), {
          unitsPrincipal: principal,
          unitsBodega: bodega,
          unitsTotal: newTotal,
          available: newTotal > 0,
          updatedBy: actor,
          updatedAt: serverTimestamp(),
        })
      }

      await batch.commit()
      setLastSaleTotal(finalTotal)
      setLastPaymentMethod(paymentMethod)
      setCart([])
      setCheckoutOpen(false)
      setSaleResult('success')
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : String(err))
      setSaleResult('error')
    } finally {
      setSelling(false)
    }
  }

  return (
    <div className="search-page">

      <header className="search-header">
        <div className="search-header-left">
          <img src={logo} alt="Autos y Latas" className="search-logo" />
          <div className="search-brand">
            <span>Autos &amp; Latas</span>
            <span>Panel interno</span>
          </div>
        </div>
        <div className="search-header-right">
          <span className={`role-badge role-${role}`}>{getRoleLabel(role)}</span>
          <button className="btn-back" onClick={() => navigate('/dashboard')}>← Panel</button>
          <button className="btn-cart-mobile" onClick={() => setCartOpen(true)}>
            🛒
            {cartCount > 0 && <span className="cart-count-badge">{cartCount}</span>}
          </button>
        </div>
      </header>

      <div className="search-layout">

        {/* ── Products ── */}
        <div className="search-left">
          <div className="search-controls">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Buscar por nombre, modelo, alias..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
            </div>
            <select className="brand-select" value={brandFilter} onChange={e => setBrandFilter(e.target.value)}>
              {brands.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>

          <p className="results-count">
            {loading ? 'Cargando...' : `${filtered.length} pieza${filtered.length !== 1 ? 's' : ''} disponible${filtered.length !== 1 ? 's' : ''}`}
            {brandFilter !== 'Todas' && ` · ${brandFilter}`}
          </p>

          {loading ? (
            <div className="products-empty">Cargando inventario...</div>
          ) : filtered.length === 0 ? (
            <div className="products-empty">No se encontraron piezas con ese criterio.</div>
          ) : (
            <div className="products-grid">
              {filtered.map(p => {
                const inCart = cartQty(p.id)
                return (
                  <div key={p.id} className="product-card">
                    <div className="product-card-top">
                      <div className="product-header">
                        <span className="product-brand-badge">{p.brand}</span>
                        <span className={`product-cond cond-${p.condition?.toLowerCase()}`}>{p.condition}</span>
                      </div>
                      <h3 className="product-name">{p.name}</h3>
                      {p.otherNames?.length > 0 && <p className="product-aliases">{p.otherNames.join(' · ')}</p>}
                      {p.compatibleModels && <p className="product-models">🚗 {p.compatibleModels}</p>}
                      {p.notes && <p className="product-notes">📝 {p.notes}</p>}
                    </div>
                    <div className="product-card-bottom">
                      <div className="product-stock">
                        <div className="stock-pill">
                          <span>🏪 Local</span>
                          <strong>{p.unitsPrincipal}</strong>
                        </div>
                        <div className="stock-pill">
                          <span>🏭 Bodega</span>
                          <strong>{p.unitsBodega}</strong>
                        </div>
                        <div className="stock-pill stock-pill--total">
                          <span>Total</span>
                          <strong>{p.unitsTotal}</strong>
                        </div>
                      </div>
                      <div className="product-footer">
                        <div className="product-price">${p.price.toLocaleString('es-CO')}</div>
                        {inCart === 0 ? (
                          <button className="btn-add-cart" onClick={() => addToCart(p)}>+ Agregar</button>
                        ) : (
                          <div className="qty-controls">
                            <button className="qty-btn" onClick={() => updateQty(p.id, inCart - 1)}>−</button>
                            <span className="qty-value">{inCart}</span>
                            <button className="qty-btn" onClick={() => updateQty(p.id, inCart + 1)} disabled={inCart >= p.unitsTotal}>+</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Cart sidebar (desktop) ── */}
        <div className="cart-panel">
          <CartContent
            cart={cart} cartSubtotal={cartSubtotal}
            updateQty={updateQty} removeFromCart={removeFromCart}
            onCheckout={openCheckout}
          />
        </div>
      </div>

      {/* ── Mobile cart drawer ── */}
      {cartOpen && (
        <div className="cart-drawer-overlay" onClick={() => setCartOpen(false)}>
          <div className="cart-drawer" onClick={e => e.stopPropagation()}>
            <div className="cart-drawer-header">
              <h3>🛒 Carrito</h3>
              <button className="cart-drawer-close" onClick={() => setCartOpen(false)}>✕</button>
            </div>
            <CartContent
              cart={cart} cartSubtotal={cartSubtotal}
              updateQty={updateQty} removeFromCart={removeFromCart}
              onCheckout={() => { setCartOpen(false); openCheckout() }}
            />
          </div>
        </div>
      )}

      {/* ── CHECKOUT MODAL ── */}
      {checkoutOpen && (
        <div className="modal-overlay" onClick={() => !selling && setCheckoutOpen(false)}>
          <div className="checkout-modal" onClick={e => e.stopPropagation()}>

            <div className="checkout-header">
              <h2>💰 Confirmar venta</h2>
              <button className="modal-close" onClick={() => setCheckoutOpen(false)}>✕</button>
            </div>

            <div className="checkout-body">

              {/* Items */}
              <div className="checkout-section-title">Piezas</div>
              {cart.map(item => {
                const extra = itemExtras[item.productId] ?? { discountStr: '', discount: 0, hasWarranty: false, warrantyEnd: defaultWarrantyEnd() }
                const lineTotal = Math.max(0, item.price * item.quantity - extra.discount)
                return (
                  <div key={item.productId} className="checkout-item-card">
                    <div className="ci-header">
                      <div className="ci-name">{item.name}</div>
                      <span className="ci-brand">{item.brand}</span>
                      <span className={`ci-cond cond-${item.condition?.toLowerCase()}`}>{item.condition}</span>
                    </div>

                    <div className="ci-row">
                      <div className="ci-field">
                        <span className="ci-label">Precio unitario</span>
                        <span className="ci-value">${item.price.toLocaleString('es-CO')}</span>
                      </div>
                      <div className="ci-field">
                        <span className="ci-label">Cantidad</span>
                        <span className="ci-value">{item.quantity}</span>
                      </div>
                      <div className="ci-field">
                        <label className="ci-label" htmlFor={`disc-${item.productId}`}>
                          Descuento línea
                        </label>
                        <div className="ci-discount-input">
                          <span>$</span>
                          <input
                            id={`disc-${item.productId}`}
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={extra.discountStr}
                            onChange={e => handleDiscountInput(item.productId, e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="ci-field">
                        <span className="ci-label">Total línea</span>
                        <span className="ci-value ci-subtotal">${lineTotal.toLocaleString('es-CO')}</span>
                      </div>
                    </div>

                    {/* Warranty per item */}
                    <div className="ci-warranty-row">
                      <button
                        type="button"
                        className={`toggle ${extra.hasWarranty ? 'on' : ''}`}
                        onClick={() => setExtra(item.productId, { hasWarranty: !extra.hasWarranty })}
                      >
                        <span className="toggle-knob" />
                      </button>
                      <span className="ci-warranty-label">
                        {extra.hasWarranty ? '🛡️ Con garantía' : 'Sin garantía'}
                      </span>
                      {extra.hasWarranty && (
                        <div className="ci-warranty-date">
                          <span>Válida hasta</span>
                          <input
                            type="date"
                            min={todayStr()}
                            value={extra.warrantyEnd}
                            onChange={e => setExtra(item.productId, { warrantyEnd: e.target.value })}
                          />
                          <span className="ci-warranty-hours">9:00am – 3:00pm</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Customer info — always visible, cédula required only if warranty */}
              <div className={`checkout-customer-section ${!anyWarranty ? 'customer-section--optional' : ''}`}>
                <div className="checkout-section-title">
                  {anyWarranty
                    ? '🛡️ Datos del cliente — cédula requerida por garantía'
                    : '👤 Datos del cliente (opcional, para historial)'}
                </div>
                <div className="customer-fields">
                  <div className="customer-field">
                    <label>
                      Cédula
                      {anyWarranty
                        ? <span className="req"> *</span>
                        : <span className="opt"> (opcional)</span>}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Número de cédula"
                      value={customer.cedula}
                      onChange={e => setCustomer(c => ({ ...c, cedula: e.target.value }))}
                    />
                  </div>
                  <div className="customer-field">
                    <label>Nombre del cliente <span className="opt">(opcional)</span></label>
                    <input
                      type="text"
                      placeholder="Nombre completo"
                      value={customer.name}
                      onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Payment method */}
              <div className="checkout-payment-section">
                <div className="checkout-section-title">Forma de pago</div>
                <div className="payment-method-btns">
                  <button
                    type="button"
                    className={`payment-btn ${paymentMethod === 'efectivo' ? 'payment-btn--active' : ''}`}
                    onClick={() => setPaymentMethod('efectivo')}
                  >
                    💵 Efectivo
                  </button>
                  <button
                    type="button"
                    className={`payment-btn ${paymentMethod === 'transferencia' ? 'payment-btn--active' : ''}`}
                    onClick={() => setPaymentMethod('transferencia')}
                  >
                    📲 Transferencia
                  </button>
                </div>
              </div>

              {/* Totals summary */}
              <div className="checkout-totals">
                {totalDiscount > 0 && (
                  <>
                    <div className="totals-row">
                      <span>Subtotal</span>
                      <span>${cartSubtotal.toLocaleString('es-CO')}</span>
                    </div>
                    <div className="totals-row totals-row--discount">
                      <span>Descuento total</span>
                      <span>- ${totalDiscount.toLocaleString('es-CO')}</span>
                    </div>
                  </>
                )}
                <div className="totals-row totals-row--final">
                  <span>Total a cobrar</span>
                  <strong>${finalTotal.toLocaleString('es-CO')}</strong>
                </div>
              </div>

              {/* Notes + seller */}
              <div className="checkout-notes-field">
                <label>Notas (opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Forma de pago, referencia, observaciones..."
                  value={saleNotes}
                  onChange={e => setSaleNotes(e.target.value)}
                />
              </div>

              <div className="checkout-seller">
                <span>Vendedor:</span>
                <strong>{user?.email}</strong>
                <span className={`role-badge role-${role}`}>{getRoleLabel(role)}</span>
              </div>

              {checkoutError && (
                <div className="checkout-error">⚠️ {checkoutError}</div>
              )}
            </div>

            <div className="checkout-footer">
              <button className="btn-cancel-modal" onClick={() => setCheckoutOpen(false)}>
                Cancelar
              </button>
              <button className="btn-confirm-sale" onClick={confirmSale} disabled={selling}>
                {selling ? 'Registrando...' : '✅ Confirmar y registrar venta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sale success ── */}
      {saleResult === 'success' && (
        <div className="modal-overlay">
          <div className="result-modal result-modal--success">
            <div className="result-icon">✅</div>
            <h3>¡Venta registrada!</h3>
            <p>
              Venta por <strong>${lastSaleTotal.toLocaleString('es-CO')}</strong> en{' '}
              <strong>{lastPaymentMethod === 'efectivo' ? '💵 efectivo' : '📲 transferencia'}</strong>{' '}
              guardada. El inventario fue actualizado.
            </p>
            <div className="result-actions">
              <button className="btn-secondary" onClick={() => setSaleResult(null)}>Seguir vendiendo</button>
              <button className="btn-primary" onClick={() => navigate('/dashboard')}>Ir al panel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sale error ── */}
      {saleResult === 'error' && (
        <div className="modal-overlay">
          <div className="result-modal result-modal--error">
            <div className="result-icon">❌</div>
            <h3>Error al registrar la venta</h3>
            <p className="error-msg">{saleError}</p>
            <button className="btn-primary" onClick={() => setSaleResult(null)}>Intentar de nuevo</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Cart content (shared between sidebar and drawer) ──
function CartContent({
  cart, cartSubtotal, updateQty, removeFromCart, onCheckout,
}: {
  cart: CartItem[]
  cartSubtotal: number
  updateQty: (id: string, qty: number) => void
  removeFromCart: (id: string) => void
  onCheckout: () => void
}) {
  if (cart.length === 0) {
    return (
      <div className="cart-empty">
        <div className="cart-empty-icon">🛒</div>
        <p>El carrito está vacío</p>
        <span>Agrega piezas desde el listado</span>
      </div>
    )
  }

  return (
    <div className="cart-content">
      <div className="cart-items">
        {cart.map(item => (
          <div key={item.productId} className="cart-item">
            <div className="cart-item-info">
              <div className="cart-item-name">{item.name}</div>
              <div className="cart-item-brand">{item.brand}</div>
              <div className="cart-item-price">${item.price.toLocaleString('es-CO')} c/u</div>
            </div>
            <div className="cart-item-controls">
              <div className="qty-controls">
                <button className="qty-btn" onClick={() => updateQty(item.productId, item.quantity - 1)}>−</button>
                <input
                  type="number"
                  className="qty-input"
                  value={item.quantity}
                  min={1}
                  max={item.maxQuantity}
                  onChange={e => updateQty(item.productId, Number(e.target.value))}
                />
                <button className="qty-btn" onClick={() => updateQty(item.productId, item.quantity + 1)} disabled={item.quantity >= item.maxQuantity}>+</button>
              </div>
              <div className="cart-item-row2">
                <span className="cart-item-subtotal">${(item.price * item.quantity).toLocaleString('es-CO')}</span>
                <button className="btn-remove" onClick={() => removeFromCart(item.productId)}>🗑️</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="cart-footer">
        <div className="cart-total-row">
          <span>Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)} ítems)</span>
          <strong className="cart-total">${cartSubtotal.toLocaleString('es-CO')}</strong>
        </div>
        <button className="btn-checkout" onClick={onCheckout}>💰 Vender</button>
      </div>
    </div>
  )
}
