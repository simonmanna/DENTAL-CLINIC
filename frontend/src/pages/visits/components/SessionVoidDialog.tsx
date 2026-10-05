// src/pages/visits/components/SessionVoidDialog.tsx
// (Re-purposed: this is now the "Delete Session" dialog. The session is
// soft-deleted on the backend and every side effect created at execution
// time — chart entries, ledger entry, imaging links, progress-report links —
// is reversed. The file name is kept for backwards-compatible imports;
// it also exports `SessionDeleteDialog` as the canonical name.)
import React, { useState, useEffect } from 'react';
import {
  X, AlertTriangle, Loader2, Trash2, FileText,
  ClipboardX, DollarSign, Image as ImageIcon, ChevronDown,
} from 'lucide-react';
import { surfaceShort, surfaceLabel } from '../../../lib/dental/notation';

const DELETE_REASONS = [
  { value: 'WRONG_ENTRY',         label: 'Wrong entry — recorded for wrong patient or visit' },
  { value: 'DUPLICATE',           label: 'Duplicate session — already recorded elsewhere' },
  { value: 'INCORRECT_PROCEDURE', label: 'Incorrect procedure — wrong treatment coded' },
  { value: 'SESSION_DID_NOT_HAPPEN', label: 'Session did not happen — patient did not attend' },
  { value: 'DATA_ERROR',          label: 'Data entry error' },
  { value: 'OTHER',               label: 'Other' },
];

interface ProcedureTarget {
  toothNumber: number;
  surfaces: string[];
}

interface ProcedureSession {
  id: string;
  sessionNumber: number;
  sessionLabel?: string;
  status: string;
  performedDate?: string | null;
  phase?: string | null;
  ledgerEntryId?: string | null;
  ledgerStatus?: string;
  targets?: ProcedureTarget[];
}

interface SessionDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  session: ProcedureSession | null;
  procedureName: string;
  /** Backwards-compatible name. Receives the chosen reason. */
  onVoid: (reason: string) => Promise<void>;
  /** Backwards-compatible flag. */
  voiding: boolean;
}

// Legacy export for any callers still importing the old type name.
export type SessionVoidDialogProps = SessionDeleteDialogProps;

export function SessionDeleteDialog({
  open, onClose, session, procedureName, onVoid, voiding,
}: SessionDeleteDialogProps) {
  const [reason, setReason] = useState('WRONG_ENTRY');
  const [customReason, setCustomReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('WRONG_ENTRY');
      setCustomReason('');
      setConfirmed(false);
    }
  }, [open]);

  if (!open || !session) return null;

  const isBilled = !!session.ledgerEntryId && session.ledgerStatus === 'INVOICED';
  const hasPendingLedger = !!session.ledgerEntryId && session.ledgerStatus !== 'INVOICED';
  const toothNumbers = [...new Set(session.targets?.map((t) => t.toothNumber) ?? [])];
  const surfaces = [...new Set(session.targets?.flatMap((t) => t.surfaces) ?? [])];

  const handleVoid = async () => {
    const finalReason =
      reason === 'OTHER'
        ? customReason || 'Other'
        : DELETE_REASONS.find((r) => r.value === reason)?.label ?? reason;
    await onVoid(finalReason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={onClose} />

      {/* UI CHANGE: Wider (max-w-2xl) and height-constrained (max-h-[90vh]) */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-3 bg-danger-muted/60 border-b border-danger/25 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-danger-muted flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-danger" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-danger">Delete Session</h2>
              <p className="text-xs text-danger">
                Soft-deletes the session and reverses every side effect. Audit trail is preserved.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-danger-muted transition-colors">
            <X className="w-4 h-4 text-danger" />
          </button>
        </div>

        {/* UI CHANGE: Scrollable content area with flex-1 and overflow-y-auto */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">

          {/* ── Invoiced block ─── */}
          {isBilled && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning-muted/60 border border-warning/30">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-warning font-medium">
                This session has been invoiced and cannot be deleted. Please raise a credit note
                through the billing module to reverse the charge.
              </p>
            </div>
          )}

          {/* ── Session summary ─── */}
          <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Session to delete</p>
            <p className="text-sm font-semibold text-foreground">
              {session.sessionLabel ?? `Session #${session.sessionNumber}`}
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{procedureName}</span>
              {session.performedDate && (
                <span>{new Date(session.performedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              )}
              {session.phase && <span>Phase: {session.phase}</span>}
            </div>
            {toothNumbers.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Tooth {toothNumbers.join(', ')}</span>
                {surfaces.length > 0 && (
                  <div className="flex gap-1">
                    {surfaces.map((s) => (
                      <span
                        key={s}
                        title={surfaceLabel(s)}
                        className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded"
                      >
                        {surfaceShort(s)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Consequences ─── */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">This will:</p>
            <div className="space-y-1">
              {[
                { icon: Trash2,     text: 'Soft-delete this session (kept for audit, hidden from lists)', color: 'text-danger' },
                { icon: FileText,   text: `Void ${toothNumbers.length} chart entr${toothNumbers.length !== 1 ? 'ies' : 'y'} created during this session`, color: 'text-danger' },
                { icon: FileText,   text: 'Restore PLANNED status on the dental chart for affected teeth', color: 'text-warning' },
                ...(hasPendingLedger
                  ? [{ icon: DollarSign, text: 'Void the pending ledger entry for this session', color: 'text-warning' }]
                  : []),
                { icon: ImageIcon,  text: 'Unlink any imaging records (the images themselves are preserved)', color: 'text-muted-foreground' },
                { icon: ClipboardX, text: 'Remove this session from any linked progress reports (reports themselves are preserved)', color: 'text-muted-foreground' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <item.icon className={`w-3.5 h-3.5 ${item.color} shrink-0`} />
                  {item.text}
                </div>
              ))}
            </div>
          </div>

          {/* ── Reason ─── */}
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">
              Reason for deletion <span className="text-danger">*</span>
            </label>
            <div className="space-y-1.5">
              {DELETE_REASONS.map((r) => (
                <label key={r.value} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  reason === r.value ? 'border-danger/30 bg-danger-muted/60' : 'border-border hover:border-input'
                }`}>
                  <input
                    type="radio"
                    name="void-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="text-danger border-input focus:ring-danger/60"
                  />
                  <span className="text-xs text-foreground">{r.label}</span>
                </label>
              ))}
            </div>
            {reason === 'OTHER' && (
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Describe the reason…"
                className="mt-2 w-full rounded-xl border border-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-danger/60"
              />
            )}
          </div>

          {/* ── Confirm ─── */}
          {!isBilled && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border-2 border-border cursor-pointer hover:border-danger/25 transition-colors">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-input text-danger focus:ring-danger/60"
              />
              <span className="text-xs text-foreground">
                I understand this session will be soft-deleted and every side effect
                created at execution time will be reversed. The action is logged in
                the audit trail.
              </span>
            </label>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-3 bg-muted/50 border-t border-border flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-input bg-white text-foreground hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleVoid}
            disabled={voiding || !confirmed || isBilled || (reason === 'OTHER' && !customReason.trim())}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {voiding ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
            ) : (
              <><Trash2 className="w-4 h-4" /> Delete session</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Legacy export so existing `import { SessionVoidDialog } from './SessionVoidDialog'`
// keeps compiling.
export const SessionVoidDialog = SessionDeleteDialog;
export default SessionDeleteDialog;