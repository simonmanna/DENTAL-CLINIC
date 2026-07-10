// src/pages/visits/components/SessionEditDialog.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  X, AlertTriangle, CheckCircle, Plus, Minus,
  Info, FileEdit, Clock, Loader2, ChevronDown, ChevronUp,
  Calendar, Stethoscope, Flag, Circle, AlertCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { staffApi } from '../../../lib/api/staff-api';
import { SURFACE_META } from './SurfacePicker';
import {
  canonicalToUi,
  uiToCanonical,
  surfaceLabel,
  type UiSurface,
} from '../../../lib/dental/notation';

// ─── Constants ────────────────────────────────────────────────────────────────

const EDIT_REASONS = [
  { value: 'DOCUMENTATION_CORRECTION', label: 'Documentation correction' },
  { value: 'ADDITIONAL_SURFACE',       label: 'Additional surface treated' },
  { value: 'SURFACE_NOT_TREATED',      label: 'Surface not actually treated' },
  { value: 'CLINICAL_REFINEMENT',      label: 'Clinical record refinement' },
  { value: 'DATA_ENTRY_ERROR',         label: 'Data entry error' },
  { value: 'OTHER',                    label: 'Other' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProcedureTarget {
  id: string;
  toothNumber: number;
  surfaces: string[];
}

interface ProcedureSession {
  id: string;
  sessionNumber: number;
  sessionLabel?: string;
  status: string;
  performedDate?: string | null;
  performedNotes?: string | null;
  phase?: string | null;
  isFinal?: boolean;
  outcome?: string | null;
  providerId?: string | null;
  ledgerEntryId?: string | null;
  ledgerStatus?: string;
  targets?: ProcedureTarget[];
}

type ToothStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

interface EditToothStatusPayload {
  toothNumber: number;
  surfaces?: string[];
  status: ToothStatus;
  notes?: string;
}

interface SessionEditDialogProps {
  open: boolean;
  onClose: () => void;
  session: ProcedureSession | null;
  procedureName: string;
  planId: string;
  procedureId: string;
  onSave: (data: {
    surfaces?: string[];
    notes?: string;
    phase?: string;
    reason: string;
    performedDate?: string;
    providerId?: string;
    outcome?: 'PARTIAL' | 'COMPLETED';
    isFinal?: boolean;
    toothStatuses?: EditToothStatusPayload[];
  }) => Promise<void>;
  saving: boolean;
}

// ─── Surface diff chip ────────────────────────────────────────────────────────

function SurfaceChip({
  surface, state, onClick, disabled,
}: {
  surface: typeof SURFACE_META[0];
  state: 'keeping' | 'adding' | 'removing' | 'available';
  onClick: () => void;
  disabled?: boolean;
}) {
  const styles = {
    keeping:   'bg-blue-600 text-white border-blue-600 shadow-sm',
    adding:    'bg-emerald-500 text-white border-emerald-500 shadow-sm ring-2 ring-emerald-300',
    removing:  'bg-red-100 text-red-700 border-red-400 line-through ring-2 ring-red-300',
    available: 'bg-white text-slate-400 border-slate-200 hover:border-blue-300 hover:text-blue-500',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${surface.label}${state === 'removing' ? ' — will be removed' : state === 'adding' ? ' — being added' : ''}`}
      className={`
        w-11 h-11 rounded-xl border-2 font-mono font-bold text-sm
        transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50
        ${styles[state]}
      `}
    >
      {surface.shortLabel}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionEditDialog({
  open, onClose, session, procedureName,
  planId, procedureId, onSave, saving,
}: SessionEditDialogProps) {

  // Current (saved) surfaces — canonical enum values as stored on the targets
  const originalSurfaces = useMemo(
    () => [...new Set(session?.targets?.flatMap((t) => t.surfaces) ?? [])],
    [session],
  );

  // The same surfaces collapsed to the 6 UI codes (M/D/O/I/B/L) — the grid,
  // diff and toggle logic all operate on UI codes so BUCCAL/LABIAL records
  // show up as the "B" the clinician originally pressed.
  const originalUi = useMemo<UiSurface[]>(
    () => [...new Set(originalSurfaces.map(canonicalToUi))],
    [originalSurfaces],
  );

  // Reference tooth for converting UI codes back to canonical on save
  // (same pattern as AddTreatmentDialog). Mixed anterior/posterior sessions
  // convert against the first tooth — display-equivalent either way.
  const refTooth = session?.targets?.[0]?.toothNumber ?? 11;

  // Editing state — surfaces / notes / reason (existing)
  const [editSurfaces, setEditSurfaces] = useState<UiSurface[]>([]);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('DOCUMENTATION_CORRECTION');
  const [customReason, setCustomReason] = useState('');
  const [confirmRemovals, setConfirmRemovals] = useState(false);

  // Editing state — newly editable fields (date / provider / outcome / per-tooth)
  const [performedDate, setPerformedDate] = useState<string>('');
  const [providerId, setProviderId] = useState<string>('');
  const [outcome, setOutcome] = useState<'PARTIAL' | 'COMPLETED'>('COMPLETED');
  const [isFinal, setIsFinal] = useState<boolean>(false);
  const [toothStatuses, setToothStatuses] = useState<
    Array<{ toothNumber: number; status: ToothStatus }>
  >([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Dentists for the provider dropdown (lazy — only when dialog is open)
  const { data: dentists = [] } = useQuery({
    queryKey: ['dentists'],
    queryFn: staffApi.getDentists,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const isBilled =
    !!session?.ledgerEntryId && session?.ledgerStatus === 'INVOICED';

  // ── Original tooth-status snapshot (for diff detection) ───────────────
  const originalToothStatuses = useMemo<
    Array<{ toothNumber: number; status: ToothStatus }>
  >(() => {
    // The backend already records each tooth's COMPLETED chart-entry status
    // via the executed session. We don't have per-tooth status here, so we
    // default to COMPLETED for each target (the same default the execution
    // dialog uses). The user can change it to skip / pending / in-progress.
    return (session?.targets ?? []).map((t) => ({
      toothNumber: t.toothNumber,
      status: 'COMPLETED' as ToothStatus,
    }));
  }, [session]);

  // Format an ISO date as yyyy-MM-dd for the <input type="date"> element.
  const isoToDate = (s?: string | null) =>
    s ? new Date(s).toISOString().split('T')[0] : '';

  // ── Diff computation (UI codes) ─────────────────────────────────────────
  const surfacesAdded   = editSurfaces.filter((s) => !originalUi.includes(s));
  const surfacesRemoved = originalUi.filter((s) => !editSurfaces.includes(s));

  const dateChanged =
    !!performedDate && performedDate !== isoToDate(session?.performedDate);
  const providerChanged =
    providerId !== (session?.providerId ?? '');
  const outcomeChanged = outcome !== ((session?.outcome as any) ?? 'COMPLETED');
  const isFinalChanged = isFinal !== !!session?.isFinal;
  const toothStatusChanges = toothStatuses.filter((t) => {
    const o = originalToothStatuses.find((x) => x.toothNumber === t.toothNumber);
    return !o || o.status !== t.status;
  });

  const hasChanges =
    surfacesAdded.length > 0 ||
    surfacesRemoved.length > 0 ||
    notes !== (session?.performedNotes ?? '') ||
    dateChanged ||
    providerChanged ||
    outcomeChanged ||
    isFinalChanged ||
    toothStatusChanges.length > 0;

  const hasSurfaceRemovals = surfacesRemoved.length > 0;
  const canSave =
    hasChanges &&
    reason &&
    (!hasSurfaceRemovals || confirmRemovals) &&
    (!isBilled || surfacesRemoved.length === 0);

  // ── Initialise on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (!session || !open) return;
    setEditSurfaces([...originalUi]);
    setNotes(session.performedNotes ?? '');
    setReason('DOCUMENTATION_CORRECTION');
    setCustomReason('');
    setConfirmRemovals(false);

    setPerformedDate(isoToDate(session.performedDate));
    setProviderId(session.providerId ?? '');
    setOutcome((session.outcome as any) ?? 'COMPLETED');
    setIsFinal(!!session.isFinal);
    setToothStatuses(
      (session.targets ?? []).map((t) => ({
        toothNumber: t.toothNumber,
        status: 'COMPLETED' as ToothStatus,
      })),
    );
    setShowAdvanced(false);
  }, [session, open]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const toggleSurface = (value: UiSurface) => {
    if (isBilled && originalUi.includes(value)) return; // block removal when billed
    setEditSurfaces((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  };

  const getSurfaceState = (value: UiSurface): 'keeping' | 'adding' | 'removing' | 'available' => {
    const inOriginal = originalUi.includes(value);
    const inEdit     = editSurfaces.includes(value);
    if (inOriginal && inEdit)  return 'keeping';
    if (!inOriginal && inEdit) return 'adding';
    if (inOriginal && !inEdit) return 'removing';
    return 'available';
  };

  const handleSave = async () => {
    const finalReason = reason === 'OTHER' ? customReason || 'Other' : EDIT_REASONS.find((r) => r.value === reason)?.label ?? reason;
    await onSave({
      // Only send surfaces when the set actually changed — a notes-only edit
      // must not silently rewrite stored values (e.g. legacy FACIAL → LABIAL).
      ...(surfacesAdded.length || surfacesRemoved.length
        ? { surfaces: editSurfaces.map((s) => uiToCanonical(s, refTooth)) }
        : {}),
      notes,
      reason: finalReason,
      // New fields — only sent if the user actually changed them, so we don't
      // accidentally overwrite a value with the same value we displayed.
      ...(dateChanged ? { performedDate } : {}),
      ...(providerChanged ? { providerId } : {}),
      ...(outcomeChanged ? { outcome } : {}),
      ...(isFinalChanged ? { isFinal } : {}),
      ...(toothStatusChanges.length
        ? {
            toothStatuses: toothStatusChanges.map((t) => ({
              toothNumber: t.toothNumber,
              status: t.status,
            })),
          }
        : {}),
    });
  };

  if (!open || !session) return null;

  const toothNumbers = [...new Set(session.targets?.map((t) => t.toothNumber) ?? [])];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileEdit className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Edit Session</h2>
              <p className="text-xs text-slate-500">
                {procedureName} · Session #{session.sessionNumber}
                {session.performedDate && (
                  <> · {new Date(session.performedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── Billed warning ─── */}
          {isBilled && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800">
                <span className="font-semibold">This session has been invoiced.</span>
                {' '}Surface removal is disabled. You may update clinical notes only.
              </div>
            </div>
          )}

          {/* ── Tooth(s) + surfaces ─── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">
                Surfaces treated
                {toothNumbers.length > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    Tooth {toothNumbers.join(', ')}
                  </span>
                )}
              </h3>
              {editSurfaces.length > 0 && (
                <button
                  onClick={() => !isBilled && setEditSurfaces([])}
                  disabled={isBilled}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                >
                  clear all
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {SURFACE_META.map((s) => {
                const state = getSurfaceState(s.key);
                const disabledByBilling = isBilled && originalUi.includes(s.key);
                return (
                  <SurfaceChip
                    key={s.key}
                    surface={s}
                    state={state}
                    onClick={() => toggleSurface(s.key)}
                    disabled={disabledByBilling}
                  />
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-600 inline-block" /> Keeping
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Adding
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-300 inline-block" /> Removing
              </span>
            </div>
          </div>

          {/* ── Diff summary ─── */}
          {(surfacesAdded.length > 0 || surfacesRemoved.length > 0) && (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {surfacesAdded.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50">
                  <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-xs text-emerald-800 font-medium">Adding:</span>
                  <div className="flex gap-1">
                    {surfacesAdded.map((s) => (
                      <span key={s} className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-emerald-600 ml-auto">
                    → chart entry will be updated
                  </span>
                </div>
              )}
              {surfacesRemoved.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50">
                  <Minus className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span className="text-xs text-red-800 font-medium">Removing:</span>
                  <div className="flex gap-1">
                    {surfacesRemoved.map((s) => (
                      <span key={s} className="text-[10px] font-mono bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-red-600 ml-auto">
                    → chart entry will be voided
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Removal confirmation ─── */}
          {hasSurfaceRemovals && !isBilled && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border-2 border-red-200 bg-red-50 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmRemovals}
                onChange={(e) => setConfirmRemovals(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500"
              />
              <div className="text-xs text-red-800">
                <span className="font-semibold">I confirm this removal.</span>
                {' '}Removing surfaces will void the corresponding chart entry for{' '}
                {surfacesRemoved.map((s) => surfaceLabel(uiToCanonical(s, refTooth))).join(', ')}.
                This is recorded in the audit log and cannot be silently undone.
              </div>
            </label>
          )}

          {/* ── Clinical notes ─── */}
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-2">
              Clinical notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Update clinical observations, corrections or additional context…"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* ── Reason for edit ─── */}
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-2">
              Reason for correction <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 pr-10 py-2.5 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {EDIT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            {reason === 'OTHER' && (
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Describe the reason…"
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* ── Advanced fields (collapsible) ─── */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced((p) => !p)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Flag className="w-3.5 h-3.5 text-blue-500" />
                More fields
                <span className="text-[10px] font-normal text-slate-400">
                  date · provider · outcome · per-tooth
                </span>
              </span>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showAdvanced && (
              <div className="p-3 space-y-3 border-t border-slate-100">
                {/* Date + Provider */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Performed date
                    </label>
                    <input
                      type="date"
                      value={performedDate}
                      onChange={(e) => setPerformedDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <Stethoscope className="w-3 h-3" /> Provider
                    </label>
                    <select
                      value={providerId}
                      onChange={(e) => setProviderId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">— Unassigned —</option>
                      {(dentists as any[]).map((d) => (
                        <option key={d.id} value={d.id}>
                          Dr. {d.firstName} {d.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Outcome + isFinal */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Outcome
                    </label>
                    <div className="flex gap-1.5">
                      {(['PARTIAL', 'COMPLETED'] as const).map((opt) => {
                        const active = outcome === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setOutcome(opt)}
                            className={`flex-1 px-2.5 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                              active
                                ? opt === 'COMPLETED'
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                  : 'border-amber-500 bg-amber-50 text-amber-700'
                                : 'border-slate-200 text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            {opt === 'COMPLETED' ? 'Completed' : 'Partial'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Final session?
                    </label>
                    <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border-2 border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={isFinal}
                        onChange={(e) => setIsFinal(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-700">
                        Closes the procedure (status → COMPLETED)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Per-tooth status overrides */}
                {toothStatuses.length > 0 && (
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                      Per-tooth status
                    </label>
                    <div className="space-y-1.5">
                      {toothStatuses.map((t, idx) => {
                        const statusCfg: Record<
                          ToothStatus,
                          { label: string; cls: string; Icon: any }
                        > = {
                          COMPLETED: {
                            label: 'Completed',
                            cls: 'border-emerald-400 bg-emerald-50 text-emerald-700',
                            Icon: CheckCircle,
                          },
                          IN_PROGRESS: {
                            label: 'In progress',
                            cls: 'border-blue-400 bg-blue-50 text-blue-700',
                            Icon: Clock,
                          },
                          SKIPPED: {
                            label: 'Skipped',
                            cls: 'border-amber-400 bg-amber-50 text-amber-700',
                            Icon: AlertCircle,
                          },
                          PENDING: {
                            label: 'Pending',
                            cls: 'border-slate-300 bg-slate-100 text-slate-600',
                            Icon: Circle,
                          },
                        };
                        return (
                          <div
                            key={t.toothNumber}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                          >
                            <span className="w-7 h-7 rounded-full bg-slate-100 text-xs font-bold text-slate-700 flex items-center justify-center shrink-0">
                              {t.toothNumber}
                            </span>
                            <div className="flex-1 grid grid-cols-4 gap-1">
                              {(
                                [
                                  'COMPLETED',
                                  'IN_PROGRESS',
                                  'SKIPPED',
                                  'PENDING',
                                ] as ToothStatus[]
                              ).map((s) => {
                                const cfg = statusCfg[s];
                                const active = t.status === s;
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() =>
                                      setToothStatuses((prev) =>
                                        prev.map((x, i) =>
                                          i === idx ? { ...x, status: s } : x,
                                        ),
                                      )
                                    }
                                    className={`flex items-center justify-center gap-1 px-1 py-1 rounded-md border text-[10px] font-semibold transition-all ${
                                      active
                                        ? cfg.cls
                                        : 'border-slate-200 text-slate-400 hover:border-slate-300'
                                    }`}
                                  >
                                    <cfg.Icon className="w-2.5 h-2.5" />
                                    {cfg.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {toothStatusChanges.length > 0 && (
                      <p className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {toothStatusChanges.length} tooth status change(s) will
                        re-sync the corresponding chart entries.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Audit notice ─── */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <p className="text-[11px] text-slate-500">
              All changes are recorded in the session audit log with timestamp and reason.
            </p>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            {!hasChanges && (
              <span className="text-xs text-slate-400">No changes made</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                <><CheckCircle className="w-4 h-4" /> Save changes</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionEditDialog;