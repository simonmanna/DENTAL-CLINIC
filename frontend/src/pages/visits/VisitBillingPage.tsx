// VisitBillingPage.tsx — Odoo-style invoice with Billing Services catalogue + Prescriptions checkboxes
//
// Invoice lifecycle:  DRAFT -> POSTED (ACTIVE) -> VOID
// Payment status:     UNPAID / PARTIALLY_PAID / PAID
//
// Billing services are shown as a searchable catalogue list with "Add" buttons.
// Prescriptions are shown with checkboxes — toggle adds/removes invoice items.

import { BASE_CURRENCY, CURRENCY_CONFIG } from "@/constants/currency";
import { formatCurrency } from "@/lib/utils";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Plus,
  CreditCard,
  CheckCircle,
  AlertTriangle,
  Receipt,
  X,
  Loader2,
  Printer,
  Ban,
  Package,
  Pill,
  Check,
  ArrowLeft,
  User,
  ClipboardCheck,
  Trash2,
  Save,
  Eye,
} from "lucide-react";
import { billingApi } from "@/lib/api/billing";
import { useAuthStore } from "@/store/auth.store";
import { usePermissions } from "@/hooks/usePermissions";
import { ReceivedByPicker } from "@/components/billing/ReceivedByPicker";
import type {
  BillingService,
  InvoiceItem,
  Invoice,
  Payment,
  ReceiptRecord,
  ServiceListResponse,
  InvoiceListResponse,
  ReceiptData,
} from "@/types/billing";
import { prescriptionsApi } from "../../services/pharmacyApi";
import { UserRole } from "@/types/shared";

// ─── Utils ────────────────────────────────────────────────────────────────────

function cn(...cls: (string | boolean | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

const fmt = formatCurrency;

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "MTN_MOBILE_MONEY", label: "MTN Mobile Money" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
  { value: "VISA_CARD", label: "Visa Card" },
  { value: "MASTERCARD", label: "Mastercard" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE", label: "Cheque" },
];

const PAYMENT_TERMS_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "CREDIT", label: "Credit" },
  { value: "PARTIAL_PAYMENT", label: "Partial Payment" },
];

// ─── Simplified status helpers ────────────────────────────────────────────────

function getDisplayStatus(status: string): "Draft" | "Posted" | "Void" {
  if (status === "DRAFT") return "Draft";
  if (status === "VOID" || status === "CANCELLED") return "Void";
  return "Posted";
}

function getPaymentStatusLabel(inv: Invoice): string {
  if (inv.paymentStatus === "PAID") return "Paid";
  if (inv.paymentStatus === "PARTIALLY_PAID") return "Partially Paid";
  const paid = Number(inv.amountPaid ?? 0);
  const balance = Number(inv.balance ?? 0);
  if (paid > 0 && balance <= 0.01) return "Paid";
  if (paid > 0) return "Partially Paid";
  return "Unpaid";
}

// ─── Prescription types ───────────────────────────────────────────────────────

interface RxDrug {
  id: string;
  name: string;
  form?: string;
  strength?: string;
  unit: string;
  sellPrice: number;
  stockQuantity: number;
}
interface RxItem {
  id: string;
  drugId: string;
  drug?: RxDrug;
  quantity: number;
  dosage?: string;
  frequency?: string;
  sellPrice?: number;
}
interface PatientPrescription {
  id: string;
  prescriptionCode: string;
  status: string;
  createdAt: string;
  dentist?: { firstName: string; lastName: string };
  items: RxItem[];
}

// ─── Shared tiny components ───────────────────────────────────────────────────

function Spinner({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <Loader2
      className={cn(
        "animate-spin text-blue-600",
        size === "sm" ? "w-4 h-4" : "w-6 h-6",
      )}
    />
  );
}

// ─── Void Invoice Dialog ──────────────────────────────────────────────────────

