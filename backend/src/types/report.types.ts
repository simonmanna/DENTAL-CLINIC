export type ReportType = 
  | 'SUMMARY'
  | 'FINANCIAL'
  | 'CLINICAL'
  | 'PATIENT'
  | 'DENTIST'
  | 'PROCEDURE'
  | 'DETAILED';

export type ReportPeriod = 
  | 'TODAY'
  | 'YESTERDAY'
  | 'THIS_WEEK'
  | 'LAST_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'CUSTOM';

export interface ReportQuery {
  type: ReportType;
  period?: ReportPeriod;
  startDate?: string;
  endDate?: string;
  patientId?: string;
  dentistId?: string;
  status?: string;
  procedureId?: string;
  page?: number;
  limit?: number;
}

export interface SummaryReport {
  period: { startDate: string; endDate: string };
  summary: {
    totalVisits: number;
    completedVisits: number;
    cancelledVisits: number;
    completionRate: number;
    totalRevenue: number;
    totalCollected: number;
    outstandingBalance: number;
    collectionRate: number;
  };
  dailyTrends: Array<{
    date: string;
    total_visits: number;
    completed_visits: number;
    revenue: number;
  }>;
  topProcedures: Array<{
    procedure_name: string;
    count: number;
    total_revenue: number;
  }>;
}

export interface FinancialReport {
  period: { startDate: string; endDate: string };
  revenueByPaymentMethod: Array<{
    payment_method: string;
    total_amount: number;
    payment_count: number;
  }>;
  revenueByProcedureCategory: Array<{
    category_name: string;
    procedure_count: number;
    total_revenue: number;
  }>;
  outstandingInvoices: Array<{
    visitCode: string;
    patient: { firstName: string; lastName: string };
    dentist: { firstName: string; lastName: string };
    totalCost: number;
    amountPaid: number;
    balance: number;
    createdAt: string;
  }>;
  revenueTrends: Array<{
    date: string;
    daily_revenue: number;
    payment_count: number;
  }>;
}