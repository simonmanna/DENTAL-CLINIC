// src/pages/visits/components/EditProcedureDialog.tsx
// Edit Procedure Dialog — smart field locking based on session + invoice state.
//
// Locking rules:
//   • Tooth numbers: editable when no sessions; 409 server-side otherwise.
//   • Surfaces: editable always (warned in UI when sessions exist).
//   • Pricing (totalPrice / discount / tax / currency / billingType / deposit):
//       editable only when the linked invoice is DRAFT (or absent).
//       POSTED invoice or any payment → pricing fields disabled in the UI
//       AND refused server-side with 409 (defence-in-depth).
//   • Session config (SINGLE/MULTI, sessionCount): editable when no sessions.
//   • Reason for edit: ALWAYS required (not optional any more).
//
// Refresh: the onSuccess invalidates every chart + plan + procedure query key
// so the dental chart and treatment-plan tab update without a page reload.

import React, { useState, useEffect, useMemo } from 'react';
import {
  X, AlertTriangle, CheckCircle, Lock, Unlock, Loader2,
  Stethoscope, DollarSign, FileText, Info, ShieldAlert,
  Repeat, CalendarDays, Banknote, Wallet, CreditCard, Hash,
  Plus, Minus, Sparkles, Receipt, Pencil, RotateCcw, Tag, AlertCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '../../../lib/api/staff-api';
import { treatmentProceduresEditApi } from '../../../lib/api/treatment-procedures-edit';
import { treatmentPlansApi } from '../../../lib/api/treatment-plans';
import api from '@/lib/api/client';
import { SURFACE_META } from './SurfacePicker';
import {
  canonicalToUi,
  uiToCanonical,
  type UiSurface,
} from '../../../lib/dental/notation';

type Currency = 'USD' | 'UGX';

const DEFAULT_EXCHANGE_RATE = 3600;

export interface EditProcedureInitialData {
  treatmentProcedureId: string;
  treatmentPlanId: string;
  procedureName: string;
  procedureCode?: string;
  toothNumbers: number[];
  surfaces: string[];       // API-format: MESIAL, OCCLUSAL, etc.
  notes?: string;

  // Pricing snapshot
  totalPrice: number;        // current final price (what patient pays)
  currency: string;
  pricePerUnit?: number;     // catalog base price (for discount % calc)
  quantity?: number;
  subtotalPrice?: number;
  discountAmount?: number;
  taxAmount?: number;
  basePrice?: number;        // catalog base — used as the "original" baseline for %

  // Session config
  sessionType: string;
  sessionCount: number;

  // Billing type
  billingType: string;
  initialPaymentAmount?: number;
  initialPaymentCurrency?: string;

  providerId?: string;
  status: string;
  paymentStatus?: string;
  sessionsCount: number;    // how many sessions already exist
  sequence?: number;
  visitGroup?: number;

  // Linked-condition IDs (for the editor to pre-populate)
  linkedConditionIds?: string[];

  // Scheduled / planned date (ISO date string)
  scheduledDate?: string;

  // Linked invoice (so we can lock pricing when POSTED/PAID)
  invoiceId?: string | null;
  invoiceStatus?: string | null;        // 'DRAFT' | 'POSTED' | 'VOID'
  invoicePaymentStatus?: string | null; // 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'
  invoiceAmountPaid?: number;
}

export interface EditProcedureSubmitData {
  treatmentProcedureId: string;
  treatmentPlanId: string;
  // Always editable
  notes?:           string;
  providerId?:      string;
  sequence?:        number;
  visitGroup?:      number;
  scheduledDate?:   string;
  // Locked when sessions exist (409 server-side)
  toothNumbers?:    number[];
  // Allowed with audit + warning when sessions exist
  surfaces?:        string[];
  status?:          'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
  // Pricing
  totalPrice?:      number;
  pricePerUnit?:    number;
  quantity?:        number;
  subtotalPrice?:   number;
  discountAmount?:  number;
  taxAmount?:       number;
  currency?:        string;
  exchangeRate?:    number;
  baseAmount?:      number;
  isPriceOverridden?: boolean;
  // Session config (locked once sessions exist)
  sessionType?:     'SINGLE' | 'MULTI';
  sessionCount?:    number;
  // Billing type
  billingType?:      'PAY_FULL' | 'PAY_PARTIALLY';
  // Initial payment
  initialPaymentAmount?:   number;
  initialPaymentCurrency?: string;
  // Conditions
  linkedConditionIds?: string[];
  // Audit reason — ALWAYS required now
  editReason?:       string;
}

interface EditProcedureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: EditProcedureInitialData;
  patientId: string;
  visitId?: string;
  dentistId?: string;
  onSuccess?: () => void;
}

// ─── Surface Picker ───────────────────────────────────────────────────────────

function SurfacePicker({
  value, onChange, disabled,
}: {
  value: UiSurface[];
  onChange: (v: UiSurface[]) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {SURFACE_META.map(s => {
        const on = value.includes(s.key);
        return (
          <button
            key={s.key}
            title={s.label}
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              onChange(on ? value.filter(x => x !== s.key) : [...value, s.key]);
            }}
            style={{
              width: 32, height: 32, borderRadius: 6,
              border: `1px solid ${on ? '#1e293b' : '#d1d5db'}`,
              background: on ? '#1e293b' : disabled ? '#f8fafc' : '#fff',
              color: on ? '#fff' : disabled ? '#cbd5e1' : '#64748b',
              fontSize: 11, fontWeight: 700,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all .12s',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {s.key}
          </button>
        );
      })}
    </div>
  );
}

// ─── Field Row ────────────────────────────────────────────────────────────────

function FieldRow({
  label, locked, lockedReason, children,
}: {
  label: string;
  locked?: boolean;
  lockedReason?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: locked ? '#94a3b8' : '#374151' }}>
          {label}
        </label>
        {locked && (
          <span title={lockedReason} style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 9, color: '#94a3b8', fontWeight: 600,
            background: '#f1f5f9', padding: '1px 6px', borderRadius: 10,
          }}>
            <Lock size={8} /> Locked
          </span>
        )}
      </div>
      {children}
      {locked && lockedReason && (
        <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>{lockedReason}</p>
      )}
    </div>
  );
}

// ─── FieldCell — same look as FieldRow but no bottom margin; used inside grid ─

