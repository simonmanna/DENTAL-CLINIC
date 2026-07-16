// src/pages/visits/components/ToothDetailDrawer.tsx
// Layout:
//  - Condition Edit/Delete sit in a dedicated bottom row (hairline divider),
//    matching the procedure actions row right below.
//  - Procedure Edit/Delete likewise live in their own bottom row so they're
//    always visible — no more 3-dot menu hiding the affordance.
//  - Removed overflow:hidden from card + drawer shell so nothing is ever clipped.
//  - Label gets flex:1 + wordBreak so it never gets squashed by the badge.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, AlertCircle, CheckCircle, Clock, Wrench,
  Edit2, Layers, Calendar, User, FileText, Trash2, Loader2,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { EditConditionDialog, type EditConditionInitialData, type EditConditionSubmitData } from './EditConditionDialog';
import { EditProcedureDialog, type EditProcedureInitialData } from './EditProcedureDialog';
import { CancelProcedureDialog } from './CancelProcedureDialog';
import { DeleteProcedureDialog } from './DeleteProcedureDialog';
import {
  treatmentProceduresEditApi,
  type ProcedureDeleteEligibility,
} from '../../../lib/api/treatment-procedures-edit';
import { toothName, uiToCanonical, sortUiSurfaces } from '../../../lib/dental/notation';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToothSurface = 'M' | 'O' | 'D' | 'B' | 'L' | 'I';
type EntryType    = 'CONDITION' | 'EXISTING' | 'PLANNED' | 'COMPLETED';
type EntryStatus  = 'ACTIVE' | 'SUPERSEDED' | 'VOIDED' | 'RESOLVED';

export interface ChartEntry {
  id:                  string;
  toothNumbers:        number[];
  surfaces:            ToothSurface[];
  type:                EntryType;
  status:              EntryStatus;
  label:               string;
  code?:               string;
  notes?:              string;
  date:                string;
  provider?:           string;
  // Condition-specific
  patientConditionId?: string;
  conditionId?:        string;
  diagnosedAt?:        string;
  diagnosedBy?:        string;
  severity?:           'MILD' | 'MODERATE' | 'SEVERE' | '';
  conditionStatus?:    import('@/lib/api/conditions').PatientConditionStatus;
  // Procedure-specific
  treatmentProcedureId?: string;
  treatmentPlanId?:      string;
  procedureStatus?:      string;
  totalPrice?:           number;
  currency?:             string;
  sessionType?:          string;
  sessionCount?:         number;
  sessionsCount?:        number;
  billingType?:          string;
  providerId?:           string;
  procedureCode?:        string;
}

// FDI is the single source of truth for tooth identity across this app. The
// tooth NAME displayed in the drawer header MUST come from the same FDI-keyed
// helper the chart itself uses (`toothName` in lib/dental/notation), so a click
// on FDI 18 never reads "LL 2nd Molar" (the old Universal-18 label that lived
// here before this fix). The local Universal-keyed map previously in this file
// mislabelled every FDI tooth — a clinical-display bug, not just a typo.

const COLORS: Record<EntryType, { primary: string; light: string; text: string; label: string; icon: React.ReactNode }> = {
  CONDITION: { primary: '#dc2626', light: '#fee2e2', text: '#991b1b', label: 'Condition', icon: <AlertCircle size={13} /> },
  EXISTING:  { primary: '#15803d', light: '#dcfce7', text: '#14532d', label: 'Existing',  icon: <CheckCircle size={13} /> },
  PLANNED:   { primary: '#1d4ed8', light: '#dbeafe', text: '#1e3a8a', label: 'Planned',   icon: <Clock size={13} /> },
  COMPLETED: { primary: '#0891b2', light: '#cffafe', text: '#164e63', label: 'Completed', icon: <Wrench size={13} /> },
};

// ─── Entry card ───────────────────────────────────────────────────────────────
// Layout structure:
//
//  ┌─ card ───────────────────────────────────────────────┐
//  │ [icon]  Label text …         [BADGE] [⋮ menu?]       │
//  │         CDT code                                     │
//  │         MO surfaces  📅 date  👤 provider  💰 price   │
//  │         [notes block]                                │
//  │  ─────────────────────────── (condition only)        │
//  │                          [Edit]  [Delete]            │
//  └──────────────────────────────────────────────────────┘
//
// Key fixes vs previous version:
//  • Procedure Edit/Delete live in their own bottom row, separated by a
//    hairline divider, matching the condition actions pattern. No more 3-dot
//    ProcedureActionMenu — affordances are always visible.
//  • Card has no overflow:hidden, so nothing is ever clipped.

