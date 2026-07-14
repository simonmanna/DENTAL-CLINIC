// src/pages/reports/FinancialReports.tsx
import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
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
  financialReportingApi,
  FinancialReportFilters,
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

type SortOrder = "asc" | "desc";

interface FilterState {
  search: string;
  startDate: string;
  endDate: string;
  patientId: string;
  dentistId: string;
  accountId: string;
  status: string;
  paymentStatus: string;
  method: string;
  type: string;
  direction: string;
  currency: string;
  category: string;
  limit: number;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  startDate: "",
  endDate: "",
  patientId: "",
  dentistId: "",
  accountId: "",
  status: "",
  paymentStatus: "",
  method: "",
  type: "",
  direction: "",
  currency: "",
  category: "",
  limit: 20,
};

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
  DRAFT: { cls: "bg-slate-100 text-slate-600 ring-slate-200", label: "Draft" },
  POSTED: { cls: "bg-sky-50 text-sky-700 ring-sky-200", label: "Posted" },
  VOID: { cls: "bg-red-50 text-red-500 ring-red-200", label: "Void" },
  // Payment & expense statuses (non-invoice)
  COMPLETED: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Completed" },
  PENDING: { cls: "bg-orange-50 text-orange-700 ring-orange-200", label: "Pending" },
  FAILED: { cls: "bg-red-50 text-red-600 ring-red-200", label: "Failed" },
  APPROVED: { cls: "bg-blue-50 text-blue-700 ring-blue-200", label: "Approved" },
  REJECTED: { cls: "bg-red-50 text-red-600 ring-red-200", label: "Rejected" },
  PAID: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Paid" },
  CANCELLED: { cls: "bg-slate-100 text-slate-500 ring-slate-200", label: "Cancelled" },
};

// ── Payment status (separate from invoice status) ────────────────────────────
const PAYMENT_STATUS_CFG: Record<string, { cls: string; label: string }> = {
  UNPAID: { cls: "bg-red-50 text-red-600 ring-red-200", label: "Unpaid" },
  PARTIALLY_PAID: { cls: "bg-amber-50 text-amber-700 ring-amber-200", label: "Partial" },
  PAID: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Paid" },
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

function PaymentStatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  const cfg = PAYMENT_STATUS_CFG[status] ?? {
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

// ─── Direction badge ──────────────────────────────────────────────────────────

function DirectionBadge({ direction }: { direction: string }) {
  return direction === "IN" ? (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
      ↑ IN
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">
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
    <div className="bg-white rounded-xl border border-slate-200 px-1 py-2 flex gap-2 items-start shadow-sm">
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
    <span className="ml-1 text-sky-600">{sortOrder === "asc" ? "↑" : "↓"}</span>
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
            className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {label}
          </button>
        ))}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`px-2.5 py-1 text-xs rounded border ${p === page ? "bg-sky-600 border-sky-600 text-white font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {p}
          </button>
        ))}
        {["›", "»"].map((label, i) => (
          <button
            key={label}
            onClick={() => onPage(i === 0 ? page + 1 : totalPages)}
            disabled={page === totalPages}
            className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  setFilters,
  extra,
  onReset,
}: {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  extra?: React.ReactNode;
  onReset: () => void;
}) {
  const set =
    (key: keyof FilterState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-1 flex flex-wrap gap-3 items-end shadow-sm">
      <div className="flex-1 min-w-48">
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Search
        </label>
        <input
          value={filters.search}
          onChange={set("search")}
          placeholder="Invoice #, patient, reference…"
          className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent placeholder:text-slate-400"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          From
        </label>
        <input
          type="date"
          value={filters.startDate}
          onChange={set("startDate")}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          To
        </label>
        <input
          type="date"
          value={filters.endDate}
          onChange={set("endDate")}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>
      {extra}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Rows
        </label>
        <select
          value={filters.limit}
          onChange={set("limit")}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
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
      <div className="flex items-center justify-center h-48 text-slate-400">
        <div className="flex items-center gap-3">
          <div className="size-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading report…</span>
        </div>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400">
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
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => col.sortable !== false && onSort(col.key)}
                className={`px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap ${col.sortable !== false ? "cursor-pointer hover:text-slate-900 select-none" : ""}`}
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

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(filename: string, columns: ColDef<any>[], rows: any[]) {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((row) =>
    columns
      .map((c) => `"${String(c.csv ? c.csv(row) : "").replace(/"/g, '""')}"`)
      .join(","),
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
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
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

