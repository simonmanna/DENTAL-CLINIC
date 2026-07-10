// src/lib/api/chart-entries.ts
// ─────────────────────────────────────────────────────────────────────────────

import { api } from "./client";

export type ToothSurface =
  | 'MESIAL' | 'DISTAL' | 'OCCLUSAL' | 'INCISAL'
  | 'BUCCAL' | 'LABIAL' | 'FACIAL' | 'LINGUAL' | 'PALATAL';

export type ChartEntryType = 'CONDITION' | 'EXISTING' | 'PLANNED' | 'COMPLETED';
// Mirrors the backend ChartEntryStatus enum. RESOLVED is written when a
// condition's PatientCondition resolves (conditions.service sets both
// conditionStatus and the chart-row status); the ledger's Resolved filter and
// the grey resolved baseline depend on it.
export type ChartEntryStatus = 'ACTIVE' | 'SUPERSEDED' | 'RESOLVED' | 'VOIDED';
export type QuickAction = 'ADD_CONDITION' | 'PLAN_TREATMENT' | 'PERFORM_NOW';

/**
 * Drives the dental chart's special-state rendering. Sourced from
 * `Condition.chartPresenceEffect` in the catalog seed — the chart never
 * hard-codes ICD-10 codes to decide how a tooth should look.
 */
export type ChartPresenceEffect =
  | 'NONE'
  | 'EXTRACTED'
  | 'CONGENITAL'
  | 'UNERUPTED'
  | 'SUPERNUMERARY'
  | 'RETAINED_ROOT';

export interface ChartEntry {
  toothNumbers: number[];
  code?: string;
  date: string;
  provider?: string;
  id: string;
  patientId: string;
  visitId?: string;
  toothNumber?: number;
  surfaces: ToothSurface[];
  type: ChartEntryType;
  status: ChartEntryStatus;
  label: string;
  conditionCode?: string;
  procedureCode?: string;
  treatmentProcedureId?: string;
  procedureSessionId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  providerId?: string;
  treatmentProcedure?: {
    procedure: { name: string; code?: string };
  };
  procedureSession?: {
    id: string;
    sessionNumber: number;
    status: string;
    performedDate?: string;
  };
  visit?: { id: string; visitDate: string };
  patientConditionId?: string;
  conditionId?: string;
  diagnosedAt?: string;
  diagnosedBy?: string;
  severity?: string;
  conditionStatus?: string;
  /**
   * Catalog row attached to the chart entry. The chart uses
   * `condition.chartPresenceEffect` to decide how the tooth slot should
   * render (missing, congenital, unerupted, supernumerary, …).
   */
  condition?: {
    id: string;
    name: string;
    icd10Code?: string;
    snodentCode?: string;
    chartPresenceEffect?: ChartPresenceEffect;
  };
  /** PatientCondition relation — carries the same Condition reference. */
  patientCondition?: {
    id?: string;
    severity?: string;
    status?: string;
    conditionId?: string;
    condition?: {
      id: string;
      name: string;
      icd10Code?: string;
      snodentCode?: string;
      chartPresenceEffect?: ChartPresenceEffect;
    };
  };
  // Treatment procedure fields
  treatmentPlanId?: string;
  procedureStatus?: string;
  totalPrice?: number;
  currency?: string;
  /** M-2 optimistic-lock token. Pass back as expectedVersion on a mutation. */
  version?: number;
}

export interface UpdateConditionPayload {
  label?: string;
  surfaces?: string[];
  notes?: string;
  providerId?: string;
  conditionId?: string;
  patientConditionId?: string;
  status?: 'ACTIVE' | 'MONITORED' | 'RESOLVED' | 'RULED_OUT';
  severity?: 'MILD' | 'MODERATE' | 'SEVERE';
  diagnosedAt?: string;
  /** M-2: optimistic-lock token for the underlying ChartEntry row. */
  expectedVersion?: number;
}


export interface QuickActionPayload {
  patientId: string;
  visitId: string;
  toothNumber: number;
  surfaces?: ToothSurface[];
  action: QuickAction;
  // ADD_CONDITION
  conditionLabel?: string;
  conditionCode?: string;
  diagnosedAt?: string;
  // PLAN_TREATMENT / PERFORM_NOW
  procedureCatalogId?: string;
  procedureLabel?: string;
  procedureCode?: string;
  procedureCost?: number;
  notes?: string;
  // PLAN_TREATMENT — plan name when creating new
  planName?: string;
  // PERFORM_NOW
  performedDate?: string;
  actualInputsUsed?: { inventoryItemId: string; name: string; unit: string; quantityUsed: number; unitCost: number }[];
  sessionCost?: number;
  conditionId?: string;
  providerId?: string;
}

export interface QuickActionResponse {
  chartEntry: ChartEntry;
  treatmentPlan?: { id: string; title: string; wasCreated: boolean };
  treatmentProcedure?: { id: string; procedureName: string };
  procedureSession?: { id: string; sessionNumber: number };
}

