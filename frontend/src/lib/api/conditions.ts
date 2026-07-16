import { v4 as uuidv4 } from "uuid";
import { api } from "./client";

// ── I1: idempotency key helper ───────────────────────────────────────
// Generates a per-attempt Idempotency-Key for the Idempotency-Key header.
// Generated on every submit (NOT on every render) so a double-click within
// the same submit cycle sends the SAME key on both calls — the second is
// recognized as a replay by the server and returns the original response.
// Re-generating on every render is correct: if the user opens the dialog
// again later and re-submits, that's a fresh attempt, not a retry.
export function newIdempotencyKey(): string {
  return uuidv4();
}

export type ConditionCategory =
  | "CARIES" | "PERIODONTAL" | "PULPAL" | "PERIAPICAL"
  | "FRACTURE" | "EROSION_ATTRITION" | "DEVELOPMENTAL"
  | "NEOPLASTIC" | "TRAUMATIC" | "RESTORATIVE" | "OTHER";

export type PatientConditionStatus =
  | "ACTIVE" | "MONITORED" | "IN_TREATMENT" | "RESOLVED" | "RULED_OUT";

export interface Condition {
  id: string;
  name: string;
  description?: string;
  snodentCode?: string;
  snomedCtCode?: string;
  icd10Code?: string;
  icd10Term?: string;
  codingSystem: string;
  category: ConditionCategory;
  affectedArea?: string;
  isToothSpecific: boolean;
  requiresSurface: boolean;
  defaultSeverity?: string;
  isActive: boolean;
  isSystem: boolean;
  isFavourite: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConditionDto {
  name: string;
  description?: string;
  snodentCode?: string;
  snomedCtCode?: string;
  icd10Code?: string;
  icd10Term?: string;
  codingSystem?: string;
  category: ConditionCategory;
  affectedArea?: string;
  isToothSpecific?: boolean;
  requiresSurface?: boolean;
  defaultSeverity?: string;
  isFavourite?: boolean;
}

export interface PatientCondition {
  id: string;
  patientId: string;
  visitId?: string;
  conditionId: string;
  condition: Condition;
  toothNumber?: number;
  surfaces: string[];
  severity?: string;
  status: PatientConditionStatus;
  notes?: string;
  diagnosedAt: string;
  diagnosedBy?: string;
  createdAt: string;
  updatedAt: string;
  providerId?: string;
  resolvedAt?: string;
  resolvedByProcedureId?: string;
  /** OL-1: optimistic-lock token. Pass back on every edit. */
  version?: number;
}

export interface CreatePatientConditionDto {
  patientId:   string;
  visitId?:    string;
  conditionId: string;
  toothNumber?: number;
  surfaces?:   string[];
  severity?:   string;
  notes?:      string;
  status?:     PatientConditionStatus;
  diagnosedAt?: string;
  diagnosedBy?: string;    // free-text fallback (kept for compat)
  providerId?:  string;    // ← NEW: Staff FK — the dropdown selection
}

export interface UpdatePatientConditionDto {
  conditionId?: string;
  toothNumber?: number;
  surfaces?:    string[];
  severity?:    string;
  notes?:       string;
  status?:      PatientConditionStatus;
  diagnosedAt?: Date | string;
  diagnosedBy?: string;    // free-text fallback
  providerId?:  string;    // Staff FK

  /**
   * Required by the service when the edit changes a substantive clinical
   * field (conditionId / tooth / surfaces / severity / provider /
   * diagnosedAt / notes). Pure status flips don't need it.
   * Logged in the audit trail and copied to `lastEditReason`.
   */
  editReason?:  string;

