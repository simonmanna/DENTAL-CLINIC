// src/pages/reports/ClinicalReportsPage.tsx
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area, RadarChart,
  Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import {
  ClipboardList, CheckSquare, Layers, Target, Pill, TrendingUp,
  Users, Activity, Calendar, Download, Filter, ChevronRight,
  Search, RefreshCw, BarChart3, AlertTriangle, Clock, DollarSign,
  Stethoscope, FileText, ArrowUpRight, ArrowDownRight, Minus,
  ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../../lib/utils';
import {
  clinicalReportsApi,
  ClinicalReportType,
  ReportPeriodClinical,
  type ClinicalReportQuery,
  type ClinicalReport,
  type TreatmentHistoryReport,
  type PlanVsCompletedReport,
  type ProcedureSessionsReport,
  type ProcedureOutcomesReport,
  type DentalChartStatusReport,
  type DiagnosisTrendsReport,
  type PatientVisitsReport,
  type DentistActivityReport,
} from '@/lib/api/clinicalReports';


// ─── Palette ──────────────────────────────────────────────────────────────────

const TEAL = '#0d9488';
const TEAL2 = '#14b8a6';
const SLATE = '#475569';
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

// ─── Report type definitions ──────────────────────────────────────────────────

const REPORT_TYPES = [
  { id: ClinicalReportType.PATIENT_VISITS, label: 'Patient Visits', icon: Calendar, desc: 'All visits with procedures, payments & diagnoses' },
  { id: ClinicalReportType.TREATMENT_HISTORY, label: 'Treatment History', icon: ClipboardList, desc: 'Full treatment plans with procedure breakdowns' },
  { id: ClinicalReportType.PLAN_VS_COMPLETED, label: 'Plan vs Completed', icon: CheckSquare, desc: 'Planned vs executed procedures with gap analysis' },
  { id: ClinicalReportType.PROCEDURE_SESSIONS, label: 'Session Executions', icon: Layers, desc: 'Individual session log, durations & ledger status' },
  { id: ClinicalReportType.PROCEDURE_OUTCOMES, label: 'Procedure Outcomes', icon: Target, desc: 'Completion rates, cost deviations & re-treatments' },
  { id: ClinicalReportType.DENTAL_CHART_STATUS, label: 'Dental Chart Status', icon: Stethoscope, desc: 'Tooth condition distribution & pathology hotspots' },
  // { id: ClinicalReportType.DIAGNOSIS_TRENDS, label: 'Diagnosis Trends', icon: TrendingUp, desc: 'Most common diagnoses, ICD codes & monthly trends' },
  // { id: ClinicalReportType.DENTIST_ACTIVITY, label: 'Dentist Activity', icon: Users, desc: 'Per-dentist visit, session & revenue performance' },
] as const;

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
      accent
        ? 'bg-teal-600 border-teal-500 text-white'
        : 'bg-white border-slate-100 shadow-sm',
    )}>
      {/* Changed items-start to items-center for vertical alignment */}
      <div className="flex items-center justify-between gap-4">
        
        {/* Left side: Icon and Label grouped together */}
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

        {/* Right side: Trend Indicator */}
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

// function KpiCard({
//   title, value, sub, icon: Icon, accent = false, trend, trendVal,
// }: {
//   title: string; value: string | number; sub?: string;
//   icon: React.ElementType; accent?: boolean; trend?: 'up' | 'down' | 'flat'; trendVal?: string;
// }) {
//   return (
//     <div className={cn(
//       'relative overflow-hidden rounded-xl border px-4 py-2 flex flex-col gap-3',
//       accent
//         ? 'bg-teal-600 border-teal-500 text-white'
//         : 'bg-white border-slate-100 shadow-sm',
//     )}>
//       <div className="flex items-start justify-between">
//         <div className={cn('p-2 rounded-xl', accent ? 'bg-white/20' : 'bg-teal-50')}>
//           <Icon className={cn('w-5 h-5', accent ? 'text-white' : 'text-teal-600')} />
//         </div>

//         <p className={cn('text-xs mt-0.5', accent ? 'text-teal-100' : 'text-slate-500')}>{title}: {value}</p>
//         {sub && <p className={cn('text-xs mt-1 font-medium', accent ? 'text-white/70' : 'text-slate-400')}>{sub}</p>}

//         {trend && (
//           <span className={cn('flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full',
//             trend === 'up' ? (accent ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700') :
//               trend === 'down' ? (accent ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700') :
//                 (accent ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'))}>
//             {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> :
//               trend === 'down' ? <ArrowDownRight className="w-3 h-3" /> :
//                 <Minus className="w-3 h-3" />}
//             {trendVal}
//           </span>
//         )}
//       </div>
//     </div>
//   );
// }

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
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── Completion ring ──────────────────────────────────────────────────────────