const INVOICE_COLUMNS: ColDef<InvoiceRow>[] = [
  {
    key: "invoiceNumber",
    label: "Invoice #",
    render: (r) => (
      <span className="font-mono text-xs text-slate-600 font-medium">
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
        <p className="font-medium text-slate-900 text-sm">
          {fullName(r.patient)}
        </p>
        <p className="text-xs text-slate-400">{r.patient?.patientCode}</p>
      </div>
    ),
    csv: (r) => `${fullName(r.patient)} (${r.patient?.patientCode ?? ""})`,
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
      <span className="tabular-nums font-semibold text-slate-900">
        {fmtCurrency(r.total, r.currency)}
      </span>
    ),
    csv: (r) => r.total,
  },
  {
    key: "amountPaid",
    label: "Paid",
    render: (r) => (
      <span className="tabular-nums text-emerald-700 font-medium">
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
        className={`tabular-nums font-medium ${r.balance > 0 ? "text-red-600" : "text-slate-400"}`}
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
      <span className="text-xs text-slate-500 tabular-nums">
        {r.items?.length ?? 0} items
      </span>
    ),
    csv: (r) => r.items?.length ?? 0,
  },
  {
    key: "createdAt",
    label: "Created",
    render: (r) => (
      <span className="text-xs text-slate-400">{fmtDate(r.createdAt)}</span>
    ),
    csv: (r) => fmtDate(r.createdAt),
  },
];

const RECEIPT_COLUMNS: ColDef<ReceiptRow>[] = [
  {
    key: "receiptNumber",
    label: "Receipt #",
    render: (r) => (
      <span className="font-mono text-xs font-medium text-slate-600">
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
        <p className="font-medium text-slate-900 text-sm">
          {fullName(r.invoice?.patient)}
        </p>
        <p className="text-xs text-slate-400">
          {r.invoice?.patient?.patientCode}
        </p>
      </div>
    ),
    csv: (r) => fullName(r.invoice?.patient),
  },
  {
    key: "invoiceNumber",
    label: "Invoice",
    sortable: false,
    render: (r) => (
      <div>
        <span className="font-mono text-xs text-sky-600">
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
            isVoid ? "text-slate-400 line-through" : "text-emerald-700"
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
      <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
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
      <span className="text-xs text-slate-500 font-mono">
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
      <span className="text-xs text-slate-500">{fullName(r.receivedBy)}</span>
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
            isUsd ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
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
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200";
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
      <span className="text-xs text-slate-500">
        {fmtDateTime(r.generatedAt)}
      </span>
    ),
    csv: (r) => fmtDateTime(r.generatedAt),
  },
];

const PAYMENT_COLUMNS: ColDef<PaymentRow>[] = [
  {
    key: "paymentCode",
    label: "Payment #",
    render: (r) => (
      <span className="font-mono text-xs text-slate-500 font-medium">
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
      <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
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
      <span className="text-sm font-medium text-slate-700">
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
      <span className="font-mono text-xs text-sky-600">
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
        className={`tabular-nums font-semibold ${r.direction === "IN" ? "text-emerald-700" : "text-red-600"}`}
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
      <span className="text-xs font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">
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
      <span className="text-xs text-slate-500">{r.account ?? "—"}</span>
    ),
    csv: (r) => r.account ?? "",
  },
  {
    key: "reference",
    label: "Reference",
    sortable: false,
    render: (r) => (
      <span className="font-mono text-xs text-slate-400">
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
      <span className="text-xs text-slate-500">{r.receivedBy ?? "—"}</span>
    ),
    csv: (r) => r.receivedBy ?? "",
  },
  {
    key: "paidAt",
    label: "Date",
    render: (r) => (
      <span className="text-xs text-slate-400">{fmtDateTime(r.paidAt)}</span>
    ),
    csv: (r) => fmtDateTime(r.paidAt),
  },
];

