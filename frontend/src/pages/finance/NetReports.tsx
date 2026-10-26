// src/pages/finance/NetReports.tsx
//
// Net Report (every line, with a running net) and Net Summary (totals per
// period + breakdowns). Each has two tabs:
//   • Sales & Expenses     — invoices raised vs approved expenses (accrual)
//   • Receipts & Payments  — money received vs money paid out (cash)
// Both are fed by GET /financial-reporting/net; nets are in the base currency.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  netReportApi,
  type NetBasis,
  type NetGroupBy,
  type NetLine,
  type NetReport,
} from "@/lib/api/financial-reporting";

// ─── Utilities ────────────────────────────────────────────────────────────────

const fmtMoney = (v?: number | null, currency = "UGX"): string =>
  currency === "USD"
    ? `USD ${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${currency} ${Number(v || 0).toLocaleString("en-UG", { maximumFractionDigits: 0 })}`;

const fmtPlain = (v?: number | null): string =>
  Number(v || 0).toLocaleString("en-UG", { maximumFractionDigits: 0 });

const fmtDateTime = (d: string): string =>
  new Date(d).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });

const fmtAxis = (v: number): string =>
  Math.abs(v) >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : Math.abs(v) >= 1_000
      ? `${(v / 1_000).toFixed(0)}K`
      : String(v);

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

type DatePreset = "today" | "thisWeek" | "thisMonth" | "lastMonth" | "thisYear" | "all" | "custom";

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "This Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "thisYear", label: "This Year" },
  { key: "all", label: "All Time" },
  { key: "custom", label: "Custom" },
];

