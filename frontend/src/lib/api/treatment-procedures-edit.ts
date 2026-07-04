// src/lib/api/treatment-procedures-edit.ts
// API client for Edit & Delete procedure operations.
// Extends the existing treatmentProceduresApi.

import { api } from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcedureDeleteEligibility {
  canDelete:      boolean;
  canCancel:      boolean;
  reason?:        string;
  sessionsCount:  number;
  paymentStatus:  string;
  status:         string;
  // Surfaced by the backend so the UI can show context (status + invoice
  // gate) inside the delete-confirmation dialog.
  invoiceStatus?:     string | null;   // DRAFT | POSTED | VOID | null (no invoice)
  invoiceAmountPaid?: number;
}

export interface UpdateProcedurePayload {
  /** Always editable — clinical notes / assignment */
  notes?:           string;
  providerId?:      string;
  sequence?:        number;
  visitGroup?:      number;
  scheduledDate?:   string;

  /** Editable only when NO sessions exist. Rejected (409) otherwise. */
  toothNumbers?:    number[];

  /** Surfaces — allowed even with sessions; triggers audit + UI warning. */
  surfaces?:        string[];    // API format: MESIAL, OCCLUSAL, etc.

  /**
   * Routine status flip. Does NOT require editReason.
   * CANCELLED and REFERRED are accepted here for type-safety with the UI,
   * but the server DTO will reject them (use POST /cancel for CANCELLED).
   */
  status?:        'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED' | 'REFERRED';

  /** Performed-at audit fields (always editable, when sessions allow). */
  performedDate?:    string;
  completedAt?:      string;
  performedNotes?:   string;
  actualInputsUsed?: Record<string, any>;

  /** ── Pricing (mirrors AddTreatmentProcedureDto) ──────────────────────── */
  /** Final price the patient pays. Syncs the linked InvoiceItem. */
  totalPrice?:        number;
  pricePerUnit?:      number;
  quantity?:          number;
  subtotalPrice?:     number;
  discountAmount?:    number;
  taxAmount?:         number;
  subtotalCost?:      number;
  costPerUnit?:       number;
  currency?:          string;
  exchangeRate?:      number;
  baseAmount?:        number;
  isPriceOverridden?: boolean;
  quantityBasis?:     number;

  /** ── Session config ──────────────────────────────────────────────────── */
  sessionType?:     'SINGLE' | 'MULTI';
  sessionCount?:    number;

  /** ── Billing type (mirrors AddTreatmentProcedureDto) ──────────────────── */
  billingType?:      'PAY_FULL' | 'PAY_PARTIALLY';

  /** ── Initial payment (deposit) ────────────────────────────────────────── */
  initialPaymentAmount?:   number;
  initialPaymentCurrency?: string;

  /** ── Condition links — replace-all semantics ─────────────────────────── */
  linkedConditionIds?: string[];

  /**
   * Free-text justification for the edit. REQUIRED by the backend whenever
   * a substantive clinical field is edited on a procedure that already has
   * executed sessions. Recorded in the audit trail and copied to
   * `lastEditReason` on the procedure.
   */
  editReason?:     string;
}

export interface UpdateProcedureResult {
  data:     any;
  audited:  boolean;
  warning?: string;   // Present when surfaces changed with sessions existing
  invoiceSync?: { invoiceId: string | null; invoiceStatus: string | null } | null;
}

export interface CancelProcedurePayload {
  /** REQUIRED — clinical audit trail. */
  reason: string;
}

export interface DeleteProcedurePayload {
  /** Optional — short note recorded in the audit log. */
  reason?: string;
}

export interface UpdateProcedureResult {
  data:     any;
  audited:  boolean;
  warning?: string;   // Present when surfaces changed with sessions existing
}

export interface CancelProcedureResult {
  data:               any;
  sessionsPreserved:  number;
  message:            string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const treatmentProceduresEditApi = {

  // ── 1. Check delete eligibility ───────────────────────────────────────────
  //    Call before rendering Delete vs Cancel button.
  checkDeleteEligibility: async (
    planId: string,
    procedureId: string,
  ): Promise<ProcedureDeleteEligibility> => {
    const res = await api.get(
      `/treatment-plans/${planId}/procedures/${procedureId}/delete-eligibility`,
    );
    return res.data;
  },

  // ── 2. Edit procedure ─────────────────────────────────────────────────────
  //    Server enforces field locking — UI locking is UX-only.
  updateProcedure: async (
    planId: string,
    procedureId: string,
    payload: UpdateProcedurePayload,
  ): Promise<UpdateProcedureResult> => {
    const res = await api.patch(
      `/treatment-plans/${planId}/procedures/${procedureId}/edit`,
      payload,
    );
    return res.data;
  },

  // ── 3. Cancel procedure ───────────────────────────────────────────────────
  //    Always safe — preserves sessions and clinical history.
  cancelProcedure: async (
    planId: string,
    procedureId: string,
    payload?: CancelProcedurePayload,
  ): Promise<CancelProcedureResult> => {
    const res = await api.post(
      `/treatment-plans/${planId}/procedures/${procedureId}/cancel`,
      payload ?? {},
    );
    return res.data;
  },

  // ── 4. Hard delete ────────────────────────────────────────────────────────
  //    Only succeeds when sessionsCount === 0 and not PAID.
  //    Server returns 409 Conflict otherwise — catch and show Cancel flow.
  //    `reason` (optional) is captured in the audit log.
  deleteProcedure: async (
    planId: string,
    procedureId: string,
    payload?: DeleteProcedurePayload,
  ): Promise<{ success: boolean; deleted: string }> => {
    const res = await api.delete(
      `/treatment-plans/${planId}/procedures/${procedureId}`,
      { data: payload ?? {} },
    );
    return res.data;
  },

  // ── 5. Allowed status transitions (for the dropdown) ─────────────────
  //    Returns only the transitions legal from the current status.
  //    Spec:
  //      PLANNED     → IN_PROGRESS, ON_HOLD
  //      IN_PROGRESS → COMPLETED, ON_HOLD
  //      ON_HOLD     → PLANNED, IN_PROGRESS
  //      COMPLETED, CANCELLED → (terminal — read-only)
  getAllowedStatusTransitions: async (
    planId: string,
    procedureId: string,
  ): Promise<{ current: string; allowed: string[]; help: string }> => {
    const res = await api.get(
      `/treatment-plans/${planId}/procedures/${procedureId}/allowed-status-transitions`,
    );
    return res.data;
  },

  // ── 6. Restore a CANCELLED procedure back to PLANNED ───────────────
  //    Flips chart entries from SUPERSEDED → ACTIVE, clears cancellationReason,
  //    writes a RESTORE audit row. Requires a reason.
  restoreProcedure: async (
    planId: string,
    procedureId: string,
    payload: { reason: string },
  ): Promise<{ data: any; chartEntriesRestored: number; message: string }> => {
    const res = await api.post(
      `/treatment-plans/${planId}/procedures/${procedureId}/restore`,
      payload,
    );
    return res.data;
  },
};