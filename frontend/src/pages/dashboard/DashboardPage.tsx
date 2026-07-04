// src/pages/dashboard/DashboardPage.tsx
// Colorful, pictorial dental dashboard — inspired by Alpha POS / Odoo style
// Drop-in replacement. Adjust imports to match your project structure.

import { useQuery } from "@tanstack/react-query";
import { reportsApi, appointmentsApi } from "../../lib/api";
import { formatCurrency, formatTime } from "../../lib/utils";
import { LoadingSpinner, StatusBadge } from "../../components/shared";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Calendar,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  Stethoscope,
  Package,
  Pill,
  BarChart3,
  UserCog,
  ClipboardList,
  Scan,
  FileText,
  Activity,
  ShoppingBag,
  Bell,
  ArrowRight,
  ArrowUpRight,
  Star,
  Zap,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

// ─── Theme palette ────────────────────────────────────────────────────────────
const DONUT_COLORS = ["#489af3", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"];

// ─── StatCard (matches ExpensesPage.tsx) ─────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = "blue",
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: any;
  color?: "blue" | "amber" | "emerald" | "slate" | "rose";
  trend?: string;
}) {
  const colors = {
    blue: {
      bg: "from-blue-500 to-blue-600",
      icon: "bg-blue-400/30",
      text: "text-blue-100",
    },
    amber: {
      bg: "from-amber-500 to-amber-600",
      icon: "bg-amber-400/30",
      text: "text-amber-100",
    },
    emerald: {
      bg: "from-emerald-500 to-emerald-600",
      icon: "bg-emerald-400/30",
      text: "text-emerald-100",
    },
    slate: {
      bg: "from-slate-600 to-slate-700",
      icon: "bg-slate-500/30",
      text: "text-slate-200",
    },
    rose: {
      bg: "from-rose-500 to-rose-600",
      icon: "bg-rose-400/30",
      text: "text-rose-100",
    },
  }[color];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${colors.bg} py-3 px-7 text-white shadow-lg`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p
            className={`text-xs font-medium uppercase tracking-widest ${colors.text} mb-1`}
          >
            {label}
          </p>
          <p className="text-2xl font-bold leading-tight px-4">{value}</p>
          {sub && <p className={`text-xs mt-1 ${colors.text}`}>{sub}</p>}
        </div>
        <div
          className={`w-11 h-11 ${colors.icon} rounded-xl flex items-center justify-center backdrop-blur-sm`}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      {trend && (
        <div className="absolute bottom-3 right-4 flex items-center gap-1 text-xs opacity-70">
          <ArrowUpRight className="w-3 h-3" />
          {trend}
        </div>
      )}
      {/* decorative circle */}
      <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/5" />
    </div>
  );
}

// ─── Quick-action tiles — easy to ADD / REMOVE entries here ──────────────────
const QUICK_ACTIONS = [
  {
    label: "Patients",
    icon: "🧑‍⚕️",
    emoji: true,
    path: "/patients",
    bg: "from-blue-500 to-blue-600",
    shadow: "shadow-blue-200",
  },
  {
    label: "Appointments",
    icon: "📅",
    emoji: true,
    path: "/appointments",
    bg: "from-blue-300 to-indigo-400",
    shadow: "shadow-indigo-200",
  },
  {
    label: "Visits",
    icon: "📋",
    emoji: true,
    path: "/visits",
    bg: "from-cyan-300 to-cyan-500",
    shadow: "shadow-cyan-200",
  },
  {
    label: "Treatment Plans",
    icon: "🦷",
    emoji: true,
    path: "/treatment-plans",
    bg: "from-teal-500 to-teal-600",
    shadow: "shadow-teal-200",
  },
  {
    label: "Billing",
    icon: "💳",
    emoji: true,
    path: "/billing",
    bg: "from-emerald-500 to-emerald-600",
    shadow: "shadow-emerald-200",
  },
  {
    label: "Receipts",
    icon: "🧾",
    emoji: true,
    path: "/receipts",
    bg: "from-emerald-400 to-teal-500",
    shadow: "shadow-emerald-200",
  },
  {
    label: "Pharmacy Sales",
    icon: "💊",
    emoji: true,
    path: "/pharmacy",
    bg: "from-pink-500 to-pink-600",
    shadow: "shadow-pink-200",
  },
  {
    label: "Inventory",
    icon: "📦",
    emoji: true,
    path: "/inventory",
    bg: "from-orange-500 to-orange-600",
    shadow: "shadow-orange-200",
  },
  {
    label: "Staff",
    icon: "👥",
    emoji: true,
    path: "/staff",
    bg: "from-rose-500 to-rose-600",
    shadow: "shadow-rose-200",
  },
  {
    label: "Reports",
    icon: "📊",
    emoji: true,
    path: "/reports",
    bg: "from-amber-500 to-amber-600",
    shadow: "shadow-amber-200",
  },
  {
    label: "Low Stock Alert",
    icon: "🔔",
    emoji: true,
    path: "/inventory?filter=low",
    bg: "from-red-500 to-red-600",
    shadow: "shadow-red-200",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const navigate = useNavigate();

  const { data: dash, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: reportsApi.getDashboard,
    refetchInterval: 60_000,
  });

  const { data: todayApts } = useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () =>
      appointmentsApi.getAll({
        date: new Date().toISOString().split("T")[0],
        limit: 6,
      }),
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingSpinner />;

  const d = dash ?? {};
  const apts = todayApts?.data ?? [];

  const appointmentStatusData =
    d.appointments?.byStatus?.map((s: any) => ({
      name: s.status.replace(/_/g, " "),
      value: s._count,
    })) ?? [];

  const today = new Date().toLocaleDateString("en-UG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="min-h-screen p-2 space-y-2"
      style={{
        background:
          "linear-gradient(135deg,#f0f4ff 0%,#fafafa 60%,#fff7ed 100%)",
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{
              fontFamily: '"Sora", "DM Sans", sans-serif',
              color: "#1e293b",
            }}
          >
            🦷 Clinic Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-2 shadow-sm border border-slate-100">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-slate-600">
            Quick Access Dashboard
          </span>
        </div>
      </div>

      {/* ── Stat Cards (ExpensesPage style) ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Patients"
          value={d.patients?.total?.toLocaleString() ?? "—"}
          sub={`+${d.patients?.newToday ?? 0} today`}
          icon={Users}
          color="blue"
        />
        <StatCard
          label="Today's Appointments"
          value={d.appointments?.today ?? "—"}
          sub={`${d.appointments?.thisMonth ?? 0} this month`}
          icon={Calendar}
          color="amber"
        />
        <StatCard
          label="Revenue Today"
          value={formatCurrency(d.revenue?.today ?? 0)}
          trend={`${d.revenue?.growth >= 0 ? "+" : ""}${d.revenue?.growth ?? 0}% vs last month`}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          label="Pending Invoices"
          value={d.pending?.invoices ?? "—"}
          sub={`${d.staff?.active ?? 0} staff on duty`}
          icon={AlertTriangle}
          color="rose"
        />
      </div>

      {/* ── Quick Action Grid ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-bold text-slate-700"
            style={{ fontFamily: '"Sora", sans-serif' }}
          >
            Quick Actions
          </h2>
          <span className="text-xs text-slate-400 italic">
            Click any tile to navigate
          </span>
        </div>

        {/* Grid — change grid-cols-* to adjust columns */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className={`
                group relative flex flex-col items-center justify-center gap-2
                bg-white rounded-2xl border border-slate-100 p-2
                hover:shadow-xl hover:-translate-y-1 active:scale-95
                transition-all duration-200 cursor-pointer
                shadow-sm ${action.shadow}
              `}
            >
              {/* Colored top strip */}
              <div
                className={`absolute top-0 inset-x-0 h-1 rounded-t-2xl bg-gradient-to-r ${action.bg}`}
              />

              <span className="text-4xl group-hover:scale-110 transition-transform duration-200 leading-none mt-1">
                {action.icon}
              </span>
              <span className="text-s font-semibold text-slate-700 text-center leading-tight">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Bottom Row: Schedule + Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <span className="text-xl">📅</span>
              <h3
                className="font-bold text-slate-800"
                style={{ fontFamily: '"Sora", sans-serif' }}
              >
                Today's Schedule
              </h3>
            </div>
            <button
              onClick={() => navigate("/appointments")}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {apts.length === 0 ? (
            <div className="py-14 flex flex-col items-center text-slate-300">
              <span className="text-5xl mb-3">📭</span>
              <p className="text-sm font-medium">No appointments today</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {apts.map((apt: any) => (
                <div
                  key={apt.id}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-blue-50/40 transition-colors"
                >
                  <div className="text-center min-w-[52px]">
                    <p className="text-sm font-bold text-blue-600">
                      {formatTime(apt.scheduledAt)}
                    </p>
                    <p className="text-xs text-slate-400">{apt.duration}m</p>
                  </div>
                  <div className="w-px h-10 bg-slate-100" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {apt.patient?.firstName} {apt.patient?.lastName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {apt.type?.replace(/_/g, " ")} · Dr.{" "}
                      {apt.dentist?.lastName}
                    </p>
                  </div>
                  <StatusBadge status={apt.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Appointment Status Donut */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50">
            <span className="text-xl">🍩</span>
            <h3
              className="font-bold text-slate-800"
              style={{ fontFamily: '"Sora", sans-serif' }}
            >
              Appt. Status
            </h3>
          </div>

          {appointmentStatusData.length > 0 ? (
            <div className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={appointmentStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {appointmentStatusData.map((_: any, i: number) => (
                      <Cell
                        key={i}
                        fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-2 mt-2">
                {appointmentStatusData.map((item: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor:
                            DONUT_COLORS[i % DONUT_COLORS.length],
                        }}
                      />
                      <span className="text-slate-600 capitalize">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-bold text-slate-800">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-14 flex flex-col items-center text-slate-300">
              <span className="text-5xl mb-3">📊</span>
              <p className="text-sm font-medium">No data yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}