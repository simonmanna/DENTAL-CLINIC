// src/pages/visits/api/progressApi.ts
import { api } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────
export type ComplaintStatus = "IMPROVED" | "SAME" | "WORSE";
export type Outcome = "GOOD" | "FAIR" | "POOR";

export interface ProgressReport {
  id: string;
  reportCode: string;
  visitId: string;
  patientId: string;
  complaint?: string;
  complaintStatus?: ComplaintStatus;
  treatmentStatus?: string;
  outcome?: Outcome;
  toothNumber?: number;
  procedureName?: string;
  findings?: string;
  notes?: string;
  nextPlan?: string;
  createdAt: string;
  updatedAt: string;
  dentist?: { id: string; firstName: string; lastName: string };
}

export interface ProgressReportFormData {
  complaint?: string;
  complaintStatus?: ComplaintStatus;
  treatmentStatus?: string;
  outcome?: Outcome;
  toothNumber?: number;
  procedureName?: string;
  findings?: string;
  notes?: string;
  nextPlan?: string;
  
}

// ─── API ──────────────────────────────────────────────────────────────────────
export const progressApi = {
  /** Get all progress reports for a visit */
  getVisitReports: (visitId: string) =>
    api.get<ProgressReport[]>(`/visits/${visitId}/progress-reports`).then((r) => r.data),

  /** Create a new progress report for a visit */
  create: (visitId: string, data: ProgressReportFormData) =>
    api.post<ProgressReport>(`/visits/${visitId}/progress-reports`, data).then((r) => r.data),

  /** Update an existing progress report */
  update: (reportId: string, data: ProgressReportFormData) =>
    api.patch<ProgressReport>(`/visits/progress-reports/${reportId}`, data).then((r) => r.data),

  /** Delete a progress report */
  delete: (reportId: string) =>
    api.delete<void>(`/visits/progress-reports/${reportId}`).then((r) => r.data),

  /** Get treatment plans for a patient */
  getPatientTreatmentPlans: (patientId: string) =>
    api.get(`/treatment-plans/patient/${patientId}`).then((r) => r.data),
};
