import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { formatCurrency, cn, formatDate } from "@/lib/utils";
import {
  FileText,
  Receipt,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ChevronRight,
  Banknote,
} from "lucide-react";

interface BillingTabProps {
  patientId: string;
  patientName?: string;
  navigate: (url: string) => void;
}

// ─── Status helpers (mirrors BillingPage logic) ────────────────────────────────

function normalizeStatus(s: string): "DRAFT" | "POSTED" | "VOID" {
  if (s === "DRAFT") return "DRAFT";
  if (s === "VOID" || s === "CANCELLED") return "VOID";
  return "POSTED";
}

function derivePaymentStatus(
  inv: any,
): "UNPAID" | "PARTIALLY_PAID" | "PAID" {
  if (inv.paymentStatus) return inv.paymentStatus;
  const paid = Number(inv.amountPaid ?? 0);
  const bal = Number(inv.balance ?? 0);
  if (bal <= 0.01 && paid > 0) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  return "UNPAID";
}

const LIFECYCLE_CONFIG: Record<"DRAFT" | "POSTED" | "VOID", { label: string; cls: string }> = {
  DRAFT:  { label: "Draft",  cls: "bg-slate-100 text-slate-500 border-slate-200" },
  POSTED: { label: "Posted", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  VOID:   { label: "Void",   cls: "bg-slate-100 text-slate-400 border-slate-200" },
};

const PAYMENT_CONFIG: Record<"UNPAID" | "PARTIALLY_PAID" | "PAID", { label: string; cls: string; dotCls: string }> = {
  UNPAID:         { label: "Unpaid",       cls: "bg-rose-50 text-rose-700 border-rose-200",   dotCls: "bg-rose-500" },
  PARTIALLY_PAID: { label: "Partial",      cls: "bg-amber-50 text-amber-700 border-amber-200", dotCls: "bg-amber-500" },
  PAID:           { label: "Paid",         cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dotCls: "bg-emerald-500" },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function BillingTab({ patientId, patientName, navigate }: BillingTabProps) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["patient-invoices", patientId],
    queryFn: () => billingApi.getInvoices({ patientId, limit: 100 }),
    enabled: !!patientId,
  });

  const invoices: any[] = data?.data ?? [];

  // Only non-void for financial summaries
  const activeInvoices = invoices.filter((inv) => normalizeStatus(inv.status) !== "VOID");

  // Group by currency for summary cards
  const byCurrency: Record<string, { billed: number; paid: number; count: number }> = {};
  for (const inv of activeInvoices) {
    const cur = (inv.currency ?? "UGX").toUpperCase();
    if (!byCurrency[cur]) byCurrency[cur] = { billed: 0, paid: 0, count: 0 };
    byCurrency[cur].billed += Number(inv.total ?? 0);
    byCurrency[cur].paid   += Number(inv.amountPaid ?? 0);
    byCurrency[cur].count  += 1;
  }

  const currencySummaries = Object.entries(byCurrency).length
    ? Object.entries(byCurrency).map(([currency, { billed, paid, count }]) => ({
        currency,
        billed,
        paid,
        outstanding: Math.max(0, billed - paid),
        count,
      }))
    : [{ currency: "UGX", billed: 0, paid: 0, outstanding: 0, count: 0 }];

  // Navigate to the VisitBillingPage (same pattern as BillingPage.openWorkspace)
  const openInvoice = (inv: any) => {
    if (inv.visit?.id) {
      const qs = new URLSearchParams();
      if (patientName) qs.set("patientName", patientName);
      if (inv.visit.visitCode) qs.set("visitCode", inv.visit.visitCode);
      navigate(
        `/VisitBillingPage/${inv.visit.id}/${patientId}${qs.toString() ? `?${qs}` : ""}`,
      );
    } else {
      // Invoice not linked to a visit — open billing list filtered to this invoice
      navigate(`/billing?invoiceId=${inv.id}`);
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <p className="text-sm">Loading billing history…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <AlertTriangle className="w-7 h-7 text-rose-400" />
        <p className="text-sm font-medium text-slate-600">Failed to load invoices</p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {currencySummaries.map(({ currency, billed, paid, outstanding, count }) => (
          <div
            key={currency}
            className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="bg-slate-100 px-2.5 py-1 rounded-md text-xs font-bold text-slate-700 tracking-wide">
                  {currency}
                </span>
                <span className="text-sm font-medium text-slate-500">Financial Summary</span>
              </div>
              <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                {count} {count === 1 ? "invoice" : "invoices"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Billed</p>
                <p className="text-sm font-semibold text-slate-800">{formatCurrency(billed, currency)}</p>
              </div>
              <div className="space-y-1 pl-2 border-l border-slate-100">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Paid</p>
                <p className="text-sm font-semibold text-emerald-600">{formatCurrency(paid, currency)}</p>
              </div>
              <div className="space-y-1 pl-2 border-l border-slate-100">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Balance</p>
                <p className={cn("text-sm font-bold", outstanding > 0 ? "text-rose-600" : "text-emerald-600")}>
                  {formatCurrency(outstanding, currency)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Invoice History Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800 tracking-tight">
          Invoice History
          {invoices.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({invoices.length} total)
            </span>
          )}
        </h3>
      </div>

      {/* ── Invoice List ──────────────────────────────────────────────────── */}
      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
            <Receipt className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-700">No invoices yet</h3>
          <p className="text-xs text-slate-400 max-w-xs mt-1">
            Invoices created during visits will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {invoices.map((inv: any) => {
            const lifecycle   = normalizeStatus(inv.status);
            const payStatus   = derivePaymentStatus(inv);
            const lcConf      = LIFECYCLE_CONFIG[lifecycle];
            const payConf     = PAYMENT_CONFIG[payStatus];
            const currency    = (inv.currency ?? "UGX").toUpperCase();
            const total       = Number(inv.total ?? 0);
            const paid        = Number(inv.amountPaid ?? 0);
            const balance     = Number(inv.balance ?? Math.max(0, total - paid));
            const activeReceipts = (inv.receipts ?? []).filter((r: any) => r.status !== "VOID");
            const isVoid      = lifecycle === "VOID";

            return (
              <div
                key={inv.id}
                onClick={() => !isVoid && openInvoice(inv)}
                className={cn(
                  "group relative rounded-xl border bg-white transition-all duration-200",
                  isVoid
                    ? "border-slate-200/60 opacity-55 cursor-default"
                    : "border-slate-200/70 hover:border-blue-300 hover:shadow-md hover:shadow-blue-50/50 cursor-pointer",
                )}
              >
                {/* ── Main row ── */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3">
                  {/* Left: icon + meta */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                        isVoid
                          ? "bg-slate-100 text-slate-400"
                          : "bg-blue-50 group-hover:bg-blue-100 text-blue-600",
                      )}
                    >
                      <FileText className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 space-y-1.5">
                      {/* Invoice number + badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-800 text-sm group-hover:text-blue-700 transition-colors">
                          {inv.invoiceNumber || "Draft Invoice"}
                        </span>
                        {/* Lifecycle badge */}
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide", lcConf.cls)}>
                          {lcConf.label}
                        </span>
                        {/* Payment badge — only on posted invoices */}
                        {lifecycle === "POSTED" && (
                          <span className={cn("flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide", payConf.cls)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full inline-block", payConf.dotCls)} />
                            {payConf.label}
                          </span>
                        )}
                      </div>

                      {/* Date + visit info */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(inv.createdAt)}
                        </span>
                        {inv.visit?.visitCode && (
                          <span className="flex items-center gap-1 text-slate-500">
                            Visit: <span className="font-medium">{inv.visit.visitCode}</span>
                          </span>
                        )}
                        {inv.visit?.dentist && (
                          <span>
                            Dr. {inv.visit.dentist.firstName} {inv.visit.dentist.lastName}
                          </span>
                        )}
                        {inv.dueDate && balance > 0 && (
                          <span className={cn(
                            "flex items-center gap-1",
                            new Date(inv.dueDate) < new Date() ? "text-rose-500 font-medium" : "",
                          )}>
                            <Clock className="w-3 h-3" />
                            Due {formatDate(inv.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: amounts + chevron */}
                  <div className="flex items-center gap-4 shrink-0 sm:pl-4">
                    <div className="text-right space-y-0.5">
                      <div className="flex items-baseline gap-1.5 justify-end">
                        <span className="text-xs text-slate-400">Total</span>
                        <span className="font-bold text-slate-800 text-sm">
                          {formatCurrency(total, currency)}
                        </span>
                      </div>
                      {paid > 0 && (
                        <div className="flex items-baseline gap-1.5 justify-end text-xs">
                          <span className="text-slate-400">Paid</span>
                          <span className="text-emerald-600 font-semibold">
                            {formatCurrency(paid, currency)}
                          </span>
                        </div>
                      )}
                      {balance > 0 && lifecycle !== "VOID" && (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="bg-amber-50 border border-amber-100 text-amber-700 text-[11px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Bal: {formatCurrency(balance, currency)}
                          </span>
                        </div>
                      )}
                    </div>
                    {!isVoid && (
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors shrink-0" />
                    )}
                  </div>
                </div>

                {/* ── Receipts row (if any payments recorded) ── */}
                {activeReceipts.length > 0 && !isVoid && (
                  <div className="px-4 pb-3 border-t border-slate-50 mt-0 pt-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                      <Banknote className="w-3 h-3" /> Receipts
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {activeReceipts.map((r: any) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          <div>
                            <span className="font-semibold text-emerald-800">{r.receiptNumber}</span>
                            <span className="text-emerald-600 ml-1.5">
                              {formatCurrency(
                                r.amountReceived ?? r.invoiceAmountApplied,
                                r.currencyCode ?? currency,
                              )}
                            </span>
                            {r.generatedAt && (
                              <span className="text-emerald-500 ml-1.5">{formatDate(r.generatedAt)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
