import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, collection, setDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useCurrentUser, getRoleLabel } from '../hooks/useCurrentUser'
import logo from '../assets/logo.png'
import './AddProductPage.css'

const LINEAS_SUGERIDAS = [
  // Renault
  'Renault 9', 'Renault Clio Face 1', 'Renault Symbol 8 Valvulas', 'Renault Symbol 16 Valvulas', 'Renault Duster', 'Renault Sandero 8 Valvulas', 'Renault Sandero 16 Valvulas', 'Renault Logan', 'Renault Kwid',
  'Renault Clio', 'Renault Symbol', 'Renault Symbol 2', 'Renault Megane', 'Renault Koleos', 'Renault Captur',
  // Mazda
  'Mazda Demio', 'Mazda 323', 'Mazda 2', 'Mazda 3', 'Mazda 6', 'Mazda CX-3', 'Mazda CX-5', 'Mazda CX-30', 'Mazda BT-50',
  // Chevrolet
  'Chevrolet Sail', 'Chevrolet Tico', 'Chevrolet 7/24', 'Chevrolet Cronos', 'Chevrolet Sprint', 'Chevrolet Spark', 'Chevrolet Aveo', 'Chevrolet Corsa',
  // Toyota
  'Toyota Corolla', 'Toyota Hilux', 'Toyota Fortuner', 'Toyota RAV4',
  'Toyota Prado', 'Toyota Yaris', 'Toyota Land Cruiser',
  // Hyundai
  'Hyundai Berna', 'Hyundai Atos', 'Hyundai Tucson',
  'Hyundai i10', 'Hyundai Grand i10', 'Hyundai Accent', 'Hyundai i25',
  // Kia
  'Kia ION', 'Kia Sephia', 'Kia Morning', 'Kia Rio 5.5', 'Kia Picanto', 'Kia Rio', 'Kia Sportage', 'Kia Sorento', 'Kia Stinger',
  // Ford
  'Ford EcoSport', 'Ford Explorer', 'Ford Escape', 'Ford F-150', 'Ford Ranger', 'Ford Fiesta',
  // Nissan
  'Nissan March', 'Nissan Versa', 'Nissan Kicks', 'Nissan X-Trail', 'Nissan Frontier',
  // Volkswagen
  'Volkswagen Polo', 'Volkswagen Golf', 'Volkswagen Jetta',
  'Volkswagen Tiguan', 'Volkswagen Amarok', 'Volkswagen T-Cross',
  // Honda
  'Honda Civic', 'Honda CR-V', 'Honda HR-V', 'Honda Fit', 'Honda Accord',
  // Mitsubishi
  'Mitsubishi Lancer', 'Mitsubishi Outlander', 'Mitsubishi L200', 'Mitsubishi Montero',
  // Suzuki
  'Suzuki Swift', 'Suzuki Alto', 'Suzuki Grand Vitara', 'Suzuki Jimny', 'Suzuki S-Presso',
  // Jac
  'Jac J13',
  'Otra',
]

const CONDICIONES = ['Excelente', 'Bueno', 'Regular']

const formatCOP = (value: string): string => {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('es-CO')
}

const parseCOP = (value: string): number =>
  Number(value.replace(/\./g, '').replace(/,/g, ''))

const toTitleCase = (str: string): string =>
  str.replace(/\b\w/g, c => c.toUpperCase())

const EMPTY_FORM = {
  brand: '',
  name: '',
  otherNames: [] as string[],
  otherNameInput: '',
  price: '',
  unitsPrincipal: '0',
  unitsBodega: '0',
  available: true,
  condition: 'Bueno',
  compatibleModels: '',
  notes: '',
}

