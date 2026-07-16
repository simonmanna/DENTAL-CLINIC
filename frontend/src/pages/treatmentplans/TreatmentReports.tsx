import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// ─── API ─────────────────────────────────────────────────────────────────────
import { treatmentPlansApi } from "@/lib/api/treatment-plans";
import { staffApi } from "@/lib/api/staff-api";

// ─── Tabs that own their own data/state (kept modular for easy debugging) ──────
import VisitsReportTab from "./VisitsReportTab";
import PrescriptionsReportTab from "./PrescriptionsReportTab";
import AppointmentsReportTab from "./AppointmentsReportTab";
import ConditionsReportTab from "./ConditionsReportTab";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
  phone?: string;
  previousCardNumber?: string;
}

interface Dentist {
  id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
}

interface Provider {
  id: string;
  firstName: string;
  lastName: string;
}

interface Procedure {
  id: string;
  name: string;
  code: string;
  category?: { id: string; name: string; color?: string };
}

interface Plan {
  id: string;
  planCode: string;
  title: string;
  patient?: Patient;
  dentist?: Dentist;
}

interface PlanRow {
  id: string;
  planCode: string;
  title: string;
  patient?: Patient;
  dentist?: Dentist;
  status: string;
  priority?: string;
  totalProcedures: number;
  completedProcedures: number;
  completionPercent: number;
  // Plan-level totals are always in base currency (UGX). The backend
  // converts mixed-currency procedures to baseAmount on add, so this is
  // safe to sum and display directly.
  totalCost: number;
  amountPaid: number;
  outstanding: number;
  currency?: string; // 'UGX' on the wire today; future-proof for re-base
  createdAt: string;
}

interface ProcedureRow {
  id: string;
  procedure?: Procedure;
  patient?: Patient;
  dentist?: Dentist;
  provider?: Provider;
  plan?: Plan;
  status: string;
  billingType?: string;
  sessionType?: string;
  sessionCount?: number;
  completedSessions: number;
  totalSessions: number;
  toothNumbers?: (number | null)[];
  surfaces?: string[];
  // Procedure rows can be in either USD or UGX; display in the row's
  // own currency, and use baseAmount / aggregates for the totals card.
  totalPrice: number;
  amountPaid: number;
  currency?: string;
  baseAmount?: number | null;
  baseCurrency?: string;
  exchangeRate?: number | null;
  performedDate?: string | null;
  createdAt: string;
}

interface SessionRow {
  id: string;
  sessionNumber: number;
  sessionLabel?: string;
  status: string;
  isFinal?: boolean;
  phase?: string;
  outcome?: string;
  procedure?: Procedure;
  plan?: Plan;
  patient?: Patient;
  dentist?: Dentist;
  provider?: Provider;
  toothNumbers?: (number | null)[];
  surfaces?: string[];
  performedDate?: string | null;
  performedNotes?: string;
  // Sessions inherit currency from their parent procedure.
  sessionPrice: number;
  currency?: string;
  sessionPriceBase?: number;
  baseCurrency?: string;
  ledgerStatus?: string;
  createdAt: string;
}

type Row = PlanRow | ProcedureRow | SessionRow;

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SummaryData {
  [key: string]: number | string | undefined;
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
}

interface ApiResponse {
  data: Row[];
  pagination: PaginationInfo;
  summary: SummaryData;
}

// ✅ ADDED: Missing types for API calls
interface ReportFilters {
  search?: string;
  startDate?: string;
  endDate?: string;
  dentistId?: string;
  patientId?: string;
  status?: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

interface ReportResponse<T = any> {
  data: T[];
  pagination: PaginationInfo;
  summary: SummaryData;
}

interface ChartDatum {
  name: string;
  value: number;
}

interface ColumnDef<T = Row> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  csv?: (row: T) => string | number;
}

interface StatKeyConfig {
  label: string;
  key: string;
  icon: string;
  accent: string;
  fmt?: (v: number) => string;
}

interface TabConfig {
  id: "plans" | "procedures" | "sessions";
  label: string;
  icon: string;
  endpoint: string;
  columns: ColumnDef<any>[];
  statusOptions: string[];
  filename: string;
  statKeys: StatKeyConfig[];
  chartDataFn: (summary: SummaryData) => ChartDatum[];
  chartTitle: string;
}

type SortOrder = "asc" | "desc";