function presetRange(key: DatePreset): { startDate: string; endDate: string } | null {
  const now = new Date();
  const today = isoDate(now);
  switch (key) {
    case "today":
      return { startDate: today, endDate: today };
    case "thisWeek":
      return { startDate: isoDate(startOfWeek(now)), endDate: today };
    case "thisMonth":
      return { startDate: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: today };
    case "lastMonth":
      return {
        startDate: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        endDate: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "thisYear":
      return { startDate: isoDate(new Date(now.getFullYear(), 0, 1)), endDate: today };
    case "all":
      return { startDate: "", endDate: "" };
    default:
      return null;
  }
}

const IN_COLOR = "#10b981";
const OUT_COLOR = "#ef4444";

/** Per-tab wording: what the IN side, OUT side and the net are called. */
const BASIS_CFG: Record<
  NetBasis,
  { tab: string; icon: string; inLabel: string; outLabel: string; netLabel: string; inBreakdown: string; outBreakdown: string }
> = {
  "sales-expenses": {
    tab: "Sales & Expenses",
    icon: "📊",
    inLabel: "Sales",
    outLabel: "Expenses",
    netLabel: "Net (Sales − Expenses)",
    inBreakdown: "Sales by invoice status",
    outBreakdown: "Expenses by category",
  },
  "receipts-payments": {
    tab: "Receipts & Payments",
    icon: "💵",
    inLabel: "Receipts",
    outLabel: "Payments",
    netLabel: "Net Cash (Receipts − Payments)",
    inBreakdown: "Receipts by payment method",
    outBreakdown: "Payments by category",
  },
};

const GROUP_OPTIONS: { value: NetGroupBy; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

function periodLabel(period: string, groupBy: NetGroupBy): string {
  if (groupBy === "month") {
    const [y, m] = period.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }
  const d = new Date(`${period}T00:00:00`);
  const day = d.toLocaleDateString("en-GB");
  return groupBy === "week" ? `Week of ${day}` : day;
}

function downloadCSV(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Small building blocks ────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent: string;
  icon: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-border px-3 py-2 flex gap-2 items-start shadow-sm">
      <div
        className="mt-0.5 size-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: accent + "18" }}
      >
        <span style={{ color: accent }} className="text-base">
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{label}</p>
        <p className="text-xl font-bold text-foreground mt-0.5 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap";
const thR = `${th} text-right`;
const td = "px-3 py-2 whitespace-nowrap";
const tdR = `${td} text-right tabular-nums`;

const netClass = (n: number) => (n < 0 ? "text-danger" : "text-success");

function BreakdownTable({
  rows,
  total,
  color,
}: {
  rows: { label: string; amount: number; count: number }[];
  total: number;
  color: string;
}) {
  if (!rows.length) return <p className="p-4 text-sm text-muted-foreground">Nothing in this period.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50">
        <tr>
          <th className={th}>Item</th>
          <th className={thR}>Count</th>
          <th className={thR}>Amount (UGX)</th>
          <th className={thR}>Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pct = total > 0 ? (r.amount / total) * 100 : 0;
          return (
            <tr key={r.label} className="border-t border-border/60">
              <td className={td}>{r.label}</td>
              <td className={tdR}>{r.count}</td>
              <td className={tdR}>{fmtPlain(r.amount)}</td>
              <td className={`${tdR} w-40`}>
                <div className="flex items-center gap-2 justify-end">
                  <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="w-12 text-right">{pct.toFixed(1)}%</span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

type Mode = "detail" | "summary";

function NetReportsView({ mode }: { mode: Mode }) {
  const [basis, setBasis] = useState<NetBasis>("sales-expenses");
  const [preset, setPreset] = useState<DatePreset>("thisMonth");
  const [range, setRange] = useState(() => presetRange("thisMonth")!);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [groupBy, setGroupBy] = useState<NetGroupBy>("day");
  const [direction, setDirection] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [search, setSearch] = useState("");

  const [data, setData] = useState<NetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const cfg = BASIS_CFG[basis];
  const title = mode === "detail" ? "Net Report" : "Net Summary Report";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(
        await netReportApi.get({
          basis,
          groupBy,
          startDate: range.startDate,
          endDate: range.endDate,
          startTime,
          endTime,
        }),
      );
    } catch (e: any) {
      const msg = e.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(", ") : msg || e.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [basis, groupBy, range.startDate, range.endDate, startTime, endTime]);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (key: DatePreset) => {
    setPreset(key);
    const r = presetRange(key);
    if (r) setRange(r);
  };

  const lines: NetLine[] = useMemo(() => {
    const all = data?.lines ?? [];
    const q = search.trim().toLowerCase();
    return all.filter(
      (l) =>
        (direction === "ALL" || l.direction === direction) &&
        (!q ||
          [l.reference, l.party, l.description, l.category, l.method]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))),
    );
  }, [data, direction, search]);
  const filtered = direction !== "ALL" || !!search.trim();
  const shownIn = lines.filter((l) => l.direction === "IN").reduce((s, l) => s + l.baseAmount, 0);
  const shownOut = lines.filter((l) => l.direction === "OUT").reduce((s, l) => s + l.baseAmount, 0);

  const rangeText = range.startDate || range.endDate
    ? `${range.startDate || "…"}${startTime ? ` ${startTime}` : ""} → ${range.endDate || "…"}${endTime ? ` ${endTime}` : ""}`
    : "All time";

  // ── Export / print ──────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!data) return;
    const stamp = `${basis}-${range.startDate || "all"}_${range.endDate || "all"}`;
    if (mode === "detail") {
      downloadCSV(
        `net-report-${stamp}.csv`,
        ["Date", "Type", "Reference", "Party", "Description", basis === "sales-expenses" ? "Category" : "Category / Method", "Currency", "Amount", `${cfg.inLabel} (UGX)`, `${cfg.outLabel} (UGX)`, "Running Net (UGX)"],
        lines.map((l) => [
          fmtDateTime(l.date),
          l.kind,
          l.reference,
          l.party ?? "",
          l.description ?? "",
          [l.category, l.method].filter(Boolean).join(" · "),
          l.currency,
          l.amount,
          l.direction === "IN" ? l.baseAmount : "",
          l.direction === "OUT" ? l.baseAmount : "",
          filtered ? "" : l.runningNet,
        ]),
      );
    } else {
      downloadCSV(
        `net-summary-${stamp}.csv`,
        ["Period", `${cfg.inLabel} (UGX)`, `${cfg.outLabel} (UGX)`, "Net (UGX)", `${cfg.inLabel} count`, `${cfg.outLabel} count`],
        [
          ...data.periods.map((p) => [periodLabel(p.period, data.groupBy), p.in, p.out, p.net, p.inCount, p.outCount]),
          ["TOTAL", data.totals.in, data.totals.out, data.totals.net, data.totals.inCount, data.totals.outCount],
        ],
      );
    }
  };

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${escapeHtml(`${title} – ${cfg.tab}`)}</title>
      <style>body{font-family:system-ui,sans-serif;font-size:12px;color:#1e293b}
      h1{font-size:16px;margin:0 0 4px}h2{font-size:13px;margin:16px 0 6px}
      table{width:100%;border-collapse:collapse;margin-bottom:8px}
      th{background:#f8fafc;padding:5px 7px;text-align:left;font-size:10px;text-transform:uppercase;border-bottom:2px solid #e2e8f0}
      td{padding:5px 7px;border-bottom:1px solid #f1f5f9}.r{text-align:right}
      .neg{color:#dc2626}.pos{color:#059669}</style></head>
      <body>${content}</body></html>`);
    w.document.close();
    w.focus();
    w.onafterprint = () => w.close();
    w.print();
    setTimeout(() => {
      try {
        w.close();
      } catch {
        /* already closed */
      }
    }, 1000);
  };

  const inputClass =
    "h-9 rounded-lg border border-border px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/60";

  const totals = data?.totals;

  return (
    <div className="min-h-screen bg-muted/50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-border px-3 py-2 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">{title}</h1>
              <p className="text-xs text-muted-foreground">
                {mode === "detail"
                  ? "Every transaction in the period with a running net."
                  : "Totals per period with breakdowns."}{" "}
                Amounts netted in UGX.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                disabled={loading || !data}
                className="px-3 py-2 text-sm rounded-lg border border-primary text-primary hover:bg-primary-muted/60 font-medium transition-colors disabled:opacity-50"
              >
                ⬇ Export CSV
              </button>
              <button
                onClick={handlePrint}
                disabled={loading || !data}
                className="px-3 py-2 text-sm rounded-lg bg-foreground text-white font-medium transition-colors disabled:opacity-50"
              >
                🖨 Print
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 mt-1 -mb-px overflow-x-auto">
            {(Object.keys(BASIS_CFG) as NetBasis[]).map((b) => (
              <button
                key={b}
                onClick={() => setBasis(b)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  basis === b
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-input"
                }`}
              >
                <span>{BASIS_CFG[b].icon}</span>
                {BASIS_CFG[b].tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-3 py-3 space-y-3">
        {/* ── Filters ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  preset === p.key
                    ? "bg-primary text-white border-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">
              From
              <input
                type="date"
                className={`${inputClass} block mt-0.5`}
                value={range.startDate}
                onChange={(e) => {
                  setPreset("custom");
                  setRange((r) => ({ ...r, startDate: e.target.value }));
                }}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Time
              <input
                type="time"
                className={`${inputClass} block mt-0.5`}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              To
              <input
                type="date"
                className={`${inputClass} block mt-0.5`}
                value={range.endDate}
                onChange={(e) => {
                  setPreset("custom");
                  setRange((r) => ({ ...r, endDate: e.target.value }));
                }}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Time
              <input
                type="time"
                className={`${inputClass} block mt-0.5`}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
            {mode === "summary" ? (
              <label className="text-xs text-muted-foreground">
                Group by
                <select
                  className={`${inputClass} block mt-0.5`}
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as NetGroupBy)}
                >
                  {GROUP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="text-xs text-muted-foreground">
                  Show
                  <select
                    className={`${inputClass} block mt-0.5`}
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as "ALL" | "IN" | "OUT")}
                  >
                    <option value="ALL">All</option>
                    <option value="IN">{cfg.inLabel} only</option>
                    <option value="OUT">{cfg.outLabel} only</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground flex-1 min-w-[180px]">
                  Search
                  <input
                    className={`${inputClass} block mt-0.5 w-full`}
                    placeholder="Reference, patient, supplier, category…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-danger-muted/60 border border-danger/25 text-danger px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <span>⚠️</span> {error}
            <button onClick={load} className="ml-auto underline text-xs">
              Retry
            </button>
          </div>
        )}

        {/* ── KPIs ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <StatCard
            label={cfg.inLabel}
            icon="⬆"
            accent={IN_COLOR}
            value={loading ? "…" : fmtMoney(totals?.in)}
            sub={totals ? `${totals.inCount} transaction${totals.inCount === 1 ? "" : "s"}` : undefined}
          />
          <StatCard
            label={cfg.outLabel}
            icon="⬇"
            accent={OUT_COLOR}
            value={loading ? "…" : fmtMoney(totals?.out)}
            sub={totals ? `${totals.outCount} transaction${totals.outCount === 1 ? "" : "s"}` : undefined}
          />
          <StatCard
            label={cfg.netLabel}
            icon="="
            accent={(totals?.net ?? 0) < 0 ? OUT_COLOR : "#0ea5e9"}
            value={
              loading ? "…" : <span className={netClass(totals?.net ?? 0)}>{fmtMoney(totals?.net)}</span>
            }
            sub={(totals?.net ?? 0) < 0 ? "Loss / shortfall" : "Surplus"}
          />
          <StatCard
            label="Net margin"
            icon="%"
            accent="#8b5cf6"
            value={loading ? "…" : totals?.marginPct == null ? "—" : `${totals.marginPct.toFixed(1)}%`}
            sub={`Net as a share of ${cfg.inLabel.toLowerCase()}`}
          />
        </div>

        {loading && !data ? (
          <div className="p-10 text-center text-muted-foreground">Loading…</div>
        ) : data ? (
          <div ref={printRef} className="space-y-3">
            {/* Hidden print heading (visible only in the print window). */}
            <div className="hidden">
              <h1>
                {title} — {cfg.tab}
              </h1>
              <p>
                {rangeText} · {cfg.inLabel}: {fmtMoney(data.totals.in)} · {cfg.outLabel}: {fmtMoney(data.totals.out)} ·
                Net: {fmtMoney(data.totals.net)}
              </p>
            </div>

            {mode === "detail" ? (
              <DetailTable data={data} lines={lines} filtered={filtered} shownIn={shownIn} shownOut={shownOut} cfg={cfg} />
            ) : (
              <SummaryBody data={data} cfg={cfg} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Net Report: detailed lines ───────────────────────────────────────────────

function DetailTable({
  data,
  lines,
  filtered,
  shownIn,
  shownOut,
  cfg,
}: {
  data: NetReport;
  lines: NetLine[];
  filtered: boolean;
  shownIn: number;
  shownOut: number;
  cfg: (typeof BASIS_CFG)[NetBasis];
}) {
  return (
    <Panel
      title={`Transactions (${lines.length}${data.linesTruncated ? ` of ${data.linesTotal}` : ""})`}
      right={
        data.linesTruncated ? (
          <span className="text-xs text-danger">Showing the first {data.lines.length} — narrow the dates to see all.</span>
        ) : filtered ? (
          <span className="text-xs text-muted-foreground">Running net hidden while filtered</span>
        ) : null
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Type</th>
              <th className={th}>Reference</th>
              <th className={th}>Patient / Supplier</th>
              <th className={th}>Description</th>
              <th className={th}>Category / Method</th>
              <th className={thR}>Amount</th>
              <th className={thR}>{cfg.inLabel} (UGX)</th>
              <th className={thR}>{cfg.outLabel} (UGX)</th>
              {!filtered && <th className={thR}>Running Net</th>}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">
                  No transactions in this period.
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={`${l.direction}-${l.id}`} className="border-t border-border/60 hover:bg-muted/30">
                  <td className={td}>{fmtDateTime(l.date)}</td>
                  <td className={td}>
                    <span
                      className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                        l.direction === "IN" ? "bg-success-muted text-success" : "bg-danger-muted/60 text-danger"
                      }`}
                    >
                      {l.kind}
                    </span>
                  </td>
                  <td className={`${td} font-mono text-xs`}>{l.reference}</td>
                  <td className={td}>{l.party ?? "—"}</td>
                  <td className={`${td} max-w-[260px] truncate`} title={l.description ?? ""}>
                    {l.description ?? "—"}
                  </td>
                  <td className={td}>{[l.category, l.method].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={`${tdR} text-muted-foreground`}>{fmtMoney(l.amount, l.currency)}</td>
                  <td className={`${tdR} r text-success`}>{l.direction === "IN" ? fmtPlain(l.baseAmount) : ""}</td>
                  <td className={`${tdR} r text-danger`}>{l.direction === "OUT" ? fmtPlain(l.baseAmount) : ""}</td>
                  {!filtered && (
                    <td className={`${tdR} r font-medium ${netClass(l.runningNet)} ${l.runningNet < 0 ? "neg" : "pos"}`}>
                      {fmtPlain(l.runningNet)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot className="bg-muted/50 font-semibold">
              <tr className="border-t-2 border-border">
                <td className={td} colSpan={7}>
                  Total{filtered ? " (shown)" : ""}
                </td>
                <td className={`${tdR} r text-success`}>{fmtPlain(shownIn)}</td>
                <td className={`${tdR} r text-danger`}>{fmtPlain(shownOut)}</td>
                {!filtered && (
                  <td className={`${tdR} r ${netClass(shownIn - shownOut)}`}>{fmtPlain(shownIn - shownOut)}</td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Panel>
  );
}

// ─── Net Summary: periods + breakdowns ────────────────────────────────────────

function SummaryBody({ data, cfg }: { data: NetReport; cfg: (typeof BASIS_CFG)[NetBasis] }) {
  const chartData = data.periods.map((p) => ({
    name: periodLabel(p.period, data.groupBy),
    [cfg.inLabel]: p.in,
    [cfg.outLabel]: p.out,
  }));

  const currencyRows = [
    ...data.inByCurrency.map((c) => ({ ...c, side: cfg.inLabel })),
    ...data.outByCurrency.map((c) => ({ ...c, side: cfg.outLabel })),
  ];

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
        <div className="xl:col-span-3">
          <Panel title={`${cfg.inLabel} vs ${cfg.outLabel} per ${data.groupBy}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className={th}>Period</th>
                    <th className={thR}>{cfg.inLabel} (UGX)</th>
                    <th className={thR}>{cfg.outLabel} (UGX)</th>
                    <th className={thR}>Net (UGX)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.periods.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No transactions in this period.
                      </td>
                    </tr>
                  ) : (
                    data.periods.map((p) => (
                      <tr key={p.period} className="border-t border-border/60">
                        <td className={td}>{periodLabel(p.period, data.groupBy)}</td>
                        <td className={`${tdR} r`}>
                          {fmtPlain(p.in)} <span className="text-xs text-muted-foreground">({p.inCount})</span>
                        </td>
                        <td className={`${tdR} r`}>
                          {fmtPlain(p.out)} <span className="text-xs text-muted-foreground">({p.outCount})</span>
                        </td>
                        <td className={`${tdR} r font-medium ${netClass(p.net)} ${p.net < 0 ? "neg" : "pos"}`}>
                          {fmtPlain(p.net)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-muted/50 font-semibold">
                  <tr className="border-t-2 border-border">
                    <td className={td}>Total</td>
                    <td className={`${tdR} r`}>{fmtPlain(data.totals.in)}</td>
                    <td className={`${tdR} r`}>{fmtPlain(data.totals.out)}</td>
                    <td className={`${tdR} r ${netClass(data.totals.net)}`}>{fmtPlain(data.totals.net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        </div>

        <div className="xl:col-span-2 space-y-3">
          {chartData.length > 0 && (
            <Panel title="Trend">
              <div className="h-64 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={48} />
                    <Tooltip formatter={(v: number) => fmtMoney(v)} />
                    <Legend />
                    <Bar dataKey={cfg.inLabel} fill={IN_COLOR} radius={[3, 3, 0, 0]} />
                    <Bar dataKey={cfg.outLabel} fill={OUT_COLOR} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          <Panel title="By currency">
            {currencyRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nothing in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className={th}>Side</th>
                    <th className={th}>Currency</th>
                    <th className={thR}>Amount</th>
                    <th className={thR}>In UGX</th>
                  </tr>
                </thead>
                <tbody>
                  {currencyRows.map((c) => (
                    <tr key={`${c.side}-${c.currency}`} className="border-t border-border/60">
                      <td className={td}>{c.side}</td>
                      <td className={td}>{c.currency}</td>
                      <td className={`${tdR} r`}>{fmtMoney(c.amount, c.currency)}</td>
                      <td className={`${tdR} r`}>{fmtPlain(c.baseAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title={cfg.inBreakdown}>
          <BreakdownTable rows={data.inBreakdown} total={data.totals.in} color={IN_COLOR} />
        </Panel>
        <Panel title={cfg.outBreakdown}>
          <BreakdownTable rows={data.outBreakdown} total={data.totals.out} color={OUT_COLOR} />
        </Panel>
      </div>
    </>
  );
}

export function NetReport(): JSX.Element {
  return <NetReportsView mode="detail" />;
}

export function NetSummaryReport(): JSX.Element {
  return <NetReportsView mode="summary" />;
}