  /**
   * OL-1: optimistic-lock token. Pass the `version` that was returned by
   * the prior GET (PC.version). The server does an atomic check + bump;
   * on mismatch it returns 409 with `currentVersion` so the caller can
   * re-fetch, re-merge, and re-submit. Omitting the field preserves the
   * legacy "last-write-wins" behaviour — NOT recommended for clinical edits.
   */
  expectedVersion?: number;
}

export interface DeletePatientConditionDto {
  /** REQUIRED — clinical audit trail. */
  reason: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  module: string;
  entityType: string | null;
  recordId: string | null;
  reason: string | null;
  oldData: unknown;
  newData: unknown;
  userId: string | null;
  userName: string | null;
  createdAt: string;
}


// export interface CreatePatientConditionDto {
//   patientId: string;
//   visitId?: string;
//   conditionId: string;
//   toothNumber?: number;
//   surfaces?: string[];
//   severity?: string;
//   notes?: string;
//   diagnosedBy?: string;
// }

export const conditionsApi = {
  // ── Catalog CRUD ──────────────────────────────────────────────────────
  list: (params?: { isActive?: boolean; isFavourite?: boolean; category?: string; search?: string }) =>
    api.get<Condition[]>("/conditions", { params }).then(r => r.data),

  get: (id: string) =>
    api.get<Condition>(`/conditions/${id}`).then(r => r.data),

  create: (dto: CreateConditionDto) =>
    api.post<Condition>("/conditions", dto).then(r => r.data),

  update: (id: string, dto: Partial<CreateConditionDto>) =>
    api.patch<Condition>(`/conditions/${id}`, dto).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/conditions/${id}`).then(r => r.data),

  toggleFavourite: (id: string) =>
    api.patch<Condition>(`/conditions/${id}/favourite`).then(r => r.data),

  // ── Patient conditions ────────────────────────────────────────────────
  // I1: each write endpoint accepts an optional idempotencyKey. Pass a
  // freshly generated UUID per submit (see newIdempotencyKey()) so a
  // double-click within the same submit cycle sends the same key twice
  // and the server replays the original response — no duplicate row.
  createPatientCondition: (
    dto: CreatePatientConditionDto,
    idempotencyKey?: string,
  ) =>
    api
      .post<PatientCondition>("/conditions/patient", dto, {
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
      })
      .then((r) => r.data),

  getPatientConditions: (patientId: string, visitId?: string) =>
    api.get<PatientCondition[]>("/conditions/patient", {
      params: { patientId, visitId },
    }).then(r => r.data),

  updatePatientCondition: (
    id: string,
    dto: Partial<CreatePatientConditionDto> & {
      status?: PatientConditionStatus;
      editReason?: string;
    },
    idempotencyKey?: string,
  ) =>
    api
      .patch<PatientCondition>(`/conditions/patient/${id}`, dto, {
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
      })
      .then((r) => r.data),

  // Soft delete — backend requires a non-empty `reason`.
  deletePatientCondition: (id: string, payload: DeletePatientConditionDto) =>
    api
      .delete<{ success: boolean }>(`/conditions/patient/${id}`, { data: payload })
      .then(r => r.data),

  restorePatientCondition: (id: string) =>
    api.post<PatientCondition>(`/conditions/patient/${id}/restore`).then(r => r.data),

  resolvePatientCondition: (id: string) =>
    api.patch<PatientCondition>(`/conditions/patient/${id}/resolve`).then(r => r.data),

  // ── Batch endpoints ──────────────────────────────────────────────────
  // Single network call wrapped in a $transaction on the server. Either
  // every (PatientCondition + ChartEntry) for the supplied teeth lands or
  // nothing does — replaces the per-tooth loop that would leak partial
  // state on a mid-loop failure.
  // I1: see createPatientCondition — pass idempotencyKey to dedupe double-clicks.
  createPatientConditionsBatch: (
    body: {
      entries: CreatePatientConditionDto[];
      chartEntries?: Array<{
        toothNumber: number;
        surfaces: string[];
        label: string;
        conditionCode?: string;
        conditionId?: string;
        notes?: string;
        providerId?: string;
        patientId: string;
        visitId?: string;
      }>;
    },
    idempotencyKey?: string,
  ) =>
    api
      .post<{ patientConditions: PatientCondition[]; chartEntries: any[] }>(
        "/conditions/patient/batch",
        body,
        {
          headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
        },
      )
      .then((r) => r.data),

  // Atomic update of a PatientCondition + supersede-and-rewrite of every
  // ChartEntry it points at. Fixes the multi-tooth "leak 5 stale rows"
  // bug in the edit path.
  // I1: see createPatientCondition — pass idempotencyKey to dedupe double-clicks.
  updatePatientConditionWithChartEntries: (
    body: {
      patientConditionId: string;
      update: UpdatePatientConditionDto;
      chartEntries: Array<{
        toothNumber: number;
        surfaces: string[];
        label: string;
        conditionCode?: string;
        conditionId?: string;
        notes?: string;
        providerId?: string;
        patientId: string;
        visitId?: string;
      }>;
    },
    idempotencyKey?: string,
  ) =>
    api
      .patch<{
        patientCondition: PatientCondition;
        chartEntriesSuperseded: number;
        chartEntries: any[];
      }>("/conditions/patient/batch", body, {
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
      })
      .then((r) => r.data),

  getPatientConditionAuditLog: (id: string) =>
    api.get<AuditLogEntry[]>(`/conditions/patient/${id}/audit-log`).then(r => r.data),

  // ── Report ───────────────────────────────────────────────────────────
  getReport: (params: ConditionsReportQuery) =>
    api.get<PatientConditionsReport>("/conditions/report", { params }).then(r => r.data),
};

export interface ConditionsReportQuery {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  category?: string;
  severity?: string;
  dentistId?: string;
  search?: string;
}

export interface PatientConditionRow {
  id: string;
  patientId: string;
  patientCode: string;
  patientName: string;
  patientPhone?: string;
  conditionId: string;
  conditionName: string;
  icd10Code?: string;
  conditionCategory: string;
  toothNumber?: number;
  surfaces: string[];
  severity?: string;
  status: string;
  diagnosedAt: string;
  resolvedAt?: string;
  providerId?: string;
  providerName?: string;
  visitCode?: string;
  notes?: string;
}

export interface PatientConditionsReport {
  data: PatientConditionRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  summary: { total: number; byStatus: Record<string, number>; byCategory: Record<string, number> };
}