interface FilterState {
  search: string;
  startDate: string;
  endDate: string;
  dentistId: string;
  patientId: string;
  status: string;
  limit: number;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

// fmtCurrency now renders in the row's own currency. Pass either a string
// ("USD" / "UGX") OR a row object with a `currency` field. Aggregates (the
// stat cards at the top) pass nothing and get the base currency (UGX),
// which is what the backend summary now uses — `baseAmount`-derived totals
// are always UGX-equivalent, so summing across USD + UGX rows is safe.
const fmtCurrency = (
  v?: number | string | null,
  currencyOrCtx?: string | { currency?: string | null } | null,
): string => {
  let currency = "UGX";
  if (typeof currencyOrCtx === "string" && currencyOrCtx) {
    currency = currencyOrCtx;
  } else if (
    currencyOrCtx &&
    typeof currencyOrCtx === "object" &&
    typeof currencyOrCtx.currency === "string" &&
    currencyOrCtx.currency
  ) {
    currency = currencyOrCtx.currency;
  }
  const n = Number(v ?? 0);
  if (currency === "USD") {
    return `USD ${n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${currency} ${Math.round(n).toLocaleString("en-UG")}`;
};

const fmtDate = (d?: string | null): string =>
  d ? new Date(d).toLocaleDateString("en-GB") : "—";

const fmtPct = (v?: number | null): string => `${v ?? 0}%`;

const fullName = (p?: Patient | Dentist | Provider | null): string =>
  p ? `${p.firstName} ${p.lastName}` : "—";

const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function exportCSV(filename: string, columns: ColumnDef<any>[], rows: Row[]) {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((row) =>
    columns
      .map((c) => {
        const val = c.csv ? c.csv(row) : "";
        return `"${String(val ?? "").replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  const blob = new Blob([[header, ...body].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  PLANNED: {
    cls: "bg-sky-50 text-sky-700 ring-sky-200",
    label: "Planned",
  },
  IN_PROGRESS: {
    cls: "bg-amber-50 text-amber-700 ring-amber-200",
    label: "In Progress",
  },
  COMPLETED: {
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    label: "Completed",
  },
  ON_HOLD: {
    cls: "bg-slate-100 text-slate-600 ring-slate-200",
    label: "On Hold",
  },
  CANCELLED: {
    cls: "bg-red-50 text-red-600 ring-red-200",
    label: "Cancelled",
  },
  PENDING: {
    cls: "bg-orange-50 text-orange-700 ring-orange-200",
    label: "Pending",
  },
  VOIDED: {
    cls: "bg-red-50 text-red-500 ring-red-100",
    label: "Voided",
  },
  SKIPPED: {
    cls: "bg-slate-50 text-slate-500 ring-slate-100",
    label: "Skipped",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? {
    cls: "bg-gray-100 text-gray-600 ring-gray-200",
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent = "#0ea5e9",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
  icon?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-1 flex gap-3 items-start shadow-sm">
      {icon && (
        <div
          className="mt-0.5 size-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: accent + "18" }}
        >
          <span style={{ color: accent }} className="text-base">
            {icon}
          </span>
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">
          {label}
        </p>
        <p className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
          {value}
        </p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({
  col,
  sortBy,
  sortOrder,
}: {
  col: string;
  sortBy: string;
  sortOrder: SortOrder;
}) {
  if (sortBy !== col) return <span className="ml-1 text-slate-300">↕</span>;
  return (
    <span className="ml-1 text-emerald-600">
      {sortOrder === "asc" ? "↑" : "↓"}
    </span>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between px-1 py-3">
      <p className="text-sm text-slate-500">
        Showing{" "}
        <span className="font-medium">{(page - 1) * limit + 1}</span>–
        <span className="font-medium">{Math.min(page * limit, total)}</span>{" "}
        of <span className="font-medium">{total}</span>
      </p>
      <div className="flex gap-1">
        <button
          onClick={() => onPage(1)}
          disabled={page === 1}
          className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          «
        </button>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          ‹
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`px-2.5 py-1 text-xs rounded border ${p === page
              ? "bg-emerald-600 border-emerald-600 text-white font-medium"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          ›
        </button>
        <button
          onClick={() => onPage(totalPages)}
          disabled={page === totalPages}
          className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          »
        </button>
      </div>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  setFilters,
  statusOptions,
  dentists,
  onReset,
}: {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  statusOptions: string[];
  dentists: Dentist[];
  onReset: () => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2 flex flex-wrap gap-3 items-end shadow-sm">
      <div className="flex-1 min-w-48">
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Search
        </label>
        <input
          value={filters.search}
          onChange={(e) =>
            setFilters((f) => ({ ...f, search: e.target.value }))
          }
          placeholder="Patient, plan code, procedure…"
          className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          From
        </label>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) =>
            setFilters((f) => ({ ...f, startDate: e.target.value }))
          }
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          To
        </label>
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) =>
            setFilters((f) => ({ ...f, endDate: e.target.value }))
          }
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Status
        </label>
        <select
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value }))
          }
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {STATUS_CFG[s]?.label ?? s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Doctor
        </label>
        <select
          value={filters.dentistId}
          onChange={(e) =>
            setFilters((f) => ({ ...f, dentistId: e.target.value }))
          }
          className="h-9 w-48 rounded-lg border border-slate-200 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          disabled={dentists.length === 0}
        >
          <option value="">
            {dentists.length === 0 ? "Loading dentists…" : "All dentists"}
          </option>
          {dentists.map((d) => (
            <option key={d.id} value={d.id}>
              Dr. {d.firstName} {d.lastName}
              {d.specialization ? ` — ${d.specialization}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Rows
        </label>
        <select
          value={filters.limit}
          onChange={(e) =>
            setFilters((f) => ({ ...f, limit: parseInt(e.target.value) }))
          }
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={onReset}
        className="h-9 px-3 rounded-lg text-sm border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
      >
        Reset
      </button>
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function DataTable<T extends { id?: string }>({
  columns,
  rows,
  sortBy,
  sortOrder,
  onSort,
  loading,
}: {
  columns: ColumnDef<T>[];
  rows: T[];
  sortBy: string;
  sortOrder: SortOrder;
  onSort: (col: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <div className="flex items-center gap-3">
          <div className="size-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading report…</span>
        </div>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400">
        <span className="text-3xl mb-2">📋</span>
        <p className="text-sm font-medium">No records found</p>
        <p className="text-xs mt-1">Try adjusting your filters</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => col.sortable !== false && onSort(col.key)}
                className={`px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap ${col.sortable !== false
                  ? "cursor-pointer hover:text-slate-900 select-none"
                  : ""
                  }`}
              >
                {col.label}
                {col.sortable !== false && (
                  <SortIcon col={col.key} sortBy={sortBy} sortOrder={sortOrder} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              className="hover:bg-slate-50/60 transition-colors"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="px-3 py-2.5 text-slate-700 whitespace-nowrap"
                >
                  {col.render(row as any)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Mini donut chart ─────────────────────────────────────────────────────────

const CHART_COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#6b7280", "#ef4444"];

function SummaryChart({
  data,
  title,
}: {
  data: ChartDatum[];
  title: string;
}) {
  if (!data?.length) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={70}
            paddingAngle={2}
          >
            {data.map((_, idx) => (
              <Cell
                key={idx}
                fill={CHART_COLORS[idx % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => [v, ""]} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLUMN DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const PLAN_COLUMNS: ColumnDef<PlanRow>[] = [
  {
    key: "patient",
    label: "Patient",
    sortable: false,
    render: (r) => (
      <div>
        <p className="font-medium text-slate-900">{fullName(r.patient)}</p>
        <p className="text-xs text-slate-400">{r.patient?.patientCode}</p>
      </div>
    ),
    csv: (r) => `${fullName(r.patient)} (${r.patient?.patientCode ?? ""})`,
  },
  {
    key: "prevCard",
    label: "Prev Card",
    sortable: false,
    render: (r) => (
      <span className="text-xs font-mono text-slate-500">
        {r.patient?.previousCardNumber ?? "—"}
      </span>
    ),
    csv: (r) => r.patient?.previousCardNumber ?? "",
  },
  {
    key: "planCode",
    label: "Plan Code",
    render: (r) => (
      <span className="font-mono text-xs text-slate-500">{r.planCode}</span>
    ),
  },
  {
    key: "title",
    label: "Title",
    render: (r) => (
      <span className="font-medium text-slate-900 max-w-[180px] block truncate">
        {r.title}
      </span>
    ),
  },
  {
    key: "dentist",
    label: "Doctor",
    sortable: false,
    render: (r) => fullName(r.dentist),
    csv: (r) => fullName(r.dentist),
  },
  {
    key: "status",
    label: "Status",
    render: (r) => <StatusBadge status={r.status} />,
    csv: (r) => r.status,
  },
  {
    key: "totalProcedures",
    label: "Procs",
    sortable: false, // computed (procedure counts) — backend has no orderBy for it
    render: (r) => (
      <span className="tabular-nums">
        <span className="font-medium text-emerald-700">
          {r.completedProcedures}
        </span>
        <span className="text-slate-400">/{r.totalProcedures}</span>
      </span>
    ),
    csv: (r) => `${r.completedProcedures}/${r.totalProcedures}`,
  },
  {
    key: "completionPercent",
    label: "Done %",
    sortable: false, // computed (completed/total) — not a sortable DB column
    render: (r) => (
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${r.completionPercent}%` }}
          />
        </div>
        <span className="text-xs tabular-nums">
          {fmtPct(r.completionPercent)}
        </span>
      </div>
    ),
    csv: (r) => fmtPct(r.completionPercent),
  },
  {
    key: "totalCost",
    label: "Total Price",
    sortable: false, // plan total is summed from procedure baseAmounts, not a DB column
    render: (r) => (
      <span className="tabular-nums font-medium">
        {fmtCurrency(r.totalCost)}
      </span>
    ),
    csv: (r) => r.totalCost,
  },
  {
    key: "createdAt",
    label: "Created",
    render: (r) => (
      <span className="text-xs text-slate-500">{fmtDate(r.createdAt)}</span>
    ),
    csv: (r) => fmtDate(r.createdAt),
  },
];

