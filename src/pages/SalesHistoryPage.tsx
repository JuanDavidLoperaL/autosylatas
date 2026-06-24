import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useCurrentUser, getRoleLabel } from '../hooks/useCurrentUser'
import logo from '../assets/logo.png'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import './SalesHistoryPage.css'

// ── Types ────────────────────────────────────────────────────────────────────

interface SaleItem {
  productId: string
  name: string
  brand: string
  price: number
  discount: number
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
  paymentMethod: 'efectivo' | 'transferencia'
  customer?: { cedula: string; name: string | null }
  soldBy: { uid: string; email: string }
  soldAt: Timestamp
  notes?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)

const formatTime = (ts: Timestamp) =>
  ts.toDate().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

const invoiceId = (id: string) => id.slice(-8).toUpperCase()

const emailShort = (email: string) => email.split('@')[0]


// ── PDF generation ───────────────────────────────────────────────────────────

function printInvoice(sale: Sale) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const gold: [number, number, number] = [201, 160, 39]
  const black: [number, number, number] = [17, 17, 17]
  const pageW = doc.internal.pageSize.getWidth()
  let y = 18

  // Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...black)
  doc.text('AUTOS & LATAS', pageW / 2, y, { align: 'center' })
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text('Repuestos · Medellín, Colombia', pageW / 2, y, { align: 'center' })
  y += 5
  doc.text('Tel: 300-000-0000  |  9:00am – 6:00pm', pageW / 2, y, { align: 'center' })
  y += 7

  // Gold line
  doc.setDrawColor(...gold)
  doc.setLineWidth(1)
  doc.line(14, y, pageW - 14, y)
  y += 8

  // Invoice info
  const saleDate = sale.soldAt.toDate()
  const dateStr = `${String(saleDate.getDate()).padStart(2, '0')}/${String(saleDate.getMonth() + 1).padStart(2, '0')}/${saleDate.getFullYear()} ${saleDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...black)
  doc.text(`Factura #${invoiceId(sale.id)}`, 14, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  doc.text(`Fecha: ${dateStr}`, 14, y)
  y += 5
  doc.text(`Vendedor: ${sale.soldBy.email}`, 14, y)
  y += 5

  if (sale.customer) {
    doc.text(`Cliente: ${sale.customer.cedula}${sale.customer.name ? ' — ' + sale.customer.name : ''}`, 14, y)
    y += 5
  }
  y += 4

  // Products table
  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Línea', 'Cant.', 'Precio unit.', 'Descuento', 'Subtotal']],
    body: sale.items.map(item => [
      item.name,
      item.brand,
      String(item.quantity),
      formatCOP(item.price),
      item.discount > 0 ? formatCOP(item.discount) : '—',
      formatCOP(item.subtotal),
    ]),
    headStyles: { fillColor: gold, textColor: black, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 35 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8

  // Totals
  const totalsData: [string, string][] = [
    ['Subtotal sin descuento', formatCOP(sale.subtotalSinDescuento)],
  ]
  if (sale.totalDescuento > 0) {
    totalsData.push(['Descuento total', `-${formatCOP(sale.totalDescuento)}`])
  }
  totalsData.push(['TOTAL', formatCOP(sale.total)])

  autoTable(doc, {
    startY: y,
    body: totalsData,
    styles: { fontSize: 10 },
    columnStyles: {
      0: { halign: 'right', fontStyle: 'normal' },
      1: { halign: 'right', cellWidth: 40 },
    },
    didParseCell: (data) => {
      if (data.row.index === totalsData.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 12
      }
    },
    theme: 'plain',
    margin: { left: pageW / 2, right: 14 },
    tableWidth: pageW / 2 - 14,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6

  // Payment method
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  const payLabel = sale.paymentMethod === 'efectivo' ? 'Efectivo' : 'Transferencia'
  doc.text(`Forma de pago: ${payLabel}`, 14, y)
  y += 8

  // Warranties
  const warrantyItems = sale.items.filter(i => i.hasWarranty)
  if (warrantyItems.length > 0) {
    doc.setDrawColor(...gold)
    doc.setLineWidth(0.4)
    doc.line(14, y, pageW - 14, y)
    y += 6

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...black)
    doc.text('Garantías', 14, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)
    warrantyItems.forEach(item => {
      const parts = [item.name]
      if (item.warrantyStart && item.warrantyEnd) {
        parts.push(`Desde ${item.warrantyStart} hasta ${item.warrantyEnd}`)
      }
      if (item.warrantyHours) {
        parts.push(`Horario: ${item.warrantyHours}`)
      }
      doc.text(parts.join('  ·  '), 14, y)
      y += 5
    })
    y += 3
  }

  // Notes
  if (sale.notes) {
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.4)
    doc.line(14, y, pageW - 14, y)
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...black)
    doc.text('Notas', 14, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)
    const noteLines = doc.splitTextToSize(sale.notes, pageW - 28)
    doc.text(noteLines, 14, y)
    y += noteLines.length * 5 + 4
  }

  // Footer
  y += 4
  doc.setDrawColor(...gold)
  doc.setLineWidth(0.8)
  doc.line(14, y, pageW - 14, y)
  y += 7
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(10)
  doc.setTextColor(100, 90, 60)
  doc.text('¡Gracias por su compra! · Autos & Latas', pageW / 2, y, { align: 'center' })

  doc.save(`factura-${invoiceId(sale.id)}.pdf`)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SalesHistoryPage() {
  const navigate = useNavigate()
  const { user, role, loading } = useCurrentUser()
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [sales, setSales] = useState<Sale[]>([])
  const [fetching, setFetching] = useState(false)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)

  // Auth guard
  useEffect(() => {
    if (!loading && !user) navigate('/login')
  }, [loading, user])

  // Fetch sales for the selected day
  useEffect(() => {
    if (!user) return
    const start = new Date(selectedDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(selectedDate)
    end.setHours(23, 59, 59, 999)

    setFetching(true)
    getDocs(
      query(
        collection(db, 'sales'),
        where('soldAt', '>=', Timestamp.fromDate(start)),
        where('soldAt', '<=', Timestamp.fromDate(end)),
        orderBy('soldAt', 'desc'),
      ),
    )
      .then(snap => {
        setSales(
          snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<Sale, 'id'>) })),
        )
      })
      .finally(() => setFetching(false))
  }, [selectedDate, user])

  const goToPrevDay = () => {
    setSelectedDate(d => {
      const next = new Date(d)
      next.setDate(next.getDate() - 1)
      return next
    })
  }

  const goToNextDay = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    setSelectedDate(d => {
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      return next > today ? d : next
    })
  }

  const goToToday = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    setSelectedDate(today)
  }

  // Summary stats
  const totalVentas = sales.reduce((s, v) => s + v.total, 0)
  const totalEfectivo = sales.filter(v => v.paymentMethod === 'efectivo').reduce((s, v) => s + v.total, 0)
  const totalTransferencia = sales.filter(v => v.paymentMethod === 'transferencia').reduce((s, v) => s + v.total, 0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isAtToday = selectedDate.getTime() === today.getTime()

  if (loading) return null

  return (
    <div className="sh-page">

      {/* ── HEADER ── */}
      <header className="sh-header">
        <div className="sh-header-left">
          <img src={logo} alt="Autos y Latas" className="sh-logo" />
          <div className="sh-brand">
            <span>Autos &amp; Latas</span>
            <span>Historial de ventas</span>
          </div>
        </div>
        <div className="sh-header-right">
          <span className={`role-badge role-${role}`}>{getRoleLabel(role)}</span>
          <button className="sh-btn-back" onClick={() => navigate('/dashboard')}>← Panel</button>
        </div>
      </header>

      <main className="sh-main">

        {/* ── DATE NAV ── */}
        <div className="sh-date-nav">
          <button className="sh-nav-btn" onClick={goToPrevDay} aria-label="Día anterior">←</button>
          <div className="sh-date-center">
            <span className="sh-date-label">{formatDateLabel(selectedDate)}</span>
            {!isAtToday && (
              <button className="sh-today-btn" onClick={goToToday}>Hoy</button>
            )}
          </div>
          <button
            className="sh-nav-btn"
            onClick={goToNextDay}
            disabled={isAtToday}
            aria-label="Día siguiente"
          >
            →
          </button>
        </div>

        {/* ── SUMMARY CARDS ── */}
        <div className="sh-stats">
          <div className="sh-stat-card">
            <div className="sh-stat-number">{formatCOP(totalVentas)}</div>
            <div className="sh-stat-label">Total del día</div>
          </div>
          <div className="sh-stat-card">
            <div className="sh-stat-number">{sales.length}</div>
            <div className="sh-stat-label">Transacciones</div>
          </div>
          <div className="sh-stat-card">
            <div className="sh-stat-number sh-stat-cash">{formatCOP(totalEfectivo)}</div>
            <div className="sh-stat-label">💵 Efectivo</div>
          </div>
          <div className="sh-stat-card">
            <div className="sh-stat-number sh-stat-transfer">{formatCOP(totalTransferencia)}</div>
            <div className="sh-stat-label">📲 Transferencia</div>
          </div>
        </div>

        {/* ── SALES LIST ── */}
        <div className="sh-section-label">
          <h3>Ventas del día</h3>
          <div className="sh-section-line" />
        </div>

        {fetching ? (
          <div className="sh-empty">Cargando ventas…</div>
        ) : sales.length === 0 ? (
          <div className="sh-empty">No hay ventas registradas para este día.</div>
        ) : (
          <div className="sh-sales-list">
            {sales.map(sale => {
              const names = sale.items.map(i => i.name)
              const preview =
                names.length <= 2
                  ? names.join(', ')
                  : `${names[0]}, ${names[1]} y ${names.length - 2} más`
              const hasWarranty = sale.items.some(i => i.hasWarranty)

              return (
                <div
                  key={sale.id}
                  className="sh-sale-row"
                  onClick={() => setSelectedSale(sale)}
                >
                  <span className="sh-sale-time">{formatTime(sale.soldAt)}</span>
                  <span className="sh-sale-products">{preview}</span>
                  {hasWarranty && <span className="sh-warranty-icon" title="Tiene garantía">🛡️</span>}
                  <span className="sh-sale-total">{formatCOP(sale.total)}</span>
                  <span className={`sh-payment-badge sh-payment-${sale.paymentMethod}`}>
                    {sale.paymentMethod === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
                  </span>
                  <span className="sh-sale-seller">{emailShort(sale.soldBy.email)}</span>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ── DETAIL MODAL ── */}
      {selectedSale && (
        <div className="sh-modal-overlay" onClick={() => setSelectedSale(null)}>
          <div className="sh-modal" onClick={e => e.stopPropagation()}>
            <button className="sh-modal-close" onClick={() => setSelectedSale(null)}>✕</button>

            {/* Modal header */}
            <div className="sh-modal-header">
              <div>
                <div className="sh-modal-invoice">Factura #{invoiceId(selectedSale.id)}</div>
                <div className="sh-modal-datetime">
                  {selectedSale.soldAt.toDate().toLocaleDateString('es-CO', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })} — {formatTime(selectedSale.soldAt)}
                </div>
              </div>
              <span className={`sh-payment-badge sh-payment-${selectedSale.paymentMethod} sh-payment-lg`}>
                {selectedSale.paymentMethod === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
              </span>
            </div>

            {/* Meta */}
            <div className="sh-modal-meta">
              <div><span className="sh-meta-label">Vendido por</span> {selectedSale.soldBy.email}</div>
              {selectedSale.customer && (
                <div>
                  <span className="sh-meta-label">Cliente</span>{' '}
                  {selectedSale.customer.cedula}
                  {selectedSale.customer.name ? ` — ${selectedSale.customer.name}` : ''}
                </div>
              )}
            </div>

            {/* Products table */}
            <div className="sh-modal-table-wrap">
              <table className="sh-modal-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Línea</th>
                    <th className="sh-col-num">Cant.</th>
                    <th className="sh-col-num">Precio unit.</th>
                    <th className="sh-col-num">Descuento</th>
                    <th className="sh-col-num">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSale.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.name}</td>
                      <td>{item.brand}</td>
                      <td className="sh-col-num">{item.quantity}</td>
                      <td className="sh-col-num">{formatCOP(item.price)}</td>
                      <td className="sh-col-num">{item.discount > 0 ? formatCOP(item.discount) : '—'}</td>
                      <td className="sh-col-num">{formatCOP(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="sh-modal-totals">
              <div className="sh-total-row">
                <span>Subtotal sin descuento</span>
                <span>{formatCOP(selectedSale.subtotalSinDescuento)}</span>
              </div>
              {selectedSale.totalDescuento > 0 && (
                <div className="sh-total-row sh-total-discount">
                  <span>Descuento total</span>
                  <span>-{formatCOP(selectedSale.totalDescuento)}</span>
                </div>
              )}
              <div className="sh-total-row sh-total-final">
                <span>TOTAL</span>
                <span>{formatCOP(selectedSale.total)}</span>
              </div>
              <div className="sh-total-payment">
                Forma de pago: {selectedSale.paymentMethod === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
              </div>
            </div>

            {/* Warranties */}
            {selectedSale.items.some(i => i.hasWarranty) && (
              <div className="sh-modal-warranties">
                <div className="sh-modal-section-title">🛡️ Garantías</div>
                {selectedSale.items.filter(i => i.hasWarranty).map((item, idx) => (
                  <div key={idx} className="sh-warranty-row">
                    <span className="sh-warranty-name">{item.name}</span>
                    {item.warrantyStart && item.warrantyEnd && (
                      <span className="sh-warranty-dates">
                        Desde {item.warrantyStart} hasta {item.warrantyEnd}
                      </span>
                    )}
                    {item.warrantyHours && (
                      <span className="sh-warranty-hours">Horario: {item.warrantyHours}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            {selectedSale.notes && (
              <div className="sh-modal-notes">
                <div className="sh-modal-section-title">Notas</div>
                <p>{selectedSale.notes}</p>
              </div>
            )}

            {/* Reprint button */}
            <button className="sh-btn-print" onClick={() => printInvoice(selectedSale)}>
              🖨️ Reimprimir factura
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
