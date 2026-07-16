import React, { useState } from 'react';
import { X, Trash2, AlertTriangle, Loader2, Ban, ChevronRight } from 'lucide-react';

export interface DeleteProcedureDialogProps {
  isOpen:          boolean;
  onClose:         () => void;
  procedureName:   string;
  canDelete:       boolean;
  canCancel:       boolean;
  reason?:         string;
  sessionsCount:   number;
  status?:         string;
  paymentStatus?:  string;
  invoiceStatus?:  string | null;
  invoiceAmountPaid?: number;
  onConfirmDelete: (reason: string) => Promise<void>;
  onGoToCancel:    () => void;
}

export function DeleteProcedureDialog({
  isOpen,
  onClose,
  procedureName,
  canDelete,
  canCancel,
  reason,
  sessionsCount,
  status,
  paymentStatus,
  invoiceStatus,
  invoiceAmountPaid,
  onConfirmDelete,
  onGoToCancel,
}: DeleteProcedureDialogProps) {
  const [submitting,   setSubmitting]   = useState(false);
  const [confirmed,    setConfirmed]    = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [error,        setError]        = useState<string | null>(null);

  const hasPayments =
    paymentStatus === 'PAID' ||
    paymentStatus === 'PARTIALLY_PAID' ||
    Number(invoiceAmountPaid ?? 0) > 0;

  const canSubmit = confirmed && deleteReason.trim().length > 0;

  const handleDelete = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirmDelete(deleteReason.trim());
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Delete failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 600, maxWidth: '94vw',
          backgroundColor: '#fff', borderRadius: 12,
          boxShadow: '0 24px 48px rgba(0,0,0,0.24)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: canDelete
            ? 'linear-gradient(135deg, #dc2626, #ef4444)'
            : 'linear-gradient(135deg, #4b5563, #6b7280)',
          color: '#fff', padding: '14px 18px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {canDelete ? <Trash2 size={18} style={{ flexShrink: 0, marginTop: 1 }} /> : <Ban size={18} style={{ flexShrink: 0, marginTop: 1 }} />}
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                {canDelete ? 'Delete Procedure' : 'Cannot Delete Procedure'}
              </h3>
              <p style={{ fontSize: 11, color: canDelete ? '#fecaca' : '#d1d5db', margin: '3px 0 0' }}>
                {procedureName}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 18px', maxHeight: '70vh', overflowY: 'auto' }}>

          {/* ── Spec rule strip — shows every gate + its current status ── */}
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 8, padding: '10px 12px', marginBottom: 14,
            fontSize: 11,
          }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
              Delete rules (all must pass)
            </p>
            <RuleRow label="Status is PLANNED"   pass={status?.toUpperCase() === 'PLANNED' || status?.toUpperCase() === 'PENDING'} value={status ?? '—'} />
            <RuleRow label="No session executions" pass={sessionsCount === 0} value={sessionsCount === 0 ? '0 sessions' : `${sessionsCount} session${sessionsCount !== 1 ? 's' : ''}`} />
            <RuleRow label="No payments"          pass={!hasPayments} value={
              hasPayments ? `${paymentStatus} · paid ${invoiceAmountPaid}` : (paymentStatus ?? 'OPEN')
            } />
            <RuleRow label="Linked invoice not POSTED" pass={invoiceStatus === 'DRAFT' || invoiceStatus === null || invoiceStatus === 'VOID'} value={invoiceStatus ?? 'no invoice'} />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '10px 12px', marginBottom: 12,
              color: '#991b1b', fontSize: 11,
            }}>
              {error}
            </div>
          )}

          {/* ── BLOCKED: explain why + offer Cancel flow when possible ── */}
          {!canDelete && (
            <>
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, padding: '12px 14px', marginBottom: 14,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <AlertTriangle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', margin: 0 }}>
                    {reason ?? 'This procedure cannot be deleted.'}
                  </p>
                  {sessionsCount > 0 && (
                    <p style={{ fontSize: 10, color: '#b91c1c', marginTop: 4 }}>
                      Deleting would orphan <b>{sessionsCount} clinical session record{sessionsCount !== 1 ? 's' : ''}</b>.
                      Use <b>Cancel</b> instead — it safely preserves all execution history.
                    </p>
                  )}
                </div>
              </div>

              {canCancel && (
                <button
                  onClick={() => { onClose(); onGoToCancel(); }}
                  style={{
                    width: '100%', padding: '11px 16px', fontSize: 12, fontWeight: 700,
                    background: '#d97706', color: '#fff', border: 'none',
                    borderRadius: 8, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  Cancel Procedure Instead <ChevronRight size={14} />
                </button>
              )}

              <button
                onClick={onClose}
                style={{
                  width: '100%', marginTop: 8, padding: '9px', fontSize: 12, fontWeight: 600,
                  background: '#fff', color: '#374151',
                  border: '1px solid #e5e8f0', borderRadius: 8, cursor: 'pointer',
                }}
              >
                Keep Procedure
              </button>
            </>
          )}

          {/* ── ALLOWED: confirm delete ── */}
          {canDelete && (
            <>
              <div style={{
                background: '#fff5f5', border: '1px solid #fecaca',
                borderRadius: 8, padding: '10px 14px', marginBottom: 14,
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', margin: '0 0 4px' }}>
                  This action cannot be undone.
                </p>
                <p style={{ fontSize: 10, color: '#b91c1c', margin: 0, lineHeight: 1.5 }}>
                  The procedure will be soft-deleted (preserved in audit trail).
                  Chart entries are superseded. Condition links are preserved.
                  The dental chart's planned view will hide the entry on refresh.
                </p>
              </div>

              {invoiceStatus && (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: 8, padding: '10px 14px', marginBottom: 14,
                }}>
                  <p style={{ fontSize: 10, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                    ⚠ This procedure is linked to a <b>{invoiceStatus}</b> invoice.
                    The invoice item will be <b>voided</b> but kept on the invoice
                    record for audit.
                  </p>
                </div>
              )}

              {/* ── Deletion Reason (text input) ── */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Deletion Reason <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  placeholder="Explain why this procedure is being deleted..."
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 12,
                    border: '1px solid #e5e7eb', borderRadius: 6,
                    outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    borderColor: deleteReason.trim() ? '#e5e7eb' : '#fcd34d',
                    borderWidth: deleteReason.trim() ? 1 : 2,
                  }}
                />
              </div>

              {/* Confirmation checkbox */}
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer',
                padding: '10px 12px', borderRadius: 7,
                border: `1px solid ${confirmed ? '#dc2626' : '#e5e7eb'}`,
                background: confirmed ? '#fff5f5' : '#f9fafb',
                marginBottom: 14, transition: 'all .15s',
              }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  style={{ marginTop: 1, accentColor: '#dc2626', width: 14, height: 14, flexShrink: 0 }}
                />
                <span style={{ fontSize: 11, color: '#374151', lineHeight: 1.5 }}>
                  I understand this will permanently delete <b>"{procedureName}"</b> and cannot be undone.
                </span>
              </label>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1, padding: '9px', fontSize: 12, fontWeight: 600,
                    background: '#fff', color: '#374151',
                    border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer',
                  }}
                >
                  Keep Procedure
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!canSubmit || submitting}
                  style={{
                    flex: 2, padding: '9px', fontSize: 12, fontWeight: 700,
                    background: !canSubmit || submitting ? '#fca5a5' : '#dc2626',
                    color: '#fff', border: 'none', borderRadius: 8,
                    cursor: !canSubmit || submitting ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'background .15s',
                  }}
                >
                  {submitting
                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</>
                    : <><Trash2 size={14} /> Delete Permanently</>
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Helper: one row of the "delete rules" gate list ─────────────────────
function RuleRow({ label, pass, value }: { label: string; pass: boolean; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%',
        background: pass ? '#dcfce7' : '#fee2e2',
        color: pass ? '#15803d' : '#b91c1c',
        fontSize: 9, fontWeight: 700, flexShrink: 0,
      }}>
        {pass ? '✓' : '✕'}
      </span>
      <span style={{ color: pass ? '#0f172a' : '#64748b', flex: 1 }}>{label}</span>
      <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 10 }}>{value}</span>
    </div>
  );
}
