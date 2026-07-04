// src/pages/reports/PatientReportsPage.tsx
"use client";

import { useState, useMemo, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users, UserCheck, UserPlus, CalendarDays,
  TrendingUp, TrendingDown, Minus,
  Download, Printer, RefreshCw, AlertCircle,
} from "lucide-react";

import { usePatientReport, exportToCSV, printReport } from "@/hooks/usePatientReports";
import type {
  PatientFullReport, ReportPeriod,
  TrendDataPoint, GenderDataPoint, AgeGroupDataPoint,
  InsuranceDataPoint, CityDataPoint, GrowthDataPoint,
} from "@/types/reports";

// ─── Design tokens ─────────────────────────────────────────────────────────

const CHART = {
  teal:   "#0D9488",
  teal2:  "#5EEAD4",
  blue:   "#3B82F6",
  indigo: "#6366F1",
  purple: "#A855F7",
  rose:   "#F43F5E",
  amber:  "#F59E0B",
  green:  "#22C55E",
  red:    "#EF4444",
  slate:  "#64748B",
} as const;

const AGE_PALETTE   = [CHART.teal, CHART.blue, CHART.indigo, CHART.purple, CHART.rose, CHART.amber, CHART.slate];
const GENDER_COLORS = [CHART.teal, CHART.rose, CHART.slate];
const STATUS_COLORS = [CHART.green, CHART.red];
const INS_COLORS    = [CHART.teal, CHART.blue, CHART.amber, CHART.slate, CHART.rose];

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-UG");
}

function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

// ─── Shared chart components ───────────────────────────────────────────────

const CustomTooltip = ({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

interface PieLabelProps {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number; percent: number;
}
const PieInnerLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: PieLabelProps) => {
  if (percent < 0.05) return null;
  const R  = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x  = cx + R * Math.cos(-(midAngle * Math.PI) / 180);
  const y  = cy + R * Math.sin(-(midAngle * Math.PI) / 180);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle"
      dominantBaseline="central" fontSize={12} fontWeight={500}>
      {`${Math.round(percent * 100)}%`}
    </text>
  );
};

// ─── Legend row ────────────────────────────────────────────────────────────