const PROCEDURE_COLUMNS: ColumnDef<ProcedureRow>[] = [
  {
    key: "procedure",
    label: "Procedure",
    sortable: false,
    render: (r) => (
      <div>
        <p className="font-medium text-slate-900">{r.procedure?.name}</p>
        <p className="text-xs text-slate-400">
          {r.procedure?.code} ·{" "}
          <span className="text-slate-500">
            {r.procedure?.category?.name}
          </span>
        </p>
      </div>
    ),
    csv: (r) => `${r.procedure?.name} (${r.procedure?.code})`,
  },
  {
    key: "patient",
    label: "Patient",
    sortable: false,
    render: (r) => (
      <div>
        <p className="font-medium text-slate-900">{fullName(r.patient)}</p>
        <p className="text-xs text-slate-400">{r.patient?.patientCode}</p>
      </div>
    ),
    csv: (r) => `${fullName(r.patient)} (${r.patient?.patientCode ?? ""})`,
  },
  {
    key: "prevCard",
    label: "Prev Card",
    sortable: false,
    render: (r) => (
      <span className="text-xs font-mono text-slate-500">
        {r.patient?.previousCardNumber ?? "—"}
      </span>
    ),
    csv: (r) => r.patient?.previousCardNumber ?? "",
  },
  {
    key: "dentist",
    label: "Doctor",
    sortable: false,
    render: (r) => fullName(r.dentist),
    csv: (r) => fullName(r.dentist),
  },
  {
    key: "status",
    label: "Status",
    render: (r) => <StatusBadge status={r.status} />,
    csv: (r) => r.status,
  },
  {
    key: "planCode",
    label: "Plan",
    sortable: false,
    render: (r) => (
      <span className="font-mono text-xs text-slate-500">
        {r.plan?.planCode}
      </span>
    ),
    csv: (r) => r.plan?.planCode ?? "",
  },
  {
    key: "toothNumbers",
    label: "Teeth",
    sortable: false,
    render: (r) => (
      <div className="flex gap-1 flex-wrap max-w-[100px]">
        {(r.toothNumbers ?? [])
          .filter((t): t is number => t !== null && t !== undefined)
          .map((t) => (
            <span
              key={t}
              className="inline-block px-1.5 py-0.5 text-xs rounded bg-slate-100 font-mono text-slate-600"
            >
              {t}
            </span>
          ))}
        {!r.toothNumbers?.length && (
          <span className="text-slate-300">—</span>
        )}
      </div>
    ),
    csv: (r) => (r.toothNumbers ?? []).filter(Boolean).join(", ") || "—",
  },
  {
    key: "billingType",
    label: "Billing",
    sortable: false, // not in the backend SAFE_PROC_SORT allow-list
    render: (r) => (
      <span
        className={`text-xs font-medium ${r.billingType === "PAY_PARTIALLY"
          ? "text-purple-600"
          : "text-emerald-600"
          }`}
      >
        {r.billingType === "PAY_PARTIALLY" ? "Partial" : "Pay Full"}
      </span>
    ),
    csv: (r) => r.billingType ?? "",
  },
  {
    key: "sessions",
    label: "Sessions",
    sortable: false,
    render: (r) => (
      <span className="tabular-nums text-xs">
        <span className="font-medium">{r.completedSessions}</span>/
        {r.totalSessions}
      </span>
    ),
    csv: (r) => `${r.completedSessions}/${r.totalSessions}`,
  },
  {
    key: "totalPrice",
    label: "Price",
    render: (r) => (
      <span className="tabular-nums font-medium">
        {fmtCurrency(r.totalPrice, r.currency)}
        {/* Show UGX-equivalent next to USD prices so the column scans
            consistently across mixed-currency rows. */}
        {r.currency && r.currency !== "UGX" && r.baseAmount != null && (
          <span className="ml-1 text-[10px] text-slate-400">
            ≈ {fmtCurrency(r.baseAmount, r.baseCurrency ?? "UGX")}
          </span>
        )}
      </span>
    ),
    csv: (r) => `${r.currency ?? "UGX"} ${r.totalPrice}`,
  },
  {
    key: "performedDate",
    label: "Performed",
    render: (r) => (
      <span className="text-xs text-slate-500">{fmtDate(r.performedDate)}</span>
    ),
    csv: (r) => fmtDate(r.performedDate),
  },
  {
    key: "createdAt",
    label: "Added",
    render: (r) => (
      <span className="text-xs text-slate-500">{fmtDate(r.createdAt)}</span>
    ),
    csv: (r) => fmtDate(r.createdAt),
  },
];

