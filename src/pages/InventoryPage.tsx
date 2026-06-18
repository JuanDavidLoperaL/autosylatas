import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc,
  setDoc, serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useCurrentUser, getRoleLabel } from '../hooks/useCurrentUser'
import logo from '../assets/logo.png'
import './InventoryPage.css'

const CONDICIONES = ['Excelente', 'Bueno', 'Regular']

const formatCOP = (value: string): string => {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('es-CO')
}

const parseCOP = (value: string): number =>
  Number(value.replace(/\./g, '').replace(/,/g, ''))

const toTitleCase = (str: string): string =>
  str.trim().replace(/\b\w/g, c => c.toUpperCase())

const fmtDate = (ts: Timestamp | null | undefined): string => {
  if (!ts) return '—'
  return ts.toDate().toLocaleString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const shortEmail = (email: string) => email.split('@')[0]

interface Actor { uid: string; email: string }

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
  createdBy?: Actor
  createdAt?: Timestamp
  updatedBy?: Actor
  updatedAt?: Timestamp
}

const EMPTY_EDIT = {
  name: '',
  otherNames: [] as string[],
  otherNameInput: '',
  price: '',
  unitsPrincipal: '0',
  unitsBodega: '0',
  condition: 'Bueno',
  available: true,
  compatibleModels: '',
  notes: '',
}

