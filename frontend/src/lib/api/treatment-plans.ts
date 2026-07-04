import { api } from "./client";
import type {
  TreatmentPlan,
  TreatmentProcedure,
  ProcedureCatalogItem,
  TxStatus,
  AddProcedurePayload,
} from "../../types/treatment-plans";

import type {
  ToothSurface,
  SessionType,
  BillingType,
} from '@/types/dental';


// ─── Request/Response Payload Types ────────────────────────────────────────
export interface CreateTreatmentPlanPayload {
  patientId: string;
  title: string;
  dentistId?: string;
  planCode?: string;
  priority?: string;
  diagnosis?: string;
}

export interface UpdateTreatmentPlanPayload {
  title?: string;
  status?: TxStatus;
  priority?: string;
  diagnosis?: string;
  consentSigned?: boolean;
  consentDate?: string;
}

export interface ReorderProcedurePayload {
  id: string;
  sequence: number;
  visitGroup: number;
}

export interface CreateSessionPayload {
  sessionLabel?: string;
  status: "PENDING" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  visitGroup: number;
  sessionPrice?: number;
  visitId?: string;
  surfaces?: ToothSurface[];
}

export interface ExecuteSessionPayload {
  // Clinical
  performedDate: string;
  performedNotes?: string;
  surfaces?: string[];
  actualInputsUsed?: Array<{
    inventoryItemId: string;
    name: string;
    unit: string;
    quantityUsed: number;
    unitCost: number;
  }>;
 
  // Identity
  dentistId: string;        // Required — controller throws 400 if missing
  providerId?: string;      // Who performed; falls back to dentistId in service
  visitId: string;
 
  // Billing — sessionPrice is in the procedure's original currency.
  // The backend converts to UGX using the procedure's stored exchangeRate.
  sessionPrice?: number;
 
  // Clinical outcome
  outcome?: "PARTIAL" | "COMPLETED";
  isFinal?: boolean;
  phase?: string;
 
  // Per-tooth breakdown
  toothStatuses?: Array<{
    toothNumber: number;
    chartEntryId?: string;
    surfaces?: string[];
    status: string;       // normalised to UPPER_SNAKE in service
    notes?: string;
    performedDate?: string;
  }>;
 
  // Imaging
  imagingLinks?: Array<{
    imagingRecordId: string;
    stage?: string;
  }>;
  imagingGroupId?: string;
 
  // Legacy / backward compat
  markProcedureComplete?: boolean;
  status?: string;
  autoAddToLedger?: boolean;
}

export interface UpdateSessionPayload {
  sessionLabel?: string;
  status?: TxStatus | "PENDING" | "SKIPPED";
  performedDate?: string | null;
  performedNotes?: string | null;
  sessionCost?: number;
  actualInputsUsed?: Array<{
    inventoryItemId: string;
    name: string;
    unit: string;
    quantityUsed: number;
    unitCost: number;
  }>;
  surfaces?: ToothSurface[];
}

