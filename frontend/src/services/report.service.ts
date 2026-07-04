import api from "@/lib/api/client";

// 👇 Add these type definitions
export type ReportPeriod = "daily" | "weekly" | "monthly" | "yearly" | "custom";

export interface ReportQuery {
  period?: ReportPeriod;
  startDate?: string;
  endDate?: string;
  patientId?: string;
  dentistId?: string;
  page?: number;
  limit?: number;
  [key: string]: string | number | boolean | undefined; // Allows extra query params
}

export const reportService = {
  getReports: (params: ReportQuery) => 
    api.get('/reports', { params }),
  
  getSummaryReport: (period?: ReportPeriod, startDate?: string, endDate?: string) =>
    api.get('/reports/reports/summary', { params: { period, startDate, endDate } }),
  
  getFinancialReport: (period?: ReportPeriod, startDate?: string, endDate?: string) =>
    api.get('/reports/reports/financial', { params: { period, startDate, endDate } }),
  
  getClinicalReport: (period?: ReportPeriod, startDate?: string, endDate?: string) =>
    api.get('/reports/reports/clinical', { params: { period, startDate, endDate } }),
  
  getPatientReport: (patientId: string, period?: ReportPeriod, startDate?: string, endDate?: string) =>
    api.get(`/reports/reports/patient/${patientId}`, { params: { period, startDate, endDate } }),
  
  getDentistReport: (dentistId: string, period?: ReportPeriod, startDate?: string, endDate?: string) =>
    api.get(`/reports/reports/dentist/${dentistId}`, { params: { period, startDate, endDate } }),
  
  getProcedureReport: (period?: ReportPeriod, startDate?: string, endDate?: string) =>
    api.get('/reports/reports/procedures', { params: { period, startDate, endDate } }),
  
  getDashboardStats: () => 
    api.get('/reports/reports/dashboard-stats'),
  
  exportCSV: (params: ReportQuery) =>
    api.get('/reports/reports/export/csv', { 
      params,
      responseType: 'blob',
    }),
};