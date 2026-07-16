// src/pages/treatmentplans/AppointmentsReportTab.tsx
// Self-contained "Appointments Report" tab for the Treatment Reports page.

import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api";
import { staffApi } from "@/lib/api/staff-api";
import { formatDate } from "@/lib/utils";

const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  SCHEDULED: {
    cls: "bg-blue-50 text-blue-700 ring-blue-200",
    label: "Scheduled",
  },
  CONFIRMED: {
    cls: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    label: "Confirmed",
  },
  ARRIVED: {
    cls: "bg-amber-50 text-amber-700 ring-amber-200",
    label: "Arrived",
  },
  IN_PROGRESS: {
    cls: "bg-purple-50 text-purple-700 ring-purple-200",
    label: "In Progress",
  },
  COMPLETED: {
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    label: "Completed",
  },
  CANCELLED: {
    cls: "bg-red-50 text-red-600 ring-red-200",
    label: "Cancelled",
  },
  NO_SHOW: {
    cls: "bg-slate-100 text-slate-600 ring-slate-200",
    label: "No Show",
  },
  RESCHEDULED: {
    cls: "bg-orange-50 text-orange-700 ring-orange-200",
    label: "Rescheduled",
  },
  DRAFT: {
    cls: "bg-slate-100 text-slate-500 ring-slate-200",
    label: "Draft",
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

function fmtDateTime(d?: string | null): string {
  return formatDate(d, "datetime");
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
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex gap-3 items-start shadow-sm">
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

const STATUS_OPTIONS = [
  "SCHEDULED",
  "CONFIRMED",
  "ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "RESCHEDULED",
  "DRAFT",
];

interface AppointmentFilters {
  search: string;
  status: string;
  startDate: string;
  endDate: string;
  dentistId: string;
  page: number;
  limit: number;
}

const DEFAULT_FILTERS: AppointmentFilters = {
  search: "",
  status: "",
  startDate: "",
  endDate: "",
  dentistId: "",
  page: 1,
  limit: 20,
};

export default function AppointmentsReportTab(): JSX.Element {
  const [filters, setFilters] = useState<AppointmentFilters>(DEFAULT_FILTERS);
  const [exporting, setExporting] = useState(false);

  const update = useCallback((partial: Partial<AppointmentFilters>) => {
    setFilters((f) => ({ ...f, ...partial }));
  }, []);

  const apiParams = useMemo(
    () => ({
      search: filters.search || undefined,
      status: filters.status || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      dentistId: filters.dentistId || undefined,
      page: filters.page,
      limit: filters.limit,
    }),
    [filters],
  );

  const { data: response, isLoading, isError, refetch, isFetching } =
    useQuery({
      queryKey: ["report-appointments-tab", apiParams],
      queryFn: () => appointmentsApi.getAll(apiParams),
      staleTime: 30_000,
    });

  const { data: dentists = [] } = useQuery({
    queryKey: ["appointments-tab-dentists"],
    queryFn: () =>
      staffApi.getDentists().then((list) => (Array.isArray(list) ? list : [])),
    staleTime: 300_000,
  });

  const appointments = response?.data ?? [];
  const meta = response?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of appointments) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    return counts;
  }, [appointments]);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const base: any = {
        search: filters.search || undefined,
        status: filters.status || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        dentistId: filters.dentistId || undefined,
        page: 1,
        limit: 100,
      };
      const first = await appointmentsApi.getAll(base);
      const all: any[] = [...(first.data ?? [])];
      for (let p = 2; p <= ((first as any).meta?.totalPages ?? 1); p++) {
        const next = await appointmentsApi.getAll({ ...base, page: p });
        all.push(...(next.data ?? []));
      }
      const header =
        '"Appointment Code","Patient","Doctor","Type","Status","Scheduled At","Duration (min)","Visit Status"';
      const body = all.map((r: any) =>
        [
          `"${r.appointmentCode}"`,
          `"${fullName(r.patient)}"`,
          `"${fullName(r.dentist)}"`,
          `"${r.type}"`,
          `"${r.status}"`,
          `"${fmtDateTime(r.scheduledAt)}"`,
          `"${r.duration}"`,
          `"${r.visit?.status ?? "—"}"`,
        ].join(","),
      );
      const blob = new Blob([[header, ...body].join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `appointments-report-${new Date().toISOString().slice(0, 10)}.csv`,
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
            placeholder="Appointment code, patient name…"
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
            value={filters.startDate}
            onChange={(e) => update({ startDate: e.target.value, page: 1 })}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            To
          </label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => update({ endDate: e.target.value, page: 1 })}
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
          label="Total Appointments"
          value={total.toLocaleString()}
          accent="#3b82f6"
          icon="📆"
        />
        <StatCard
          label="Completed"
          value={(statusCounts["COMPLETED"] ?? 0).toLocaleString()}
          accent="#10b981"
          icon="✅"
        />
        <StatCard
          label="Cancelled"
          value={(statusCounts["CANCELLED"] ?? 0).toLocaleString()}
          accent="#ef4444"
          icon="❌"
        />
        <StatCard
          label="No Show"
          value={(statusCounts["NO_SHOW"] ?? 0).toLocaleString()}
          accent="#6b7280"
          icon="🚫"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <p className="text-sm font-medium text-slate-600">
              Failed to load appointments
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
            <span className="text-sm">Loading appointments…</span>
          </div>
        ) : !appointments.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <span className="text-3xl mb-2">📆</span>
            <p className="text-sm font-medium">No appointments found</p>
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
                      "Doctor",
                      "Type",
                      "Status",
                      "Scheduled At",
                      "Duration",
                      "Visit",
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
                  {appointments.map((a: any) => (
                    <tr key={a.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-emerald-700 whitespace-nowrap">
                        {a.appointmentCode}
                      </td>
                      <td className="px-3 py-2.5">
                        <div>
                          <p className="font-medium text-slate-900">
                            {fullName(a.patient)}
                          </p>
                          <p className="text-xs text-slate-400">
                            {a.patient?.patientCode}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                        {fullName(a.dentist)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                        {a.type?.replace(/_/g, " ")}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {fmtDateTime(a.scheduledAt)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 tabular-nums">
                        {a.duration}m
                      </td>
                      <td className="px-3 py-2.5">
                        {a.visit ? (
                          <StatusBadge status={a.visit.status} />
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
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
                  {total.toLocaleString()} appointments
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