// ─── Report API Types (for TreatmentReports.tsx) ───────────────────────────
export interface ReportFilters {
  search?: string;
  startDate?: string;
  endDate?: string;
  dentistId?: string;
  patientId?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SummaryData {
  total?: number;
  totalCost?: number;
  totalAmountPaid?: number;
  totalOutstanding?: number;
  totalCompleted?: number;
  totalInProgress?: number;
  totalPlanned?: number;
  totalPending?: number;
  totalFinal?: number;
  totalBilled?: number;
  totalRevenue?: number;
  totalCollected?: number;
  totalCancelled?: number;
  avgCompletionPct?: number;
  [key: string]: number | string | undefined;
}

export interface ReportResponse<T> {
  data: T[];
  pagination: PaginationInfo;
  summary: SummaryData;
}

// ─── API Methods (consistent async/await style) ────────────────────────────
export const treatmentPlansApi = {
  // ── Plans ───────────────────────────────────────────────────────────────
  getPatientPlans: async (patientId: string): Promise<TreatmentPlan[]> => {
    const res = await api.get<TreatmentPlan[]>(`/treatment-plans/patient/${patientId}`);
    return res.data;
  },

  getPlan: async (planId: string): Promise<TreatmentPlan> => {
    const res = await api.get<TreatmentPlan>(`/treatment-plans/${planId}`);
    return res.data;
  },

  createPlan: async (payload: CreateTreatmentPlanPayload): Promise<TreatmentPlan> => {
    const res = await api.post<TreatmentPlan>('/treatment-plans', payload);
    return res.data;
  },

  updatePlan: async (id: string, data: UpdateTreatmentPlanPayload): Promise<TreatmentPlan> => {
    const res = await api.patch<TreatmentPlan>(`/treatment-plans/${id}`, data);
    return res.data;
  },

  deletePlan: async (id: string): Promise<{ success: boolean }> => {
    const res = await api.delete<{ success: boolean }>(`/treatment-plans/${id}`);
    return res.data;
  },

  // ── Procedures ──────────────────────────────────────────────────────────
  addProcedure: async (
    planId: string,
    payload: AddProcedurePayload,
    idempotencyKey?: string,
  ): Promise<TreatmentProcedure> => {
    const res = await api.post<TreatmentProcedure>(
      `/treatment-plans/${planId}/procedures`,
      payload,
      idempotencyKey
        ? { headers: { 'Idempotency-Key': idempotencyKey } }
        : undefined,
    );
    return res.data;
  },

  removeProcedure: async (planId: string, procedureId: string): Promise<{ message: string }> => {
    const res = await api.delete<{ message: string }>(`/treatment-plans/${planId}/procedures/${procedureId}`);
    return res.data;
  },

  reorderProcedures: async (
    planId: string,
    procedures: ReorderProcedurePayload[]
  ): Promise<{ message: string }> => {
    const res = await api.patch<{ message: string }>(
      `/treatment-plans/${planId}/procedures/reorder`,
      { procedures }
    );
    return res.data;
  },

  // ── Catalog ─────────────────────────────────────────────────────────────
  searchCatalog: async (query: string): Promise<ProcedureCatalogItem[]> => {
    const res = await api.get<ProcedureCatalogItem[]>(
      `/treatment-plans/catalog/search?q=${encodeURIComponent(query)}`
    );
    return res.data;
  },

  getCategories: async (): Promise<string[]> => {
    const res = await api.get<string[]>("/treatment-plans/catalog/categories");
    return res.data;
  },

  // ── Sessions ────────────────────────────────────────────────────────────
  createSession: async (
    planId: string,
    procedureId: string,
    data: CreateSessionPayload
  ): Promise<any> => {
    const res = await api.post(
      `/treatment-plans/${planId}/procedures/${procedureId}/sessions`,
      data
    );
    return res.data;
  },

  executeSession: async (
    planId: string,
    procedureId: string,
    sessionId: string,
    data: ExecuteSessionPayload
  ): Promise<any> => {
    const res = await api.post(
      `/treatment-plans/${planId}/procedures/${procedureId}/sessions/${sessionId}/execute`,
      data
    );
    return res.data;
  },

  // Atomic create-and-execute: the backend creates the PENDING session inside
  // the execution transaction, so a failed execute can't leave an orphan
  // PENDING session behind (and retries don't accumulate empty sessions).
  createAndExecuteSession: async (
    planId: string,
    procedureId: string,
    data: ExecuteSessionPayload & {
      sessionLabel?: string;
      visitGroup?: number;
    }
  ): Promise<any> => {
    const res = await api.post(
      `/treatment-plans/${planId}/procedures/${procedureId}/sessions/execute`,
      data
    );
    return res.data;
  },

  updateSession: async (
    planId: string,
    procedureId: string,
    sessionId: string,
    data: UpdateSessionPayload
  ): Promise<any> => {
    const res = await api.patch(
      `/treatment-plans/${planId}/procedures/${procedureId}/sessions/${sessionId}`,
      data
    );
    return res.data;
  },

  editSession: async (
    planId: string,
    procedureId: string,
    sessionId: string,
    data: {
      // ── existing audited edit fields ───────────────────────────────────
      surfaces?: string[];
      notes?: string;
      phase?: string;
      reason?: string;
      editedById?: string;
      // ── newly editable execution fields ────────────────────────────────
      performedDate?: string;
      providerId?: string;
      outcome?: 'PARTIAL' | 'COMPLETED';
      isFinal?: boolean;
      toothStatuses?: Array<{
        toothNumber: number;
        surfaces?: string[];
        status: string;
        notes?: string;
      }>;
    }
  ): Promise<any> => {
    const res = await api.patch(
      `/treatment-plans/${planId}/procedures/${procedureId}/sessions/${sessionId}/edit`,
      data
    );
    return res.data;
  },

  // Soft-deletes the session and reverses every side effect that was
  // created at execution time. Backend route is `DELETE /sessions/:id`.
  deleteSession: async (
    planId: string,
    procedureId: string,
    sessionId: string,
    data: { reason: string; deletedById?: string }
  ): Promise<any> => {
    const res = await api.delete(
      `/treatment-plans/${planId}/procedures/${procedureId}/sessions/${sessionId}`,
      { data }
    );
    return res.data;
  },

  // Backwards-compatible alias. Same semantics as `deleteSession` — kept so
  // any existing call sites that still call `voidSession(...)` keep working.
  voidSession: async (
    planId: string,
    procedureId: string,
    sessionId: string,
    data: { reason: string; voidedById?: string }
  ): Promise<any> => {
    const res = await api.delete(
      `/treatment-plans/${planId}/procedures/${procedureId}/sessions/${sessionId}`,
      { data: { reason: data.reason, deletedById: data.voidedById } }
    );
    return res.data;
  },

  getSessionEditHistory: async (
    planId: string,
    procedureId: string,
    sessionId: string
  ): Promise<any> => {
    const res = await api.get(
      `/treatment-plans/${planId}/procedures/${procedureId}/sessions/${sessionId}/edits`
    );
    return res.data;
  },

  // ── Conditions ──────────────────────────────────────────────────────────
  getPatientConditionsForTeeth: async (
    patientId: string,
    toothNumbers?: number[]
  ): Promise<any[]> => {
    const params = toothNumbers?.length ? `?teeth=${toothNumbers.join(',')}` : '';
    const res = await api.get(`/treatment-plans/patient/${patientId}/conditions${params}`);
    return res.data;
  },

  updateProcedureConditionLinks: async (
    planId: string,
    procedureId: string,
    linkedConditionIds: string[]
  ): Promise<any> => {
    const res = await api.patch(
      `/treatment-plans/${planId}/procedures/${procedureId}/conditions`,
      { linkedConditionIds }
    );
    return res.data;
  },

  // ── Visits & Sessions ───────────────────────────────────────────────────
  getSessionsByVisit: async (visitId: string): Promise<any[]> => {
    const res = await api.get(`/treatment-plans/visit/${visitId}/sessions`);
    return res.data;
  },

  getPatientVisits: async (patientId: string): Promise<any[]> => {
    const res = await api.get(`/treatment-plans/patient/${patientId}/patient-visits`);
    return res.data;
  },

  getPatientExecutedSessions: async (patientId: string): Promise<any[]> => {
    const res = await api.get(`/treatment-plans/patient/${patientId}/sessions`);
    return res.data;
  },

  // ─── 🆕 REPORT ENDPOINTS (for TreatmentReports.tsx) ─────────────────────
  getTreatmentPlansReport: async (filters: ReportFilters): Promise<ReportResponse<any>> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
    const res = await api.get<ReportResponse<any>>(`/treatment-plans/reports/plans?${params}`);
    return res.data;
  },

  getProceduresReport: async (filters: ReportFilters): Promise<ReportResponse<any>> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
    const res = await api.get<ReportResponse<any>>(`/treatment-plans/reports/procedures?${params}`);
    return res.data;
  },

  getSessionsReport: async (filters: ReportFilters): Promise<ReportResponse<any>> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
    const res = await api.get<ReportResponse<any>>(`/treatment-plans/reports/sessions?${params}`);
    return res.data;
  },
};