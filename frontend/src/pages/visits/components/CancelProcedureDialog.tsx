// src/pages/visits/components/CancelProcedureDialog.tsx
// Confirmation dialog for cancelling a procedure.
//
// Spec rules (enforced server-side; surfaced here for clarity):
//   ✅ Cancellation reason is REQUIRED
//   ✅ Allowed from: PLANNED, IN_PROGRESS, ON_HOLD (workflow diagram)
//   ❌ Blocked when: COMPLETED (legal-record rule), CANCELLED (already),
//                    REFERRED (clinical decision made elsewhere)
//   ✅ Payments DO NOT block cancellation — refund / void the invoice
//      separately after cancelling.
//   ✅ Procedure REMAINS VISIBLE in history (status = CANCELLED).
//
// The audit log captures: who, when, reason, and full procedure snapshot.

import React, { useState } from 'react';
import {
  X, AlertTriangle, Loader2, ShieldAlert, History, Ban,
} from 'lucide-react';

// Reason presets — aligned with the spec examples.
const CANCEL_REASONS = [
  'Patient declined treatment',
  'Alternative treatment chosen',
  'Diagnosis changed',
  'Treatment no longer required',
  'Duplicate procedure',
  'Financial reasons',
  'Other',
] as const;

export interface CancelProcedureDialogProps {
  isOpen:        boolean;
  onClose:       () => void;
  procedureName: string;
  status?:       string;
  sessionsCount: number;
  paymentStatus?: string;
  hasInvoice?:   boolean;
  onConfirm:     (reason: string) => Promise<void>;
}

export function CancelProcedureDialog({
  isOpen,
  onClose,
  procedureName,
  status,
  sessionsCount,
  paymentStatus,
  hasInvoice,
  onConfirm,
}: CancelProcedureDialogProps) {
  const [reason,      setReason]      = useState('');
  const [customNote,  setCustomNote]  = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,        setError]       = useState<string | null>(null);

  const hasSessions = sessionsCount > 0;
  const finalReason = reason === 'Other' ? customNote : reason;

  // Spec: COMPLETED procedures are part of the legal record — they cannot be
  // cancelled. Show a clear block instead of the cancel form.
  const isCompleted = status === 'COMPLETED';
  const isReferred  = status === 'REFERRED';
  const isBlocked   = isCompleted || isReferred;

  const handleConfirm = async () => {
    if (!finalReason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(finalReason.trim());
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Cancellation failed.');
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
          width: 480, maxWidth: '94vw',
          backgroundColor: '#fff', borderRadius: 12,
          boxShadow: '0 24px 48px rgba(0,0,0,0.22)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: isBlocked
            ? 'linear-gradient(135deg, #4b5563, #6b7280)'
            : 'linear-gradient(135deg, #b45309, #d97706)',
          color: '#fff', padding: '14px 18px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {isBlocked ? <Ban size={20} style={{ flexShrink: 0, marginTop: 1 }} />
                       : <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: 1 }} />}
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                {isBlocked ? 'Cannot Cancel Procedure' : 'Cancel Procedure'}
              </h3>
              <p style={{ fontSize: 11, color: isBlocked ? '#d1d5db' : '#fef3c7', margin: '3px 0 0' }}>
                {procedureName}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Sessions preserved notice — sessions exist, cancellation will preserve them */}
        {hasSessions && !isBlocked && (
          <div style={{
            background: '#eff6ff', borderBottom: '1px solid #bfdbfe',
            padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <History size={14} color="#2563eb" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 10, color: '#1d4ed8', margin: 0, lineHeight: 1.5 }}>
              <b>{sessionsCount} session record{sessionsCount !== 1 ? 's' : ''}</b> will be
              preserved for clinical audit history. COMPLETED sessions remain
              untouched; only PENDING/IN_PROGRESS sessions are cancelled.
            </p>
          </div>
        )}

        {/* Payments notice — cancellation is allowed even with payments, just informs */}
        {paymentStatus && paymentStatus !== 'OPEN' && paymentStatus !== 'UNPAID' && !isBlocked && (
          <div style={{
            background: '#fff7ed', borderBottom: '1px solid #fed7aa',
            padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={14} color="#c2410c" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 10, color: '#9a3412', margin: 0, lineHeight: 1.5 }}>
              This procedure has financial transactions attached
              ({paymentStatus}). Cancellation will succeed; refund the patient
              or void the invoice afterwards.
            </p>
          </div>
        )}

        <div style={{ padding: '16px 18px' }}>
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '10px 12px', marginBottom: 12,
              color: '#991b1b', fontSize: 11,
            }}>
              {error}
            </div>
          )}

          {isBlocked ? (
            <>
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, padding: '12px 14px', marginBottom: 14,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <AlertTriangle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', margin: 0 }}>
                    {isCompleted
                      ? 'Completed procedures cannot be cancelled.'
                      : 'Referred procedures cannot be cancelled.'}
                  </p>
                  <p style={{ fontSize: 10, color: '#b91c1c', marginTop: 3 }}>
                    {isCompleted
                      ? 'They are part of the permanent clinical record. Use the Edit dialog to append an additional clinical note instead.'
                      : 'The clinical decision was made elsewhere (referral).'}
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                style={{
                  width: '100%', padding: '9px', fontSize: 12, fontWeight: 600,
                  background: '#fff', color: '#374151',
                  border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer',
                }}
              >
                Close
              </button>
            </>
          ) : (
            <>
              <div style={{
                background: '#fffbeb', border: '1px solid #fcd34d',
                borderRadius: 8, padding: '10px 14px', marginBottom: 14,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <AlertTriangle size={14} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', margin: 0 }}>
                    This action cannot be undone.
                  </p>
                  <p style={{ fontSize: 10, color: '#b45309', marginTop: 3 }}>
                    The procedure will be marked as <b>CANCELLED</b> but{' '}
                    <b>stays visible in history</b> (gray, strike-through). Any
                    pending ledger entries will be voided. The audit log records
                    who, when, and why.
                  </p>
                </div>
              </div>

              {/* Reason selector — spec examples */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Cancellation Reason <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {CANCEL_REASONS.map(r => (
                    <label key={r} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                      border: `1px solid ${reason === r ? '#d97706' : '#e5e7eb'}`,
                      background: reason === r ? '#fffbeb' : '#fff',
                      transition: 'all .1s',
                    }}>
                      <input
                        type="radio"
                        name="cancel-reason"
                        value={r}
                        checked={reason === r}
                        onChange={() => setReason(r)}
                        style={{ accentColor: '#d97706' }}
                      />
                      <span style={{ fontSize: 11, color: reason === r ? '#92400e' : '#374151', fontWeight: reason === r ? 600 : 400 }}>
                        {r}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Custom note when "Other" selected */}
              {reason === 'Other' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>
                    Please specify <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={customNote}
                    onChange={e => setCustomNote(e.target.value)}
                    placeholder="Enter reason..."
                    style={{
                      width: '100%', padding: '8px 10px', fontSize: 12,
                      border: '1px solid #e5e7eb', borderRadius: 6,
                      outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {/* Actions */}
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
                  onClick={handleConfirm}
                  disabled={!finalReason.trim() || submitting}
                  style={{
                    flex: 2, padding: '9px', fontSize: 12, fontWeight: 700,
                    background: !finalReason.trim() || submitting ? '#fcd34d' : '#d97706',
                    color: '#fff', border: 'none', borderRadius: 8,
                    cursor: !finalReason.trim() || submitting ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {submitting
                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Cancelling…</>
                    : 'Confirm Cancellation'}
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