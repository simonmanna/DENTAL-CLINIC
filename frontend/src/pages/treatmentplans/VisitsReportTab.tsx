// src/pages/treatmentplans/VisitsReportTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Self-contained "Visits" tab for the Treatment Reports page. Kept as its own
// component (own state / data fetch / table) so it can be developed and debugged
// in isolation from the plans/procedures/sessions tabs. Reuses the existing
// clinicalReportsApi.getPatientVisitsReport data layer (no API duplication).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  DollarSign,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../../lib/utils";
import {
  clinicalReportsApi,
  ReportPeriodClinical,
  ClinicalReportType,
  type ClinicalReportQuery,
  type PatientVisitsReport,
} from "@/lib/api/clinicalReports";

// ─── Local helpers (kept inline so the tab is self-contained) ─────────────────

const PERIODS = [
  { value: ReportPeriodClinical.TODAY, label: "Today" },
  { value: ReportPeriodClinical.THIS_WEEK, label: "This Week" },
  { value: ReportPeriodClinical.THIS_MONTH, label: "This Month" },
  { value: ReportPeriodClinical.LAST_MONTH, label: "Last Month" },
  { value: ReportPeriodClinical.LAST_3_MONTHS, label: "Last 3 Months" },
  { value: ReportPeriodClinical.LAST_6_MONTHS, label: "Last 6 Months" },
  { value: ReportPeriodClinical.THIS_YEAR, label: "This Year" },
  { value: ReportPeriodClinical.CUSTOM, label: "Custom Range" },
] as const;

const STATUS_CFG: Record<string, string> = {
  PLANNED: "bg-primary-muted/60 text-primary ring-primary/25",
  IN_PROGRESS: "bg-warning-muted/60 text-warning ring-warning/25",
  COMPLETED: "bg-success-muted/60 text-success ring-success/25",
  CANCELLED: "bg-danger-muted/60 text-danger ring-danger/25",
  ON_HOLD: "bg-muted text-muted-foreground ring-border",
  PENDING: "bg-warning-muted/60 text-warning ring-warning/25",
  ARRIVED: "bg-primary-muted/60 text-primary ring-primary/25",
};

const STATUS_OPTIONS = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "ON_HOLD",
  "PENDING",
];

function shortDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CFG[status] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function StatCard({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  accent: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-white rounded-xl border border-border px-2 py-1 flex gap-3 items-start shadow-sm">
      <div
        className="mt-0.5 size-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: accent + "18" }}
      >
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </p>
        <p className="text-xl font-bold text-foreground mt-0.5 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

// Collapsible visit row — expands to show diagnoses / procedures / sessions.
function VisitRow({ visit, navigate }: { visit: PatientVisitsReport["data"][number]; navigate: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  const hasDetail =
    visit.diagnosis.length > 0 ||
    (visit.treatmentProcedures?.length ?? 0) > 0 ||
    (visit.procedureSessions?.length ?? 0) > 0 ||
    !!visit.followUpDate;

  return (
    <>
      <tr
        className={`border-b border-border/60 ${hasDetail ? "cursor-pointer hover:bg-muted/60" : ""}`}
        onClick={() => hasDetail && setOpen((o) => !o)}
      >
        <td className="px-3 py-2.5 font-mono text-xs font-semibold text-success whitespace-nowrap">
          {visit.visitCode}
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
          {shortDate(visit.createdAt)}
        </td>
        <td className="px-3 py-2.5">
          <p className="font-medium text-foreground">{visit.patientName}</p>
          <p className="text-xs text-muted-foreground/70">{visit.patientCode}</p>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
          {visit.previousCardNumber ?? "—"}
        </td>
        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{visit.dentistName}</td>
        <td className="px-3 py-2.5 text-center tabular-nums">{visit.procedureCount}</td>
        <td className="px-3 py-2.5 text-center tabular-nums">
          <span className="font-medium text-success">{visit.completedSessionCount}</span>
          <span className="text-muted-foreground/70">/{visit.sessionCount}</span>
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={visit.status} />
        </td>
        <td className="px-3 py-2.5 tabular-nums font-medium whitespace-nowrap">
          {(visit.amountPaid ?? 0) > 0 && formatCurrency(visit.amountPaid)}
          {(visit.amountPaid ?? 0) > 0 && visit.balance > 0 && <span className="ml-1 text-[10px] text-danger">bal {formatCurrency(visit.balance)}</span>}
          {(visit.amountPaid ?? 0) === 0 && visit.balance > 0 && <span className="text-[10px] text-danger">bal {formatCurrency(visit.balance)}</span>}
        </td>
        <td className="px-3 py-2.5 text-muted-foreground/70">
          {hasDetail ? (
            open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
          ) : null}
        </td>
        <td className="px-3 py-2.5 text-right">
          <button
            type="button"
            onClick={() => navigate(`/visits/${visit.visitId}`)}
            title="View visit detail"
            className="p-1.5 rounded-lg hover:bg-primary-muted/60 text-muted-foreground/70 hover:text-primary transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
        </td>
      </tr>
      {open && hasDetail && (
        <tr>
          <td colSpan={10} className="bg-muted/50 px-5 py-3 border-b border-border/60">
            <div className="space-y-2">
              {visit.diagnosis.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground mr-2">Diagnoses:</span>
                  {visit.diagnosis.map((d, i) => (
                    <span
                      key={i}
                      className="mr-1 px-2 py-0.5 bg-primary-muted/60 text-primary rounded-full text-[10px] font-medium"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              )}

              {(visit.treatmentProcedures?.length ?? 0) > 0 && (
                <div className="pt-2 border-t border-border">
                  <span className="text-xs font-semibold text-muted-foreground mr-2">
                    Planned Procedures:
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {visit.treatmentProcedures!.map((tp, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full text-[10px] font-medium"
                      >
                        {tp.name}
                        {tp.targets?.[0]?.toothNumber != null &&
                          ` • Tooth ${tp.targets[0].toothNumber}`}
                        <span className="text-violet-400 mx-1">|</span>
                        {tp.status}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(visit.procedureSessions?.length ?? 0) > 0 && (
                <div className="pt-2 border-t border-border">
                  <span className="text-xs font-semibold text-muted-foreground mr-2">
                    Procedure Sessions:
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {visit.procedureSessions!.map((ps, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-medium"
                      >
                        {ps.sessionLabel ||
                          `${ps.treatmentProcedure?.name ?? "Session"} #${ps.sessionNumber}`}
                        {ps.surfaces?.[0] && ` • ${ps.surfaces[0]}`}
                        <span className="text-indigo-400 mx-1">|</span>
                        {ps.status}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {visit.followUpDate && (
                <p className="text-xs text-muted-foreground">
                  Follow-up:{" "}
                  <span className="font-medium text-foreground">
                    {shortDate(visit.followUpDate)}
                  </span>
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main tab component ───────────────────────────────────────────────────────

interface VisitsFilters {
  period: ReportPeriodClinical;
  startDate: string;
  endDate: string;
  dentistId: string;
  status: string;
  page: number;
}

const DEFAULT_FILTERS: VisitsFilters = {
  period: ReportPeriodClinical.THIS_MONTH,
  startDate: "",
  endDate: "",
  dentistId: "",
  status: "",
  page: 1,
};

export default function VisitsReportTab(): JSX.Element {
  const [filters, setFilters] = useState<VisitsFilters>(DEFAULT_FILTERS);
  const [exporting, setExporting] = useState(false);

  const update = useCallback((partial: Partial<VisitsFilters>) => {
    setFilters((f) => ({ ...f, ...partial }));
  }, []);

  const query: ClinicalReportQuery = useMemo(
    () => ({
      type: ClinicalReportType.PATIENT_VISITS,
      period: filters.period,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      dentistId: filters.dentistId || undefined,
      status: filters.status || undefined,
      page: filters.page,
      limit: 50,
    }),
    [filters],
  );

  const navigate = useNavigate();

  const { data: report, isLoading, isError, refetch, isFetching } =
    useQuery<PatientVisitsReport>({
      queryKey: ["report-visits-tab", query],
      queryFn: () => clinicalReportsApi.getPatientVisitsReport(query),
      staleTime: 60_000,
    });

  const { data: dentists = [] } = useQuery({
    queryKey: ["staff-dentists"],
    queryFn: clinicalReportsApi.getStaff,
    staleTime: 300_000,
  });

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await clinicalReportsApi.exportCsv(query);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `patient-visits-${new Date().toISOString().slice(0, 10)}.csv`,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* surfaced by the table's error state on the next fetch */
    } finally {
      setExporting(false);
    }
  }, [exporting, query]);

  const summary = report?.summary;
  const inputCls =
    "h-9 rounded-lg border border-border px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-success/60 bg-white";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white border border-border rounded-xl p-4 flex flex-wrap gap-3 items-end shadow-sm">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Period</label>
          <select
            value={filters.period}
            onChange={(e) =>
              update({ period: e.target.value as ReportPeriodClinical, page: 1 })
            }
            className={inputCls}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {filters.period === ReportPeriodClinical.CUSTOM && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">From</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => update({ startDate: e.target.value, page: 1 })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">To</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => update({ endDate: e.target.value, page: 1 })}
                className={inputCls}
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Doctor</label>
          <select
            value={filters.dentistId}
            onChange={(e) => update({ dentistId: e.target.value, page: 1 })}
            className={inputCls}
          >
            <option value="">All Doctors</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>
                Dr. {d.firstName} {d.lastName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
          <select
            value={filters.status}
            onChange={(e) => update({ status: e.target.value, page: 1 })}
            className={inputCls}
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-end gap-2">
          {isFetching && (
            <RefreshCw className="w-4 h-4 text-success animate-spin self-center" />
          )}
          <button
            onClick={() => update(DEFAULT_FILTERS)}
            className="h-9 px-3 rounded-lg text-sm border border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || isLoading}
            className="h-9 px-3 rounded-lg text-sm border border-success text-success hover:bg-success-muted/60 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? "⏳ Preparing…" : "⬇ Export CSV"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        {isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/70 gap-3">
            <p className="text-sm font-medium text-muted-foreground">Failed to load visits report</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-success text-white text-sm font-medium rounded-lg hover:bg-success transition-colors"
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground/70 gap-3">
            <div className="size-5 border-2 border-success border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading visits…</span>
          </div>
        ) : !report || report.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/70">
            <span className="text-3xl mb-2">📋</span>
            <p className="text-sm font-medium">No visits found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {[
                      "Visit",
                      "Date",
                      "Patient",
                      "Prev Card",
                      "Doctor",
                      "Procs",
                      "Sessions",
                      "Status",
                      "",
                      "View",
                    ].map((h, i) => (
                      <th
                        key={i}
                        className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.data.map((v) => (
                    <VisitRow key={v.visitId} visit={v} navigate={navigate} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {report.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/60 text-xs text-muted-foreground">
                <span>
                  Page {report.pagination.page} of {report.pagination.totalPages} ·{" "}
                  {report.pagination.total.toLocaleString()} visits
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={filters.page <= 1}
                    onClick={() => update({ page: filters.page - 1 })}
                    className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted/50 transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    disabled={filters.page >= report.pagination.totalPages}
                    onClick={() => update({ page: filters.page + 1 })}
                    className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted/50 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
