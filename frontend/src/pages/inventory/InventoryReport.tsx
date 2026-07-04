import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

// ─── API base ────────────────────────────────────────────────────────────────
const API_BASE = "/inventory/reports";

import { inventoryApi } from "@/lib/api/inventory.api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LocationStock {
  id: string;
  quantity: number;
  location: { id: string; name: string; type: string };
}

interface Category {
  id: string;
  name: string;
  color?: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface ItemRow {
  id: string;
  itemCode: string;
  name: string;
  description?: string;
  unit: string;
  uom: string;
  type: string;
  isActive: boolean;
  unitCost: number;
  minQuantity: number;
  batchTracking: boolean;
  category?: Category;
  supplier?: Supplier;
  locationStocks: LocationStock[];
  totalQuantity: number;
  stockValue: number;
  isLowStock: boolean;
  createdAt: string;
  _count: { ledgerEntries: number; purchaseOrderItems: number };
}

interface LedgerRow {
  id: string;
  ledgerCode: string;
  type: string;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  unitCost: number;
  totalValue: number;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  createdAt: string;
  item?: {
    id: string;
    name: string;
    itemCode: string;
    unit: string;
    category?: Category;
  };
  location?: { id: string; name: string; type: string };
  batch?: { id: string; batchNumber?: string; expiryDate?: string };
  performedBy?: { id: string; email: string };
  performedByStaff?: { id: string; firstName: string; lastName: string };
}

type Row = ItemRow | LedgerRow;

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ItemSummary {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalStockValue: number;
  typeBreakdown: Record<string, number>;
  categoryBreakdown: { id: string; name: string; color?: string; count: number }[];
}

interface LedgerSummary {
  totalTransactions: number;
  totalIn: number;
  totalOut: number;
  netQuantity: number;
  totalValueIn: number;
  totalValueOut: number;
  netValue: number;
  typeBreakdown: Record<string, { count: number; value: number; qty: number }>;
}

type Summary = ItemSummary | LedgerSummary;

interface ApiResponse {
  data: Row[];
  pagination: Pagination;
  summary: Summary;
}

type SortOrder = "asc" | "desc";
type TabId = "items" | "ledger";

interface FilterState {
  search: string;
  categoryId: string;
  supplierId: string;
  type: string;
  locationId: string;
  referenceType: string;
  dateFrom: string;
  dateTo: string;
  isActive: string;
  lowStock: boolean;
  limit: number;
}

interface ColumnDef<T = Row> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  csv?: (row: T) => string | number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LEDGER_TYPE_COLORS: Record<string, string> = {
  PURCHASE_RECEIPT: "#10b981",
  ADJUSTMENT_IN: "#3b82f6",
  ADJUSTMENT_OUT: "#f59e0b",
  WASTE: "#ef4444",
  TRANSFER_IN: "#8b5cf6",
  TRANSFER_OUT: "#ec4899",
  USAGE: "#f97316",
  SALE: "#14b8a6",
  RETURN_IN: "#6366f1",
  RETURN_TO_SUPPLIER: "#84cc16",
  OPENING_BALANCE: "#64748b",
  EXPIRY_WRITE_OFF: "#dc2626",
  STOCK_OUT: "#ea580c",
};

const LEDGER_TYPE_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Purchase Receipt",
  ADJUSTMENT_IN: "Adjustment In",
  ADJUSTMENT_OUT: "Adjustment Out",
  WASTE: "Waste",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  USAGE: "Usage",
  SALE: "Sale",
  RETURN_IN: "Return In",
  RETURN_TO_SUPPLIER: "Return to Supplier",
  OPENING_BALANCE: "Opening Balance",
  EXPIRY_WRITE_OFF: "Expiry Write-off",
  STOCK_OUT: "Stock Out",
};

const TYPE_ITEM_COLORS: Record<string, string> = {
  MEDICINE: "#10b981",
  CONSUMABLE: "#3b82f6",
  EQUIPMENT: "#8b5cf6",
};

const CHART_PALETTE = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

const DEFAULT_FILTERS: FilterState = {
  search: "",
  categoryId: "",
  supplierId: "",
  type: "",
  locationId: "",
  referenceType: "",
  dateFrom: "",
  dateTo: "",
  isActive: "",
  lowStock: false,
  limit: 25,
};

// ─── Utilities ───────────────────────────────────────────────────────────────