export default function AddProductPage() {
  const navigate = useNavigate()
  const { user, role, isAdmin } = useCurrentUser()

  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<'saved' | 'pending' | 'error' | 'duplicate' | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const set = (field: string, value: unknown) =>
    setForm(f => ({ ...f, [field]: value }))

  const totalUnits = Number(form.unitsPrincipal || 0) + Number(form.unitsBodega || 0)

  const addOtherName = () => {
    const name = form.otherNameInput.trim()
    if (name && !form.otherNames.includes(name)) {
      set('otherNames', [...form.otherNames, name])
      set('otherNameInput', '')
    }
  }

  const removeOtherName = (name: string) =>
    set('otherNames', form.otherNames.filter(n => n !== name))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (!form.brand.trim() || !form.name.trim() || !form.price) {
      setErrorMsg('Marca, nombre y precio son obligatorios.')
      return
    }
    if (totalUnits === 0) {
      setErrorMsg('Debes ingresar al menos 1 unidad en Principal o Bodega.')
      return
    }
    if (!user) {
      setErrorMsg('No hay sesión activa.')
      return
    }

    setLoading(true)
    try {
      const brand = toTitleCase(form.brand)
      const name = toTitleCase(form.name)

      // Verificar duplicado: misma pieza + misma línea + misma condición
      const dupSnap = await getDocs(
        query(collection(db, 'products'),
          where('nameLower', '==', name.toLowerCase()),
          where('brand', '==', brand),
          where('condition', '==', form.condition),
        )
      )
      if (!dupSnap.empty) {
        setDuplicateName(`${name} (${brand}) — ${form.condition}`)
        setResult('duplicate')
        setLoading(false)
        return
      }
      const otherNames = form.otherNames.map(toTitleCase)
      const compatibleModels = toTitleCase(form.compatibleModels)

      const productData = {
        brand,
        name,
        nameLower: name.toLowerCase(),
        otherNames,
        otherNamesLower: otherNames.map(n => n.toLowerCase()),
        price: parseCOP(form.price),
        unitsPrincipal: Number(form.unitsPrincipal),
        unitsBodega: Number(form.unitsBodega),
        unitsTotal: totalUnits,
        available: form.available,
        condition: form.condition,
        compatibleModels,
        notes: form.notes.trim(),
      }

      const actor = { uid: user.uid, email: user.email ?? '' }

      if (isAdmin) {
        // Admin/owner: save directly
        const ref = doc(collection(db, 'products'))
        await setDoc(ref, {
          ...productData,
          createdBy: actor,
          createdAt: serverTimestamp(),
        })
        setResult('saved')
      } else {
        // vendedor/default: submit for approval
        const ref = doc(collection(db, 'pendingChanges'))
        await setDoc(ref, {
          type: 'create',
          productId: null,
          productName: name,
          productBrand: brand,
          data: productData,
          requestedBy: actor,
          requestedAt: serverTimestamp(),
          status: 'pending',
          reviewedBy: null,
          reviewedAt: null,
          rejectionReason: '',
        })
        setResult('pending')
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setResult('error')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setResult(null)
    setForm(EMPTY_FORM)
    navigate('/dashboard')
  }

  return (
    <div className="add-page">

      <header className="add-header">
        <div className="add-header-inner">
          <img src={logo} alt="Autos y Latas" className="add-logo" />
          <div className="add-brand">
            <span>Autos &amp; Latas</span>
            <span>Panel interno</span>
          </div>
        </div>
        <div className="add-header-right">
          <span className={`role-badge role-${role}`}>{getRoleLabel(role)}</span>
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            ← Volver al panel
          </button>
        </div>
      </header>

      <main className="add-main">
        <div className="add-title-row">
          <h1>➕ Agregar producto</h1>
          <p className="add-subtitle">
            {isAdmin
              ? 'Los cambios se guardan directamente en el inventario.'
              : 'Tu solicitud quedará pendiente de aprobación por un administrador.'}
          </p>
        </div>

        {/* Modal resultado */}
        {result === 'saved' && (
          <div className="feedback-overlay">
            <div className="feedback-modal feedback-modal--success">
              <div className="feedback-icon">✅</div>
              <h3>¡Pieza guardada!</h3>
              <p>El repuesto fue registrado exitosamente en el inventario.</p>
              <button className="btn-feedback-close btn-feedback-close--success" onClick={handleClose}>
                Cerrar y volver al panel
              </button>
            </div>
          </div>
        )}

        {result === 'pending' && (
          <div className="feedback-overlay">
            <div className="feedback-modal feedback-modal--pending">
              <div className="feedback-icon">⏳</div>
              <h3>Solicitud enviada</h3>
              <p>
                Tu solicitud fue enviada y quedará pendiente hasta que un administrador
                la apruebe o rechace.
              </p>
              <button className="btn-feedback-close btn-feedback-close--pending" onClick={handleClose}>
                Entendido, volver al panel
              </button>
            </div>
          </div>
        )}

        {result === 'error' && (
          <div className="feedback-overlay">
            <div className="feedback-modal feedback-modal--error">
              <div className="feedback-icon">❌</div>
              <h3>Ocurrió un error</h3>
              <p className="feedback-error-msg">{errorMsg}</p>
              <button className="btn-feedback-close btn-feedback-close--error" onClick={() => setResult(null)}>
                Cerrar y corregir
              </button>
            </div>
          </div>
        )}

        {result === 'duplicate' && (
          <div className="feedback-overlay">
            <div className="feedback-modal feedback-modal--duplicate">
              <div className="feedback-icon">⚠️</div>
              <h3>Pieza ya registrada</h3>
              <p>
                <strong>{duplicateName}</strong> ya existe en el inventario con el mismo estado.
              </p>
              <p style={{ marginTop: 8 }}>
                Si necesitas actualizarla, hazlo desde el módulo de <strong>Inventario</strong>.
              </p>
              <p className="feedback-hint">
                Puedes crear la misma pieza si tiene un estado diferente (Excelente, Bueno o Regular).
              </p>
              <div className="feedback-dup-actions">
                <button className="btn-feedback-close btn-feedback-close--neutral" onClick={() => setResult(null)}>
                  Corregir
                </button>
                <button className="btn-feedback-close btn-feedback-close--go" onClick={() => navigate('/inventario')}>
                  Ir al inventario →
                </button>
              </div>
            </div>
          </div>
        )}

        <form className="add-form" onSubmit={handleSubmit}>

          {/* ── BLOQUE 1: Identificación ── */}
          <div className="form-block">
            <h2 className="block-title">📋 Identificación del producto</h2>
            <div className="form-grid">

              <div className="field">
                <label>Línea del vehículo <span className="req">*</span></label>
                <input
                  list="lineas-list"
                  placeholder="Ej: Renault Duster, Mazda 3, Toyota Hilux..."
                  value={form.brand}
                  onChange={e => set('brand', e.target.value)}
                  required
                />
                <datalist id="lineas-list">
                  {LINEAS_SUGERIDAS.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>

              <div className="field">
                <label>Nombre del producto <span className="req">*</span></label>
                <input
                  placeholder="Ej: Motor Completo, Caja De Cambios..."
                  value={form.name}
                  onChange={e => set('name', toTitleCase(e.target.value))}
                  required
                />
              </div>

              <div className="field field-full">
                <label>Modelos compatibles</label>
                <input
                  placeholder="Ej: Corolla 2005-2010, Yaris 2008, HRV 2015..."
                  value={form.compatibleModels}
                  onChange={e => set('compatibleModels', e.target.value)}
                />
                <span className="field-hint">Separa los modelos con coma</span>
              </div>

              <div className="field field-full">
                <label>Otros nombres del producto</label>
                <div className="tag-input-row">
                  <input
                    placeholder="Ej: block, bloque, motor base..."
                    value={form.otherNameInput}
                    onChange={e => set('otherNameInput', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOtherName() } }}
                  />
                  <button type="button" className="btn-add-tag" onClick={addOtherName}>
                    + Agregar
                  </button>
                </div>
                <span className="field-hint">Presiona Enter o el botón para agregar cada nombre</span>
                {form.otherNames.length > 0 && (
                  <div className="tags">
                    {form.otherNames.map(n => (
                      <span key={n} className="tag">
                        {n}
                        <button type="button" onClick={() => removeOtherName(n)}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── BLOQUE 2: Precio ── */}
          <div className="form-block">
            <h2 className="block-title">💰 Precio y condición</h2>
            <div className="form-grid">

              <div className="field">
                <label>Precio (COP) <span className="req">*</span></label>
                <div className="input-prefix">
                  <span>$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={form.price}
                    onChange={e => set('price', formatCOP(e.target.value))}
                    required
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
                      className={form.condition === c ? 'active' : ''}
                      onClick={() => set('condition', c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* ── BLOQUE 3: Inventario por ubicación ── */}
          <div className="form-block">
            <h2 className="block-title">📦 Inventario por ubicación</h2>

            <div className="stock-grid">
              <div className="stock-card">
                <div className="stock-card-header">
                  <span className="stock-icon">🏪</span>
                  <div>
                    <strong>Local principal</strong>
                    <p>Unidades disponibles en el local</p>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  value={form.unitsPrincipal}
                  onChange={e => set('unitsPrincipal', e.target.value)}
                  className="stock-input"
                />
              </div>

              <div className="stock-card">
                <div className="stock-card-header">
                  <span className="stock-icon">🏭</span>
                  <div>
                    <strong>Bodega</strong>
                    <p>Unidades almacenadas en bodega</p>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  value={form.unitsBodega}
                  onChange={e => set('unitsBodega', e.target.value)}
                  className="stock-input"
                />
              </div>

              <div className="stock-total">
                <span className="stock-total-label">Total en inventario</span>
                <span className="stock-total-number">{totalUnits}</span>
                <span className="stock-total-unit">unidades</span>
              </div>
            </div>

            <div className="field" style={{ marginTop: '20px' }}>
              <label>¿Disponible para venta?</label>
              <div className="toggle-row">
                <button
                  type="button"
                  className={`toggle ${form.available ? 'on' : ''}`}
                  onClick={() => set('available', !form.available)}
                >
                  <span className="toggle-knob" />
                </button>
                <span className="toggle-label">
                  {form.available ? 'Sí, disponible para venta' : 'No disponible para venta'}
                </span>
              </div>
            </div>
          </div>

          {/* ── BLOQUE 4: Notas ── */}
          <div className="form-block">
            <h2 className="block-title">📝 Notas adicionales</h2>
            <div className="field">
              <label>Observaciones (opcional)</label>
              <textarea
                rows={3}
                placeholder="Estado específico, de qué vehículo viene, código de parte, etc."
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>
          </div>

          {errorMsg && !result && (
            <div className="form-error">{errorMsg}</div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={() => navigate('/dashboard')}>
              Cancelar
            </button>
            <button type="submit" className="btn-save" disabled={loading}>
              {loading
                ? 'Guardando...'
                : isAdmin
                  ? '💾 Guardar pieza'
                  : '📤 Enviar para aprobación'}
            </button>
          </div>

        </form>
      </main>
    </div>
  )
}