function VoidInvoiceDialog({
  invoice,
  onClose,
  onConfirm,
  isPending,
}: {
  invoice: Invoice;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  const isPartialOrPaid =
    invoice.paymentStatus === "PARTIALLY_PAID" ||
    invoice.paymentStatus === "PAID";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-slate-800">
              Void Invoice
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
            <span className="font-medium">{invoice.invoiceNumber}</span>
            <span className="mx-1.5 text-slate-400">·</span>
            <span>{getDisplayStatus(invoice.status)}</span>
            <span className="mx-1.5 text-slate-400">·</span>
            <span className="font-medium">
              {formatCurrency(invoice.total, invoice.currency)}
            </span>
          </div>
          {isPartialOrPaid && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold mb-0.5">
                    Receipts will be automatically reversed
                  </p>
                  <p>
                    All{" "}
                    {invoice.receipts?.filter((r) => r.status === "ACTIVE")
                      .length ?? 0}{" "}
                    active receipt(s) will be voided.
                  </p>
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
              placeholder="Describe why this invoice is being voided..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim() || isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Voiding...
              </>
            ) : (
              <>
                <Ban className="w-3.5 h-3.5" /> Void Invoice
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payment Dialog ───────────────────────────────────────────────────────────

function PaymentDialog({
  open,
  onClose,
  invoice,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState(invoice.currency);
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [receivedById, setReceivedById] = useState("");
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [customRate, setCustomRate] = useState("");
  const amountInInvCurrRef = useRef(Number(invoice.balance ?? 0));
  const fromInitialPayment = useRef(false);
  // C1: one stable idempotency key per dialog-open. A double-click or retry
  // reuses it so the backend replays the first payment instead of charging
  // twice. Regenerated whenever the dialog re-opens (see the open effect).
  const idempotencyKeyRef = useRef<string>("");
  const [error, setError] = useState("");
  const qc = useQueryClient();

  const { data: payRateData } = useQuery<{
    from: string;
    to: string;
    rate: number;
  }>({
    queryKey: ["pay-exchange-rate", paymentCurrency, invoice.currency],
    queryFn: () =>
      billingApi.getExchangeRate(paymentCurrency, invoice.currency),
    enabled: open && paymentCurrency !== invoice.currency,
    staleTime: 5 * 60_000,
  });
  // const liveRate = payRateData?.rate ?? 0;

  const liveRate = payRateData?.rate ?? 0;

  // When user switches currency, immediately convert the displayed amount
  useEffect(() => {
    if (!open) return;
    if (fromInitialPayment.current) return;
    if (paymentCurrency === invoice.currency) {
      setAmount(Math.round(amountInInvCurrRef.current).toString());
    }
    if (!fromInitialPayment.current) {
      setUseCustomRate(false);
      setCustomRate("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentCurrency]);

  // When the live rate finishes loading, convert the amount into the foreign currency
  useEffect(() => {
    if (!open || paymentCurrency === invoice.currency || liveRate <= 0) return;
    if (fromInitialPayment.current) return;
    setAmount((amountInInvCurrRef.current / liveRate).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRate]);

  React.useEffect(() => {
    if (open) {
      const noReceipts = (invoice as any).receipts?.length === 0;
      const nothingPaid = Number(invoice.amountPaid ?? 0) === 0;
      const useInitial = noReceipts || nothingPaid;
      const initialAmt = (invoice as any).initialPaymentAmount;
      const initialCurr = (invoice as any).initialPaymentCurrency;
      setPaymentCurrency(
        useInitial && initialCurr ? initialCurr : invoice.currency
      );
      setAmount(
        useInitial && initialAmt != null
          ? Number(initialAmt).toFixed(0)
          : Number(invoice.balance ?? 0).toFixed(0)
      );
      amountInInvCurrRef.current = useInitial && initialAmt != null
        ? Number(initialAmt)
        : Number(invoice.balance ?? 0);
      fromInitialPayment.current = useInitial && initialAmt != null;
      setMethod("CASH");
      setReference("");
      setReceivedById("");
      setUseCustomRate(false);
      setCustomRate("");
      setError("");
      // Fresh idempotency key for this payment attempt.
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }, [open, invoice]);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      billingApi.recordPayment(invoice.id, data, idempotencyKeyRef.current),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-invoices"] });
      onSuccess();
      onClose();
    },
    onError: (e: any) => setError(e.message),
  });

  const numAmount = parseFloat(amount || "0");
  const isDiffCurrency = paymentCurrency !== invoice.currency;
  const effectiveRate = isDiffCurrency
    ? useCustomRate && parseFloat(customRate) > 0
      ? parseFloat(customRate)
      : liveRate > 0
        ? liveRate
        : 1
    : 1;
  const numAmountInInvoiceCurrency = isDiffCurrency
    ? numAmount * effectiveRate
    : numAmount;
  const remaining = invoice.balance - numAmountInInvoiceCurrency;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-1 sm:p-2"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Wider dialog with smoother animation */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl sm:max-w-3xl flex flex-col max-h-[86vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        {/* Header */}
        <div className="px-3 py-1 border-b bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-between shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <CreditCard className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2
                id="dialog-title"
                className="text-lg font-bold text-slate-800 flex items-center gap-1"
              >
                Record Payment Receipt
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                <span className="font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded">
                  {invoice.invoiceNumber}
                </span>
                {(invoice as any).patient && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-medium text-slate-700">
                      {(invoice as any).patient.firstName}{" "}
                      {(invoice as any).patient.lastName}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/70 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5 text-slate-500 hover:text-slate-700" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-2 space-y-2 overflow-y-auto flex-1">
          {/* Invoice Summary Cards - More spacious layout */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-0 mx-1 grid grid-cols-3 gap-1 text-center">
            <div className="p-1">
              <p className="text-sm font-medium text-slate-500">Total Amount</p>
              <p className="text-sm font-bold text-slate-800 mt-1">
                {formatCurrency(invoice.total, invoice.currency)}
              </p>
            </div>
            <div className="p-2 border-x border-slate-200">
              <p className="text-sm font-medium text-slate-500">Amount Paid</p>
              <p className="text-sm font-bold text-emerald-600 mt-1">
                {formatCurrency(invoice.amountPaid, invoice.currency)}
              </p>
            </div>
            <div className="p-2">
              <p className="text-sm font-medium text-slate-500">Balance Due</p>
              <p className="text-sm font-bold text-red-600 mt-1">
                {formatCurrency(invoice.balance, invoice.currency)}
              </p>
            </div>
          </div>

          {/* Amount & Currency Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Payment Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  // onChange={(e) => setAmount(e.target.value)}
                  onChange={(e) => {
                    fromInitialPayment.current = false;
                    setAmount(e.target.value);
                    const num = parseFloat(e.target.value || "0");
                    const rate =
                      useCustomRate && parseFloat(customRate) > 0
                        ? parseFloat(customRate)
                        : liveRate > 0
                          ? liveRate
                          : 1;
                    amountInInvCurrRef.current =
                      paymentCurrency === invoice.currency ? num : num * rate;
                  }}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition-shadow"
                  placeholder="Enter amount"
                  min="0"
                  step="0.01"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium pr-8">
                  {paymentCurrency}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Currency
              </label>
              <select
                value={paymentCurrency}
                onChange={(e) => {
                  fromInitialPayment.current = false;
                  setPaymentCurrency(e.target.value);
                }}
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none bg-white transition-shadow"
              >
                <option value={invoice.currency}>{invoice.currency}</option>
                {Object.keys(CURRENCY_CONFIG as any)
                  .filter((c) => c !== invoice.currency)
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Exchange Rate Section - Enhanced */}
          {isDiffCurrency && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-amber-800 font-medium text-sm">
                  {liveRate > 0 ? (
                    <>
                      💱 1 {paymentCurrency} ={" "}
                      <strong className="font-bold">
                        {liveRate.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}
                      </strong>{" "}
                      {invoice.currency}
                    </>
                  ) : (
                    <span className="italic text-amber-600">
                      Fetching exchange rate...
                    </span>
                  )}
                </span>
                {liveRate > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0 rounded-full">
                    Live rate
                  </span>
                )}
              </div>

              {/* <label className="flex items-center gap-2.5 text-slate-700 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={useCustomRate}
                    onChange={(e) => {
                      setUseCustomRate(e.target.checked);
                      if (e.target.checked && liveRate > 0 && !customRate)
                        setCustomRate(liveRate.toString());
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-5 h-5 border-2 border-amber-300 rounded-md peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-colors flex items-center justify-center">
                    {useCustomRate && (
                      <Check className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                </div>
                <span className="font-medium text-sm group-hover:text-amber-900 transition-colors">
                  Use custom exchange rate
                </span>
              </label> */}

              {useCustomRate && (
                <div className="pt-2">
                  <input
                    type="number"
                    value={customRate}
                    onChange={(e) => setCustomRate(e.target.value)}
                    className="w-full border border-amber-300 rounded-xl px-4 py-2.5 text-base bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400 focus:outline-none"
                    placeholder={`Enter rate: 1 ${paymentCurrency} = ? ${invoice.currency}`}
                    step="0.0001"
                  />
                </div>
              )}
            </div>
          )}

          {/* Payment Methods - Better touch targets */}
          <div>
            <label className="block text-base font-semibold text-slate-700 mt-3 mb-2">
              Payment Method <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 p-1 rounded-xl border-2 text-sm font-medium transition-all duration-150",
                    method === m.value
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-200"
                      : "bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50",
                  )}
                >
                  <span className="text-base">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reference & Received By */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 mt-1">
                Transaction Reference
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g., TXN-2024-XYZ, Check #1234"
                className="w-full border border-slate-300 rounded-xl px-1 py-1 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition-shadow"
              />
            </div>
            <ReceivedByPicker
              value={receivedById}
              onChange={setReceivedById}
              label="Received By Staff"
              required
            />
          </div>

          {/* Payment Summary Card */}
          {numAmount > 0 && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 font-medium">This payment</span>
                <span className="text-lg font-bold text-emerald-700">
                  {formatCurrency(numAmount, paymentCurrency)}
                </span>
              </div>
              {isDiffCurrency && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">
                    Converted to {invoice.currency}
                  </span>
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(
                      numAmountInInvoiceCurrency,
                      invoice.currency,
                    )}
                  </span>
                </div>
              )}
              <div className="border-t border-emerald-200 pt-3 flex justify-between items-center">
                <span className="text-slate-600 font-medium">
                  Balance Remaining
                </span>
                <span
                  className={cn(
                    "text-lg font-bold",
                    remaining <= 0 ? "text-emerald-600" : "text-amber-600",
                  )}
                >
                  {remaining <= 0
                    ? "✅ Fully Paid"
                    : formatCurrency(remaining, invoice.currency)}
                </span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t bg-slate-50 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex-1 px-4 py-3 rounded-xl border border-slate-300 text-base font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!numAmount || numAmount <= 0) {
                setError("Please enter a valid payment amount");
                return;
              }
              if (numAmountInInvoiceCurrency > invoice.balance + 0.01) {
                setError(
                  `Amount exceeds remaining balance of ${formatCurrency(invoice.balance, invoice.currency)}`,
                );
                return;
              }
              if (!receivedById) {
                setError(
                  "Please select the staff member who received this payment",
                );
                return;
              }
              mutation.mutate({
                amount: numAmount,
                paymentCurrency,
                method,
                reference: reference || undefined,
                receivedById,
                generateReceipt: true,
              });
            }}
            disabled={mutation.isPending || !amount}
            className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 text-white text-base font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-emerald-200 hover:shadow-emerald-300"
          >
            {mutation.isPending ? (
              <>
                <Spinner size="md" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Record{" "}
                {numAmount > 0
                  ? formatCurrency(numAmount, paymentCurrency)
                  : "Payment"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceiptModal({
  open,
  onClose,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
}) {
  const { data, isLoading } = useQuery<ReceiptData>({
    queryKey: ["receipt", invoiceId],
    queryFn: () => billingApi.getReceipt(invoiceId),
    enabled: open && !!invoiceId,
  });
  if (!open) return null;
  return (
    <div className="print-shell fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="no-print flex items-center justify-between px-5 py-4 border-b bg-slate-50">
          <h2 className="text-base font-semibold text-slate-800">
            Invoice
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm text-slate-600 hover:bg-slate-100"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-slate-200"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
        <div className="print-area overflow-y-auto max-h-[75vh] p-5">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : data ? (
            <InvoiceDocument data={data} />
          ) : (
            <p className="text-center text-slate-400 py-8">
              Failed to load receipt
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function InvoiceDocument({ data }: { data: ReceiptData }) {
  const { clinic, invoice, patient, dentist, receipts } = data;
  const items = invoice?.items ?? [];
  const computedSubtotal = items.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.unitPrice),
    0,
  );
  const computedDiscount = items.reduce(
    (s, i) => s + (Number(i.discount) || 0),
    0,
  );
  const displaySubtotal = computedSubtotal || Number(invoice?.subtotal) || 0;
  const displayDiscount =
    computedDiscount || Number(invoice?.discountAmount) || 0;

  return (
    <div className="text-sm text-slate-800">
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <svg width="44" height="44" viewBox="0 0 60 80" fill="none">
            <path
              d="M30 3C17 3 6 12 6 23c0 9 3 16 7 23 4 8 5 18 7 27 1 4 4 6 7 4 2-2 2-8 3-8s1 6 3 8c3 2 6 0 7-4 2-9 3-19 7-27 4-7 7-14 7-23C54 12 43 3 30 3z"
              fill="#0ea5e9"
            />
          </svg>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">
              {clinic?.name || "Bright Smile Dental Clinic"}
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold tracking-wide">
              DENTAL CLINIC
            </p>
            <p className="text-[10px] text-slate-500">
              Healthy Smile, Healthy Life
            </p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            INVOICE
          </h2>
          <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
            <p>
              <span className="font-semibold">Invoice No.</span> :{" "}
              <span className="font-mono">{invoice?.invoiceNumber}</span>
            </p>
            <p>
              <span className="font-semibold">Invoice Date</span> :{" "}
              {invoice?.createdAt
                ? new Date(invoice.createdAt).toLocaleDateString(
                    "en-UG",
                    {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    },
                  )
                : "--"}
            </p>
            <p>
              <span className="font-semibold">Due Date</span> :{" "}
              {invoice?.dueDate
                ? new Date(invoice.dueDate).toLocaleDateString("en-UG", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })
                : "--"}
            </p>
          </div>
        </div>
      </div>

      {/* BILL TO / PATIENT */}
      <div className="grid grid-cols-2 gap-0 border-b border-slate-200">
        <div className="pr-6 border-r border-slate-200 py-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            BILL TO
          </h3>
          <p className="font-bold text-slate-800 text-sm">
            {patient
              ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() ||
                "John Doe"
              : "John Doe"}
          </p>
          {patient?.phone && (
            <p className="text-[11px] text-slate-500">{patient.phone}</p>
          )}
          <p className="text-[11px] text-slate-500">Kampala, Uganda</p>
        </div>
        <div className="pl-6 py-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            PATIENT
          </h3>
          <p className="font-bold text-slate-800 text-sm">
            {patient
              ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() ||
                "John Doe"
              : "John Doe"}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Patient ID: {patient?.patientCode ?? "--"}
          </p>
        </div>
      </div>

      {/* Line Items Table */}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="text-center py-1.5 text-slate-500 font-semibold w-8">
              #
            </th>
            <th className="text-left py-1.5 text-slate-500 font-semibold">
              DESCRIPTION
            </th>
            <th className="text-center py-1.5 text-slate-500 font-semibold w-16">
              QTY
            </th>
            <th className="text-right py-1.5 text-slate-500 font-semibold w-28">
              UNIT PRICE (UGX)
            </th>
            <th className="text-right py-1.5 text-slate-500 font-semibold w-24">
              DISCOUNT (UGX)
            </th>
            <th className="text-right py-1.5 text-slate-500 font-semibold w-28">
              AMOUNT (UGX)
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, idx: number) => {
            const lineSubtotal =
              Number(item.quantity) * Number(item.unitPrice);
            const lineDiscount = Number(item.discount) || 0;
            return (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-1.5 text-slate-600 text-center">
                  {idx + 1}
                </td>
                <td className="py-1.5">
                  <p className="text-slate-800 font-medium">
                    {item.description}
                  </p>
                  {item.notes && (
                    <p className="text-[10px] text-slate-500">{item.notes}</p>
                  )}
                </td>
                <td className="py-1.5 text-center text-slate-600">
                  {item.quantity}
                </td>
                <td className="py-1.5 text-right text-slate-600">
                  {fmt(lineSubtotal, invoice?.currency)}
                </td>
                <td className="py-1.5 text-right text-slate-600">
                  {lineDiscount > 0 ? fmt(lineDiscount, invoice?.currency) : "0"}
                </td>
                <td className="py-1.5 text-right font-semibold text-slate-800">
                  {fmt(item.total, invoice?.currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Bottom: Notes + Summary */}
      <div className="grid grid-cols-2 gap-0 border-t border-slate-200 mt-0">
        <div className="pr-6 border-r border-slate-200 py-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            Notes
          </h3>
          <div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {invoice?.notes ||
                "Thank you for trusting Bright Smile Dental Clinic. Please make payments to our clinic."}
            </p>
          </div>
        </div>
        <div className="pl-6 py-3 space-y-1.5">
          <div className="flex justify-between text-xs text-slate-600">
            <span>Subtotal</span>
            <span>{fmt(displaySubtotal, invoice?.currency)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-600">
            <span>Discount</span>
            <span>
              {displayDiscount
                ? `− ${fmt(displayDiscount, invoice?.currency)}`
                : "0"}
            </span>
          </div>
          <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-300 pt-2">
            <span>TOTAL</span>
            <span className="text-red-600">
              {fmt(invoice?.total ?? 0, invoice?.currency)}
            </span>
          </div>
          <div className="flex justify-between text-xs font-bold text-emerald-700">
            <span>Paid so far</span>
            <span>{fmt(invoice?.amountPaid ?? 0, invoice?.currency)}</span>
          </div>
          {(invoice?.balance ?? 0) > 0 && (
            <div className="flex justify-between text-sm font-bold text-red-600 bg-red-50 rounded px-2 py-1.5">
              <span>Balance due</span>
              <span>{fmt(invoice.balance, invoice.currency)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Clinic Details + Payment Information */}
      <div className="grid grid-cols-2 gap-0 border-t border-slate-200 mt-0">
        <div className="pr-6 border-r border-slate-200 py-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Clinic Details
          </h3>
          <div className="space-y-0.5 text-[10px] text-slate-500">
            <p>Plot 12, Kisementi Road,</p>
            <p>Kampala, Uganda</p>
            <p>Tel: +256 393 123456</p>
            <p>info@brightsmile.ug</p>
            <p>www.brightsmile.ug</p>
          </div>
        </div>
        <div className="pl-6 py-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Payment Information
          </h3>
          <div className="space-y-0.5 text-[10px] text-slate-500">
            <p>Bank: Stanbic Bank Uganda</p>
            <p>Account Name: Bright Smile Dental Clinic</p>
            <p>Account No: 903001234567</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center border-t border-slate-200 pt-4 mt-0">
        <p className="text-sm text-slate-600">Thank you for your visit!</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function VisitBillingPage() {
  const { visitId, patientId } = useParams<{
    visitId: string;
    patientId: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  // Void + currency-change are ADMIN_ONLY on the backend — hide them for
  // everyone else instead of surfacing a 403 on click.
  const { isAdmin, userRole } = usePermissions();
  const currentUserName = user?.staff
    ? `${user.staff.firstName} ${user.staff.lastName}`.trim()
    : (user?.email ?? undefined);
  const patientName = searchParams.get("patientName") ?? "";
  const visitCode = searchParams.get("visitCode") ?? "";

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [inputCurrency, setInputCurrency] = useState<string>(BASE_CURRENCY);
  const [activeTabInvoiceId, setActiveTabInvoiceId] = useState<string | null>(
    null,
  );

  // Inline draft rows (Odoo-style)
  type DraftRow = {
    tempId: string;
    serviceId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    originalUnitPrice: number;
    originalCurrency: string;
    originalExchangeRate: number;
    discountPct: number;
  };
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [savingDraftId, setSavingDraftId] = useState<string | null>(null);

  // Prescription toggle tracking: rxItemId -> invoiceItemId (when added)
  const [addedRxMap, setAddedRxMap] = useState<Record<string, string>>({});
  const [pendingRxActions, setPendingRxActions] = useState<Set<string>>(
    new Set(),
  );

  // Notes (local state, saved on "Save" click)
  const [draftNotes, setDraftNotes] = useState<string>("");
  const [notesSynced, setNotesSynced] = useState(true); // true = local matches DB

  // Error / success toast
  const [toastError, setToastError] = useState<string | null>(null);
  const [toastSuccess, setToastSuccess] = useState<string | null>(null);
  useEffect(() => {
    if (toastError) {
      const t = setTimeout(() => setToastError(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toastError]);
  useEffect(() => {
    if (toastSuccess) {
      const t = setTimeout(() => setToastSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toastSuccess]);

  // ── Queries ───────────────────────────────────────────────────────────────

  const {
    data: invoicesData,
    isLoading: invoicesLoading,
    refetch: refetchInvoices,
  } = useQuery<InvoiceListResponse>({
    queryKey: ["billing-invoices", visitId],
    queryFn: () => billingApi.getInvoices({ visitId: visitId! }),
    enabled: !!visitId,
  });

  const { data: rateData } = useQuery<{
    from: string;
    to: string;
    rate: number;
  }>({
    queryKey: ["exchange-rate", inputCurrency, BASE_CURRENCY],
    queryFn: () => billingApi.getExchangeRate(inputCurrency, BASE_CURRENCY),
    enabled: inputCurrency !== BASE_CURRENCY,
    staleTime: 5 * 60_000,
  });
  const currentExchangeRate =
    inputCurrency === BASE_CURRENCY ? 1 : (rateData?.rate ?? 1);

  // Fetch billing services catalogue
  const { data: allServicesData, isLoading: servicesLoading } =
    useQuery<ServiceListResponse>({
      queryKey: ["billing-services-all"],
      queryFn: () => billingApi.getServices({}),
      staleTime: 60_000,
    });
  const allServices: BillingService[] = allServicesData?.data ?? [];

  // Active services (used by inline draft-row product picker)
  const activeServices = allServices.filter((svc) => {
    return svc.isActive;
  });

  // Always fetch prescriptions
  const { data: visitPrescriptions, isLoading: rxLoading } = useQuery<
    PatientPrescription[]
  >({
    queryKey: ["visit-prescriptions", visitId],
    queryFn: async () => {
      const all = await prescriptionsApi.getByVisit(visitId!);
      return all
        .filter((p: any) => p.status === "ACTIVE")
        .map((p: any) => ({
          id: p.id,
          prescriptionCode: p.prescriptionCode,
          status: p.status,
          createdAt: p.createdAt,
          dentist: p.dentist,
          items: p.items.map((item: any) => ({
            id: item.id,
            drugId: item.drugId,
            drug: item.drug,
            quantity: item.quantity,
            dosage: item.dosage,
            frequency: item.frequency,
            sellPrice: Number(item.drug?.sellPrice ?? 0),
          })),
        }));
    },
    enabled: !!visitId,
    staleTime: 60_000,
  });

  // ── Derived state ─────────────────────────────────────────────────────────

  const invoices: Invoice[] = invoicesData?.data ?? [];
  const draftInvoices = invoices.filter((i) => i.status === "DRAFT");
  const postedInvoices = invoices.filter(
    (i) =>
      i.status === "POSTED" ||
      ["ACTIVE", "PARTIALLY_PAID", "ISSUED"].includes(i.status),
  );
  const primaryInvoice: Invoice | null =
    postedInvoices[0] ?? draftInvoices[0] ?? invoices[0] ?? null;

  React.useEffect(() => {
    if (!activeTabInvoiceId && invoices.length > 0)
      setActiveTabInvoiceId(invoices[0].id);
  }, [invoices, activeTabInvoiceId]);

  const selectedInvoice =
    invoices.find((i) => i.id === activeTabInvoiceId) ?? primaryInvoice;
  const isEditable =
    selectedInvoice &&
    ["DRAFT", "POSTED", "CLOSED"].includes(selectedInvoice.status);
  const displayStatus = selectedInvoice
    ? getDisplayStatus(selectedInvoice.status)
    : null;
  const paymentStatusLabel = selectedInvoice
    ? getPaymentStatusLabel(selectedInvoice)
    : null;

  // Keep the item-entry currency synced with the active invoice's currency,
  // so new items default to the invoice currency.
  React.useEffect(() => {
    if (
      selectedInvoice?.currency &&
      selectedInvoice.currency !== inputCurrency
    ) {
      setInputCurrency(selectedInvoice.currency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoice?.currency]);

  // Clear draft rows whenever the invoice currency changes, so users don't
  // accidentally submit an item with stale prices in the old currency.
  React.useEffect(() => {
    setDraftRows([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoice?.currency]);

  // Build prescription -> invoiceItem map from existing items on load
  React.useEffect(() => {
    if (!selectedInvoice || !visitPrescriptions) return;
    const items = (selectedInvoice as any).items ?? [];
    const map: Record<string, string> = {};
    for (const rx of visitPrescriptions) {
      for (const rxItem of rx.items) {
        const drugName = rxItem.drug?.name ?? "";
        const desc = `${drugName}${rxItem.drug?.form ? ` (${rxItem.drug.form})` : ""}${rxItem.drug?.strength ? ` ${rxItem.drug.strength}` : ""}`;
        const match = items.find(
          (i: any) => i.itemType === "PRESCRIPTION" && i.description === desc,
        );
        if (match) map[rxItem.id] = match.id;
      }
    }
    setAddedRxMap(map);
  }, [selectedInvoice?.id, selectedInvoice?.items, visitPrescriptions]);

  // Sync local notes from selected invoice
  React.useEffect(() => {
    if (selectedInvoice) {
      setDraftNotes(selectedInvoice.notes ?? "");
      setNotesSynced(true);
    }
  }, [selectedInvoice?.id, selectedInvoice?.notes]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["billing-invoices"] });
    qc.invalidateQueries({ queryKey: ["billing-ledger"] });
  }, [qc]);

  const activateMutation = useMutation({
    mutationFn: (invoiceId: string) => billingApi.activateInvoice(invoiceId),
    onSuccess: () => invalidate(),
  });

  const updateMetaMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { paymentTerms?: string; notes?: string };
    }) => billingApi.updateInvoiceMeta(id, data),
    onSuccess: () => invalidate(),
  });

  // Create a new draft invoice for this visit
  const createDraftMutation = useMutation({
    mutationFn: () =>
      billingApi.getOrCreateDraftInvoice({
        patientId: patientId!,
        visitId: visitId,
      }),
    onSuccess: (newInvoice) => {
      invalidate();
      setActiveTabInvoiceId(newInvoice.id);
      setToastSuccess("Draft invoice created");
    },
    onError: (err: any) => {
      setToastError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to create draft",
      );
    },
  });

  // Save draft — persists notes + paymentTerms
  const [isSaving, setIsSaving] = useState(false);
  async function saveDraft() {
    if (!selectedInvoice) return;
    setIsSaving(true);
    try {
      await billingApi.updateInvoiceMeta(selectedInvoice.id, {
        paymentTerms: selectedInvoice.paymentTerms ?? "CASH",
        notes: draftNotes,
      });
      setNotesSynced(true);
      invalidate();
      setToastSuccess("Invoice saved");
    } catch (err: any) {
      setToastError(
        err?.response?.data?.message || err?.message || "Failed to save",
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Remove invoice item
  const removeItemMutation = useMutation({
    mutationFn: ({
      invoiceId,
      itemId,
    }: {
      invoiceId: string;
      itemId: string;
    }) => billingApi.removeInvoiceItem(invoiceId, itemId),
    onSuccess: () => invalidate(),
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      billingApi.voidInvoice(id, reason, currentUserName),
    onSuccess: () => {
      invalidate();
      setShowVoidDialog(false);
    },
  });

  const changeCurrencyMutation = useMutation({
    mutationFn: ({ id, currency }: { id: string; currency: string }) =>
      billingApi.changeInvoiceCurrency(id, currency),
    onSuccess: (_data, vars) => {
      invalidate();
      setToastSuccess(`Currency updated to ${vars.currency}`);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to change currency";
      setToastError(msg);
    },
  });

  // ── Inline draft-row helpers (Odoo-style) ────────────────────────────────

  const ITEM_TYPE_MAP: Record<string, string> = {
    CONSULTATION: "CONSULTATION",
    LAB: "LAB",
    IMAGING: "XRAY",
    DRUG: "PRESCRIPTION",
    PHARMACY_SALE: "PRESCRIPTION",
    PROCEDURE: "OTHER",
    SERVICE: "OTHER",
    OTHER: "OTHER",
    TREATMENT_PROCEDURE: "TREATMENT_PROCEDURE",
    TREATMENT_PROCEDURE_SESSION: "TREATMENT_PROCEDURE_SESSION",
  };

  function appendDraftRow() {
    const tempId =
      (globalThis.crypto?.randomUUID?.() as string) ??
      `draft-${Date.now()}-${Math.random()}`;
    setDraftRows((prev) => [
      ...prev,
      {
        tempId,
        serviceId: "",
        description: "",
        quantity: 1,
        unitPrice: 0,
        originalUnitPrice: 0,
        originalCurrency: "",
        originalExchangeRate: 1,
        discountPct: 0,
      },
    ]);
  }

  function updateDraftRow(tempId: string, patch: Partial<DraftRow>) {
    setDraftRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)),
    );
  }

  function removeDraftRow(tempId: string) {
    setDraftRows((prev) => prev.filter((r) => r.tempId !== tempId));
  }

  /**
   * Convert any price into the active invoice's currency.
   * - svc.currency → base via svc.exchangeRate (falling back to the live rate
   *   when the service has none and is priced in the invoice currency)
   * - base → invoice via the LIVE invoice→base rate (rateData; inputCurrency
   *   is synced to the invoice currency). The stored invoice.exchangeRate is
   *   not trusted for this leg: legacy invoices hold 1 or the inverted
   *   (source→base) rate, and the Decimal(10,4) column can't represent
   *   UGX→USD (1/3700) without an ~11% rounding error.
   */
  function convertToInvoiceCurrency(
    price: number,
    fromCurrency: string,
    fromRate?: number | null, // rate from fromCurrency to base
  ): number {
    if (!selectedInvoice) return price;
    const base = selectedInvoice.baseCurrency ?? BASE_CURRENCY;
    const priceInBase =
      fromCurrency === base
        ? price
        : price *
          (Number(fromRate) ||
            (fromCurrency === inputCurrency ? currentExchangeRate : 1));
    if (selectedInvoice.currency === base) {
      return Math.round(priceInBase * 100) / 100;
    }
    const liveInvToBase = Number(rateData?.rate);
    const storedBaseToInv = Number(selectedInvoice.exchangeRate);
    // While the live rate loads, accept the stored header rate only when it
    // looks like a genuine base→invoice rate (a foreign-currency rate against
    // UGX is always < 1); legacy rows holding 1 or the inverted rate fall
    // through to no conversion rather than showing a wild number.
    const baseToInv =
      liveInvToBase > 0
        ? 1 / liveInvToBase
        : storedBaseToInv > 0 && storedBaseToInv < 1
          ? storedBaseToInv
          : 1;
    return Math.round(priceInBase * baseToInv * 100) / 100;
  }

  function onDraftServicePick(tempId: string, serviceId: string) {
    const svc = activeServices.find((s) => s.id === serviceId);
    if (!svc) {
      updateDraftRow(tempId, { serviceId: "", description: "", unitPrice: 0, originalUnitPrice: 0, originalCurrency: "", originalExchangeRate: 1 });
      return;
    }
    if (!selectedInvoice) return;
    const priceInInvoiceCurrency = convertToInvoiceCurrency(
      Number(svc.price) || 0,
      svc.currency,
      svc.exchangeRate,
    );
    updateDraftRow(tempId, {
      serviceId,
      description: svc.name,
      unitPrice: priceInInvoiceCurrency,
      originalUnitPrice: Number(svc.price),
      originalCurrency: svc.currency,
      originalExchangeRate: svc.exchangeRate ?? 1,
    });
  }

  async function saveDraftRow(draft: DraftRow) {
    if (!selectedInvoice || savingDraftId) return;
    const svc = activeServices.find((s) => s.id === draft.serviceId);
    if (!svc) {
      setToastError("Please choose a service first");
      return;
    }
    if (draft.quantity <= 0) {
      setToastError("Quantity must be greater than 0");
      return;
    }
    setSavingDraftId(draft.tempId);
    try {
      let finalUnitPrice = draft.originalUnitPrice ?? Number(svc.price);
      const finalCurrency = draft.originalCurrency || svc.currency;
      const finalRate = draft.originalExchangeRate ?? svc.exchangeRate ?? 1;

      if (svc) {
        const svcDisplay = convertToInvoiceCurrency(
          Number(svc.price),
          svc.currency,
          svc.exchangeRate,
        );
        if (
          draft.originalUnitPrice != null &&
          Math.abs(Number(draft.unitPrice) - svcDisplay) > 0.005
        ) {
          const safeDisplay = svcDisplay || 1;
          const ratio = Number(draft.unitPrice) / safeDisplay;
          finalUnitPrice = Math.round(draft.originalUnitPrice * ratio * 100) / 100;
        }
      }

      const lineSubtotal = Number(draft.quantity) * finalUnitPrice;
      const discountAmount =
        (lineSubtotal * Number(draft.discountPct || 0)) / 100;
      await billingApi.addEncounterItem(selectedInvoice.id, {
        description: svc.name,
        itemType: ITEM_TYPE_MAP[svc.type] ?? "MANUAL",
        quantity: Number(draft.quantity),
        unitPrice: finalUnitPrice,
        currency: finalCurrency,
        exchangeRate: finalRate,
        discount: discountAmount > 0 ? discountAmount : undefined,
        notes: svc.serviceCode ?? undefined,
      });
      removeDraftRow(draft.tempId);
      invalidate();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message || err?.message || "Failed to add item";
      setToastError(msg);
    } finally {
      setSavingDraftId(null);
    }
  }

  // ── Prescription toggle ───────────────────────────────────────────────────

  async function toggleRxItem(rxItem: RxItem, rx: PatientPrescription) {
    if (!selectedInvoice || pendingRxActions.has(rxItem.id)) return;

    const isCurrentlyAdded = !!addedRxMap[rxItem.id];
    setPendingRxActions((prev) => new Set(prev).add(rxItem.id));

    try {
      if (isCurrentlyAdded) {
        // UNCHECK -> remove from invoice
        const invoiceItemId = addedRxMap[rxItem.id];
        if (invoiceItemId) {
          await billingApi.removeInvoiceItem(selectedInvoice.id, invoiceItemId);
          setAddedRxMap((prev) => {
            const n = { ...prev };
            delete n[rxItem.id];
            return n;
          });
          invalidate();
        }
      } else {
        // CHECK -> add to invoice.
        // Drug sell prices are stored in the clinic BASE currency (UGX), so we
        // always tag the item as BASE_CURRENCY and let the backend project it
        // into the invoice currency at the invoice's exchange rate. (Previously
        // this sent the raw UGX number tagged as the invoice currency, so a UGX
        // drug added to a USD invoice was charged as USD — no conversion.)
        const unitPrice = Number(
          rxItem.drug?.sellPrice ?? rxItem.sellPrice ?? 0,
        );
        const desc = `${rxItem.drug?.name ?? "Unknown Drug"}${rxItem.drug?.form ? ` (${rxItem.drug.form})` : ""}${rxItem.drug?.strength ? ` ${rxItem.drug.strength}` : ""}`;
        await billingApi.addEncounterItem(selectedInvoice.id, {
          description: desc,
          itemType: "PRESCRIPTION",
          quantity: rxItem.quantity,
          unitPrice,
          currency: BASE_CURRENCY,
          notes:
            `${rx.prescriptionCode} ${rxItem.dosage ?? ""} ${rxItem.frequency ?? ""}`.trim(),
          prescriptionItemId: rxItem.id,
        });
        // Refetch to get the new item ID so we can map it for unchecking
        const freshInvoices = await qc.fetchQuery<InvoiceListResponse>({
          queryKey: ["billing-invoices", visitId],
          queryFn: () => billingApi.getInvoices({ visitId: visitId! }),
        });
        const freshInv = freshInvoices.data?.find(
          (i: Invoice) => i.id === selectedInvoice.id,
        );
        if (freshInv) {
          const match = ((freshInv as any).items ?? []).find(
            (i: any) => i.itemType === "PRESCRIPTION" && i.description === desc,
          );
          if (match)
            setAddedRxMap((prev) => ({ ...prev, [rxItem.id]: match.id }));
        }
        invalidate();
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to toggle prescription";
      setToastError(msg);
      console.error("Failed to toggle prescription:", err);
    } finally {
      setPendingRxActions((prev) => {
        const n = new Set(prev);
        n.delete(rxItem.id);
        return n;
      });
    }
  }

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (!visitId || !patientId) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <p>Missing visit or patient information.</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
      {/* ── Toasts ─────────────────────────────────────────────────── */}
      {toastError && (
        <div className="fixed top-4 right-4 z-[60] bg-red-50 border border-red-200 rounded-lg px-4 py-3 shadow-lg flex items-start gap-2 max-w-sm">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-xs text-red-600 mt-0.5">{toastError}</p>
          </div>
          <button
            onClick={() => setToastError(null)}
            className="text-red-400 hover:text-red-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {toastSuccess && (
        <div className="fixed top-4 right-4 z-[60] bg-green-50 border border-green-200 rounded-lg px-4 py-3 shadow-lg flex items-start gap-2 max-w-sm">
          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">{toastSuccess}</p>
          </div>
          <button
            onClick={() => setToastSuccess(null)}
            className="text-green-400 hover:text-green-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-5 py-2 flex items-center gap-4 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-blue-600" />
          <h1 className="text-sm font-bold text-slate-800">
            Check-out & Billing
          </h1>
        </div>
        {(patientName || visitCode) && (
          <>
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-3 text-sm">
              {patientName && (
                <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  {patientName}
                </span>
              )}
              {visitCode && (
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-mono text-xs">
                  {visitCode}
                </span>
              )}
            </div>
          </>
        )}
        {invoices.length > 1 && (
          <div className="ml-auto">
            <select
              value={selectedInvoice?.id ?? ""}
              onChange={(e) => setActiveTabInvoiceId(e.target.value)}
              className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600"
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} · {getDisplayStatus(inv.status)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Main content — single-column invoice document ────────────── */}
      <div className="flex-1 overflow-y-auto p-1">
        {selectedInvoice ? (
          <div className="max-w-7xl mx-auto bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* ── HEADER ──────────────────────────────────────────────── */}
            <div className="px-7 pt-1 pb-1 border-b border-slate-100">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                    <span>Customer Invoice: </span>{" "}
                    {selectedInvoice.invoiceNumber}
                  </h2>
                  {/* <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className={cn(
                        "px-2.5 py-0.5 rounded text-xs font-semibold border",
                        displayStatus === "Draft"
                          ? "bg-slate-100 text-slate-600 border-slate-300"
                          : displayStatus === "Void"
                            ? "bg-red-50 text-red-600 border-red-200"
                            : "bg-blue-50 text-blue-700 border-blue-200",
                      )}
                    >
                      {displayStatus}
                    </span>
                    {displayStatus !== "Void" && (
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded text-xs font-semibold border",
                          paymentStatusLabel === "Paid"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : paymentStatusLabel === "Partially Paid"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-50 text-slate-500 border-slate-200",
                        )}
                      >
                        {paymentStatusLabel}
                      </span>
                    )}
                  </div> */}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedInvoice.status === "DRAFT" && (
                    <>
                      <button
                        onClick={saveDraft}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}{" "}
                        Save
                      </button>
                      <button
                        onClick={() =>
                          activateMutation.mutate(selectedInvoice.id)
                        }
                        disabled={
                          activateMutation.isPending ||
                          !(selectedInvoice as any).items?.length
                        }
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                      >
                        {activateMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}{" "}
                        Post Invoice
                      </button>
                    </>
                  )}
                  {selectedInvoice.status !== "VOID" &&
                    Number(selectedInvoice.balance ?? 0) > 0 && (
                      <button
                        onClick={() => setShowPayment(true)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Receive{" "}
                        {formatCurrency(
                          Number(selectedInvoice.balance ?? 0),
                          selectedInvoice.currency,
                        )}
                      </button>
                    )}
                  {selectedInvoice.status !== "VOID" && (
                    <button
                      onClick={() => setShowReceipt(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print Invoice
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                  {isAdmin &&
                    ["DRAFT", "POSTED", "CLOSED"].includes(
                    selectedInvoice.status,
                  ) && (
                    <button
                      onClick={() => setShowVoidDialog(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-red-600 text-white text-sm hover:bg-red-50"
                    >
                      <Ban className="w-3.5 h-3.5" /> Void
                    </button>
                  )}
                </div>
              </div>
              </div>
            </div>

              {selectedInvoice.status === "VOID" && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Ban className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-semibold text-red-700">
                      Invoice Voided
                    </span>
                  </div>
                  {selectedInvoice.voidReason && (
                    <p className="text-xs text-red-600 ml-6">
                      Reason: {selectedInvoice.voidReason}
                    </p>
                  )}
                </div>
              )}

              {/* Patient + meta grid */}
              <div className="mt-2 grid grid-cols-2 gap-0 border-t border-slate-100 pt-5">
                {/* Left — Customer */}
                {/* Left — Customer */}

                {/* Left — Customer & Statuses */}
                <div className="pl-3 pr-8 border-r border-slate-100 space-y-2">
                  {/* Customer (inline label + value) */}
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm text-slate-600 font-semibold tracking-wide w-32 shrink-0">
                      Customer
                    </p>
                    <div>
                      <p className="text-sm font-semibold text-slate-700 uppercase leading-tight">
                        {(selectedInvoice as any).patient
                          ? `${(selectedInvoice as any).patient.firstName} ${(selectedInvoice as any).patient.lastName}`
                          : patientName}
                      </p>
                      {(selectedInvoice as any).patient?.patientCode && (
                        <p className="text-[12px] font-mono text-slate-400">
                          {(selectedInvoice as any).patient.patientCode}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Invoice Status (inline label + badge) */}
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-600 font-semibold tracking-wide w-32 shrink-0">
                      Invoice Status
                    </p>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-[14px] font-semibold border",
                        displayStatus === "Draft"
                          ? "bg-slate-100 text-slate-600 border-slate-300"
                          : displayStatus === "Void"
                            ? "bg-red-50 text-red-600 border-red-200"
                            : "bg-blue-50 text-blue-700 border-blue-200",
                      )}
                    >
                      {displayStatus.toUpperCase()}
                    </span>
                  </div>

                  {/* Payment Status (inline label + badge) */}
                  {displayStatus !== "Void" && paymentStatusLabel && (
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-slate-600 font-semibold tracking-wide w-32 shrink-0">
                        Payment Status
                      </p>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[14px] font-semibold border",
                          paymentStatusLabel === "Paid"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : paymentStatusLabel === "Partially Paid"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-50 text-slate-500 border-slate-200",
                        )}
                      >
                        {paymentStatusLabel}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right — Invoice details */}
                <div className="pl-8 space-y-2.5">
                  {/* <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                    Invoice details
                  </p> */}

                  {/* Invoice Date */}
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm text-slate-600 w-32 shrink-0">
                      Invoice Date
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {selectedInvoice.createdAt
                        ? new Date(
                            selectedInvoice.createdAt,
                          ).toLocaleDateString("en-UG", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "--"}
                    </p>
                  </div>

                  {/* Currency — changing this re-converts everything on the invoice */}
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm text-slate-600 w-32 shrink-0">
                      Currency
                    </p>
                    {isEditable && (isAdmin || userRole === UserRole.DENTIST || userRole === UserRole.RECEPTIONIST) ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedInvoice.currency}
                          disabled={changeCurrencyMutation.isPending}
                          onChange={(e) => {
                            const newCur = e.target.value;
                            if (newCur === selectedInvoice.currency) return;
                            const hasItems =
                              ((selectedInvoice as any).items ?? []).length > 0;
                            const paid =
                              Number(selectedInvoice.amountPaid ?? 0) > 0;
                            const msg = hasItems
                              ? `Change invoice currency to ${newCur}? All ${
                                  ((selectedInvoice as any).items ?? []).length
                                } item(s)${paid ? ", payments" : ""} and totals will be reconverted at the current exchange rate.`
                              : `Change invoice currency to ${newCur}?`;
                            if (window.confirm(msg)) {
                              changeCurrencyMutation.mutate({
                                id: selectedInvoice.id,
                                currency: newCur,
                              });
                            }
                          }}
                          className="text-base font-semibold text-blue-600 border-0 border-b border-dashed border-blue-300 bg-transparent focus:outline-none cursor-pointer disabled:opacity-50"
                        >
                          {(
                            Object.keys(CURRENCY_CONFIG as any) as string[]
                          ).map((cur) => (
                            <option key={cur} value={cur}>
                              {cur}
                            </option>
                          ))}
                        </select>
                        {changeCurrencyMutation.isPending && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                        )}
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-slate-800">
                        {selectedInvoice.currency}
                      </p>
                    )}
                  </div>

                  {/* Totals strip */}
                  <div className="mt-2 pt-3 border-t border-slate-100 grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-slate-400 mb-0.5">
                        Total Bill
                      </p>
                      <p className="text-base font-bold text-slate-900">
                        {formatCurrency(
                          Number(selectedInvoice.total ?? 0),
                          selectedInvoice.currency,
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-400 mb-0.5">Paid</p>
                      <p className="text-base font-bold text-green-600">
                        {formatCurrency(
                          Number(selectedInvoice.amountPaid ?? 0),
                          selectedInvoice.currency,
                        )}
                      </p>
                    </div>

                    {/* {Number(selectedInvoice.balance ?? 0) > 0.01 && ( */}
                    <div>
                      <p className="text-sm text-slate-400 mb-0.5">
                        Balance Due
                      </p>
                      <p className="text-base font-bold text-red-600">
                        {formatCurrency(
                          Number(selectedInvoice.balance),
                          selectedInvoice.currency,
                        )}
                      </p>
                    </div>
                    {/* )} */}
                </div>
              </div>
              </div>

            {/* ── INVOICE ITEMS TABLE ─────────────────────────────────── */}
            <div className="px-4 pt-2">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-slate-700">
                  Invoice Items
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                  {((selectedInvoice as any).items ?? []).length} item(s)
                </span>
                {isEditable &&
                  selectedInvoice.status !== "POSTED" &&
                  selectedInvoice.status !== "VOID" && (
                    <button
                      onClick={appendDraftRow}
                      className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Items
                    </button>
                  )}
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left text-xs font-semibold text-slate-500 p-3 w-[30%]">
                        Product
                      </th>
                      <th className="text-center text-xs font-semibold text-slate-500 p-3 w-[14%]">
                        Type
                      </th>
                      <th className="text-right text-xs font-semibold text-slate-500 p-3 w-[10%]">
                        Qty
                      </th>
                      <th className="text-right text-xs font-semibold text-slate-500 p-3 w-[18%]">
                        Unit Price({selectedInvoice.currency})
                      </th>
                      <th className="text-right text-xs font-semibold text-slate-500 p-3 w-[10%]">
                        Discount({selectedInvoice.currency})
                      </th>
                      <th className="text-right text-xs font-semibold text-slate-500">
                        Amount({selectedInvoice.currency})
                      </th>
                      {isEditable && <th className="w-[4%]"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Existing invoice items */}
                    {((selectedInvoice as any).items ?? []).map((item: any) => {
                      const canRemove = isEditable;
                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/60 group"
                        >
                          <td className="p-3">
                            <span className="text-slate-800">
                              {item.description}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {item.itemType && (
                              <span
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center",
                                  item.itemType === "PRESCRIPTION"
                                    ? "bg-green-50 text-green-600 border-green-200"
                                    : item.itemType === "TREATMENT_PROCEDURE"
                                      ? "bg-purple-50 text-purple-600 border-purple-200"
                                      : "bg-slate-100 text-slate-400 border-slate-200",
                                )}
                              >
                                {item.itemType}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right text-slate-600">
                            {item.quantity}
                          </td>
                          <td className="p-3 text-right text-slate-600">
                            {formatCurrency(
                              Number(item.unitPrice),
                              selectedInvoice.currency,
                            )}
                          </td>
                          <td className="p-3 text-right text-slate-500">
                            {Number(item.discount) > 0
                              ? formatCurrency(
                                  Number(item.discount),
                                  selectedInvoice.currency,
                                )
                              : "0"}
                          </td>
                          <td className="p-3 text-right font-semibold text-slate-800">
                            {formatCurrency(
                              Number(item.total),
                              selectedInvoice.currency,
                            )}
                          </td>
                          {isEditable && (
                            <td className="p-3">
                              {canRemove && (
                                <button
                                  onClick={() =>
                                    removeItemMutation.mutate({
                                      invoiceId: selectedInvoice.id,
                                      itemId: item.id,
                                    })
                                  }
                                  disabled={removeItemMutation.isPending || selectedInvoice.status =="POSTED" || selectedInvoice.status =="VOID"}
                                  className="opacity-100 group-hover:opacity-100 p-1 rounded bg-red-50 text-red-500"
                                  title="Remove"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}

                    {/* ── Inline draft rows (Odoo-style) ───────────── */}
                    {isEditable &&
                      draftRows.map((draft) => {
                        const lineSubtotal =
                          Number(draft.quantity) * Number(draft.unitPrice);
                        const discountAmount =
                          (lineSubtotal * Number(draft.discountPct || 0)) / 100;
                        const lineTotal = lineSubtotal - discountAmount;
                        const isSaving = savingDraftId === draft.tempId;
                        return (
                          <tr
                            key={draft.tempId}
                            className="bg-blue-50/40 hover:bg-blue-50/70"
                          >
                            {/* Product picker */}
                            <td className="p-2">
                              <select
                                value={draft.serviceId}
                                onChange={(e) =>
                                  onDraftServicePick(
                                    draft.tempId,
                                    e.target.value,
                                  )
                                }
                                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-400 focus:outline-none"
                                autoFocus
                              >
                                <option value="">
                                  {servicesLoading
                                    ? "Loading services…"
                                    : "Select item…"}
                                </option>
                                {activeServices.map((svc) => {
                                  const previewPrice = convertToInvoiceCurrency(
                                    Number(svc.price) || 0,
                                    svc.currency,
                                    svc.exchangeRate,
                                  );
                                  return (
                                    <option key={svc.id} value={svc.id}>
                                      {svc.name}
                                      {svc.serviceCode
                                        ? ` (${svc.serviceCode})`
                                        : ""}
                                      {" — "}
                                      {formatCurrency(
                                        previewPrice,
                                        selectedInvoice.currency,
                                      )}
                                    </option>
                                  );
                                })}
                              </select>
                            </td>
                            {/* Qty */}
                            <td className="p-2">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={draft.quantity}
                                onChange={(e) =>
                                  updateDraftRow(draft.tempId, {
                                    quantity: Math.max(
                                      0,
                                      Number(e.target.value) || 0,
                                    ),
                                  })
                                }
                                className="w-full px-2 py-1.5 text-sm text-right border border-slate-200 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />
                            </td>
                            {/* Unit Price */}
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={draft.unitPrice}
                                onChange={(e) =>
                                  updateDraftRow(draft.tempId, {
                                    unitPrice: Math.max(
                                      0,
                                      Number(e.target.value) || 0,
                                    ),
                                  })
                                }
                                className="w-full px-2 py-1.5 text-sm text-right border border-slate-200 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />
                            </td>
                            {/* Disc% */}
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={draft.discountPct}
                                onChange={(e) =>
                                  updateDraftRow(draft.tempId, {
                                    discountPct: Math.min(
                                      100,
                                      Math.max(0, Number(e.target.value) || 0),
                                    ),
                                  })
                                }
                                className="w-full px-2 py-1.5 text-sm text-right border border-slate-200 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />
                            </td>
                            {/* Computed total */}
                            <td className="p-3 text-right font-semibold text-slate-800">
                              {formatCurrency(
                                Math.max(0, lineTotal),
                                selectedInvoice.currency,
                              )}
                            </td>
                            {/* Actions */}
                            <td className="p-2">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => saveDraftRow(draft)}
                                  disabled={
                                    isSaving ||
                                    !draft.serviceId ||
                                    draft.quantity <= 0
                                  }
                                  className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
                                  title="Save row"
                                >
                                  {isSaving ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => removeDraftRow(draft.tempId)}
                                  disabled={isSaving}
                                  className="p-1 rounded hover:bg-red-50 hover:text-red-500 text-slate-400"
                                  title="Discard row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                 </button>
                               </div>
                             </td>
                           </tr>
                         );
                      })}

                    {/* Empty state */}
                    {((selectedInvoice as any).items ?? []).length === 0 &&
                      draftRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={isEditable ? 6 : 5}
                            className="py-6 text-center text-slate-400 text-sm"
                          >
                            <FileText className="w-5 h-5 mx-auto mb-1 opacity-20" />{" "}
                            No items yet — click{" "}
                            <span className="font-medium text-blue-600">
                              Add Items
                            </span>{" "}
                            to start
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Catalogue section removed — now inline in Invoice Items header */}

            {/* ── PRESCRIPTIONS SECTION ───────────────────────────────── */}
            {isEditable && (
              <div className="px-7 pt-5">
                <div className="flex items-center gap-2 mb-3">
                  <Pill className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-semibold text-slate-700">
                    Prescriptions
                  </span>
                  {visitPrescriptions && visitPrescriptions.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 font-medium">
                      {visitPrescriptions.reduce(
                        (s, rx) => s + rx.items.length,
                        0,
                      )}{" "}
                      drug(s)
                    </span>
                  )}
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-center text-xs font-semibold text-slate-500 p-3 w-[6%]">
                          Add
                        </th>
                        <th className="text-left text-xs font-semibold text-slate-500 p-3 w-[38%]">
                          Medication
                        </th>
                        <th className="text-right text-xs font-semibold text-slate-500 p-3 w-[10%]">
                          Qty
                        </th>
                        <th className="text-right text-xs font-semibold text-slate-500 p-3 w-[18%]">
                          Unit Price(UGX)
                        </th>
                        <th className="text-right text-xs font-semibold text-slate-500 p-3 w-[10%]">
                          Discount(UGX)
                        </th>
                        <th className="text-right text-xs font-semibold text-slate-500 p-3 w-[18%]">
                          Amount(UGX)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rxLoading ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center">
                            <Spinner />
                          </td>
                        </tr>
                      ) : !visitPrescriptions?.length ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-2 text-center text-slate-400 text-sm"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Pill className="w-4 h-4 text-slate-400" />
                              No active prescriptions for this visit
                            </span>
                          </td>
                        </tr>
                      ) : (
                        visitPrescriptions.flatMap((rx) =>
                          rx.items.map((item) => {
                            const unitPrice = Number(
                              item.drug?.sellPrice ?? item.sellPrice ?? 0,
                            );
                            const total = unitPrice * item.quantity;
                            const isAdded = !!addedRxMap[item.id];
                            const isPending = pendingRxActions.has(item.id);
                            return (
                              <tr
                                key={item.id}
                                className={cn(
                                  "transition-colors",
                                  isAdded && "bg-green-50/40",
                                )}
                              >
                                {/* <td className="p-3 text-center">
                                  {isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-blue-500 mx-auto" />
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={isAdded}
                                      onChange={() => toggleRxItem(item, rx)}
                                      className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500 cursor-pointer"
                                    />
                                  )}
                                </td> */}

                                <td className="p-3 text-center">
                                  {isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-blue-500 mx-auto" />
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={isAdded}
                                      disabled={!isEditable || selectedInvoice.status =="POSTED" } // ← disables when not editable (e.g. POSTED)
                                      onChange={() => toggleRxItem(item, rx)}
                                      className={cn(
                                        "w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500",
                                        isEditable
                                          ? "cursor-pointer"
                                          : "cursor-not-allowed opacity-60", // visual cue
                                      )}
                                    />
                                  )}
                                </td>

                                <td className="p-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-800 font-medium">
                                      {item.drug?.name ?? "Unknown"}
                                    </span>
                                    {item.drug?.form && (
                                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                        {item.drug.form}
                                      </span>
                                    )}
                                    {item.drug?.strength && (
                                      <span className="text-[10px] text-slate-400">
                                        {item.drug.strength}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    <span className="font-mono">
                                      {rx.prescriptionCode}
                                    </span>
                                    {item.dosage && <> · {item.dosage}</>}
                                    {item.frequency && <> · {item.frequency}</>}
                                  </div>
                                </td>
                                <td className="p-3 text-right text-slate-600">
                                  {item.quantity}
                                </td>
                                <td className="p-3 text-right text-slate-600">
                                  {formatCurrency(unitPrice, BASE_CURRENCY)}
                                </td>
                                <td className="p-3 text-right text-slate-500">
                                  --
                                </td>
                                <td className="p-3 text-right font-semibold text-slate-800">
                                  {formatCurrency(total, BASE_CURRENCY)}
                                </td>
                              </tr>
                            );
                          }),
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TOTALS ──────────────────────────────────────────────── */}
            <div className="px-7 py-5 flex justify-end border-t border-slate-100 mt-5">
              <div className="w-72 space-y-1.5 text-sm">
                {Number(selectedInvoice.discountAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Discount:</span>
                    <span>
                      -
                      {formatCurrency(
                        Number(selectedInvoice.discountAmount),
                        selectedInvoice.currency,
                      )}
                    </span>
                  </div>
                )}
                {Number(selectedInvoice.taxAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax ({selectedInvoice.taxPercent}%):</span>
                    <span>
                      {formatCurrency(
                        Number(selectedInvoice.taxAmount),
                        selectedInvoice.currency,
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base text-slate-900 border-t border-slate-200 pt-2 mt-1">
                  <span>Total:</span>
                  <span>
                    {formatCurrency(
                      Number(selectedInvoice.total ?? 0),
                      selectedInvoice.currency,
                    )}
                  </span>
                </div>
                {Number(selectedInvoice.amountPaid ?? 0) > 0 && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>Amount Paid:</span>
                    <span>
                      {formatCurrency(
                        Number(selectedInvoice.amountPaid),
                        selectedInvoice.currency,
                      )}
                    </span>
                  </div>
                )}
                {Number(selectedInvoice.balance ?? 0) > 0.01 && (
                  <div className="flex justify-between font-semibold text-amber-700">
                    <span>Balance Due:</span>
                    <span>
                      {formatCurrency(
                        Number(selectedInvoice.balance),
                        selectedInvoice.currency,
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Receipts list ────────────────────────────────────────── */}
            {/* ── PAYMENT HISTORY / RECEIPTS SECTION ─────────────────── */}
            <div className="px-7 py-5 border-t border-slate-200 bg-slate-50/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-slate-500" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                    Receipts History
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-semibold">
                    {((selectedInvoice as any).receipts ?? []).length}
                  </span>
                </div>
              </div>

              {((selectedInvoice as any).receipts ?? []).length === 0 && (
                <div className="py-3 text-center text-slate-400 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-slate-400" />
                    No Receipts Available
                  </span>
                </div>
              )}

              {((selectedInvoice as any).receipts ?? []).length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 border-b border-slate-200">
          <tr>
            <th className="text-left text-xs font-semibold text-slate-600 px-4 py-3 w-[10%]">
              #
            </th>
            <th className="text-left text-xs font-semibold text-slate-600 px-4 py-3 w-[20%]">
              Date
            </th>
            <th className="text-left text-xs font-semibold text-slate-600 px-4 py-3 w-[25%]">
              Payment Method
            </th>
            <th className="text-left text-xs font-semibold text-slate-600 px-4 py-3 w-[25%]">
              Reference
            </th>
            <th className="text-right text-xs font-semibold text-slate-600 px-4 py-3 w-[20%]">
              Amount
            </th>
            <th className="text-right text-xs font-semibold text-slate-600 px-4 py-3 w-[10%]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {((selectedInvoice as any).receipts ?? []).map((r: any, index: number) => {
            const receivedByLabel = r.receivedBy
              ? `${r.receivedBy.firstName} ${r.receivedBy.lastName}`
              : (r.receivedByName ?? "Unknown");
            const paymentMethod = r.method 
              ? r.method.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
              : "Cash";
            const isVoid = r.status === "VOID";

            const cleanDateString = r.generatedAt.replace(/Z(\d{2}:\d{2})$/, '+$1')
            
            return (
              <tr 
                key={r.id} 
                className={cn(
                  "transition-colors hover:bg-slate-50",
                  isVoid && "bg-red-50/30"
                )}
              >
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                  {index + 1}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-sm font-medium",
                      isVoid ? "text-slate-400 line-through" : "text-slate-700"
                    )}>
                      {r.generatedAt 
                        ? new Date(r.generatedAt).toLocaleDateString("en-UG", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "--"}

                        {cleanDateString
  ? new Date(cleanDateString).toLocaleTimeString("en-UG", {
      hour: "2-digit",
      minute: "2-digit",
    })
  : ""}
                    </span>
                    
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium",
                      isVoid 
                        ? "bg-slate-100 text-slate-400"
                        : paymentMethod.toLowerCase().includes("cash")
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : paymentMethod.toLowerCase().includes("mobile") || paymentMethod.toLowerCase().includes("money")
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : paymentMethod.toLowerCase().includes("card")
                        ? "bg-purple-50 text-purple-700 border border-purple-200"
                        : "bg-slate-50 text-slate-600 border border-slate-200"
                    )}>
                      {paymentMethod}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-sm font-mono",
                      isVoid ? "text-slate-400 line-through" : "text-slate-700"
                    )}>
                      {r.receiptNumber || "--"}
                    </span>
                    {r.reference && (
                      <span className="text-[11px] text-slate-400">
                        Ref: {r.reference}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      by {receivedByLabel}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end">
                    <span className={cn(
                      "text-sm font-bold",
                      isVoid 
                        ? "text-slate-400 line-through" 
                        : "text-green-600"
                    )}>
                      {formatCurrency(
                        Number(r.amountReceived),
                        r.currencyCode ?? selectedInvoice.currency,
                      )}
                    </span>
                    {isVoid && (
                      <span className="text-[10px] text-red-500 font-medium mt-0.5">
                        Voided
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => navigate(`/receipts/${r.id}`)}
                    title="View receipt detail"
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </td>

              </tr>
            );
          })}
        </tbody>
      </table>
                </div>
              )}

              {/* Payment Summary Footer */}
              <div className="mt-4 flex flex-col items-end justify-end gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Total Paid:</span>
                  <span className="text-base font-bold text-green-600">
                    {formatCurrency(
                      ((selectedInvoice as any).receipts ?? [])
                        .filter((r: any) => r.status !== "VOID")
                        .reduce((sum: number, r: any) => sum + Number(r.amountReceived), 0),
                      selectedInvoice.currency,
                    )}
                  </span>
                </div>
                {Number(selectedInvoice.balance ?? 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Remaining Balance:</span>
                    <span className="text-base font-bold text-amber-600">
                      {formatCurrency(
                        Number(selectedInvoice.balance),
                        selectedInvoice.currency,
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-16 text-slate-400">
            {invoicesLoading ? (
              <Loader2 className="w-8 h-8 animate-spin opacity-30" />
            ) : (
              <>
                <Receipt className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm font-medium text-slate-500">
                  No invoice for this visit
                </p>
                <p className="text-xs mt-1 mb-4">
                  Create a draft invoice to start adding items
                </p>
                <button
                  onClick={() => createDraftMutation.mutate()}
                  disabled={createDraftMutation.isPending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {createDraftMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Create Invoice
                </button>
              </>
            )}
           </div>
            )}

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {selectedInvoice && (
        <>
          <PaymentDialog
            open={showPayment}
            onClose={() => setShowPayment(false)}
            invoice={selectedInvoice}
            onSuccess={() => {
              qc.invalidateQueries({ queryKey: ["billing-invoices"] });
              refetchInvoices();
            }}
          />
          <ReceiptModal
            open={showReceipt}
            onClose={() => setShowReceipt(false)}
            invoiceId={selectedInvoice.id}
          />
          {showVoidDialog && (
            <VoidInvoiceDialog
              invoice={selectedInvoice}
              onClose={() => setShowVoidDialog(false)}
              onConfirm={(reason) =>
                voidMutation.mutate({ id: selectedInvoice.id, reason })
              }
              isPending={voidMutation.isPending}
            />
          )}
        </>
      )}
    </div>
    </div>
  );
}
