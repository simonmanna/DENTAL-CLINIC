// src/pages/billing/BillingPage.tsx
//
// Full-table billing page — all detail, receipt, and payment in dialogs.

import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Receipt,
  X,
  Loader2,
  Printer,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  User,
  Stethoscope,
  Building2,
  Phone,
  Mail,
  ExternalLink,
  BarChart3,
  Calendar,
  DollarSign,
  ArrowUpDown,
} from "lucide-react";
import { ActionButton, RowActions } from "@/components/ui/action-button";
import {
  BASE_CURRENCY,
  formatCurrency as formatMoneyCodeFirst,
} from "@/constants/currency";
import { formatCurrency, formatDate } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  originalCurrency: string;
  originalUnitPrice: number;
  originalTotal: number;
  exchangeRate: number;
  ledgerEntryId?: string;
  status?: string;
  ledgerEntry?: {
    id: string;
    entryCode: string;
    type: string;
    sourceType?: string;
    currency: string;
    totalPrice: number;
    baseAmount: number;
    exchangeRate: number;
  };
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  baseAmount: number;
  exchangeRate: number;
  method: string;
  status: string;
  reference?: string;
  transactionId?: string;
  notes?: string;
  receivedBy?: string;
  paidAt: string;
}

interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  amountReceived: number;
  currency: string;
  generatedAt: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: "DRAFT" | "POSTED" | "VOID";
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  currency: string;
  exchangeRate: number;
  baseCurrency: string;
  subtotal: number;
  discountAmount: number;
  discountType?: string;
  discountValue?: number;
  taxPercent?: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balance: number;
  baseSubtotal: number;
  baseDiscountAmount: number;
  baseTaxAmount: number;
  baseTotal: number;
  baseAmountPaid: number;
  baseBalance: number;
  notes?: string;
  dueDate?: string;
  issuedAt?: string;
  paidAt?: string;
  createdAt: string;
  items: InvoiceItem[];
  payments: Payment[];
  receipts: ReceiptRecord[];
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    patientCode: string;
    phone?: string;
    email?: string;
  };
  visit?: {
    id: string;
    visitCode?: string;
    dentist?: {
      id?: string;
      firstName: string;
      lastName: string;
      specialization?: string;
    };
  };
}

function normalizeStatus(s: string): "DRAFT" | "POSTED" | "VOID" {
  if (s === "DRAFT") return "DRAFT";
  if (s === "VOID" || s === "CANCELLED") return "VOID";
  return "POSTED";
}

function derivePaymentStatus(
  inv: Pick<Invoice, "paymentStatus" | "amountPaid" | "balance">
): "UNPAID" | "PARTIALLY_PAID" | "PAID" {
  if (inv.paymentStatus) return inv.paymentStatus;
  const paid = Number(inv.amountPaid ?? 0);
  const bal = Number(inv.balance ?? 0);
  if (bal <= 0.01 && paid > 0) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  return "UNPAID";
}

// ─── API ──────────────────────────────────────────────────────────────────────

import { api } from "@/lib/api/client";

