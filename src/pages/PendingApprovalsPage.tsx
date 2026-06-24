import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, onSnapshot, doc, updateDoc,
  serverTimestamp, Timestamp, writeBatch
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useCurrentUser, getRoleLabel } from '../hooks/useCurrentUser'
import logo from '../assets/logo.png'
import './PendingApprovalsPage.css'

interface Actor { uid: string; email: string }

interface PendingChange {
  id: string
  type: 'create' | 'edit'
  productId: string | null
  productName: string
  productBrand: string
  data: Record<string, unknown>
  requestedBy: Actor
  requestedAt: Timestamp
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy: Actor | null
  reviewedAt: Timestamp | null
  rejectionReason: string
}

const fmtDate = (ts: Timestamp | null | undefined): string => {
  if (!ts) return '—'
  return ts.toDate().toLocaleString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function PendingApprovalsPage() {
  const navigate = useNavigate()
  const { user, role, isAdmin, loading: authLoading } = useCurrentUser()

  const [changes, setChanges] = useState<PendingChange[]>([])
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PendingChange | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/dashboard')
  }, [authLoading, isAdmin, navigate])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pendingChanges'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PendingChange))
      // Sort newest first
      data.sort((a, b) => {
        const ta = a.requestedAt?.toMillis() ?? 0
        const tb = b.requestedAt?.toMillis() ?? 0
        return tb - ta
      })
      setChanges(data)
    })
    return unsub
  }, [])

  const pending = changes.filter(c => c.status === 'pending')
  const history = changes.filter(c => c.status !== 'pending')

  const handleApprove = async (change: PendingChange) => {
    if (!user) return
    setProcessing(change.id)
    try {
      const reviewer = { uid: user.uid, email: user.email ?? '' }
      const batch = writeBatch(db)

      if (change.type === 'create') {
        const newRef = doc(collection(db, 'products'))
        batch.set(newRef, {
          ...change.data,
          createdBy: change.requestedBy,
          createdAt: change.requestedAt,
          approvedBy: reviewer,
        })
        batch.update(doc(db, 'pendingChanges', change.id), {
          status: 'approved',
          reviewedBy: reviewer,
          reviewedAt: serverTimestamp(),
          productId: newRef.id,
        })
      } else {
        if (!change.productId) throw new Error('productId faltante')
        batch.update(doc(db, 'products', change.productId), {
          ...change.data,
          updatedBy: change.requestedBy,
          updatedAt: change.requestedAt,
          approvedBy: reviewer,
        })
        batch.update(doc(db, 'pendingChanges', change.id), {
          status: 'approved',
          reviewedBy: reviewer,
          reviewedAt: serverTimestamp(),
        })
      }

      await batch.commit()
    } catch (err) {
      console.error(err)
      alert('Error al aprobar: ' + String(err))
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async () => {
    if (!rejectTarget || !user) return
    setProcessing(rejectTarget.id)
    try {
      await updateDoc(doc(db, 'pendingChanges', rejectTarget.id), {
        status: 'rejected',
        reviewedBy: { uid: user.uid, email: user.email ?? '' },
        reviewedAt: serverTimestamp(),
        rejectionReason: rejectReason.trim(),
      })
      setRejectTarget(null)
      setRejectReason('')
    } catch (err) {
      console.error(err)
    } finally {
      setProcessing(null)
    }
  }

  if (authLoading) return null

  const displayList = tab === 'pending' ? pending : history

  return (
    <div className="approvals-page">

      <header className="approvals-header">
        <div className="approvals-header-left">
          <img src={logo} alt="Autos y Latas" className="approvals-logo" />
          <div className="approvals-brand">
            <span>Autos &amp; Latas</span>
            <span>Panel interno</span>
          </div>
        </div>
        <div className="approvals-header-right">
          <span className={`role-badge role-${role}`}>{getRoleLabel(role)}</span>
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            ← Volver al panel
          </button>
        </div>
      </header>

      <main className="approvals-main">

        <div className="approvals-title-row">
          <div>
            <h1>🔍 Aprobaciones</h1>
            <p className="approvals-subtitle">
              Solicitudes de cambio enviadas por vendedores
            </p>
          </div>
          <div className="pending-counter">
            <span className="pending-count">{pending.length}</span>
            <span className="pending-label">pendientes</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="approvals-tabs">
          <button
            className={tab === 'pending' ? 'active' : ''}
            onClick={() => setTab('pending')}
          >
            Pendientes
            {pending.length > 0 && <span className="tab-badge">{pending.length}</span>}
          </button>
          <button
            className={tab === 'history' ? 'active' : ''}
            onClick={() => setTab('history')}
          >
            Historial
          </button>
        </div>

        {/* List */}
        {displayList.length === 0 ? (
          <div className="approvals-empty">
            {tab === 'pending'
              ? '✅ No hay solicitudes pendientes.'
              : 'No hay historial de cambios aún.'}
          </div>
        ) : (
          <div className="approvals-list">
            {displayList.map(change => (
              <div
                key={change.id}
                className={`approval-card ${change.status === 'rejected' ? 'rejected' : ''}`}
              >
                <div className="approval-card-top">
                  <div className="approval-badges">
                    <span className={`type-badge type-${change.type}`}>
                      {change.type === 'create' ? '➕ CREAR' : '✏️ EDITAR'}
                    </span>
                    {change.status !== 'pending' && (
                      <span className={`status-badge status-${change.status}`}>
                        {change.status === 'approved' ? '✅ Aprobado' : '❌ Rechazado'}
                      </span>
                    )}
                  </div>

                  <div className="approval-product">
                    <strong>{change.productName}</strong>
                    <span className="approval-brand">{change.productBrand}</span>
                  </div>

                  <div className="approval-meta">
                    <span>📋 Solicitado por <strong>{change.requestedBy.email}</strong></span>
                    <span>🕐 {fmtDate(change.requestedAt)}</span>
                  </div>

                  {change.status !== 'pending' && change.reviewedBy && (
                    <div className="approval-review-meta">
                      <span>
                        {change.status === 'approved' ? '✅' : '❌'} Revisado por <strong>{change.reviewedBy.email}</strong> · {fmtDate(change.reviewedAt)}
                      </span>
                      {change.rejectionReason && (
                        <span className="rejection-reason">Motivo: {change.rejectionReason}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Data preview */}
                <div className="approval-data">
                  <div className="data-grid">
                    {change.data.name !== undefined && (
                      <div className="data-row">
                        <span className="data-key">Nombre</span>
                        <span className="data-val">{String(change.data.name)}</span>
                      </div>
                    )}
                    {change.data.price !== undefined && (
                      <div className="data-row">
                        <span className="data-key">Precio</span>
                        <span className="data-val">${Number(change.data.price).toLocaleString('es-CO')}</span>
                      </div>
                    )}
                    {change.data.unitsPrincipal !== undefined && (
                      <div className="data-row">
                        <span className="data-key">Local</span>
                        <span className="data-val">{String(change.data.unitsPrincipal)} uds</span>
                      </div>
                    )}
                    {change.data.unitsBodega !== undefined && (
                      <div className="data-row">
                        <span className="data-key">Bodega</span>
                        <span className="data-val">{String(change.data.unitsBodega)} uds</span>
                      </div>
                    )}
                    {change.data.condition !== undefined && (
                      <div className="data-row">
                        <span className="data-key">Condición</span>
                        <span className="data-val">{String(change.data.condition)}</span>
                      </div>
                    )}
                    {change.data.available !== undefined && (
                      <div className="data-row">
                        <span className="data-key">Disponible</span>
                        <span className="data-val">{change.data.available ? 'Sí' : 'No'}</span>
                      </div>
                    )}
                    {Boolean(change.data.compatibleModels) && (
                      <div className="data-row data-row-full">
                        <span className="data-key">Modelos</span>
                        <span className="data-val">{String(change.data.compatibleModels)}</span>
                      </div>
                    )}
                    {Boolean(change.data.notes) && (
                      <div className="data-row data-row-full">
                        <span className="data-key">Notas</span>
                        <span className="data-val">{String(change.data.notes)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions (only for pending) */}
                {change.status === 'pending' && (
                  <div className="approval-actions">
                    <button
                      className="btn-reject"
                      onClick={() => { setRejectTarget(change); setRejectReason('') }}
                      disabled={processing === change.id}
                    >
                      ❌ Rechazar
                    </button>
                    <button
                      className="btn-approve"
                      onClick={() => handleApprove(change)}
                      disabled={processing === change.id}
                    >
                      {processing === change.id ? 'Procesando...' : '✅ Aprobar'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── MODAL RECHAZO ── */}
      {rejectTarget && (
        <div className="modal-overlay" onClick={() => setRejectTarget(null)}>
          <div className="reject-modal" onClick={e => e.stopPropagation()}>
            <h3>❌ Rechazar solicitud</h3>
            <p>
              Vas a rechazar la solicitud de <strong>{rejectTarget.requestedBy.email}</strong>{' '}
              para <em>{rejectTarget.type === 'create' ? 'crear' : 'editar'}</em>{' '}
              "<strong>{rejectTarget.productName}</strong>".
            </p>
            <label>Motivo del rechazo (opcional)</label>
            <textarea
              rows={3}
              placeholder="Ej: Precio incorrecto, datos incompletos..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
            <div className="reject-actions">
              <button className="btn-cancel-modal" onClick={() => setRejectTarget(null)}>
                Cancelar
              </button>
              <button
                className="btn-reject-confirm"
                onClick={handleReject}
                disabled={!!processing}
              >
                {processing ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
