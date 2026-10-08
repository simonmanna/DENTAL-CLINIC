// src/pages/reports/FinancialReports.tsx
import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
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
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";
import {
  Eye,
} from "lucide-react";
import { ActionButton, RowActions } from "@/components/ui/action-button";
import { useDebounce } from "@/hooks/useDebounce";
import { staffApi } from "@/lib/api/staff-api";
import type { Dentist } from "@/types/staff";
import {
  financialReportingApi,
  FinancialReportFilters,
  InvoiceDateBasis,
  InvoiceRow,
  ReceiptRow,
  PaymentRow,
  ExpenseRow,
} from "@/lib/api/financial-reporting";

// ─── Utilities ────────────────────────────────────────────────────────────────

const fmtCurrency = (v?: number | null, currencyOrCtx?: any): string => {
  // Determine currency from second argument (string) or infer context
  let currency = 'UGX';
  if (typeof currencyOrCtx === 'string') {
    currency = currencyOrCtx;
  }
  // Check if currencyOrCtx is a row-like object with a currency field
  if (typeof currencyOrCtx === 'object' && currencyOrCtx?.currency) {
    currency = currencyOrCtx.currency;
  }
  if (currency === 'USD') {
    return `USD ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${currency} ${Number(v || 0).toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const fmtDate = (d?: string | null): string =>
  d ? new Date(d).toLocaleDateString("en-GB") : "—";

const fmtDateTime = (d?: string | null): string =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

const fullName = (
  p?: { firstName: string; lastName: string } | null,
): string => (p ? `${p.firstName} ${p.lastName}` : "—");

const escapeHtml = (str: string) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Adaptive axis tick formatter — shows full values under 1000, "k" for thousands, "M" for millions
const fmtAxis = (v: number): string =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : v < 1 ? "0" : String(v);

type SortOrder = "asc" | "desc";

interface FilterState {
  search: string;
  datePreset: DatePreset;
  startDate: string;
  endDate: string;
  dateBasis: InvoiceDateBasis;
  patientId: string;
  dentistId: string;
  receivedById: string;
  accountId: string;
  status: string;
  paymentStatus: string;
  method: string;
  type: string;
  direction: string;
  currency: string;
  category: string;
  minAmount: string;
  maxAmount: string;
  overdueOnly: boolean;
  limit: number;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  datePreset: "all",
  startDate: "",
  endDate: "",
  dateBasis: "created",
  patientId: "",
  dentistId: "",
  receivedById: "",
  accountId: "",
  status: "",
  paymentStatus: "",
  method: "",
  type: "",
  direction: "",
  currency: "",
  category: "",
  minAmount: "",
  maxAmount: "",
  overdueOnly: false,
  limit: 20,
};

/** Filters that only make sense on one tab — cleared when the tab changes. */
const TAB_SCOPED_FILTER_KEYS = [
  "status",
  "paymentStatus",
  "method",
  "type",
  "direction",
  "category",
  "dateBasis",
  "overdueOnly",
  "receivedById",
] as const;

// ─── Date presets ─────────────────────────────────────────────────────────────
//
// Day arithmetic happens in the browser's local calendar and is sent as a bare
// YYYY-MM-DD string; the backend then resolves both edges in the clinic's
// timezone (Africa/Kampala), so "Today" is the clinic's day either way.

type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "custom";

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "thisYear", label: "This Year" },
  { key: "custom", label: "Custom" },
];

const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** Monday-based start of week, matching the backend's `weekStartsOn: 1`. */
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - day);
  return out;
}

/** `null` means "leave the dates alone" — i.e. the Custom preset. */
function getPresetRange(
  key: DatePreset,
): { startDate: string; endDate: string } | null {
  const now = new Date();
  const today = isoDate(now);
  switch (key) {
    case "all":
      return { startDate: "", endDate: "" };
    case "today":
      return { startDate: today, endDate: today };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { startDate: isoDate(y), endDate: isoDate(y) };
    }
    case "thisWeek":
      return { startDate: isoDate(startOfWeek(now)), endDate: today };
    case "thisMonth":
      return {
        startDate: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: today,
      };
    case "lastMonth": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: isoDate(first), endDate: isoDate(last) };
    }
    case "thisYear":
      return {
        startDate: isoDate(new Date(now.getFullYear(), 0, 1)),
        endDate: today,
      };
    default:
      return null;
  }
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#6366f1",
  "#ec4899",
];
const IN_COLOR = "#10b981";
const OUT_COLOR = "#ef4444";

// ─── Status badge ─────────────────────────────────────────────────────────────

// ── Invoice status (canonical: DRAFT / POSTED / VOID) ────────────────────────
const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  DRAFT: { cls: "bg-muted text-muted-foreground ring-border", label: "Draft" },
  POSTED: { cls: "bg-primary-muted/60 text-primary ring-primary/25", label: "Posted" },
  VOID: { cls: "bg-danger-muted/60 text-danger ring-danger/25", label: "Void" },
  // Payment & expense statuses (non-invoice)
  COMPLETED: { cls: "bg-success-muted/60 text-success ring-success/25", label: "Completed" },
  PENDING: { cls: "bg-warning-muted/60 text-warning ring-warning/25", label: "Pending" },
  FAILED: { cls: "bg-danger-muted/60 text-danger ring-danger/25", label: "Failed" },
  APPROVED: { cls: "bg-primary-muted/60 text-primary ring-primary/25", label: "Approved" },
  REJECTED: { cls: "bg-danger-muted/60 text-danger ring-danger/25", label: "Rejected" },
  PAID: { cls: "bg-success-muted/60 text-success ring-success/25", label: "Paid" },
  CANCELLED: { cls: "bg-muted text-muted-foreground ring-border", label: "Cancelled" },
};

// ── Payment status (separate from invoice status) ────────────────────────────
const PAYMENT_STATUS_CFG: Record<string, { cls: string; label: string }> = {
  UNPAID: { cls: "bg-danger-muted/60 text-danger ring-danger/25", label: "Unpaid" },
  PARTIALLY_PAID: { cls: "bg-warning-muted/60 text-warning ring-warning/25", label: "Partial" },
  PAID: { cls: "bg-success-muted/60 text-success ring-success/25", label: "Paid" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? {
    cls: "bg-muted text-muted-foreground ring-border",
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

function PaymentStatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground/70">—</span>;
  const cfg = PAYMENT_STATUS_CFG[status] ?? {
    cls: "bg-muted text-muted-foreground ring-border",
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

// ─── Direction badge ──────────────────────────────────────────────────────────

function DirectionBadge({ direction }: { direction: string }) {
  return direction === "IN" ? (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-success-muted/60 text-success ring-1 ring-inset ring-success/25">
      ↑ IN
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-danger-muted/60 text-danger ring-1 ring-inset ring-danger/25">
      ↓ OUT
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
    <div className="bg-white rounded-xl border border-border px-1 py-2 flex gap-2 items-start shadow-sm">
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
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </p>
        <p className="text-xl font-bold text-foreground mt-0.5 tabular-nums">
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
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
  if (sortBy !== col) return <span className="ml-1 text-muted-foreground/50">↕</span>;
  return (
    <span className="ml-1 text-primary">{sortOrder === "asc" ? "↑" : "↓"}</span>
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
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium">{(page - 1) * limit + 1}</span>–
        <span className="font-medium">{Math.min(page * limit, total)}</span> of{" "}
        <span className="font-medium">{total}</span>
      </p>
      <div className="flex gap-1">
        {["«", "‹"].map((label, i) => (
          <button
            key={label}
            onClick={() => onPage(i === 0 ? 1 : page - 1)}
            disabled={page === 1}
            className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
          >
            {label}
          </button>
        ))}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`px-2.5 py-1 text-xs rounded border ${p === page ? "bg-primary border-primary text-white font-medium" : "border-border text-muted-foreground hover:bg-muted/50"}`}
          >
            {p}
          </button>
        ))}
        {["›", "»"].map((label, i) => (
          <button
            key={label}
            onClick={() => onPage(i === 0 ? page + 1 : totalPages)}
            disabled={page === totalPages}
            className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

type FilterPatch = Partial<FilterState>;

/** A removable description of one active filter, for the chip row. */
interface ActiveFilterChip {
  label: string;
  clear: FilterPatch;
}

function FilterBar({
  filters,
  onChange,
  extra,
  onReset,
  chips,
}: {
  filters: FilterState;
  onChange: (patch: FilterPatch) => void;
  extra?: React.ReactNode;
  onReset: () => void;
  chips: ActiveFilterChip[];
}) {
  const set =
    (key: keyof FilterState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ [key]: e.target.value } as FilterPatch);

  // Picking a preset writes the two dates; "Custom" hands control back to the
  // From/To inputs, and editing either input switches to Custom.
  const selectPreset = (key: DatePreset) => {
    const range = getPresetRange(key);
    onChange(range ? { datePreset: key, ...range } : { datePreset: key });
  };

  const setDate = (key: "startDate" | "endDate") => (value: string) =>
    onChange({ [key]: value, datePreset: "custom" } as FilterPatch);

  return (
    <div className="bg-white border border-border rounded-xl p-3 space-y-3 shadow-sm">
      {/* Quick ranges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground mr-1">
          Range
        </span>
        {DATE_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => selectPreset(p.key)}
            className={`h-7 px-2.5 rounded-lg text-xs font-medium border transition-colors ${
              filters.datePreset === p.key
                ? "bg-primary text-white border-primary"
                : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Search
          </label>
          <input
            value={filters.search}
            onChange={set("search")}
            placeholder="Invoice #, patient, reference…"
            className="w-full h-9 rounded-lg border border-border px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent placeholder:text-muted-foreground/70"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            From
          </label>
          <input
            type="date"
            value={filters.startDate}
            max={filters.endDate || undefined}
            onChange={(e) => setDate("startDate")(e.target.value)}
            className="h-9 w-40 rounded-lg border border-border px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            To
          </label>
          <input
            type="date"
            value={filters.endDate}
            min={filters.startDate || undefined}
            onChange={(e) => setDate("endDate")(e.target.value)}
            className="h-9 w-40 rounded-lg border border-border px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60"
          />
        </div>
        {extra}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Rows
          </label>
          <select
            value={filters.limit}
            onChange={(e) => onChange({ limit: Number(e.target.value) })}
            className="h-9 rounded-lg border border-border px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 bg-white"
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
          className="h-9 px-3 rounded-lg text-sm border border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          Reset
        </button>
      </div>

      {/* What is currently narrowing the result */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
          <span className="text-xs text-muted-foreground/70 mr-1">
            Filtering by
          </span>
          {chips.map((chip) => (
            <button
              key={chip.label}
              onClick={() => onChange(chip.clear)}
              title="Remove this filter"
              className="h-6 inline-flex items-center gap-1 pl-2 pr-1.5 rounded-full bg-primary-muted/60 text-primary text-xs font-medium ring-1 ring-primary/25 hover:bg-primary-muted"
            >
              {chip.label}
              <span aria-hidden className="text-primary/70">
                ×
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Generic data table ───────────────────────────────────────────────────────

interface ColDef<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  csv?: (row: T) => string | number;
}

function DataTable<T extends { id?: string }>({
  columns,
  rows,
  sortBy,
  sortOrder,
  onSort,
  loading,
}: {
  columns: ColDef<T>[];
  rows: T[];
  sortBy: string;
  sortOrder: SortOrder;
  onSort: (col: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground/70">
        <div className="flex items-center gap-3">
          <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading report…</span>
        </div>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/70">
        <span className="text-3xl mb-2">📊</span>
        <p className="text-sm font-medium">No records found</p>
        <p className="text-xs mt-1">Try adjusting your filters</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => col.sortable !== false && onSort(col.key)}
                className={`px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${col.sortable !== false ? "cursor-pointer hover:text-foreground select-none" : ""}`}
              >
                {col.label}
                {col.sortable !== false && (
                  <SortIcon
                    col={col.key}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              className="hover:bg-muted/60 transition-colors"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="px-3 py-2.5 text-foreground whitespace-nowrap"
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

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(filename: string, columns: ColDef<any>[], rows: any[]) {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((row) =>
    columns
      .map((c) => `"${String(c.csv ? c.csv(row) : "").replace(/"/g, '""')}"`)
      .join(","),
  );
  const blob = new Blob(["\uFEFF" + [header, ...body].join("\n")], {
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

// ─── Mini chart ───────────────────────────────────────────────────────────────

function PieBreakdown({
  data,
  title,
  valueKey = "total",
  nameKey = "name",
}: {
  data: any[];
  title: string;
  valueKey?: string;
  nameKey?: string;
}) {
  if (!data?.length) return null;
  return (
    <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={70}
            paddingAngle={2}
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => [fmtCurrency(v), ""]} />
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

// ══════════════════════════════════════════════════════════════════════════════
// COLUMN DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════════

const INVOICE_COLUMNS = (navigate: (to: string) => void): ColDef<InvoiceRow>[] => [
  {
    key: "invoiceNumber",
    label: "Invoice #",
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground font-medium">
        {r.invoiceNumber}
      </span>
    ),
    csv: (r) => r.invoiceNumber,
  },
  {
    key: "patient",
    label: "Patient",
    sortable: false,
    render: (r) => (
      <div>
        <p className="font-medium text-foreground text-sm">
          {fullName(r.patient)}
        </p>
        <p className="text-xs text-muted-foreground/70">{r.patient?.patientCode}</p>
      </div>
    ),
    csv: (r) => `${fullName(r.patient)} (${r.patient?.patientCode ?? ""})`,
  },
  {
    key: "prevCard",
    label: "Prev Card",
    sortable: false,
    render: (r) => (
      <span className="text-xs font-mono text-muted-foreground">
        {r.patient?.previousCardNumber ?? "—"}
      </span>
    ),
    csv: (r) => r.patient?.previousCardNumber ?? "",
  },
  {
    key: "dentist",
    label: "Doctor",
    sortable: false,
    render: (r) => (
      <span className="text-sm">{fullName(r.visit?.dentist)}</span>
    ),
    csv: (r) => fullName(r.visit?.dentist),
  },
  {
    key: "status",
    label: "Status",
    render: (r) => <StatusBadge status={r.status} />,
    csv: (r) => r.status,
  },
  {
    key: "paymentStatus",
    label: "Payment",
    render: (r) => <PaymentStatusBadge status={r.paymentStatus} />,
    csv: (r) => r.paymentStatus ?? "",
  },
  {
    key: "total",
    label: "Total",
    render: (r) => (
      <span className="tabular-nums font-semibold text-foreground">
        {fmtCurrency(r.total, r.currency)}
      </span>
    ),
    csv: (r) => r.total,
  },
  {
    key: "amountPaid",
    label: "Paid",
    render: (r) => (
      <span className="tabular-nums text-success font-medium">
        {fmtCurrency(r.amountPaid, r.currency)}
      </span>
    ),
    csv: (r) => r.amountPaid,
  },
  {
    key: "balance",
    label: "Balance",
    render: (r) => (
      <span
        className={`tabular-nums font-medium ${r.balance > 0 ? "text-danger" : "text-muted-foreground/70"}`}
      >
        {fmtCurrency(r.balance, r.currency)}
      </span>
    ),
    csv: (r) => r.balance,
  },
  {
    key: "items",
    label: "Items",
    sortable: false,
    render: (r) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {r.items?.length ?? 0} items
      </span>
    ),
    csv: (r) => r.items?.length ?? 0,
  },
  {
    key: "issuedAt",
    label: "Issued",
    render: (r) => (
      <span className="text-xs text-muted-foreground/70">{fmtDate(r.issuedAt)}</span>
    ),
    csv: (r) => fmtDate(r.issuedAt),
  },
  {
    key: "dueDate",
    label: "Due",
    render: (r) => (
      <span
        className={`text-xs ${
          r.balance > 0 && r.dueDate && new Date(r.dueDate) < new Date()
            ? "text-danger font-medium"
            : "text-muted-foreground/70"
        }`}
      >
        {fmtDate(r.dueDate)}
      </span>
    ),
    csv: (r) => fmtDate(r.dueDate),
  },
  {
    key: "createdAt",
    label: "Created",
    render: (r) => (
      <span className="text-xs text-muted-foreground/70">{fmtDate(r.createdAt)}</span>
    ),
    csv: (r) => fmtDate(r.createdAt),
  },
  {
    key: "_actions",
    label: "Actions",
    sortable: false,
    render: (r) => (
      <ActionButton iconOnly tone="view" label="View invoice" onClick={() => navigate(`/billing?invoiceId=${r.id}`)} />
    ),
    csv: () => "",
  },
];

const RECEIPT_COLUMNS = (navigate: (to: string) => void): ColDef<ReceiptRow>[] => [
  {
    key: "receiptNumber",
    label: "Receipt #",
    render: (r) => (
      <span className="font-mono text-xs font-medium text-muted-foreground">
        {r.receiptNumber}
      </span>
    ),
    csv: (r) => r.receiptNumber,
  },
  {
    key: "patient",
    label: "Patient",
    sortable: false,
    render: (r) => (
      <div>
        <p className="font-medium text-foreground text-sm">
          {fullName(r.invoice?.patient)}
        </p>
        <p className="text-xs text-muted-foreground/70">
          {r.invoice?.patient?.patientCode}
        </p>
      </div>
    ),
    csv: (r) => fullName(r.invoice?.patient),
  },
  {
    key: "prevCard",
    label: "Prev Card",
    sortable: false,
    render: (r) => (
      <span className="text-xs font-mono text-muted-foreground">
        {r.invoice?.patient?.previousCardNumber ?? "—"}
      </span>
    ),
    csv: (r) => r.invoice?.patient?.previousCardNumber ?? "",
  },
  {
    key: "invoiceNumber",
    label: "Invoice",
    sortable: false,
    render: (r) => (
      <div>
        <span className="font-mono text-xs text-primary">
          {r.invoice?.invoiceNumber}
        </span>
        {r.invoice?.paymentStatus && (
          <div className="mt-0.5">
            <PaymentStatusBadge status={r.invoice.paymentStatus} />
          </div>
        )}
      </div>
    ),
    csv: (r) => r.invoice?.invoiceNumber ?? "",
  },
  {
    key: "amountReceived",
    label: "Amount",
    render: (r) => {
      const isVoid = r.status === "VOID";
      return (
        <span
          className={`tabular-nums font-semibold ${
            isVoid ? "text-muted-foreground/70 line-through" : "text-success"
          }`}
        >
          {fmtCurrency(r.amountReceived, r.currency ?? r.currencyCode)}
        </span>
      );
    },
    csv: (r) => r.amountReceived,
  },
  {
    key: "paymentMethod",
    label: "Method",
    sortable: false,
    render: (r) => (
      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
        {r.paymentMethod ?? "—"}
      </span>
    ),
    csv: (r) => r.paymentMethod ?? "",
  },
  {
    key: "reference",
    label: "Reference",
    sortable: false,
    render: (r) => (
      <span className="text-xs text-muted-foreground font-mono">
        {r.reference ?? "—"}
      </span>
    ),
    csv: (r) => r.reference ?? "",
  },
  {
    key: "receivedBy",
    label: "Cashier",
    sortable: false,
    render: (r) => (
      <span className="text-xs text-muted-foreground">{fullName(r.receivedBy)}</span>
    ),
    csv: (r) => fullName(r.receivedBy),
  },
  {
    key: "doctor",
    label: "Doctor",
    sortable: false,
    render: (r) => (
      <span className="text-sm">{fullName(r.invoice?.visit?.dentist)}</span>
    ),
    csv: (r) => fullName(r.invoice?.visit?.dentist),
  },
  {
    key: "currency",
    label: "Currency",
    sortable: false,
    render: (r) => {
      const cur = r.currency ?? r.currencyCode ?? "UGX";
      const isUsd = cur === "USD";
      return (
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isUsd ? "bg-primary-muted/60 text-primary" : "bg-success-muted/60 text-success"
          }`}
        >
          {cur}
        </span>
      );
    },
    csv: (r) => r.currency ?? r.currencyCode ?? "UGX",
  },
  {
    key: "status",
    label: "Status",
    sortable: false,
    render: (r) => {
      const s = r.status ?? "ACTIVE";
      const cls =
        s === "VOID"
          ? "bg-danger-muted/60 text-danger border-danger/25"
          : "bg-success-muted/60 text-success border-success/25";
      return (
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}
          title={s === "VOID" ? r.voidReason ?? "" : ""}
        >
          {s}
        </span>
      );
    },
    csv: (r) => r.status ?? "ACTIVE",
  },
  {
    key: "generatedAt",
    label: "Date",
    render: (r) => (
      <span className="text-xs text-muted-foreground">
        {fmtDateTime(r.generatedAt)}
      </span>
    ),
    csv: (r) => fmtDateTime(r.generatedAt),
  },
  {
    key: "_actions",
    label: "Actions",
    sortable: false,
    render: (r) => (
      <ActionButton iconOnly tone="view" label="View receipt" onClick={() => navigate(`/receipts/${r.id}`)} />
    ),
    csv: () => "",
  },
];

const PAYMENT_COLUMNS: ColDef<PaymentRow>[] = [
  {
    key: "paymentCode",
    label: "Payment #",
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground font-medium">
        {r.paymentCode}
      </span>
    ),
    csv: (r) => r.paymentCode,
  },
  {
    key: "direction",
    label: "Direction",
    render: (r) => <DirectionBadge direction={r.direction} />,
    csv: (r) => r.direction,
  },
  {
    key: "type",
    label: "Type",
    render: (r) => (
      <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
        {r.type.replace(/_/g, " ")}
      </span>
    ),
    csv: (r) => r.type,
  },
  {
    key: "party",
    label: "Party",
    sortable: false,
    render: (r) => (
      <span className="text-sm font-medium text-foreground">
        {r.party ?? "—"}
      </span>
    ),
    csv: (r) => r.party ?? "",
  },
  {
    key: "contextLabel",
    label: "Reference Doc",
    sortable: false,
    render: (r) => (
      <span className="font-mono text-xs text-primary">
        {r.contextLabel ?? "—"}
      </span>
    ),
    csv: (r) => r.contextLabel ?? "",
  },
  {
    key: "amount",
    label: "Amount",
    render: (r) => (
      <span
        className={`tabular-nums font-semibold ${r.direction === "IN" ? "text-success" : "text-danger"}`}
      >
        {r.direction === "OUT" ? "-" : "+"}
        {fmtCurrency(r.amount, r.currency)}
      </span>
    ),
    csv: (r) => (r.direction === "OUT" ? -r.amount : r.amount),
  },
  {
    key: "method",
    label: "Method",
    render: (r) => (
      <span className="text-xs font-medium text-primary bg-primary-muted/60 px-2 py-0.5 rounded-full">
        {r.method?.replace(/_/g, " ")}
      </span>
    ),
    csv: (r) => r.method,
  },
  {
    key: "status",
    label: "Status",
    render: (r) => <StatusBadge status={r.status} />,
    csv: (r) => r.status,
  },
  {
    key: "account",
    label: "Account",
    sortable: false,
    render: (r) => (
      <span className="text-xs text-muted-foreground">{r.account ?? "—"}</span>
    ),
    csv: (r) => r.account ?? "",
  },
  {
    key: "reference",
    label: "Reference",
    sortable: false,
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground/70">
        {r.reference ?? "—"}
      </span>
    ),
    csv: (r) => r.reference ?? "",
  },
  {
    key: "receivedBy",
    label: "Received By",
    sortable: false,
    render: (r) => (
      <span className="text-xs text-muted-foreground">{r.receivedBy ?? "—"}</span>
    ),
    csv: (r) => r.receivedBy ?? "",
  },
  {
    key: "paidAt",
    label: "Date",
    render: (r) => (
      <span className="text-xs text-muted-foreground/70">{fmtDateTime(r.paidAt)}</span>
    ),
    csv: (r) => fmtDateTime(r.paidAt),
  },
];

const EXPENSE_COLUMNS: ColDef<ExpenseRow>[] = [
  {
    key: "expenseCode",
    label: "Expense #",
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground font-medium">
        {r.expenseCode}
      </span>
    ),
    csv: (r) => r.expenseCode,
  },
  {
    key: "title",
    label: "Title",
    render: (r) => (
      <div>
        <p className="font-medium text-foreground text-sm">{r.title}</p>
        {r.description && (
          <p
            className="text-xs text-muted-foreground/70 max-w-[200px] truncate"
            title={r.description}
          >
            {r.description}
          </p>
        )}
      </div>
    ),
    csv: (r) => r.title,
  },
  {
    key: "category",
    label: "Category",
    render: (r) => (
      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
        {r.category.replace(/_/g, " ")}
      </span>
    ),
    csv: (r) => r.category,
  },
  {
    key: "amount",
    label: "Amount",
    render: (r) => (
      <span className="tabular-nums font-semibold text-foreground">
        {fmtCurrency(r.amount)}
      </span>
    ),
    csv: (r) => r.amount,
  },
  {
    key: "totalPaid",
    label: "Paid",
    sortable: false,
    render: (r) => (
      <span className="tabular-nums text-success font-medium">
        {fmtCurrency(r.totalPaid)}
      </span>
    ),
    csv: (r) => r.totalPaid,
  },
  {
    key: "status",
    label: "Status",
    render: (r) => <StatusBadge status={r.status} />,
    csv: (r) => r.status,
  },
  {
    key: "createdByName",
    label: "Created By",
    sortable: false,
    render: (r) => (
      <span className="text-xs text-muted-foreground">{r.createdByName ?? "—"}</span>
    ),
    csv: (r) => r.createdByName ?? "",
  },
  {
    key: "approvedByName",
    label: "Approved By",
    sortable: false,
    render: (r) => (
      <span className="text-xs text-muted-foreground">{r.approvedByName ?? "—"}</span>
    ),
    csv: (r) => r.approvedByName ?? "",
  },
  {
    key: "expenseDate",
    label: "Date",
    render: (r) => (
      <span className="text-xs text-muted-foreground">{fmtDate(r.expenseDate)}</span>
    ),
    csv: (r) => fmtDate(r.expenseDate),
  },
  {
    key: "paidAt",
    label: "Paid At",
    render: (r) => (
      <span className="text-xs text-muted-foreground/70">{fmtDate(r.paidAt)}</span>
    ),
    csv: (r) => fmtDate(r.paidAt),
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// TAB CONFIGS
// ══════════════════════════════════════════════════════════════════════════════

type TabId = "invoices" | "receipts" | "expenses" | "payments";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "invoices", label: "Invoices & Sales", icon: "🧾" },
  { id: "receipts", label: "Receipts", icon: "💳" },
  { id: "expenses", label: "Expenses", icon: "📋" },
  { id: "payments", label: "Payments", icon: "💰" },
];

/**
 * Each tab sorts on a different column and the server whitelists them per
 * report, so the default has to follow the tab or the sort silently falls back.
 */
const DEFAULT_SORT_BY: Record<TabId, string> = {
  invoices: "createdAt",
  receipts: "generatedAt",
  expenses: "expenseDate",
  payments: "paidAt",
};

/** Matches `EXPORT_HARD_LIMIT` in backend/src/reports-common/types. */
const EXPORT_ROW_LIMIT = 5000;

const CURRENCY_OPTIONS = ["UGX", "USD"];

const PAYMENT_METHODS = [
  "CASH",
  "VISA_CARD",
  "MASTERCARD",
  "MTN_MOBILE_MONEY",
  "AIRTEL_MONEY",
  "BANK_TRANSFER",
  "CHEQUE",
  "INSURANCE",
];

const DATE_BASIS_OPTIONS: { value: InvoiceDateBasis; label: string }[] = [
  { value: "created", label: "Created" },
  { value: "issued", label: "Issued" },
  { value: "due", label: "Due" },
  { value: "paid", label: "Paid" },
];

const staffName = (s: Dentist) => `${s.firstName} ${s.lastName}`;

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

interface FinancialReportsViewProps {
  /** Which tabs this report exposes, in display order. First entry is the default. */
  tabs: TabId[];
  title: string;
  subtitle: string;
}

function FinancialReportsView({
  tabs: tabIds,
  title,
  subtitle,
}: FinancialReportsViewProps): JSX.Element {
  const visibleTabs = useMemo(
    () => TABS.filter((t) => tabIds.includes(t.id)),
    [tabIds],
  );
  const [activeTab, setActiveTab] = useState<TabId>(tabIds[0]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState(DEFAULT_SORT_BY[tabIds[0]]);
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [dentists, setDentists] = useState<Dentist[]>([]);

  // Fetched once and shared by both tabs' Doctor / Cashier selects. A failure
  // here must not break the report, so the list just stays empty.
  useEffect(() => {
    let cancelled = false;
    staffApi
      .getDentists()
      .then((list) => {
        if (!cancelled) setDentists(Array.isArray(list) ? list : []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Data state per tab
  const [invoiceData, setInvoiceData] = useState<any>({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    summary: {},
  });
  const [receiptData, setReceiptData] = useState<any>({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    summary: {},
  });
  const [paymentData, setPaymentData] = useState<any>({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    summary: {},
  });

  const [expenseData, setExpenseData] = useState<any>({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    summary: {},
  });

  const currentData = useMemo(() => {
  // Get raw data for active tab
  let raw: any;
  switch (activeTab) {
    case "invoices": raw = invoiceData; break;
    case "receipts": raw = receiptData; break;
    case "payments": raw = paymentData; break;
    case "expenses": raw = expenseData; break;
    default: raw = {};
  }

  // 🔒 Normalize data: always an array
  const dataArray = Array.isArray(raw?.data) 
    ? raw.data 
    : Array.isArray(raw) 
      ? raw 
      : [];

  // 🔒 Normalize pagination: always an object with safe defaults
  const pagination = raw?.pagination && typeof raw.pagination === 'object'
    ? {
        page: raw.pagination.page ?? 1,
        limit: raw.pagination.limit ?? 20,
        total: raw.pagination.total ?? 0,
        totalPages: raw.pagination.totalPages ?? 1,
      }
    : { page: 1, limit: 20, total: 0, totalPages: 1 };

  // 🔒 Normalize summary: always an object
  const summary = raw?.summary && typeof raw.summary === 'object'
    ? raw.summary
    : {};

  return { data: dataArray, pagination, summary };
}, [activeTab, invoiceData, receiptData, paymentData, expenseData]);

// Per-currency billed / collected / outstanding for the invoices tab.
//
// These come from the backend's `billedByCurrency` aggregate, which covers the
// whole filtered set. Summing `currentData.data` instead — as this did before —
// meant the headline revenue changed whenever the user switched rows per page.
const revenueByCurrency = useMemo(() => {
  const empty = {
    ugx: 0,
    usd: 0,
    collectedUgx: 0,
    collectedUsd: 0,
    balanceUgx: 0,
    balanceUsd: 0,
  };
  if (activeTab !== "invoices") return empty;
  const out = { ...empty };
  for (const row of (currentData.summary?.billedByCurrency ?? []) as any[]) {
    const isUsd = row.currency === "USD";
    out[isUsd ? "usd" : "ugx"] += Number(row.billed) || 0;
    out[isUsd ? "collectedUsd" : "collectedUgx"] += Number(row.collected) || 0;
    out[isUsd ? "balanceUsd" : "balanceUgx"] += Number(row.outstanding) || 0;
  }
  return out;
}, [activeTab, currentData.summary]);

// Only the free-text box is debounced; every other control is a discrete
// choice and should take effect on the click.
const debouncedSearch = useDebounce(filters.search, 300);

const apiFilters: FinancialReportFilters = useMemo(
  () => ({
    search: debouncedSearch || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    dateBasis: activeTab === "invoices" ? filters.dateBasis : undefined,
    patientId: filters.patientId || undefined,
    dentistId: filters.dentistId || undefined,
    receivedById: filters.receivedById || undefined,
    accountId: filters.accountId || undefined,
    status: filters.status || undefined,
    paymentStatus: filters.paymentStatus || undefined,
    method: filters.method || undefined,
    type: filters.type || undefined,
    direction: filters.direction || undefined,
    currency: filters.currency || undefined,
    category: filters.category || undefined,
    minAmount: filters.minAmount ? Number(filters.minAmount) : undefined,
    maxAmount: filters.maxAmount ? Number(filters.maxAmount) : undefined,
    overdueOnly: filters.overdueOnly ? "true" : undefined,
    page,
    limit: filters.limit,
    sortBy,
    sortOrder,
  }),
  // Depends on the individual fields, not on `filters` as a whole: the object
  // identity changes on every keystroke, which would defeat the debounce above
  // and fire one request per character.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [
    debouncedSearch,
    filters.startDate,
    filters.endDate,
    filters.dateBasis,
    filters.patientId,
    filters.dentistId,
    filters.receivedById,
    filters.accountId,
    filters.status,
    filters.paymentStatus,
    filters.method,
    filters.type,
    filters.direction,
    filters.currency,
    filters.category,
    filters.minAmount,
    filters.maxAmount,
    filters.overdueOnly,
    filters.limit,
    activeTab,
    page,
    sortBy,
    sortOrder,
  ],
);

const fetchReport = useCallback(async () => {
  setLoading(true);
  setError(null);

  try {
    const rawResponse = await (() => {
      switch (activeTab) {
        case "invoices": return financialReportingApi.getInvoicesReport(apiFilters);
        case "receipts": return financialReportingApi.getReceiptsReport(apiFilters);
        case "payments": return financialReportingApi.getPaymentsReport(apiFilters);
        case "expenses": return financialReportingApi.getExpensesReport(apiFilters);
      }
    })();

    const payload = rawResponse && typeof rawResponse === "object" && Array.isArray(rawResponse.data)
      ? rawResponse
      : { data: [], pagination: { page: 1, limit: filters.limit, total: 0, totalPages: 1 }, summary: {} };

    switch (activeTab) {
      case "invoices": setInvoiceData(payload); break;
      case "receipts": setReceiptData(payload); break;
      case "payments": setPaymentData(payload); break;
      case "expenses": setExpenseData(payload); break;
    }
  } catch (e: any) {
    console.error("Fetch error:", e);
    setError(e.message ?? "Failed to load report");
  } finally {
    setLoading(false);
  }
}, [activeTab, apiFilters, filters.limit]);

  // Every filter edit goes through `updateFilters`, which resets the page in the
  // same event. React batches the two setState calls into one render, so one
  // edit means exactly one request and no double-fetch.
  //
  // The previous version armed a ref in a second effect and skipped the fetch
  // whenever it was set; because `setPage(1)` is a no-op when the page is
  // already 1, React bailed out of the re-render and every *other* filter edit
  // was silently dropped — which is why the date filter looked inert.
  const updateFilters = useCallback((patch: Partial<FilterState>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleSort = useCallback(
    (col: string) => {
      if (sortBy === col) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      else {
        setSortBy(col);
        setSortOrder("desc");
      }
      setPage(1);
    },
    [sortBy],
  );

  const handleTabChange = (id: TabId) => {
    setActiveTab(id);
    // Keep the date range, search and currency — switching from Invoices to
    // Receipts to inspect the same window is the whole point of the tabs. Only
    // the filters that do not exist on the new tab are cleared.
    setFilters((f) => {
      const next = { ...f };
      for (const key of TAB_SCOPED_FILTER_KEYS) {
        (next as any)[key] = DEFAULT_FILTERS[key];
      }
      return next;
    });
    setPage(1);
    // Each tab has its own sortable columns server-side; `createdAt` is not a
    // valid receipts sort key and would silently fall back.
    setSortBy(DEFAULT_SORT_BY[id]);
    setSortOrder("desc");
    setError(null);
  };

  const activeColumns: ColDef<any>[] = useMemo(() => {
    switch (activeTab) {
      case "invoices":
        return INVOICE_COLUMNS(navigate);
      case "receipts":
        return RECEIPT_COLUMNS(navigate);
      case "payments":
        return PAYMENT_COLUMNS;
      case "expenses":
        return EXPENSE_COLUMNS;
    }
  }, [activeTab, navigate]);

  const [exporting, setExporting] = useState(false);

  /**
   * Export the whole filtered result set, not just the page on screen — a CSV
   * of 20 rows out of 800 is worse than useless for reconciliation. Re-requests
   * with a single large page, capped to match the backend's export limit.
   */
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const total = currentData.pagination.total ?? 0;
      let rows = Array.isArray(currentData.data) ? currentData.data : [];

      if (total > rows.length) {
        const wide = {
          ...apiFilters,
          page: 1,
          limit: Math.min(total, EXPORT_ROW_LIMIT),
        };
        const full = await (() => {
          switch (activeTab) {
            case "invoices": return financialReportingApi.getInvoicesReport(wide);
            case "receipts": return financialReportingApi.getReceiptsReport(wide);
            case "payments": return financialReportingApi.getPaymentsReport(wide);
            case "expenses": return financialReportingApi.getExpensesReport(wide);
          }
        })();
        if (Array.isArray(full?.data)) rows = full.data as any[];
        if (total > EXPORT_ROW_LIMIT) {
          setError(
            `Export capped at ${EXPORT_ROW_LIMIT.toLocaleString()} rows of ${total.toLocaleString()} — narrow the filters for the full set.`,
          );
        }
      }

      exportCSV(
        `${activeTab}-report-${new Date().toISOString().slice(0, 10)}.csv`,
        activeColumns,
        rows,
      );
    } catch (e: any) {
      setError(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Financial Report – ${activeTab}</title>
      <style>body{font-family:system-ui,sans-serif;font-size:12px;color:#1e293b}
      h1{font-size:16px}table{width:100%;border-collapse:collapse}
      th{background:#f8fafc;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;border-bottom:2px solid #e2e8f0}
      td{padding:6px 8px;border-bottom:1px solid #f1f5f9}
      tr:nth-child(even) td{background:#f8fafc}</style></head>
      <body>${content}</body></html>`);
    w.document.close();
    w.focus();
    w.onafterprint = () => w.close();
    w.print();
    setTimeout(() => { try { w.close(); } catch {} }, 1000);
  };

  const summary = currentData.summary ?? {};

  // ── Shared filter-extra building blocks ─────────────────────────────────────
  //
  // Native <select>/<input> is what the rest of this page uses; staying with it
  // keeps the filter bar visually consistent.
  const selectClass =
    "h-9 rounded-lg border border-border px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/60";

  const Field = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}
      </label>
      {children}
    </div>
  );

  const staffSelect = (
    key: "dentistId" | "receivedById",
    label: string,
  ) => (
    <Field label={label}>
      <select
        value={filters[key]}
        onChange={(e) => updateFilters({ [key]: e.target.value })}
        className={`${selectClass} max-w-44`}
      >
        <option value="">All</option>
        {dentists.map((d) => (
          <option key={d.id} value={d.id}>
            {staffName(d)}
          </option>
        ))}
      </select>
    </Field>
  );

  const currencySelect = (
    <Field label="Currency">
      <select
        value={filters.currency}
        onChange={(e) => updateFilters({ currency: e.target.value })}
        className={selectClass}
      >
        <option value="">All</option>
        {CURRENCY_OPTIONS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </Field>
  );

  const amountRangeInputs = (
    <Field label="Amount">
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={filters.minAmount}
          onChange={(e) => updateFilters({ minAmount: e.target.value })}
          placeholder="Min"
          className="h-9 w-24 rounded-lg border border-border px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/60"
        />
        <span className="text-muted-foreground/70 text-xs">–</span>
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={filters.maxAmount}
          onChange={(e) => updateFilters({ maxAmount: e.target.value })}
          placeholder="Max"
          className="h-9 w-24 rounded-lg border border-border px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/60"
        />
      </div>
    </Field>
  );

  // ── Invoice-specific filter extras ──────────────────────────────────────────
  const invoiceExtras = (
    <>
      <Field label="Date Basis">
        <select
          value={filters.dateBasis}
          onChange={(e) =>
            updateFilters({ dateBasis: e.target.value as InvoiceDateBasis })
          }
          className={selectClass}
          title="Which invoice date the range applies to"
        >
          {DATE_BASIS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Invoice Status">
        <select
          value={filters.status}
          onChange={(e) => updateFilters({ status: e.target.value })}
          className={selectClass}
        >
          <option value="">All</option>
          {["DRAFT", "POSTED", "VOID"].map((s) => (
            <option key={s} value={s}>
              {STATUS_CFG[s]?.label ?? s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Payment Status">
        <select
          value={filters.paymentStatus}
          onChange={(e) => updateFilters({ paymentStatus: e.target.value })}
          className={selectClass}
        >
          <option value="">All</option>
          {["UNPAID", "PARTIALLY_PAID", "PAID"].map((s) => (
            <option key={s} value={s}>
              {PAYMENT_STATUS_CFG[s]?.label ?? s}
            </option>
          ))}
        </select>
      </Field>
      {currencySelect}
      {staffSelect("dentistId", "Doctor")}
      {amountRangeInputs}
      <label className="h-9 flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filters.overdueOnly}
          onChange={(e) => updateFilters({ overdueOnly: e.target.checked })}
          className="size-4 rounded border-border accent-primary"
        />
        Overdue only
      </label>
    </>
  );

  // ── Receipt-specific filter extras ──────────────────────────────────────────
  const receiptExtras = (
    <>
      <Field label="Status">
        <select
          value={filters.status}
          onChange={(e) => updateFilters({ status: e.target.value })}
          className={selectClass}
        >
          {/* "" is the server's default, which means ACTIVE only. */}
          <option value="">Active</option>
          <option value="VOID">Void</option>
          <option value="ALL">All</option>
        </select>
      </Field>
      {currencySelect}
      <Field label="Method">
        <select
          value={filters.method}
          onChange={(e) => updateFilters({ method: e.target.value })}
          className={selectClass}
        >
          <option value="">All</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Field>
      {staffSelect("dentistId", "Doctor")}
      {staffSelect("receivedById", "Cashier")}
      {amountRangeInputs}
    </>
  );

  const paymentExtras = (
    <>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Type
        </label>
        <select
          value={filters.type}
          onChange={(e) => updateFilters({ type: e.target.value })}
          className="h-9 rounded-lg border border-border px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <option value="">All</option>
          {["INVOICE_RECEIPT", "PURCHASE_ORDER", "EXPENSE", "OTHER"].map(
            (t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ),
          )}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Direction
        </label>
        <select
          value={filters.direction}
          onChange={(e) =>
            updateFilters({ direction: e.target.value })
          }
          className="h-9 rounded-lg border border-border px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <option value="">All</option>
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Method
        </label>
        <select
          value={filters.method}
          onChange={(e) =>
            updateFilters({ method: e.target.value })
          }
          className="h-9 rounded-lg border border-border px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <option value="">All</option>
          {[
            "CASH",
            "VISA_CARD",
            "MASTERCARD",
            "MTN_MOBILE_MONEY",
            "AIRTEL_MONEY",
            "BANK_TRANSFER",
            "CHEQUE",
            "INSURANCE",
          ].map((m) => (
            <option key={m} value={m}>
              {m.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
    </>
  );

  const expenseExtras = (
    <>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Status
        </label>
        <select
          value={filters.status}
          onChange={(e) =>
            updateFilters({ status: e.target.value })
          }
          className="h-9 rounded-lg border border-border px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <option value="">All</option>
          {["PENDING", "APPROVED", "PAID", "REJECTED", "CANCELLED"].map((s) => (
            <option key={s} value={s}>
              {STATUS_CFG[s]?.label ?? s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Category
        </label>
        <select
          value={filters.category ?? ""}
          onChange={(e) =>
            updateFilters({ category: e.target.value })
          }
          className="h-9 rounded-lg border border-border px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <option value="">All</option>
          {[
            "UTILITIES",
            "SALARIES",
            "SUPPLIES",
            "EQUIPMENT",
            "MAINTENANCE",
            "RENT",
            "MARKETING",
            "INSURANCE",
            "LEGAL",
            "TRANSPORT",
            "COMMUNICATION",
            "OTHER",
          ].map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
    </>
  );

  // One removable chip per narrowing filter, so it is never a mystery why a
  // report is showing fewer rows than expected. The date range is deliberately
  // left out — the preset buttons above already show it.
  const activeFilterChips = useMemo(() => {
    const chips: { label: string; clear: Partial<FilterState> }[] = [];
    const push = (label: string, clear: Partial<FilterState>) =>
      chips.push({ label, clear });

    if (filters.search) push(`Search: "${filters.search}"`, { search: "" });
    if (filters.status)
      push(
        `Status: ${STATUS_CFG[filters.status]?.label ?? filters.status.replace(/_/g, " ")}`,
        { status: "" },
      );
    if (filters.paymentStatus)
      push(
        `Payment: ${PAYMENT_STATUS_CFG[filters.paymentStatus]?.label ?? filters.paymentStatus}`,
        { paymentStatus: "" },
      );
    if (filters.currency) push(`Currency: ${filters.currency}`, { currency: "" });
    if (filters.method)
      push(`Method: ${filters.method.replace(/_/g, " ")}`, { method: "" });
    if (filters.type) push(`Type: ${filters.type.replace(/_/g, " ")}`, { type: "" });
    if (filters.direction) push(`Direction: ${filters.direction}`, { direction: "" });
    if (filters.category)
      push(`Category: ${filters.category.replace(/_/g, " ")}`, { category: "" });
    if (filters.dentistId) {
      const d = dentists.find((x) => x.id === filters.dentistId);
      push(`Doctor: ${d ? staffName(d) : filters.dentistId}`, { dentistId: "" });
    }
    if (filters.receivedById) {
      const d = dentists.find((x) => x.id === filters.receivedById);
      push(`Cashier: ${d ? staffName(d) : filters.receivedById}`, {
        receivedById: "",
      });
    }
    if (filters.minAmount) push(`Min ${filters.minAmount}`, { minAmount: "" });
    if (filters.maxAmount) push(`Max ${filters.maxAmount}`, { maxAmount: "" });
    if (filters.overdueOnly) push("Overdue only", { overdueOnly: false });
    if (activeTab === "invoices" && filters.dateBasis !== "created")
      push(
        `Dated by: ${DATE_BASIS_OPTIONS.find((o) => o.value === filters.dateBasis)?.label}`,
        { dateBasis: "created" },
      );
    return chips;
  }, [filters, dentists, activeTab]);

  const filterExtras =
    activeTab === "invoices"
      ? invoiceExtras
      : activeTab === "receipts"
        ? receiptExtras
        : activeTab === "payments"
          ? paymentExtras
          : activeTab === "expenses"
            ? expenseExtras
            : undefined;

  // ── Render summary section per tab ───────────────────────────────────────────
  const renderSummary = () => {
    switch (activeTab) {
      // ── Invoices ──────────────────────────────────────────────────────────
      case "invoices":
        return (
          <div className="space-y-1">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard
                label="Total Invoices"
                value={(summary.total ?? 0).toLocaleString()}
                icon="🧾"
                accent="#0ea5e9"
              />
              <StatCard
                label="Revenue"
                value={
                  <>
                    <span className="tabular-nums">UGX {Number(revenueByCurrency.ugx).toLocaleString("en-UG")}</span>
                    <span className="text-sm font-normal text-muted-foreground block tabular-nums">
                      USD {Number(revenueByCurrency.usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </>
                }
                icon="💰"
                accent="#8b5cf6"
              />
              <StatCard
                label="Collected"
                value={
                  <>
                    <span className="tabular-nums">UGX {Number(revenueByCurrency.collectedUgx).toLocaleString("en-UG")}</span>
                    <span className="text-sm font-normal text-muted-foreground block tabular-nums">
                      USD {Number(revenueByCurrency.collectedUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </>
                }
                icon="✅"
                accent="#10b981"
              />
              <StatCard
                label="Outstanding"
                value={
                  <>
                    <span className="tabular-nums">UGX {Number(revenueByCurrency.balanceUgx).toLocaleString("en-UG")}</span>
                    <span className="text-sm font-normal text-muted-foreground block tabular-nums">
                      USD {Number(revenueByCurrency.balanceUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </>
                }
                icon="⏳"
                accent="#f59e0b"
              />
              <StatCard
                label="Collection Rate"
                value={`${summary.collectionRate ?? (summary.totalBilled ? Math.round((summary.totalCollected / summary.totalBilled) * 100) : 0)}%`}
                icon="📈"
                accent="#10b981"
              />
              <StatCard
                label="Void"
                value={
                  (summary.statusBreakdown ?? [])
                    .find((s: any) => s.status === "VOID")
                    ?.count?.toLocaleString() ?? "0"
                }
                icon="🚫"
                accent="#94a3b8"
              />
            </div>

            {showCharts && (
              <div className="space-y-1">
                {/* Row 1: Status + Payment status + Payment methods */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Invoice status breakdown */}
                  <PieBreakdown
                    data={(summary.statusBreakdown ?? []).map((s: any) => ({
                      name: STATUS_CFG[s.status]?.label ?? s.status,
                      total: s.billed,
                    }))}
                    title="Revenue by Invoice Status"
                  />

                  {/* Payment status breakdown */}
                  <PieBreakdown
                    data={(summary.paymentStatusBreakdown ?? []).map((s: any) => ({
                      name: PAYMENT_STATUS_CFG[s.paymentStatus]?.label ?? s.paymentStatus,
                      total: s.outstanding || s.billed,
                    }))}
                    title="Outstanding by Payment Status"
                  />

                  {/* Payment methods */}
                  <PieBreakdown
                    data={(summary.paymentsByMethod ?? []).map((m: any) => ({
                      name: m.method?.replace(/_/g, " ") ?? "Unknown",
                      total: m.total,
                    }))}
                    title="Collections by Payment Method"
                  />
                </div>

                {/* Row 2: Aging + Procedures + Doctor revenue */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Aging buckets */}
                  {(summary.agingBuckets ?? []).length > 0 && (
                    <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Accounts Receivable Aging
                      </p>
                      <div className="space-y-2">
                        {(summary.agingBuckets ?? []).map((b: any, i: number) => {
                          const maxAmount = Math.max(
                            ...(summary.agingBuckets ?? []).map((x: any) => x.amount || 1),
                          );
                          const pct = maxAmount > 0 ? (b.amount / maxAmount) * 100 : 0;
                          const colors = ["#10b981", "#0ea5e9", "#f59e0b", "#f97316", "#ef4444"];
                          return (
                            <div key={i}>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {b.label}
                                </span>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                  {fmtCurrency(b.amount)} ({b.count})
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.max(pct, 2)}%`,
                                    backgroundColor: colors[i] ?? "#94a3b8",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Revenue by procedure */}
                  <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Revenue by Procedure (Top 8)
                    </p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart
                        data={(summary.revenueByProcedure ?? []).slice(0, 8)}
                        layout="vertical"
                        margin={{ left: 0, right: 20, top: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10 }}
                          tickFormatter={fmtAxis}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 10 }}
                          width={120}
                        />
                        <Tooltip
                          formatter={(v: number) => [fmtCurrency(v), "Revenue"]}
                        />
                        <Bar
                          dataKey="total"
                          fill="#0ea5e9"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Revenue by doctor */}
                  <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Revenue by Doctor (UGX-equivalent)
                    </p>
                    <div className="space-y-2">
                      {(summary.revenueByDoctor ?? [])
                        .slice(0, 6)
                        .map((d: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs font-medium text-foreground truncate">
                                  {d.name}
                                </span>
                                <span className="text-xs tabular-nums text-muted-foreground ml-2">
                                  {fmtCurrency(d.billed)}
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{
                                    width: `${summary.totalBilled ? Math.round((d.billed / summary.totalBilled) * 100) : 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      {!summary.revenueByDoctor?.length && (
                        <p className="text-xs text-muted-foreground/70 text-center py-1">
                          No data
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      // ── Receipts ──────────────────────────────────────────────────────────
      case "receipts": {
        // Build daily chart data (already filtered to ACTIVE & in base currency)
        const dailyMap: Record<string, number> = {};
        for (const d of summary.dailyCollections ?? []) {
          const key = new Date(d.date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          });
          dailyMap[key] = (dailyMap[key] ?? 0) + d.total;
        }
        const dailyChartData = Object.entries(dailyMap).map(
          ([date, total]) => ({ date, total }),
        );

        // Per-currency breakdown from backend
        const byCurrency: Array<{
          currency: string;
          total: number;
          totalBase: number;
          count: number;
        }> = summary.byCurrency ?? [];

        const todayBase =
          summary.dailyCollections?.find(
            (d: any) =>
              new Date(d.date).toDateString() === new Date().toDateString(),
          )?.total ?? 0;

        return (
          <div className="space-y-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Active Receipts"
                value={(summary.totalActiveCount ?? summary.total ?? 0).toLocaleString()}
                icon="💳"
                accent="#0ea5e9"
              />
              <StatCard
                label="Total Collected (Base)"
                value={fmtCurrency(summary.totalCollected, "UGX")}
                icon="✅"
                accent="#10b981"
              />
              <StatCard
                label="Voided"
                value={`${(summary.voidedCount ?? 0).toLocaleString()} · ${fmtCurrency(summary.voidedTotalBase ?? 0, "UGX")}`}
                icon="🚫"
                accent="#ef4444"
              />
              <StatCard
                label="Today (Base)"
                value={fmtCurrency(todayBase, "UGX")}
                icon="📅"
                accent="#f59e0b"
              />
            </div>

            {/* Per-currency breakdown — one card per currency */}
            {byCurrency.length > 0 && (
              <div
                className={`grid gap-3 ${
                  byCurrency.length === 1
                    ? "grid-cols-1"
                    : byCurrency.length === 2
                      ? "grid-cols-2"
                      : "grid-cols-2 lg:grid-cols-3"
                }`}
              >
                {byCurrency.map((c) => {
                  const isBase = c.currency === "UGX";
                  return (
                    <div
                      key={c.currency}
                      className="bg-white border border-border rounded-xl p-4 shadow-sm space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-border/60 pb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md tracking-wide ${
                              c.currency === "USD"
                                ? "bg-primary-muted text-primary"
                                : c.currency === "UGX"
                                  ? "bg-success-muted text-success"
                                  : "bg-muted text-foreground"
                            }`}
                          >
                            {c.currency}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {c.count} {c.count === 1 ? "receipt" : "receipts"}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Collected
                          </p>
                          <p className="text-base font-bold text-foreground tabular-nums">
                            {fmtCurrency(c.total, c.currency)}
                          </p>
                        </div>
                        {!isBase && (
                          <div className="pl-2 border-l border-border/60">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                              ≈ Base (UGX)
                            </p>
                            <p className="text-sm font-semibold text-success tabular-nums">
                              {fmtCurrency(c.totalBase, "UGX")}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Daily chart — values are in BASE currency (UGX-equivalent) */}
            {showCharts && (dailyChartData ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Daily Collections (UGX-equivalent) — {fmtCurrency(summary.totalCollected, "UGX")}
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={dailyChartData}>
                    <defs>
                      <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtCurrency(v as number, "UGX")} width={80} />
                    <Tooltip
                      formatter={(v: number) => [fmtCurrency(v, "UGX"), "Amount"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#colGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Payment method pie */}
            {showCharts && (summary.methodBreakdown ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Collections by Payment Methods
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={(summary.methodBreakdown ?? []).map((m: any) => ({
                        name: m.method?.replace(/_/g, " ") ?? "Unknown",
                        value: m.total,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {(summary.methodBreakdown ?? []).map((_e: any, i: number) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(val: string) => (
                        <span style={{ fontSize: 10 }}>
                          {val}
                        </span>
                      )}
                    />
                    <Tooltip
                      formatter={(v: number, _n: string, p: any) => [
                        fmtCurrency(v),
                        p?.payload?.name ?? "",
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      }

      // ── Payments ──────────────────────────────────────────────────────────
      case "payments":
        return (
          <div className="space-y-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard
                label="Total"
                value={(summary.total ?? 0).toLocaleString()}
                icon="💰"
                accent="#0ea5e9"
              />
              <StatCard
                label="Money In"
                value={fmtCurrency(summary.totalIn)}
                sub={`${summary.inCount ?? 0} payments`}
                icon="⬆️"
                accent="#10b981"
              />
              <StatCard
                label="Money Out"
                value={fmtCurrency(summary.totalOut)}
                sub={`${summary.outCount ?? 0} payments`}
                icon="⬇️"
                accent="#ef4444"
              />
              <StatCard
                label="Net"
                value={fmtCurrency(summary.netAmount)}
                icon="⚖️"
                accent={summary.netAmount >= 0 ? "#10b981" : "#ef4444"}
              />
              <StatCard
                label="Methods"
                value={summary.byMethod?.length ?? 0}
                icon="🔀"
                accent="#8b5cf6"
              />
              <StatCard
                label="Types"
                value={summary.byType?.length ?? 0}
                icon="📂"
                accent="#f59e0b"
              />
            </div>
          </div>
        );

      // ── Expenses ──────────────────────────────────────────────────────────
      case "expenses": {
        const monthlyData = (summary.monthlyTrend ?? []).map((m: any) => ({
          month: new Date(m.month).toLocaleDateString("en-GB", {
            month: "short",
            year: "2-digit",
          }),
          total: m.total,
        }));
        return (
          <div className="space-y-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                label="Total Expenses"
                value={(summary.total ?? 0).toLocaleString()}
                icon="📋"
                accent="#0ea5e9"
              />
              <StatCard
                label="Total Amount"
                value={fmtCurrency(summary.totalAmount)}
                icon="💸"
                accent="#8b5cf6"
              />
              <StatCard
                label="Total Paid"
                value={fmtCurrency(summary.totalPaid)}
                sub={`${summary.paidCount ?? 0} expenses`}
                icon="✅"
                accent="#10b981"
              />
              <StatCard
                label="Pending / Approved"
                value={fmtCurrency(summary.totalPending)}
                sub={`${summary.pendingCount ?? 0} expenses`}
                icon="⏳"
                accent="#f59e0b"
              />
              <StatCard
                label="Avg per Expense"
                value={fmtCurrency(
                  summary.total ? summary.totalAmount / summary.total : 0,
                )}
                icon="📊"
                accent="#6366f1"
              />
            </div>

            {showCharts && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* By category */}
                <PieBreakdown
                  data={(summary.byCategory ?? []).map((c: any) => ({
                    name: c.category.replace(/_/g, " "),
                    total: c.total,
                  }))}
                  title="By Category"
                />

                {/* Monthly trend */}
                <div className="bg-white rounded-xl border border-border p-4 shadow-sm md:col-span-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Monthly Expense Trend
                  </p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={fmtAxis}
                      />
                      <Tooltip
                        formatter={(v: number) => [fmtCurrency(v), "Expenses"]}
                      />
                      <Bar
                        dataKey="total"
                        fill="#8b5cf6"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* By status */}
                <div className="bg-white rounded-xl border border-border p-4 shadow-sm md:col-span-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    By Status
                  </p>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={summary.byStatus ?? []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="status"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) =>
                          STATUS_CFG[v]?.label ?? v.replace(/_/g, " ")
                        }
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={fmtAxis}
                      />
                      <Tooltip
                        formatter={(v: number) => [fmtCurrency(v), "Amount"]}
                        labelFormatter={(l) =>
                          STATUS_CFG[l]?.label ?? l.replace(/_/g, " ")
                        }
                      />
                      <Bar
                        dataKey="total"
                        fill="#f59e0b"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        );
      }
    }
  };

  // ── Print content ────────────────────────────────────────────────────────────
  const printTableHtml = `
  <table>
    <thead><tr>${activeColumns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${(Array.isArray(currentData.data) ? currentData.data : [])
      .map((row: any) =>
        `<tr>${activeColumns.map((c) => `<td>${escapeHtml(String(c.csv ? c.csv(row) : ""))}</td>`).join("")}</tr>`
      )
      .join("")}</tbody>
  </table>`;

  return (
    <div className="min-h-screen bg-muted/50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-border px-1 py-2 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                {title}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCharts((v) => !v)}
                className="px-1 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted/50 flex items-center gap-1.5 transition-colors"
              >
                {showCharts ? "🙈 Hide Charts" : "📊 Show Charts"}
              </button>
              <button
                onClick={handleExportCSV}
                disabled={loading || exporting}
                className="px-3 py-2 text-sm rounded-lg border border-primary text-primary hover:bg-primary-muted/60 flex items-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading || exporting ? "⏳ Loading…" : "⬇ Export CSV"}
              </button>
              <button
                onClick={handlePrint}
                disabled={loading}
                className="px-3 py-2 text-sm rounded-lg bg-foreground text-white hover:bg-foreground flex items-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "⏳ Loading…" : "🖨 Print"}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 mt-1 -mb-px">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-input"
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
                {currentData.pagination.total > 0 && activeTab === t.id && (
                  <span className="bg-primary-muted text-primary text-xs rounded-full px-1.5 py-0.5 font-semibold tabular-nums">
                    {currentData.pagination.total.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-1 py-2 space-y-1">
        {error && (
          <div className="bg-danger-muted/60 border border-danger/25 text-danger px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <span>⚠️</span> {error}
            <button
              onClick={fetchReport}
              className="ml-auto text-danger underline text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {/* Filters */}
        <FilterBar
          filters={filters}
          onChange={updateFilters}
          extra={filterExtras}
          chips={activeFilterChips}
          onReset={() => {
            setFilters({ ...DEFAULT_FILTERS, limit: filters.limit });
            setPage(1);
          }}
        />

        {/* Summary & Charts */}
        {renderSummary()}

        {/* Table card */}
        <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <p className="text-sm font-semibold text-foreground">
              {TABS.find((t) => t.id === activeTab)?.label}
              {!loading && currentData.pagination.total > 0 && (
                <span className="ml-2 text-muted-foreground/70 font-normal text-xs">
                  {currentData.pagination.total.toLocaleString()} total
                </span>
              )}
            </p>
            <button
              onClick={fetchReport}
              className={`text-xs text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 transition-colors ${loading ? "animate-pulse" : ""}`}
            >
              🔄 {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          <DataTable
            columns={activeColumns}
            rows={currentData.data}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            loading={loading}
          />

          <div className="border-t border-border/60 px-4">
            <Pagination
              page={page}
              totalPages={currentData.pagination.totalPages ?? 1}
              total={currentData.pagination.total ?? 0}
              limit={filters.limit}
              onPage={setPage}
            />
          </div>
        </div>
      </div>

      {/* ── Hidden print target ───────────────────────────────────────────── */}
      <div ref={printRef} style={{ display: "none" }}>
        <h1>
          Financial Report — {TABS.find((t) => t.id === activeTab)?.label}
        </h1>
        <p>
          Generated: {new Date().toLocaleString()} · Records:{" "}
          {currentData.pagination.total}
        </p>
        <div dangerouslySetInnerHTML={{ __html: printTableHtml }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC REPORTS — the financial reporting surface is split into two pages
// ══════════════════════════════════════════════════════════════════════════════

const SALES_TABS: TabId[] = ["invoices", "receipts"];
const EXPENSE_TABS: TabId[] = ["expenses", "payments"];

/** Invoices / Sales & Receipts — the money-in side. */
export function SalesReports(): JSX.Element {
  return (
    <FinancialReportsView
      tabs={SALES_TABS}
      title="Sales/Invoices & Receipts"
      subtitle="Invoices · Sales · Receipts"
    />
  );
}

/** Expenses & Payments — the money-out side. */
export function ExpensePaymentsReports(): JSX.Element {
  return (
    <FinancialReportsView
      tabs={EXPENSE_TABS}
      title="Expenses & Payments"
      subtitle="Expenses · Payments · Cash Flow"
    />
  );
}
