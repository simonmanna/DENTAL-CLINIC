"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  UserCheck,
  UserPlus,
  CalendarDays,
  Search,
  Download,
  Printer,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { patientsApi } from "../../lib/api/patients";
import { Patient } from "@/types/patients";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PatientRow {
  id: string;
  name: string;
  registeredAt: string;
  age: number | string;
  gender: string;
  doctor: string;
  visits: number;
  appointments: number;
}

interface Analytics {
  total: number;
  male: number;
  female: number;
  avgAge: number;
  newThisMonth: number;
}

interface ListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function getAge(dob: string): number {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return startOfDay(new Date(d.setDate(diff)));
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// ─── Export utilities ────────────────────────────────────────────────────────

function exportToCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h] ?? "";
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        })
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportToExcel(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="UTF-8"></head>
      <body>
        <table>
          <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows
              .map(
                (r) =>
                  `<tr>${headers.map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Date presets ────────────────────────────────────────────────────────────

type DatePreset = "all" | "today" | "thisWeek" | "thisMonth" | "custom";
const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "This Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "custom", label: "Custom" },
];

function getPresetRange(key: DatePreset): { from: string; to: string } | null {
  const now = new Date();
  switch (key) {
    case "all":
      // No date bounds → every patient is visible.
      return { from: "", to: "" };
    case "today":
      return { from: isoDate(now), to: isoDate(now) };
    case "thisWeek": {
      const s = startOfWeek(new Date(now));
      return { from: isoDate(s), to: isoDate(endOfDay(now)) };
    }
    case "thisMonth": {
      const s = startOfMonth(new Date(now));
      return { from: isoDate(s), to: isoDate(endOfDay(now)) };
    }
    default:
      // "custom" — leave whatever the user has typed untouched.
      return null;
  }
}

// ─── Row mapping (shared by the table, export and print) ──────────────────────

function toRow(p: Patient): PatientRow {
  return {
    id: p.id,
    name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "—",
    registeredAt: p.registeredAt
      ? new Date(p.registeredAt).toLocaleDateString("en-UG", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—",
    age: p.dateOfBirth ? getAge(p.dateOfBirth) : "—",
    gender: p.gender
      ? p.gender.charAt(0) + p.gender.slice(1).toLowerCase()
      : "—",
    doctor: p.appointments?.[0]?.dentist
      ? `${p.appointments[0].dentist.firstName} ${p.appointments[0].dentist.lastName}`
      : "Unassigned",
    visits: (p as any)._count?.emrRecords ?? 0,
    appointments: (p as any)._count?.appointments ?? 0,
  };
}

function toExportRow(r: PatientRow) {
  return {
    "Patient Name": r.name,
    "Date Registered": r.registeredAt,
    Age: r.age,
    Gender: r.gender,
    "Assigned Doctor": r.doctor,
    "Total Visits": r.visits,
    "Total Appointments": r.appointments,
  };
}

// ─── Analytics Card ──────────────────────────────────────────────────────────

function AnalyticsCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
            {label}
          </p>
          <div
            className="size-7 rounded-md flex items-center justify-center"
            style={{ background: `${color}18` }}
          >
            <Icon size={14} style={{ color }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <p className="text-xl font-semibold tracking-tight leading-none">
            {value}
          </p>
          {sub && (
            <p className="text-[11px] text-muted-foreground leading-tight">
              {sub}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
// function AnalyticsCard({
//   icon: Icon,
//   label,
//   value,
//   sub,
//   color,
// }: {
//   icon: React.ElementType;
//   label: string;
//   value: number | string;
//   sub?: string;
//   color: string;
// }) {
//   return (
//     <Card>
//       <CardContent className="px-4 py-1">
//         <div className="flex items-center justify-between mb-1.5">
//           <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
//             {label}
//           </p>
//           <div
//             className="size-7 rounded-md flex items-center justify-center"
//             style={{ background: `${color}18` }}
//           >
//             <Icon size={14} style={{ color }} />
//           </div>
//         </div>
//         <p className="text-xl font-semibold tracking-tight leading-none">{value}</p>
//         {sub && (
//           <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
//             {sub}
//           </p>
//         )}
//       </CardContent>
//     </Card>
//   );
// }

// function AnalyticsCard({
//   icon: Icon,
//   label,
//   value,
//   sub,
//   color,
// }: {
//   icon: React.ElementType;
//   label: string;
//   value: number | string;
//   sub?: string;
//   color: string;
// }) {
//   return (
//     <Card>
//       <CardContent className="pt-5 pb-4">
//         <div className="flex items-start justify-between mb-2">
//           <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
//             {label}
//           </p>
//           <div
//             className="size-8 rounded-lg flex items-center justify-center"
//             style={{ background: `${color}18` }}
//           >
//             <Icon size={16} style={{ color }} />
//           </div>
//         </div>
//         <p className="text-2xl font-semibold tracking-tight">{value}</p>
//         {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
//       </CardContent>
//     </Card>
//   );
// }

// ─── Sort Header ─────────────────────────────────────────────────────────────

function SortHeader({
  label,
  active,
  order,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  order?: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none whitespace-nowrap ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        {active &&
          (order === "asc" ? (
            <ChevronUp size={14} className="text-teal-600" />
          ) : (
            <ChevronDown size={14} className="text-teal-600" />
          ))}
      </div>
    </th>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function PatientListReportPage() {
  const navigate = useNavigate();

  // ── Filter state ───────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState<string>("");
  const [ageMode, setAgeMode] = useState<"any" | "exact" | "range">("any");
  const [ageExact, setAgeExact] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("registeredAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const limit = 20;

  // ── Apply date preset ────────────────────────────────────────────────────────
  useEffect(() => {
    const range = getPresetRange(datePreset);
    if (range) {
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  }, [datePreset]);

  // ── Build query object ─────────────────────────────────────────────────────
  const query = useMemo(() => {
    const q: Record<string, string> = {
      page: String(page),
      limit: String(limit),
      sortBy,
      sortOrder,
    };
    if (search.trim()) q.search = search.trim();
    if (gender && gender !== "all") q.gender = gender;

    if (ageMode === "exact" && ageExact) {
      q.ageMin = ageExact;
      q.ageMax = ageExact;
    } else if (ageMode === "range") {
      if (ageMin) q.ageMin = ageMin;
      if (ageMax) q.ageMax = ageMax;
    }

    if (dateFrom) q.dateFrom = dateFrom;
    if (dateTo) q.dateTo = dateTo;

    return q;
  }, [
    search,
    gender,
    ageMode,
    ageExact,
    ageMin,
    ageMax,
    datePreset,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
    page,
  ]);

  // ── Data fetching (react-query + patientsApi) ─────────────────────────────
  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
    refetch,
  } = useQuery({
    queryKey: ["patient-list-report", query],
    queryFn: () => patientsApi.getAllWithMeta(query),
  });

  // Strip pagination/sort for analytics so page changes don't re-fetch analytics
  const analyticsQuery = useMemo(() => {
    const a = { ...query };
    delete a.page;
    delete a.limit;
    delete a.sortBy;
    delete a.sortOrder;
    return a;
  }, [query]);

  const { data: analytics } = useQuery({
    queryKey: ["patient-analytics", analyticsQuery],
    queryFn: () => patientsApi.getAnalytics(analyticsQuery),
  });

  // ── Derived rows ───────────────────────────────────────────────────────────
  const rows: PatientRow[] = useMemo(
    () => (listData?.data ?? []).map(toRow),
    [listData],
  );

  // ── Meta / pagination ──────────────────────────────────────────────────────
  const serverMeta = listData?.meta;
  const total = serverMeta?.total ?? rows.length;
  const meta: ListMeta = serverMeta ?? {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };

  // ── Sorting handler ────────────────────────────────────────────────────────
  const toggleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortOrder("asc");
      }
      setPage(1);
    },
    [sortBy],
  );

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetFilters = useCallback(() => {
    setSearch("");
    setGender("");
    setAgeMode("any");
    setAgeExact("");
    setAgeMin("");
    setAgeMax("");
    setDatePreset("all");
    setSortBy("registeredAt");
    setSortOrder("desc");
    setPage(1);
  }, []);

  // ── Active-filter summary (shown on the printed report) ────────────────────
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (search.trim()) parts.push(`Search: "${search.trim()}"`);
    if (gender && gender !== "all") parts.push(`Gender: ${gender}`);
    if (ageMode === "exact" && ageExact) parts.push(`Age: ${ageExact}`);
    if (ageMode === "range" && (ageMin || ageMax))
      parts.push(`Age: ${ageMin || "0"}–${ageMax || "∞"}`);
    if (datePreset !== "all") {
      const label = PRESETS.find((p) => p.key === datePreset)?.label ?? "";
      const range =
        datePreset === "custom" && (dateFrom || dateTo)
          ? ` (${dateFrom || "…"} → ${dateTo || "…"})`
          : "";
      parts.push(`Period: ${label}${range}`);
    }
    return parts.length ? parts.join("  ·  ") : "All patients";
  }, [
    search,
    gender,
    ageMode,
    ageExact,
    ageMin,
    ageMax,
    datePreset,
    dateFrom,
    dateTo,
  ]);

  // ── Full result-set loader (export & print must not be limited to one page) ─
  const [busy, setBusy] = useState(false);
  const [printRows, setPrintRows] = useState<PatientRow[] | null>(null);

  const fetchAllRows = useCallback(async (): Promise<PatientRow[]> => {
    const allQuery = {
      ...analyticsQuery, // filters only (no page/limit/sort)
      sortBy,
      sortOrder,
      page: "1",
      limit: String(meta.total || 100000),
    };
    const res = await patientsApi.getAllWithMeta(allQuery);
    return (res.data ?? []).map(toRow);
  }, [analyticsQuery, sortBy, sortOrder, meta.total]);

  const handleExport = useCallback(
    async (format: "csv" | "excel") => {
      setBusy(true);
      try {
        const data = (await fetchAllRows()).map(toExportRow);
        if (!data.length) return;
        if (format === "csv") exportToCSV(data, "patients_report");
        else exportToExcel(data, "patients_report");
      } finally {
        setBusy(false);
      }
    },
    [fetchAllRows],
  );

  const handlePrint = useCallback(async () => {
    setBusy(true);
    try {
      setPrintRows(await fetchAllRows());
    } finally {
      setBusy(false);
    }
  }, [fetchAllRows]);

  // Once the print rows are in the DOM, open the print dialog, then clear them.
  useEffect(() => {
    if (!printRows) return;
    const prevTitle = document.title;
    document.title = "Patient Directory Report";
    const t = setTimeout(() => {
      window.print();
      document.title = prevTitle;
      setPrintRows(null);
    }, 80);
    return () => clearTimeout(t);
  }, [printRows]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 py-1 px-1 print:p-0">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 no-print">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Patient Detailed Report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Filterable register of all patients with visit summaries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5"
          >
            <RotateCcw size={14} />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5" disabled={busy}>
                <Download size={14} className={busy ? "animate-pulse" : ""} />
                {busy ? "Preparing…" : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                <FileText size={14} className="mr-2" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("excel")}>
                <FileSpreadsheet size={14} className="mr-2" />
                Export Excel
              </DropdownMenuItem>
              <Separator className="my-1" />
              <DropdownMenuItem onClick={handlePrint}>
                <Printer size={14} className="mr-2" />
                Print / Save PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Analytics ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 no-print">
        <AnalyticsCard
          icon={Users}
          label="Total Patients"
          value={fmt(analytics?.total ?? 0)}
          sub="Matching filters"
          color="#0D9488"
        />
        <AnalyticsCard
          icon={UserCheck}
          label="Male Patients"
          value={fmt(analytics?.male ?? 0)}
          sub={
            analytics && analytics.total > 0
              ? `${Math.round((analytics.male / analytics.total) * 100)}%`
              : "0%"
          }
          color="#3B82F6"
        />
        <AnalyticsCard
          icon={UserPlus}
          label="Female Patients"
          value={fmt(analytics?.female ?? 0)}
          sub={
            analytics && analytics.total > 0
              ? `${Math.round((analytics.female / analytics.total) * 100)}%`
              : "0%"
          }
          color="#EC4899"
        />
        <AnalyticsCard
          icon={CalendarDays}
          label="Average Age"
          value={analytics?.avgAge ?? 0}
          sub="Years old"
          color="#F59E0B"
        />
        <AnalyticsCard
          icon={ArrowRight}
          label="New This Month"
          value={fmt(analytics?.newThisMonth ?? 0)}
          sub="Registered patients"
          color="#22C55E"
        />
      </div>

      {/* ── Filters ── */}
      <Card className="no-print">
        <CardContent className="pt-1 pb-1">
          <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search patient name, code, phone…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9 h-9"
              />
            </div>

            {/* Gender */}
            <Select
              value={gender}
              onValueChange={(v) => {
                setGender(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="Gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genders</SelectItem>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>

            {/* Age filter */}
            <div className="flex items-center gap-2">
              <Select
                value={ageMode}
                onValueChange={(v: any) => {
                  setAgeMode(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-28 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any age</SelectItem>
                  <SelectItem value="exact">Exact</SelectItem>
                  <SelectItem value="range">Range</SelectItem>
                </SelectContent>
              </Select>
              {ageMode === "exact" && (
                <Input
                  type="number"
                  placeholder="Age"
                  value={ageExact}
                  onChange={(e) => {
                    setAgeExact(e.target.value);
                    setPage(1);
                  }}
                  className="w-20 h-9"
                />
              )}
              {ageMode === "range" && (
                <>
                  <Input
                    type="number"
                    placeholder="Min"
                    value={ageMin}
                    onChange={(e) => {
                      setAgeMin(e.target.value);
                      setPage(1);
                    }}
                    className="w-20 h-9"
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={ageMax}
                    onChange={(e) => {
                      setAgeMax(e.target.value);
                      setPage(1);
                    }}
                    className="w-20 h-9"
                  />
                </>
              )}
            </div>

            {/* Date presets */}
            <div className="flex items-center gap-1">
              {PRESETS.map((p) => (
                <Button
                  key={p.key}
                  variant={datePreset === p.key ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs px-3"
                  onClick={() => {
                    setDatePreset(p.key);
                    setPage(1);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            {/* Custom date pickers */}
            {datePreset === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 w-36 text-sm"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 w-36 text-sm"
                />
              </div>
            )}

            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="gap-1.5 text-muted-foreground"
              >
                <RotateCcw size={13} />
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Error ── */}
      {listError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3 no-print">
          <AlertCircle size={18} className="text-destructive flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">
              Failed to load report
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {(listError as Error).message}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* ── Data Table ── */}
      <Card className="no-print">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Patient Register</CardTitle>
              <CardDescription>
                {listLoading
                  ? "Loading patients…"
                  : `${fmt(meta.total)} patient${meta.total === 1 ? "" : "s"} found`}
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground no-print">
              Page {meta.page} of {Math.max(1, meta.totalPages)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr className="border-b">
                  <SortHeader
                    label="Patient Name"
                    active={sortBy === "name"}
                    order={sortOrder}
                    onClick={() => toggleSort("name")}
                    className="text-left py-2.5 px-4 font-semibold text-muted-foreground"
                  />
                  <SortHeader
                    label="Date Registered"
                    active={sortBy === "registeredAt"}
                    order={sortOrder}
                    onClick={() => toggleSort("registeredAt")}
                    className="text-left py-2.5 px-4 font-semibold text-muted-foreground"
                  />
                  <SortHeader
                    label="Age"
                    active={sortBy === "age"}
                    order={sortOrder}
                    onClick={() => toggleSort("age")}
                    className="text-left py-2.5 px-4 font-semibold text-muted-foreground"
                  />
                  <SortHeader
                    label="Gender"
                    active={sortBy === "gender"}
                    order={sortOrder}
                    onClick={() => toggleSort("gender")}
                    className="text-left py-2.5 px-4 font-semibold text-muted-foreground"
                  />
                  <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground">
                    Assigned Doctor
                  </th>
                  <SortHeader
                    label="Total Visits"
                    active={sortBy === "visits"}
                    order={sortOrder}
                    onClick={() => toggleSort("visits")}
                    className="text-right py-2.5 px-4 font-semibold text-muted-foreground"
                  />
                  <SortHeader
                    label="Total Appointments"
                    active={sortBy === "appointments"}
                    order={sortOrder}
                    onClick={() => toggleSort("appointments")}
                    className="text-right py-2.5 px-4 font-semibold text-muted-foreground"
                  />
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-3 px-4" colSpan={7}>
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
                      <h3 className="mt-3 text-sm font-semibold text-foreground">
                        No patients found
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Adjust your filters or reset to see all patients.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 no-print"
                        onClick={resetFilters}
                      >
                        Reset Filters
                      </Button>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => navigate(`/patients/${row.id}`)}
                      className="border-b last:border-0 cursor-pointer transition-colors hover:bg-teal-50/40"
                    >
                      <td className="py-2.5 px-4 font-medium text-foreground">
                        {row.name}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {row.registeredAt}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {typeof row.age === "number"
                          ? `${row.age} yrs`
                          : row.age}
                      </td>
                      <td className="py-2.5 px-4">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            row.gender === "Male"
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : row.gender === "Female"
                                ? "border-pink-200 bg-pink-50 text-pink-700"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                          }`}
                        >
                          {row.gender}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {row.doctor}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-foreground">
                        {row.visits}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-foreground">
                        {row.appointments}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {!listLoading && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 no-print">
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <strong>
                  {fmt(Math.min((page - 1) * limit + 1, meta.total))}–
                  {fmt(Math.min(page * limit, meta.total))}
                </strong>{" "}
                of <strong>{fmt(meta.total)}</strong>
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </Button>
                {Array.from({ length: meta.totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 ||
                      p === meta.totalPages ||
                      (p >= page - 1 && p <= page + 1),
                  )
                  .map((p, idx, arr) => (
                    <div key={p} className="flex items-center gap-1">
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="text-xs text-muted-foreground px-1">
                          …
                        </span>
                      )}
                      <Button
                        variant={page === p ? "default" : "outline"}
                        size="sm"
                        className="h-8 w-8 p-0 text-xs"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    </div>
                  ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page === meta.totalPages}
                  onClick={() =>
                    setPage((p) => Math.min(meta.totalPages, p + 1))
                  }
                >
                  ›
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Footer ── */}
      <p className="text-xs text-muted-foreground text-center no-print">
        Data source: <code className="font-mono">GET /api/patients</code> ·
        Server-side paginated & filtered
      </p>

      {/* ── Print-only report (full, unpaginated) ─────────────────────────────
           Rendered only while a print is in progress. Hidden on screen; the
           global `.print-area` rules in index.css isolate it for printing. */}
      {printRows && (
        <div className="print-area hidden print:block text-black">
          <div className="mb-3 border-b border-black/70 pb-2">
            <h1 className="text-lg font-bold">Patient Directory Report</h1>
            <p className="mt-0.5 text-[11px] text-gray-600">
              Generated {new Date().toLocaleString("en-UG")} ·{" "}
              {fmt(printRows.length)} patient
              {printRows.length === 1 ? "" : "s"} · {filterSummary}
            </p>
          </div>

          <div className="mb-3 grid grid-cols-5 gap-2 text-center text-[11px]">
            {[
              { label: "Total", value: analytics?.total ?? printRows.length },
              { label: "Male", value: analytics?.male ?? 0 },
              { label: "Female", value: analytics?.female ?? 0 },
              { label: "Avg Age", value: analytics?.avgAge ?? 0 },
              { label: "New This Month", value: analytics?.newThisMonth ?? 0 },
            ].map((k) => (
              <div key={k.label} className="rounded border border-gray-300 py-1">
                <div className="text-base font-semibold">{fmt(k.value)}</div>
                <div className="text-gray-500">{k.label}</div>
              </div>
            ))}
          </div>

          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Patient Name</th>
                <th className="py-1 pr-2">Date Registered</th>
                <th className="py-1 pr-2">Age</th>
                <th className="py-1 pr-2">Gender</th>
                <th className="py-1 pr-2">Assigned Doctor</th>
                <th className="py-1 pr-2 text-right">Visits</th>
                <th className="py-1 text-right">Appts</th>
              </tr>
            </thead>
            <tbody>
              {printRows.map((r, i) => (
                <tr key={r.id} className="avoid-break border-b border-gray-300">
                  <td className="py-1 pr-2 text-gray-500">{i + 1}</td>
                  <td className="py-1 pr-2 font-medium">{r.name}</td>
                  <td className="py-1 pr-2">{r.registeredAt}</td>
                  <td className="py-1 pr-2">
                    {typeof r.age === "number" ? `${r.age} yrs` : r.age}
                  </td>
                  <td className="py-1 pr-2">{r.gender}</td>
                  <td className="py-1 pr-2">{r.doctor}</td>
                  <td className="py-1 pr-2 text-right">{r.visits}</td>
                  <td className="py-1 text-right">{r.appointments}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-4 text-center text-[10px] text-gray-500">
            Confidential · For internal clinical use only
          </p>
        </div>
      )}
    </div>
  );
}
