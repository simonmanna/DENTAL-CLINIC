// src/pages/appointments/AppointmentsListPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { staffApi } from "../../lib/api/staff-api";
import { appointmentsApi, visitsApi } from "../../lib/api";
import { useAuthStore } from "../../store/auth.store";
import { cn } from "../../lib/utils";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Filter,
  ListChecks,
  Pencil,
  Phone,
  Play,
  RefreshCw,
  Search,
  User,
  X,
} from "lucide-react";
import { ActionButton, RowActions } from "@/components/ui/action-button";
import { LoadingSpinner } from "../../components/shared";
import {
  addDays,
  endOfWeek,
  format,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
  startOfWeek,
} from "date-fns";
import { toast } from "sonner";
import {
  AptDrawer,
  BookModal,
  EditModal,
  RoleWarningDialog,
  StatusBadge,
  STATUS_CFG,
  TYPE_COLOR,
  initials,
  type Appointment,
  type Dentist,
} from "./AppointmentsPage";

// ─── Config ───────────────────────────────────────────────────────────────────
type RangeKey = "today" | "week" | "upcoming" | "past" | "all" | "custom";
type SortField =
  | "scheduledAt"
  | "createdAt"
  | "status"
  | "type"
  | "patient"
  | "dentist";
type SortDir = "asc" | "desc";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
  { key: "custom", label: "Custom" },
];

const STATUS_FILTERS = [
  "SCHEDULED",
  "CONFIRMED",
  "ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "DRAFT",
] as const;

const PAGE_SIZES = [25, 50, 100];
const VISIT_ALLOWED_ROLES = ["SUPER_ADMIN", "ADMIN", "DENTIST"];

/** Statuses still holding a slot that should have started by now. */
const AWAITING_STATUSES = new Set(["SCHEDULED", "CONFIRMED", "DRAFT"]);

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

function rangeBounds(
  range: RangeKey,
  from: string,
  to: string,
): { startDate?: string; endDate?: string } {
  const now = new Date();
  switch (range) {
    case "today":
      return { startDate: ymd(now), endDate: ymd(now) };
    case "week":
      return {
        startDate: ymd(startOfWeek(now, { weekStartsOn: 1 })),
        endDate: ymd(endOfWeek(now, { weekStartsOn: 1 })),
      };
    case "upcoming":
      return { startDate: ymd(now) };
    case "past":
      return { endDate: ymd(addDays(now, -1)) };
    case "custom":
      return { startDate: from || undefined, endDate: to || undefined };
    default:
      return {};
  }
}

function dayHeading(d: Date) {
  const label = isToday(d)
    ? "Today"
    : isTomorrow(d)
      ? "Tomorrow"
      : isYesterday(d)
        ? "Yesterday"
        : format(d, "EEEE");
  return { label, date: format(d, "MMMM d, yyyy") };
}

function isLate(apt: Appointment) {
  return (
    AWAITING_STATUSES.has(apt.status) &&
    new Date(apt.scheduledAt).getTime() < Date.now()
  );
}

