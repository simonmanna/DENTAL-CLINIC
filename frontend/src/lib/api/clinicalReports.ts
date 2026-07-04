import { api } from "./client";

// ─── Enums (mirror backend) ───────────────────────────────────────────────────

export enum ClinicalReportType {
  TREATMENT_HISTORY   = 'treatment_history',
  PLAN_VS_COMPLETED   = 'plan_vs_completed',
  PROCEDURE_SESSIONS  = 'procedure_sessions',
  PROCEDURE_OUTCOMES  = 'procedure_outcomes',
  DENTAL_CHART_STATUS = 'dental_chart_status',
  DIAGNOSIS_TRENDS    = 'diagnosis_trends',
  PATIENT_VISITS      = 'patient_visits',
  DENTIST_ACTIVITY    = 'dentist_activity',
}

export enum ReportPeriodClinical {
  TODAY          = 'today',
  THIS_WEEK      = 'this_week',
  THIS_MONTH     = 'this_month',
  LAST_MONTH     = 'last_month',
  LAST_3_MONTHS  = 'last_3_months',
  LAST_6_MONTHS  = 'last_6_months',
  THIS_YEAR      = 'this_year',
  CUSTOM         = 'custom',
}

// ─── Query shape ──────────────────────────────────────────────────────────────

export interface ClinicalReportQuery {
  type?: ClinicalReportType;
  period?: ReportPeriodClinical;
  startDate?: string;
  endDate?: string;
  patientId?: string;
  dentistId?: string;
  procedureId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PeriodRange { startDate: string; endDate: string }

// Treatment History
export interface TreatmentHistoryRow {
  planId: string; planCode: string;
  patientId: string; patientCode: string; patientName: string; patientPhone?: string;
  dentistId: string; dentistName: string; dentistSpecialization?: string;
  planTitle: string; planStatus: string; diagnosis?: string;
  estimatedCost: number; actualCost: number;
  totalProcedures: number; completedProcedures: number; completionRate: number;
  totalSessions: number; completedSessions: number; sessionCompletionRate: number;
  startDate?: string; endDate?: string; completedAt?: string; createdAt: string;
  procedures: {
    id: string; name: string; code?: string; status: string; sequence: number;
    visitGroup: number; sessionType: string; sessionCount: number; completedSessions: number;
    pricePerUnit: number; totalPrice: number; scheduledDate?: string; completedAt?: string;
  }[];
}
export interface TreatmentHistoryReport {
  type: ClinicalReportType.TREATMENT_HISTORY;
  period: PeriodRange;
  summary: { totalPlans: number; byStatus: Record<string,number>; totalEstimatedCost: number; totalActualCost: number };
  data: TreatmentHistoryRow[];
  pagination: Pagination;
}

// Plan vs Completed
export interface ProcedureComparison {
  name: string; code?: string;
  planned: number; completed: number; inProgress: number; cancelled: number;
  completionRate: number; totalRevenue: number;
}
export interface PlanVsCompletedReport {
  type: ClinicalReportType.PLAN_VS_COMPLETED;
  period: PeriodRange;
  summary: {
    totalPlanned: number; totalCompleted: number; totalInProgress: number;
    totalCancelled: number; totalOnHold: number; overallCompletionRate: number;
    totalSessions: number; sessionsByStatus: Record<string,number>;
  };
  procedureComparison: ProcedureComparison[];
  monthlyTrend: { month: string; planned: number; completed: number }[];
}

// Procedure Sessions
export interface ProcedureSessionRow {
  sessionId: string; sessionNumber: number; sessionLabel?: string; status: string;
  procedureName: string; procedureCode?: string; planCode: string;
  patientCode: string; patientName: string; dentistName: string; visitCode?: string;
  performedDate?: string; startedAt?: string; endedAt?: string; performedNotes?: string;
  sessionCost?: number; sessionPrice?: number; ledgerStatus: string; createdAt: string;
}
export interface ProcedureSessionsReport {
  type: ClinicalReportType.PROCEDURE_SESSIONS;
  period: PeriodRange;
  summary: {
    total: number; byStatus: Record<string,number>; avgDurationMinutes: number;
    sessionsByProcedure: { name: string; total: number; completed: number; pending: number; skipped: number; cancelled: number }[];
  };
  data: ProcedureSessionRow[];
  pagination: Pagination;
}

// Procedure Outcomes
export interface ProcedureOutcomesReport {
  type: ClinicalReportType.PROCEDURE_OUTCOMES;
  period: PeriodRange;
  summary: { totalCompleted: number; uniqueProcedureTypes: number; potentialRetreaments: number };
  byProcedure: { name: string; code?: string; count: number; avgSessionsUsed: number; totalPlannedCost: number; totalActualCost: number }[];
  retreatmentCandidates: { patientId: string; procedureName: string; count: number }[];
}

// Dental Chart Status
export interface DentalChartStatusReport {
  type: ClinicalReportType.DENTAL_CHART_STATUS;
  period: PeriodRange;
  summary: {
    totalToothRecords: number; totalCharts: number;
    toothStatusDistribution: { status: string; count: number }[];
    chartEntryTypes: { type: string; count: number }[];
  };
  pathologicalPatients: { patientId: string; patientName: string; patientCode: string; pathologyCount: number }[];
  mostAffectedTeeth: { toothNumber: number; status: string; count: number }[];
  recentChartEntries: {
    id: string; patientCode: string; patientName: string; visitCode?: string;
    toothNumber?: number; type: string; label: string; conditionCode?: string; procedureCode?: string; notes?: string; createdAt: string;
  }[];
  pagination: Pagination;
}

// Diagnosis Trends
export interface DiagnosisTrendsReport {
  type: ClinicalReportType.DIAGNOSIS_TRENDS;
  period: PeriodRange;
  summary: { totalUniqueDiagnoses: number; totalIcdCodes: number; topDiagnosis?: { name: string; count: number } };
  topDiagnoses: { diagnosis: string; count: number }[];
  icdCodeBreakdown: { code: string; count: number }[];
  chartConditions: { conditionCode?: string; label: string; count: number }[];
  monthlyTrend: { month: string; diagnosis: string; count: number }[];
  diagnosisByDentist: { dentistId: string; dentistName: string; totalVisitsWithDx: number; uniqueDiagnoses: number }[];
}

// Patient Visits
export interface PatientVisitRow {
  visitId: string; visitCode: string;
  patientId: string; patientCode: string; patientName: string; patientPhone?: string;
  dentistId: string; dentistName: string; dentistSpecialization?: string;
  status: string; paymentStatus: string;
  totalCost: number; amountPaid: number; balance: number;
  diagnosis: string[]; icdCodes: string[];
  procedureCount: number; procedures: { name: string; code?: string; cost: number }[];
  sessionCount: number; completedSessionCount: number;
  prescriptionCount: number;
  totalPayments: number;
  checkedInAt: string; startedAt?: string; completedAt?: string; followUpDate?: string; createdAt: string;
  treatmentProcedures?: {
    id: string;
    name: string;
    code?: string;
    status: string;
    totalPrice: number;
    sessionCount: number;
    completedSessions: number;
    targets?: { toothNumber?: number; surfaces?: string[] }[];
  }[];
  procedureSessions?: {
    sessionId: string;
    sessionNumber: number;
    sessionLabel?: string;
    status: string;
    performedDate?: string;
    performedNotes?: string;
    surfaces: string[];
    phase?: string;
    outcome?: string;
    isFinal: boolean;
    startedAt?: string;
    endedAt?: string;
    sessionPrice?: number;
    sessionCost?: number;
    treatmentProcedure?: {
      id: string;
      name: string;
      code?: string;
      subtotalPrice: number;
      totalPrice: number;
      status: string;
      sessionCount: number;
      targets?: { toothNumber?: number; surfaces?: string[] }[];
    };
  }[];
}

export interface PatientVisitsReport {
  type: ClinicalReportType.PATIENT_VISITS;
  period: PeriodRange;
  summary: { total: number; byStatus: Record<string,number>; totalRevenue: number; totalCollected: number; avgProceduresPerVisit: number | string };
  data: PatientVisitRow[];
  pagination: Pagination;
}

// Dentist Activity
export interface DentistActivityReport {
  type: ClinicalReportType.DENTIST_ACTIVITY;
  period: PeriodRange;
  summary: { totalDentists: number; totalVisits: number; totalRevenue: number; avgCompletionRate: number };
  dentists: {
    dentistId: string; dentistName: string; specialization?: string;
    totalVisits: number; completedVisits: number; visitCompletionRate: number;
    totalSessions: number; completedSessions: number; sessionCompletionRate: number;
    totalPlans: number; completedPlans: number; planCompletionRate: number;
    totalRevenue: number; totalCollected: number;
  }[];
}

export type ClinicalReport =
  | TreatmentHistoryReport
  | PlanVsCompletedReport
  | ProcedureSessionsReport
  | ProcedureOutcomesReport
  | DentalChartStatusReport
  | DiagnosisTrendsReport
  | PatientVisitsReport
  | DentistActivityReport;

// ─── Staff / Patient lookup helpers ──────────────────────────────────────────

export interface StaffOption { id: string; firstName: string; lastName: string; specialization?: string }
export interface PatientOption { id: string; patientCode: string; firstName: string; lastName: string }

// ─── API functions ────────────────────────────────────────────────────────────

export const clinicalReportsApi = {
  getReport: async (query: ClinicalReportQuery): Promise<ClinicalReport> => {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== ''),
    );
    const { data } = await api.get('/clinical-reports', { params });
    return data;
  },

  getStaff: async (): Promise<StaffOption[]> => {
    const { data } = await api.get('/clinical-reports/staff', { params: { role: 'DENTIST', limit: 100 } });
    return data?.data ?? data ?? [];
  },

  getPatients: async (search?: string): Promise<PatientOption[]> => {
    const { data } = await api.get('/clinical-reports/patients', {
      params: { search, limit: 50, isActive: true },
    });
    return data?.data ?? data ?? [];
  },

  exportCsv: async (query: ClinicalReportQuery): Promise<Blob> => {
    const params = Object.fromEntries(
      Object.entries({ ...query, limit: 5000 }).filter(([, v]) => v !== undefined && v !== ''),
    );
    const { data } = await api.get('/clinical-reports/clinical/export', { params, responseType: 'blob' });
    return data;
  },

   getPatientVisitsReport: async (query: ClinicalReportQuery): Promise<PatientVisitsReport> => {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== ''),
    );
    const { data } = await api.get('/reports/visits/patient-visits', { params });
    return data;
  },
};