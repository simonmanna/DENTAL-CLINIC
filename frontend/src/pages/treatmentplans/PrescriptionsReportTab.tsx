// src/pages/treatmentplans/PrescriptionsReportTab.tsx
// Self-contained "Prescriptions Report" tab for the Treatment Reports page.

import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { prescriptionApi } from "@/services/prescription-api";
import { staffApi } from "@/lib/api/staff-api";
import {
  type Prescription,
  type PrescriptionFilters,
  type PrescriptionStatus,
  PRESCRIPTION_STATUS_VALUES,
} from "@/types/prescription";
import { formatDate } from "@/lib/utils";

const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  ACTIVE: {
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    label: "Active",
  },
  DISPENSED: {
    cls: "bg-blue-50 text-blue-700 ring-blue-200",
    label: "Dispensed",
  },
  CANCELLED: {
    cls: "bg-red-50 text-red-600 ring-red-200",
    label: "Cancelled",
  },
  EXPIRED: {
    cls: "bg-slate-100 text-slate-600 ring-slate-200",
    label: "Expired",
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

function fmtDate(d?: string | null): string {
  return formatDate(d, "short");
}

const fullName = (
  p?: { firstName: string; lastName: string } | null,
): string => (p ? `${p.firstName} ${p.lastName}` : "—");

function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  accent: string;
  icon: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-1 flex gap-3 items-start shadow-sm">
      <div
        className="mt-0.5 size-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: accent + "18" }}
      >
        <span className="text-base" style={{ color: accent }}>
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">
          {label}
        </p>
        <p className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = [...PRESCRIPTION_STATUS_VALUES];

interface PrescriptionsFilters {
  search: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  dentistId: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

const DEFAULT_FILTERS: PrescriptionsFilters = {
  search: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  dentistId: "",
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
};

export default function PrescriptionsReportTab(): JSX.Element {
  const [filters, setFilters] = useState<PrescriptionsFilters>(DEFAULT_FILTERS);
  const [exporting, setExporting] = useState(false);

  const update = useCallback((partial: Partial<PrescriptionsFilters>) => {
    setFilters((f) => ({ ...f, ...partial }));
  }, []);

  const apiFilters: PrescriptionFilters = useMemo(
    () => ({
      search: filters.search || undefined,
      status: filters.status
        ? (filters.status as PrescriptionStatus)
        : undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      dentistId: filters.dentistId || undefined,
      page: filters.page,
      limit: filters.limit,
      sortBy: filters.sortBy as PrescriptionFilters["sortBy"],
      sortOrder: filters.sortOrder,
    }),
    [filters],
  );

  const { data: response, isLoading, isError, refetch, isFetching } =
    useQuery({
      queryKey: ["report-prescriptions-tab", apiFilters],
      queryFn: () => prescriptionApi.list(apiFilters),
      staleTime: 30_000,
    });

  const { data: dentists = [] } = useQuery({
    queryKey: ["prescriptions-tab-dentists"],
    queryFn: () =>
      staffApi.getDentists().then((list) => (Array.isArray(list) ? list : [])),
    staleTime: 300_000,
  });

  const prescriptions = response?.data ?? [];
  const meta = response?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of prescriptions) {
      counts[p.status] = (counts[p.status] ?? 0) + 1;
    }
    return counts;
  }, [prescriptions]);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const base: PrescriptionFilters = {
        search: filters.search || undefined,
        status: filters.status
          ? (filters.status as PrescriptionStatus)
          : undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        dentistId: filters.dentistId || undefined,
        page: 1,
        limit: 100,
        sortBy: filters.sortBy as PrescriptionFilters["sortBy"],
        sortOrder: filters.sortOrder,
      };
      const first = await prescriptionApi.list(base);
      const all: Prescription[] = [...first.data];
      for (let p = 2; p <= (first.meta.totalPages ?? 1); p++) {
        const next = await prescriptionApi.list({ ...base, page: p });
        all.push(...next.data);
      }
      const header =
        '"Prescription Code","Patient","Prev Card","Doctor","Status","Items","Valid Until","Created At"';
      const body = all.map((r) =>
        [
          `"${r.prescriptionCode}"`,
          `"${fullName(r.patient)}"`,
          `"${r.patient?.previousCardNumber ?? ""}"`,
          `"${fullName(r.dentist)}"`,
          `"${r.status}"`,
          `"${r.items.length}"`,
          `"${fmtDate(r.validUntil)}"`,
          `"${fmtDate(r.createdAt)}"`,
        ].join(","),
      );
      const blob = new Blob([[header, ...body].join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `prescriptions-report-${new Date().toISOString().slice(0, 10)}.csv`,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      setExporting(false);
    }
  }, [exporting, filters]);

  const inputCls =
    "h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-end shadow-sm">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Search
          </label>
          <input
            value={filters.search}
            onChange={(e) => update({ search: e.target.value, page: 1 })}
            placeholder="Prescription code, patient name…"
            className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => update({ status: e.target.value, page: 1 })}
            className={inputCls}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_CFG[s]?.label ?? s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            From
          </label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => update({ dateFrom: e.target.value, page: 1 })}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            To
          </label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => update({ dateTo: e.target.value, page: 1 })}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Doctor
          </label>
          <select
            value={filters.dentistId}
            onChange={(e) => update({ dentistId: e.target.value, page: 1 })}
            className={inputCls}
            disabled={dentists.length === 0}
          >
            <option value="">
              {dentists.length === 0 ? "Loading dentists…" : "All dentists"}
            </option>
            {dentists.map((d: any) => (
              <option key={d.id} value={d.id}>
                Dr. {d.firstName} {d.lastName}
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
              update({ limit: parseInt(e.target.value), page: 1 })
            }
            className={inputCls}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setFilters(DEFAULT_FILTERS)}
          className="h-9 px-3 rounded-lg text-sm border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        >
          Reset
        </button>

        <button
          onClick={handleExport}
          disabled={exporting || isLoading}
          className="h-9 px-3 rounded-lg text-sm border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-medium transition-colors disabled:opacity-50"
        >
          {exporting ? "⏳ Preparing…" : "⬇ Export CSV"}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Prescriptions"
          value={total.toLocaleString()}
          accent="#3b82f6"
          icon="💊"
        />
        <StatCard
          label="Active"
          value={(statusCounts["ACTIVE"] ?? 0).toLocaleString()}
          accent="#10b981"
          icon="✅"
        />
        <StatCard
          label="Dispensed"
          value={(statusCounts["DISPENSED"] ?? 0).toLocaleString()}
          accent="#3b82f6"
          icon="📤"
        />
        <StatCard
          label="Expired"
          value={(statusCounts["EXPIRED"] ?? 0).toLocaleString()}
          accent="#6b7280"
          icon="⏰"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <p className="text-sm font-medium text-slate-600">
              Failed to load prescriptions
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 gap-3">
            <div className="size-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading prescriptions…</span>
          </div>
        ) : !prescriptions.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <span className="text-3xl mb-2">💊</span>
            <p className="text-sm font-medium">No prescriptions found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {[
                      "Code",
                      "Patient",
                      "Prev Card",
                      "Doctor",
                      "Status",
                      "Items",
                      "Valid Until",
                      "Created",
                    ].map((h, i) => (
                      <th
                        key={i}
                        className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {prescriptions.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-emerald-700 whitespace-nowrap">
                        {p.prescriptionCode}
                      </td>
                      <td className="px-3 py-2.5">
                        <div>
                          <p className="font-medium text-slate-900">
                            {fullName(p.patient)}
                          </p>
                          <p className="text-xs text-slate-400">
                            {p.patient?.patientCode}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {p.patient?.previousCardNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                        {fullName(p.dentist)}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        {p.items.length}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {fmtDate(p.validUntil)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {fmtDate(p.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
                <span>
                  Page {meta?.page} of {totalPages} ·{" "}
                  {total.toLocaleString()} prescriptions
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={filters.page <= 1}
                    onClick={() => update({ page: filters.page - 1 })}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                  >
                    Prev
                  </button>
                  <button
                    disabled={filters.page >= totalPages}
                    onClick={() => update({ page: filters.page + 1 })}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {isFetching && (
        <div className="flex justify-center">
          <div className="size-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