export default function InventoryPage() {
  const navigate = useNavigate()
  const { user, role, isAdmin } = useCurrentUser()

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('Todas')

  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_EDIT)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'success' | 'pending' | 'error' | null>(null)
  const [saveError, setSaveError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product))
      setProducts(data)
      setLoading(false)
    }, err => {
      console.error(err)
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

  const openEdit = (p: Product) => {
    setEditProduct(p)
    setEditForm({
      name: p.name,
      otherNames: p.otherNames ?? [],
      otherNameInput: '',
      price: p.price.toLocaleString('es-CO'),
      unitsPrincipal: String(p.unitsPrincipal),
      unitsBodega: String(p.unitsBodega),
      condition: p.condition,
      available: p.available,
      compatibleModels: p.compatibleModels ?? '',
      notes: p.notes ?? '',
    })
    setSaveResult(null)
    setSaveError('')
  }

  const setEF = (field: string, value: unknown) =>
    setEditForm(f => ({ ...f, [field]: value }))

  const addOtherName = () => {
    const n = editForm.otherNameInput.trim()
    if (n && !editForm.otherNames.includes(n)) {
      setEF('otherNames', [...editForm.otherNames, n])
      setEF('otherNameInput', '')
    }
  }

  const totalUnits = Number(editForm.unitsPrincipal || 0) + Number(editForm.unitsBodega || 0)

  const handleSave = async () => {
    if (!editProduct || !user) return
    setSaving(true)
    setSaveResult(null)
    try {
      const name = toTitleCase(editForm.name)
      const otherNames = editForm.otherNames.map(toTitleCase)
      const compatibleModels = toTitleCase(editForm.compatibleModels)

      const changedData = {
        name,
        nameLower: name.toLowerCase(),
        otherNames,
        otherNamesLower: otherNames.map(n => n.toLowerCase()),
        price: parseCOP(editForm.price),
        unitsPrincipal: Number(editForm.unitsPrincipal),
        unitsBodega: Number(editForm.unitsBodega),
        unitsTotal: totalUnits,
        condition: editForm.condition,
        available: editForm.available,
        compatibleModels,
        notes: editForm.notes.trim(),
      }

      const actor = { uid: user.uid, email: user.email ?? '' }

      if (isAdmin) {
        await updateDoc(doc(db, 'products', editProduct.id), {
          ...changedData,
          updatedBy: actor,
          updatedAt: serverTimestamp(),
        })
        setSaveResult('success')
      } else {
        const ref = doc(collection(db, 'pendingChanges'))
        await setDoc(ref, {
          type: 'edit',
          productId: editProduct.id,
          productName: editProduct.name,
          productBrand: editProduct.brand,
          data: changedData,
          requestedBy: actor,
          requestedAt: serverTimestamp(),
          status: 'pending',
          reviewedBy: null,
          reviewedAt: null,
          rejectionReason: '',
        })
        setSaveResult('pending')
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err))
      setSaveResult('error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteDoc(doc(db, 'products', deleteTarget.id))
      setDeleteTarget(null)
      setEditProduct(null)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="inv-page">

      <header className="inv-header">
        <div className="inv-header-left">
          <img src={logo} alt="Autos y Latas" className="inv-logo" />
          <div className="inv-brand">
            <span>Autos &amp; Latas</span>
            <span>Panel interno</span>
          </div>
        </div>
        <div className="inv-header-right">
          <span className={`role-badge role-${role}`}>{getRoleLabel(role)}</span>
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            ← Volver al panel
          </button>
        </div>
      </header>

      <main className="inv-main">

        <div className="inv-title-row">
          <div>
            <h1>📦 Inventario</h1>
            <p className="inv-subtitle">
              {loading ? 'Cargando...' : `${filtered.length} de ${products.length} productos`}
            </p>
          </div>
          <button className="btn-add" onClick={() => navigate('/agregar')}>
            + Agregar producto
          </button>
        </div>

        <div className="inv-filters">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Buscar por nombre, línea, modelo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
          <select
            className="brand-select"
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value)}
          >
            {brands.map(b => <option key={b}>{b}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="inv-loading">Cargando inventario...</div>
        ) : filtered.length === 0 ? (
          <div className="inv-empty">
            {products.length === 0
              ? 'No hay productos aún. ¡Agrega tu primera pieza!'
              : 'No se encontraron productos con ese filtro.'}
            <button className="btn-add-new" onClick={() => navigate('/agregar')}>
              + Agregar nuevo producto
            </button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Línea</th>
                  <th>Precio</th>
                  <th>Principal</th>
                  <th>Bodega</th>
                  <th>Total</th>
                  <th>Condición</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-name">{p.name}</div>
                      {p.otherNames?.length > 0 && (
                        <div className="cell-alias">{p.otherNames.join(', ')}</div>
                      )}
                      {p.compatibleModels && (
                        <div className="cell-models">{p.compatibleModels}</div>
                      )}
                      <div className="cell-audit-group">
                        {p.createdBy && (
                          <span className="cell-audit">
                            ✦ {shortEmail(p.createdBy.email)} · {fmtDate(p.createdAt)}
                          </span>
                        )}
                        {p.updatedBy && (
                          <span className="cell-audit cell-audit--edit">
                            ✎ {shortEmail(p.updatedBy.email)} · {fmtDate(p.updatedAt)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td><span className="brand-badge">{p.brand}</span></td>
                    <td className="cell-price">${p.price.toLocaleString('es-CO')}</td>
                    <td className="cell-units">{p.unitsPrincipal}</td>
                    <td className="cell-units">{p.unitsBodega}</td>
                    <td>
                      <span className={`total-badge ${p.unitsTotal === 0 ? 'zero' : ''}`}>
                        {p.unitsTotal}
                      </span>
                    </td>
                    <td>
                      <span className={`cond-badge cond-${p.condition?.toLowerCase()}`}>
                        {p.condition}
                      </span>
                    </td>
                    <td>
                      <span className={`status-dot ${p.available ? 'on' : 'off'}`}>
                        {p.available ? 'Disponible' : 'No disponible'}
                      </span>
                    </td>
                    <td>
                      <button className="btn-edit" onClick={() => openEdit(p)}>
                        ✏️ Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── MODAL EDICIÓN ── */}
      {editProduct && (
        <div className="modal-overlay" onClick={() => !saving && setEditProduct(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>

            {saveResult === 'success' && (
              <div className="modal-result modal-result--success">
                <div className="modal-result-icon">✅</div>
                <h3>¡Cambios guardados!</h3>
                <p>El producto fue actualizado correctamente.</p>
                <button onClick={() => setEditProduct(null)}>Cerrar</button>
              </div>
            )}

            {saveResult === 'pending' && (
              <div className="modal-result modal-result--pending">
                <div className="modal-result-icon">⏳</div>
                <h3>Solicitud enviada</h3>
                <p>Tu edición quedará pendiente hasta que un administrador la apruebe.</p>
                <button onClick={() => setEditProduct(null)}>Cerrar</button>
              </div>
            )}

            {saveResult === 'error' && (
              <div className="modal-result modal-result--error">
                <div className="modal-result-icon">❌</div>
                <h3>Error al guardar</h3>
                <p className="result-error-msg">{saveError}</p>
                <button onClick={() => setSaveResult(null)}>Corregir</button>
              </div>
            )}

            {!saveResult && (
              <>
                <div className="modal-header">
                  <div>
                    <h2>✏️ Editar pieza</h2>
                    <p className="modal-brand">Línea: <strong>{editProduct.brand}</strong></p>
                  </div>
                  <button className="modal-close" onClick={() => setEditProduct(null)}>✕</button>
                </div>

                <div className="modal-body">

                  <div className="field">
                    <label>Nombre del producto</label>
                    <input value={editForm.name} onChange={e => setEF('name', e.target.value)} />
                  </div>

                  <div className="field">
                    <label>Modelos compatibles</label>
                    <input
                      value={editForm.compatibleModels}
                      onChange={e => setEF('compatibleModels', e.target.value)}
                      placeholder="Ej: Corolla 2005-2010, Yaris 2008..."
                    />
                  </div>

                  <div className="field">
                    <label>Otros nombres</label>
                    <div className="tag-input-row">
                      <input
                        value={editForm.otherNameInput}
                        onChange={e => setEF('otherNameInput', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOtherName() } }}
                        placeholder="Agregar alias..."
                      />
                      <button type="button" className="btn-add-tag" onClick={addOtherName}>+ Agregar</button>
                    </div>
                    {editForm.otherNames.length > 0 && (
                      <div className="tags">
                        {editForm.otherNames.map(n => (
                          <span key={n} className="tag">
                            {n}
                            <button type="button" onClick={() =>
                              setEF('otherNames', editForm.otherNames.filter(x => x !== n))
                            }>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="modal-grid">
                    <div className="field">
                      <label>Precio (COP)</label>
                      <div className="input-prefix">
                        <span>$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editForm.price}
                          onChange={e => setEF('price', formatCOP(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label>Condición</label>
                      <div className="segmented">
                        {CONDICIONES.map(c => (
                          <button
                            key={c}
                            type="button"
                            className={editForm.condition === c ? 'active' : ''}
                            onClick={() => setEF('condition', c)}
                          >{c}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="stock-grid">
                    <div className="stock-card">
                      <div className="stock-card-header">
                        <span className="stock-icon">🏪</span>
                        <div>
                          <strong>Local principal</strong>
                          <p>Unidades en el local</p>
                        </div>
                      </div>
                      <input
                        type="number" min="0"
                        value={editForm.unitsPrincipal}
                        onChange={e => setEF('unitsPrincipal', e.target.value)}
                        className="stock-input"
                      />
                    </div>
                    <div className="stock-card">
                      <div className="stock-card-header">
                        <span className="stock-icon">🏭</span>
                        <div>
                          <strong>Bodega</strong>
                          <p>Unidades en bodega</p>
                        </div>
                      </div>
                      <input
                        type="number" min="0"
                        value={editForm.unitsBodega}
                        onChange={e => setEF('unitsBodega', e.target.value)}
                        className="stock-input"
                      />
                    </div>
                    <div className="stock-total">
                      <span className="stock-total-label">Total</span>
                      <span className="stock-total-number">{totalUnits}</span>
                      <span className="stock-total-unit">uds</span>
                    </div>
                  </div>

                  <div className="field">
                    <label>¿Disponible para venta?</label>
                    <div className="toggle-row">
                      <button
                        type="button"
                        className={`toggle ${editForm.available ? 'on' : ''}`}
                        onClick={() => setEF('available', !editForm.available)}
                      >
                        <span className="toggle-knob" />
                      </button>
                      <span className="toggle-label">
                        {editForm.available ? 'Sí, disponible' : 'No disponible'}
                      </span>
                    </div>
                  </div>

                  <div className="field">
                    <label>Notas</label>
                    <textarea rows={2} value={editForm.notes} onChange={e => setEF('notes', e.target.value)} />
                  </div>

                  {/* ── AUDITORÍA ── */}
                  <div className="audit-section">
                    <div className="audit-title">Auditoría</div>
                    <div className="audit-rows">
                      <div className="audit-row">
                        <span className="audit-label">Creado por</span>
                        <span className="audit-value">
                          {editProduct.createdBy
                            ? `${editProduct.createdBy.email} · ${fmtDate(editProduct.createdAt)}`
                            : '—'}
                        </span>
                      </div>
                      <div className="audit-row">
                        <span className="audit-label">Última edición</span>
                        <span className="audit-value">
                          {editProduct.updatedBy
                            ? `${editProduct.updatedBy.email} · ${fmtDate(editProduct.updatedAt)}`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

                <div className="modal-footer">
                  {isAdmin && (
                    <button className="btn-delete" onClick={() => setDeleteTarget(editProduct)}>
                      🗑️ Eliminar
                    </button>
                  )}
                  <div className="modal-footer-right">
                    <button className="btn-cancel-modal" onClick={() => setEditProduct(null)}>
                      Cancelar
                    </button>
                    <button className="btn-save-modal" onClick={handleSave} disabled={saving}>
                      {saving
                        ? 'Guardando...'
                        : isAdmin
                          ? '💾 Guardar cambios'
                          : '📤 Enviar para aprobación'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── CONFIRM ELIMINAR ── */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-box modal-box--small">
            <div className="delete-confirm">
              <div className="delete-icon">🗑️</div>
              <h3>¿Eliminar producto?</h3>
              <p>
                Vas a eliminar <strong>"{deleteTarget.name}"</strong> ({deleteTarget.brand}).
                Esta acción no se puede deshacer.
              </p>
              <div className="delete-actions">
                <button className="btn-cancel-modal" onClick={() => setDeleteTarget(null)}>
                  Cancelar
                </button>
                <button className="btn-delete-confirm" onClick={handleDelete}>
                  Sí, eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