export interface AddExistingProcedurePayload {
  type: 'EXISTING';
  toothNumber: number;
  surfaces: string[];
  procedureId: string;
  procedureName: string;
  procedureCode: string;
  notes?: string;
  visitId: string;
  providerId?: string;
  patientId?: string;
}

export interface CreateChartEntryDto {
  patientId: string;
  visitId?: string;
  toothNumber: number;
  surfaces: string[];
  type: string;
  label: string;
  conditionCode?: string;
  procedureCode?: string;
  conditionId?: string;
  patientConditionId?: string;
  notes?: string;
  providerId?: string;
  diagnosedAt?: string;
}

/** Clean query params by removing undefined, null, empty strings, and "undefined" */
function cleanParams(params?: Record<string, string | number | undefined>): Record<string, string | number> | undefined {
  if (!params) return undefined;
  const cleaned = Object.fromEntries(
    Object.entries(params).filter(
      ([_, value]) =>
        value !== undefined &&
        value !== null &&
        value !== "" &&
        value !== "undefined"
    )
  );
  return Object.keys(cleaned).length ? cleaned : undefined;
}

export const chartEntriesApi = {
  /** Get all chart entries for a patient (optionally filtered by visit) */
  getPatientEntries: (patientId: string, visitId?: string) =>
    api
      .get<ChartEntry[]>("/chart-entries", {
        params: cleanParams({ patientId, visitId }),
      })
      .then((r) => r.data),

  /** Get chart history for a specific tooth */
  getToothHistory: (patientId: string, toothNumber: number) =>
    api
      .get<ChartEntry[]>(`/chart-entries/tooth/${patientId}/${toothNumber}`)
      .then((r) => r.data),

  /** Perform a quick action (add condition, plan treatment, or perform now) */
  quickAction: (payload: QuickActionPayload) =>
    api
      .post<QuickActionResponse>("/chart-entries/quick-action", payload)
      .then((r) => r.data),

  /** Update a chart entry (status, notes, or label). M-2: pass expectedVersion
   *  to enforce optimistic locking (409 on a concurrent edit). */
  updateEntry: (
    id: string,
    data: {
      status?: ChartEntryStatus;
      notes?: string;
      label?: string;
      expectedVersion?: number;
    },
  ) =>
    api
      .patch<ChartEntry>(`/chart-entries/${id}`, data)
      .then((r) => r.data),

  /** Supersede a chart entry. M-2: optional expectedVersion for optimistic lock. */
  supersedeEntry: (id: string, expectedVersion?: number) =>
    api
      .patch<ChartEntry>(`/chart-entries/${id}/supersede`, { expectedVersion })
      .then((r) => r.data),

  /**
   * Atomically supersede every ACTIVE chart entry that points at the same
   * PatientCondition. Used by the edit-condition flow so a multi-tooth
   * condition can close all its prior rows in one round-trip.
   */
  supersedeByPatientCondition: (patientConditionId: string) =>
    api
      .patch<{ success: boolean; count: number }>(
        `/chart-entries/supersede-by-condition/${patientConditionId}`,
      )
      .then((r) => r.data),

  addExistingProcedure: (payload: AddExistingProcedurePayload) =>
    api
      .post<ChartEntry>("/chart-entries/existing", payload)
      .then((r) => r.data),

  createChartEntry: (dto: CreateChartEntryDto) =>
    api.post<ChartEntry>("/chart-entries", dto).then(r => r.data),

  updateCondition: async (chartEntryId: string, data: UpdateConditionPayload) => {
    const res = await api.patch(`/chart-entries/${chartEntryId}/condition`, data);
    return res.data;
  },
};


// ── Color system for chart entries ───────────────────────────────────────────
//
// SINGLE SOURCE OF TRUTH for entry colours across the dental UI. Both the
// dental chart (visits/components/DentalChart.tsx → LAYER_COLOR) and the
// ToothActionPanel derive their hues from this map, so they can never disagree
// on what a colour means. Clinical convention (Dentrix / Curve Dental):
//   GREEN  = existing / prior work     RED   = planned treatment
//   BLUE   = completed in this clinic  AMBER = condition / diagnosis
export const ENTRY_COLORS: Record<ChartEntryType, {
  fill: string; stroke: string; light: string; text: string;
  dotClass: string; label: string;
}> = {
  CONDITION: {
    fill: '#f59e0b', stroke: '#92400e', light: '#fef3c7', text: '#78350f',
    dotClass: 'bg-amber-400', label: 'Condition',
  },
  EXISTING: {
    fill: '#16a34a', stroke: '#14532d', light: '#dcfce7', text: '#14532d',
    dotClass: 'bg-green-500', label: 'Existing Work',
  },
  PLANNED: {
    fill: '#dc2626', stroke: '#991b1b', light: '#fee2e2', text: '#7f1d1d',
    dotClass: 'bg-red-500', label: 'Planned',
  },
  COMPLETED: {
    fill: '#2563eb', stroke: '#1e3a8a', light: '#dbeafe', text: '#1e3a8a',
    dotClass: 'bg-blue-500', label: 'Completed Here',
  },
};