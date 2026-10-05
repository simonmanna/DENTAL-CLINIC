// src/pages/dashboard/DashboardPage.tsx
// Clinic overview. Built entirely on the design tokens in src/index.css so the
// page tracks light/dark with the rest of the app — no hardcoded surfaces.
//
// Reading order is deliberate: today's numbers, then anything needing attention,
// then the schedule, then trend, then navigation. A receptionist should be able
// to answer "what is happening right now" without scrolling.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  DatabaseBackup,
  FileText,
  Minus,
  Package,
  PieChart as PieChartIcon,
  Pill,
  Receipt,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { reportsApi, appointmentsApi, backupsApi } from "../../lib/api";
import { cn, formatCurrency, formatTime } from "../../lib/utils";
import { StatusBadge } from "../../components/shared";
import { useAuthStore } from "../../store/auth.store";
import { UserRole } from "@/types/shared";

// ─── Tone system ──────────────────────────────────────────────────────────────
// One tone per semantic meaning. Every value resolves to a CSS variable, which
// is what keeps the cards legible in dark mode without a second colour table.
type Tone = "primary" | "info" | "success" | "warning" | "danger";

const TONE: Record<Tone, { rail: string; chip: string; icon: string }> = {
  primary: { rail: "bg-primary", chip: "bg-primary-muted", icon: "text-primary" },
  info: { rail: "bg-info", chip: "bg-info-muted", icon: "text-info" },
  success: { rail: "bg-success", chip: "bg-success-muted", icon: "text-success" },
  warning: { rail: "bg-warning", chip: "bg-warning-muted", icon: "text-warning" },
  danger: { rail: "bg-danger", chip: "bg-danger-muted", icon: "text-danger" },
};

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
];

const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

// ─── Panel ────────────────────────────────────────────────────────────────────
function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h2>
        {action}
      </header>
      <div className={cn("flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "primary",
  delta,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  tone?: Tone;
  // Growth is signalled by icon and wording as well as colour — colour alone is
  // not an accessible carrier of meaning.
  delta?: { value: number; label: string };
  onClick?: () => void;
}) {
  const t = TONE[tone];
  const dir = delta ? (delta.value > 0 ? "up" : delta.value < 0 ? "down" : "flat") : null;
  const DeltaIcon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;

  return (
    <article
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 pl-5 shadow-xs",
        "transition-shadow duration-200",
        onClick &&
          "cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", t.rail)} aria-hidden="true" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 truncate text-2xl font-semibold leading-none tabular-nums text-foreground">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-9 w-9 flex-none items-center justify-center rounded-lg",
            t.chip,
          )}
        >
          <Icon className={cn("h-4 w-4", t.icon)} aria-hidden="true" />
        </span>
      </div>

      {(sub || delta) && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold tabular-nums",
                dir === "up" && "bg-success-muted text-success",
                dir === "down" && "bg-danger-muted text-danger",
                dir === "flat" && "bg-muted text-muted-foreground",
              )}
            >
              <DeltaIcon className="h-3 w-3" aria-hidden="true" />
              {Math.abs(delta.value)}%
              <span className="sr-only">
                {dir === "up" ? "increase" : dir === "down" ? "decrease" : "no change"}
              </span>
            </span>
          )}
          <span className="truncate text-muted-foreground">{delta?.label ?? sub}</span>
        </div>
      )}
    </article>
  );
}