function LegendDot({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="size-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
      <span>{label}</span>
      <span className="font-semibold text-foreground ml-auto">{fmt(value)}</span>
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label:    string;
  value:    number;
  sub?:     string;
  delta?:   number;    // pct change
  color:    string;
  loading?: boolean;
}

function StatCard({ icon: Icon, label, value, sub, delta, color, loading }: StatCardProps) {
  const DeltaIcon =
    delta == null ? null
    : delta > 0 ? TrendingUp
    : delta < 0 ? TrendingDown
    : Minus;

  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {label}
              </p>
              <div
                className="size-8 rounded-lg flex items-center justify-center"
                style={{ background: `${color}18` }}
              >
                <Icon size={16} style={{ color }} />
              </div>
            </div>
            <p className="text-3xl font-semibold tracking-tight">{fmt(value)}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {DeltaIcon && delta != null && (
                <>
                  <DeltaIcon
                    size={12}
                    className={delta >= 0 ? "text-emerald-500" : "text-red-500"}
                  />
                  <span
                    className={`text-xs font-medium ${
                      delta >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {fmtPct(delta)} vs last period
                  </span>
                </>
              )}
              {!DeltaIcon && sub && (
                <p className="text-xs text-muted-foreground">{sub}</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Trend chart ────────────────────────────────────────────────────────────

function TrendChart({
  data, loading,
}: {
  data: TrendDataPoint[];
  loading: boolean;
}) {
  return (
    <div className="h-[240px]">
      {loading ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={CHART.teal}  stopOpacity={0.2} />
                <stop offset="95%" stopColor={CHART.teal}  stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={CHART.blue}  stopOpacity={0.15} />
                <stop offset="95%" stopColor={CHART.blue}  stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone" dataKey="new" name="New"
              stroke={CHART.teal} strokeWidth={2}
              fill="url(#gt)" dot={false} activeDot={{ r: 4 }}
            />
            <Area
              type="monotone" dataKey="returning" name="Returning"
              stroke={CHART.blue} strokeWidth={2} strokeDasharray="4 3"
              fill="url(#gb)" dot={false} activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Growth chart ────────────────────────────────────────────────────────────

function GrowthChart({ data, loading }: { data: GrowthDataPoint[]; loading: boolean }) {
  return (
    <div className="h-[200px]">
      {loading ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false}
              tickFormatter={v => `${v}%`}
            />
            <Tooltip
              formatter={(v: number) => [`${v > 0 ? "+" : ""}${v.toFixed(1)}%`, "Growth"]}
            />
            <Bar dataKey="growthPct" name="Growth %" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.growthPct >= 0 ? CHART.teal : CHART.red} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Age groups chart ─────────────────────────────────────────────────────────

function AgeGroupChart({ data, loading }: { data: AgeGroupDataPoint[]; loading: boolean }) {
  return (
    <div className="h-[200px]">
      {loading ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="group"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" name="Patients" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={AGE_PALETTE[i % AGE_PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Donut chart wrapper ──────────────────────────────────────────────────────

function DonutChart({
  data, colors, loading,
}: {
  data: { name: string; value: number }[];
  colors: string[];
  loading: boolean;
}) {
  return (
    <div className="h-[180px]">
      {loading ? (
        <Skeleton className="h-full w-full rounded-full mx-auto" style={{ maxWidth: 180 }} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} cx="50%" cy="50%"
              innerRadius={52} outerRadius={80}
              dataKey="value"
              labelLine={false}
              label={PieInnerLabel}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => [fmt(v)]} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── City bar rows ─────────────────────────────────────────────────────────────

function CityRows({ data, loading }: { data: CityDataPoint[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-2 flex-1" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    );
  }
  const max = data[0]?.count ?? 1;
  return (
    <div className="space-y-3">
      {data.map((row, i) => (
        <div key={row.city} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-28 truncate text-right flex-shrink-0">
            {row.city}
          </span>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width:      `${(row.count / max) * 100}%`,
                background: AGE_PALETTE[i % AGE_PALETTE.length],
              }}
            />
          </div>
          <span className="text-xs font-semibold text-foreground w-12 text-right flex-shrink-0">
            {fmt(row.count)}
          </span>
          <Badge variant="outline" className="text-xs px-1.5 py-0 flex-shrink-0">
            {row.pct}%
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ─── Error banner ──────────────────────────────────────────────────────────────

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
      <AlertCircle size={18} className="text-destructive flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-destructive">Failed to load report</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}

// ─── Date range presets ────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DATE_PRESETS = [
  {
    label: "Last 30 days",
    get: () => ({
      startDate: isoDate(new Date(Date.now() - 30 * 86400_000)),
      endDate:   isoDate(new Date()),
    }),
  },
  {
    label: "Last 3 months",
    get: () => ({
      startDate: isoDate(new Date(Date.now() - 90 * 86400_000)),
      endDate:   isoDate(new Date()),
    }),
  },
  {
    label: "Last 6 months",
    get: () => ({
      startDate: isoDate(new Date(Date.now() - 180 * 86400_000)),
      endDate:   isoDate(new Date()),
    }),
  },
  {
    label: "Last 12 months",
    get: () => ({
      startDate: isoDate(new Date(Date.now() - 365 * 86400_000)),
      endDate:   isoDate(new Date()),
    }),
  },
  {
    label: "This year",
    get: () => ({
      startDate: `${new Date().getFullYear()}-01-01`,
      endDate:   isoDate(new Date()),
    }),
  },
] as const;

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function PatientReportsPage() {
  const [period,    setPeriod]    = useState<ReportPeriod>("monthly");
  const [dateRange, setDateRange] = useState<{ startDate?: string; endDate?: string }>({});
  const [preset,    setPreset]    = useState<string>("Last 12 months");

  const query = useMemo(
    () => ({ period, ...dateRange }),
    [period, dateRange],
  );

  const { data: report, loading, error, refetch } = usePatientReport(query);

  const handlePreset = useCallback((label: string) => {
    const found = DATE_PRESETS.find(p => p.label === label);
    if (found) { setPreset(label); setDateRange(found.get()); }
  }, []);

  // ── Export handlers ──────────────────────────────────────────────────────

  const exportSummary = useCallback(() => {
    if (!report) return;
    const s = report.summary;
    exportToCSV([
      { Metric: "Total patients",     Value: s.total     },
      { Metric: "Active patients",    Value: s.active    },
      { Metric: "Inactive patients",  Value: s.inactive  },
      { Metric: "New today",          Value: s.today     },
      { Metric: "New this week",      Value: s.thisWeek  },
      { Metric: "New this month",     Value: s.thisMonth },
      { Metric: "Active rate (%)",    Value: s.activeRate },
      { Metric: "vs Last month (%)",  Value: s.newVsLastMonth },
    ], "patient_summary");
  }, [report]);

  const exportTrends = useCallback(() => {
    if (!report) return;
    exportToCSV(
      report.trends.map(t => ({
        Period: t.label, "New Patients": t.new,
        "Returning Patients": t.returning, Total: t.total,
      })),
      "patient_trends",
    );
  }, [report]);

  const exportDemographics = useCallback(() => {
    if (!report) return;
    const rows = [
      ...report.gender.map(g => ({ Section: "Gender", Category: g.gender, Count: g.count, "Pct(%)": g.pct })),
      ...report.ageGroups.map(a => ({ Section: "Age Group", Category: a.group, Count: a.count, "Pct(%)": a.pct })),
    ];
    exportToCSV(rows, "patient_demographics");
  }, [report]);

  const exportCities = useCallback(() => {
    if (!report) return;
    exportToCSV(
      report.cities.map(c => ({ City: c.city, Count: c.count, "Pct(%)": c.pct })),
      "patient_cities",
    );
  }, [report]);

  const exportAll = useCallback(() => {
    exportSummary();
    setTimeout(exportTrends, 200);
    setTimeout(exportDemographics, 400);
    setTimeout(exportCities, 600);
  }, [exportSummary, exportTrends, exportDemographics, exportCities]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const genderForPie = useMemo(
    () => (report?.gender ?? []).map(g => ({ name: g.gender, value: g.count })),
    [report],
  );

  const statusForPie = useMemo(
    () => (report?.status ?? []).map(s => ({ name: s.status, value: s.count })),
    [report],
  );

  const insForPie = useMemo(
    () => (report?.insurance ?? []).map(i => ({ name: i.status, value: i.count })),
    [report],
  );

  const s = report?.summary;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 py-2 px-1 max-w-screen-xl mx-auto print:p-0">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patient reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analytics and demographic breakdown for clinical staff
            {report && (
              <span className="ml-2 text-xs">
                · Generated {new Date(report.generatedAt).toLocaleString()}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <Tabs value={period} onValueChange={v => setPeriod(v as ReportPeriod)}>
            <TabsList>
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Date preset */}
          <Select value={preset} onValueChange={handlePreset}>
            <SelectTrigger className="w-38 text-sm h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map(p => (
                <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh */}
          <Button
            variant="outline" size="sm"
            onClick={() => refetch()}
            // onClick={refetch}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Download size={14} />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportAll}>
                All data (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportSummary}>
                Summary only (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportTrends}>
                Trends (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportDemographics}>
                Demographics (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportCities}>
                Cities (CSV)
              </DropdownMenuItem>
              <Separator className="my-1" />
              <DropdownMenuItem onClick={() => printReport("Patient Reports – DHMS")}>
                <Printer size={14} className="mr-2" />
                Print / Save PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && <ErrorBanner message={error} onRetry={refetch} />}

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={Users} label="Total patients"
          value={s?.total ?? 0}
          sub={`${s?.activeRate ?? 0}% active rate`}
          color={CHART.teal} loading={loading}
        />
        <StatCard
          icon={UserCheck} label="Active patients"
          value={s?.active ?? 0}
          sub={`${s?.inactive ?? 0} inactive`}
          color={CHART.green} loading={loading}
        />
        <StatCard
          icon={CalendarDays} label="New this month"
          value={s?.thisMonth ?? 0}
          delta={s?.newVsLastMonth}
          color={CHART.blue} loading={loading}
        />
        <StatCard
          icon={UserPlus} label="Registered today"
          value={s?.today ?? 0}
          sub={`${s?.thisWeek ?? 0} this week`}
          delta={s?.newVsLastWeek}
          color={CHART.indigo} loading={loading}
        />
      </div>

      {/* ── Trend chart ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">New patient registrations</CardTitle>
              <CardDescription>
                {period === "daily" ? "Daily" : period === "weekly" ? "Weekly" : "Monthly"} new vs returning patients
              </CardDescription>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: CHART.teal }} />
                New
                <span className="font-semibold text-foreground">
                  {fmt(report?.trends.reduce((s, d) => s + d.new, 0) ?? 0)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-sm border-dashed border"
                  style={{ background: CHART.blue + "44", borderColor: CHART.blue }}
                />
                Returning
                <span className="font-semibold text-foreground">
                  {fmt(report?.trends.reduce((s, d) => s + d.returning, 0) ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TrendChart data={report?.trends ?? []} loading={loading} />
        </CardContent>
      </Card>

      {/* ── Demographics row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Active vs inactive */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Active vs inactive</CardTitle>
            <CardDescription>Current patient status breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DonutChart data={statusForPie} colors={STATUS_COLORS} loading={loading} />
            <div className="space-y-1.5">
              {(report?.status ?? []).map((d, i) => (
                <LegendDot key={d.status} color={STATUS_COLORS[i % STATUS_COLORS.length]}
                  label={d.status} value={d.count} />
              ))}
              {loading && Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Gender distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gender distribution</CardTitle>
            <CardDescription>Registered patient breakdown by gender</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DonutChart data={genderForPie} colors={GENDER_COLORS} loading={loading} />
            <div className="space-y-1.5">
              {(report?.gender ?? []).map((d, i) => (
                <LegendDot key={d.gender} color={GENDER_COLORS[i % GENDER_COLORS.length]}
                  label={d.gender.charAt(0) + d.gender.slice(1).toLowerCase()}
                  value={d.count} />
              ))}
              {loading && Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Age groups ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Patient age groups</CardTitle>
              <CardDescription>Distribution of patients by age bracket (calculated from DOB)</CardDescription>
            </div>
            <Button
              variant="ghost" size="sm"
              className="gap-1.5 text-muted-foreground print:hidden"
              onClick={exportDemographics}
            >
              <Download size={14} /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <AgeGroupChart data={report?.ageGroups ?? []} loading={loading} />
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4">
            {(report?.ageGroups ?? []).map((g, i) => (
              <div key={g.group} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-sm" style={{ background: AGE_PALETTE[i % AGE_PALETTE.length] }} />
                {g.group}
                <span className="font-semibold text-foreground">{fmt(g.count)}</span>
                <span className="text-muted-foreground">({g.pct}%)</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Insurance + Cities ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Insurance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Insurance status</CardTitle>
            <CardDescription>Coverage breakdown across all registered patients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DonutChart data={insForPie} colors={INS_COLORS} loading={loading} />
            <div className="space-y-1.5">
              {(report?.insurance ?? []).map((d, i) => (
                <LegendDot key={d.status} color={INS_COLORS[i % INS_COLORS.length]}
                  label={d.status} value={d.count} />
              ))}
              {loading && Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cities */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Patients by city</CardTitle>
                <CardDescription>Top patient locations by registration count</CardDescription>
              </div>
              <Button
                variant="ghost" size="sm"
                className="gap-1.5 text-muted-foreground print:hidden"
                onClick={exportCities}
              >
                <Download size={14} /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <CityRows data={report?.cities ?? []} loading={loading} />
          </CardContent>
        </Card>
      </div>

      {/* ── Growth rate ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Month-over-month growth</CardTitle>
          <CardDescription>
            Percentage change in new patient registrations each month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GrowthChart data={report?.growth ?? []} loading={loading} />
          <div className="flex gap-4 text-xs text-muted-foreground mt-3">
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: CHART.teal }} />
              Growth month
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: CHART.red }} />
              Decline month
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Footer ── */}
      <p className="text-xs text-muted-foreground text-center print:hidden">
        Data fetched from <code className="font-mono">GET /api/reports/patients</code>
        {" · "}
        Refreshes on period or date range change
      </p>
    </div>
  );
}