// Thin wrapper over the shared axios instance so this page gets the same
// auth-header + 401-refresh interceptors as the rest of the app.
async function apiFetch(path: string) {
  try {
    const { data } = await api.get(path);
    return data;
  } catch (err: any) {
    throw new Error(
      err?.response?.data?.message || err?.message || "Request failed",
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...cls: (string | boolean | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

function relativeDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(dateStr);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  "DRAFT" | "POSTED" | "VOID",
  { label: string; color: string; dot: string; row: string }
> = {
  DRAFT: {
    label: "Draft",
    color: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/70",
    row: "",
  },
  POSTED: {
    label: "Posted",
    color: "bg-primary-muted text-primary border-primary/25",
    dot: "bg-primary",
    row: "",
  },
  VOID: {
    label: "Void",
    color: "bg-muted text-muted-foreground/70 border-border",
    dot: "bg-border",
    row: "opacity-60",
  },
};

const PAYMENT_STATUS_CONFIG: Record<
  "UNPAID" | "PARTIALLY_PAID" | "PAID",
  { label: string; color: string; dot: string; row: string }
> = {
  UNPAID: {
    label: "Unpaid",
    color: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/70",
    row: "",
  },
  PARTIALLY_PAID: {
    label: "Partial",
    color: "bg-warning-muted text-warning border-warning/25",
    dot: "bg-warning",
    row: "bg-warning-muted/40",
  },
  PAID: {
    label: "Paid",
    color: "bg-success-muted text-success border-success/25",
    dot: "bg-success",
    row: "bg-success-muted/40",
  },
};

const ENTRY_TYPE_COLORS: Record<string, string> = {
  PROCEDURE: "bg-primary-muted/60 text-primary border-primary/25",
  DRUG: "bg-success-muted/60 text-success border-success/25",
  CONSULTATION: "bg-purple-50 text-purple-700 border-purple-200",
  LAB: "bg-warning-muted/60 text-warning border-warning/25",
  IMAGING: "bg-pink-50 text-pink-700 border-pink-200",
  SERVICE: "bg-muted/50 text-foreground border-border",
  OTHER: "bg-muted/50 text-muted-foreground border-border",
  TREATMENT_PROCEDURE: "bg-primary-muted/60 text-primary border-primary/25",
  TREATMENT_PROCEDURE_SESSION: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

// ─── Shared Atoms ─────────────────────────────────────────────────────────────

function Spinner({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <Loader2
      className={cn(
        "animate-spin text-primary",
        size === "sm" ? "w-4 h-4" : size === "md" ? "w-6 h-6" : "w-8 h-8"
      )}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const canonical = normalizeStatus(status);
  const cfg = STATUS_CONFIG[canonical];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        cfg.color
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function PaymentStatusBadge({
  status,
}: {
  status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
}) {
  const cfg = PAYMENT_STATUS_CONFIG[status] || PAYMENT_STATUS_CONFIG.UNPAID;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border",
        cfg.color
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border",
        className
      )}
    >
      {children}
    </span>
  );
}

// ─── Dialog Wrapper ───────────────────────────────────────────────────────────

function Dialog({
  open,
  onClose,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const widths = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div
      className="print-shell fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] overflow-hidden",
          widths[size]
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

type CurrencySummary = Record<
  string,
  { total: number; paid: number; outstanding: number; count: number }
>;

/** "UGX 1,250,000" / "USD 1,250.00" — currency code first, like Receipts. */
function money(amount: number, currency: string) {
  return formatMoneyCodeFirst(amount || 0, currency);
}

function StatsRow({
  summary,
  invoiceCount,
  isLoading = false,
}: {
  // Totals for the whole filtered set, computed server-side (voids excluded).
  summary: CurrencySummary;
  invoiceCount: number;
  isLoading?: boolean;
}) {
  const stats = { invoiceCount, currencyTotals: summary };

  const cards: {
    label: string;
    primary: string;
    secondary: string;
    icon: React.ReactNode;
    color: string;
    bg: string;
  }[] = [
    {
      label: "Total",
      primary: money(stats.currencyTotals.UGX?.total || 0, "UGX"),
      secondary: money(stats.currencyTotals.USD?.total || 0, "USD"),
      icon: <Receipt className="w-5 h-5" />,
      color: "text-primary",
      bg: "bg-primary-muted/60 border-primary/25",
    },
    {
      label: "Paid",
      primary: money(stats.currencyTotals.UGX?.paid || 0, "UGX"),
      secondary: money(stats.currencyTotals.USD?.paid || 0, "USD"),
      icon: <CheckCircle className="w-5 h-5" />,
      color: "text-success",
      bg: "bg-success-muted/60 border-success/25",
    },
    {
      label: "Outstanding",
      primary: money(stats.currencyTotals.UGX?.outstanding || 0, "UGX"),
      secondary: money(stats.currencyTotals.USD?.outstanding || 0, "USD"),
      icon: <AlertTriangle className="w-5 h-5" />,
      color: "text-warning",
      bg: "bg-warning-muted/60 border-warning/25",
    },
    {
      label: "Invoices",
      primary: stats.invoiceCount.toString(),
      secondary: "",
      icon: <FileText className="w-5 h-5" />,
      color: "text-purple-600",
      bg: "bg-purple-50 border-purple-200",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 mb-0">
      {cards.map((c) => (
        <div
          key={c.label}
          className={cn(
            "rounded-xl border px-3 py-2 flex items-center gap-3",
            c.bg
          )}
        >
          <div className={cn("shrink-0", c.color)}>{c.icon}</div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium truncate">
              {c.label}
            </p>
            {isLoading ? (
              <div className="py-1.5">
                <Spinner size="sm" />
              </div>
            ) : (
              <>
                <p
                  className={cn(
                    "text-base font-bold leading-snug truncate",
                    c.color
                  )}
                >
                  {c.primary}
                </p>
                {c.secondary && (
                  <p
                    className={cn(
                      "text-base font-bold leading-snug truncate",
                      c.color
                    )}
                  >
                    {c.secondary}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Receipt Dialog ───────────────────────────────────────────────────────────

function ReceiptDialog({
  open,
  onClose,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["receipt-modal", invoiceId],
    queryFn: () => apiFetch(`/billing/invoices/${invoiceId}/receipt`),
    enabled: open && !!invoiceId,
  });

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <div className="no-print flex items-center justify-between px-5 py-4 border-b bg-muted/50 shrink-0">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Receipt className="w-4 h-4 text-indigo-600" />
          Invoice / Receipt
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-1 py-1.5 rounded-lg border text-sm text-muted-foreground hover:bg-muted"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
      <div className="print-area overflow-y-auto flex-1 p-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : data ? (
          <ReceiptDocument data={data} />
        ) : (
          <p className="text-center text-muted-foreground/70 py-10">
            Failed to load receipt
          </p>
        )}
      </div>
    </Dialog>
  );
}

function ReceiptDocument({ data }: { data: any }) {
  const { clinic, invoice, patient, dentist, payments, receipts } = data;
  const latestReceipt = receipts?.[0];

  return (
    <div className="space-y-5 text-sm print:text-xs">
      <div className="text-center border-b-2 border-foreground pb-5">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Building2 className="w-8 h-8 text-foreground" />
          <h1 className="text-2xl font-black text-foreground tracking-tight uppercase">
            {clinic?.name || "Dental Clinic"}
          </h1>
        </div>
        {clinic?.address && (
          <p className="text-xs text-muted-foreground mt-1">{clinic.address}</p>
        )}
        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
          {clinic?.phone && (
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {clinic.phone}
            </span>
          )}
          {clinic?.email && (
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {clinic.email}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground">
            {derivePaymentStatus(invoice) === "PAID"
              ? "OFFICIAL RECEIPT"
              : "INVOICE"}
          </h2>
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {latestReceipt && (
              <p>
                <span className="font-semibold">Receipt #:</span>{" "}
                {latestReceipt.receiptNumber}
              </p>
            )}
            <p>
              <span className="font-semibold">Invoice #:</span>{" "}
              {invoice?.invoiceNumber}
            </p>
            <p>
              <span className="font-semibold">Date:</span>{" "}
              {formatDate(invoice?.createdAt)}
            </p>
            {invoice?.currency !== invoice?.baseCurrency && (
              <p className="text-primary">
                <span className="font-semibold">Currency:</span>{" "}
                {invoice.currency} @ {Number(invoice.exchangeRate).toFixed(4)}
              </p>
            )}
          </div>
        </div>
        <StatusBadge status={invoice?.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-xl p-4">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest mb-1">
            Patient
          </p>
          <p className="font-bold text-foreground">
            {patient?.firstName} {patient?.lastName}
          </p>
          <p className="text-xs text-muted-foreground">ID: {patient?.patientCode}</p>
          {patient?.phone && (
            <p className="text-xs text-muted-foreground">Tel: {patient.phone}</p>
          )}
        </div>
        {dentist && (
          <div>
            <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest mb-1">
              Attending
            </p>
            <p className="font-bold text-foreground">
              Dr. {dentist.firstName} {dentist.lastName}
            </p>
            {dentist.specialization && (
              <p className="text-xs text-muted-foreground">{dentist.specialization}</p>
            )}
          </div>
        )}
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b-2 border-border">
            <th className="text-left py-2 font-semibold text-muted-foreground">
              Description
            </th>
            <th className="text-center py-2 font-semibold text-muted-foreground">
              Qty
            </th>
            <th className="text-right py-2 font-semibold text-muted-foreground">
              Unit
            </th>
            <th className="text-right py-2 font-semibold text-muted-foreground">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {invoice?.items?.map((item: InvoiceItem) => (
            <tr key={item.id} className="border-b border-border/60">
              <td className="py-2 pr-3">
                <div className="font-medium text-foreground">
                  {item.description}
                </div>
                {item.ledgerEntry && (
                  <div className="text-[9px] text-muted-foreground/70 font-mono mt-0.5">
                    {item.ledgerEntry.entryCode} ·{" "}
                    {item.ledgerEntry.type.replace(/_/g, " ")}
                  </div>
                )}
                {item.originalCurrency &&
                  item.originalCurrency !== invoice?.currency && (
                    <div className="text-[9px] text-warning">
                      Orig:{" "}
                      {formatCurrency(item.originalTotal, item.originalCurrency)}{" "}
                      @ {Number(item.exchangeRate).toFixed(4)}
                    </div>
                  )}
              </td>
              <td className="py-2 text-center text-muted-foreground">
                {item.quantity}
              </td>
              <td className="py-2 text-right text-muted-foreground">
                {formatCurrency(item.unitPrice, invoice?.currency)}
              </td>
              <td className="py-2 text-right font-bold text-foreground">
                {formatCurrency(item.total, invoice?.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-1.5 border-t-2 border-border pt-4 ml-auto max-w-xs">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatCurrency(invoice?.subtotal, invoice?.currency)}</span>
        </div>
        {(invoice?.discountAmount || 0) > 0 && (
          <div className="flex justify-between text-xs text-danger">
            <span>Discount</span>
            <span>
              − {formatCurrency(invoice.discountAmount, invoice.currency)}
            </span>
          </div>
        )}
        {(invoice?.taxAmount || 0) > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Tax ({invoice?.taxPercent}%)</span>
            <span>{formatCurrency(invoice.taxAmount, invoice.currency)}</span>
          </div>
        )}
        <div className="flex justify-between font-black text-base border-t border-input pt-2">
          <span>Total ({invoice?.currency})</span>
          <span className="text-primary">
            {formatCurrency(invoice?.total, invoice?.currency)}
          </span>
        </div>
        {invoice?.currency !== invoice?.baseCurrency && (
          <div className="flex justify-between text-[10px] text-muted-foreground/70">
            <span>≈ {invoice?.baseCurrency}</span>
            <span>
              {formatCurrency(invoice?.baseTotal, invoice?.baseCurrency)}
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold text-success">
          <span>Paid</span>
          <span>{formatCurrency(invoice?.amountPaid, invoice?.currency)}</span>
        </div>
        {(invoice?.balance || 0) > 0.01 && (
          <div className="flex justify-between text-sm font-black text-warning bg-warning-muted/60 rounded px-2 py-1">
            <span>Balance Due</span>
            <span>{formatCurrency(invoice.balance, invoice.currency)}</span>
          </div>
        )}
      </div>

      {receipts?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest mb-2">
            Payment History
          </p>
          <div className="space-y-1.5">
            {receipts.map((r: any) => {
              const method = r.metadata?.method ?? r.payment?.method ?? null;
              const reference =
                r.metadata?.reference ?? r.payment?.reference ?? null;
              const receivedByLabel = r.receivedBy
                ? `${r.receivedBy.firstName} ${r.receivedBy.lastName}`
                : r.receivedByName ?? null;
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between bg-success-muted/60 border border-success/25 rounded-lg px-2 py-2"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-success" />
                    <div>
                      <div className="text-xs font-semibold text-success">
                        <span className="font-mono mr-2">{r.receiptNumber}</span>
                        {method && (
                          <span>{String(method).replace(/_/g, " ")}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-success flex flex-wrap gap-x-2">
                        {reference && <span>Ref: {reference}</span>}
                        {receivedByLabel && <span>by {receivedByLabel}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-black text-success">
                      {formatCurrency(
                        r.amountReceived,
                        r.currency || r.currencyCode || invoice?.currency
                      )}
                    </div>
                    {r.baseAmountReceived != null &&
                      (r.currency ?? r.currencyCode) !==
                        invoice?.baseCurrency && (
                        <div className="text-[9px] text-success">
                          ≈{" "}
                          {formatCurrency(
                            r.baseAmountReceived,
                            invoice?.baseCurrency
                          )}
                        </div>
                      )}
                    <div className="text-[9px] text-success">
                      {formatDate(r.generatedAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-center text-xs text-muted-foreground/70 border-t pt-4 mt-4">
        <p className="font-semibold text-muted-foreground">
          Thank you for choosing {clinic?.name || "our clinic"}
        </p>
        <p className="mt-0.5 text-[10px]">
          Computer-generated document. For enquiries:{" "}
          {clinic?.phone || clinic?.email}
        </p>
      </div>
    </div>
  );
}

// ─── Invoice Detail Dialog ────────────────────────────────────────────────────

function InvoiceDetailDialog({
  open,
  onClose,
  invoice,
  onReceipt,
  onOpenWorkspace,
}: {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  onReceipt: () => void;
  onOpenWorkspace: () => void;
}) {
  const payStatus = derivePaymentStatus(invoice);
  const hasMultiCurrency = invoice.items?.some(
    (item) => item.originalCurrency && item.originalCurrency !== invoice.currency
  );
  const canOpenWorkspace = !!(invoice.visit?.id && invoice.patient?.id);

  return (
    <Dialog open={open} onClose={onClose} size="xl">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-muted/50 shrink-0 flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-foreground">
              {invoice.invoiceNumber}
            </span>
            <StatusBadge status={invoice.status} />
            <PaymentStatusBadge status={payStatus} />
            {hasMultiCurrency && (
              <Badge className="bg-warning-muted/60 text-warning border-warning/25 text-[9px]">
                Multi-currency
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            {invoice.patient?.firstName} {invoice.patient?.lastName} ·{" "}
            {formatDate(invoice.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onReceipt}
            className="flex items-center gap-1.5 px-1 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print Invoice
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {invoice.patient && (
          <div className="bg-muted/50 rounded-xl p-4 text-xs space-y-2 border border-border">
            <p className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wide">
              Patient Details
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">
                    {invoice.patient.firstName} {invoice.patient.lastName}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground/70">
                    {invoice.patient.patientCode}
                  </p>
                </div>
              </div>
              {invoice.patient.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                  <span>{invoice.patient.phone}</span>
                </div>
              )}
              {invoice.visit?.dentist && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Stethoscope className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                  <div>
                    <p className="font-medium">
                      Dr. {invoice.visit.dentist.firstName}{" "}
                      {invoice.visit.dentist.lastName}
                    </p>
                    {invoice.visit.dentist.specialization && (
                      <p className="text-[10px] text-muted-foreground/70">
                        {invoice.visit.dentist.specialization}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-muted/50 px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Line Items
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {invoice.items?.length ?? 0} item(s)
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-muted/50 text-muted-foreground/70 font-medium">
                <th className="text-center px-4 py-2.5 font-medium">
                  Description
                </th>
                <th className="text-center px-4 py-2.5 font-medium w-20">
                  Qty
                </th>
                <th className="text-center px-4 py-2.5 font-medium w-32">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {invoice.items?.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {item.description}
                    </div>
                    {item.ledgerEntry && (
                      <div className="flex items-center gap-1 mt-1">
                        <Badge
                          className={cn(
                            "text-[9px] px-1.5 py-0",
                            ENTRY_TYPE_COLORS[item.ledgerEntry.type] ||
                              ENTRY_TYPE_COLORS.OTHER
                          )}
                        >
                          {item.ledgerEntry.type.replace(/_/g, " ")}
                        </Badge>
                        <span className="font-mono text-[9px] text-muted-foreground/70">
                          {item.ledgerEntry.entryCode}
                        </span>
                      </div>
                    )}
                    {item.originalCurrency &&
                      item.originalCurrency !== invoice.currency && (
                        <div className="text-[9px] text-warning mt-1">
                          {formatCurrency(
                            item.originalTotal,
                            item.originalCurrency
                          )}{" "}
                          → {formatCurrency(item.total, invoice.currency)} @{" "}
                          {Number(item.exchangeRate).toFixed(4)}
                        </div>
                      )}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground font-medium">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-foreground">
                    {formatCurrency(item.total, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-4 order-2 md:order-1">
            {invoice.currency !== (invoice.baseCurrency || BASE_CURRENCY) && (
              <div className="bg-primary-muted/60 border border-primary/20 rounded-xl p-4 text-xs">
                <p className="font-semibold text-primary mb-1">
                  Currency Exchange Info
                </p>
                <p className="text-primary">
                  Invoice: <strong>{invoice.currency}</strong> · Rate:{" "}
                  {Number(invoice.exchangeRate).toFixed(4)}
                </p>
                <p className="text-primary">
                  Base Settlement:{" "}
                  <strong>{invoice.baseCurrency || BASE_CURRENCY}</strong>
                </p>
              </div>
            )}

            {invoice.payments?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wide px-1">
                  Payments Received
                </p>
                <div className="space-y-2">
                  {invoice.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between bg-success-muted/60 border border-success/20 rounded-xl px-4 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                        <div>
                          <span className="text-xs font-semibold text-success">
                            {p.method.replace(/_/g, " ")}
                          </span>
                          <Badge className="ml-1.5 text-[9px] bg-success-muted text-success border-success/25">
                            {p.currency}
                          </Badge>
                          {p.reference && (
                            <span className="text-[10px] text-success ml-1.5">
                              · {p.reference}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-black text-success">
                          {formatCurrency(p.amount, p.currency)}
                        </div>
                        {p.currency !==
                          (invoice.baseCurrency || BASE_CURRENCY) && (
                          <div className="text-[9px] text-success">
                            ≈{" "}
                            {formatCurrency(
                              p.baseAmount,
                              invoice.baseCurrency || BASE_CURRENCY
                            )}
                          </div>
                        )}
                        <div className="text-[9px] text-muted-foreground/70 mt-0.5">
                          {formatDate(p.paidAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {invoice.receipts?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wide px-1">
                  Receipts Issued
                </p>
                <div className="space-y-2">
                  {invoice.receipts.map((r) => {
                    const receivedByLabel = (r as any).receivedBy
                      ? `${(r as any).receivedBy.firstName} ${
                          (r as any).receivedBy.lastName
                        }`
                      : (r as any).receivedByName ?? null;
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-indigo-500 shrink-0" />
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-indigo-800 font-mono">
                              {r.receiptNumber}
                            </span>
                            {receivedByLabel && (
                              <span className="text-[10px] text-indigo-600">
                                Received by {receivedByLabel}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-black text-indigo-800">
                            {formatCurrency(
                              r.amountReceived,
                              r.currency || invoice.currency
                            )}
                          </div>
                          <div className="text-[9px] text-muted-foreground/70 mt-0.5">
                            {formatDate(r.generatedAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-muted/50 rounded-xl p-4 space-y-2.5 text-xs border border-border order-1 md:order-2">
            <p className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wide mb-1">
              Financial Summary
            </p>
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-medium">
                {formatCurrency(invoice.subtotal, invoice.currency)}
              </span>
            </div>
            {(invoice.discountAmount || 0) > 0 && (
              <div className="flex justify-between text-danger">
                <span>Discount</span>
                <span className="font-medium">
                  − {formatCurrency(invoice.discountAmount, invoice.currency)}
                </span>
              </div>
            )}
            {(invoice.taxAmount || 0) > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax ({invoice.taxPercent ?? 0}%)</span>
                <span className="font-medium">
                  {formatCurrency(invoice.taxAmount, invoice.currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-black text-sm border-t border-border pt-2.5 text-foreground">
              <span>Total ({invoice.currency})</span>
              <span className="text-primary text-base">
                {formatCurrency(invoice.total, invoice.currency)}
              </span>
            </div>
            {invoice.currency !== (invoice.baseCurrency || BASE_CURRENCY) && (
              <div className="flex justify-between text-[10px] text-muted-foreground/70 border-b border-border/60 pb-2">
                <span>≈ in {invoice.baseCurrency || BASE_CURRENCY}</span>
                <span>
                  {formatCurrency(
                    invoice.baseTotal,
                    invoice.baseCurrency || BASE_CURRENCY
                  )}
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-success pt-1">
              <span>Amount Paid</span>
              <span>{formatCurrency(invoice.amountPaid, invoice.currency)}</span>
            </div>
            {invoice.balance > 0.01 && (
              <div className="flex justify-between font-black text-sm text-warning bg-warning-muted/60 border border-warning/20 rounded-lg px-1 py-2 mt-2">
                <span>Balance Due</span>
                <span>{formatCurrency(invoice.balance, invoice.currency)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t bg-muted/50 shrink-0 flex items-center gap-3">
        {payStatus === "PAID" && (
          <div className="flex items-center gap-2 px-1 py-2 rounded-lg bg-success-muted/60 border border-success/25 text-success font-bold text-xs">
            <CheckCircle className="w-4 h-4" />
            Fully Paid
          </div>
        )}
        <button
          onClick={() => {
            onClose();
            onOpenWorkspace();
          }}
          disabled={!canOpenWorkspace}
          title={
            canOpenWorkspace
              ? "Open the visit's billing workspace to edit or receive payment"
              : "This invoice has no linked visit"
          }
          className="ml-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary transition-colors shadow-sm shadow-blue-600/10 disabled:bg-muted disabled:text-muted-foreground/70 disabled:cursor-not-allowed"
        >
          <ExternalLink className="w-4 h-4" />
          Open Billing Workspace
        </button>
      </div>
    </Dialog>
  );
}

// ─── Invoice Table Row ────────────────────────────────────────────────────────

function InvoiceRow({
  invoice,
  onOpen,
  onReceipt,
  onDetail,
}: {
  invoice: Invoice;
  onOpen: () => void;
  onReceipt: () => void;
  onDetail: () => void;
}) {
  const canonical = normalizeStatus(invoice.status);
  const payStatus = derivePaymentStatus(invoice);
  const hasPaid = invoice.amountPaid > 0;
  const rowCfg = STATUS_CONFIG[canonical];
  const payCfg = PAYMENT_STATUS_CONFIG[payStatus];
  const rowTint = payCfg.row || rowCfg.row;
  const hasVisit = !!(invoice.visit?.id && invoice.patient?.id);

  const primaryClick = hasVisit ? onOpen : onDetail;

  return (
    <tr
      onClick={primaryClick}
      className={cn(
        "border-b border-border/60 transition-colors hover:bg-muted/80 cursor-pointer",
        rowTint
      )}
    >
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="font-mono text-sm font-bold text-primary">
          {invoice.invoiceNumber}
        </div>
      </td>

      {/* NEW: Date column */}
      <td className="px-1 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {formatDate(invoice.createdAt) }          
        <span className="text-[10px] text-muted-foreground/70 mt-0.5 pl-3">
          {relativeDate(invoice.createdAt)}
          </span>
      </td>

      <td className="px-1 py-3">
        {invoice.patient ? (
          <div>
            <div className="text-sm font-medium text-foreground truncate max-w-[180px]">
              {invoice.patient.firstName} {invoice.patient.lastName}
            <span className="text-[10px] text-muted-foreground/70 font-mono pl-2">
              {invoice.patient.patientCode}
            </span>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground/70 text-xs">—</span>
        )}
      </td>

      <td className="px-1 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {invoice.visit?.dentist ? (
          <span>Dr. {invoice.visit.dentist.firstName}</span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>

      <td className="px-1 py-3 text-center">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-bold">
          {invoice.items?.length ?? 0}
        </span>
      </td>

      <td className="px-1 py-3 text-center whitespace-nowrap">
        <div className="text-sm font-bold text-foreground">
          {formatCurrency(invoice.total, invoice.currency)}
        </div>
        {invoice.currency !== (invoice.baseCurrency || BASE_CURRENCY) && (
          <div className="text-[10px] text-muted-foreground/70">
            ≈{" "}
            {formatCurrency(
              invoice.baseTotal,
              invoice.baseCurrency || BASE_CURRENCY
            )}
          </div>
        )}
      </td>

      <td className="px-1 py-3 text-center whitespace-nowrap">
        {hasPaid ? (
          <span className="text-sm font-semibold text-success">
            {formatCurrency(invoice.amountPaid, invoice.currency)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">0</span>
        )}
      </td>

      <td className="px-1 py-3 text-center whitespace-nowrap">
        {invoice.balance > 0.01 ? (
          <span className="text-sm font-bold text-danger">
            {formatCurrency(invoice.balance, invoice.currency)}
          </span>
        ) : (
          <span className="text-xs font-medium text-success">Cleared</span>
        )}
      </td>

      <td className="px-1 py-3 text-xs text-muted-foreground whitespace-nowrap">
        <StatusBadge status={invoice.status} />
      </td>

      <td className="px-1 py-3 whitespace-nowrap">
        <div className="flex flex-col gap-1 items-center justify-center">
          <PaymentStatusBadge status={payStatus} />
        </div>
      </td>

      <td className="px-1 py-3">
        <RowActions className="justify-center">
          <ActionButton
            tone="view"
            label="Open"
            icon={ExternalLink}
            title={hasVisit ? "Open billing workspace" : "View invoice detail"}
            onClick={primaryClick}
          />
        </RowActions>
      </td>
    </tr>
  );
}

// ─── Main BillingPage ─────────────────────────────────────────────────────────

export function BillingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ── Auto-open invoice detail when ?invoiceId= is in the URL (e.g. from SalesReports) ──
  useEffect(() => {
    const invoiceIdFromUrl = searchParams.get("invoiceId");
    if (invoiceIdFromUrl) {
      setDetailInvoiceId(invoiceIdFromUrl);
      // Clean the URL so it doesn't re-trigger on refresh
      navigate("/billing", { replace: true });
    }
  }, [navigate, searchParams]);

  // ── Filter state (controlled, fed into the query key) ──────────────
  // searchInput is the raw input; `search` is the debounced value that
  // hits the backend. Debouncing at 300ms avoids hammering /billing/invoices
  // on every keystroke while still feeling instant.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("ALL");
  const [dentistFilter, setDentistFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<
    "createdAt" | "total" | "balance" | "invoiceNumber"
  >("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // ── Debounce the search input ──────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 on any non-paging filter change. Excluding `page` from
  // the deps prevents a feedback loop when the user clicks the paginator.
  useEffect(() => {
    setPage(1);
  }, [
    search,
    statusFilter,
    paymentStatusFilter,
    dentistFilter,
    currencyFilter,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
  ]);

  const LIMIT = 25;

  // ── Dialog state (lazy, only opened on user action) ─────────────
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<string | null>(null);

  // ── Derived: any filter active? (drives the "Clear filters" affordance) ──
  const hasActiveFilters =
    search !== "" ||
    statusFilter !== "ALL" ||
    paymentStatusFilter !== "ALL" ||
    dentistFilter !== "ALL" ||
    currencyFilter !== "ALL" ||
    dateFrom !== "" ||
    dateTo !== "";

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatusFilter("ALL");
    setPaymentStatusFilter("ALL");
    setDentistFilter("ALL");
    setCurrencyFilter("ALL");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  // ── Query: dentist list for the filter dropdown ─────────────────────
  const { data: dentistOptions = [] } = useQuery<
    Array<{ id: string; name: string }>
  >({
    queryKey: ["billing-dentist-options"],
    queryFn: async () => {
      const data = await apiFetch("/staff?role=DENTIST&limit=100");
      const list = Array.isArray(data) ? data : (data?.data ?? []);
      return list.map((s: any) => ({
        id: s.id,
        name: `Dr. ${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(),
      }));
    },
    staleTime: 300_000,
    retry: false,
  });

  // ── Query: server-filtered, server-paginated invoice list ──────────
  // Replaces the old limit=9999 + client-side-filter pattern. The backend
  // is now the source of truth: meta.total is the canonical row count,
  // meta.totalPages drives the paginator, and `data` is already the
  // server's filtered + sorted + sliced view of the result set.
  const {
    data: listData,
    isLoading,
    isFetching,
    isError,
    error: listError,
    refetch,
  } = useQuery({
    queryKey: [
      "billing-invoices",
      {
        search,
        statusFilter,
        paymentStatusFilter,
        dentistFilter,
        currencyFilter,
        dateFrom,
        dateTo,
        sortBy,
        sortDir,
        page,
        limit: LIMIT,
      },
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (paymentStatusFilter !== "ALL")
        params.set("paymentStatus", paymentStatusFilter);
      if (currencyFilter !== "ALL") params.set("currency", currencyFilter);
      if (dentistFilter !== "ALL") params.set("dentistId", dentistFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      return apiFetch(`/billing/invoices?${params.toString()}`);
    },
    // Keep the previous page visible while fetching the next — avoids
    // the table flashing empty between page clicks.
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });

  const invoices: Invoice[] = listData?.data ?? [];
  const meta = listData?.meta ?? {
    total: 0,
    page: 1,
    limit: LIMIT,
    totalPages: 1,
  };
  // Clamp the local page state to the server's totalPages so a stale page
  // number (e.g. user deletes filters and the new total has fewer pages)
  // never renders a blank page.
  const safePage = Math.min(page, meta.totalPages || 1);

  // Every currency in use (server-side, unfiltered) plus the active choice,
  // so picking USD doesn't make UGX vanish from the dropdown.
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>([BASE_CURRENCY, ...(listData?.meta?.currencies ?? [])]);
    if (currencyFilter !== "ALL") set.add(currencyFilter);
    return Array.from(set).sort();
  }, [listData?.meta?.currencies, currencyFilter]);

  // ── Query: invoice detail (lazy, only when a row drawer is opened) ───
  const { data: detailData } = useQuery({
    queryKey: ["billing-invoice-detail", detailInvoiceId],
    queryFn: () => apiFetch(`/billing/invoices/${detailInvoiceId}`),
    enabled: !!detailInvoiceId,
    staleTime: 15_000,
  });

  const detailInvoice = detailInvoiceId
    ? (detailData?.id === detailInvoiceId
        ? detailData
        : invoices.find((i) => i.id === detailInvoiceId)) ?? null
    : null;

  const openWorkspace = (inv: Invoice) => {
    if (!inv.visit?.id || !inv.patient?.id) {
      setDetailInvoiceId(inv.id);
      return;
    }
    const patientName = inv.patient
      ? `${inv.patient.firstName ?? ""} ${inv.patient.lastName ?? ""}`.trim()
      : "";
    const params = new URLSearchParams();
    if (patientName) params.set("patientName", patientName);
    if (inv.visit.visitCode) params.set("visitCode", inv.visit.visitCode);
    navigate(
      `/VisitBillingPage/${inv.visit.id}/${inv.patient.id}${
        params.toString() ? `?${params}` : ""
      }`
    );
  };

  const invoiceStatusOptions = [
    { value: "ALL", label: "All", cfg: null },
    { value: "DRAFT", label: "Draft", cfg: STATUS_CONFIG.DRAFT },
    { value: "POSTED", label: "Posted", cfg: STATUS_CONFIG.POSTED },
    { value: "VOID", label: "Void", cfg: STATUS_CONFIG.VOID },
  ];

  const paymentStatusOptions = [
    { value: "ALL", label: "All", dot: null },
    {
      value: "UNPAID",
      label: "Unpaid",
      dot: PAYMENT_STATUS_CONFIG.UNPAID.dot,
    },
    {
      value: "PARTIALLY_PAID",
      label: "Partial",
      dot: PAYMENT_STATUS_CONFIG.PARTIALLY_PAID.dot,
    },
    { value: "PAID", label: "Paid", dot: PAYMENT_STATUS_CONFIG.PAID.dot },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full px-2 py-1 gap-4">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-xl font-black text-foreground tracking-tight flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Billing &amp; Invoices
        </h1>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground/70 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Stats Cards ─────────────────────────────────────────────────── */}
      <StatsRow
        summary={listData?.meta?.summary ?? {}}
        invoiceCount={meta.total}
        isLoading={isLoading}
      />

      {/* ── Main Table Card ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0 border border-border rounded-2xl bg-white overflow-hidden">
        {/* ── Filter Toolbar ─────────────────────────────────────────────── */}
        <div className="px-3 py-2.5 border-b border-border/60 bg-muted/50 shrink-0 space-y-2">
          {/* Row 1 — Search + Date Range + invoice count ────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                }}
                placeholder="Search invoice #, patient name, code…"
                className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/60 focus:outline-none bg-white w-56"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-border rounded-lg px-2.5 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                title="From date"
                className="text-xs border-none outline-none bg-transparent text-muted-foreground w-[116px]"
              />
              <span className="text-muted-foreground/50 text-xs select-none">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                title="To date"
                className="text-xs border-none outline-none bg-transparent text-muted-foreground w-[116px]"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setPage(1);
                  }}
                  title="Clear date range"
                  className="ml-0.5 p-0.5 rounded hover:bg-muted text-muted-foreground/70"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="ml-auto text-xs text-muted-foreground/70">
              {!isLoading &&
                `${meta.total.toLocaleString()} invoice${meta.total !== 1 ? "s" : ""}`}
              {isFetching && !isLoading && (
                <span className="ml-2 text-primary">updating…</span>
              )}
            </div>
            <div className="flex gap-1">
              {invoiceStatusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setStatusFilter(opt.value);
                    setPage(1);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border",
                    statusFilter === opt.value
                      ? "bg-foreground text-white border-foreground"
                      : "bg-white text-muted-foreground border-border hover:border-input"
                  )}
                >
                  {opt.cfg && (
                    <span
                      className={cn("w-1.5 h-1.5 rounded-full", opt.cfg.dot)}
                    />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-muted shrink-0" />

            <div className="flex gap-1">
              {paymentStatusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setPaymentStatusFilter(opt.value);
                    setPage(1);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border",
                    paymentStatusFilter === opt.value
                      ? "bg-foreground text-white border-foreground"
                      : "bg-white text-muted-foreground border-border hover:border-input"
                  )}
                >
                  {opt.dot && (
                    <span
                      className={cn("w-1.5 h-1.5 rounded-full", opt.dot)}
                    />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-muted shrink-0" />

            <div className="flex items-center gap-1.5 bg-white border border-border rounded-lg px-2.5 py-1.5">
              <Stethoscope className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
              <select
                value={dentistFilter}
                onChange={(e) => {
                  setDentistFilter(e.target.value);
                  setPage(1);
                }}
                className="text-xs border-none outline-none bg-transparent text-muted-foreground min-w-[110px] pr-1 cursor-pointer"
              >
                <option value="ALL">All Dentists</option>
                {dentistOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-px h-5 bg-muted shrink-0" />

            {/* Currency filter — multi-currency support. The dropdown is
                populated from currencies actually present in the loaded
                result set, so the user never sees an option that filters
                to zero rows. */}
            <div className="flex items-center gap-1.5 bg-white border border-border rounded-lg px-2.5 py-1.5">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
                title="Filter by invoice currency"
                className="text-xs border-none outline-none bg-transparent text-muted-foreground min-w-[80px] pr-1 cursor-pointer"
              >
                <option value="ALL">All Currencies</option>
                {availableCurrencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-px h-5 bg-muted shrink-0" />

            {/* Sort selector — drives server-side orderBy */}
            <div className="flex items-center gap-1.5 bg-white border border-border rounded-lg px-2.5 py-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
              <select
                value={`${sortBy}:${sortDir}`}
                onChange={(e) => {
                  const [b, d] = e.target.value.split(":");
                  setSortBy(b as typeof sortBy);
                  setSortDir(d as typeof sortDir);
                }}
                title="Sort order"
                className="text-xs border-none outline-none bg-transparent text-muted-foreground min-w-[140px] pr-1 cursor-pointer"
              >
                <option value="createdAt:desc">Newest first</option>
                <option value="createdAt:asc">Oldest first</option>
                <option value="total:desc">Highest total</option>
                <option value="total:asc">Lowest total</option>
                <option value="balance:desc">Highest balance</option>
                <option value="balance:asc">Lowest balance</option>
                <option value="invoiceNumber:asc">Invoice # A→Z</option>
                <option value="invoiceNumber:desc">Invoice # Z→A</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border border-danger/25 text-danger hover:bg-danger-muted/60 transition-colors whitespace-nowrap"
              >
                <X className="w-3 h-3" />
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ── Active-filter chips (UX: "you're filtering by X, Y, Z") ─── */}
        {hasActiveFilters && (
          <div className="px-3 py-2 border-b border-border/60 bg-primary-muted/40 shrink-0 flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-semibold">
              Filtering by:
            </span>
            {search && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-border text-[11px] text-foreground">
                <Search className="w-3 h-3" />"{search}"
              </span>
            )}
            {statusFilter !== "ALL" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-border text-[11px] text-foreground">
                Status: {statusFilter}
              </span>
            )}
            {paymentStatusFilter !== "ALL" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-border text-[11px] text-foreground">
                Payment: {paymentStatusFilter}
              </span>
            )}
            {dentistFilter !== "ALL" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-border text-[11px] text-foreground">
                Dentist:{" "}
                {dentistOptions.find((d) => d.id === dentistFilter)?.name ??
                  dentistFilter}
              </span>
            )}
            {currencyFilter !== "ALL" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-border text-[11px] text-foreground">
                Currency: {currencyFilter}
              </span>
            )}
            {dateFrom && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-border text-[11px] text-foreground">
                From: {dateFrom}
              </span>
            )}
            {dateTo && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-border text-[11px] text-foreground">
                To: {dateTo}
              </span>
            )}
          </div>
        )}

        {/* ── Table Body ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground/70">
              <FileText className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">No invoices found</p>
              <p className="text-xs mt-1 text-muted-foreground/70">
                {hasActiveFilters
                  ? "Try adjusting or clearing your filters"
                  : "Invoices created from visits will appear here"}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="sticky top-0 bg-white border-b border-border z-10">
                <tr className="text-[11px] text-muted-foreground/70 font-semibold uppercase tracking-wide">
                  <th className="text-left px-3 py-3">Invoice</th>
                  <th className="text-left px-2 py-3">Date</th>
                  <th className="text-left px-2 py-3">Patient</th>
                  <th className="text-left px-2 py-3">Dentist</th>
                  <th className="text-center px-1 py-3">Items</th>
                  <th className="text-center px-1 py-3">Total</th>
                  <th className="text-center px-1 py-3">Paid</th>
                  <th className="text-center px-1 py-3">Balance</th>
                  <th className="text-left px-1 py-3">Invoice Status</th>
                  <th className="text-center px-1 py-3">Payment Status</th>
                  <th className="text-center px-1 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    onOpen={() => openWorkspace(inv)}
                    onDetail={() => setDetailInvoiceId(inv.id)}
                    onReceipt={() => setReceiptInvoiceId(inv.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ────────────────────────────────────────────────── */}
        {meta.totalPages > 1 && (
          <div className="px-4 py-2.5 border-t border-border/60 bg-muted/50 flex items-center justify-between shrink-0">
            <p className="text-xs text-muted-foreground">
              {meta.total === 0
                ? "No invoices"
                : `${(safePage - 1) * LIMIT + 1}–${Math.min(
                    safePage * LIMIT,
                    meta.total,
                  )} of ${meta.total.toLocaleString()}`}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-1 py-1 text-xs text-muted-foreground font-medium">
                {safePage} / {meta.totalPages}
              </span>
              <button
                onClick={() =>
                  setPage(Math.min(meta.totalPages, safePage + 1))
                }
                disabled={safePage === meta.totalPages}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      {detailInvoice && (
        <InvoiceDetailDialog
          open={!!detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
          invoice={detailInvoice}
          onReceipt={() => {
            setDetailInvoiceId(null);
            setReceiptInvoiceId(detailInvoice.id);
          }}
          onOpenWorkspace={() => {
            setDetailInvoiceId(null);
            openWorkspace(detailInvoice);
          }}
        />
      )}

      {receiptInvoiceId && (
        <ReceiptDialog
          open={!!receiptInvoiceId}
          onClose={() => setReceiptInvoiceId(null)}
          invoiceId={receiptInvoiceId}
        />
      )}
    </div>
  );
}