const SESSION_COLUMNS: ColumnDef<SessionRow>[] = [
  {
    key: "sessionLabel",
    label: "Session",
    sortable: false,
    render: (r) => (
      <div>
        <p className="font-medium text-slate-900">
          {r.sessionLabel ?? `Session ${r.sessionNumber}`}
        </p>
        <div className="flex gap-1 mt-0.5">
          {r.isFinal && (
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
              Final
            </span>
          )}
          {r.phase && (
            <span className="text-xs text-slate-400">{r.phase}</span>
          )}
        </div>
      </div>
    ),
    csv: (r) => r.sessionLabel ?? `Session ${r.sessionNumber}`,
  },
  {
    key: "patient",
    label: "Patient",
    sortable: false,
    render: (r) => (
      <div>
        <p className="font-medium text-slate-900">{fullName(r.patient)}</p>
        <p className="text-xs text-slate-400">{r.patient?.patientCode}</p>
      </div>
    ),
    csv: (r) => `${fullName(r.patient)} (${r.patient?.patientCode ?? ""})`,
  },
  {
    key: "prevCard",
    label: "Prev Card",
    sortable: false,
    render: (r) => (
      <span className="text-xs font-mono text-slate-500">
        {r.patient?.previousCardNumber ?? "—"}
      </span>
    ),
    csv: (r) => r.patient?.previousCardNumber ?? "",
  },
  {
    key: "procedure",
    label: "Procedure",
    sortable: false,
    render: (r) => (
      <div>
        <p className="font-medium text-slate-800">{r.procedure?.name}</p>
        <p className="text-xs text-slate-400">{r.procedure?.code}</p>
      </div>
    ),
    csv: (r) => `${r.procedure?.name} (${r.procedure?.code})`,
  },
  {
    key: "provider",
    label: "Provider",
    sortable: false,
    render: (r) => (
      <span className="text-sm">{fullName(r.provider ?? r.dentist)}</span>
    ),
    csv: (r) => fullName(r.provider ?? r.dentist),
  },
  {
    key: "status",
    label: "Status",
    render: (r) => <StatusBadge status={r.status} />,
    csv: (r) => r.status,
  },
  {
    key: "toothNumbers",
    label: "Teeth",
    sortable: false,
    render: (r) => (
      <div className="flex gap-1 flex-wrap">
        {(r.toothNumbers ?? [])
          .filter((t): t is number => t !== null && t !== undefined)
          .map((t) => (
            <span
              key={t}
              className="inline-block px-1.5 py-0.5 text-xs rounded bg-slate-100 font-mono text-slate-600"
            >
              {t}
            </span>
          ))}
        {!r.toothNumbers?.length && (
          <span className="text-slate-300">—</span>
        )}
      </div>
    ),
    csv: (r) => (r.toothNumbers ?? []).filter(Boolean).join(", ") || "—",
  },
  {
    key: "outcome",
    label: "Outcome",
    sortable: false,
    render: (r) =>
      r.outcome ? (
        <span
          className={`text-xs font-medium ${r.outcome === "COMPLETED" ? "text-emerald-600" : "text-amber-600"
            }`}
        >
          {r.outcome}
        </span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
    csv: (r) => r.outcome ?? "—",
  },
  {
    key: "performedDate",
    label: "Performed",
    render: (r) => (
      <span className="text-xs text-slate-500">{fmtDate(r.performedDate)}</span>
    ),
    csv: (r) => fmtDate(r.performedDate),
  },
];

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: TabConfig[] = [
  {
    id: "plans",
    label: "Treatment Plans Report",
    icon: "🗂",
    endpoint: "plans",
    columns: PLAN_COLUMNS,
    statusOptions: ["PLANNED", "IN_PROGRESS", "COMPLETED", "ON_HOLD", "CANCELLED"],
    filename: "treatment-plans-report",
    statKeys: [
      { label: "Total Plans", key: "total", icon: "🗂", accent: "#3b82f6" },
      { label: "In Progress", key: "totalInProgress", icon: "⚡", accent: "#f59e0b" },
      { label: "Completed", key: "totalCompleted", icon: "✅", accent: "#10b981" },
      // Aggregate stays in base currency — fmtCurrency() with no second
      // arg defaults to UGX, which matches what the backend sums.
      { label: "Total Value (UGX-eq)", key: "totalCost", icon: "💰", accent: "#8b5cf6", fmt: (v) => fmtCurrency(v) },
    ],
    // ✅ FIXED: ensure values are numbers
    chartDataFn: (s) =>
      [
        { name: "Planned", value: Number(s.totalPlanned ?? 0) },
        { name: "In Progress", value: Number(s.totalInProgress ?? 0) },
        { name: "Completed", value: Number(s.totalCompleted ?? 0) },
        { name: "On Hold", value: Number(s.totalOnHold ?? 0) },
        { name: "Cancelled", value: Number(s.totalCancelled ?? 0) },
      ].filter((d) => d.value > 0),
    chartTitle: "Plans by Status",
  },
  {
    id: "procedures",
    label: "Treatment Procedures Report",
    icon: "🦷",
    endpoint: "procedures",
    columns: PROCEDURE_COLUMNS,
    statusOptions: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
    filename: "procedures-report",
    statKeys: [
      { label: "Total Procedures", key: "total", icon: "🦷", accent: "#3b82f6" },
      { label: "Completed", key: "totalCompleted", icon: "✅", accent: "#10b981" },
      { label: "In Progress", key: "totalInProgress", icon: "⚡", accent: "#f59e0b" },
      // Sums are reported in UGX-equivalent — the backend uses each row's
      // `baseAmount` (and `amountPaid * exchangeRate`) so mixed-currency
      // procedures reconcile correctly.
      { label: "Revenue (UGX-Eq)", key: "totalRevenue", icon: "💰", accent: "#8b5cf6", fmt: (v) => fmtCurrency(v) },
    ],
    chartDataFn: (s) =>
      [
        { name: "Planned", value: Number(s.totalPlanned ?? 0) },
        { name: "In Progress", value: Number(s.totalInProgress ?? 0) },
        { name: "Completed", value: Number(s.totalCompleted ?? 0) },
        { name: "Cancelled", value: Number(s.totalCancelled ?? 0) },
      ].filter((d) => d.value > 0),
    chartTitle: "Procedures by Status",
  },
  {
    id: "sessions",
    label: "Procedure Execution Report",
    icon: "📋",
    endpoint: "sessions",
    columns: SESSION_COLUMNS,
    statusOptions: ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
    filename: "sessions-report",
    statKeys: [
      { label: "Total Sessions", key: "total", icon: "📋", accent: "#3b82f6" },
      { label: "Completed", key: "totalCompleted", icon: "✅", accent: "#10b981" },
      { label: "Final Sessions", key: "totalFinal", icon: "🏁", accent: "#8b5cf6" },
      { label: "Cancelled", key: "totalCancelled", icon: "❌", accent: "#ef4444" },
    ],
    chartDataFn: (s) =>
      [
        { name: "Completed", value: Number(s.totalCompleted ?? 0) },
        { name: "Pending", value: Number(s.totalPending ?? 0) },
        { name: "In Progress", value: Number(s.totalInProgress ?? 0) },
        { name: "Cancelled", value: Number(s.totalCancelled ?? 0) },
      ].filter((d) => d.value > 0),
    chartTitle: "Sessions by Status",
  },
];

const DEFAULT_FILTERS: FilterState = {
  search: "",
  startDate: "",
  endDate: "",
  dentistId: "",
  patientId: "",
  status: "",
  limit: 20,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function TreatmentReports(): JSX.Element {
  const [activeTab, setActiveTab] = useState<"plans" | "procedures" | "sessions" | "visits" | "prescriptions" | "appointments" | "conditions">("plans");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [result, setResult] = useState<ApiResponse>({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    summary: {},
  });
  const [page, setPage] = useState<number>(1);
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showChart, setShowChart] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [dentists, setDentists] = useState<Dentist[]>([]);

  // Load the dentist list once on mount so the Doctor dropdown is populated.
  // Errors are swallowed (the dropdown simply shows "All dentists") — a missing
  // staff list should never block report viewing.
  useEffect(() => {
    staffApi
      .getDentists()
      .then((list) => setDentists(Array.isArray(list) ? list : []))
      .catch(() => setDentists([]));
  }, []);

  // "visits" and "prescriptions" have no TABS entry (self-contained components),
  // so fall back to TABS[0] to keep `tab` defined — those branches never render
  // the TABS-driven body anyway.
  const isVisits = activeTab === "visits";
  const isPrescriptions = activeTab === "prescriptions";
  const isAppointments = activeTab === "appointments";
  const isConditions = activeTab === "conditions";
  const isSelfContained = isVisits || isPrescriptions || isAppointments || isConditions;
  const tab = useMemo<TabConfig>(
    () => TABS.find((t) => t.id === activeTab) ?? TABS[0],
    [activeTab]
  );

  // ── Fetch real data ────────────────────────────────────────────────────────
  const fetchReport = useCallback(async () => {
    if (isSelfContained) return; // self-contained tabs own their own data fetch
    const filtersForApi: ReportFilters = {
      search: filters.search || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      dentistId: filters.dentistId || undefined,
      patientId: filters.patientId || undefined,
      status: filters.status || undefined,
      page,
      limit: filters.limit,
      sortBy,
      sortOrder,
    };

    setLoading(true);
    setError(null);

    try {
      let response: ReportResponse<any>;

      switch (tab.endpoint) {
        case 'plans':
          response = await treatmentPlansApi.getTreatmentPlansReport(filtersForApi);
          break;
        case 'procedures':
          response = await treatmentPlansApi.getProceduresReport(filtersForApi);
          break;
        case 'sessions':
          response = await treatmentPlansApi.getSessionsReport(filtersForApi);
          break;
        default:
          throw new Error(`Unknown endpoint: ${tab.endpoint}`);
      }

      setResult(response);
    } catch (err) {
      console.error('Report fetch failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load report data');
      setResult({
        data: [],
        pagination: { page: 1, limit: filters.limit, total: 0, totalPages: 1 },
        summary: {},
      });
    } finally {
      setLoading(false);
    }
  }, [tab, filters, page, sortBy, sortOrder, activeTab]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Reset page when filters or tab changes
  useEffect(() => {
    setPage(1);
  }, [filters, activeTab]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSort = useCallback(
    (col: string) => {
      if (sortBy === col) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      else {
        setSortBy(col);
        setSortOrder("desc");
      }
      setPage(1);
    },
    [sortBy]
  );

  const handleTabChange = (id: "plans" | "procedures" | "sessions" | "visits" | "prescriptions" | "appointments" | "conditions") => {
    setActiveTab(id);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
    setSortBy("createdAt");
    setSortOrder("desc");
    setError(null);
  };

  // Fetch the ENTIRE filtered dataset (every page) for export/print. The on-
  // screen table is paginated, but an exported report must contain ALL matching
  // rows — not just the visible page. The backend caps `limit` at 100, so we
  // page through until we've gathered every row.
  const fetchAllRows = useCallback(async (): Promise<Row[]> => {
    const baseFilters: ReportFilters = {
      search: filters.search || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      dentistId: filters.dentistId || undefined,
      patientId: filters.patientId || undefined,
      status: filters.status || undefined,
      page: 1,
      limit: 100,
      sortBy,
      sortOrder,
    };
    const call = (f: ReportFilters): Promise<ReportResponse<any>> => {
      switch (tab.endpoint) {
        case "plans":
          return treatmentPlansApi.getTreatmentPlansReport(f);
        case "procedures":
          return treatmentPlansApi.getProceduresReport(f);
        case "sessions":
          return treatmentPlansApi.getSessionsReport(f);
        default:
          throw new Error(`Unknown endpoint: ${tab.endpoint}`);
      }
    };
    const first = await call(baseFilters);
    const all: Row[] = [...first.data];
    const totalPages = first.pagination.totalPages || 1;
    for (let p = 2; p <= totalPages; p++) {
      const next = await call({ ...baseFilters, page: p });
      all.push(...next.data);
    }
    return all;
  }, [tab, filters, sortBy, sortOrder]);

  const handleExportCSV = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const all = await fetchAllRows();
      exportCSV(
        `${tab.filename}-${new Date().toISOString().slice(0, 10)}.csv`,
        tab.columns,
        all
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [exporting, fetchAllRows, tab]);

  const handlePrint = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const all = await fetchAllRows();
      const statsHtml = tab.statKeys
        .map((s) => {
          const v = (result.summary[s.key] as number) ?? 0;
          const display = s.fmt ? s.fmt(v) : String(v);
          return `<div class="stat"><div class="stat-label">${escapeHtml(
            s.label
          )}</div><div class="stat-value">${escapeHtml(display)}</div></div>`;
        })
        .join("");
      const tableHtml = `<table><thead><tr>${tab.columns
        .map((c) => `<th>${escapeHtml(c.label)}</th>`)
        .join("")}</tr></thead><tbody>${all
        .map(
          (row) =>
            `<tr>${tab.columns
              .map(
                (c) =>
                  `<td>${escapeHtml(String(c.csv ? c.csv(row as any) : ""))}</td>`
              )
              .join("")}</tr>`
        )
        .join("")}</tbody></table>`;
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(`
        <html><head><title>${escapeHtml(tab.label)} Report</title>
        <style>
          body { font-family: system-ui, sans-serif; font-size: 12px; color: #1e293b; }
          h1 { font-size: 16px; margin-bottom: 4px; }
          p.sub { color: #64748b; font-size: 11px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f8fafc; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0; }
          td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
          tr:nth-child(even) td { background: #f8fafc; }
          .stats { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
          .stat { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
          .stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; }
          .stat-value { font-size: 14px; font-weight: 700; color: #0f172a; }
        </style>
        </head><body>
          <h1>${escapeHtml(tab.label)} Report</h1>
          <p class="sub">Generated ${escapeHtml(
            new Date().toLocaleString("en-GB")
          )} · ${all.length} record(s)</p>
          <div class="stats">${statsHtml}</div>
          ${tableHtml}
        </body></html>
      `);
      w.document.close();
      w.focus();
      w.print();
      w.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setExporting(false);
    }
  }, [exporting, fetchAllRows, tab, result.summary]);

  const summary = result.summary ?? {};
  const chartData = tab.chartDataFn?.(summary) ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-2 py-1">
        <div className="max-w-screen-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Medical Reports
              </h1>
            </div>
            {/* The plans/procedures/sessions tabs share these export/print/chart
                controls. The Visits/Prescriptions tabs are self-contained and
                carry their own export, so they are hidden here. */}
            {!isSelfContained && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowChart((v) => !v)}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
                >
                  {showChart ? "🙈 Hide Chart" : "📊 Show Chart"}
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={exporting || loading}
                  className="px-3 py-2 text-sm rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? "⏳ Preparing…" : "⬇ Export CSV"}
                </button>
                <button
                  onClick={handlePrint}
                  disabled={exporting || loading}
                  className="px-3 py-2 text-sm rounded-lg bg-slate-800 text-white hover:bg-slate-700 flex items-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? "⏳ Preparing…" : "🖨 Print"}
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0 mt-1 -mb-px">
                        {/* Visits — rendered by the self-contained VisitsReportTab */}
            <button
              key="visits"
              onClick={() => handleTabChange("visits")}
              className={`flex items-center gap-2 px-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "visits"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
            >
              <span>📅</span>
              Visits Report
            </button>
            {/* Prescriptions — rendered by the self-contained PrescriptionsReportTab */}
            <button
              key="prescriptions"
              onClick={() => handleTabChange("prescriptions")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "prescriptions"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
            >
              <span>💊</span>
              Prescriptions Report
            </button>
            {/* Appointments — rendered by the self-contained AppointmentsReportTab */}
            <button
              key="appointments"
              onClick={() => handleTabChange("appointments")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "appointments"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
            >
              <span>📆</span>
              Appointments Report
            </button>
            {/* Conditions — rendered by the self-contained ConditionsReportTab */}
            <button
              key="conditions"
              onClick={() => handleTabChange("conditions")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "conditions"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
            >
              <span>🔍</span>
              Diagnoses Report
            </button>

            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
              >
                {t.label}
                {result.pagination.total > 0 && activeTab === t.id && (
                  <span className="bg-emerald-100 text-emerald-700 text-xs rounded-full px-0.5 py-0.5 font-semibold tabular-nums">
                    {result.pagination.total}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-1 py-2 space-y-1">
        {isVisits ? (
          <VisitsReportTab />
        ) : isPrescriptions ? (
          <PrescriptionsReportTab />
        ) : isAppointments ? (
          <AppointmentsReportTab />
        ) : isConditions ? (
          <ConditionsReportTab />
        ) : (
        <>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Filters */}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          statusOptions={tab.statusOptions}
          dentists={dentists}
          onReset={() => {
            setFilters(DEFAULT_FILTERS);
            setPage(1);
          }}
        />

        {/* Stats + Chart row */}
        <div
          className={`grid gap-4 ${showChart && chartData.length
            ? "grid-cols-[1fr_220px]"
            : "grid-cols-1"
            }`}
        >
          <div
            className={`grid gap-4 ${tab.statKeys.length >= 6
              ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-4"
              : "grid-cols-2 sm:grid-cols-4"
              }`}
          >
            {tab.statKeys.map((s) => (
              <StatCard
                key={s.key}
                label={s.label}
                value={
                  s.fmt
                    ? s.fmt((summary[s.key] as number) ?? 0)
                    : (summary[s.key] ?? 0).toLocaleString()
                }
                accent={s.accent}
                icon={s.icon}
              />
            ))}
          </div>
          {showChart && chartData.length > 0 && (
            <SummaryChart data={chartData} title={tab.chartTitle} />
          )}
        </div>

        {/* Table card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Table header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">
              {tab.label}
              {!loading && result.pagination.total > 0 && (
                <span className="ml-2 text-slate-400 font-normal text-xs">
                  {result.pagination.total.toLocaleString()} total
                </span>
              )}
            </p>
            <button
              onClick={fetchReport}
              className={`text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors ${loading ? "animate-pulse" : ""
                }`}
            >
              🔄 {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          <DataTable
            columns={tab.columns}
            rows={result.data}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            loading={loading}
          />

          <div className="border-t border-slate-100 px-4">
            <Pagination
              page={page}
              totalPages={result.pagination.totalPages ?? 1}
              total={result.pagination.total ?? 0}
              limit={filters.limit}
              onPage={setPage}
            />
          </div>
        </div>
        </>
        )}
      </div>

    </div>
  );
}