const EXPENSE_COLUMNS: ColDef<ExpenseRow>[] = [
  {
    key: "expenseCode",
    label: "Expense #",
    render: (r) => (
      <span className="font-mono text-xs text-slate-600 font-medium">
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
        <p className="font-medium text-slate-900 text-sm">{r.title}</p>
        {r.description && (
          <p
            className="text-xs text-slate-400 max-w-[200px] truncate"
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
      <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
        {r.category.replace(/_/g, " ")}
      </span>
    ),
    csv: (r) => r.category,
  },
  {
    key: "amount",
    label: "Amount",
    render: (r) => (
      <span className="tabular-nums font-semibold text-slate-900">
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
      <span className="tabular-nums text-emerald-700 font-medium">
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
      <span className="text-xs text-slate-600">{r.createdByName ?? "—"}</span>
    ),
    csv: (r) => r.createdByName ?? "",
  },
  {
    key: "approvedByName",
    label: "Approved By",
    sortable: false,
    render: (r) => (
      <span className="text-xs text-slate-600">{r.approvedByName ?? "—"}</span>
    ),
    csv: (r) => r.approvedByName ?? "",
  },
  {
    key: "expenseDate",
    label: "Date",
    render: (r) => (
      <span className="text-xs text-slate-500">{fmtDate(r.expenseDate)}</span>
    ),
    csv: (r) => fmtDate(r.expenseDate),
  },
  {
    key: "paidAt",
    label: "Paid At",
    render: (r) => (
      <span className="text-xs text-slate-400">{fmtDate(r.paidAt)}</span>
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
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

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

const fetchReport = useCallback(async () => {
  setLoading(true);
  setError(null);
  
  const apiFilters: FinancialReportFilters = {
    search: filters.search || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    patientId: filters.patientId || undefined,
    dentistId: filters.dentistId || undefined,
    accountId: filters.accountId || undefined,
    status: filters.status || undefined,
    paymentStatus: filters.paymentStatus || undefined,
    method: filters.method || undefined,
    type: filters.type || undefined,
    direction: filters.direction || undefined,
    currency: filters.currency || undefined,
    category: (filters as any).category || undefined,
    page,
    limit: filters.limit,
    sortBy,
    sortOrder,
  };

  try {
    // Helper to extract payload from Axios or fetch responses
    const extractPayload = (response: any) => {
      // Axios: response.data contains the actual payload
      if (response?.data?.data !== undefined && Array.isArray(response.data.data)) {
        return response.data;
      }
      // Direct payload (no wrapper)
      if (Array.isArray(response?.data) || response?.pagination) {
        return response;
      }
      // Fallback
      return { data: [], pagination: {}, summary: {} };
    };

    let rawResponse;
    switch (activeTab) {
      case "invoices":
        rawResponse = await financialReportingApi.getInvoicesReport(apiFilters);
        setInvoiceData(extractPayload(rawResponse));
        break;
      case "receipts":
        rawResponse = await financialReportingApi.getReceiptsReport(apiFilters);
        setReceiptData(extractPayload(rawResponse));
        break;
      case "payments":
        rawResponse = await financialReportingApi.getPaymentsReport(apiFilters);
        setPaymentData(extractPayload(rawResponse));
        break;
      case "expenses":
        rawResponse = await financialReportingApi.getExpensesReport(apiFilters);
        setExpenseData(extractPayload(rawResponse));
        break;
    }
  } catch (e: any) {
    console.error("Fetch error:", e);
    setError(e.message ?? "Failed to load report");
  } finally {
    setLoading(false);
  }
}, [activeTab, filters, page, sortBy, sortOrder]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);
  useEffect(() => {
    setPage(1);
  }, [filters, activeTab]);

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
    setFilters(DEFAULT_FILTERS);
    setPage(1);
    setSortBy("createdAt");
    setSortOrder("desc");
    setError(null);
  };

  const activeColumns: ColDef<any>[] = useMemo(() => {
    switch (activeTab) {
      case "invoices":
        return INVOICE_COLUMNS;
      case "receipts":
        return RECEIPT_COLUMNS;
      case "payments":
        return PAYMENT_COLUMNS;
      case "expenses":
        return EXPENSE_COLUMNS;
    }
  }, [activeTab]);

  const handleExportCSV = () => {
  const rows = Array.isArray(currentData.data) ? currentData.data : [];
  exportCSV(
    `${activeTab}-report-${new Date().toISOString().slice(0, 10)}.csv`,
    activeColumns,
    rows,
  );
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
    w.print();
    w.close();
  };

  const summary = currentData.summary ?? {};

  // ── Invoice-specific filter extras ──────────────────────────────────────────
  const invoiceExtras = (
    <>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Invoice Status
        </label>
        <select
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value }))
          }
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">All</option>
          {["DRAFT", "POSTED", "VOID"].map((s) => (
            <option key={s} value={s}>
              {STATUS_CFG[s]?.label ?? s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Payment Status
        </label>
        <select
          value={filters.paymentStatus}
          onChange={(e) =>
            setFilters((f) => ({ ...f, paymentStatus: e.target.value }))
          }
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">All</option>
          {["UNPAID", "PARTIALLY_PAID", "PAID"].map((s) => (
            <option key={s} value={s}>
              {PAYMENT_STATUS_CFG[s]?.label ?? s}
            </option>
          ))}
        </select>
      </div>
    </>
  );

  const paymentExtras = (
    <>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Type
        </label>
        <select
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
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
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Direction
        </label>
        <select
          value={filters.direction}
          onChange={(e) =>
            setFilters((f) => ({ ...f, direction: e.target.value }))
          }
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">All</option>
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Method
        </label>
        <select
          value={filters.method}
          onChange={(e) =>
            setFilters((f) => ({ ...f, method: e.target.value }))
          }
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
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
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Status
        </label>
        <select
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value }))
          }
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
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
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Category
        </label>
        <select
          value={(filters as any).category ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, category: e.target.value }) as any)
          }
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
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

  const filterExtras =
    activeTab === "invoices"
      ? invoiceExtras
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
                label="Total Revenue"
                value={fmtCurrency(summary.totalRevenue)}
                icon="💰"
                accent="#8b5cf6"
              />
              <StatCard
                label="Total Collected"
                value={fmtCurrency(summary.totalCollected)}
                icon="✅"
                accent="#10b981"
              />
              <StatCard
                label="Outstanding"
                value={fmtCurrency(summary.outstandingAmount ?? summary.totalOutstanding)}
                sub={`${summary.outstandingCount ?? 0} invoices`}
                icon="⏳"
                accent="#f59e0b"
              />
              <StatCard
                label="Collection Rate"
                value={`${summary.collectionRate ?? (summary.totalRevenue ? Math.round((summary.totalCollected / summary.totalRevenue) * 100) : 0)}%`}
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
                      total: s.total,
                    }))}
                    title="Revenue by Invoice Status"
                  />

                  {/* Payment status breakdown */}
                  <PieBreakdown
                    data={(summary.paymentStatusBreakdown ?? []).map((s: any) => ({
                      name: PAYMENT_STATUS_CFG[s.paymentStatus]?.label ?? s.paymentStatus,
                      total: s.balance || s.total,
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
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
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
                                <span className="text-xs font-medium text-slate-600">
                                  {b.label}
                                </span>
                                <span className="text-xs tabular-nums text-slate-500">
                                  {fmtCurrency(b.amount)} ({b.count})
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
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
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
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
                          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
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
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                      Revenue by Doctor
                    </p>
                    <div className="space-y-2">
                      {(summary.revenueByDoctor ?? [])
                        .slice(0, 6)
                        .map((d: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs font-medium text-slate-700 truncate">
                                  {d.name}
                                </span>
                                <span className="text-xs tabular-nums text-slate-500 ml-2">
                                  {fmtCurrency(d.total)}
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-sky-500"
                                  style={{
                                    width: `${summary.totalRevenue ? Math.round((d.total / summary.totalRevenue) * 100) : 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      {!summary.revenueByDoctor?.length && (
                        <p className="text-xs text-slate-400 text-center py-1">
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
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md tracking-wide ${
                              c.currency === "USD"
                                ? "bg-blue-100 text-blue-700"
                                : c.currency === "UGX"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {c.currency}
                          </span>
                          <span className="text-xs text-slate-500">
                            {c.count} {c.count === 1 ? "receipt" : "receipts"}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">
                            Collected
                          </p>
                          <p className="text-base font-bold text-slate-800 tabular-nums">
                            {fmtCurrency(c.total, c.currency)}
                          </p>
                        </div>
                        {!isBase && (
                          <div className="pl-2 border-l border-slate-100">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400">
                              ≈ Base (UGX)
                            </p>
                            <p className="text-sm font-semibold text-emerald-600 tabular-nums">
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
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
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
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
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
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm md:col-span-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Monthly Expense Trend
                  </p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
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
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm md:col-span-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
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
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
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
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-1 py-2 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {title}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCharts((v) => !v)}
                className="px-1 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
              >
                {showCharts ? "🙈 Hide Charts" : "📊 Show Charts"}
              </button>
              <button
                onClick={handleExportCSV}
                className="px-3 py-2 text-sm rounded-lg border border-sky-600 text-sky-700 hover:bg-sky-50 flex items-center gap-1.5 font-medium transition-colors"
              >
                ⬇ Export CSV
              </button>
              <button
                onClick={handlePrint}
                className="px-3 py-2 text-sm rounded-lg bg-slate-800 text-white hover:bg-slate-700 flex items-center gap-1.5 font-medium transition-colors"
              >
                🖨 Print
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
                    ? "border-sky-600 text-sky-700"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
                {currentData.pagination.total > 0 && activeTab === t.id && (
                  <span className="bg-sky-100 text-sky-700 text-xs rounded-full px-1.5 py-0.5 font-semibold tabular-nums">
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
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <span>⚠️</span> {error}
            <button
              onClick={fetchReport}
              className="ml-auto text-red-600 underline text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {/* Filters */}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          extra={filterExtras}
          onReset={() => {
            setFilters(DEFAULT_FILTERS);
            setPage(1);
          }}
        />

        {/* Summary & Charts */}
        {renderSummary()}

        {/* Table card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">
              {TABS.find((t) => t.id === activeTab)?.label}
              {!loading && currentData.pagination.total > 0 && (
                <span className="ml-2 text-slate-400 font-normal text-xs">
                  {currentData.pagination.total.toLocaleString()} total
                </span>
              )}
            </p>
            <button
              onClick={fetchReport}
              className={`text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors ${loading ? "animate-pulse" : ""}`}
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

          <div className="border-t border-slate-100 px-4">
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
