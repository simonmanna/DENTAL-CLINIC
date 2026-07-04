// src/pages/purchases/PurchaseDetailPage.tsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  Truck,
  CreditCard,
  CheckCircle2,
  Package,
  Pill,
  FileText,
  Calendar,
  MapPin,
  // User,
  Hash,
  AlertCircle,
  ChevronRight,
  Info,
  X,
  ChevronDown,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  usePurchaseOrder,
  useSubmitPurchaseOrder,
  useApprovePurchaseOrder,
  useCancelPurchaseOrder,
} from "@/hooks/usePurchase";
import { RecordDeliveryModal } from "./components/PurchaseModals";
import { PaymentHistory } from "@/components/payments/PaymentHistory";
import { accountsApi, usersApi } from "@/lib/api/expenses";
import type { Account, User } from "@/types/expenses";

const STEPS = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "PARTIALLY_RECEIVED",
  "FULLY_RECEIVED",
];

const PAY_METHODS = ["CASH", "BANK_TRANSFER", "MTN_MOBILE_MONEY", "AIRTEL_MONEY", "CHEQUE"];

function formatUGX(amount: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function staffName(user?: { staff?: { firstName: string; lastName: string } } | null) {
  if (!user?.staff) return "—";
  return `${user.staff.firstName} ${user.staff.lastName}`;
}

function userDisplayName(user: User) {
  if (user.staff) {
    return `${user.staff.firstName} ${user.staff.lastName}`;
  }
  return user.email;
}

// ─── Record Payment Modal (mirrors Expenses PayExpenseDialog) ──────────────
// ─── Record Payment Modal (matches backend CreatePaymentDto) ───────────────
import { api } from "@/lib/api/client"; // uses your axios instance with auth interceptor
import { UserCheck } from "lucide-react";

function RecordPaymentModal({
  po,
  accounts,
  users,
  onClose,
  onSaved,
}: {
  po: any;
  accounts: Account[];
  users: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    amount: String(po.balance || 0),
    method: "BANK_TRANSFER",
    reference: "",
    paidBy: "",
    accountId: accounts[0]?.id ?? "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handlePay = async () => {
    if (!form.paidBy) return setError("Please select who is processing this payment");
    if (!form.accountId) return setError("Select an account");
    if (!form.amount || +form.amount <= 0) return setError("Enter a valid amount greater than 0");
    if (+form.amount > po.balance) return setError("Amount cannot exceed remaining balance");

    setSaving(true);
    setError("");
    try {
      await api.post("/payments", {
        type: "PURCHASE_ORDER",
        sourceId: po.id,                 // ← backend expects this
        amount: parseFloat(form.amount),
        method: form.method,             // ← backend field name
        paidBy: form.paidBy,
        accountId: form.accountId,
        reference: form.reference || undefined,
        notes: form.notes || undefined,  // ← backend field name
      });

      onSaved();
    } catch (e: any) {
      const msg = e.response?.data?.message || e.message || "Failed to record payment";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === form.accountId);
  const canSubmit =
    form.paidBy &&
    form.accountId &&
    +form.amount > 0 &&
    +form.amount <= po.balance;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header — styled like Expenses PayExpenseDialog */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Process Payment</h2>
            <p className="text-xs text-slate-400 mt-0.5">Record cash-out and mark as paid</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Summary Card — slate gradient like Expenses */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase">Paying</p>
                <p className="font-semibold text-sm mt-0.5">{po.supplier?.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {po.poNumber}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 font-medium uppercase">Balance Due</p>
                <p className="text-2xl font-bold">{formatUGX(po.balance)}</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Amount (UGX) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">UGX</span>
              <input
                type="number"
                className="w-full pl-12 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                min={0}
                max={po.balance}
                placeholder="0"
              />
            </div>
            {+form.amount > po.balance && (
              <p className="text-xs text-red-500 mt-1">Amount exceeds remaining balance</p>
            )}
          </div>

          {/* Paid By — matches Expenses UserSelector pattern */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Paid By *
            </label>
            <div className="relative">
              <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 appearance-none cursor-pointer"
                value={form.paidBy}
                onChange={(e) => setForm((p) => ({ ...p, paidBy: e.target.value }))}
              >
                <option value="">Select who is paying...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {userDisplayName(user)}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Account */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Debit from Account *
            </label>
            <select
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              value={form.accountId}
              onChange={(e) => setForm((p) => ({ ...p, accountId: e.target.value }))}
            >
              <option value="">— Select account —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency} {a.currentBalance.toLocaleString()}
                </option>
              ))}
            </select>
            {selectedAccount && (
              <p className="text-xs text-slate-400 mt-1">
                Balance after: UGX{" "}
                {(selectedAccount.currentBalance - (+form.amount || 0)).toLocaleString()}
              </p>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Payment Method *
            </label>
            <select
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              value={form.method}
              onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}
            >
              {PAY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Reference / Txn ID
            </label>
            <input
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              value={form.reference}
              onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
              placeholder="Optional"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Payment Notes
            </label>
            <textarea
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Optional notes..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePay}
            disabled={saving || !canSubmit}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-md shadow-emerald-200"
          >
            <CreditCard className="w-4 h-4" />
            {saving ? "Processing…" : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const poId = id as string;

  const { data: po, isLoading, refetch } = usePurchaseOrder(poId);
  const submitMutation = useSubmitPurchaseOrder();
  const approveMutation = useApprovePurchaseOrder();

  const [showDelivery, setShowDelivery] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Load accounts & users for payment modal
  useEffect(() => {
    let mounted = true;
    Promise.all([accountsApi.getAll(), usersApi.getAll()])
      .then(([accData, userData]) => {
        if (!mounted) return;
        setAccounts(Array.isArray(accData) ? accData : accData.accounts ?? []);
        setUsers(Array.isArray(userData) ? userData : userData.data ?? []);
      })
      .catch(() => {
        // Silently fail — modal selectors will just be empty
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading)
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  if (!po)
    return (
      <div className="p-20 text-center text-slate-500">Order not found</div>
    );

  const currentStep = STEPS.indexOf(po.status);

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900">
      {/* 1. TOP WIZARD BAR */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Back & ID */}
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate(-1)}
                className="rounded-full h-10 w-10 border-slate-200 text-slate-500 hover:text-sky-600 hover:border-sky-200"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {po.poNumber}
                </h1>
                <p className="text-sm font-medium text-slate-500 flex items-center gap-1.5">
                  <Circle className="h-3.5 w-3.5" /> {po.supplier?.name}
                </p>
              </div>
            </div>

            {/* The "Wizard" Stepper */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl overflow-hidden hidden xl:flex">
              {STEPS.map((step, idx) => {
                const isActive = idx === currentStep;
                const isCompleted = idx < currentStep;
                return (
                  <div
                    key={step}
                    className={cn(
                      "flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 gap-2",
                      isActive
                        ? "bg-sky-600 text-white shadow-lg scale-105"
                        : isCompleted
                          ? "text-sky-700"
                          : "text-slate-400",
                    )}
                  >
                    <div
                      className={cn(
                        "h-5 w-5 rounded-full flex items-center justify-center border-2",
                        isActive
                          ? "border-white bg-sky-500"
                          : isCompleted
                            ? "border-sky-200 bg-sky-50"
                            : "border-slate-300",
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    {step.replace(/_/g, " ")}
                    {idx < STEPS.length - 1 && (
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 ml-2",
                          isCompleted ? "text-sky-200" : "text-slate-300",
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              {po.status === "DRAFT" && (
                <Button
                  className="bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-200 font-bold"
                  onClick={() => submitMutation.mutate(po.id)}
                >
                  Submit for Approval
                </Button>
              )}
              {po.status === "SUBMITTED" && (
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-200 font-bold"
                  onClick={() =>
                    approveMutation.mutate({ id: po.id, data: {} })
                  }
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve Order
                </Button>
              )}
              {["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status) && (
                <Button
                  variant="outline"
                  className="border-sky-600 text-sky-600 hover:bg-sky-50 font-bold"
                  onClick={() => setShowDelivery(true)}
                >
                  <Truck className="mr-2 h-4 w-4" /> Record Receipt
                </Button>
              )}
              {po.balance > 0 && po.status !== "DRAFT" && po.status !== "CANCELLED" && (
                <Button
                  variant="outline"
                  className="border-emerald-600 text-emerald-600 hover:bg-emerald-50 font-bold"
                  onClick={() => setShowPayment(true)}
                >
                  <CreditCard className="mr-2 h-4 w-4" /> Record Payment
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-2 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT COLUMN: Summary & Details */}
          <div className="lg:col-span-8 space-y-4">
            {/* 1. KEY INFO GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-none shadow-sm bg-white overflow-hidden group">
                <div className="h-1 bg-sky-500 w-full" />
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-sky-50 text-sky-600 group-hover:scale-110 transition-transform">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Expected Delivery
                    </p>
                    <p className="text-base font-bold text-slate-800">
                      {po.expectedDate
                        ? format(new Date(po.expectedDate), "EEE, dd MMM yyyy")
                        : "Not Set"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-white overflow-hidden group">
                <div className="h-1 bg-indigo-500 w-full" />
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Shipping To
                    </p>
                    <p className="text-base font-bold text-slate-800">
                      {po.location?.name}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-white overflow-hidden group">
                <div className="h-1 bg-amber-500 w-full" />
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-amber-50 text-amber-600 group-hover:scale-110 transition-transform">
                    <Info className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Payment Terms
                    </p>
                    <p className="text-base font-bold text-slate-800">
                      {po.paymentTerms?.replace(/_/g, " ")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 2. TABLE AREA WITH PAYMENTS TAB */}
            <Card className="border-none shadow-sm bg-white overflow-hidden">
              <Tabs defaultValue="items" className="w-full">
                <div className="px-6 pt-1 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <TabsList className="bg-transparent gap-6">
                    <TabsTrigger
                      value="items"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-sky-600 data-[state=active]:text-sky-600 font-bold px-0 pb-4"
                    >
                      Purchase Items
                    </TabsTrigger>
                    <TabsTrigger
                      value="history"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-sky-600 data-[state=active]:text-sky-600 font-bold px-0 pb-4"
                    >
                      Order History
                    </TabsTrigger>
                    <TabsTrigger
                      value="payments"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-sky-600 data-[state=active]:text-sky-600 font-bold px-0 pb-4"
                    >
                      Payments
                      {po.payments?.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="ml-2 bg-emerald-100 text-emerald-700"
                        >
                          {po.payments.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                  <Badge
                    variant="outline"
                    className="mb-4 bg-white text-slate-500 border-slate-200"
                  >
                    {po.items?.length} Items
                  </Badge>
                </div>

                <TabsContent value="items" className="m-0">
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow>
                        <TableHead className="w-[400px] font-bold text-slate-700 py-4">
                          Item Description
                        </TableHead>
                        <TableHead className="text-center font-bold text-slate-700">
                          Quantity
                        </TableHead>
                        <TableHead className="text-right font-bold text-slate-700">
                          Unit Price
                        </TableHead>
                        <TableHead className="text-right font-bold text-slate-700">
                          Total
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {po.items?.map((item: any) => (
                        <TableRow
                          key={item.id}
                          className="hover:bg-slate-50/50 border-slate-100 group"
                        >
                          <TableCell className="py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-sky-100 group-hover:text-sky-600 transition-colors">
                                {item.itemType === "DRUG" ? (
                                  <Pill className="h-5 w-5" />
                                ) : (
                                  <Package className="h-5 w-5" />
                                )}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 leading-none mb-1">
                                  {item.itemName}
                                </p>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">
                                  {item.itemType}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="font-bold text-slate-800">
                                {item.quantityOrdered} {item.unit}
                              </span>
                              <span className="text-[10px] font-bold text-emerald-600">
                                Received: {item.quantityReceived}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-slate-600">
                            {formatUGX(item.unitCost)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-bold text-slate-900">
                              {formatUGX(item.total)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="payments" className="m-0 p-6">
                  <PaymentHistory
                    contextType="PURCHASE_ORDER"
                    contextId={po.id}
                  />
                </TabsContent>
              </Tabs>
            </Card>

            {/* 3. NOTES AREA */}
            {po.notes && (
              <div className="flex gap-4 p-6 bg-amber-50 border border-amber-100 rounded-2xl">
                <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-amber-500 shadow-sm border border-amber-100">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-900 mb-1">
                    Additional Instructions
                  </h4>
                  <p className="text-sm text-amber-800/80 leading-relaxed">
                    {po.notes}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Totals & Payments */}
          <div className="lg:col-span-4 space-y-4">
            {/* Financial Summary Card */}
            <Card className="border-none shadow-xl bg-white overflow-hidden">
              <div className="bg-amber-700 px-6 pt-2 pb-1 text-white shadow-inner relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <AlertCircle className="h-24 w-24 -mr-8 -mt-8" />
                </div>

                <div className="relative z-10">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-100">
                      Grand Total
                    </span>
                    <Badge className="bg-amber-800/40 text-white border-amber-400/30 backdrop-blur-sm">
                      {po.status}
                    </Badge>
                  </div>

                  <h2 className="text-4xl font-black tracking-tighter mb-1 drop-shadow-md">
                    {formatUGX(po.total)}
                  </h2>

                  <div className="flex justify-between items-center text-xs font-medium text-amber-100 pt-4 border-t border-amber-500 mt-4">
                    <span className="flex items-center gap-1.5 font-bold">
                      Balance Due:
                    </span>
                    <span className="text-white font-black text-lg">
                      {formatUGX(po.balance)}
                    </span>
                  </div>
                </div>
              </div>

              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Subtotal</span>
                  <span className="font-bold text-slate-800">
                    {formatUGX(po.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Tax</span>
                  <span className="font-bold text-slate-800">
                    {formatUGX(po.taxAmount)}
                  </span>
                </div>
                <Separator className="bg-slate-100" />
                <div className="flex justify-between text-sm pt-2">
                  <span className="text-emerald-600 font-bold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Paid to Date
                  </span>
                  <span className="font-bold text-emerald-600">
                    {formatUGX(po.amountPaid)}
                  </span>
                </div>

                {/* Record Payment Button */}
                <div className="pt-4">
                  <Button
                    onClick={() => setShowPayment(true)}
                    disabled={
                      po.paymentStatus === "PAID" ||
                      po.status === "CANCELLED" ||
                      po.balance <= 0
                    }
                    className="w-full bg-green-600 text-white font-bold hover:bg-green-700 py-6 shadow-lg shadow-green-200 border-none transition-all active:scale-[0.98] disabled:bg-gray-400 disabled:cursor-not-allowed h-auto"
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pay — Balance {formatUGX(po.balance)}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats/Metadata */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                <span className="text-xs font-bold text-slate-400 uppercase">
                  PO ID
                </span>
                <span className="text-sm font-mono font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                  #{poId.slice(-8).toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                <span className="text-xs font-bold text-slate-400 uppercase">
                  Created By
                </span>
                <span className="text-sm font-bold text-slate-700">
                  Procurement Team
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showDelivery && (
        <RecordDeliveryModal po={po} onClose={() => setShowDelivery(false)} />
      )}

      {showPayment && (
        <RecordPaymentModal
          po={po}
          accounts={accounts}
          users={users}
          onClose={() => setShowPayment(false)}
          onSaved={() => {
            setShowPayment(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}