/** Small debounce so typing doesn't fire a request per keystroke. */
function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ─── Sort Header Cell ─────────────────────────────────────────────────────────
function SortTh({
  label,
  field,
  sort,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  sort: { field: SortField; dir: SortDir };
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = sort.field === field;
  const Icon = active
    ? sort.dir === "asc"
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown;
  return (
    <th
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-4 py-3 text-left whitespace-nowrap", className)}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 transition-colors",
          active
            ? "text-indigo-700"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        <Icon className={cn("w-3.5 h-3.5", !active && "opacity-50")} />
      </button>
    </th>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function NextActionButton({
  apt,
  onConfirm,
  onArrive,
  onStartVisit,
  disabled,
}: {
  apt: Appointment;
  onConfirm: () => void;
  onArrive: () => void;
  onStartVisit: () => void;
  disabled: boolean;
}) {
  // The next step in the appointment workflow, as a labelled button.
  if (apt.status === "DRAFT" || apt.status === "SCHEDULED") {
    return <ActionButton tone="info" label="Confirm" icon={CheckCircle2} onClick={onConfirm} disabled={disabled} />;
  }
  if (apt.status === "CONFIRMED") {
    return <ActionButton tone="success" label="Arrived" icon={User} onClick={onArrive} disabled={disabled} />;
  }
  if (apt.status === "ARRIVED" || apt.status === "IN_PROGRESS") {
    return (
      <ActionButton tone="view" label={apt.visit ? "Open visit" : "Start visit"} icon={Play} onClick={onStartVisit} disabled={disabled} />
    );
  }
  return null;
}

function AptRow({
  apt,
  selected,
  busy,
  onOpen,
  onEdit,
  onConfirm,
  onArrive,
  onStartVisit,
}: {
  apt: Appointment;
  selected: boolean;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onConfirm: () => void;
  onArrive: () => void;
  onStartVisit: () => void;
}) {
  const colors = TYPE_COLOR[apt.type] ?? TYPE_COLOR.OTHER;
  const start = new Date(apt.scheduledAt);
  const end = new Date(start.getTime() + apt.duration * 60000);
  const late = isLate(apt);
  const muted = apt.status === "CANCELLED" || apt.status === "NO_SHOW";

  return (
    <tr
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
      }}
      tabIndex={0}
      className={cn(
        "group border-b border-border/60 cursor-pointer transition-colors focus:outline-none focus-visible:bg-indigo-50/60",
        selected ? "bg-indigo-50/80" : "hover:bg-muted/50",
        muted && "text-muted-foreground",
      )}
    >
      {/* Time */}
      <td className="pl-5 pr-4 py-3 whitespace-nowrap align-top">
        <p
          className={cn(
            "text-sm font-bold tabular-nums",
            muted ? "line-through decoration-1" : "text-foreground",
          )}
        >
          {format(start, "h:mm a")}
        </p>
        <p className="text-xs text-muted-foreground/80 tabular-nums mt-0.5">
          until {format(end, "h:mm")} · {apt.duration}m
        </p>
        <p className="text-[11px] text-muted-foreground/70 tabular-nums mt-0.5 sm:hidden">
          {format(start, "MMM d")}
        </p>
      </td>

      {/* Patient */}
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
            {initials(apt.patient.firstName, apt.patient.lastName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">
              {apt.patient.firstName} {apt.patient.lastName}
            </p>
            <p className="text-xs text-muted-foreground/80 flex items-center gap-2 whitespace-nowrap">
              <span className="font-mono">{apt.patient.patientCode}</span>
              {apt.patient.phone && (
                <span className="hidden xl:inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {apt.patient.phone}
                </span>
              )}
            </p>
          </div>
        </div>
      </td>

      {/* Type */}
      <td className="px-4 py-3 whitespace-nowrap align-top hidden md:table-cell">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: colors.border }}
          />
          {apt.type.replace(/_/g, " ")}
        </span>
        {apt.isWalkIn && (
          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-warning bg-warning-muted px-1.5 py-0.5 rounded">
            Walk-in
          </span>
        )}
        {apt.chiefComplaint && (
          <p
            className="text-xs text-muted-foreground mt-1 max-w-[220px] truncate"
            title={apt.chiefComplaint}
          >
            {apt.chiefComplaint}
          </p>
        )}
      </td>

      {/* Dentist */}
      <td className="px-4 py-3 whitespace-nowrap align-top hidden lg:table-cell">
        <p className="text-sm font-semibold text-foreground">
          Dr. {apt.dentist.firstName} {apt.dentist.lastName}
        </p>
        <p className="text-xs text-muted-foreground/80">
          {apt.dentist.specialization || "General Dentistry"}
        </p>
      </td>

      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap align-top">
        <StatusBadge status={apt.status} />
        {late && (
          <p className="mt-1 text-[11px] font-bold text-warning flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Past start time
          </p>
        )}
      </td>

      {/* Code */}
      <td className="px-4 py-3 whitespace-nowrap align-top hidden 2xl:table-cell">
        <span className="text-xs font-mono text-muted-foreground">
          {apt.appointmentCode}
        </span>
      </td>

      {/* Actions */}
      <td
        className="pl-4 pr-5 py-3 whitespace-nowrap align-top"
        onClick={(e) => e.stopPropagation()}
      >
        <RowActions>
          <NextActionButton
            apt={apt}
            onConfirm={onConfirm}
            onArrive={onArrive}
            onStartVisit={onStartVisit}
            disabled={busy}
          />
          <ActionButton iconOnly tone="edit" label={`Edit ${apt.appointmentCode}`} onClick={onEdit} />
          <ActionButton iconOnly tone="view" label={`View ${apt.appointmentCode}`} onClick={onOpen} />
        </RowActions>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function AppointmentsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  const { user } = useAuthStore();
  const isReception = user?.role === "RECEPTIONIST" || user?.role === "ADMIN";

  // Filters live in the URL so a filtered list can be shared or bookmarked.
  const range = (params.get("range") as RangeKey) || "today";
  const status = params.get("status") || "all";
  const dentist =
    params.get("dentist") ||
    (isReception ? "all" : (user?.staff?.id ?? "all"));
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = PAGE_SIZES.includes(Number(params.get("limit")))
    ? Number(params.get("limit"))
    : 50;
  const sort = {
    field: (params.get("sort") as SortField) || "scheduledAt",
    dir: (params.get("dir") as SortDir) || (range === "past" ? "desc" : "asc"),
  };

  const setFilter = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === "") next.delete(k);
          else next.set(k, v);
        }
        if (!("page" in patch)) next.delete("page");
        return next;
      },
      { replace: true },
    );

  const [search, setSearch] = useState(params.get("q") || "");
  const debouncedSearch = useDebounced(search.trim());
  useEffect(() => {
    if (debouncedSearch !== (params.get("q") || ""))
      setFilter({ q: debouncedSearch || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  const q = params.get("q") || "";

  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [showRoleWarning, setShowRoleWarning] = useState(false);

  const bounds = rangeBounds(range, from, to);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: [
      "apt-list",
      { range, ...bounds, status, dentist, q, page, limit, ...sort },
    ],
    queryFn: () =>
      appointmentsApi.getAll({
        ...bounds,
        status: status === "all" ? undefined : status,
        dentistId: dentist === "all" ? undefined : dentist,
        search: q || undefined,
        page,
        limit,
        sortBy: sort.field,
        sortDir: sort.dir,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const { data: dentists = [] } = useQuery({
    queryKey: ["dentists"],
    queryFn: staffApi.getDentists,
  });

  const appointments: Appointment[] = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, limit, totalPages: 1 };
  const totalPages = Math.max(1, meta.totalPages);

  // Day headers only make sense while the list is in date order.
  const groups = useMemo(() => {
    if (sort.field !== "scheduledAt")
      return [{ key: "all", day: null as Date | null, items: appointments }];
    const out: { key: string; day: Date | null; items: Appointment[] }[] = [];
    for (const a of appointments) {
      const d = parseISO(a.scheduledAt);
      const key = ymd(d);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(a);
      else out.push({ key, day: d, items: [a] });
    }
    return out;
  }, [appointments, sort.field]);

  const lateOnPage = appointments.filter(isLate).length;
  const hasFilters =
    status !== "all" || q !== "" || range !== "today" || params.has("dentist");

  const toggleSort = (field: SortField) =>
    setFilter(
      sort.field === field
        ? { sort: field, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { sort: field, dir: field === "createdAt" ? "desc" : "asc" },
    );

  // ── Mutations ──
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["apt-list"] });
    qc.invalidateQueries({ queryKey: ["cal"] });
    qc.invalidateQueries({ queryKey: ["drafts"] });
  };
  const errMsg = (e: any, fallback: string) =>
    toast.error(e?.response?.data?.message || fallback);

  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      appointmentsApi.update(id, { status: "CONFIRMED" as any }),
    onSuccess: (_d, id) => {
      refresh();
      setSelectedApt((p) => (p?.id === id ? { ...p, status: "CONFIRMED" } : p));
      toast.success("Appointment confirmed");
    },
    onError: (e) => errMsg(e, "Failed to confirm appointment"),
  });

  const arriveMutation = useMutation({
    mutationFn: (id: string) => appointmentsApi.arrive(id),
    onSuccess: (_d, id) => {
      refresh();
      setSelectedApt((p) => (p?.id === id ? { ...p, status: "ARRIVED" } : p));
      toast.success("Patient marked as arrived");
    },
    onError: (e) => errMsg(e, "Failed to mark arrival"),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      appointmentsApi.cancel(id, reason),
    onSuccess: () => {
      refresh();
      setSelectedApt(null);
      toast.success("Appointment cancelled");
    },
    onError: (e) => errMsg(e, "Failed to cancel appointment"),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      appointmentsApi.update(id, data),
    onSuccess: (updated) => {
      refresh();
      setSelectedApt(updated);
      setShowEdit(false);
      toast.success("Appointment updated");
    },
    onError: (e) => errMsg(e, "Failed to update appointment"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => appointmentsApi.delete(id),
    onSuccess: () => {
      refresh();
      setSelectedApt(null);
      toast.success("Appointment deleted");
    },
    onError: (e) => errMsg(e, "Failed to delete appointment"),
  });

  const bookMutation = useMutation({
    mutationFn: appointmentsApi.create,
    onSuccess: () => {
      refresh();
      setShowBook(false);
      toast.success("Appointment booked");
    },
    onError: (e) => errMsg(e, "Failed to book appointment"),
  });

  const createVisitMutation = useMutation({
    mutationFn: (v: { appointmentId: string; dentistId: string }) =>
      visitsApi.create(v),
    onSuccess: (visit) => {
      refresh();
      setSelectedApt(null);
      navigate(`/visits/${visit.id}`);
      toast.success("Visit started");
    },
    onError: (e) => errMsg(e, "Failed to start visit"),
  });

  const busy =
    confirmMutation.isPending ||
    arriveMutation.isPending ||
    cancelMutation.isPending ||
    deleteMutation.isPending ||
    createVisitMutation.isPending;

  const startVisit = (apt: Appointment) => {
    if (!user?.role || !VISIT_ALLOWED_ROLES.includes(user.role)) {
      setShowRoleWarning(true);
      return;
    }
    if (apt.visit) {
      setSelectedApt(null);
      navigate(`/visits/${apt.visit.id}`);
    } else {
      createVisitMutation.mutate({
        appointmentId: apt.id,
        dentistId: apt.dentistId,
      });
    }
  };

  const handleCancel = () => {
    if (!selectedApt) return;
    const reason = window.prompt("Reason for cancellation:");
    if (reason?.trim())
      cancelMutation.mutate({ id: selectedApt.id, reason: reason.trim() });
  };

  const handleDelete = () => {
    if (!selectedApt) return;
    if (
      !window.confirm(
        `Delete appointment ${selectedApt.appointmentCode} for ${selectedApt.patient.firstName} ${selectedApt.patient.lastName}? This cannot be undone.`,
      )
    )
      return;
    deleteMutation.mutate(selectedApt.id);
  };

  const clearFilters = () => {
    setSearch("");
    setParams({}, { replace: true });
  };

  const rangeCaption = (() => {
    const { startDate, endDate } = bounds;
    const f = (s: string) => format(parseISO(s), "MMM d");
    if (startDate && endDate)
      return startDate === endDate
        ? format(parseISO(startDate), "EEEE, MMMM d")
        : `${f(startDate)} – ${f(endDate)}`;
    if (startDate) return `From ${f(startDate)}`;
    if (endDate) return `Up to ${f(endDate)}`;
    return "All dates";
  })();

  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] bg-muted/50 overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="bg-white border-b border-border shrink-0 shadow-sm">
        <div className="px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <ListChecks className="w-4 h-4 text-indigo-700" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-none">
                Appointments List
              </h1>
              <p className="text-xs text-muted-foreground/80 mt-1">
                {rangeCaption}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-muted text-foreground text-xs font-bold rounded-full border border-border tabular-nums">
              {meta.total} appointment{meta.total !== 1 ? "s" : ""}
            </span>
            {lateOnPage > 0 && (
              <span className="px-2.5 py-1 bg-warning-muted text-warning text-xs font-bold rounded-full border border-warning/25 flex items-center gap-1 tabular-nums">
                <AlertTriangle className="w-3 h-3" /> {lateOnPage} past start
              </span>
            )}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient, code, phone…"
              aria-label="Search appointments"
              className="pl-9 pr-8 py-2 text-sm border border-border rounded-lg w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-muted/50"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-2.5 text-muted-foreground/70 hover:text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Dentist */}
          <div className="relative">
            <Filter className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
            <select
              value={dentist}
              onChange={(e) => setFilter({ dentist: e.target.value })}
              aria-label="Filter by dentist"
              className="pl-8 pr-8 py-2 text-xs border border-border rounded-lg bg-white text-foreground focus:ring-2 focus:ring-indigo-300 focus:outline-none font-medium"
            >
              <option value="all">All Dentists</option>
              {dentists.map((d: Dentist) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.firstName} {d.lastName}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => refetch()}
            aria-label="Refresh"
            title="Refresh"
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground/80 transition-colors border border-transparent hover:border-border"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </button>

          <button
            onClick={() => setShowBook(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1"
          >
            <CalendarPlus className="w-4 h-4" /> Book
          </button>
        </div>

        {/* Range + status */}
        <div className="px-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div
            role="tablist"
            aria-label="Date range"
            className="flex items-center gap-0.5 bg-muted rounded-lg p-1"
          >
            {RANGES.map((r) => (
              <button
                key={r.key}
                role="tab"
                aria-selected={range === r.key}
                onClick={() =>
                  setFilter({
                    range: r.key,
                    sort: null,
                    dir: null,
                    ...(r.key === "custom"
                      ? { from: from || ymd(new Date()), to: to || ymd(new Date()) }
                      : { from: null, to: null }),
                  })
                }
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300",
                  range === r.key
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {range === "custom" && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFilter({ from: e.target.value })}
                aria-label="From date"
                className="px-2.5 py-1.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setFilter({ to: e.target.value })}
                aria-label="To date"
                className="px-2.5 py-1.5 border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          )}

          <div className="h-5 w-px bg-border hidden md:block" />

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Status"
          >
            <button
              onClick={() => setFilter({ status: null })}
              aria-pressed={status === "all"}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                status === "all"
                  ? "bg-foreground text-background border-foreground"
                  : "bg-white text-muted-foreground border-border hover:bg-muted/60",
              )}
            >
              All statuses
            </button>
            {STATUS_FILTERS.map((s) => {
              const cfg = STATUS_CFG[s];
              const active = status === s;
              return (
                <button
                  key={s}
                  onClick={() => setFilter({ status: active ? null : s })}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                    active
                      ? cn(cfg.bg, cfg.text, cfg.border, "shadow-sm")
                      : "bg-white text-muted-foreground border-border hover:bg-muted/60",
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                  {cfg.label === "ARRIVED" ? "Arrived" : cfg.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div
        className={cn(
          "flex-1 overflow-auto transition-opacity",
          isFetching && !isLoading && "opacity-70",
        )}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <LoadingSpinner />
              <p className="text-sm text-muted-foreground">
                Loading appointments…
              </p>
            </div>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <AlertTriangle className="w-8 h-8 text-danger" />
            <p className="text-sm font-semibold text-foreground">
              Couldn't load appointments
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200"
            >
              Try again
            </button>
          </div>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
            <div className="p-5 bg-muted rounded-full">
              <Clock className="w-10 h-10 text-muted-foreground/60" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">
                No appointments {range === "today" ? "today" : "in this range"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {hasFilters
                  ? "Nothing matches these filters."
                  : "Book one, or look at another date range."}
              </p>
            </div>
            <div className="flex gap-2">
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-colors"
                >
                  Clear filters
                </button>
              )}
              <button
                onClick={() => setShowBook(true)}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Book appointment
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse bg-white">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgb(0_0_0/0.08),0_2px_6px_-2px_rgb(0_0_0/0.06)]">
              <tr>
                <SortTh
                  label="Time"
                  field="scheduledAt"
                  sort={sort}
                  onSort={toggleSort}
                  className="pl-5"
                />
                <SortTh
                  label="Patient"
                  field="patient"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortTh
                  label="Type"
                  field="type"
                  sort={sort}
                  onSort={toggleSort}
                  className="hidden md:table-cell"
                />
                <SortTh
                  label="Dentist"
                  field="dentist"
                  sort={sort}
                  onSort={toggleSort}
                  className="hidden lg:table-cell"
                />
                <SortTh
                  label="Status"
                  field="status"
                  sort={sort}
                  onSort={toggleSort}
                />
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground hidden 2xl:table-cell">
                  Code
                </th>
                <th className="pl-4 pr-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            {groups.map((g) => {
              const h = g.day ? dayHeading(g.day) : null;
              return (
                <tbody key={g.key}>
                  {h && (
                    <tr className="bg-muted/70">
                      <th
                        colSpan={7}
                        scope="rowgroup"
                        className="pl-5 pr-4 py-2 text-left border-b border-border/60"
                      >
                        <span
                          className={cn(
                            "text-xs font-bold",
                            h.label === "Today"
                              ? "text-indigo-700"
                              : "text-foreground",
                          )}
                        >
                          {h.label}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {h.date}
                        </span>
                        <span className="text-xs text-muted-foreground/80 ml-2 tabular-nums">
                          · {g.items.length}
                        </span>
                      </th>
                    </tr>
                  )}
                  {g.items.map((apt) => (
                    <AptRow
                      key={apt.id}
                      apt={apt}
                      selected={selectedApt?.id === apt.id}
                      busy={busy}
                      onOpen={() => setSelectedApt(apt)}
                      onEdit={() => {
                        setSelectedApt(apt);
                        setShowEdit(true);
                      }}
                      onConfirm={() => confirmMutation.mutate(apt.id)}
                      onArrive={() => arriveMutation.mutate(apt.id)}
                      onStartVisit={() => startVisit(apt)}
                    />
                  ))}
                </tbody>
              );
            })}
          </table>
        )}
      </div>

      {/* ── Footer / pagination ── */}
      {!isLoading && meta.total > 0 && (
        <div className="bg-white border-t border-border px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">
            Showing{" "}
            <span className="font-bold text-foreground">
              {firstRow}–{lastRow}
            </span>{" "}
            of <span className="font-bold text-foreground">{meta.total}</span>
          </span>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Rows
              <select
                value={limit}
                onChange={(e) => setFilter({ limit: e.target.value })}
                className="px-2 py-1 border border-border rounded-md bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilter({ page: String(page - 1) })}
                disabled={page <= 1}
                aria-label="Previous page"
                className="p-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground px-2 tabular-nums">
                Page <span className="font-bold text-foreground">{page}</span>{" "}
                of {totalPages}
              </span>
              <button
                onClick={() => setFilter({ page: String(page + 1) })}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="p-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer ── */}
      {selectedApt && !showEdit && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setSelectedApt(null)}
          />
          <AptDrawer
            apt={selectedApt}
            onClose={() => setSelectedApt(null)}
            onArrive={() => arriveMutation.mutate(selectedApt.id)}
            onStartVisit={() => startVisit(selectedApt)}
            onCancel={handleCancel}
            onConfirm={() => confirmMutation.mutate(selectedApt.id)}
            onEdit={() => setShowEdit(true)}
            onDelete={handleDelete}
            loading={busy}
          />
        </>
      )}

      <EditModal
        open={showEdit}
        apt={selectedApt}
        onClose={() => setShowEdit(false)}
        onSave={(id, d) => editMutation.mutate({ id, data: d })}
        dentists={dentists}
        loading={editMutation.isPending}
      />

      <BookModal
        open={showBook}
        onClose={() => setShowBook(false)}
        onBook={(d) => bookMutation.mutate(d)}
        dentists={dentists}
        loading={bookMutation.isPending}
      />

      <RoleWarningDialog
        open={showRoleWarning}
        onClose={() => setShowRoleWarning(false)}
        userRole={user?.role}
      />
    </div>
  );
}