// ─── Quick actions ────────────────────────────────────────────────────────────
// `roles: undefined` means every signed-in role sees the tile. Gating here means
// the grid never renders a destination the user cannot open.
const QUICK_ACTIONS: {
  label: string;
  icon: React.ElementType;
  path: string;
  tone: Tone;
  roles?: UserRole[];
}[] = [
  { label: "Patients", icon: Users, path: "/patients", tone: "primary" },
  { label: "Appointments", icon: CalendarDays, path: "/appointments", tone: "info" },
  { label: "Visits", icon: Stethoscope, path: "/visits", tone: "primary" },
  { label: "Treatment Plans", icon: ClipboardList, path: "/treatment-plans", tone: "info" },
  { label: "Billing", icon: CreditCard, path: "/billing", tone: "success" },
  { label: "Receipts", icon: Receipt, path: "/receipts", tone: "success" },
  {
    label: "Pharmacy",
    icon: Pill,
    path: "/pharmacy",
    tone: "info",
    roles: [...ADMIN_ROLES, UserRole.PHARMACIST, UserRole.DENTIST],
  },
  { label: "Inventory", icon: Package, path: "/inventory", tone: "warning" },
  { label: "Prescriptions", icon: FileText, path: "/prescriptions-list", tone: "primary" },
  { label: "Staff", icon: UserCog, path: "/staff", tone: "danger", roles: ADMIN_ROLES },
  { label: "Reports", icon: BarChart3, path: "/reports", tone: "warning", roles: ADMIN_ROLES },
  {
    label: "Expenses",
    icon: BadgeDollarSign,
    path: "/expenses",
    tone: "danger",
    roles: ADMIN_ROLES,
  },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <Skeleton className="h-64 lg:col-span-3" />
        <Skeleton className="h-64 lg:col-span-2" />
      </div>
    </div>
  );
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-0.5 font-medium text-popover-foreground">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} className="tabular-nums text-muted-foreground">
          <span className="font-semibold capitalize text-popover-foreground">
            {money ? formatCurrency(p.value) : p.value}
          </span>
          {!money && ` ${String(p.name).replace(/_/g, " ").toLowerCase()}`}
        </p>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: reportsApi.getDashboard,
    refetchInterval: 60_000,
  });

  const { data: backupStatus } = useQuery({
    queryKey: ["backups", "status"],
    queryFn: () => backupsApi.getStatus(),
    refetchInterval: 60_000,
    enabled: isAdmin,
  });

  const { data: todayApts } = useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () =>
      appointmentsApi.getAll({
        date: new Date().toISOString().split("T")[0],
        limit: 7,
      }),
    refetchInterval: 30_000,
  });

  // /reports/revenue is ADMIN-only — gate the request rather than letting every
  // other role trigger a 403 on page load.
  const revenueRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 13);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
      groupBy: "day" as const,
    };
  }, []);

  const { data: revenueReport } = useQuery({
    queryKey: ["reports", "revenue", revenueRange],
    queryFn: () => reportsApi.getRevenue(revenueRange),
    enabled: isAdmin,
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <DashboardSkeleton />;

  const d = dash ?? {};
  const apts = todayApts?.data ?? [];

  const appointmentStatusData: { name: string; value: number }[] =
    d.appointments?.byStatus?.map((s: any) => ({
      name: String(s.status).replace(/_/g, " "),
      value: s._count,
    })) ?? [];

  const revenueTrend =
    revenueReport?.chart?.map((r: any) => ({
      date: new Date(r.date).toLocaleDateString("en-UG", {
        day: "numeric",
        month: "short",
      }),
      revenue: r.revenue,
    })) ?? [];

  const overdue = d.pending?.overdueInvoices ?? 0;
  const outstanding = d.pending?.outstandingBalance ?? 0;
  const lastFull = backupStatus?.lastByKind?.full;
  const backupStale = !!lastFull && lastFull.status !== "success";

  const today = new Date().toLocaleDateString("en-UG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const firstName = user?.staff?.firstName;
  const visibleActions = QUICK_ACTIONS.filter(
    (a) => !a.roles || (user && a.roles.includes(user.role)),
  );

  return (
    <div className="space-y-4 p-4">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {firstName ? `Good day, ${firstName}` : "Clinic Dashboard"}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{today}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            Live · refreshes every minute
          </span>

          {lastFull && (
            <button
              type="button"
              onClick={() => navigate("/admin/backups")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                backupStale
                  ? "border-warning/40 bg-warning-muted text-warning hover:bg-warning-muted/70"
                  : "border-border/70 bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {backupStale ? (
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              )}
              Backup{" "}
              {new Date(lastFull.finishedAt).toLocaleTimeString("en-UG", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </button>
          )}
        </div>
      </header>

      {/* ── KPIs ── */}
      <section aria-label="Key figures">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Total Patients"
            value={d.patients?.total?.toLocaleString() ?? "—"}
            sub={`${d.patients?.newToday ?? 0} registered today · ${
              d.patients?.newThisMonth ?? 0
            } this month`}
            icon={Users}
            tone="primary"
            onClick={() => navigate("/patients")}
          />
          <KpiCard
            label="Appointments Today"
            value={String(d.appointments?.today ?? "—")}
            sub={`${d.appointments?.thisMonth ?? 0} booked this month`}
            icon={CalendarDays}
            tone="info"
            onClick={() => navigate("/appointments")}
          />
          <KpiCard
            label="Revenue Today"
            value={formatCurrency(d.revenue?.today ?? 0, "UGX", true)}
            icon={TrendingUp}
            tone="success"
            delta={{
              value: d.revenue?.growth ?? 0,
              label: `${formatCurrency(
                d.revenue?.thisMonth ?? 0,
                "UGX",
                true,
              )} MTD vs last month`,
            }}
            onClick={isAdmin ? () => navigate("/reports") : undefined}
          />
          <KpiCard
            label="Pending Invoices"
            value={String(d.pending?.invoices ?? "—")}
            sub={`${formatCurrency(outstanding, "UGX", true)} outstanding`}
            icon={FileText}
            tone={overdue > 0 ? "danger" : "warning"}
            onClick={() => navigate("/billing")}
          />
        </div>
      </section>

      {/* ── Attention strip ── Renders only when something genuinely needs
             acting on, so its presence is itself the signal. */}
      {(overdue > 0 || backupStale) && (
        <section
          aria-label="Needs attention"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-danger/25 bg-danger-muted/60 px-4 py-2.5"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-danger">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Needs attention
          </span>
          {overdue > 0 && (
            <button
              type="button"
              onClick={() => navigate("/billing")}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-semibold tabular-nums">{overdue}</span> invoice
              {overdue === 1 ? "" : "s"} past due
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
          {backupStale && (
            <button
              type="button"
              onClick={() => navigate("/admin/backups")}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <DatabaseBackup className="h-3 w-3" aria-hidden="true" />
              Last backup did not complete
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </section>
      )}

      {/* ── Schedule + status ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <Panel
          title="Today's Schedule"
          icon={CalendarDays}
          className="lg:col-span-3"
          action={
            <button
              type="button"
              onClick={() => navigate("/appointments")}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          }
        >
          {apts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <CalendarX2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-foreground">
                No appointments scheduled today
              </p>
              <button
                type="button"
                onClick={() => navigate("/appointments")}
                className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Book an appointment
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {apts.map((apt: any) => (
                <li key={apt.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/appointments/${apt.id}`)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <div className="w-[58px] flex-none">
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {formatTime(apt.scheduledAt)}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {apt.duration}&nbsp;min
                      </p>
                    </div>
                    <span className="h-9 w-px flex-none bg-border" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {apt.patient?.firstName} {apt.patient?.lastName}
                      </p>
                      <p className="truncate text-xs capitalize text-muted-foreground">
                        {String(apt.type ?? "")
                          .replace(/_/g, " ")
                          .toLowerCase()}
                        {apt.dentist?.lastName && ` · Dr. ${apt.dentist.lastName}`}
                      </p>
                    </div>
                    <StatusBadge status={apt.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Appointment Status"
          icon={PieChartIcon}
          className="lg:col-span-2"
          bodyClassName="p-4"
        >
          {appointmentStatusData.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={appointmentStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {appointmentStatusData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Centre total: the donut's own label, so the legend stays a
                    breakdown rather than doubling as the headline figure. */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-semibold tabular-nums text-foreground">
                    {appointmentStatusData.reduce((s, i) => s + i.value, 0)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">today</span>
                </div>
              </div>

              <ul className="space-y-1.5">
                {appointmentStatusData.map((item, i) => (
                  <li key={item.name} className="flex items-center justify-between text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 flex-none rounded-full"
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        aria-hidden="true"
                      />
                      <span className="truncate capitalize text-muted-foreground">
                        {item.name.toLowerCase()}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {item.value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Activity className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-foreground">No activity yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Status appears once today's appointments are booked.
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Revenue trend (admin only) ── */}
      {isAdmin && revenueTrend.length > 1 && (
        <Panel
          title="Revenue · last 14 days"
          icon={TrendingUp}
          bodyClassName="px-2 pb-3 pt-4"
          action={
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatCurrency(revenueReport?.total ?? 0, "UGX", true)} collected ·{" "}
              {revenueReport?.count ?? 0} receipts
            </span>
          }
        >
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={revenueTrend} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="dashRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => formatCurrency(v, "", true).trim()}
              />
              <Tooltip content={<ChartTooltip money />} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                fill="url(#dashRevenue)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      )}

      {/* ── Quick actions ── */}
      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="mb-2.5 text-sm font-semibold text-foreground">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {visibleActions.map((action) => {
            const t = TONE[action.tone];
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => navigate(action.path)}
                className={cn(
                  "group flex min-h-[44px] items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left shadow-xs",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md active:translate-y-0",
                  "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 flex-none items-center justify-center rounded-lg",
                    t.chip,
                  )}
                >
                  <action.icon className={cn("h-4 w-4", t.icon)} aria-hidden="true" />
                </span>
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
