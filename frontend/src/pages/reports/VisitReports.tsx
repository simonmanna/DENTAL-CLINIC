// src/pages/reports/VisitReports.tsx
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';
import {
  Calendar, Download, Filter, ChevronRight, RefreshCw,
  FileText, ArrowUpRight, ArrowDownRight, Minus,
  ChevronDown, ChevronUp, Activity, DollarSign, Layers,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../../lib/utils';
import {
  clinicalReportsApi,
  ReportPeriodClinical,
  type PatientVisitsReport,
  type ClinicalReportQuery,
  ClinicalReportType
} from '@/lib/api/clinicalReports';

// ─── Palette ──────────────────────────────────────────────────────────────────
const TEAL = '#0d9488';
const PIE_COLORS = ['#0d9488', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#22c55e'];

const STATUS_COLORS: Record<string, string> = {
  PLANNED: '#3b82f6', IN_PROGRESS: '#f59e0b', COMPLETED: '#22c55e',
  CANCELLED: '#ef4444', ON_HOLD: '#94a3b8', PENDING: '#a78bfa',
  SKIPPED: '#fb923c', ARRIVED: '#06b6d4',
};

const STATUS_BG: Record<string, string> = {
  PLANNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
  ON_HOLD: 'bg-slate-100 text-slate-600',
  PENDING: 'bg-violet-100 text-violet-700',
  SKIPPED: 'bg-orange-100 text-orange-700',
  ARRIVED: 'bg-cyan-100 text-cyan-700',
  OPEN: 'bg-sky-100 text-sky-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
};

const PERIODS = [
  { value: ReportPeriodClinical.TODAY, label: 'Today' },
  { value: ReportPeriodClinical.THIS_WEEK, label: 'This Week' },
  { value: ReportPeriodClinical.THIS_MONTH, label: 'This Month' },
  { value: ReportPeriodClinical.LAST_MONTH, label: 'Last Month' },
  { value: ReportPeriodClinical.LAST_3_MONTHS, label: 'Last 3 Months' },
  { value: ReportPeriodClinical.LAST_6_MONTHS, label: 'Last 6 Months' },
  { value: ReportPeriodClinical.THIS_YEAR, label: 'This Year' },
  { value: ReportPeriodClinical.CUSTOM, label: 'Custom Range' },
] as const;

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
function pct(n: number) { return `${n}%`; }
function num(n: number | string) { return Number(n).toLocaleString(); }
function shortDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Badge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase',
      STATUS_BG[status] ?? 'bg-slate-100 text-slate-600')}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function KpiCard({
  title, value, sub, icon: Icon, accent = false, trend, trendVal,
}: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; accent?: boolean; trend?: 'up' | 'down' | 'flat'; trendVal?: string;
}) {
  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl border px-4 py-2 flex flex-col gap-3',
      accent ? 'bg-teal-600 border-teal-500 text-white' : 'bg-white border-slate-100 shadow-sm',
    )}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-xl shrink-0', accent ? 'bg-white/20' : 'bg-teal-50')}>
            <Icon className={cn('w-5 h-5', accent ? 'text-white' : 'text-teal-600')} />
          </div>
          <div>
            <p className={cn('text-xs font-medium', accent ? 'text-teal-100' : 'text-slate-500')}>
              {title}: <span className={accent ? 'text-white' : 'text-slate-900'}>{value}</span>
            </p>
            {sub && (
              <p className={cn('text-[10px] leading-tight font-medium', accent ? 'text-white/70' : 'text-slate-400')}>
                {sub}
              </p>
            )}
          </div>
        </div>
        {trend && (
          <span className={cn('flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full shrink-0',
            trend === 'up' ? (accent ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700') :
              trend === 'down' ? (accent ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700') :
                (accent ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'))}>
            {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> :
              trend === 'down' ? <ArrowDownRight className="w-3 h-3" /> :
                <Minus className="w-3 h-3" />}
            {trendVal}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionCard({ title, children, className, action }: {
  title: string; children: React.ReactNode; className?: string; action?: React.ReactNode;
}) {
  return (
    <div className={cn('bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden', className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
        <h3 className="text-sm font-semibold text-slate-700 tracking-wide">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-slate-100 rounded-lg', className)} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
      <FileText className="w-10 h-10 text-slate-200" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ value, max, color = '#0d9488' }: { value: number; max: number; color?: string }) {
  const percentage = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percentage}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── Collapsible table row ────────────────────────────────────────────────────
function CollapsibleRow({ children, detail }: { children: React.ReactNode; detail: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="hover:bg-slate-70 transition-colors cursor-pointer" onClick={() => setOpen(o => !o)}>
        {children}
        <td className="px-4 py-3 text-slate-400">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={999} className="bg-slate-50 px-6 py-4 border-b border-slate-100">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────
interface Filters {
  period: ReportPeriodClinical;
  startDate: string;
  endDate: string;
  patientId: string;
  dentistId: string;
  status: string;
  page: number;
}

function FilterBar({
  filters,
  onChange,
  dentistOptions,
  onExport,
  isLoading,
}: {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  dentistOptions: { id: string; firstName: string; lastName: string }[];
  onExport: () => void;
  isLoading: boolean;
}) {
  const inputCls = 'px-3 py-1 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 focus:outline-none bg-white transition-all';
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-0.5 flex flex-wrap gap-3 items-center">
      <div className="flex items-center gap-2 text-slate-400">
        <Filter className="w-4 h-4" />
        <span className="text-xs font-medium text-slate-500">Filters</span>
      </div>

      {/* Period */}
      <select value={filters.period} onChange={e => onChange({ period: e.target.value as ReportPeriodClinical, page: 1 })}
        className={inputCls}>
        {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>

      {/* Custom dates */}
      {filters.period === ReportPeriodClinical.CUSTOM && (
        <>
          <input type="date" value={filters.startDate} onChange={e => onChange({ startDate: e.target.value, page: 1 })}
            className={inputCls} />
          <span className="text-slate-300 text-sm">→</span>
          <input type="date" value={filters.endDate} onChange={e => onChange({ endDate: e.target.value, page: 1 })}
            className={inputCls} />
        </>
      )}

      {/* Dentist */}
      <select value={filters.dentistId} onChange={e => onChange({ dentistId: e.target.value, page: 1 })}
        className={inputCls}>
        <option value="">All Dentists</option>
        {dentistOptions.map(d => (
          <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>
        ))}
      </select>

      {/* Status */}
      <select value={filters.status} onChange={e => onChange({ status: e.target.value, page: 1 })}
        className={inputCls}>
        <option value="">All Statuses</option>
        {['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD', 'PENDING', 'SKIPPED'].map(s => (
          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
        ))}
      </select>

      <div className="ml-auto flex gap-2">
        {isLoading && <RefreshCw className="w-4 h-4 text-teal-500 animate-spin self-center" />}
        <button onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>
    </div>
  );
}

// ─── Tooltip (custom recharts) ────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, currency = false }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex gap-2">
          <span>{p.name}:</span>
          <span className="font-bold">{currency ? formatCurrency(p.value) : num(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

// ─── Pagination ───────────────────────────────────────────────────────────────
function Paginator({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-50 text-xs text-slate-500">
      <span>Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors">Prev</button>
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors">Next</button>
      </div>
    </div>
  );
}

// ─── Patient Visits Panel ─────────────────────────────────────────────────────
function PatientVisitsPanel({ report, onPageChange }: { report: PatientVisitsReport; onPageChange: (p: number) => void }) {
  const s = report.summary;
  const statusEntries = Object.entries(s.byStatus);

  return (
    <div className="space-y-2">
      {/* KPIs */}
      {/* <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Visits" value={num(s.total)} icon={Calendar} accent />
        <KpiCard title="Total Revenue" value={formatCurrency(s.totalRevenue)} icon={DollarSign} />
        <KpiCard title="Collected" value={formatCurrency(s.totalCollected)} icon={Activity} />
        <KpiCard title="Avg Procedures / Visit" value={s.avgProceduresPerVisit} icon={Layers} />
      </div> */}


      {/* Visits table */}
      <SectionCard title={`Visit Records (${num(report.pagination.total)})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['Visit Code', 'Date', 'Patient', 'Dentist', 'Procedures', 'Procedure Sessions', 'Status', 'Total'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {report.data.length === 0 && (
                <tr><td colSpan={9}><EmptyState message="No visits found for this period" /></td></tr>
              )}
              {report.data.map(v => (
                <CollapsibleRow key={v.visitId} detail={
                  <div className="space-y-2">
                    {v.diagnosis.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-slate-500 mr-2">Diagnoses:</span>
                        {v.diagnosis.map((d, i) => (
                          <span key={i} className="mr-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium">
                            {d}
                          </span>
                        ))}
                      </div>
                    )}

                    {v.treatmentProcedures?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-200">
                        <span className="text-xs font-semibold text-slate-500 mr-2">Planned Treatment Procedures:</span>
                        <div className="flex flex-wrap gap-1">
                          {v.treatmentProcedures.map((tp, i) => (
                            <span key={i} className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full text-[10px] font-medium">
                              {tp.name} {tp.targets?.[0]?.toothNumber && `• Tooth ${tp.targets[0].toothNumber}`}
                              <span className="text-violet-400 mx-1">|</span>
                              {tp.status}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {v.procedureSessions?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-200">
                        <span className="text-xs font-semibold text-slate-500 mr-2">Procedure Sessions:</span>
                        <div className="flex flex-wrap gap-1">
                          {v.procedureSessions.map((ps, i) => (
                            <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-medium">
                              {ps.sessionLabel || `${ps.treatmentProcedure?.name} #${ps.sessionNumber}`}
                              {ps.surfaces?.[0] && ` • ${ps.surfaces[0]}`}
                              <span className="text-indigo-400 mx-1">|</span>
                              {ps.status}
                              {ps.sessionPrice && <span className="ml-1 text-indigo-600">• {formatCurrency(ps.sessionPrice)}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {v.followUpDate && (
                      <p className="text-xs text-slate-500">
                        Follow-up: <span className="font-medium text-slate-700">{shortDate(v.followUpDate)}</span>
                      </p>
                    )}

                  </div>
                }>
                  <td className="px-4 py-3 font-mono font-semibold text-teal-600">{v.visitCode}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{shortDate(v.createdAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{v.patientName}</p>
                    <p className="text-slate-400">{v.patientCode}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{v.dentistName}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-slate-100 rounded-full font-semibold text-slate-700">
                      {v.procedureCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-slate-100 rounded-full font-semibold text-slate-700">
                      {v.sessionCount}
                    </span>
                  </td>
                  <td className="px-4 py-3"><Badge status={v.status} /></td>
                  {/* <td className="px-4 py-3"><Badge status={v.paymentStatus} /></td> */}
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{formatCurrency(v.amountPaid ?? 0)}</p>
                    {/* {v.balance > 0 && <p className="text-red-500 text-[10px]">Bal: {formatCurrency(v.balance)}</p>} */}
                  </td>
                </CollapsibleRow>
              ))}
            </tbody>
          </table>
        </div>
        <Paginator page={report.pagination.page} totalPages={report.pagination.totalPages} onChange={onPageChange} />
      </SectionCard>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function VisitReports() {
  const [filters, setFilters] = useState<Filters>({
    period: ReportPeriodClinical.THIS_MONTH,
    startDate: '',
    endDate: '',
    patientId: '',
    dentistId: '',
    status: '',
    page: 1,
  });

  const updateFilters = useCallback((partial: Partial<Filters>) => {
    setFilters(f => ({ ...f, ...partial }));
  }, []);

  const query: ClinicalReportQuery = useMemo(() => ({
    type: ClinicalReportType.PATIENT_VISITS,  // ← Use enum, not string
    period: filters.period,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    patientId: filters.patientId || undefined,
    dentistId: filters.dentistId || undefined,
    status: filters.status || undefined,
    page: filters.page,
    limit: 50,
  }), [filters]);


  const { data: report, isLoading, isError, refetch } = useQuery<PatientVisitsReport>({
    queryKey: ['clinical-report-patient-visits', query],
    queryFn: () => clinicalReportsApi.getPatientVisitsReport(query),
    staleTime: 60_000,
  });

  const { data: dentists = [] } = useQuery({
    queryKey: ['staff-dentists'],
    queryFn: clinicalReportsApi.getStaff,
    staleTime: 300_000,
  });

  const handleExport = async () => {
    try {
      const blob = await clinicalReportsApi.exportCsv(query);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patient-visits-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
  };

  return (
    <div className="flex flex-col gap-1 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-0">
            <span>Reports</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-teal-600 font-medium">Patient Visits</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Patient Visits Report</h2>
          {/* <p className="text-sm text-slate-500 mt-0.5">All visits with procedures, payments & diagnoses</p> */}
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin text-teal-500')} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={updateFilters}
        dentistOptions={dentists}
        onExport={handleExport}
        isLoading={isLoading}
      />

      {/* Report content */}
      {isLoading && <LoadingSkeleton />}

      {isError && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
            <FileText className="w-7 h-7 text-red-400" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-slate-700">Failed to load visits report</p>
            <p className="text-sm text-slate-400 mt-1">Check your connection and try again</p>
          </div>
          <button onClick={() => refetch()}
            className="px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && report && (
        <PatientVisitsPanel report={report} onPageChange={p => updateFilters({ page: p })} />
      )}
    </div>
  );
}