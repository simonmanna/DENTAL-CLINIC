import { useState, useEffect, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { visitsApi } from "../../lib/api";
import {
  PageHeader,
  Button,
  LoadingSpinner,
  Pagination,
  Input,
  Select,
} from "../../components/shared";
import {
  Calendar,
  Search,
  Stethoscope,
  Clock,
  Filter,
  CheckCircle,
  Eye,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  AlertTriangle,
  X,
  RefreshCw,
} from "lucide-react";

import { formatDate, cn } from "../../lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VisitRow {
  id: string;
  visitCode?: string;
  status?: string;
  checkedInAt?: string;
  patientId?: string;
  patient?: {
    id: string;
    firstName?: string;
    lastName?: string;
    patientCode?: string;
  } | null;
  dentist?: {
    id: string;
    firstName?: string;
    lastName?: string;
    specialization?: string;
  } | null;
  appointment?: { id: string; scheduledAt?: string; type?: string } | null;
  _count?: { procedures?: number; prescriptions?: number };
}

interface VisitsMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

type SortOrder = "asc" | "desc";

const VISIT_STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "ARRIVED", label: "Arrived" },
  { value: "CHECKED_IN", label: "Checked In" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PAGE_SIZES = [10, 25, 50];

// Pill styling per status — consistent ring style for a clean datatable look.
const STATUS_PILL: Record<string, string> = {
  ARRIVED: "bg-amber-50 text-amber-700 ring-amber-200",
  CHECKED_IN: "bg-amber-50 text-amber-700 ring-amber-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 ring-blue-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANCELLED: "bg-red-50 text-red-600 ring-red-200",
};
const statusPill = (status?: string) =>
  STATUS_PILL[status ?? ""] ?? "bg-slate-100 text-slate-600 ring-slate-200";

// ─── Column model ─────────────────────────────────────────────────────────────
interface Column {
  key: string;
  label: string;
  sortKey?: string; // present → server-sortable
  align?: "left" | "center" | "right";
}

const COLUMNS: Column[] = [
  { key: "code", label: "Code", sortKey: "visitCode" },
  { key: "patient", label: "Patient" },
  { key: "type", label: "Type" },
  { key: "dentist", label: "Dentist" },
  { key: "procs", label: "Procs", align: "center" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "checkedIn", label: "Checked In", sortKey: "checkedInAt" },
  { key: "actions", label: "Actions", align: "right" },
];

export function VisitsListPage() {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState(""); // "" = all dates
  const [sortBy, setSortBy] = useState("checkedInAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Debounce the search box so we fire one request after typing settles,
  // not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["visits", page, limit, search, statusFilter, dateFilter, sortBy, sortOrder],
    queryFn: () =>
      visitsApi.getAll({
        page,
        limit,
        search: search || undefined,
        status: statusFilter || undefined,
        date: dateFilter || undefined,
        sortBy,
        sortOrder,
      }),
    placeholderData: keepPreviousData, // keep the old page visible while the next loads
  });

  const visits: VisitRow[] = data?.data ?? [];
  const meta: VisitsMeta = data?.meta ?? {};

  const hasActiveFilters = useMemo(
    () => Boolean(search || statusFilter || dateFilter),
    [search, statusFilter, dateFilter],
  );

  const handleSort = (sortKey?: string) => {
    if (!sortKey) return;
    if (sortBy === sortKey) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(sortKey);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatusFilter("");
    setDateFilter("");
    setPage(1);
  };

  const handleCheckOut = (visit: VisitRow) => {
    const patientName = visit.patient
      ? `${visit.patient.firstName ?? ""} ${visit.patient.lastName ?? ""}`.trim()
      : "";
    const params = new URLSearchParams();
    if (patientName) params.set("patientName", patientName);
    if (visit.visitCode) params.set("visitCode", visit.visitCode);
    navigate(
      `/VisitBillingPage/${visit.id}/${visit.patientId}${params.toString() ? `?${params}` : ""}`,
    );
  };

  const alignCls = (a?: Column["align"]) =>
    a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left";

  return (
    <div className="space-y-3">
      <PageHeader
        title="Visits"
        subtitle="Manage clinical encounters"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/appointments")}
            icon={<Calendar className="w-3.5 h-3.5" />}
          >
            Appointments
          </Button>
        }
      />

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by patient, code…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8 h-9"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <Select
              className="h-9 text-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              {VISIT_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              className="h-9 text-sm"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
            />
            {dateFilter && (
              <button
                onClick={() => {
                  setDateFilter("");
                  setPage(1);
                }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                All dates
              </button>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setDateFilter(new Date().toISOString().split("T")[0]);
              setPage(1);
            }}
          >
            Today
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 text-slate-500" onClick={resetFilters}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Thin top progress bar while refetching (keeps prior rows visible) */}
        <div className="h-0.5 w-full overflow-hidden">
          {isFetching && !isLoading && (
            <div className="h-full w-full bg-blue-500/70 animate-pulse" />
          )}
        </div>

        {isLoading ? (
          <div className="py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <div className="py-12 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
            <p className="text-sm font-medium text-slate-700">Couldn’t load visits</p>
            <p className="text-xs text-slate-400 mt-1">
              Something went wrong fetching the visit list.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => refetch()}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Retry
            </Button>
          </div>
        ) : visits.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <Stethoscope className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium">No visits found</p>
            <p className="text-xs text-slate-400 mt-1">
              {hasActiveFilters
                ? "Try adjusting or clearing your filters."
                : "Visits will appear here once patients check in."}
            </p>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {COLUMNS.map((col) => {
                      const active = col.sortKey && sortBy === col.sortKey;
                      return (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.sortKey)}
                          className={cn(
                            "px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap",
                            alignCls(col.align),
                            col.sortKey && "cursor-pointer select-none hover:text-slate-800",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              col.align === "center" && "justify-center",
                              col.align === "right" && "justify-end",
                            )}
                          >
                            {col.label}
                            {col.sortKey &&
                              (active ? (
                                sortOrder === "asc" ? (
                                  <ArrowUp className="w-3 h-3 text-blue-600" />
                                ) : (
                                  <ArrowDown className="w-3 h-3 text-blue-600" />
                                )
                              ) : (
                                <ChevronsUpDown className="w-3 h-3 text-slate-300" />
                              ))}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visits.map((visit) => (
                    <tr
                      key={visit.id}
                      onClick={() => navigate(`/visits/${visit.id}`)}
                      className="cursor-pointer hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-sm font-medium text-slate-900">
                          {visit.visitCode ?? "—"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-900 leading-tight">
                          {visit.patient
                            ? `${visit.patient.firstName ?? ""} ${visit.patient.lastName ?? ""}`.trim() ||
                              "—"
                            : "—"}
                        </p>
                        <p className="text-xs text-slate-400 leading-tight">
                          {visit.patient?.patientCode ?? ""}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        {visit.appointment?.type?.replace(/_/g, " ") ?? "—"}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                        {visit.dentist
                          ? `Dr. ${visit.dentist.firstName ?? ""} ${visit.dentist.lastName ?? ""}`.trim()
                          : "—"}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-md bg-slate-100 text-xs font-semibold text-slate-600 tabular-nums">
                          {visit._count?.procedures ?? 0}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                            statusPill(visit.status),
                          )}
                        >
                          {visit.status?.replace(/_/g, " ") ?? "—"}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="text-xs tabular-nums">
                            {visit.checkedInAt ? formatDate(visit.checkedInAt) : "—"}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-end gap-1.5"
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-md px-2 bg-sky-600 text-white hover:bg-sky-700 shadow-sm"
                            onClick={() => navigate(`/visits/${visit.id}`)}
                          >
                            <Eye size={14} strokeWidth={2.5} />
                            <span className="ml-1 pr-1">Open</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-md px-2 bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                            onClick={() => handleCheckOut(visit)}
                          >
                            <CheckCircle size={14} strokeWidth={2.5} />
                            <span className="ml-1 pr-1">Bills</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer: page-size selector + pagination */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Rows</span>
                <Select
                  className="h-8 text-xs w-16"
                  value={limit}
                  onChange={(e) => {
                    setLimit(parseInt(e.target.value, 10));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
              <Pagination
                page={page}
                totalPages={meta.totalPages || 1}
                total={meta.total || 0}
                limit={limit}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
