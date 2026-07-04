import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type {
  PatientFullReport,
  PatientSummaryReport,
  TrendDataPoint,
  ReportQueryParams,
} from '@/types/reports';

const PATIENT_REPORTS_KEY = 'patientReports';

function buildReportParams(query: ReportQueryParams) {
  const params: Record<string, string> = {
    period: query.period ?? 'monthly',
  };
  if (query.startDate) params.startDate = query.startDate;
  if (query.endDate)   params.endDate   = query.endDate;
  return params;
}

export const usePatientReport = (query: ReportQueryParams) => {
  const { data, isPending, error, refetch } = useQuery<PatientFullReport>({
    queryKey: [PATIENT_REPORTS_KEY, query],
    queryFn: async () => {
      const { data } = await api.get('/patients/reports', {
        params: buildReportParams(query),
      });
      return data;
    },
  });

  return {
    data,
    loading: isPending,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refetch,
  };
};

export const usePatientSummary = () => {
  const { data, isPending, error, refetch } = useQuery<PatientSummaryReport>({
    queryKey: [PATIENT_REPORTS_KEY, 'summary'],
    queryFn: async () => {
      const { data } = await api.get('/patients/reports/summary');
      return data;
    },
  });

  return {
    data,
    loading: isPending,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refetch,
  };
};

export const usePatientTrends = (query: ReportQueryParams) => {
  const { data, isPending, error, refetch } = useQuery<TrendDataPoint[]>({
    queryKey: [PATIENT_REPORTS_KEY, 'trends', query],
    queryFn: async () => {
      const { data } = await api.get('/patients/reports/trends', {
        params: buildReportParams(query),
      });
      return data;
    },
  });

  return {
    data,
    loading: isPending,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refetch,
  };
};

export function exportToCSV(
  rows: Record<string, unknown>[],
  filename: string,
): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    headers.map(escape).join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printReport(title = 'Patient Report'): void {
  const original = document.title;
  document.title = title;
  window.print();
  document.title = original;
}