const fmtCurrency = (v?: number | null): string =>
  `UGX ${Number(v || 0).toLocaleString("en-UG", { minimumFractionDigits: 0 })}`;

const fmtDate = (d?: string | null): string =>
  d ? new Date(d).toLocaleDateString("en-GB") : "—";

const fmtQty = (n: number, unit?: string): string =>
  `${Number(n).toLocaleString()} ${unit ?? ""}`.trim();

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function exportCSV(filename: string, columns: ColumnDef<any>[], rows: Row[]) {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((row) =>
    columns
      .map((c) => `"${String(c.csv ? c.csv(row) : "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ text, color }: { text: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
      style={
        color
          ? { background: color + "18", color}
          : { background: "#f1f5f9", color: "#475569" }
      }
    >
      {text}
    </span>
  );
}

function LedgerTypeBadge({ type }: { type: string }) {
  const color = LEDGER_TYPE_COLORS[type] ?? "#64748b";
  const label = LEDGER_TYPE_LABELS[type] ?? type;
  const isIn = ["PURCHASE_RECEIPT", "ADJUSTMENT_IN", "TRANSFER_IN", "RETURN_IN", "OPENING_BALANCE"].includes(type);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
      style={{ background: color + "18", color, borderColor: color + "40" }}
    >
      <span>{isIn ? "▲" : "▼"}</span>
      {label}
    </span>
  );
}

function StockIndicator({ qty, min }: { qty: number; min: number }) {
  const pct = min > 0 ? Math.min((qty / min) * 100, 200) : 100;
  const color = qty === 0 ? "#ef4444" : qty < min ? "#f59e0b" : "#10b981";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
      <span className="tabular-nums text-xs font-medium" style={{ color }}>
        {qty === 0 ? "Out" : qty < min ? "Low" : "OK"}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent = "#10b981",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
  icon?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-2 flex gap-3 items-start shadow-sm">
      {icon && (
        <div
          className="mt-0.5 size-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: accent + "18" }}
        >
          <span style={{ color: accent }} className="text-base">{icon}</span>
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">{label}</p>
        <p className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SortIcon({ col, sortBy, sortOrder }: { col: string; sortBy: string; sortOrder: SortOrder }) {
  if (sortBy !== col) return <span className="ml-1 text-slate-300">↕</span>;
  return <span className="ml-1 text-emerald-600">{sortOrder === "asc" ? "↑" : "↓"}</span>;
}

function Pagination({
  page, totalPages, total, limit, onPage,
}: {
  page: number; totalPages: number; total: number; limit: number; onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) pages.push(i);

  return (
    <div className="flex items-center justify-between px-1 py-3">
      <p className="text-sm text-slate-500">
        Showing <span className="font-medium">{(page - 1) * limit + 1}</span>–
        <span className="font-medium">{Math.min(page * limit, total)}</span>{" "}
        of <span className="font-medium">{total}</span>
      </p>
      <div className="flex gap-1">
        {[
          { label: "«", target: 1, disabled: page === 1 },
          { label: "‹", target: page - 1, disabled: page === 1 },
        ].map(({ label, target, disabled }) => (
          <button
            key={label}
            onClick={() => onPage(target)}
            disabled={disabled}
            className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {label}
          </button>
        ))}
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
        {[
          { label: "›", target: page + 1, disabled: page === totalPages },
          { label: "»", target: totalPages, disabled: page === totalPages },
        ].map(({ label, target, disabled }) => (
          <button
            key={label}
            onClick={() => onPage(target)}
            disabled={disabled}
            className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniDonut({ data, title }: { data: { name: string; value: number; color?: string }[]; title: string }) {
  if (!data.length) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{title}</p>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={2}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color ?? CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => [v.toLocaleString(), ""]} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function DataTable<T extends { id?: string }>({
  columns, rows, sortBy, sortOrder, onSort, loading,
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
        <span className="text-3xl mb-2">📦</span>
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
                  <SortIcon col={col.key} sortBy={sortBy} sortOrder={sortOrder} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="hover:bg-slate-50/60 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
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

// ─── Column Definitions ────────────────────────────────────────────────────

const ITEM_COLUMNS: ColumnDef<ItemRow>[] = [
  {
    key: "itemCode",
    label: "Code",
    render: (r) => <span className="font-mono text-xs text-slate-400">{r.itemCode}</span>,
    csv: (r) => r.itemCode,
  },
  {
    key: "name",
    label: "Item Name",
    render: (r) => (
      <div>
        <p className="font-medium text-slate-900 max-w-[200px] truncate">{r.name}</p>
        {r.description && (
          <p className="text-xs text-slate-400 max-w-[200px] truncate">{r.description}</p>
        )}
      </div>
    ),
    csv: (r) => r.name,
  },
  {
    key: "type",
    label: "Type",
    render: (r) => <Badge text={r.type} color={TYPE_ITEM_COLORS[r.type]} />,
    csv: (r) => r.type,
  },
  {
    key: "category",
    label: "Category",
    sortable: false,
    render: (r) => r.category ? <Badge text={r.category.name} color={r.category.color ?? undefined} /> : <span className="text-slate-300">—</span>,
    csv: (r) => r.category?.name ?? "",
  },
  {
    key: "supplier",
    label: "Supplier",
    sortable: false,
    render: (r) => <span className="text-xs text-slate-500">{r.supplier?.name ?? "—"}</span>,
    csv: (r) => r.supplier?.name ?? "",
  },
  {
    key: "totalQuantity",
    label: "Total Qty",
    render: (r) => (
      <div>
        <span className="font-medium tabular-nums">{fmtQty(r.totalQuantity, r.unit)}</span>
        <StockIndicator qty={r.totalQuantity} min={r.minQuantity} />
      </div>
    ),
    csv: (r) => r.totalQuantity,
  },
//   {
//     key: "locations",
//     label: "Locations",
//     sortable: false,
//     render: (r) => (
//       <div className="flex flex-col gap-0.5 max-w-[140px]">
//         {r.locationStocks.slice(0, 2).map((ls) => (
//           <span key={ls.id} className="text-xs text-slate-500 truncate">
//             {ls.location.name}: <span className="font-medium text-slate-700">{ls.quantity}</span>
//           </span>
//         ))}
//         {r.locationStocks.length > 2 && (
//           <span className="text-xs text-slate-400">+{r.locationStocks.length - 2} more</span>
//         )}
//       </div>
//     ),
//     csv: (r) => r.locationStocks.map((ls) => `${ls.location.name}:${ls.quantity}`).join("; "),
//   },
  {
    key: "locations",
    label: "Locations",
    sortable: false,
    render: (r) => (
      <div className="flex flex-col gap-0.5 max-w-[140px]">
        {(r.locationStocks ?? []).slice(0, 2).map((ls) => (
          <span key={ls.id} className="text-xs text-slate-500 truncate">
            {ls.location.name}: <span className="font-medium text-slate-700">{ls.quantity}</span>
          </span>
        ))}
        {(r.locationStocks ?? []).length > 2 && (
          <span className="text-xs text-slate-400">+{(r.locationStocks ?? []).length - 2} more</span>
        )}
      </div>
    ),
    csv: (r) => (r.locationStocks ?? []).map((ls) => `${ls.location.name}:${ls.quantity}`).join("; "),
  },
{
    key: "minQuantity",
    label: "Min Qty",
    render: (r) => <span className="tabular-nums text-xs text-slate-500">{r.minQuantity} {r.unit}</span>,
    csv: (r) => r.minQuantity,
  },
  {
    key: "unitCost",
    label: "Unit Cost",
    render: (r) => <span className="tabular-nums font-medium">{fmtCurrency(r.unitCost)}</span>,
    csv: (r) => r.unitCost,
  },
  {
    key: "stockValue",
    label: "Stock Value",
    render: (r) => <span className="tabular-nums font-medium text-emerald-700">{fmtCurrency(r.stockValue)}</span>,
    csv: (r) => r.stockValue,
  },
  {
    key: "isActive",
    label: "Status",
    render: (r) => (
      <span className={`text-xs font-medium ${r.isActive ? "text-emerald-600" : "text-slate-400"}`}>
        {r.isActive ? "Active" : "Inactive"}
      </span>
    ),
    csv: (r) => (r.isActive ? "Active" : "Inactive"),
  },
  {
    key: "batchTracking",
    label: "Batch",
    render: (r) => (
      <span className={`text-xs ${r.batchTracking ? "text-purple-600 font-medium" : "text-slate-300"}`}>
        {r.batchTracking ? "Tracked" : "—"}
      </span>
    ),
    csv: (r) => (r.batchTracking ? "Yes" : "No"),
  },
  {
    key: "createdAt",
    label: "Added",
    render: (r) => <span className="text-xs text-slate-400">{fmtDate(r.createdAt)}</span>,
    csv: (r) => fmtDate(r.createdAt),
  },
];

const LEDGER_COLUMNS: ColumnDef<LedgerRow>[] = [
  {
    key: "ledgerCode",
    label: "Code",
    render: (r) => <span className="font-mono text-xs text-slate-400">{r.ledgerCode}</span>,
    csv: (r) => r.ledgerCode,
  },
  {
    key: "createdAt",
    label: "Date",
    render: (r) => <span className="text-xs text-slate-500">{fmtDate(r.createdAt)}</span>,
    csv: (r) => fmtDate(r.createdAt),
  },
  {
    key: "type",
    label: "Transaction Type",
    render: (r) => <LedgerTypeBadge type={r.type} />,
    csv: (r) => LEDGER_TYPE_LABELS[r.type] ?? r.type,
  },
  {
    key: "item",
    label: "Item",
    sortable: false,
    render: (r) => (
      <div>
        <p className="font-medium text-slate-900 max-w-[180px] truncate">{r.item?.name ?? "—"}</p>
        <p className="text-xs text-slate-400">{r.item?.itemCode}</p>
      </div>
    ),
    csv: (r) => `${r.item?.name ?? ""} (${r.item?.itemCode ?? ""})`,
  },
  {
    key: "category",
    label: "Category",
    sortable: false,
    render: (r) => r.item?.category ? (
      <Badge text={r.item.category.name} color={r.item.category.color ?? undefined} />
    ) : <span className="text-slate-300">—</span>,
    csv: (r) => r.item?.category?.name ?? "",
  },
  {
    key: "location",
    label: "Location",
    sortable: false,
    render: (r) => <span className="text-xs text-slate-600">{r.location?.name ?? "—"}</span>,
    csv: (r) => r.location?.name ?? "",
  },
  {
    key: "quantityChange",
    label: "Qty Change",
    render: (r) => (
      <span
        className={`tabular-nums font-semibold ${r.quantityChange > 0 ? "text-emerald-600" : "text-red-500"}`}
      >
        {r.quantityChange > 0 ? "+" : ""}{r.quantityChange} {r.item?.unit ?? ""}
      </span>
    ),
    csv: (r) => r.quantityChange,
  },
  {
    key: "quantityBefore",
    label: "Before",
    render: (r) => <span className="tabular-nums text-xs text-slate-500">{r.quantityBefore}</span>,
    csv: (r) => r.quantityBefore,
  },
  {
    key: "quantityAfter",
    label: "After",
    render: (r) => <span className="tabular-nums text-xs text-slate-500">{r.quantityAfter}</span>,
    csv: (r) => r.quantityAfter,
  },
  {
    key: "unitCost",
    label: "Unit Cost",
    render: (r) => <span className="tabular-nums text-xs">{fmtCurrency(r.unitCost)}</span>,
    csv: (r) => r.unitCost,
  },
  {
    key: "totalValue",
    label: "Total Value",
    render: (r) => (
      <span className={`tabular-nums font-medium ${r.quantityChange > 0 ? "text-emerald-700" : "text-red-600"}`}>
        {fmtCurrency(r.totalValue)}
      </span>
    ),
    csv: (r) => r.totalValue,
  },
  {
    key: "referenceType",
    label: "Source",
    render: (r) => r.referenceType ? (
      <span className="text-xs text-slate-500">{r.referenceType}</span>
    ) : <span className="text-slate-300">—</span>,
    csv: (r) => r.referenceType ?? "",
  },
  {
    key: "batch",
    label: "Batch",
    sortable: false,
    render: (r) => r.batch?.batchNumber ? (
      <div>
        <span className="text-xs font-mono text-purple-600">{r.batch.batchNumber}</span>
        {r.batch.expiryDate && (
          <p className="text-xs text-slate-400">Exp: {fmtDate(r.batch.expiryDate)}</p>
        )}
      </div>
    ) : <span className="text-slate-300">—</span>,
    csv: (r) => r.batch?.batchNumber ?? "",
  },
  {
    key: "performedBy",
    label: "By",
    sortable: false,
    render: (r) => {
      const name = r.performedByStaff
        ? `${r.performedByStaff.firstName} ${r.performedByStaff.lastName}`
        : r.performedBy?.email ?? "—";
      return <span className="text-xs text-slate-500">{name}</span>;
    },
    csv: (r) =>
      r.performedByStaff
        ? `${r.performedByStaff.firstName} ${r.performedByStaff.lastName}`
        : r.performedBy?.email ?? "",
  },
  {
    key: "notes",
    label: "Notes",
    sortable: false,
    render: (r) => r.notes ? (
      <span className="text-xs text-slate-500 max-w-[120px] block truncate" title={r.notes}>{r.notes}</span>
    ) : <span className="text-slate-300">—</span>,
    csv: (r) => r.notes ?? "",
  },
];

// ─── Tab config ───────────────────────────────────────────────────────────────

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
  endpoint: string;
  columns: ColumnDef<any>[];
  filename: string;
}

const TABS: TabConfig[] = [
  {
    id: "items",
    label: "Inventory Items",
    icon: "📦",
    endpoint: "items",
    columns: ITEM_COLUMNS,
    filename: "inventory-items-report",
  },
  {
    id: "ledger",
    label: "Stock Transactions",
    icon: "📊",
    endpoint: "ledger",
    columns: LEDGER_COLUMNS,
    filename: "stock-ledger-report",
  },
];

// ─── Filter Bars ──────────────────────────────────────────────────────────────

function ItemFilterBar({
  filters,
  setFilters,
  onReset,
}: {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  onReset: () => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-end shadow-sm">
      <div className="flex-1 min-w-48">
        <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
        <input
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Name, code, description…"
          className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
        <select
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All types</option>
          <option value="MEDICINE">Medicine</option>
          <option value="CONSUMABLE">Consumable</option>
          <option value="EQUIPMENT">Equipment</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
        <select
          value={filters.isActive}
          onChange={(e) => setFilters((f) => ({ ...f, isActive: e.target.value }))}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
      <div className="flex items-center gap-2 h-9 mt-auto">
        <input
          type="checkbox"
          id="lowStock"
          checked={filters.lowStock}
          onChange={(e) => setFilters((f) => ({ ...f, lowStock: e.target.checked }))}
          className="rounded border-slate-300 text-emerald-600"
        />
        <label htmlFor="lowStock" className="text-sm text-slate-600 select-none cursor-pointer whitespace-nowrap">
          Low stock only
        </label>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Rows</label>
        <select
          value={filters.limit}
          onChange={(e) => setFilters((f) => ({ ...f, limit: parseInt(e.target.value) }))}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <button onClick={onReset} className="h-9 px-3 rounded-lg text-sm border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">Reset</button>
    </div>
  );
}

function LedgerFilterBar({
  filters,
  setFilters,
  onReset,
}: {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  onReset: () => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-end shadow-sm">
      <div className="flex-1 min-w-48">
        <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
        <input
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Item name, code, ledger code…"
          className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Transaction Type</label>
        <select
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All types</option>
          {Object.entries(LEDGER_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Rows</label>
        <select
          value={filters.limit}
          onChange={(e) => setFilters((f) => ({ ...f, limit: parseInt(e.target.value) }))}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <button onClick={onReset} className="h-9 px-3 rounded-lg text-sm border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">Reset</button>
    </div>
  );
}

// ─── Stats panels ─────────────────────────────────────────────────────────────

function ItemStatsPanel({ summary }: { summary: ItemSummary }) {
  const catData = (summary.categoryBreakdown ?? [])
    .filter((c) => c.count > 0)
    .map((c, i) => ({ name: c.name, value: c.count, color: c.color ?? CHART_PALETTE[i % CHART_PALETTE.length] }));

  const typeData = Object.entries(summary.typeBreakdown ?? {}).map(([k, v], i) => ({
    name: k.charAt(0) + k.slice(1).toLowerCase(),
    value: v,
    color: TYPE_ITEM_COLORS[k] ?? CHART_PALETTE[i],
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-1 gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
        <StatCard label="Total Items" value={(summary.totalItems ?? 0).toLocaleString()} icon="📦" accent="#3b82f6" />
        <StatCard label="Low Stock" value={(summary.lowStockCount ?? 0).toLocaleString()} icon="⚠️" accent="#f59e0b" />
        <StatCard label="Out of Stock" value={(summary.outOfStockCount ?? 0).toLocaleString()} icon="🚫" accent="#ef4444" />
        <StatCard label="Stock Value" value={fmtCurrency(summary.totalStockValue)} icon="💰" accent="#10b981" />
        <StatCard
          label="Item Types"
          value={Object.keys(summary.typeBreakdown ?? {}).length.toString()}
          icon="🗂"
          accent="#8b5cf6"
          sub={Object.entries(summary.typeBreakdown ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ")}
        />
      </div>
      {/* {catData.length > 0 && <MiniDonut data={catData} title="By Category" />}
      {typeData.length > 0 && <MiniDonut data={typeData} title="By Type" />} */}
    </div>
  );
}

function LedgerStatsPanel({ summary }: { summary: LedgerSummary }) {
  const typeData = Object.entries(summary.typeBreakdown ?? {})
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([k, v]) => ({
      name: LEDGER_TYPE_LABELS[k] ?? k,
      value: v.count,
      color: LEDGER_TYPE_COLORS[k],
    }));

  const valueData = Object.entries(summary.typeBreakdown ?? {})
    .filter(([, v]) => v.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 6)
    .map(([k, v]) => ({
      name: LEDGER_TYPE_LABELS[k]?.split(" ")[0] ?? k,
      value: Math.round(v.value),
    }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total Transactions" value={(summary.totalTransactions ?? 0).toLocaleString()} icon="📊" accent="#3b82f6" />
        <StatCard label="Total Qty In" value={(summary.totalIn ?? 0).toLocaleString()} icon="▲" accent="#10b981" />
        <StatCard label="Total Qty Out" value={(summary.totalOut ?? 0).toLocaleString()} icon="▼" accent="#ef4444" />
        <StatCard label="Value In" value={fmtCurrency(summary.totalValueIn)} icon="💚" accent="#10b981" />
        <StatCard label="Value Out" value={fmtCurrency(summary.totalValueOut)} icon="🔴" accent="#ef4444" />
        <StatCard
          label="Net Value"
          value={fmtCurrency(summary.netValue)}
          icon="⚖️"
          accent={summary.netValue >= 0 ? "#10b981" : "#ef4444"}
        />
      </div>
      {typeData.length > 0 && <MiniDonut data={typeData} title="By Transaction Type" />}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InventoryReports(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>("items");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(true);
  const [result, setResult] = useState<ApiResponse>({
    data: [],
    pagination: { total: 0, page: 1, limit: 25, totalPages: 1 },
    summary: {} as any,
  });

  const printRef = useRef<HTMLDivElement>(null);
  const tab = useMemo(() => TABS.find((t) => t.id === activeTab)!, [activeTab]);

    const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        page,
        limit: filters.limit,
        sortBy,
        sortOrder,
      };

      if (filters.search) params.search = filters.search;
      if (filters.categoryId) params.categoryId = filters.categoryId;
      if (filters.supplierId) params.supplierId = filters.supplierId;
      if (filters.type) params.type = filters.type;
      if (filters.locationId) params.locationId = filters.locationId;
      if (filters.referenceType) params.referenceType = filters.referenceType;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.isActive !== "") params.isActive = filters.isActive;
      if (filters.lowStock) params.lowStock = true;

      let response: ApiResponse;

      switch (tab.id) {
        case "items":
          response = await inventoryApi.getItemsReport(params);
          break;
        case "ledger":
          response = await inventoryApi.getLedgerReport(params);
          break;
        default:
          throw new Error(`Unknown tab: ${tab.id}`);
      }

      setResult(response);
    } catch (err) {
      console.error("Report fetch failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load report data");
      setResult({
        data: [],
        pagination: { total: 0, page: 1, limit: filters.limit, totalPages: 1 },
        summary: {} as any,
      });
    } finally {
      setLoading(false);
    }
  }, [tab, filters, page, sortBy, sortOrder]);

//   const fetchReport = useCallback(async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const params = new URLSearchParams({
//         page: String(page),
//         limit: String(filters.limit),
//         sortBy,
//         sortOrder,
//         ...(filters.search && { search: filters.search }),
//         ...(filters.categoryId && { categoryId: filters.categoryId }),
//         ...(filters.supplierId && { supplierId: filters.supplierId }),
//         ...(filters.type && { type: filters.type }),
//         ...(filters.locationId && { locationId: filters.locationId }),
//         ...(filters.referenceType && { referenceType: filters.referenceType }),
//         ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
//         ...(filters.dateTo && { dateTo: filters.dateTo }),
//         ...(filters.isActive !== "" && { isActive: filters.isActive }),
//         ...(filters.lowStock && { lowStock: "true" }),
//       });

//       const res = await fetch(`${API_BASE}/${tab.endpoint}?${params}`);
//       if (!res.ok) throw new Error(`Server error ${res.status}`);
//       const json: ApiResponse = await res.json();
//       setResult(json);
//     } catch (err) {
//       setError(err instanceof Error ? err.message : "Failed to load report");
//       setResult({ data: [], pagination: { total: 0, page: 1, limit: filters.limit, totalPages: 1 }, summary: {} as any });
//     } finally {
//       setLoading(false);
//     }
//   }, [tab, filters, page, sortBy, sortOrder]);

  useEffect(() => { fetchReport(); }, [fetchReport]);
  useEffect(() => { setPage(1); }, [filters, activeTab]);

  const handleSort = useCallback((col: string) => {
    if (sortBy === col) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortOrder("desc"); }
    setPage(1);
  }, [sortBy]);

  const handleTabChange = (id: TabId) => {
    setActiveTab(id);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
    setSortBy("createdAt");
    setSortOrder("desc");
    setError(null);
  };

  const handleExportCSV = () => {
    exportCSV(
      `${tab.filename}-${new Date().toISOString().slice(0, 10)}.csv`,
      tab.columns,
      result.data,
    );
  };

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${escapeHtml(tab.label)} Report</title>
      <style>body{font-family:system-ui,sans-serif;font-size:12px;color:#1e293b}
      table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;border-bottom:2px solid #e2e8f0}
      td{padding:6px 8px;border-bottom:1px solid #f1f5f9}tr:nth-child(even)td{background:#f8fafc}</style>
      </head><body>${content}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const summary = result.summary ?? {};
  const pagination = result.pagination ?? { total: 0, page: 1, limit: 25, totalPages: 1 };

  const printTableHtml = `<table><thead><tr>${tab.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${result.data.map((row) => `<tr>${tab.columns.map((c) => `<td>${escapeHtml(String(c.csv ? c.csv(row) : ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-screen-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Inventory Reports</h1>
              <p className="text-sm text-slate-500 mt-0.5">Items, stock levels &amp; ledger transactions</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowChart((v) => !v)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
              >
                {showChart ? "🙈 Hide Chart" : "📊 Show Chart"}
              </button>
              <button
                onClick={handleExportCSV}
                className="px-3 py-2 text-sm rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5 font-medium transition-colors"
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
          <div className="flex gap-0 mt-5 -mb-px">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
              >
                <span>{t.icon}</span>
                {t.label}
                {!loading && pagination.total > 0 && activeTab === t.id && (
                  <span className="bg-emerald-100 text-emerald-700 text-xs rounded-full px-1.5 py-0.5 font-semibold tabular-nums">
                    {pagination.total}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-screen-2xl mx-auto px-2 py-2 space-y-2">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Filters */}
        {activeTab === "items" ? (
          <ItemFilterBar filters={filters} setFilters={setFilters} onReset={() => { setFilters(DEFAULT_FILTERS); setPage(1); }} />
        ) : (
          <LedgerFilterBar filters={filters} setFilters={setFilters} onReset={() => { setFilters(DEFAULT_FILTERS); setPage(1); }} />
        )}

        {/* Stats */}
        {showChart && !loading && (
          <div>
            {activeTab === "items" && <ItemStatsPanel summary={summary as ItemSummary} />}
            {activeTab === "ledger" && <LedgerStatsPanel summary={summary as LedgerSummary} />}
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">
              {tab.label}
              {!loading && pagination.total > 0 && (
                <span className="ml-2 text-slate-400 font-normal text-xs">
                  {pagination.total.toLocaleString()} total
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
            columns={tab.columns}
            rows={result.data as any[]}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            loading={loading}
          />

          <div className="border-t border-slate-100 px-4">
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={filters.limit}
              onPage={setPage}
            />
          </div>
        </div>
      </div>

      {/* Hidden print area */}
      <div ref={printRef} style={{ display: "none" }}>
        <h1>{tab.label} Report</h1>
        <p>Generated: {new Date().toLocaleString()} · Total rows: {pagination.total}</p>
        <div dangerouslySetInnerHTML={{ __html: printTableHtml }} />
      </div>
    </div>
  );
}