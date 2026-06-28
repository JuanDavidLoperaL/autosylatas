import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, query, where, getDocs, addDoc, deleteDoc,
  onSnapshot, serverTimestamp, Timestamp, orderBy,
  doc, setDoc, limit,
} from 'firebase/firestore'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { db } from '../firebase/config'
import { useCurrentUser } from '../hooks/useCurrentUser'
import './ReportsPage.css'

// ── helpers ───────────────────────────────────────────────────────────────────

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

function maskCOP(raw: string): { str: string; num: number } {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return { str: '', num: 0 }
  const num = parseInt(digits, 10)
  return { str: num.toLocaleString('es-CO'), num }
}

function yTick(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${v}`
}

function friendlyDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

const MONTH_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ── interfaces ────────────────────────────────────────────────────────────────

interface SaleDoc  { date: Timestamp; amount: number; paymentMethod?: string }
interface ExpDoc   { id: string; date: Timestamp; amount: number; description: string; createdBy: string }
interface WeekData { week: string; ventas: number; gastos: number }

interface DailyReport {
  id: string; date: string
  ventas: number; gastos: number
  efectivo: number; transferencia: number
  cajaEsperada: number; cajaReal: number | null; cajaDiff: number | null
  reportedBy: string; createdAt: Timestamp
}

// ── data builders ─────────────────────────────────────────────────────────────

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1); start.setHours(0, 0, 0, 0)
  const end   = new Date(year, month + 1, 0); end.setHours(23, 59, 59, 999)
  return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) }
}

function getDayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end   = new Date(); end.setHours(23, 59, 59, 999)
  return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) }
}

function buildWeeklyData(sales: SaleDoc[], expenses: ExpDoc[], year: number, month: number): WeekData[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const numWeeks = Math.ceil(daysInMonth / 7)
  const weeks: WeekData[] = Array.from({ length: numWeeks }, (_, i) => ({ week: `Sem ${i + 1}`, ventas: 0, gastos: 0 }))
  const weekOf = (ts: Timestamp | null) => {
    if (!ts) return -1
    const dt = ts.toDate()
    if (dt.getFullYear() !== year || dt.getMonth() !== month) return -1
    return Math.min(Math.floor((dt.getDate() - 1) / 7), numWeeks - 1)
  }
  sales.forEach(d => { const w = weekOf(d.date); if (w >= 0) weeks[w].ventas += d.amount })
  expenses.forEach(d => { const w = weekOf(d.date); if (w >= 0) weeks[w].gastos += d.amount })
  return weeks
}

// ── sub-components ────────────────────────────────────────────────────────────

type TT = { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }
function ChartTooltip({ active, payload, label }: TT) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{label}</p>
      {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: {formatCOP(p.value)}</p>)}
    </div>
  )
}

// ── export helpers ────────────────────────────────────────────────────────────

function exportPDF(year: number, month: number, monthlySales: number, monthlyEfectivo: number, monthlyTransferencia: number, monthlyExp: number, ganancia: number, weeklyData: WeekData[], expenses: ExpDoc[]) {
  const doc = new jsPDF()
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text(`Reporte Autos & Latas - ${MONTH_FULL[month]} ${year}`, 14, 18)
  doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  doc.text(`Generado: ${new Date().toLocaleDateString('es-CO')}`, 14, 25)
  autoTable(doc, { startY: 32, head: [['Concepto', 'Valor']], body: [['Ventas totales', formatCOP(monthlySales)], ['  Efectivo', formatCOP(monthlyEfectivo)], ['  Transferencia', formatCOP(monthlyTransferencia)], ['Gastos totales', formatCOP(monthlyExp)], ['Ganancia neta', formatCOP(ganancia)]], headStyles: { fillColor: [201, 160, 39] }, columnStyles: { 1: { halign: 'right' } } })
  const y1 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  autoTable(doc, { startY: y1, head: [['Semana', 'Ventas', 'Gastos']], body: weeklyData.map(w => [w.week, formatCOP(w.ventas), formatCOP(w.gastos)]), headStyles: { fillColor: [44, 122, 79] }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } })
  if (expenses.length > 0) {
    const y2 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
    autoTable(doc, { startY: y2, head: [['Descripcion', 'Registrado por', 'Monto']], body: expenses.map(e => [e.description, e.createdBy, formatCOP(e.amount)]), headStyles: { fillColor: [176, 58, 46] }, columnStyles: { 2: { halign: 'right' } } })
  }
  doc.save(`reporte-${MONTH_FULL[month].toLowerCase()}-${year}.pdf`)
}

function exportExcel(year: number, month: number, monthlySales: number, monthlyEfectivo: number, monthlyTransferencia: number, monthlyExp: number, ganancia: number, weeklyData: WeekData[], expenses: ExpDoc[]) {
  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.aoa_to_sheet([['Concepto', 'Valor'], ['Ventas totales', monthlySales], ['Efectivo', monthlyEfectivo], ['Transferencia', monthlyTransferencia], ['Gastos totales', monthlyExp], ['Ganancia neta', ganancia]])
  ws1['!cols'] = [{ wch: 25 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')
  const ws2 = XLSX.utils.aoa_to_sheet([['Semana', 'Ventas', 'Gastos'], ...weeklyData.map(w => [w.week, w.ventas, w.gastos])])
  ws2['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Semanas')
  if (expenses.length > 0) {
    const ws3 = XLSX.utils.aoa_to_sheet([['Descripcion', 'Registrado por', 'Monto'], ...expenses.map(e => [e.description, e.createdBy, e.amount])])
    ws3['!cols'] = [{ wch: 35 }, { wch: 28 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'Gastos')
  }
  XLSX.writeFile(wb, `reporte-${MONTH_FULL[month].toLowerCase()}-${year}.xlsx`)
}

// ── main component ────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const navigate = useNavigate()
  const { user, role, isAdmin, loading } = useCurrentUser()
  const isOwner = role === 'owner'
  const nowRef = new Date()

  // ── month selection ───────────────────────────────────────────────────────
  const [selectedYear,  setSelectedYear]  = useState(nowRef.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(nowRef.getMonth())
  const isCurrentMonth = selectedYear === nowRef.getFullYear() && selectedMonth === nowRef.getMonth()

  // ── today's data ──────────────────────────────────────────────────────────
  const [salesDay,              setSalesDay]              = useState<number | null>(null)
  const [salesDayEfectivo,      setSalesDayEfectivo]      = useState<number | null>(null)
  const [salesDayTransferencia, setSalesDayTransferencia] = useState<number | null>(null)
  const [todayExpenses,         setTodayExpenses]         = useState<ExpDoc[]>([])
  const [expensesDay,           setExpensesDay]           = useState<number | null>(null)

  // ── caja ─────────────────────────────────────────────────────────────────
  const [cajaStr, setCajaStr] = useState('')
  const [cajaNum, setCajaNum] = useState(0)

  // ── caja derivados (gastos restan del efectivo esperado) ─────────────────
  const cajaEsperada = (salesDayEfectivo ?? 0) - (expensesDay ?? 0)
  const cajaDiff     = cajaStr ? cajaNum - cajaEsperada : null
  const cajaStatus   = cajaDiff === null ? null : cajaDiff === 0 ? 'cuadrado' : cajaDiff > 0 ? 'sobrante' : 'faltante'

  // ── monthly data (owner) ──────────────────────────────────────────────────
  const [monthlySalesDocs, setMonthlySalesDocs] = useState<SaleDoc[]>([])
  const [monthlyExpDocs,   setMonthlyExpDocs]   = useState<ExpDoc[]>([])
  const [loadingMonth,     setLoadingMonth]     = useState(false)

  const monthlySales        = useMemo(() => monthlySalesDocs.reduce((s, d) => s + d.amount, 0), [monthlySalesDocs])
  const monthlyEfectivo     = useMemo(() => monthlySalesDocs.filter(d => d.paymentMethod !== 'transferencia').reduce((s, d) => s + d.amount, 0), [monthlySalesDocs])
  const monthlyTransferencia = useMemo(() => monthlySalesDocs.filter(d => d.paymentMethod === 'transferencia').reduce((s, d) => s + d.amount, 0), [monthlySalesDocs])
  const monthlyExp          = useMemo(() => monthlyExpDocs.reduce((s, d) => s + d.amount, 0), [monthlyExpDocs])
  const ganancia            = monthlySales - monthlyExp
  const weeklyData          = useMemo(() => buildWeeklyData(monthlySalesDocs, monthlyExpDocs, selectedYear, selectedMonth), [monthlySalesDocs, monthlyExpDocs, selectedYear, selectedMonth])

  // ── expense form ──────────────────────────────────────────────────────────
  const [amountStr,   setAmountStr]   = useState('')
  const [amountNum,   setAmountNum]   = useState(0)
  const [description, setDescription] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState('')

  // ── daily reports ─────────────────────────────────────────────────────────
  const [dailyReports,   setDailyReports]   = useState<DailyReport[]>([])
  const [dailySaving,    setDailySaving]    = useState(false)
  const [dailySaveMsg,   setDailySaveMsg]   = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ── edit modal ────────────────────────────────────────────────────────────
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null)
  const [editCajaStr,   setEditCajaStr]   = useState('')
  const [editCajaNum,   setEditCajaNum]   = useState(0)
  const [editSaving,    setEditSaving]    = useState(false)

  // ── delete confirm ────────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── redirect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) navigate('/login')
  }, [loading, user])

  // ── today's sales ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || loading || !user) return
    const day = getDayRange()
    getDocs(query(collection(db, 'sales'), where('soldAt', '>=', day.start), where('soldAt', '<=', day.end)))
      .then(snap => {
        const docs = snap.docs.map(d => ({ amount: (d.data().total ?? 0) as number, paymentMethod: d.data().paymentMethod as string | undefined }))
        setSalesDay(docs.reduce((s, d) => s + d.amount, 0))
        setSalesDayEfectivo(docs.filter(d => d.paymentMethod !== 'transferencia').reduce((s, d) => s + d.amount, 0))
        setSalesDayTransferencia(docs.filter(d => d.paymentMethod === 'transferencia').reduce((s, d) => s + d.amount, 0))
      })
  }, [isAdmin, loading, user])

  // ── today's expenses (real-time) ──────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || loading || !user) return
    const day = getDayRange()
    const q = query(collection(db, 'expenses'), where('createdAt', '>=', day.start), where('createdAt', '<=', day.end), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, date: d.data().createdAt as Timestamp, amount: d.data().amount as number, description: d.data().description as string, createdBy: d.data().createdBy as string }))
      setTodayExpenses(docs)
      setExpensesDay(docs.reduce((s, e) => s + e.amount, 0))
    })
  }, [isAdmin, loading, user])

  // ── monthly data (owner) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOwner || loading || !user) return
    setLoadingMonth(true)
    setMonthlySalesDocs([])
    setMonthlyExpDocs([])
    const { start, end } = getMonthRange(selectedYear, selectedMonth)
    getDocs(query(collection(db, 'sales'), where('soldAt', '>=', start), where('soldAt', '<=', end)))
      .then(snap => {
        setMonthlySalesDocs(snap.docs.map(d => ({ date: d.data().soldAt as Timestamp, amount: (d.data().total ?? 0) as number, paymentMethod: d.data().paymentMethod as string | undefined })))
        setLoadingMonth(false)
      })
    const expQ = query(collection(db, 'expenses'), where('createdAt', '>=', start), where('createdAt', '<=', end), orderBy('createdAt', 'desc'))
    if (isCurrentMonth) {
      return onSnapshot(expQ, snap => setMonthlyExpDocs(snap.docs.map(d => ({ id: d.id, date: d.data().createdAt as Timestamp, amount: d.data().amount as number, description: d.data().description as string, createdBy: d.data().createdBy as string }))))
    } else {
      getDocs(expQ).then(snap => setMonthlyExpDocs(snap.docs.map(d => ({ id: d.id, date: d.data().createdAt as Timestamp, amount: d.data().amount as number, description: d.data().description as string, createdBy: d.data().createdBy as string }))))
    }
  }, [selectedYear, selectedMonth, isOwner, isCurrentMonth, loading, user])

  // ── daily reports history ─────────────────────────────────────────────────
  const loadDailyReports = async () => {
    setLoadingHistory(true)
    try {
      const snap = await getDocs(query(collection(db, 'dailyReports'), orderBy('date', 'desc'), limit(60)))
      setDailyReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as DailyReport)))
    } finally { setLoadingHistory(false) }
  }

  useEffect(() => {
    if (!isAdmin || loading || !user) return
    loadDailyReports()
  }, [isAdmin, loading, user])

  // ── navigation ────────────────────────────────────────────────────────────
  const goToPrev = () => {
    if (selectedMonth === 0) { setSelectedYear(y => y - 1); setSelectedMonth(11) }
    else setSelectedMonth(m => m - 1)
  }
  const goToNext = () => {
    if (isCurrentMonth) return
    if (selectedMonth === 11) { setSelectedYear(y => y + 1); setSelectedMonth(0) }
    else setSelectedMonth(m => m + 1)
  }

  // ── expense handlers ──────────────────────────────────────────────────────
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError('')
    if (amountNum <= 0) { setFormError('Ingresa un monto válido'); return }
    if (!description.trim()) { setFormError('Ingresa una descripción'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'expenses'), { amount: amountNum, description: description.trim(), createdBy: user?.email ?? '', createdAt: serverTimestamp() })
      setAmountStr(''); setAmountNum(0); setDescription('')
    } catch { setFormError('Error al guardar. Intenta de nuevo.') }
    setSaving(false)
  }

  const handleDeleteExpense = async (id: string) => {
    await deleteDoc(doc(db, 'expenses', id))
    setConfirmDeleteId(null)
  }

  // ── save daily report ─────────────────────────────────────────────────────
  const handleSaveDailyReport = async () => {
    setDailySaveMsg('')
    setDailySaving(true)
    try {
      const dateStr = new Date().toISOString().split('T')[0]
      const cajaRealVal  = cajaStr ? cajaNum : null
      const cajaEsp      = (salesDayEfectivo ?? 0) - (expensesDay ?? 0)
      const cajaDiffVal  = cajaRealVal !== null ? cajaRealVal - cajaEsp : null
      await setDoc(doc(db, 'dailyReports', dateStr), { date: dateStr, ventas: salesDay ?? 0, gastos: expensesDay ?? 0, efectivo: salesDayEfectivo ?? 0, transferencia: salesDayTransferencia ?? 0, cajaEsperada: cajaEsp, cajaReal: cajaRealVal, cajaDiff: cajaDiffVal, reportedBy: user?.email ?? '', createdAt: serverTimestamp() })
      setDailySaveMsg('success')
      await loadDailyReports()
    } catch { setDailySaveMsg('error') }
    setDailySaving(false)
    setTimeout(() => setDailySaveMsg(''), 4000)
  }

  // ── edit saved report ─────────────────────────────────────────────────────
  const openEdit = (r: DailyReport) => {
    setEditingReport(r)
    const val = r.cajaReal !== null ? r.cajaReal : 0
    setEditCajaStr(val > 0 ? val.toLocaleString('es-CO') : '')
    setEditCajaNum(val)
  }

  const handleSaveEdit = async () => {
    if (!editingReport) return
    setEditSaving(true)
    try {
      const cajaRealVal = editCajaStr ? editCajaNum : null
      const cajaDiffVal = cajaRealVal !== null ? cajaRealVal - editingReport.cajaEsperada : null
      await setDoc(doc(db, 'dailyReports', editingReport.id), { ...editingReport, cajaReal: cajaRealVal, cajaDiff: cajaDiffVal, reportedBy: user?.email ?? '', createdAt: serverTimestamp() })
      await loadDailyReports()
      setEditingReport(null)
    } catch { /* silent */ }
    setEditSaving(false)
  }

  if (loading) return null
  if (!isAdmin) return (
    <div className="reports-access-denied">
      <p>No tienes permisos para ver esta página.</p>
      <button onClick={() => navigate('/dashboard')}>← Volver</button>
    </div>
  )

  const fmt = (v: number | null) => v === null ? '...' : formatCOP(v)

  return (
    <div className="reports-page">
      <header className="reports-header">
        <h1>Reportes</h1>
        <button className="btn-back" onClick={() => navigate('/dashboard')}>← Panel</button>
      </header>

      <main className="reports-main">

        {/* ── 1. HOY ─────────────────────────────────────────────────────── */}
        <section className="reports-section">
          <h2 className="reports-section-title">Resumen de hoy</h2>
          <div className="today-grid">
            <div className="today-card today-card--sales">
              <div className="today-card-icon">💰</div>
              <div className="today-card-body">
                <span className="today-card-label">Ventas totales</span>
                <span className="today-card-value">{fmt(salesDay)}</span>
              </div>
            </div>
            <div className="today-card today-card--expenses">
              <div className="today-card-icon">📤</div>
              <div className="today-card-body">
                <span className="today-card-label">Gastos totales</span>
                <span className="today-card-value">{fmt(expensesDay)}</span>
              </div>
            </div>
            <div className="today-card today-card--efectivo">
              <div className="today-card-icon">💵</div>
              <div className="today-card-body">
                <span className="today-card-label">Efectivo</span>
                <span className="today-card-value">{fmt(salesDayEfectivo)}</span>
              </div>
            </div>
            <div className="today-card today-card--transferencia">
              <div className="today-card-icon">📲</div>
              <div className="today-card-body">
                <span className="today-card-label">Transferencia</span>
                <span className="today-card-value">{fmt(salesDayTransferencia)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. CAJA ────────────────────────────────────────────────────── */}
        <section className="reports-section">
          <h2 className="reports-section-title">Cuadre de caja</h2>
          <div className="caja-card">
            <div className="caja-breakdown">
              <div className="caja-row">
                <span>Ventas en efectivo</span>
                <span>{fmt(salesDayEfectivo)}</span>
              </div>
              <div className="caja-row caja-row--minus">
                <span>Gastos del día</span>
                <span>− {fmt(expensesDay)}</span>
              </div>
              <div className="caja-row caja-row--total">
                <span>Esperado en caja</span>
                <span>{formatCOP(cajaEsperada)}</span>
              </div>
            </div>

            <div className="caja-input-section">
              <label className="caja-input-label">¿Cuánto hay en la caja ahora?</label>
              <div className="caja-input-wrap">
                <span className="caja-prefix">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={cajaStr}
                  onChange={e => { const r = maskCOP(e.target.value); setCajaStr(r.str); setCajaNum(r.num) }}
                  className="caja-input"
                />
              </div>
            </div>

            {cajaStr && cajaDiff !== null && (
              <div className={`caja-result caja-result--${cajaStatus}`}>
                <span className="caja-result-icon">
                  {cajaStatus === 'cuadrado' && '✅'}
                  {cajaStatus === 'sobrante' && '⬆️'}
                  {cajaStatus === 'faltante' && '⚠️'}
                </span>
                <div className="caja-result-text">
                  {cajaStatus === 'cuadrado' && <><strong>¡Caja cuadrada!</strong><span>El efectivo coincide exactamente.</span></>}
                  {cajaStatus === 'sobrante' && <><strong>Sobrante: {formatCOP(cajaDiff)}</strong><span>Hay más efectivo del esperado.</span></>}
                  {cajaStatus === 'faltante' && <><strong>Faltante: {formatCOP(Math.abs(cajaDiff))}</strong><span>Falta efectivo respecto a lo esperado.</span></>}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── 3. GASTOS ──────────────────────────────────────────────────── */}
        <section className="reports-section">
          <h2 className="reports-section-title">Gastos de hoy</h2>

          <form className="expense-form" onSubmit={handleAddExpense}>
            <div className="expense-form-row">
              <div className="expense-amount-wrap">
                <span className="expense-prefix">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={amountStr}
                  onChange={e => { const r = maskCOP(e.target.value); setAmountStr(r.str); setAmountNum(r.num) }}
                  className="expense-input--amount"
                />
              </div>
              <input
                type="text"
                placeholder="Descripción del gasto"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="expense-input expense-input--wide"
              />
              <button type="submit" className="btn-add-expense" disabled={saving}>
                {saving ? 'Guardando...' : '+ Agregar'}
              </button>
            </div>
            {formError && <p className="expense-error">{formError}</p>}
          </form>

          {todayExpenses.length > 0 && (
            <div className="expenses-list">
              {todayExpenses.map(exp => (
                <div key={exp.id} className={`expense-item ${confirmDeleteId === exp.id ? 'expense-item--confirming' : ''}`}>
                  <span className="expense-item-desc">{exp.description}</span>
                  <span className="expense-item-by">{exp.createdBy}</span>
                  <span className="expense-item-amount">{formatCOP(exp.amount)}</span>
                  <div className="expense-item-actions">
                    {confirmDeleteId === exp.id ? (
                      <>
                        <button className="btn-confirm-del" onClick={() => handleDeleteExpense(exp.id)}>Eliminar</button>
                        <button className="btn-cancel-del" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
                      </>
                    ) : (
                      <button className="btn-del" title="Eliminar" onClick={() => setConfirmDeleteId(exp.id)}>🗑</button>
                    )}
                  </div>
                </div>
              ))}
              <div className="expense-item expense-item--total">
                <span className="expense-item-desc">Total gastos del día</span>
                <span className="expense-item-by" />
                <span className="expense-item-amount">{fmt(expensesDay)}</span>
                <span />
              </div>
            </div>
          )}

          {/* ── GUARDAR REPORTE ── */}
          <div className="save-report-block">
            <div className="save-report-preview">
              <div className="srp-row"><span>Ventas</span><strong>{fmt(salesDay)}</strong></div>
              <div className="srp-row srp-row--exp"><span>Gastos</span><strong>{fmt(expensesDay)}</strong></div>
              <div className="srp-row"><span>Efectivo</span><strong>{fmt(salesDayEfectivo)}</strong></div>
              <div className="srp-row"><span>Transferencia</span><strong>{fmt(salesDayTransferencia)}</strong></div>
              {cajaStr && <div className="srp-row"><span>Caja real</span><strong>{formatCOP(cajaNum)}</strong></div>}
            </div>
            <button className="btn-save-day" onClick={handleSaveDailyReport} disabled={dailySaving}>
              {dailySaving ? 'Guardando...' : '💾 Guardar reporte del día'}
            </button>
            {dailySaveMsg === 'success' && <p className="save-msg save-msg--ok">✅ Reporte guardado correctamente</p>}
            {dailySaveMsg === 'error'   && <p className="save-msg save-msg--err">❌ Error al guardar. Intenta de nuevo.</p>}
          </div>
        </section>

        {/* ── 4–6. OWNER ONLY ────────────────────────────────────────────── */}
        {isOwner && (
          <>
            <div className="section-divider" />

            <div className="month-nav">
              <button className="month-nav-btn" onClick={goToPrev}>‹</button>
              <span className="month-nav-label">
                {MONTH_FULL[selectedMonth]} {selectedYear}
                {isCurrentMonth && <span className="month-nav-badge">Este mes</span>}
              </span>
              <button className="month-nav-btn" onClick={goToNext} disabled={isCurrentMonth}>›</button>
            </div>

            <section className="reports-section">
              <h2 className="reports-section-title">Resumen — {MONTH_FULL[selectedMonth]} {selectedYear}</h2>
              {loadingMonth ? <div className="chart-loading">Cargando...</div> : (
                <>
                  <div className="month-summary-grid">
                    <div className="ms-card ms-card--sales">
                      <span className="ms-label">Ventas</span>
                      <span className="ms-value">{formatCOP(monthlySales)}</span>
                      <div className="ms-breakdown">
                        <span>💵 {formatCOP(monthlyEfectivo)}</span>
                        <span>📲 {formatCOP(monthlyTransferencia)}</span>
                      </div>
                    </div>
                    <div className="ms-card ms-card--exp">
                      <span className="ms-label">Gastos</span>
                      <span className="ms-value">{formatCOP(monthlyExp)}</span>
                    </div>
                    <div className={`ms-card ${ganancia >= 0 ? 'ms-card--profit' : 'ms-card--loss'}`}>
                      <span className="ms-label">Ganancia neta</span>
                      <span className="ms-value">{formatCOP(ganancia)}</span>
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="reports-section">
              <h2 className="reports-section-title">Ventas por semana — {MONTH_FULL[selectedMonth]}</h2>
              {loadingMonth ? <div className="chart-loading">Cargando...</div> : (
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={weeklyData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2D9C8" />
                      <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#7A7060' }} />
                      <YAxis tickFormatter={yTick} tick={{ fontSize: 11, fill: '#7A7060' }} width={64} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Bar dataKey="ventas" name="Ventas" fill="#2D7A4F" radius={[4,4,0,0]} />
                      <Bar dataKey="gastos" name="Gastos" fill="#B03A2E" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="reports-section">
              <h2 className="reports-section-title">Exportar reporte</h2>
              <div className="export-btns">
                <button className="btn-export btn-export--pdf" onClick={() => exportPDF(selectedYear, selectedMonth, monthlySales, monthlyEfectivo, monthlyTransferencia, monthlyExp, ganancia, weeklyData, monthlyExpDocs)} disabled={loadingMonth}>📄 Exportar PDF</button>
                <button className="btn-export btn-export--excel" onClick={() => exportExcel(selectedYear, selectedMonth, monthlySales, monthlyEfectivo, monthlyTransferencia, monthlyExp, ganancia, weeklyData, monthlyExpDocs)} disabled={loadingMonth}>📊 Exportar Excel</button>
              </div>
            </section>
          </>
        )}

        {/* ── HISTORIAL ────────────────────────────────────────────────────── */}
        <section className="reports-section">
          <h2 className="reports-section-title">Historial de cuadres diarios</h2>
          {loadingHistory ? <div className="chart-loading">Cargando historial...</div>
          : dailyReports.length === 0 ? <p className="history-empty">Aún no hay cuadres guardados.</p>
          : (
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Ventas</th>
                    <th>Gastos</th>
                    <th>Efectivo</th>
                    <th>Transferencia</th>
                    <th>Esperado caja</th>
                    <th>Real caja</th>
                    <th>Diferencia</th>
                    <th>Reportado por</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dailyReports.map(r => {
                    const st = r.cajaDiff === null ? 'none' : r.cajaDiff === 0 ? 'cuadrado' : r.cajaDiff > 0 ? 'sobrante' : 'faltante'
                    return (
                      <tr key={r.id}>
                        <td className="td-date">{friendlyDate(r.date)}</td>
                        <td className="td-money td-sales">{formatCOP(r.ventas)}</td>
                        <td className="td-money td-exp">{formatCOP(r.gastos)}</td>
                        <td className="td-money">{formatCOP(r.efectivo)}</td>
                        <td className="td-money">{formatCOP(r.transferencia)}</td>
                        <td className="td-money">{formatCOP(r.cajaEsperada)}</td>
                        <td className="td-money">{r.cajaReal !== null ? formatCOP(r.cajaReal) : <span className="td-empty">—</span>}</td>
                        <td className={`td-money td-diff td-diff--${st}`}>
                          {r.cajaDiff === null ? <span className="td-empty">—</span>
                            : r.cajaDiff === 0 ? '✅ Cuadrado'
                            : r.cajaDiff > 0 ? `+${formatCOP(r.cajaDiff)}`
                            : formatCOP(r.cajaDiff)}
                        </td>
                        <td className="td-user">{r.reportedBy}</td>
                        <td><button className="btn-edit-row" onClick={() => openEdit(r)} title="Editar">✏️</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>

      {/* ── EDIT MODAL ─────────────────────────────────────────────────────── */}
      {editingReport && (
        <div className="modal-overlay" onClick={() => !editSaving && setEditingReport(null)}>
          <div className="edit-modal" onClick={e => e.stopPropagation()}>
            <div className="edit-modal-header">
              <h3>Editar reporte</h3>
              <span className="edit-modal-date">{friendlyDate(editingReport.date)}</span>
              <button className="edit-modal-close" onClick={() => setEditingReport(null)}>✕</button>
            </div>

            <div className="edit-modal-body">
              <div className="edit-summary">
                <div className="edit-summary-row"><span>Ventas</span><strong>{formatCOP(editingReport.ventas)}</strong></div>
                <div className="edit-summary-row"><span>Gastos</span><strong>{formatCOP(editingReport.gastos)}</strong></div>
                <div className="edit-summary-row"><span>Efectivo</span><strong>{formatCOP(editingReport.efectivo)}</strong></div>
                <div className="edit-summary-row edit-summary-row--highlight"><span>Esperado en caja</span><strong>{formatCOP(editingReport.cajaEsperada)}</strong></div>
              </div>

              <div className="edit-field">
                <label>Efectivo real en caja</label>
                <div className="caja-input-wrap">
                  <span className="caja-prefix">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={editCajaStr}
                    onChange={e => { const r = maskCOP(e.target.value); setEditCajaStr(r.str); setEditCajaNum(r.num) }}
                    className="caja-input"
                    autoFocus
                  />
                </div>
                {editCajaStr && (() => {
                  const diff = editCajaNum - editingReport.cajaEsperada
                  const st = diff === 0 ? 'cuadrado' : diff > 0 ? 'sobrante' : 'faltante'
                  return (
                    <div className={`caja-result caja-result--${st}`} style={{ marginTop: 10 }}>
                      <span className="caja-result-icon">{diff === 0 ? '✅' : diff > 0 ? '⬆️' : '⚠️'}</span>
                      <div className="caja-result-text">
                        {diff === 0 && <><strong>¡Caja cuadrada!</strong></>}
                        {diff > 0 && <><strong>Sobrante: {formatCOP(diff)}</strong></>}
                        {diff < 0 && <><strong>Faltante: {formatCOP(Math.abs(diff))}</strong></>}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="edit-modal-footer">
              <button className="btn-cancel-edit" onClick={() => setEditingReport(null)} disabled={editSaving}>Cancelar</button>
              <button className="btn-save-edit" onClick={handleSaveEdit} disabled={editSaving}>
                {editSaving ? 'Guardando...' : '💾 Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