function Ring({ pct: p, size = 48, stroke = 4 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (p / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TEAL} strokeWidth={stroke}
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  );
}

// ─── Collapsible table row ────────────────────────────────────────────────────

function CollapsibleRow({ children, detail }: { children: React.ReactNode; detail: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setOpen(o => !o)}>
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

// ─── Individual report panels ─────────────────────────────────────────────────

// 1. Patient Visits ────────────────────────────────────────────────────────────
function PatientVisitsPanel({ report, onPageChange }: { report: PatientVisitsReport; onPageChange: (p: number) => void }) {
  const s = report.summary;
  const statusEntries = Object.entries(s.byStatus);

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Visits" value={num(s.total)} icon={Calendar} accent />
        <KpiCard title="Total Revenue" value={formatCurrency(s.totalRevenue)} icon={DollarSign} />
        <KpiCard title="Collected" value={formatCurrency(s.totalCollected)} icon={Activity} />
        <KpiCard title="Avg Procedures / Visit" value={s.avgProceduresPerVisit} icon={Layers} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status donut */}
        <SectionCard title="Visits by Status">
          <div className="p-4 flex flex-col items-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={statusEntries.map(([s, c]) => ({ name: s.replace(/_/g, ' '), value: c }))}
                  cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {statusEntries.map(([st], i) => <Cell key={i} fill={STATUS_COLORS[st] ?? PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
              {statusEntries.map(([st, c], i) => (
                <div key={st} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[st] ?? PIE_COLORS[i] }} />
                  <span className="text-slate-600">{st.replace(/_/g, ' ')}</span>
                  <span className="font-bold text-slate-800">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Revenue vs Collected bars */}
        <SectionCard title="Revenue vs Collected">
          <div className="p-4 space-y-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Collected</span>
              <span className="font-semibold text-slate-700">
                {s.totalRevenue > 0 ? Math.round((s.totalCollected / s.totalRevenue) * 100) : 0}% of billed
              </span>
            </div>
            <ProgressBar value={s.totalCollected} max={s.totalRevenue} color={TEAL} />
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-3 rounded-xl bg-teal-50 text-center">
                <p className="text-lg font-bold text-teal-700">{formatCurrency(s.totalCollected)}</p>
                <p className="text-xs text-teal-600 mt-0.5">Collected</p>
              </div>
              <div className="p-3 rounded-xl bg-red-50 text-center">
                <p className="text-lg font-bold text-red-600">{formatCurrency(s.totalRevenue - s.totalCollected)}</p>
                <p className="text-xs text-red-500 mt-0.5">Outstanding</p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Visits table */}
      <SectionCard title={`Visit Records (${num(report.pagination.total)})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['Visit Code', 'Patient', 'Dentist', 'Procedures', 'Status', 'Payment', 'Total', 'Date'].map(h => (
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
                      <div><span className="text-xs font-semibold text-slate-500 mr-2">Diagnoses:</span>
                        {v.diagnosis.map((d, i) => <span key={i} className="mr-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium">{d}</span>)}
                      </div>
                    )}
                    {v.procedures.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {v.procedures.map((p, i) => (
                          <span key={i} className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-[10px] font-medium">
                            {p.name} — {formatCurrency(p.cost)}
                          </span>
                        ))}
                      </div>
                    )}
                    {v.followUpDate && <p className="text-xs text-slate-500">Follow-up: <span className="font-medium text-slate-700">{shortDate(v.followUpDate)}</span></p>}
                  </div>
                }>
                  <td className="px-4 py-3 font-mono font-semibold text-teal-600">{v.visitCode}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{v.patientName}</p>
                    <p className="text-slate-400">{v.patientCode}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{v.dentistName}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-slate-100 rounded-full font-semibold text-slate-700">{v.procedureCount}</span>
                  </td>
                  <td className="px-4 py-3"><Badge status={v.status} /></td>
                  <td className="px-4 py-3"><Badge status={v.paymentStatus} /></td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{formatCurrency(v.totalCost)}</p>
                    {v.balance > 0 && <p className="text-red-500 text-[10px]">Bal: {formatCurrency(v.balance)}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{shortDate(v.createdAt)}</td>
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

// 2. Treatment History ─────────────────────────────────────────────────────────
function TreatmentHistoryPanel({ report, onPageChange }: { report: TreatmentHistoryReport; onPageChange: (p: number) => void }) {
  const s = report.summary;
  const statusEntries = Object.entries(s.byStatus);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Plans" value={num(s.totalPlans)} icon={ClipboardList} accent />
        <KpiCard title="Estimated Cost" value={formatCurrency(s.totalEstimatedCost)} icon={DollarSign} />
        <KpiCard title="Actual Cost" value={formatCurrency(s.totalActualCost)} icon={Activity} />
        <KpiCard title="Cost Efficiency"
          value={s.totalEstimatedCost > 0 ? pct(Math.round((s.totalActualCost / s.totalEstimatedCost) * 100)) : '—'}
          icon={Target} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Plans by Status">
          <div className="p-4">
            {statusEntries.map(([st, count], i) => (
              <div key={st} className="flex items-center gap-3 mb-3">
                <span className="w-24 text-xs text-slate-500 capitalize shrink-0">{st.replace(/_/g, ' ')}</span>
                <div className="flex-1">
                  <ProgressBar value={count} max={s.totalPlans} color={STATUS_COLORS[st] ?? PIE_COLORS[i]} />
                </div>
                <span className="text-xs font-bold text-slate-700 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Estimated vs Actual Cost">
          <div className="p-4 space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">Estimated</span>
                <span className="font-semibold text-slate-700">{formatCurrency(s.totalEstimatedCost)}</span>
              </div>
              <div className="h-2 rounded-full bg-blue-100">
                <div className="h-2 rounded-full bg-blue-500" style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">Actual</span>
                <span className="font-semibold text-slate-700">{formatCurrency(s.totalActualCost)}</span>
              </div>
              <div className="h-2 rounded-full bg-teal-100">
                <div className="h-2 rounded-full bg-teal-500" style={{
                  width: `${s.totalEstimatedCost > 0 ? Math.min(100, (s.totalActualCost / s.totalEstimatedCost) * 100) : 0}%`
                }} />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title={`Treatment Plans (${num(report.pagination.total)})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['Plan', 'Patient', 'Dentist', 'Procedures', 'Sessions', 'Completion', 'Est. Cost', 'Status', 'Created'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {report.data.length === 0 && (
                <tr><td colSpan={10}><EmptyState message="No treatment plans found" /></td></tr>
              )}
              {report.data.map(plan => (
                <CollapsibleRow key={plan.planId} detail={
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-600">{plan.planTitle}</p>
                    {plan.diagnosis && <p className="text-xs text-slate-500">Diagnosis: <span className="text-slate-700">{plan.diagnosis}</span></p>}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {plan.procedures.map(p => (
                        <div key={p.id} className={cn(
                          'p-2 rounded-xl border text-[10px] space-y-1',
                          p.status === 'COMPLETED' ? 'border-emerald-200 bg-emerald-50' :
                            p.status === 'IN_PROGRESS' ? 'border-amber-200 bg-amber-50' :
                              'border-slate-200 bg-slate-50',
                        )}>
                          <p className="font-semibold text-slate-700">{p.name}</p>
                          <div className="flex items-center justify-between">
                            <Badge status={p.status} />
                            <span className="text-slate-500">{p.completedSessions}/{p.sessionCount} sess.</span>
                          </div>
                          <p className="text-slate-500">{formatCurrency(p.totalPrice)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                }>
                  <td className="px-4 py-3 font-mono font-semibold text-teal-600">{plan.planCode}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{plan.patientName}</p>
                    <p className="text-slate-400">{plan.patientCode}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{plan.dentistName}</td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-700">{plan.totalProcedures}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-slate-700">{plan.completedSessions}/{plan.totalSessions}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Ring pct={plan.completionRate} size={32} stroke={3} />
                      <span className="font-semibold text-slate-700">{plan.completionRate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">{formatCurrency(plan.estimatedCost)}</td>
                  <td className="px-4 py-3"><Badge status={plan.planStatus} /></td>
                  <td className="px-4 py-3 text-slate-500">{shortDate(plan.createdAt)}</td>
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

// 3. Plan vs Completed ────────────────────────────────────────────────────────
function PlanVsCompletedPanel({ report }: { report: PlanVsCompletedReport }) {
  const s = report.summary;
  const top10 = report.procedureComparison.slice(0, 12);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Planned" value={num(s.totalPlanned)} icon={ClipboardList} accent />
        <KpiCard title="Completed" value={num(s.totalCompleted)} icon={CheckSquare}
          trend="up" trendVal={pct(s.overallCompletionRate)} />
        <KpiCard title="In Progress" value={num(s.totalInProgress)} icon={Activity} />
        <KpiCard title="Overall Rate" value={pct(s.overallCompletionRate)} icon={Target} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Planned vs Completed by Procedure">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={top10} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }}
                  tickLine={false} width={110}
                  tickFormatter={v => v.length > 14 ? v.slice(0, 13) + '…' : v} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="planned" name="Planned" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={10} />
                <Bar dataKey="completed" name="Completed" fill={TEAL} radius={[0, 4, 4, 0]} barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Monthly Trend">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={report.monthlyTrend}>
                <defs>
                  <linearGradient id="gPlanned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={TEAL} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={TEAL} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="planned" name="Planned" stroke="#3b82f6" fill="url(#gPlanned)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="completed" name="Completed" stroke={TEAL} fill="url(#gCompleted)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Session breakdown */}
      <SectionCard title="Session Status Breakdown">
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(s.sessionsByStatus).map(([st, count]) => (
            <div key={st} className="text-center p-3 rounded-xl border border-slate-100 bg-slate-50">
              <div className="w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center"
                style={{ backgroundColor: `${STATUS_COLORS[st] ?? '#94a3b8'}20` }}>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[st] ?? '#94a3b8' }} />
              </div>
              <p className="text-lg font-bold text-slate-800">{count}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{st.replace(/_/g, ' ')}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Completion rate table */}
      <SectionCard title="Procedure Completion Rates">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['Procedure', 'Planned', 'Completed', 'In Progress', 'Cancelled', 'Completion Rate', 'Revenue'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.procedureComparison.map((p, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                  <td className="px-4 py-3 text-slate-600">{p.planned}</td>
                  <td className="px-4 py-3 text-emerald-600 font-semibold">{p.completed}</td>
                  <td className="px-4 py-3 text-amber-600">{p.inProgress}</td>
                  <td className="px-4 py-3 text-red-500">{p.cancelled}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={p.completionRate} max={100} />
                      <span className="font-semibold text-slate-700 w-10 text-right">{p.completionRate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">{formatCurrency(p.totalRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// 4. Procedure Sessions ────────────────────────────────────────────────────────
function ProcedureSessionsPanel({ report, onPageChange }: { report: ProcedureSessionsReport; onPageChange: (p: number) => void }) {
  const s = report.summary;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Sessions" value={num(s.total)} icon={Layers} accent />
        <KpiCard title="Completed" value={num(s.byStatus?.COMPLETED ?? 0)} icon={CheckSquare} />
        <KpiCard title="Pending" value={num(s.byStatus?.PENDING ?? 0)} icon={Clock} />
        <KpiCard title="Avg Duration" value={`${s.avgDurationMinutes} min`} icon={Activity} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Sessions by Procedure">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={s.sessionsByProcedure.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} tickLine={false} width={120}
                  tickFormatter={v => v.length > 16 ? v.slice(0, 15) + '…' : v} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="completed" name="Completed" stackId="a" fill={TEAL} barSize={12} />
                <Bar dataKey="pending" name="Pending" stackId="a" fill="#a78bfa" barSize={12} />
                <Bar dataKey="skipped" name="Skipped" stackId="a" fill="#fb923c" barSize={12} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Status Distribution">
          <div className="p-4 flex flex-col items-center">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={Object.entries(s.byStatus).map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: v }))}
                  cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                  {Object.keys(s.byStatus).map((k, i) => <Cell key={i} fill={STATUS_COLORS[k] ?? PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {Object.entries(s.byStatus).map(([k, v], i) => (
                <div key={k} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[k] ?? PIE_COLORS[i] }} />
                  <span className="text-slate-600">{k.replace(/_/g, ' ')}</span>
                  <span className="font-bold text-slate-800">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title={`Session Log (${num(report.pagination.total)})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['#', 'Session', 'Procedure', 'Plan', 'Patient', 'Dentist', 'Status', 'Ledger', 'Date'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.data.length === 0 && (
                <tr><td colSpan={9}><EmptyState message="No sessions found for this period" /></td></tr>
              )}
              {report.data.map((s, i) => (
                <tr key={s.sessionId} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-400">{i + 1 + (report.pagination.page - 1) * report.pagination.limit}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-700">{s.sessionLabel ?? `Session ${s.sessionNumber}`}</p>
                    {s.performedNotes && <p className="text-slate-400 truncate max-w-[160px]">{s.performedNotes}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{s.procedureName}</td>
                  <td className="px-4 py-3 font-mono text-teal-600">{s.planCode}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{s.patientName}</p>
                    <p className="text-slate-400">{s.patientCode}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.dentistName}</td>
                  <td className="px-4 py-3"><Badge status={s.status} /></td>
                  <td className="px-4 py-3"><Badge status={s.ledgerStatus} /></td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{shortDate(s.performedDate ?? s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginator page={report.pagination.page} totalPages={report.pagination.totalPages} onChange={onPageChange} />
      </SectionCard>
    </div>
  );
}

// 5. Procedure Outcomes ────────────────────────────────────────────────────────
function ProcedureOutcomesPanel({ report }: { report: ProcedureOutcomesReport }) {
  const s = report.summary;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard title="Completed Procedures" value={num(s.totalCompleted)} icon={CheckSquare} accent />
        <KpiCard title="Unique Procedure Types" value={num(s.uniqueProcedureTypes)} icon={Layers} />
        <KpiCard title="Re-treatment Candidates" value={num(s.potentialRetreaments)} icon={AlertTriangle}
          trend={s.potentialRetreaments > 0 ? 'down' : 'flat'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Top Procedures by Completions">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={report.byProcedure.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false}
                  tickFormatter={v => v.length > 12 ? v.slice(0, 11) + '…' : v} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Completions" fill={TEAL} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Cost: Planned vs Actual">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={report.byProcedure.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false}
                  tickFormatter={v => v.length > 12 ? v.slice(0, 11) + '…' : v} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip currency />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="totalPlannedCost" name="Planned" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="totalActualCost" name="Actual" fill={TEAL} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {report.retreatmentCandidates.length > 0 && (
        <SectionCard title={`Re-treatment Candidates (${report.retreatmentCandidates.length})`}
          action={<span className="flex items-center gap-1 text-xs text-amber-600 font-medium"><AlertTriangle className="w-3.5 h-3.5" /> Review recommended</span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Patient ID', 'Procedure', 'Times Done'].map(h => (
                    <th key={h} className="px-5 py-3 text-left font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.retreatmentCandidates.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-amber-50/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-slate-600">{r.patientId.slice(0, 12)}…</td>
                    <td className="px-5 py-3 text-slate-800 font-medium">{r.procedureName}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-bold">{r.count}×</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <SectionCard title="All Procedures — Outcome Detail">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['Procedure', 'Code', 'Completions', 'Avg Sessions Used', 'Planned Cost', 'Actual Cost'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.byProcedure.map((p, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{p.code ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full font-bold">{p.count}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.avgSessionsUsed.toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCurrency(p.totalPlannedCost)}</td>
                  <td className="px-4 py-3">
                    <span className={cn('font-semibold', p.totalActualCost > p.totalPlannedCost ? 'text-red-600' : 'text-emerald-600')}>
                      {formatCurrency(p.totalActualCost)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// 6. Dental Chart Status ───────────────────────────────────────────────────────
function DentalChartPanel({ report, onPageChange }: { report: DentalChartStatusReport; onPageChange: (p: number) => void }) {
  const s = report.summary;

  // Build a 32-tooth heatmap (FDI notation)
  const toothMap = new Map<number, number>();
  report.mostAffectedTeeth.forEach(t => {
    toothMap.set(t.toothNumber, (toothMap.get(t.toothNumber) ?? 0) + Number(t.count));
  });
  const maxCount = Math.max(...Array.from(toothMap.values()), 1);

  // FDI tooth grid (permanent teeth)
  const upperRight = [18, 17, 16, 15, 14, 13, 12, 11];
  const upperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
  const lowerLeft = [31, 32, 33, 34, 35, 36, 37, 38];
  const lowerRight = [48, 47, 46, 45, 44, 43, 42, 41];

  function ToothCell({ num: n }: { num: number }) {
    const cnt = toothMap.get(n) ?? 0;
    const intensity = cnt / maxCount;
    const bg = cnt === 0 ? '#f8fafc' : `rgba(13,148,136,${0.1 + intensity * 0.85})`;
    return (
      <div title={`Tooth ${n}: ${cnt} issues`} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-[9px] font-bold cursor-pointer transition-transform hover:scale-110"
        style={{ backgroundColor: bg, color: intensity > 0.5 ? '#fff' : '#475569' }}>
        {n}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Charts" value={num(s.totalCharts)} icon={Stethoscope} accent />
        <KpiCard title="Active Tooth Marks" value={num(s.totalToothRecords)} icon={Activity} />
        <KpiCard title="Pathological Patients" value={num(report.pathologicalPatients.length)} icon={AlertTriangle} />
        <KpiCard title="Recent Chart Entries" value={num(report.pagination.total)} icon={FileText} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tooth status distribution */}
        <SectionCard title="Tooth Condition Distribution">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={s.toothStatusDistribution.map(t => ({ name: t.status.replace(/_/g, ' '), value: t.count }))}
                  cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value">
                  {s.toothStatusDistribution.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-3 mt-1">
              {s.toothStatusDistribution.map((t, i) => (
                <div key={t.status} className="flex items-center gap-1 text-[10px]">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-slate-600">{t.status.replace(/_/g, ' ')}</span>
                  <span className="font-bold text-slate-800">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Pathological patients */}
        <SectionCard title="Patients with Most Pathologies">
          <div className="p-4 space-y-2">
            {report.pathologicalPatients.slice(0, 8).map((p, i) => (
              <div key={p.patientId} className="flex items-center gap-3">
                <span className={cn('w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white',
                  i === 0 ? 'bg-red-500' : i === 1 ? 'bg-orange-400' : 'bg-slate-400')}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{p.patientName}</p>
                  <p className="text-[10px] text-slate-400">{p.patientCode}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ProgressBar value={p.pathologyCount} max={report.pathologicalPatients[0]?.pathologyCount ?? 1} color="#ef4444" />
                  <span className="text-xs font-bold text-red-600 w-6 text-right">{p.pathologyCount}</span>
                </div>
              </div>
            ))}
            {report.pathologicalPatients.length === 0 && <EmptyState message="No pathological findings" />}
          </div>
        </SectionCard>
      </div>

      {/* Tooth heatmap */}
      <SectionCard title="Dental Heatmap — Pathology Distribution">
        <div className="p-5">
          <p className="text-xs text-slate-400 mb-4">Darker = more pathologies recorded. Hover a tooth for count.</p>
          <div className="flex flex-col items-center gap-1">
            <p className="text-[10px] font-semibold text-slate-400 mb-1 tracking-widest uppercase">Upper</p>
            <div className="flex gap-1">
              {upperRight.map(n => <ToothCell key={n} num={n} />)}
              <span className="w-3" />
              {upperLeft.map(n => <ToothCell key={n} num={n} />)}
            </div>
            <div className="w-full border-t border-dashed border-slate-200 my-2" />
            <div className="flex gap-1">
              {lowerRight.reverse().map(n => <ToothCell key={n} num={n} />)}
              <span className="w-3" />
              {lowerLeft.map(n => <ToothCell key={n} num={n} />)}
            </div>
            <p className="text-[10px] font-semibold text-slate-400 mt-1 tracking-widest uppercase">Lower</p>
          </div>
          <div className="flex items-center gap-2 justify-center mt-4">
            <span className="text-[10px] text-slate-400">Low</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map(op => (
              <div key={op} className="w-5 h-4 rounded" style={{ backgroundColor: `rgba(13,148,136,${op})` }} />
            ))}
            <span className="text-[10px] text-slate-400">High</span>
          </div>
        </div>
      </SectionCard>

      {/* Recent chart entries */}
      <SectionCard title={`Recent Chart Entries (${num(report.pagination.total)})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['Patient', 'Tooth', 'Type', 'Label', 'Condition Code', 'Visit', 'Date'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.recentChartEntries.map(e => (
                <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{e.patientName}</p>
                    <p className="text-slate-400">{e.patientCode}</p>
                  </td>
                  <td className="px-4 py-3">
                    {e.toothNumber
                      ? <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-lg font-bold">{e.toothNumber}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3"><Badge status={e.type} /></td>
                  <td className="px-4 py-3 font-medium text-slate-700">{e.label}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{e.conditionCode ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-teal-600">{e.visitCode ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{shortDate(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginator page={report.pagination.page} totalPages={report.pagination.totalPages} onChange={onPageChange} />
      </SectionCard>
    </div>
  );
}

// 7. Diagnosis Trends ──────────────────────────────────────────────────────────
function DiagnosisTrendsPanel({ report }: { report: DiagnosisTrendsReport }) {
  const s = report.summary;
  const top10 = report.topDiagnoses.slice(0, 10);

  // Pivot monthly trend for recharts
  const diagnoses = [...new Set(report.monthlyTrend.map(r => r.diagnosis))];
  const months = [...new Set(report.monthlyTrend.map(r => r.month))].sort();
  const trendData = months.map(m => {
    const row: any = { month: m };
    for (const dx of diagnoses) {
      const found = report.monthlyTrend.find(r => r.month === m && r.diagnosis === dx);
      row[dx] = found?.count ?? 0;
    }
    return row;
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard title="Unique Diagnoses" value={num(s.totalUniqueDiagnoses)} icon={TrendingUp} accent />
        <KpiCard title="ICD Codes Recorded" value={num(s.totalIcdCodes)} icon={FileText} />
        {s.topDiagnosis && (
          <KpiCard title={`Top: ${s.topDiagnosis.name}`} value={`${num(s.topDiagnosis.count)} cases`} icon={AlertTriangle} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Top 10 Diagnoses">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={top10} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis type="category" dataKey="diagnosis" tick={{ fontSize: 9 }} tickLine={false} width={130}
                  tickFormatter={v => v.length > 18 ? v.slice(0, 17) + '…' : v} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Cases" fill={TEAL} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Monthly Trend — Top Diagnoses">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                {diagnoses.map((dx, i) => (
                  <Line key={dx} type="monotone" dataKey={dx} stroke={PIE_COLORS[i % PIE_COLORS.length]}
                    strokeWidth={2} dot={false} name={dx.length > 18 ? dx.slice(0, 17) + '…' : dx} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ICD codes */}
        <SectionCard title="ICD-10 Code Breakdown">
          <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
            {report.icdCodeBreakdown.map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate-500 w-16 shrink-0">{c.code}</span>
                <ProgressBar value={c.count} max={report.icdCodeBreakdown[0]?.count ?? 1} />
                <span className="text-xs font-bold text-slate-700 w-8 text-right">{c.count}</span>
              </div>
            ))}
            {report.icdCodeBreakdown.length === 0 && <EmptyState message="No ICD codes recorded" />}
          </div>
        </SectionCard>

        {/* By dentist */}
        <SectionCard title="Diagnosis Activity by Dentist">
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">Dentist</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">Visits w/ Dx</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">Unique Dx</th>
                </tr>
              </thead>
              <tbody>
                {report.diagnosisByDentist.map((d, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{d.dentistName}</td>
                    <td className="px-4 py-3 text-teal-600 font-bold">{d.totalVisitsWithDx}</td>
                    <td className="px-4 py-3 text-slate-600">{d.uniqueDiagnoses}</td>
                  </tr>
                ))}
                {report.diagnosisByDentist.length === 0 && (
                  <tr><td colSpan={3}><EmptyState message="No data" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* Condition codes table */}
      {report.chartConditions.length > 0 && (
        <SectionCard title="Chart Condition Codes (Clinical Records)">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">Condition Code</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">Label</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">Count</th>
                  <th className="px-4 py-3">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {report.chartConditions.slice(0, 15).map((c, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-slate-500">{c.conditionCode ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{c.label}</td>
                    <td className="px-4 py-3 font-bold text-teal-600">{c.count}</td>
                    <td className="px-4 py-3 w-40">
                      <ProgressBar value={c.count} max={report.chartConditions[0]?.count ?? 1} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// 8. Dentist Activity ──────────────────────────────────────────────────────────
function DentistActivityPanel({ report }: { report: DentistActivityReport }) {
  const s = report.summary;
  const radarData = report.dentists.slice(0, 6).map(d => ({
    name: d.dentistName.replace('Dr. ', ''),
    visits: d.visitCompletionRate,
    sessions: d.sessionCompletionRate,
    plans: d.planCompletionRate,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Dentists" value={num(s.totalDentists)} icon={Users} accent />
        <KpiCard title="Total Visits" value={num(s.totalVisits)} icon={Calendar} />
        <KpiCard title="Total Revenue" value={formatCurrency(s.totalRevenue)} icon={DollarSign} />
        <KpiCard title="Avg Completion Rate" value={pct(s.avgCompletionRate)} icon={Target} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Revenue by Dentist">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={report.dentists}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dentistName" tick={{ fontSize: 9 }} tickLine={false}
                  tickFormatter={v => v.replace('Dr. ', '')} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false}
                  tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                <Tooltip content={<ChartTooltip currency />} />
                <Bar dataKey="totalRevenue" name="Revenue" fill={TEAL} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Completion Rates Radar">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} />
                <Radar name="Visit Completion" dataKey="visits" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
                <Radar name="Session Completion" dataKey="sessions" stroke={TEAL} fill={TEAL} fillOpacity={0.15} />
                <Radar name="Plan Completion" dataKey="plans" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Tooltip content={<ChartTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Dentist cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {report.dentists.map((d, i) => (
          <div key={d.dentistId} className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
            <div className="flex items-start gap-4 mb-4">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0',
                i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-slate-400' : 'bg-teal-500')}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800">{d.dentistName}</p>
                <p className="text-xs text-slate-400">{d.specialization ?? 'General Dentistry'}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-teal-600">{formatCurrency(d.totalRevenue)}</p>
                <p className="text-[10px] text-slate-400">Revenue</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center border-t border-slate-50 pt-4">
              <div>
                <div className="flex justify-center mb-1">
                  <Ring pct={d.visitCompletionRate} size={40} stroke={3} />
                </div>
                <p className="text-[10px] text-slate-500">Visits</p>
                <p className="text-xs font-bold text-slate-700">{d.totalVisits} total</p>
              </div>
              <div>
                <div className="flex justify-center mb-1">
                  <Ring pct={d.sessionCompletionRate} size={40} stroke={3} />
                </div>
                <p className="text-[10px] text-slate-500">Sessions</p>
                <p className="text-xs font-bold text-slate-700">{d.totalSessions} total</p>
              </div>
              <div>
                <div className="flex justify-center mb-1">
                  <Ring pct={d.planCompletionRate} size={40} stroke={3} />
                </div>
                <p className="text-[10px] text-slate-500">Plans</p>
                <p className="text-xs font-bold text-slate-700">{d.totalPlans} total</p>
              </div>
            </div>
          </div>
        ))}
        {report.dentists.length === 0 && (
          <div className="col-span-2"><EmptyState message="No dentist activity data for this period" /></div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ClinicalReportsPage() {
  const [activeType, setActiveType] = useState<ClinicalReportType>(ClinicalReportType.PATIENT_VISITS);
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
    type: activeType,
    period: filters.period,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    patientId: filters.patientId || undefined,
    dentistId: filters.dentistId || undefined,
    status: filters.status || undefined,
    page: filters.page,
    limit: 50,
  }), [activeType, filters]);

  const { data: report, isLoading, isError, refetch } = useQuery<ClinicalReport>({
    queryKey: ['clinical-report', query],
    queryFn: () => clinicalReportsApi.getReport(query),
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
      a.download = `clinical-report-${activeType}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
  };

  const activeTypeDef = REPORT_TYPES.find(r => r.id === activeType)!;

  return (
    <div className="flex flex-col gap-5 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <span>Reports</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-teal-600 font-medium">Clinical Reports</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Clinical Reports</h2>
          {/* <p className="text-sm text-slate-500 mt-0.5">Treatment intelligence, session tracking & clinical insights</p> */}
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin text-teal-500')} />
          Refresh
        </button>
      </div>

      {/* Report type selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1">
        {REPORT_TYPES.map(rt => {
          const Icon = rt.icon;
          const active = activeType === rt.id;
          return (
            <button key={rt.id}
              onClick={() => { setActiveType(rt.id); updateFilters({ page: 1 }); }}
              title={rt.desc}
              className={cn(
                'flex flex-col items-center gap-1 p-1 rounded-2xl border text-center transition-all duration-200 group',
                active
                  ? 'bg-teal-600 border-teal-500 text-white shadow-lg shadow-teal-100'
                  : 'bg-white border-slate-100 text-slate-600 hover:border-teal-200 hover:bg-teal-50/50 shadow-sm',
              )}>
              <Icon className={cn('w-5 h-5 transition-transform group-hover:scale-110', active ? 'text-white' : 'text-teal-600')} />
              <span className={cn('text-[11px] font-semibold leading-tight', active ? 'text-white' : 'text-slate-700')}>
                {rt.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active report description */}
      {/* <div className="flex items-center gap-3 px-4 py-3 bg-teal-50 border border-teal-100 rounded-xl">
        <activeTypeDef.icon className="w-4 h-4 text-teal-600 shrink-0" />
        <div>
          <span className="text-sm font-semibold text-teal-800">{activeTypeDef.label}</span>
          <span className="text-xs text-teal-600 ml-2">— {activeTypeDef.desc}</span>
        </div>
      </div> */}

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
            <X className="w-7 h-7 text-red-400" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-slate-700">Failed to load report</p>
            <p className="text-sm text-slate-400 mt-1">Check your connection and try again</p>
          </div>
          <button onClick={() => refetch()}
            className="px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && report && (
        <>
          {report.type === ClinicalReportType.PATIENT_VISITS && (
            <PatientVisitsPanel report={report as PatientVisitsReport}
              onPageChange={p => updateFilters({ page: p })} />
          )}
          {report.type === ClinicalReportType.TREATMENT_HISTORY && (
            <TreatmentHistoryPanel report={report as TreatmentHistoryReport}
              onPageChange={p => updateFilters({ page: p })} />
          )}
          {report.type === ClinicalReportType.PLAN_VS_COMPLETED && (
            <PlanVsCompletedPanel report={report as PlanVsCompletedReport} />
          )}
          {report.type === ClinicalReportType.PROCEDURE_SESSIONS && (
            <ProcedureSessionsPanel report={report as ProcedureSessionsReport}
              onPageChange={p => updateFilters({ page: p })} />
          )}
          {report.type === ClinicalReportType.PROCEDURE_OUTCOMES && (
            <ProcedureOutcomesPanel report={report as ProcedureOutcomesReport} />
          )}
          {report.type === ClinicalReportType.DENTAL_CHART_STATUS && (
            <DentalChartPanel report={report as DentalChartStatusReport}
              onPageChange={p => updateFilters({ page: p })} />
          )}
          {report.type === ClinicalReportType.DIAGNOSIS_TRENDS && (
            <DiagnosisTrendsPanel report={report as DiagnosisTrendsReport} />
          )}
          {report.type === ClinicalReportType.DENTIST_ACTIVITY && (
            <DentistActivityPanel report={report as DentistActivityReport} />
          )}
        </>
      )}
    </div>
  );
}