function EntryCard({
  entry,
  onEditConditionClick,
  onDeleteConditionClick,
  onEditProcedureClick,
  onCancelProcedureClick,
  onDeleteProcedureClick,
  resolveProvider,
}: {
  entry:                    ChartEntry;
  onEditConditionClick?:    (entry: ChartEntry) => void;
  onDeleteConditionClick?:  (entry: ChartEntry) => void;
  onEditProcedureClick?:    (entry: ChartEntry) => void;
  onCancelProcedureClick?:  (entry: ChartEntry) => void;
  onDeleteProcedureClick?:  (entry: ChartEntry, eligibility: ProcedureDeleteEligibility) => void;
  resolveProvider:           (id?: string | null) => string;
  patientId:                 string;
}) {
  const c            = COLORS[entry.type];
  const providerName = resolveProvider(entry.provider);

  const isEditableProcedure =
    (entry.type === 'PLANNED' || entry.type === 'COMPLETED') &&
    !!entry.treatmentProcedureId &&
    !!entry.treatmentPlanId;

  const showConditionActions =
    entry.type === 'CONDITION' && (!!onEditConditionClick || !!onDeleteConditionClick);

  const showProcedureActions =
    isEditableProcedure && (!!onEditProcedureClick || !!onDeleteProcedureClick);

  // Lock procedures whose lifecycle makes them read-only (cancelled / done).
  // The Delete dialog already handles "has sessions → can't hard delete",
  // but Edit on a CANCELLED procedure is meaningless — guard it here.
  const procedureLocked =
    entry.procedureStatus === 'CANCELLED' || entry.procedureStatus === 'COMPLETED';

  // Pre-fetch delete eligibility so the Delete button can fire immediately.
  // The old 3-dot menu fetched this lazily on open; the inline buttons need
  // it ready up-front. `enabled` is false for non-procedures / locked ones.
  const { data: procDeleteEligibility, isLoading: procEligibilityLoading } = useQuery({
    queryKey:  ['proc-delete-eligibility-drawer', entry.treatmentPlanId, entry.treatmentProcedureId],
    queryFn:   () => treatmentProceduresEditApi.checkDeleteEligibility(
                 entry.treatmentPlanId!,
                 entry.treatmentProcedureId!,
               ),
    enabled:   showProcedureActions && !procedureLocked,
    staleTime: 30_000,
  });

  return (
    <div style={{
      background:   '#fff',
      border:       '1px solid #e8ecf2',
      borderLeft:   `3px solid ${c.primary}`,
      borderRadius: 7,
      marginBottom: 8,
    }}>
      <div style={{ padding: '9px 11px' }}>

        {/* ── Main row: icon + full-width content ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>

          {/* Type icon pill */}
          <div style={{
            width: 24, height: 24, borderRadius: 5,
            background: c.light, color: c.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 1,
          }}>
            {c.icon}
          </div>

          {/* Content — takes all remaining width */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Header: label (stretches) + type badge */}
            <div style={{
              display: 'flex', alignItems: 'flex-start',
              justifyContent: 'space-between', gap: 6, marginBottom: 3,
            }}>
              <span style={{
                fontSize: 12, fontWeight: 700, color: '#1e293b',
                lineHeight: 1.35, flex: 1, minWidth: 0,
                // Allow long names to wrap rather than squash the badge
                wordBreak: 'break-word',
              }}>
                {entry.label}
              </span>

              {/* Type badge sits alone on the right now that the action menu
                  moved to the bottom row to mirror the condition pattern. */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                flexShrink: 0, marginTop: 1,
              }}>
                <span style={{
                  padding: '2px 7px', borderRadius: 10,
                  fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                  background: c.light, color: c.text,
                }}>
                  {c.label}
                </span>
              </div>
            </div>

            {/* CDT / procedure code */}
            {entry.code && (
              <span style={{
                fontFamily: 'monospace', fontSize: 10, color: '#2563eb',
                display: 'block', marginBottom: 4,
              }}>
                {entry.code}
              </span>
            )}

            {/* Meta chips: surfaces · date · provider · price */}
            <div style={{
              display: 'flex', flexWrap: 'wrap',
              gap: '3px 10px',
              marginBottom: entry.notes ? 5 : 0,
            }}>
              {entry.surfaces.length > 0 && (
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {'Surfaces: '}
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#334155' }}>
                    {sortUiSurfaces(entry.surfaces).join('')}
                  </span>
                </span>
              )}
              <span style={{ fontSize: 11, color: '#414d5f', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Calendar size={9} />{entry.date}
              </span>
              {providerName && providerName !== '—' && (
                <span style={{ fontSize: 11, color: '#343c48', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <User size={10} />{providerName}
                </span>
              )}
              {entry.totalPrice !== undefined && entry.totalPrice > 0 && (
                <span style={{ fontSize: 10, color: '#64748b' }}>
                  {entry.currency === 'USD' ? '$' : 'UGX '}
                  {Math.round(entry.totalPrice).toLocaleString()}
                </span>
              )}
            </div>

            {/* Notes block */}
            {entry.notes && (
              <div style={{
                padding: '5px 8px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 5, marginTop: 5,
              }}>
                <p style={{
                  fontSize: 10, color: '#64748b', margin: 0,
                  display: 'flex', gap: 4, alignItems: 'flex-start',
                }}>
                  <FileText size={9} style={{ flexShrink: 0, marginTop: 2 }} />
                  {entry.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Condition actions — own row so they never crowd the label ── */}
        {showConditionActions && (
          <div style={{
            display: 'flex', gap: 6,
            marginTop: 9, paddingTop: 8,
            borderTop: '1px solid #f1f5f9',
            justifyContent: 'flex-end',
          }}>
            {onEditConditionClick && (
              <button
                onClick={() => onEditConditionClick(entry)}
                title="Edit condition"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 5,
                  background: '#eff6ff', border: '1px solid #bfdbfe',
                  color: '#1d4ed8', cursor: 'pointer', fontSize: 10, fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                <Edit2 size={10} /> Edit
              </button>
            )}
            {onDeleteConditionClick && (
              <button
                onClick={() => onDeleteConditionClick(entry)}
                title="Delete condition (soft-delete; preserved in audit trail)"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 5,
                  background: '#fef2f2', border: '1px solid #fecaca',
                  color: '#dc2626', cursor: 'pointer', fontSize: 10, fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                <Trash2 size={10} /> Delete
              </button>
            )}
          </div>
        )}

        {/* ── Procedure actions — same pattern as conditions, always visible.
            Edit/Delete live inline instead of behind a 3-dot menu. The
            Delete button waits for the eligibility fetch (rendered as a
            tiny spinner) and is disabled on locked procedures. ── */}
        {showProcedureActions && (
          <div style={{
            display: 'flex', gap: 6, alignItems: 'center',
            marginTop: 9, paddingTop: 8,
            borderTop: '1px solid #f1f5f9',
            justifyContent: 'flex-end',
          }}>
            {/* Sessions hint — mirrors the indicator the old dropdown showed */}
            {procDeleteEligibility && procDeleteEligibility.sessionsCount > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 600, color: '#92400e',
                background: '#fffbeb', border: '1px solid #fde68a',
                padding: '2px 7px', borderRadius: 10,
                display: 'flex', alignItems: 'center', gap: 3,
                marginRight: 'auto',
              }}>
                {procDeleteEligibility.sessionsCount} session
                {procDeleteEligibility.sessionsCount !== 1 ? 's' : ''} recorded
              </span>
            )}
            {onEditProcedureClick && (
              <button
                onClick={() => onEditProcedureClick(entry)}
                disabled={procedureLocked}
                title={procedureLocked
                  ? `Locked — procedure is ${entry.procedureStatus?.toLowerCase()}`
                  : 'Edit procedure'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 5,
                  background: procedureLocked ? '#f1f5f9' : '#eff6ff',
                  border: `1px solid ${procedureLocked ? '#e2e8f0' : '#bfdbfe'}`,
                  color: procedureLocked ? '#94a3b8' : '#1d4ed8',
                  cursor: procedureLocked ? 'not-allowed' : 'pointer',
                  fontSize: 10, fontWeight: 700, lineHeight: 1,
                }}
              >
                <Edit2 size={10} /> Edit
              </button>
            )}
            {onDeleteProcedureClick && (
              <button
                onClick={() => {
                  // Lazy fallback: if eligibility still hasn't loaded when the
                  // user clicks, fetch it then. Normally the useQuery above
                  // resolves before the user reaches the button.
                  if (procDeleteEligibility) {
                    onDeleteProcedureClick(entry, procDeleteEligibility);
                  } else if (entry.treatmentPlanId && entry.treatmentProcedureId && !procedureLocked) {
                    treatmentProceduresEditApi
                      .checkDeleteEligibility(entry.treatmentPlanId, entry.treatmentProcedureId)
                      .then((eligibility) => onDeleteProcedureClick(entry, eligibility))
                      .catch((err) =>
                        toast.error(err?.message || 'Could not check delete eligibility'),
                      );
                  }
                }}
                disabled={procedureLocked || (showProcedureActions && !procedureLocked && procEligibilityLoading)}
                title={
                  procedureLocked
                    ? `Locked — procedure is ${entry.procedureStatus?.toLowerCase()}`
                    : procEligibilityLoading
                      ? 'Checking eligibility…'
                      : 'Delete procedure'
                }
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 5,
                  background: procedureLocked ? '#f1f5f9' : '#fef2f2',
                  border: `1px solid ${procedureLocked ? '#e2e8f0' : '#fecaca'}`,
                  color: procedureLocked ? '#94a3b8' : '#dc2626',
                  cursor:
                    procedureLocked
                      ? 'not-allowed'
                      : procEligibilityLoading
                        ? 'wait'
                        : 'pointer',
                  fontSize: 10, fontWeight: 700, lineHeight: 1,
                }}
              >
                {procEligibilityLoading && !procedureLocked ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Trash2 size={10} />
                )}
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Grouped section ──────────────────────────────────────────────────────────

function TypeSection({
  type, items,
  onEditConditionClick,
  onDeleteConditionClick,
  onEditProcedureClick,
  onCancelProcedureClick,
  onDeleteProcedureClick,
  resolveProvider,
  patientId,
}: {
  type:                     EntryType;
  items:                    ChartEntry[];
  onEditConditionClick?:    (entry: ChartEntry) => void;
  onDeleteConditionClick?:  (entry: ChartEntry) => void;
  onEditProcedureClick?:    (entry: ChartEntry) => void;
  onCancelProcedureClick?:  (entry: ChartEntry) => void;
  onDeleteProcedureClick?:  (entry: ChartEntry, eligibility: ProcedureDeleteEligibility) => void;
  resolveProvider:           (id?: string | null) => string;
  patientId:                 string;
}) {
  if (!items.length) return null;
  const c = COLORS[type];
  return (
    <div style={{ marginBottom: 14 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ color: c.primary, display: 'flex', alignItems: 'center' }}>{c.icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color: '#64748b',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {c.label}
        </span>
        <span style={{
          width: 16, height: 16, borderRadius: '50%',
          background: c.light, color: c.text,
          fontSize: 9, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {items.length}
        </span>
      </div>

      {items.map(entry => (
        <EntryCard
          key={entry.id}
          entry={entry}
          onEditConditionClick={type === 'CONDITION' ? onEditConditionClick : undefined}
          onDeleteConditionClick={type === 'CONDITION' ? onDeleteConditionClick : undefined}
          onEditProcedureClick={onEditProcedureClick}
          onCancelProcedureClick={onCancelProcedureClick}
          onDeleteProcedureClick={onDeleteProcedureClick}
          resolveProvider={resolveProvider}
          patientId={patientId}
        />
      ))}
    </div>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

export interface ToothDetailDrawerProps {
  toothNumber:             number | null;
  entries:                 ChartEntry[];
  onClose:                 () => void;
  defaultDentistId?:       string;
  patientId?:              string;
  visitId?:                string;
  onEditConditionSubmit?:  (data: EditConditionSubmitData) => Promise<void>;
  onDeleteConditionClick?: (entry: ChartEntry) => void;
  resolveProvider:         (providerId?: string | null) => string;
}

export function ToothDetailDrawer({
  toothNumber,
  entries,
  onClose,
  defaultDentistId,
  patientId,
  visitId,
  onEditConditionSubmit,
  onDeleteConditionClick,
  resolveProvider,
}: ToothDetailDrawerProps) {
  const isOpen      = toothNumber !== null;
  const drawerRef   = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // ── Active dialog state ────────────────────────────────────────────────────
  const [editingCondition,    setEditingCondition]    = useState<ChartEntry | null>(null);
  const [editingProcedure,    setEditingProcedure]    = useState<ChartEntry | null>(null);
  const [cancellingProcedure, setCancellingProcedure] = useState<ChartEntry | null>(null);
  const [deletingProcedure,   setDeletingProcedure]   = useState<{
    entry: ChartEntry; eligibility: ProcedureDeleteEligibility;
  } | null>(null);

  // Reset on tooth change
  useEffect(() => {
    setEditingCondition(null);
    setEditingProcedure(null);
    setCancellingProcedure(null);
    setDeletingProcedure(null);
  }, [toothNumber]);

  // Escape key — close drawer only when no dialog is open
  useEffect(() => {
    const anyDialogOpen =
      !!editingCondition || !!editingProcedure || !!cancellingProcedure || !!deletingProcedure;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !anyDialogOpen) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, editingCondition, editingProcedure, cancellingProcedure, deletingProcedure]);

  // ── Filter entries for this tooth ──────────────────────────────────────────
  const toothEntries = entries.filter(
    e =>
      toothNumber !== null &&
      e.toothNumbers.includes(toothNumber) &&
      (e.status === 'ACTIVE' || (e.status === 'RESOLVED' && e.type === 'CONDITION')),
  );

  const grouped: Record<EntryType, ChartEntry[]> = {
    CONDITION: toothEntries.filter(e => e.type === 'CONDITION'),
    PLANNED:   toothEntries.filter(e => e.type === 'PLANNED'),
    COMPLETED: toothEntries.filter(e => e.type === 'COMPLETED'),
    EXISTING:  toothEntries.filter(e => e.type === 'EXISTING'),
  };

  // FDI-keyed via lib/dental/notation — DO NOT reintroduce a Universal-keyed
  // local map here. That was the clinical-display bug this drawer used to have.
  const toothDisplayName = toothNumber ? toothName(toothNumber) : '';

  // ── Build EditProcedureInitialData from a chart entry ─────────────────────
  const buildProcedureInitialData = (entry: ChartEntry): EditProcedureInitialData | null => {
    if (!entry.treatmentProcedureId || !entry.treatmentPlanId) return null;

    // Context-aware UI→canonical mapping: B is LABIAL on anteriors / BUCCAL on
    // posteriors, L is PALATAL on uppers / LINGUAL on lowers. A fixed map here
    // used to rewrite an upper PALATAL surface as LINGUAL on every edit.
    const refTooth = entry.toothNumbers[0] ?? toothNumber ?? 11;

    return {
      treatmentProcedureId: entry.treatmentProcedureId,
      treatmentPlanId:      entry.treatmentPlanId,
      procedureName:        entry.label,
      procedureCode:        entry.procedureCode ?? entry.code,
      toothNumbers:         entry.toothNumbers,
      surfaces:             entry.surfaces.map(s => uiToCanonical(s, refTooth)),
      notes:                entry.notes,
      totalPrice:           entry.totalPrice ?? 0,
      currency:             entry.currency ?? 'UGX',
      sessionType:          entry.sessionType ?? 'SINGLE',
      sessionCount:         entry.sessionCount ?? 1,
      billingType:          entry.billingType ?? 'PAY_FULL',
      providerId:           entry.providerId ?? entry.provider,
      status:               entry.procedureStatus ?? entry.type,
      sessionsCount:        entry.sessionsCount ?? 0,
    };
  };

  // ── Build EditConditionInitialData ────────────────────────────────────────
  const buildConditionInitialData = (entry: ChartEntry): EditConditionInitialData => {
    const rawProvider = entry.provider as unknown;
    const resolvedProviderId =
      rawProvider && typeof rawProvider === 'object'
        ? (rawProvider as { id?: string }).id ?? ''
        : typeof rawProvider === 'string' ? rawProvider : '';

    return {
      chartEntryId:       entry.id,
      patientConditionId: entry.patientConditionId,
      toothNumbers:       entry.toothNumbers,
      surfaces:           entry.surfaces,
      label:              entry.label,
      code:               entry.code,
      notes:              entry.notes,
      conditionId:        entry.conditionId,
      diagnosedAt:        entry.diagnosedAt ?? entry.date,
      diagnosedBy:        resolvedProviderId,
      providerId:         resolvedProviderId,
      severity:           entry.severity ?? '',
      status:             entry.conditionStatus ?? 'ACTIVE',
    };
  };

  // E1 fix: memoize the initialData shape for the dialog so it has a stable
  // reference while the same condition is being edited. Without this, every
  // parent re-render passes a new object literal into <EditConditionDialog>,
  // whose form-seed useEffect depends on `initialData` and resets all fields,
  // wiping in-progress edits. The key is (patientConditionId ?? chartEntryId)
  // — that flips when the user opens a *different* condition, not on chart
  // re-fetch or query invalidation.
  const conditionInitialData = useMemo(
    () => (editingCondition ? buildConditionInitialData(editingCondition) : null),
    [editingCondition],
  );

  // ── Invalidate relevant query caches ──────────────────────────────────────
  // Prefix-matched against the chart's ["chart-entries", patientId, visitId]
  // key. No patientId means demo mode — nothing is cached under real keys.
  const invalidate = () => {
    if (!patientId) return;
    queryClient.invalidateQueries({ queryKey: ['chart-entries', patientId] });
    queryClient.invalidateQueries({ queryKey: ['treatment-procedures', patientId] });
    queryClient.invalidateQueries({ queryKey: ['tx-plans', patientId] });
  };

  // ── Cancel procedure ──────────────────────────────────────────────────────
  const handleCancelConfirm = async (reason: string) => {
    if (!cancellingProcedure?.treatmentPlanId || !cancellingProcedure?.treatmentProcedureId) return;
    try {
      const result = await treatmentProceduresEditApi.cancelProcedure(
        cancellingProcedure.treatmentPlanId,
        cancellingProcedure.treatmentProcedureId,
        { reason },
      );
      toast.success(result.message);
      invalidate();
      setCancellingProcedure(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to cancel procedure');
      throw err;
    }
  };

  // ── Delete procedure ──────────────────────────────────────────────────────
  const handleDeleteConfirm = async (reason: string) => {
    if (!deletingProcedure) return;
    const { entry } = deletingProcedure;
    if (!entry.treatmentPlanId || !entry.treatmentProcedureId) return;
    try {
      await treatmentProceduresEditApi.deleteProcedure(
        entry.treatmentPlanId,
        entry.treatmentProcedureId,
        { reason },
      );
      toast.success('Procedure deleted successfully');
      invalidate();
      setDeletingProcedure(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to delete procedure');
      throw err;
    }
  };

  // ── Condition edit submit ─────────────────────────────────────────────────
  const handleConditionEditSubmit = async (data: EditConditionSubmitData) => {
    if (onEditConditionSubmit) await onEditConditionSubmit(data);
    setEditingCondition(null);
  };

  const anyDialogOpen =
    !!editingCondition || !!editingProcedure || !!cancellingProcedure || !!deletingProcedure;

  return (
    <>
      {/* Backdrop */}
      {isOpen && !anyDialogOpen && (
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 40 }} />
      )}

      {/* Drawer panel
          Note: overflow is NOT set to hidden here.
          The scroll area (body) handles its own overflow independently. */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-label={`Tooth ${toothNumber} details`}
        style={{
          position:      'absolute',
          top: 100, right: 0, bottom: 0,
          width:         370,
          background:    '#fff',
          borderLeft:    '1px solid #e2e8f0',
          boxShadow:     '-4px 0 16px rgba(0,0,0,0.07)',
          display:       'flex',
          flexDirection: 'column',
          transform:     isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition:    'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
          zIndex:        50,
          outline:       'none',
          // overflow: 'hidden' intentionally omitted — see note above
        }}
      >
        {/* ── Header ── */}
        <div style={{
          background: '#183c6b', padding: '11px 14px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 5, background: '#334155',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Layers size={13} color="#94a3b8" />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Tooth #{toothNumber}
                </p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{toothDisplayName}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
              {(['CONDITION', 'PLANNED', 'COMPLETED', 'EXISTING'] as EntryType[]).map(t => {
                const count = grouped[t].length;
                if (!count) return null;
                const c = COLORS[t];
                return (
                  <span key={t} style={{
                    padding: '1px 7px', borderRadius: 8,
                    background: c.primary + '30', color: c.light,
                    fontSize: 9, fontWeight: 700,
                  }}>
                    {count} {c.label}
                  </span>
                );
              })}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#64748b', padding: 4, display: 'flex', alignItems: 'center',
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '12px 12px 16px' }}>
          {toothEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, background: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 10px',
              }}>
                <CheckCircle size={20} color="#cbd5e1" />
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                No chart entries for this tooth
              </p>
              <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 4 }}>
                Use the buttons above the chart to add conditions or procedures.
              </p>
            </div>
          ) : (
            <>
              <TypeSection
                type="CONDITION" items={grouped.CONDITION}
                onEditConditionClick={setEditingCondition}
                onDeleteConditionClick={onDeleteConditionClick}
                resolveProvider={resolveProvider}
                patientId={patientId}
              />
              <TypeSection
                type="PLANNED" items={grouped.PLANNED}
                onEditProcedureClick={setEditingProcedure}
                onCancelProcedureClick={setCancellingProcedure}
                onDeleteProcedureClick={(entry, eligibility) =>
                  setDeletingProcedure({ entry, eligibility })
                }
                resolveProvider={resolveProvider}
                patientId={patientId}
              />
              <TypeSection
                type="COMPLETED" items={grouped.COMPLETED}
                onEditProcedureClick={setEditingProcedure}
                onCancelProcedureClick={setCancellingProcedure}
                onDeleteProcedureClick={(entry, eligibility) =>
                  setDeletingProcedure({ entry, eligibility })
                }
                resolveProvider={resolveProvider}
                patientId={patientId}
              />
              <TypeSection
                type="EXISTING" items={grouped.EXISTING}
                resolveProvider={resolveProvider}
                patientId={patientId}
              />
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '8px 12px', borderTop: '1px solid #e8ecf2',
          background: '#f8fafc', flexShrink: 0,
        }}>
          <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, textAlign: 'center' }}>
            {toothEntries.length} active {toothEntries.length === 1 ? 'entry' : 'entries'} · Esc to close
          </p>
        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}

      {conditionInitialData && (
        <EditConditionDialog
          isOpen
          onClose={() => setEditingCondition(null)}
          initialData={conditionInitialData}
          defaultDentistId={defaultDentistId}
          onSubmit={handleConditionEditSubmit}
        />
      )}

      {editingProcedure && patientId && buildProcedureInitialData(editingProcedure) && (
        <EditProcedureDialog
          isOpen
          onClose={() => setEditingProcedure(null)}
          initialData={buildProcedureInitialData(editingProcedure)!}
          patientId={patientId}
          visitId={visitId}
          dentistId={defaultDentistId}
          onSuccess={() => {
            toast.success('Procedure updated successfully');
            invalidate();
            setEditingProcedure(null);
          }}
        />
      )}

      {cancellingProcedure && (
        <CancelProcedureDialog
          isOpen
          onClose={() => setCancellingProcedure(null)}
          procedureName={cancellingProcedure.label}
          sessionsCount={0}
          onConfirm={handleCancelConfirm}
        />
      )}

      {deletingProcedure && (
        <DeleteProcedureDialog
            isOpen
            onClose={() => setDeletingProcedure(null)}
            procedureName={deletingProcedure.entry.label}
            canDelete={deletingProcedure.eligibility.canDelete}
            canCancel={deletingProcedure.eligibility.canCancel}
            reason={deletingProcedure.eligibility.reason}
            sessionsCount={deletingProcedure.eligibility.sessionsCount}
            status={deletingProcedure.eligibility.status}
            paymentStatus={deletingProcedure.eligibility.paymentStatus}
            invoiceStatus={deletingProcedure.eligibility.invoiceStatus ?? null}
            invoiceAmountPaid={deletingProcedure.eligibility.invoiceAmountPaid ?? 0}
            onConfirmDelete={handleDeleteConfirm}
            onGoToCancel={() => setCancellingProcedure(deletingProcedure.entry)}
          />
      )}
    </>
  );
}