function FieldCell({
  label, locked, lockedReason, children,
}: {
  label: string;
  locked?: boolean;
  lockedReason?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: locked ? '#94a3b8' : '#374151' }}>
          {label}
        </label>
        {locked && (
          <span title={lockedReason} style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 9, color: '#94a3b8', fontWeight: 600,
            background: '#f1f5f9', padding: '1px 6px', borderRadius: 10,
          }}>
            <Lock size={8} /> Locked
          </span>
        )}
      </div>
      {children}
      {locked && lockedReason && (
        <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>{lockedReason}</p>
      )}
    </div>
  );
}

// ─── Shared input styles ───────────────────────────────────────────────────────

function numberStepperBtnStyle(disabled: boolean | undefined): React.CSSProperties {
  return {
    width: 24, height: 24, borderRadius: 5,
    border: '1px solid #bae6fd', background: '#f0f9ff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: '#0369a1',
    opacity: disabled ? 0.6 : 1,
  };
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export function EditProcedureDialog({
  isOpen,
  onClose,
  initialData,
  patientId,
  visitId,
  dentistId,
  onSuccess,
}: EditProcedureDialogProps) {
  const queryClient = useQueryClient();

  // ── Lock flags derived from initial data ─────────────────────────────────
  const hasSessions = initialData.sessionsCount > 0;
  const tpPaid      = initialData.paymentStatus === 'PAID';
  const tpPartiallyPaid = initialData.paymentStatus === 'PARTIALLY_PAID' ||
                           (initialData.invoiceAmountPaid ?? 0) > 0;
  const isCompleted = initialData.status === 'COMPLETED';
  const isCancelled = initialData.status === 'CANCELLED';
  // Pricing locked if invoice is POSTED (already billed to GL) or has payments
  const invoiceLocked =
    initialData.invoiceStatus === 'POSTED' ||
    initialData.invoiceStatus === 'VOID' ||
    tpPaid ||
    tpPartiallyPaid;
  const sessionConfigLocked = hasSessions;
  const toothLocked = hasSessions;

  // ── Form state ────────────────────────────────────────────────────────────
  // Stored canonical values (MESIAL, LABIAL, BUCCAL, …) collapsed to the six
  // UI codes the picker shows — canonicalToUi covers all 9 enum values, so
  // LABIAL/BUCCAL light up "B" instead of falling back to OCCLUSAL.
  const initialSurfaces = useMemo<UiSurface[]>(
    () => [...new Set(initialData.surfaces.map(s => canonicalToUi(s.toUpperCase())))],
    [initialData.surfaces],
  );

  // Reference tooth for converting UI codes back to canonical on save
  // (same pattern as AddTreatmentDialog / SessionEditDialog).
  const refTooth = initialData.toothNumbers?.[0] ?? 11;

  const [notes,                setNotes]                = useState(initialData.notes ?? '');
  const [surfaces,             setSurfaces]             = useState<UiSurface[]>(initialSurfaces);
  const [providerId,           setProviderId]           = useState(initialData.providerId ?? dentistId ?? '');
  const [scheduledDate,        setScheduledDate]        = useState<string>(
    initialData.scheduledDate ? initialData.scheduledDate.slice(0, 10) : '',
  );
  // Pending status transition — committed only on Save. The backend validates
  // it against the current status; client only shows legal transitions.
  const [pendingStatus,        setPendingStatus]        = useState<string | null>(null);
  const [submitting,           setSubmitting]           = useState(false);
  const [surfaceWarning,       setSurfaceWarning]       = useState(false);
  const [editReason,           setEditReason]           = useState('');
  const [serverError,          setServerError]          = useState<string | null>(null);

  // Allowed status transitions: the server is the source of truth, but we
  // also keep a client-side fallback table so the dropdown works even when
  // the query fails (no crash on offline / 500).
  const ALLOWED_NEXT_STATUSES_FALLBACK: Record<string, string[]> = {
    PLANNED:     ['IN_PROGRESS', 'ON_HOLD'],
    IN_PROGRESS: ['COMPLETED', 'ON_HOLD'],
    ON_HOLD:     ['PLANNED', 'IN_PROGRESS'],
    COMPLETED:   [],
    CANCELLED:   [],
    PENDING:     ['PLANNED'],
    REFERRED:    [],
  };
  const [allowedNextStatuses, setAllowedNextStatuses] = useState<string[]>(
    ALLOWED_NEXT_STATUSES_FALLBACK[initialData.status] ?? [],
  );
  const [statusHelpText,      setStatusHelpText]       = useState<string>('');
  const allowedQuery = useQuery({
    queryKey: ['allowed-status-transitions', initialData.treatmentPlanId, initialData.treatmentProcedureId],
    queryFn: () =>
      treatmentProceduresEditApi.getAllowedStatusTransitions(
        initialData.treatmentPlanId,
        initialData.treatmentProcedureId,
      ),
    enabled: isOpen,
    staleTime: 60 * 1000,
  });
  useEffect(() => {
    if (allowedQuery.data) {
      setAllowedNextStatuses(allowedQuery.data.allowed);
      setStatusHelpText(allowedQuery.data.help ?? '');
    } else if (allowedQuery.error) {
      setAllowedNextStatuses(ALLOWED_NEXT_STATUSES_FALLBACK[initialData.status] ?? []);
    }
  }, [allowedQuery.data, allowedQuery.error, initialData.status]);

  // ── Pricing state — simple "edit price" pattern (mirrors AddTreatmentDialog) ──
  // User edits only the totalPrice. The server recomputes the discount from the
  // existing engine snapshot (pricePerUnit × quantity − tax) − new totalPrice.
  const [priceOverride,       setPriceOverride]       = useState<number | null>(null);
  const [showPriceEdit,       setShowPriceEdit]       = useState(false);

  // ── Session config state (editable when !hasSessions) ─────────────────────
  const [sessionType, setSessionType] = useState<'SINGLE' | 'MULTI'>(
    (initialData.sessionType as 'SINGLE' | 'MULTI') ?? 'SINGLE',
  );
  const [sessionCount, setSessionCount] = useState<number>(initialData.sessionCount ?? 1);

  // ── Billing type + deposit state ─────────────────────────────────────────
  const [billingType,    setBillingType]    = useState<'PAY_FULL' | 'PAY_PARTIALLY'>(
    (initialData.billingType as 'PAY_FULL' | 'PAY_PARTIALLY') ?? 'PAY_FULL',
  );
  const [partialAmount,         setPartialAmount]         = useState<number | null>(initialData.initialPaymentAmount ?? null);
  const [partialAmountCurrency, setPartialAmountCurrency] = useState<Currency>(
    (initialData.initialPaymentCurrency as Currency) ?? 'UGX',
  );

  // ── Linked conditions state (mirrors AddTreatmentDialog) ───────────────
  const [linkedConditionIds, setLinkedConditionIds] = useState<string[]>(
    initialData.linkedConditionIds ?? [],
  );

  // ── Live USD/UGX rate (same pattern as AddTreatmentDialog) ──────────────
  const { data: liveRateData } = useQuery({
    queryKey: ['exchange-rate', 'USD', 'UGX'],
    queryFn: () =>
      api
        .get('/billing/currencies/rate', { params: { from: 'USD', to: 'UGX' } })
        .then((r) => r.data as { rate: number }),
    enabled: isOpen,
    staleTime: 60 * 60 * 1000,
  });
  const exchangeRate =
    typeof liveRateData?.rate === 'number' && liveRateData.rate > 0
      ? liveRateData.rate
      : DEFAULT_EXCHANGE_RATE;

  // ── Patient conditions for tooth-based condition linking (mirrors Add) ──
  const { data: patientConditions = [] } = useQuery({
    queryKey: ['patient-conditions-for-teeth', patientId, initialData.toothNumbers],
    queryFn: () => treatmentPlansApi.getPatientConditionsForTeeth(patientId, initialData.toothNumbers),
    enabled: isOpen && !!patientId && patientId !== 'demo' && initialData.toothNumbers.length > 0,
  });

  // ── Reset on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setNotes(initialData.notes ?? '');
      setSurfaces(initialSurfaces);
      setProviderId(initialData.providerId ?? dentistId ?? '');
      setScheduledDate(initialData.scheduledDate ? initialData.scheduledDate.slice(0, 10) : '');
      setPendingStatus(null);
      setSubmitting(false);
      setSurfaceWarning(false);
      setEditReason('');
      setServerError(null);
      setPriceOverride(null);
      setShowPriceEdit(false);
      setSessionType((initialData.sessionType as 'SINGLE' | 'MULTI') ?? 'SINGLE');
      setSessionCount(initialData.sessionCount ?? 1);
      setBillingType((initialData.billingType as 'PAY_FULL' | 'PAY_PARTIALLY') ?? 'PAY_FULL');
      setPartialAmount(initialData.initialPaymentAmount ?? null);
      setPartialAmountCurrency((initialData.initialPaymentCurrency as Currency) ?? 'UGX');
      setLinkedConditionIds(initialData.linkedConditionIds ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialData.treatmentProcedureId]);

  // ── Pricing math — simple: only the override total matters ───────────────
  // The server stores pricePerUnit / quantity / discountAmount / taxAmount from
  // the existing engine snapshot; user-entered override becomes a discount.
  const finalTotalPrice = priceOverride !== null ? priceOverride : initialData.totalPrice;
  const currency = (initialData.currency as Currency) ?? 'UGX';
  const isUSD = currency === 'USD';

  // ── Deposit conversion (matches AddTreatmentDialog math) ────────────────
  const depositInProcCurrency = useMemo((): number | null => {
    if (partialAmount == null || partialAmount <= 0) return null;
    if (partialAmountCurrency === currency) return partialAmount;
    if (partialAmountCurrency === 'USD' && currency === 'UGX')
      return Math.round(partialAmount * exchangeRate);
    if (partialAmountCurrency === 'UGX' && currency === 'USD')
      return partialAmount / exchangeRate;
    return partialAmount;
  }, [partialAmount, partialAmountCurrency, currency, exchangeRate]);

  const maxDepositInDepositCurrency = useMemo((): number => {
    if (partialAmountCurrency === currency) return finalTotalPrice;
    if (partialAmountCurrency === 'USD' && currency === 'UGX')
      return finalTotalPrice / exchangeRate;
    if (partialAmountCurrency === 'UGX' && currency === 'USD')
      return finalTotalPrice * exchangeRate;
    return finalTotalPrice;
  }, [partialAmountCurrency, currency, finalTotalPrice]);

  const fmtUGX = (n: number) => `UGX ${Math.round(n).toLocaleString()}`;
  const fmtUSD = (n: number) =>
    `USD ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPrice = (n: number) => (isUSD ? fmtUSD(n) : fmtUGX(n));
  const fmtDepositCur = (n: number) => (partialAmountCurrency === 'USD' ? fmtUSD(n) : fmtUGX(n));

  // ── Fetch dentists ──────────────────────────────────────────────────────
  const { data: dentists = [] } = useQuery({
    queryKey: ['dentists'],
    queryFn:  staffApi.getDentists,
    enabled:  isOpen,
    staleTime: 5 * 60 * 1000,
  });

  // ── Helpers: changed-value detection ────────────────────────────────────
  const surfaceChanged =
    JSON.stringify(surfaces.slice().sort()) !==
    JSON.stringify(initialSurfaces.slice().sort());
  const billingTypeChanged = billingType !== initialData.billingType;
  const sessionTypeChanged = sessionType !== initialData.sessionType;
  const sessionCountChanged = sessionCount !== initialData.sessionCount;
  const pricingChanged =
    priceOverride !== null && priceOverride !== initialData.totalPrice;
  const depositChanged =
    partialAmount !== (initialData.initialPaymentAmount ?? null) ||
    partialAmountCurrency !== (initialData.initialPaymentCurrency ?? 'UGX');

  // ── Mutation ────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (payload: EditProcedureSubmitData) => {
      const updatePayload: any = {
        notes:                  payload.notes,
        providerId:             payload.providerId,
        sequence:               payload.sequence,
        visitGroup:             payload.visitGroup,
        scheduledDate:          payload.scheduledDate,
        surfaces:               payload.surfaces,
        toothNumbers:           payload.toothNumbers,
        status:                 payload.status,
        // Pricing — only send when the user actually overrode the total.
        // The server recomputes discount/tax from the existing snapshot.
        totalPrice:             payload.totalPrice,
        currency:               initialData.currency,
        exchangeRate:           isUSD ? exchangeRate : undefined,
        isPriceOverridden:      payload.isPriceOverridden,
        sessionType:            payload.sessionType,
        sessionCount:           payload.sessionCount,
        billingType:            payload.billingType,
        initialPaymentAmount:   payload.initialPaymentAmount,
        initialPaymentCurrency: payload.initialPaymentCurrency,
        linkedConditionIds:     payload.linkedConditionIds,
        editReason:             payload.editReason,
      };
      for (const k of Object.keys(updatePayload)) {
        if (updatePayload[k] === undefined) delete updatePayload[k];
      }
      return treatmentProceduresEditApi.updateProcedure(
        payload.treatmentPlanId,
        payload.treatmentProcedureId,
        updatePayload,
      );
    },
    onSuccess: () => {
      // ── Force-refetch everything that depends on a procedure's state ──
      // `refetchType: 'all'` makes TanStack refetch INACTIVE queries too,
      // so when the user switches back to the dental-chart tab after
      // editing here, the data is already fresh (no need to refresh).
      queryClient.invalidateQueries({ queryKey: ['chart-entries'],            refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['treatment-procedures'],    refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['patient-conditions'],      refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['tx-plan', initialData.treatmentPlanId], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['tx-plans', patientId],     refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['visit', visitId],          refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['visits', patientId],       refetchType: 'all' });
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err.message;
      setServerError(msg);
    },
  });

  // ── Save handler ────────────────────────────────────────────────────────
  const handleSave = async () => {
    setServerError(null);

    // CANCELLED procedures are immutable through this dialog — use the
    // dedicated Restore action to bring them back to PLANNED.
    if (isCancelled) {
      setServerError(
        'This procedure is CANCELLED. Use the "Restore to Planned" action instead.',
      );
      return;
    }

    // COMPLETED: only notes can be changed — enforced client-side so the
    // user gets a friendly message instead of a 400. Backend also enforces.
    if (isCompleted) {
      const nonNotesKeys = Object.keys({
        providerId, scheduledDate, sequence: initialData.sequence,
        visitGroup: initialData.visitGroup, totalPrice: priceOverride,
        sessionType, sessionCount, billingType,
        initialPaymentAmount: partialAmount, surfaces,
      });
      if (nonNotesKeys.length > 0) {
        // Just show the error — all those controls are already hidden in
        // COMPLETED mode below, but we double-check here.
        setServerError('Completed procedures are read-only except for clinical notes.');
        return;
      }
    }

    // Reason is ALWAYS required.
    if (!editReason.trim()) {
      setServerError(
        'Please provide a reason for editing this procedure. The reason is recorded in the clinical audit trail.',
      );
      return;
    }

    // Defence-in-depth client guard for POSTED invoice — backend also rejects.
    if (pricingChanged && invoiceLocked) {
      const why = initialData.invoiceStatus === 'POSTED'
        ? 'invoice is POSTED (already billed to the general ledger)'
        : tpPaid
          ? 'procedure has been paid'
          : 'invoice has payments';
      setServerError(
        `Cannot change pricing — ${why}. Void the invoice or create a credit note to change the price.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const newBillingType = billingTypeChanged ? billingType : undefined;
      const newSessionType  = sessionTypeChanged  ? sessionType  : undefined;
      const newSessionCount = sessionCountChanged ? sessionCount : undefined;

      const depositSent =
        newBillingType === 'PAY_PARTIALLY' || billingType === 'PAY_PARTIALLY'
          ? { amount: partialAmount, currency: partialAmountCurrency }
          : null;

      // Status: send only if user picked a transition. Backend re-validates.
      const newStatus = pendingStatus ?? undefined;

      // Scheduled date: send ISO if it changed.
      const originalDate = initialData.scheduledDate
        ? initialData.scheduledDate.slice(0, 10)
        : '';
      const newScheduledDate =
        scheduledDate && scheduledDate !== originalDate
          ? scheduledDate
          : undefined;

      await updateMutation.mutateAsync({
        treatmentProcedureId:   initialData.treatmentProcedureId,
        treatmentPlanId:        initialData.treatmentPlanId,
        notes:                  notes || undefined,
        // Surfaces: sent only when the set actually changed, converted back
        // to canonical enum values. An unchanged form must not rewrite stored
        // values (e.g. legacy FACIAL silently becoming LABIAL/BUCCAL).
        surfaces:               isCompleted || !surfaceChanged
          ? undefined
          : surfaces.map((s) => uiToCanonical(s, refTooth)),
        providerId:             isCompleted ? undefined : (providerId || undefined),
        scheduledDate:          isCompleted ? undefined : newScheduledDate,
        sequence:               initialData.sequence,
        visitGroup:             initialData.visitGroup,
        // Status transition (null when user didn't change it). The DTO
        // accepts only the four routine values; cast the broader string.
        status:                 isCompleted
          ? undefined
          : (newStatus as
              | 'PLANNED'
              | 'IN_PROGRESS'
              | 'COMPLETED'
              | 'ON_HOLD'
              | undefined),
        // Pricing — single override, server handles the discount math
        totalPrice:             isCompleted ? undefined : (priceOverride ?? undefined),
        isPriceOverridden:      isCompleted
          ? undefined
          : (priceOverride !== null ? true : undefined),
        // Session config
        sessionType:            isCompleted ? undefined : newSessionType,
        sessionCount:           isCompleted ? undefined : newSessionCount,
        // Billing type + deposit
        billingType:             isCompleted ? undefined : newBillingType,
        initialPaymentAmount:   isCompleted ? undefined : (depositSent?.amount ?? undefined),
        initialPaymentCurrency: isCompleted ? undefined : (depositSent?.currency ?? undefined),
        // Audit reason (always required)
        editReason:             editReason.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // ── Shared input style ────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 12,
    border: '1px solid #e5e7eb', borderRadius: 6,
    outline: 'none', background: '#fff', color: '#1e293b',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 840, maxWidth: '98vw', maxHeight: '88vh',
          backgroundColor: '#fff', borderRadius: 12,
          boxShadow: '0 24px 40px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
          color: '#fff', padding: '3px 20px', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Edit Procedure</h2>
              <p style={{ fontSize: 12, color: '#bfdbfe', margin: '3px 0 0' }}>
                {initialData.procedureName}
                {initialData.procedureCode && (
                  <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 10, opacity: 0.8 }}>
                    {initialData.procedureCode}
                  </span>
                )}
              </p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 4 }}>
              <X size={18} />
            </button>
          </div>

        </div>

        {/* ── Edit Mode Banner ── */}
        {hasSessions ? (
          <div style={{
            background: '#fffbeb', borderBottom: '1px solid #fcd34d',
            padding: '9px 18px', display: 'flex', alignItems: 'flex-start', gap: 8,
            flexShrink: 0,
          }}>
            <ShieldAlert size={15} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', margin: 0 }}>
                Restricted Edit Mode
              </p>
              <p style={{ fontSize: 10, color: '#b45309', marginTop: 2 }}>
                This procedure has {initialData.sessionsCount} session{initialData.sessionsCount !== 1 ? 's' : ''}.
                Procedure type and tooth assignment are locked to preserve clinical history.
              </p>
            </div>
          </div>
        ) : (
          <div style={{
            background: '#f0fdf4', borderBottom: '1px solid #bbf7d0',
            padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0,
          }}>
            <Unlock size={13} color="#16a34a" />
            <p style={{ fontSize: 11, fontWeight: 600, color: '#166534', margin: 0 }}>
              Full Edit Mode — No sessions recorded yet. All fields are editable.
            </p>
          </div>
        )}

        {/* ── Surface warning confirmation ── */}
        {surfaceWarning && (
          <div style={{
            background: '#fef2f2', borderBottom: '1px solid #fecaca',
            padding: '10px 8px', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', margin: 0 }}>
                  Surface Change Warning
                </p>
                <p style={{ fontSize: 10, color: '#b91c1c', margin: '3px 0 8px' }}>
                  Changing surfaces on a procedure with existing sessions may affect clinical records.
                  Are you sure you want to continue?
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { setSurfaceWarning(false); handleSave(); }}
                    style={{
                      padding: '5px 14px', fontSize: 11, fontWeight: 600,
                      background: '#dc2626', color: '#fff', border: 'none',
                      borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    Yes, update surfaces
                  </button>
                  <button
                    onClick={() => { setSurfaces(initialSurfaces); setSurfaceWarning(false); }}
                    style={{
                      padding: '5px 14px', fontSize: 11, fontWeight: 600,
                      background: '#fff', color: '#374151',
                      border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    Revert surfaces
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Server error banner (replaces alert()) ── */}
        {serverError && (
          <div style={{
            background: '#fef2f2', borderBottom: '1px solid #fecaca',
            padding: '10px 18px', flexShrink: 0,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <AlertTriangle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11, color: '#991b1b', margin: 0 }}>{serverError}</p>
          </div>
        )}

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 10px' }}>

          {/* ── Row 1: Procedure name · Status · Sessions · Performing Provider ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.9fr 0.5fr 1.5fr',
            gap: 10,
            marginBottom: 14,
            padding: '10px 12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            alignItems: 'flex-start',
          }}>
            <FieldCell label="Procedure">
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {initialData.procedureName}
                {initialData.procedureCode && (
                  <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: 10, color: '#64748b' }}>
                    {initialData.procedureCode}
                  </span>
                )}
              </div>
            </FieldCell>
            <FieldCell
              label="Status"
              lockedReason={allowedNextStatuses.length === 0 ? `Status ${initialData.status} is terminal — no transitions allowed.` : undefined}
            >
              {allowedNextStatuses.length === 0 ? (
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                  {initialData.status}
                  {isCancelled && (
                    <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 6 }}>(use Restore action)</span>
                  )}
                </div>
              ) : (
                <select
                  value={pendingStatus ?? initialData.status}
                  onChange={e => setPendingStatus(e.target.value === initialData.status ? null : e.target.value)}
                  style={{ ...inp, cursor: 'pointer' }}
                  title={statusHelpText || `Current: ${initialData.status}`}
                >
                  <option value={initialData.status}>{initialData.status} (current)</option>
                  {allowedNextStatuses.map(s => (
                    <option key={s} value={s}>→ {s}</option>
                  ))}
                </select>
              )}
            </FieldCell>
            <FieldCell label="Sessions">
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{initialData.sessionsCount}</div>
            </FieldCell>
            <FieldCell label="Performing Provider">
              <div style={{ position: 'relative' }}>
                <Stethoscope size={13} style={{
                  position: 'absolute', left: 9, top: '50%',
                  transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none',
                }} />
                <select
                  value={providerId}
                  onChange={e => setProviderId(e.target.value)}
                  disabled={isCompleted}
                  style={{
                    ...inp,
                    paddingLeft: 28,
                    cursor: isCompleted ? 'not-allowed' : 'pointer',
                    opacity: isCompleted ? 0.6 : 1,
                  }}
                >
                  <option value="">— No provider —</option>
                  {(dentists as any[]).map(d => (
                    <option key={d.id} value={d.id}>
                      Dr. {d.firstName} {d.lastName}{d.specialization ? ` — ${d.specialization}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </FieldCell>
          </div>



          {/* ── Row 2: Tooth Assignment · Surfaces (side by side) ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 14,
          }}>
            <FieldCell
              label="Selected Tooth"
              locked={toothLocked}
              lockedReason="Cannot change tooth assignment after sessions have been recorded."
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 26 }}>
                {initialData.toothNumbers.map(t => (
                  <span key={t} style={{
                    padding: '4px 10px', borderRadius: 6,
                    background: toothLocked ? '#f1f5f9' : '#dbeafe',
                    color: toothLocked ? '#94a3b8' : '#1d4ed8',
                    fontSize: 12, fontWeight: 700,
                    border: `1px solid ${toothLocked ? '#e2e8f0' : '#bfdbfe'}`,
                  }}>
                    #{t}
                  </span>
                ))}
                {initialData.toothNumbers.length === 0 && (
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>No specific tooth</span>
                )}
              </div>
            </FieldCell>
            <FieldCell
              label="Surfaces"
              // Spec: surfaces are LOCKED once sessions have been recorded
              // (procedure is in clinical flow). Cancel + re-plan to change.
              locked={hasSessions}
              lockedReason={
                hasSessions
                  ? 'Surfaces are locked once sessions have been recorded. ' +
                    'Cancel this procedure and re-plan with the new surfaces.'
                  : undefined
              }
            >
              <SurfacePicker
                value={surfaces}
                onChange={setSurfaces}
                disabled={hasSessions}
              />
            </FieldCell>
          </div>

          {/* ── Condition links (mirrors AddTreatmentDialog) ── */}
          {patientConditions.length > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>
                  Link Condition
                  <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 400, color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: 8 }}>Optional</span>
                </label>
                {linkedConditionIds.length > 0 && (
                  <button onClick={() => setLinkedConditionIds([])} style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Clear all</button>
                )}
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', maxHeight: 120, overflowY: 'auto' }}>
                {patientConditions.map((pc: any) => {
                  const isLinked = linkedConditionIds.includes(pc.id);
                  return (
                    <button
                      key={pc.id} type="button"
                      onClick={() => setLinkedConditionIds((prev: string[]) => isLinked ? prev.filter((id: string) => id !== pc.id) : [...prev, pc.id])}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #f3f4f6', background: isLinked ? '#fef2f2' : '#fff', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${isLinked ? '#dc2626' : '#d1d5db'}`, background: isLinked ? '#dc2626' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isLinked && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#1e293b' }}>{pc.condition?.name ?? 'Unknown'}</div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                          {pc.toothNumber && <span style={{ fontSize: 10, background: '#dbeafe', color: '#1d4ed8', padding: '0 5px', borderRadius: 3 }}>Tooth {pc.toothNumber}</span>}
                          {pc.condition?.icd10Code && <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8' }}>{pc.condition.icd10Code}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════════
              CONDENSED: Visit Sessions + Pricing — side by side 2-col
              (mirrors AddTreatmentDialog layout)
          ════════════════════════════════════════════════════════════════════════ */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>

            {/* ── LEFT COLUMN: Sessions (top) + Payment (bottom) ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* ── Card 1: Visit Sessions (Single / Multi) ── */}
              <div style={{ background: 'linear-gradient(135deg,#f0f9ff,#e0f2fe)', borderRadius: 8, border: `1px solid ${sessionConfigLocked ? '#e2e8f0' : '#bae6fd'}`, padding: '12px 12px', opacity: sessionConfigLocked ? 0.7 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: sessionConfigLocked ? '#94a3b8' : '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Sparkles size={13} color="#fff" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: sessionConfigLocked ? '#94a3b8' : '#0369a1', margin: 0 }}>
                      Sessions <span style={{ fontWeight: 400, fontSize: 10, color: '#64748b' }}>(Treatment visits scheduled?)</span>
                    </p>
                  </div>
                  {sessionConfigLocked && <Lock size={12} color="#94a3b8" />}
                </div>

                {sessionConfigLocked ? (
                  <div style={{ fontSize: 11, color: '#94a3b8', padding: '6px 0' }}>
                    {initialData.sessionsCount} session{initialData.sessionsCount !== 1 ? 's' : ''} recorded — type locked.
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { key: 'SINGLE' as const, label: 'Single', Icon: CalendarDays },
                      { key: 'MULTI' as const, label: 'Multi',  Icon: Repeat },
                    ].map((opt) => {
                      const isActive = sessionType === opt.key;
                      return (
                        <button
                          key={opt.key} type="button"
                          onClick={() => setSessionType(opt.key)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '6px 12px', fontSize: 12, fontWeight: 600,
                            borderRadius: 6, border: `1.5px solid ${isActive ? '#0369a1' : '#bae6fd'}`,
                            background: isActive ? '#0369a1' : '#fff',
                            color: isActive ? '#fff' : '#0369a1',
                            cursor: 'pointer',
                          }}
                        >
                          <opt.Icon size={14} color={isActive ? '#fff' : '#0369a1'} />
                          <span>{opt.label}</span>
                          {isActive && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>}
                        </button>
                      );
                    })}
                    {sessionType === 'MULTI' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                        <button type="button" onClick={() => setSessionCount(Math.max(2, sessionCount - 1))} style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid #bae6fd', background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0369a1' }}>
                          <Minus size={12} />
                        </button>
                        <input type="number" min={2} max={20} value={sessionCount} onChange={(e) => setSessionCount(Math.min(20, Math.max(2, parseInt(e.target.value) || 2)))}
                          style={{ width: 42, textAlign: 'center', padding: '3px 4px', fontSize: 13, fontWeight: 700, borderRadius: 5, border: '1.5px solid #0369a1', outline: 'none', color: '#0369a1', background: '#fff' }} />
                        <button type="button" onClick={() => setSessionCount(Math.min(20, sessionCount + 1))} style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid #bae6fd', background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0369a1' }}>
                          <Plus size={12} />
                        </button>
                        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>visits</span>
                      </div>
                    )}
                  </div>
                )}
                {(sessionTypeChanged || sessionCountChanged) && (
                  <p style={{ fontSize: 9, color: '#d97706', marginTop: 4 }}>Session config changed — will be recorded in the audit trail.</p>
                )}
              </div>

              {/* ── Card 2: Payment Type — independent of session count ── */}
              <div style={{ background: 'linear-gradient(135deg,#fff7ed,#fef3c7)', borderRadius: 8, border: `1px solid ${invoiceLocked ? '#e2e8f0' : '#fcd34d'}`, padding: '10px 12px', opacity: invoiceLocked ? 0.7 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Banknote size={13} color="#fff" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: 0 }}>Payment Type</p>
                  </div>
                  {invoiceLocked && <Lock size={12} color="#94a3b8" />}
                </div>

                <div style={{ display: 'flex', gap: 5, marginBottom: billingType === 'PAY_PARTIALLY' ? 8 : 0 }}>
                  {[
                    { key: 'PAY_FULL' as const, label: 'Pay in Full', Icon: Banknote },
                    { key: 'PAY_PARTIALLY' as const, label: 'Pay Partially', Icon: Wallet },
                  ].map((opt) => {
                    const isActive = billingType === opt.key;
                    return (
                      <button
                        key={opt.key} type="button"
                        disabled={invoiceLocked}
                        onClick={() => { setBillingType(opt.key); if (opt.key === 'PAY_PARTIALLY') setPartialAmount(null); }}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 6, border: `1.5px solid ${isActive ? '#d97706' : '#fcd34d'}`, background: isActive ? '#d97706' : '#fff', color: isActive ? '#fff' : '#d97706', cursor: invoiceLocked ? 'not-allowed' : 'pointer', opacity: invoiceLocked ? 0.6 : 1 }}
                      >
                        <opt.Icon size={13} color={isActive ? '#fff' : '#d97706'} />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                {billingType === 'PAY_PARTIALLY' && (
                  <div style={{ background: '#fff', borderRadius: 6, border: '1px solid #fde68a', padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <CreditCard size={12} color="#d97706" />
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Amount To Pay Now</label>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number" min={1} max={maxDepositInDepositCurrency}
                        step={partialAmountCurrency === 'USD' ? 0.01 : 1}
                        value={partialAmount ?? ''}
                        disabled={invoiceLocked}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPartialAmount(val === '' ? null : Math.min(parseFloat(val) || 0, maxDepositInDepositCurrency));
                        }}
                        placeholder={`Max ${fmtDepositCur(maxDepositInDepositCurrency)}`}
                        style={{ width: '100%', padding: '6px 72px 6px 10px', fontSize: 12, fontWeight: 700, borderRadius: 5, border: '1.5px solid #fcd34d', outline: 'none', boxSizing: 'border-box', background: '#fff', color: '#92400e' }}
                      />
                      <div style={{ position: 'absolute', right: 3, top: '50%', transform: 'translateY(-50%)', display: 'flex', borderRadius: 5, overflow: 'hidden', border: '1px solid #fcd34d' }}>
                        {(['UGX', 'USD'] as Currency[]).map((cur) => (
                          <button key={cur} type="button" disabled={invoiceLocked}
                            onClick={() => { setPartialAmountCurrency(cur); setPartialAmount(null); }}
                            style={{ padding: '4px 7px', fontSize: 12, fontWeight: 700, background: partialAmountCurrency === cur ? '#d97706' : '#fff', color: partialAmountCurrency === cur ? '#fff' : '#d97706', border: 'none', borderRight: cur === 'UGX' ? '1px solid #fcd34d' : 'none', cursor: invoiceLocked ? 'not-allowed' : 'pointer', opacity: invoiceLocked ? 0.6 : 1 }}>
                            {cur}
                          </button>
                        ))}
                      </div>
                    </div>
                    {partialAmount != null && partialAmount > 0 && partialAmountCurrency !== currency && depositInProcCurrency != null && (
                      <div style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '3px 8px', marginTop: 4 }}>
                        ≈ <strong>{fmtPrice(depositInProcCurrency)}</strong>{' '}
                        <span style={{ color: '#a16207' }}>(@ {exchangeRate.toLocaleString()} {partialAmountCurrency === 'USD' ? 'UGX/USD' : 'USD/UGX'})</span>
                      </div>
                    )}
                    {depositInProcCurrency != null && depositInProcCurrency > 0 && depositInProcCurrency < finalTotalPrice && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '5px 8px', background: '#fff', borderRadius: 5, border: '1px solid #fde68a' }}>
                        <span style={{ fontSize: 10, color: '#92400e', fontWeight: 600 }}>Balance: <span style={{ color: '#b45309', fontWeight: 700 }}>{fmtPrice(finalTotalPrice - depositInProcCurrency)}</span></span>
                      </div>
                    )}
                    {depositInProcCurrency != null && depositInProcCurrency >= finalTotalPrice && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '5px 8px', background: '#fff', borderRadius: 5, border: '1px solid #86efac' }}>
                        <span style={{ fontSize: 10, color: '#166534', fontWeight: 600 }}>Covers full — consider switching to "Pay in Full"</span>
                      </div>
                    )}
                  </div>
                )}

                {billingTypeChanged && (
                  <p style={{ fontSize: 9, color: '#d97706', marginTop: 4 }}>Billing type changed — will be recorded in the audit trail.</p>
                )}

                {invoiceLocked && (
                  <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>
                    {initialData.invoiceStatus === 'POSTED'
                      ? 'Cannot change billing — invoice is POSTED. Void the invoice first.'
                      : tpPaid ? 'Cannot change billing — procedure has been paid.' : ''}
                  </p>
                )}
              </div>

            </div>

            {/* ── RIGHT HALF: Pricing ── */}
            <div style={{ flex: 1, background: invoiceLocked ? '#f8fafc' : 'linear-gradient(135deg,#f0f9ff,#e0f2fe)', borderRadius: 8, border: `1.5px solid ${invoiceLocked ? '#e2e8f0' : '#bae6fd'}`, padding: '10px 5px', opacity: invoiceLocked ? 0.7 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: invoiceLocked ? '#94a3b8' : '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Receipt size={13} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: invoiceLocked ? '#94a3b8' : '#0369a1', margin: 0 }}>
                    Price Total
                  </p>
                </div>
                {invoiceLocked && <Lock size={12} color="#94a3b8" />}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: 7, padding: '2px 12px', border: '1px solid #e0f2fe', marginBottom: showPriceEdit && !invoiceLocked ? 10 : 0 }}>
                <div>
                  <p style={{ marginRight: '6px', fontSize: 11, fontWeight: 600, color: '#64748b', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {priceOverride !== null ? 'Custom' : 'Original'}:
                  </p>
                  <span style={{ fontSize: 18, fontWeight: 800, color: priceOverride !== null ? '#b45309' : invoiceLocked ? '#94a3b8' : '#0369a1', letterSpacing: '-0.5px' }}>
                    {fmtPrice(finalTotalPrice)}
                  </span>
                  {isUSD && (
                    <span style={{ marginLeft: 5, fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                      ≈ {fmtUGX(finalTotalPrice * exchangeRate)}
                    </span>
                  )}
                </div>
                {!invoiceLocked && (
                  <button
                    type="button"
                    onClick={() => {
                      if (showPriceEdit) { setPriceOverride(null); setShowPriceEdit(false); }
                      else { setPriceOverride(finalTotalPrice); setShowPriceEdit(true); }
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: '1.5px solid #fecaca', background: '#f9d963', color: '#dc2626', fontSize: 13, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {showPriceEdit ? <><RotateCcw size={12} /> Reset</> : <><Pencil size={12} /> Edit</>}
                  </button>
                )}
              </div>

              {showPriceEdit && !invoiceLocked && (
                <div style={{ background: '#fff', borderRadius: 7, border: '1.5px solid #bae6fd', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Tag size={12} color="#0369a1" />
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#0369a1' }}>Custom Price</label>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '1px 6px', borderRadius: 8, marginLeft: 'auto' }}>{currency}</span>
                  </div>
                  <input
                    type="number" min={0} step={currency === 'USD' ? 0.01 : 1000}
                    value={priceOverride ?? ''}
                    onChange={(e) => setPriceOverride(e.target.value === '' ? null : parseFloat(e.target.value))}
                    placeholder="Enter custom amount…" autoFocus
                    style={{ width: '100%', padding: '8px 12px', fontSize: 14, fontWeight: 700, borderRadius: 6, border: '2px solid #7dd3fc', outline: 'none', boxSizing: 'border-box', background: '#fff', color: '#0369a1' }}
                  />
                  {priceOverride !== null && priceOverride !== initialData.totalPrice && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 6, padding: '2px 10px', background: '#f0f9ff', borderRadius: 5, border: '1px solid #e0f2fe' }}>
                      <AlertCircle size={12} color="#0ea5e9" />
                      <p style={{ fontSize: 12, color: '#0369a1', margin: 0, fontWeight: 700 }}>
                        Original: <strong>{fmtPrice(initialData.totalPrice)}</strong>
                        {' '}(<strong>{fmtPrice(priceOverride - initialData.totalPrice)}</strong> difference)
                      </p>
                    </div>
                  )}
                </div>
              )}

              {invoiceLocked && (
                <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>
                  {initialData.invoiceStatus === 'POSTED'
                    ? 'Price locked — invoice is POSTED. Void or create a credit note to change.'
                    : initialData.invoiceStatus === 'VOID'
                      ? 'Price locked — linked invoice is VOIDED.'
                      : tpPaid ? 'Price locked — procedure has been fully paid.' : 'Price locked — invoice has payments.'}
                </p>
              )}
            </div>
          </div>

          {/* ── COMPLETED: notes-only mode banner (above clinical notes) ─────────── */}
          {isCompleted && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fcd34d',
              borderRadius: 8, padding: '10px 14px', marginBottom: 10,
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <ShieldAlert size={14} color="#a16207" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', margin: 0 }}>
                  Read-only — append notes only
                </p>
                <p style={{ fontSize: 10, color: '#b45309', marginTop: 2 }}>
                  This procedure is COMPLETED. Only an append-only clinical note is permitted;
                  all other clinical and billing fields are part of the permanent record.
                </p>
              </div>
            </div>
          )}

          {/* ── Clinical Notes ── */}
          <FieldRow label={isCompleted ? 'Append Clinical Note' : 'Clinical Notes'}>
            {isCompleted && initialData.notes && (
              <div style={{
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 6, padding: '8px 10px', marginBottom: 8,
                fontSize: 11, color: '#475569', whiteSpace: 'pre-wrap',
                maxHeight: 100, overflowY: 'auto',
              }}>
                {initialData.notes}
              </div>
            )}
            <textarea
              rows={isCompleted ? 2 : 3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isCompleted ? 'Append a new clinical note…' : 'Add or update clinical notes...'}
              style={{
                ...inp, resize: 'vertical', fontFamily: 'inherit',
                minHeight: isCompleted ? 48 : 52, lineHeight: 1.4,
              }}
            />
            {isCompleted && (
              <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>
                This note will be appended to the existing clinical record with a timestamp.
              </p>
            )}
          </FieldRow>

          {/* ── CANCELLED: restore banner (only path back is restore) ─────── */}
          {isCancelled && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '12px 14px', marginBottom: 10,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', margin: 0 }}>
                This procedure is CANCELLED.
              </p>
              <p style={{ fontSize: 10, color: '#b91c1c', marginTop: 3, marginBottom: 10 }}>
                Cancellation reason on record: {initialData.notes || 'n/a'}
              </p>
              <button
                onClick={async () => {
                  const reason = window.prompt(
                    'Reason for restoring this procedure back to PLANNED:',
                    'Patient changed mind',
                  );
                  if (!reason || !reason.trim()) return;
                  setSubmitting(true);
                  try {
                    await treatmentProceduresEditApi.restoreProcedure(
                      initialData.treatmentPlanId,
                      initialData.treatmentProcedureId,
                      { reason: reason.trim() },
                    );
                    queryClient.invalidateQueries({ queryKey: ['chart-entries'], refetchType: 'all' });
                    queryClient.invalidateQueries({ queryKey: ['treatment-procedures'], refetchType: 'all' });
                    queryClient.invalidateQueries({ queryKey: ['tx-plans', patientId], refetchType: 'all' });
                    queryClient.invalidateQueries({ queryKey: ['tx-plan', initialData.treatmentPlanId], refetchType: 'all' });
                    onSuccess?.();
                    onClose();
                  } catch (e: any) {
                    setServerError(e?.response?.data?.message || e.message);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
                style={{
                  padding: '8px 16px', fontSize: 11, fontWeight: 700,
                  background: '#0369a1', color: '#fff', border: 'none',
                  borderRadius: 7, cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Restoring…' : 'Restore to Planned'}
              </button>
            </div>
          )}

          {/* ── Reason for Edit — ALWAYS required (hidden for CANCELLED) ─── */}
          {!isCancelled && (
            <FieldRow label="Reason for Edit (required)">
              <textarea
                rows={2}
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
                placeholder='Required — e.g. "Corrected wrong tooth surface noted by Dr. K"'
                style={{
                  ...inp,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  minHeight: 48,
                  lineHeight: 1.4,
                  borderColor: editReason.trim() ? '#e5e7eb' : '#fcd34d',
                  borderWidth: editReason.trim() ? 1 : 2,
                }}
              />
              <p style={{ fontSize: 9, color: '#94a3b8', margin: '4px 0 0' }}>
                Logged in the clinical audit trail alongside the actor and timestamp.
                Required for every edit.
              </p>
            </FieldRow>
          )}

          {/* ── Completed/Cancelled info ── */}
          {(isCompleted || isCancelled) && (
            <div style={{
              background: isCompleted ? '#f0fdf4' : '#fff5f5',
              border: `1px solid ${isCompleted ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: 8, padding: '10px 14px',
            }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: isCompleted ? '#166534' : '#991b1b', margin: 0 }}>
                {isCompleted ? '✔ This procedure is completed.' : '✕ This procedure is cancelled.'}
              </p>
              <p style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                {isCompleted
                  ? 'Only notes and provider can be updated.'
                  : 'A cancelled procedure cannot be edited.'}
              </p>
            </div>
          )}

          {/* ── Audit note ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
            padding: '7px 10px', background: '#f8fafc', borderRadius: 6,
          }}>
            <Info size={11} color="#94a3b8" />
            <p style={{ fontSize: 9, color: '#94a3b8', margin: 0 }}>
              All edits are logged for clinical audit purposes.
            </p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '9px', fontSize: 12, fontWeight: 600,
                background: '#fff', color: '#374151',
                border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={submitting || isCancelled || surfaceWarning || !editReason.trim()}
              style={{
                flex: 2, padding: '9px', fontSize: 12, fontWeight: 700,
                background: submitting || isCancelled || !editReason.trim() ? '#93c5fd' : '#2563eb',
                color: '#fff', border: 'none', borderRadius: 8,
                cursor: submitting || isCancelled || !editReason.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {submitting
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                : isCompleted
                  ? <><CheckCircle size={14} /> Append Note</>
                  : <><CheckCircle size={14} /> Save Changes</>
              }
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
