// src/pages/expenses/ExpensesPage.tsx
import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Pill,
  Package,
  Building2,
  Wallet,
  Banknote,
  CreditCard,
  Receipt,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  BarChart3,
  Eye,
  Edit3,
  Trash2,
  ChevronDown,
  Search,
  Filter,
  X,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Ban,
} from "lucide-react";
import { ActionButton, RowActions } from "@/components/ui/action-button";
import { useForm } from "react-hook-form";

import {
  expensesApi,
  suppliersApi,
  usersApi,
  accountsApi,
} from "@/lib/api/expenses";
import {
  expenseCategoriesApi,
  type ExpenseCategory,
} from "@/lib/api/expenseCategories";
import type {
  Expense,
  ExpenseStats,
  Account,
  User,
  AuditLogRow,
} from "../../types/expenses";
import { Link } from "react-router-dom";

import { formatCurrency } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────
interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
}

interface ExpenseFormData {
  categoryId: string;
  title: string;
  description: string;
  amount: string;
  expenseDate: string;
  notes: string;
  createdBy: string;
  supplierId: string;
  paymentType: "CASH" | "CREDIT";
  paymentMethod: string;
  accountId: string;
  paymentReference: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────
// Categories are now a dynamic, user-managed list fetched from the API
// (see expenseCategoriesApi). The form/filter render the live list; existing
// expenses display their permanent `categoryName` snapshot.

const CASH_PAY_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "MTN_MOBILE_MONEY", label: "MTN Mobile Money" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
  { value: "CHEQUE", label: "Cheque" },
];

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; dot: string; border: string }
> = {
  DRAFT: {
    label: "Draft",
    bg: "bg-muted/50",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/70",
    border: "border-border",
  },
  APPROVED: {
    label: "Approved",
    bg: "bg-primary-muted/60",
    text: "text-primary",
    dot: "bg-primary/80",
    border: "border-primary/25",
  },
  POSTED: {
    label: "Posted",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    dot: "bg-indigo-400",
    border: "border-indigo-200",
  },
  REJECTED: {
    label: "Rejected",
    bg: "bg-danger-muted/60",
    text: "text-danger",
    dot: "bg-danger/80",
    border: "border-danger/25",
  },
  CANCELLED: {
    label: "Cancelled",
    bg: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/70",
    border: "border-border",
  },
  VOID: {
    label: "Void",
    bg: "bg-danger-muted/60",
    text: "text-danger",
    dot: "bg-danger",
    border: "border-danger/25",
  },
  // Legacy values, in case old data is still around
  PENDING: {
    label: "Pending",
    bg: "bg-warning-muted/60",
    text: "text-warning",
    dot: "bg-warning/80",
    border: "border-warning/25",
  },
  PAID: {
    label: "Paid (legacy)",
    bg: "bg-success-muted/60",
    text: "text-success",
    dot: "bg-success/80",
    border: "border-success/25",
  },
};

const PAYMENT_STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; dot: string; border: string }
> = {
  UNPAID: {
    label: "Unpaid",
    bg: "bg-warning-muted/60",
    text: "text-warning",
    dot: "bg-warning/80",
    border: "border-warning/25",
  },
  PARTIALLY_PAID: {
    label: "Partial",
    bg: "bg-primary-muted/60",
    text: "text-primary",
    dot: "bg-primary/80",
    border: "border-primary/25",
  },
  PAID: {
    label: "Paid",
    bg: "bg-success-muted/60",
    text: "text-success",
    dot: "bg-success/80",
    border: "border-success/25",
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
// function fmtCurrency(n: number) {
//   return `UGX ${n.toLocaleString()}`;
// }

/** Display "{icon} {name}" for an expense using its live category (preferred)
 *  or its permanent snapshot name (history-safe if the category was deleted). */
function categoryDisplay(e: Expense): string {
  const icon = e.category?.icon ?? "🗂️";
  return `${icon} ${e.categoryName ?? e.category?.name ?? "—"}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function staffName(
  user?: { staff?: { firstName: string; lastName: string } | null } | null,
) {
  return user?.staff ? `${user.staff.firstName} ${user.staff.lastName}` : "—";
}

function userDisplayName(u: User) {
  return u.staff ? `${u.staff.firstName} ${u.staff.lastName}` : u.email;
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── Payment Type Badge ───────────────────────────────────────────────────────
function PaymentTypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  return type === "CASH" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-success-muted text-success border border-success/25">
      <Banknote className="w-3 h-3" /> Cash
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground border border-border">
      <CreditCard className="w-3 h-3" /> Credit
    </span>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = "blue",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color?: "blue" | "amber" | "emerald" | "slate" | "rose" | "violet";
}) {
  const palette = {
    blue: {
      grad: "from-primary to-primary",
      iconBg: "bg-primary/30",
      sub: "text-white/80",
    },
    amber: {
      grad: "from-warning to-warning",
      iconBg: "bg-warning/30",
      sub: "text-warning/40",
    },
    emerald: {
      grad: "from-success to-success",
      iconBg: "bg-success/30",
      sub: "text-success/40",
    },
    slate: {
      grad: "from-muted-foreground to-foreground",
      iconBg: "bg-muted-foreground/30",
      sub: "text-muted-foreground/40",
    },
    rose: {
      grad: "from-danger to-danger",
      iconBg: "bg-danger/30",
      sub: "text-danger/40",
    },
    violet: {
      grad: "from-violet-500 to-violet-600",
      iconBg: "bg-violet-400/30",
      sub: "text-violet-100",
    },
  }[color];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${palette.grad} py-1 px-6 text-white shadow-lg`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-xs font-semibold uppercase tracking-widest ${palette.sub} mb-0`}
          >
            {label}
          </p>
          <p className="text-xl font-bold leading-tight truncate">{value}</p>
          {sub && (
            <p className={`text-xs mt-0 ${palette.sub} opacity-90`}>{sub}</p>
          )}
        </div>
        <div
          className={`shrink-0 w-10 h-10 ${palette.iconBg} rounded-xl flex items-center justify-center backdrop-blur-sm`}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  empty = "No data",
}: {
  title: string;
  rows: { label: string; value: string; sub?: string }[];
  empty?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-4">
      <p className="text-xs font-bold uppercase text-muted-foreground mb-3">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground/70">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-muted-foreground">{r.label}</span>
              <span className="font-semibold text-foreground whitespace-nowrap">
                {r.value}
                {r.sub && (
                  <span className="text-xs text-muted-foreground/70 ml-1">({r.sub})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Expense Form Dialog (AdminLTE Themed) ──────────────────────────────────
function ExpenseFormDialog({
  expense,
  users,
  suppliers,
  accounts,
  categories,
  onClose,
  onSaved,
}: {
  expense?: Expense | null;
  users: User[];
  suppliers: Supplier[];
  accounts: Account[];
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<ExpenseFormData>({
    defaultValues: {
      categoryId: expense?.categoryId ?? expense?.category?.id ?? "",
      title: expense?.title ?? "",
      description: expense?.description ?? "",
      amount: expense ? String(expense.amount) : "",
      expenseDate: expense
        ? expense.expenseDate.split("T")[0]
        : new Date().toISOString().split("T")[0],
      notes: expense?.notes ?? "",
      createdBy: "",
      supplierId: (expense as any)?.supplier?.id ?? "",
      paymentType: (expense as any)?.paymentType ?? "CREDIT",
      paymentMethod: "",
      accountId: accounts[0]?.id ?? "",
      paymentReference: "",
    },
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isCash = form.watch("paymentType") === "CASH";
  const isEdit = !!expense;

  const onSubmit = async (data: ExpenseFormData) => {
    if (!data.title.trim()) return setError("Title is required");
    if (!data.amount || +data.amount <= 0)
      return setError("Enter a valid amount greater than 0");
    if (!isEdit && !data.createdBy)
      return setError("Select who is creating this expense");
    if (isCash && !data.paymentMethod)
      return setError("Select a payment method for cash expenses");
    if (isCash && !data.accountId)
      return setError("Select an account to debit for cash expenses");
    if (!data.categoryId) return setError("Select a category");

    setSaving(true);
    setError("");
    try {
      const body: any = {
        title: data.title.trim(),
        description: data.description || undefined,
        amount: parseFloat(data.amount),
        categoryId: data.categoryId,
        expenseDate: data.expenseDate,
        notes: data.notes || undefined,
        supplierId: data.supplierId || undefined,
        paymentType: data.paymentType,
      };

      if (!isEdit) {
        body.createdBy = data.createdBy;
        if (isCash) {
          body.paymentMethod = data.paymentMethod;
          body.accountId = data.accountId;
          body.paymentReference = data.paymentReference || undefined;
        }
      }

      if (isEdit) {
        await expensesApi.update(expense!.id, body);
      } else {
        await expensesApi.create(body);
      }
      onSaved();
    } catch (e: any) {
      const msg = e.response?.data?.message;
      setError(
        Array.isArray(msg)
          ? msg.join(", ")
          : msg || e.message || "Failed to save",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 border-none overflow-hidden shadow-2xl">
        {/* AdminLTE Themed Header */}
        <div className="bg-[#3c8dbc] px-4 py-3">
          <DialogHeader className="text-white">
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              {isEdit ? `Edit: ${expense?.title}` : "Add New Expense"}
            </DialogTitle>
          </DialogHeader>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="bg-[#f4f6f9]">
            <div className="p-4 max-h-[70vh] overflow-y-auto space-y-6">
              {error && (
                <div className="flex items-start gap-2.5 p-3 bg-danger-muted/60 border border-danger/25 rounded-xl text-danger text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* SECTION: Identity */}
              <div className="bg-white rounded border shadow-sm overflow-hidden">
                <div className="p-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase text-muted-foreground">
                          Title *
                        </FormLabel>
                        <FormControl>
                          <Input
                            className="rounded-none border-input focus:border-[#3c8dbc]"
                            placeholder="e.g. Monthly electricity bill"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expenseDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase text-muted-foreground">
                          Date
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            className="rounded-none border-input focus:border-[#3c8dbc]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase text-muted-foreground">
                          Category
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="rounded-none border-input">
                              <SelectValue placeholder="Select Category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.icon ? `${cat.icon} ` : ""}
                                {cat.name}
                                {cat.ledgerAccountId ? "" : "  · (no GL)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase text-muted-foreground">
                          Supplier
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger className="rounded-none border-input">
                              <SelectValue placeholder="Select supplier…" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">
                              None (Internal)
                            </SelectItem>
                            {suppliers.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                                {s.contactPerson ? ` — ${s.contactPerson}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Link to external vendor or mark as internal expense.
                        </p>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel className="text-xs font-bold uppercase text-muted-foreground">
                          Description
                        </FormLabel>
                        <FormControl>
                          <Input
                            className="rounded-none border-input focus:border-[#3c8dbc]"
                            placeholder="Additional details about this expense"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* SECTION: Amount & Payment Grid */}
              <div className="grid grid-cols-2 md:grid-cols-2 gap-2">
                {/* Amount Card */}
                <div className="bg-white rounded border shadow-sm overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 border-b text-sm font-bold text-foreground uppercase tracking-wider">
                    Amount Details
                  </div>
                  <div className="p-4 space-y-4">
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-muted-foreground uppercase">
                            Amount (UGX) *
                          </FormLabel>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground/70 pointer-events-none">
                              UGX
                            </span>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                className="rounded-none border-input pl-12 focus:border-[#3c8dbc]"
                                placeholder="0"
                                {...field}
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="paymentType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-muted-foreground uppercase">
                            Payment Type
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="rounded-none border-input">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="CREDIT">
                                <CreditCard className="w-4 h-4 inline mr-2" />{" "}
                                Credit (Pay Later)
                              </SelectItem>
                              <SelectItem value="CASH">
                                <Banknote className="w-4 h-4 inline mr-2" />{" "}
                                Cash (Pay Now)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Cash Payment Card */}
                {isCash && !isEdit && (
                  <div className="bg-white rounded border border-l-4 border-l-emerald-500 shadow-sm overflow-hidden">
                    <div className="bg-success-muted/50 px-4 py-2 border-b text-sm font-bold text-success uppercase tracking-wider text-right">
                      Cash Payment Details
                    </div>
                    <div className="p-4 space-y-4">
                      <FormField
                        control={form.control}
                        name="paymentMethod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold text-muted-foreground uppercase">
                              Payment Method *
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="rounded-none border-input">
                                  <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {CASH_PAY_METHODS.map((m) => (
                                  <SelectItem key={m.value} value={m.value}>
                                    {m.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="accountId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold text-muted-foreground uppercase">
                              Debit Account *
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="rounded-none border-input">
                                  <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {accounts.map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.name} · {formatCurrency(a.currentBalance)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="paymentReference"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold text-muted-foreground uppercase">
                              Reference / Txn ID
                            </FormLabel>
                            <FormControl>
                              <Input
                                className="rounded-none border-input focus:border-[#3c8dbc]"
                                placeholder="Optional transaction reference"
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: Metadata & Notes */}
              <div className="bg-white rounded border shadow-sm overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 border-b">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-[#3c8dbc] rounded-full" />
                    Metadata & Notes
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  {!isEdit && (
                    <FormField
                      control={form.control}
                      name="createdBy"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold uppercase text-muted-foreground">
                            Created By *
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="rounded-none border-input">
                                <SelectValue placeholder="Select staff member" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {users.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {userDisplayName(u)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase text-muted-foreground">
                          Internal Notes
                        </FormLabel>
                        <FormControl>
                          <textarea
                            className="w-full rounded-none border-input focus:border-[#3c8dbc] px-3 py-2 text-sm bg-white"
                            rows={3}
                            placeholder="Optional internal notes..."
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Info Banner */}
              {isCash && !isEdit && (
                <div className="flex items-start gap-2.5 p-3 bg-success-muted/60 border border-success/25 rounded-xl text-success text-xs">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    This expense will be{" "}
                    <strong>automatically registered as Paid</strong> once
                    saved.
                  </span>
                </div>
              )}
              {!isCash && !isEdit && (
                <div className="flex items-start gap-2.5 p-3 bg-primary-muted/60 border border-primary/25 rounded-xl text-primary text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    This expense will be saved as <strong>Approved</strong>. You
                    can record payment later.
                  </span>
                </div>
              )}
            </div>

            {/* Footer Bar */}
            <div className="bg-white px-6 py-4 flex justify-between items-center border-t">
              <span className="text-[10px] text-muted-foreground/70 font-bold uppercase tracking-widest">
                {isEdit ? `Editing: ${expense?.title}` : "New Expense Entry"}
              </span>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none px-6"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#3c8dbc] hover:bg-[#367fa9] rounded-none px-8 font-bold shadow-md"
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {isEdit
                    ? "UPDATE EXPENSE"
                    : isCash
                      ? "SAVE & PAY"
                      : "CREATE EXPENSE"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Audit Trail Section ─────────────────────────────────────────────────────
const AUDIT_ACTION_STYLE: Record<string, string> = {
  CREATE: "bg-success-muted/60 text-success",
  UPDATE: "bg-warning-muted/60 text-warning",
  PAY: "bg-primary-muted/60 text-primary",
  VOID: "bg-danger-muted/60 text-danger",
  CANCEL: "bg-muted text-muted-foreground",
  DELETE: "bg-danger-muted/60 text-danger",
};

function ExpenseAuditSection({ expenseId }: { expenseId: string }) {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    expensesApi
      .getAudit(expenseId)
      .then((data: AuditLogRow[]) => active && setRows(data ?? []))
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [expenseId]);

  return (
    <div className="bg-white rounded border shadow-sm overflow-hidden">
      <div className="bg-muted/50 px-4 py-2 border-b">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
          <span className="w-1 h-4 bg-[#3c8dbc] rounded-full" />
          Audit Trail
        </h3>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground/70">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading history…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground/70">No audit history recorded.</p>
        ) : (
          <ol className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="flex gap-3 text-sm">
                <span
                  className={`shrink-0 h-fit text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    AUDIT_ACTION_STYLE[r.action] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {r.action}
                </span>
                <div className="min-w-0">
                  <p className="text-foreground">
                    <span className="font-medium">
                      {r.entityType === "Payment" ? "Payment" : "Expense"}
                    </span>{" "}
                    {r.action.toLowerCase()} by{" "}
                    <span className="font-medium">
                      {r.userName ?? r.userId ?? "system"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {new Date(r.createdAt).toLocaleString("en-UG")}
                  </p>
                  {r.reason && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">
                      "{r.reason}"
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ─── Expense Detail Dialog (AdminLTE Themed) ────────────────────────────────
function ExpenseDetailDialog({
  expense,
  onClose,
}: {
  expense: Expense;
  onClose: () => void;
}) {
  const supplier = (expense as any).supplier;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 border-none overflow-hidden shadow-2xl">
        {/* AdminLTE Themed Header */}
        <div className="bg-[#0369a1] px-4 py-3">
          <DialogHeader className="text-white">
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Expense Details
            </DialogTitle>
            <DialogDescription className="text-white/80">
              View complete information about this expense record
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="bg-[#f4f6f9]">
          <div className="p-4 max-h-[70vh] overflow-y-auto space-y-6">
            {/* Hero Summary */}
            <div className="rounded-xl bg-[#0369a1] p-5 text-white">
              <p className="text-xs text-white/80 uppercase tracking-wider font-medium">
                {categoryDisplay(expense)}
              </p>
              <p className="text-3xl font-bold mt-2">
                {formatCurrency(expense.amount)}
              </p>
              <p className="text-sm text-white/85 mt-1">{expense.title}</p>
              <div className="flex items-center gap-2 mt-3">
                <StatusBadge status={expense.status} />
                <PaymentTypeBadge type={(expense as any).paymentType} />
              </div>
            </div>

            {/* SECTION: Core Details */}
            <div className="bg-white rounded border shadow-sm overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 border-b">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1 h-4 bg-[#3c8dbc] rounded-full" />
                  Core Information
                </h3>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    label: "Expense Code",
                    value: expense.expenseCode,
                    mono: true,
                  },
                  { label: "Date", value: fmtDate(expense.expenseDate) },
                  { label: "Created By", value: staffName(expense.createdBy) },
                  {
                    label: "Category",
                    value: categoryDisplay(expense),
                  },
                ].map(({ label, value, mono }) => (
                  <div key={label}>
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">
                      {label}
                    </p>
                    <p
                      className={`text-sm font-semibold text-foreground ${mono ? "font-mono text-xs" : ""}`}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION: Supplier & Payment */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {supplier && (
                <div className="bg-white rounded border shadow-sm overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 border-b">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                      <span className="w-1 h-4 bg-[#3c8dbc] rounded-full" />
                      Supplier
                    </h3>
                  </div>
                  <div className="p-4 space-y-2">
                    <p className="text-sm font-semibold text-foreground">
                      {supplier.name}
                    </p>
                    {supplier.contactPerson && (
                      <p className="text-xs text-muted-foreground/70">
                        {supplier.contactPerson}
                      </p>
                    )}
                    {supplier.phone && (
                      <p className="text-xs text-muted-foreground/70">{supplier.phone}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white rounded border shadow-sm overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 border-b">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-[#3c8dbc] rounded-full" />
                    Payment Info
                  </h3>
                </div>
                <div className="p-4 space-y-2">
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    Type
                  </p>
                  <PaymentTypeBadge type={(expense as any).paymentType} />
                  {(expense as any).paymentMethod && (
                    <>
                      <p className="text-xs font-bold uppercase text-muted-foreground mt-3">
                        Method
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {(expense as any).paymentMethod}
                      </p>
                    </>
                  )}
                  {(expense as any).paymentReference && (
                    <>
                      <p className="text-xs font-bold uppercase text-muted-foreground mt-3">
                        Reference
                      </p>
                      <p className="text-sm font-mono text-foreground">
                        {(expense as any).paymentReference}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION: Workflow & Notes */}
            <div className="bg-white rounded border shadow-sm overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 border-b">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1 h-4 bg-[#3c8dbc] rounded-full" />
                  Workflow & Notes
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">
                      Status
                    </p>
                    <StatusBadge status={expense.status} />
                  </div>
                  {expense.approvedBy && (
                    <div>
                      <p className="text-xs font-bold uppercase text-muted-foreground mb-1">
                        Approved By
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {staffName(expense.approvedBy)}
                      </p>
                    </div>
                  )}
                  {expense.paidAt && (
                    <div>
                      <p className="text-xs font-bold uppercase text-muted-foreground mb-1">
                        Paid At
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {fmtDate(expense.paidAt)}
                      </p>
                    </div>
                  )}
                </div>
                {expense.notes && (
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">
                      Notes
                    </p>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded border">
                      {expense.notes}
                    </p>
                  </div>
                )}
                {expense.approvalNotes && (
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">
                      Approval Notes
                    </p>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded border">
                      {expense.approvalNotes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION: Audit Trail */}
            <ExpenseAuditSection expenseId={expense.id} />
          </div>

          {/* Footer Bar */}
          <div className="bg-white px-6 py-4 flex justify-end items-center border-t">
            <Button
              variant="outline"
              className="rounded-none px-6"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pay Expense Dialog (AdminLTE Themed) ───────────────────────────────────
function PayExpenseDialog({
  expense,
  accounts,
  users,
  onClose,
  onSaved,
}: {
  expense: Expense;
  accounts: Account[];
  users: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    paymentMethod: "",
    reference: "",
    paidBy: "",
    accountId: accounts[0]?.id ?? "",
    paymentNotes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedAccount = accounts.find((a) => a.id === form.accountId);

  const handlePay = async () => {
    if (!form.paidBy) return setError("Select who is processing this payment");
    if (!form.paymentMethod) return setError("Select a payment method");
    if (!form.accountId) return setError("Select an account to debit");

    setSaving(true);
    setError("");
    try {
      await expensesApi.pay(expense.id, {
        paidBy: form.paidBy,
        paymentMethod: form.paymentMethod,
        reference: form.reference || undefined,
        paymentNotes: form.paymentNotes || undefined,
        accountId: form.accountId,
      });
      onSaved();
    } catch (e: any) {
      const msg = e.response?.data?.message;
      setError(
        Array.isArray(msg)
          ? msg.join(", ")
          : msg || e.message || "Payment failed",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-0 border-none overflow-hidden shadow-2xl">
        <div className="bg-[#3c8dbc] px-4 py-3">
          <DialogHeader className="text-white">
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Process Payment
            </DialogTitle>
            <DialogDescription className="text-white/80">
              Record cash-out and mark expense as paid
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="bg-[#f4f6f9] p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Amount Summary */}
          <div className="rounded-xl bg-gradient-to-br from-foreground to-foreground p-4 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider">
                  Paying
                </p>
                <p className="font-semibold mt-0.5">{expense.title}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  {categoryDisplay(expense)} · {expense.expenseCode}
                </p>
                {(expense as any).supplier && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    <Building2 className="w-3 h-3 inline mr-1" />
                    {(expense as any).supplier.name}
                  </p>
                )}
              </div>
              <p className="text-2xl font-bold">
                {formatCurrency(expense.amount)}
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3 bg-danger-muted/60 border border-danger/25 rounded-xl text-danger text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                Paid By *
              </label>
              <select
                value={form.paidBy}
                onChange={(e) =>
                  setForm((p) => ({ ...p, paidBy: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-none border border-input focus:border-[#3c8dbc] bg-white text-sm"
              >
                <option value="">Select who is paying...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userDisplayName(u)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                Debit Account *
              </label>
              <select
                value={form.accountId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, accountId: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-none border border-input focus:border-[#3c8dbc] bg-white text-sm"
              >
                <option value="">— Select account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency} {formatCurrency(a.currentBalance)}
                  </option>
                ))}
              </select>
              {selectedAccount && (
                <p className="text-xs text-muted-foreground mt-1">
                  Balance after:{" "}
                  <span
                    className={`font-semibold ${selectedAccount.currentBalance - expense.amount < 0 ? "text-danger" : "text-success"}`}
                  >
                    {formatCurrency(
                      selectedAccount.currentBalance - expense.amount,
                    )}
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                Payment Method *
              </label>
              <select
                value={form.paymentMethod}
                onChange={(e) =>
                  setForm((p) => ({ ...p, paymentMethod: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-none border border-input focus:border-[#3c8dbc] bg-white text-sm"
              >
                <option value="">— Select method —</option>
                {CASH_PAY_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                Reference / Txn ID
              </label>
              <input
                value={form.reference}
                onChange={(e) =>
                  setForm((p) => ({ ...p, reference: e.target.value }))
                }
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-none border border-input focus:border-[#3c8dbc] bg-white text-sm"
              />
            </div>
          </div>
        </div>

        <div className="bg-white px-6 py-4 flex justify-end items-center border-t">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-none px-6"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#3c8dbc] hover:bg-[#367fa9] rounded-none px-8 font-bold shadow-md"
              onClick={handlePay}
              disabled={
                saving || !form.paidBy || !form.accountId || !form.paymentMethod
              }
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" /> Confirm Payment
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Approve Dialog (AdminLTE Themed) ───────────────────────────────────────
function ApproveDialog({
  expense,
  users,
  onClose,
  onSaved,
}: {
  expense: Expense;
  users: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [approvedBy, setApprovedBy] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleApprove = async () => {
    if (!approvedBy) return setError("Select who is approving this expense");
    setSaving(true);
    setError("");
    try {
      await expensesApi.approve(expense.id, {
        approvedBy,
        approvalNotes: approvalNotes || undefined,
      });
      onSaved();
    } catch (e: any) {
      const msg = e.response?.data?.message;
      setError(
        Array.isArray(msg)
          ? msg.join(", ")
          : msg || e.message || "Approval failed",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0 border-none overflow-hidden shadow-2xl">
        <div className="bg-[#3c8dbc] px-4 py-3">
          <DialogHeader className="text-white">
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Approve Expense
            </DialogTitle>
            <DialogDescription className="text-white/80">
              Confirm approval for this expense request
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="bg-[#f4f6f9] p-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 p-3 bg-danger-muted/60 border border-danger/25 rounded-xl text-danger text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-xl bg-gradient-to-br from-foreground to-foreground p-4 text-white">
            <p className="text-xs text-muted-foreground/70 uppercase tracking-wider">
              Approving
            </p>
            <p className="font-semibold mt-0.5">{expense.title}</p>
            <p className="text-2xl font-bold mt-2">
              {formatCurrency(expense.amount)}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
              Approved By *
            </label>
            <select
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
              className="w-full px-3 py-2 rounded-none border border-input focus:border-[#3c8dbc] bg-white text-sm"
            >
              <option value="">Select approver...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {userDisplayName(u)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
              Approval Notes
            </label>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
              className="w-full px-3 py-2 rounded-none border border-input focus:border-[#3c8dbc] bg-white text-sm resize-none"
            />
          </div>
        </div>

        <div className="bg-white px-6 py-4 flex justify-end items-center border-t">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-none px-6"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#3c8dbc] hover:bg-[#367fa9] rounded-none px-8 font-bold shadow-md"
              onClick={handleApprove}
              disabled={saving || !approvedBy}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving…
                </>
              ) : (
                "Approve"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject Dialog (AdminLTE Themed) ────────────────────────────────────────
function RejectDialog({
  expense,
  onClose,
  onSaved,
}: {
  expense: Expense;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleReject = async () => {
    setSaving(true);
    try {
      await expensesApi.reject(expense.id, reason || undefined);
      onSaved();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0 border-none overflow-hidden shadow-2xl">
        <div className="bg-danger px-4 py-3">
          <DialogHeader className="text-white">
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Reject Expense
            </DialogTitle>
            <DialogDescription className="text-danger/40 opacity-90">
              Provide reason for rejecting this expense
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="bg-[#f4f6f9] p-4 space-y-4">
          <div className="rounded-xl bg-gradient-to-br from-foreground to-foreground p-4 text-white">
            <p className="text-xs text-muted-foreground/70 uppercase tracking-wider">
              Rejecting
            </p>
            <p className="font-semibold mt-0.5">{expense.title}</p>
            <p className="text-2xl font-bold mt-2">
              {formatCurrency(expense.amount)}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
              Rejection Reason
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              rows={4}
              className="w-full px-3 py-2 rounded-none border border-input focus:border-danger/60 bg-white text-sm resize-none"
            />
          </div>
        </div>

        <div className="bg-white px-6 py-4 flex justify-end items-center border-t">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-none px-6"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              className="bg-danger hover:bg-danger rounded-none px-8 font-bold shadow-md"
              onClick={handleReject}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rejecting…
                </>
              ) : (
                "Reject"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [expenseDialog, setExpenseDialog] = useState<{
    open: boolean;
    expense?: Expense | null;
  }>({ open: false });
  const [payDialog, setPayDialog] = useState<{
    open: boolean;
    expense?: Expense;
  }>({ open: false });
  const [approveDialog, setApproveDialog] = useState<{
    open: boolean;
    expense?: Expense;
  }>({ open: false });
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    expense?: Expense;
  }>({ open: false });
  const [detailDialog, setDetailDialog] = useState<Expense | null>(null);
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [expensesData, statsData, accountsData, usersData, suppliersData] =
        await Promise.all([
          expensesApi.getAll({
            page,
            limit,
            categoryId: categoryFilter || undefined,
            status: (statusFilter || undefined) as any,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            search: search || undefined,
            paymentType: paymentTypeFilter || undefined,
          }),
          expensesApi.getStats(dateFrom || undefined, dateTo || undefined),
          accountsApi.getAll(),
          usersApi.getAll(),
          suppliersApi.getAll(),
        ]);
      setExpenses(expensesData.data ?? []);
      setTotal(expensesData.total ?? 0);
      setStats(statsData);
      setAccounts(
        Array.isArray(accountsData)
          ? accountsData
          : (accountsData.accounts ?? []),
      );
      setUsers(Array.isArray(usersData) ? usersData : (usersData.data ?? []));
      setSuppliers(
        Array.isArray(suppliersData)
          ? suppliersData
          : (suppliersData.data ?? []),
      );
    } catch (e: any) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter, statusFilter, dateFrom, dateTo, search, paymentTypeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Categories are independent of the list filters — load once (and after the
  // category manager closes, via reloadCategories).
  const reloadCategories = useCallback(async () => {
    try {
      setCategories(await expenseCategoriesApi.list());
    } catch (e) {
      console.error("Failed to load categories:", e);
    }
  }, []);
  useEffect(() => {
    reloadCategories();
  }, [reloadCategories]);

  const handleDelete = async (expense: Expense) => {
    if (!confirm(`Delete "${expense.title}"? This cannot be undone.`)) return;
    try {
      await expensesApi.delete(expense.id);
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const handleVoid = async (expense: Expense) => {
    const reason = prompt(
      `Void "${expense.title}"?\nThis reverses ALL underlying payments.\n\nReason:`,
    );
    if (!reason || !reason.trim()) return;
    try {
      await expensesApi.void(expense.id, { voidReason: reason.trim() });
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const activeFilters = [
    categoryFilter,
    statusFilter,
    dateFrom,
    dateTo,
    paymentTypeFilter,
  ].filter(Boolean).length;

  if (loading && expenses.length === 0) {
    return (
      <div className="min-h-screen bg-muted/50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-[#3c8dbc] mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading expenses…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <div className="px-1 py-1 space-y-1">
        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight px-4">
              Expenses
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground bg-white border border-border rounded-xl hover:bg-muted/50 shadow-sm"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <Link
              to="/expenses/categories"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground bg-white border border-border rounded-xl hover:bg-muted/50 shadow-sm"
            >
              <Filter className="w-3.5 h-3.5" /> Categories
            </Link>
            <button
              onClick={() => setExpenseDialog({ open: true })}
              className="flex items-center gap-2 px-4 py-2 bg-[#3c8dbc] text-white text-sm font-semibold rounded-xl hover:bg-[#367fa9] shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" /> New Expense
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard
              label="Grand Total"
              value={formatCurrency(stats.grandTotal)}
              icon={TrendingUp}
              color="blue"
            />
            <StatCard
              label="Unpaid"
              value={formatCurrency(stats.totalUnpaid)}
              sub={`${stats.totalUnpaidCount} expenses`}
              icon={Clock}
              color="amber"
            />
            <StatCard
              label="Partial"
              value={formatCurrency(stats.totalPartiallyPaid)}
              sub={`${stats.totalPartiallyPaidCount} partly paid`}
              icon={CheckCircle}
              color="slate"
            />
            <StatCard
              label="Paid"
              value={formatCurrency(stats.totalPaid)}
              sub={`${stats.totalPaidCount} settled`}
              icon={Receipt}
              color="emerald"
            />
            <StatCard
              label="Total Count"
              value={stats.count.toString()}
              icon={BarChart3}
              color="violet"
            />
          </div>
        )}

        {/* Breakdowns: by category, by supplier, outstanding payables */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <BreakdownCard
              title="Top Categories"
              rows={[...(stats.byCategory ?? [])]
                .sort((a, b) => Number(b._sum.amount) - Number(a._sum.amount))
                .slice(0, 5)
                .map((c) => ({
                  label: c.category ?? "—",
                  value: formatCurrency(Number(c._sum.amount ?? 0)),
                  sub: `${c._count.id}`,
                }))}
            />
            <BreakdownCard
              title="By Supplier"
              rows={[...(stats.bySupplier ?? [])]
                .sort((a, b) => Number(b._sum.amount) - Number(a._sum.amount))
                .slice(0, 5)
                .map((s) => ({
                  label: s.supplierName ?? "Unspecified",
                  value: formatCurrency(Number(s._sum.amount ?? 0)),
                  sub: `${s._count.id}`,
                }))}
              empty="No supplier-linked expenses"
            />
            <div className="bg-white rounded-xl border border-border shadow-sm p-4 flex flex-col">
              <p className="text-xs font-bold uppercase text-muted-foreground">
                Outstanding Payables
              </p>
              <p className="text-2xl font-bold text-warning mt-2">
                {formatCurrency(Number(stats.outstandingPayables?.amount ?? 0))}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {stats.outstandingPayables?.count ?? 0} unpaid / partially paid
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-auto pt-3">
                Money still owed to suppliers and service providers.
              </p>
            </div>
          </div>
        )}

        {/* Search + Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search title, code, supplier…"
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c8dbc]/20 focus:border-[#3c8dbc]"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${
              showFilters || activeFilters > 0
                ? "bg-[#3c8dbc] text-white shadow-md shadow-blue-200"
                : "bg-white border border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilters > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-xs font-bold bg-white/20 rounded-full">
                {activeFilters}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`}
            />
          </button>
          {activeFilters > 0 && (
            <button
              onClick={() => {
                setCategoryFilter("");
                setStatusFilter("");
                setDateFrom("");
                setDateTo("");
                setPage(1);
                setPaymentTypeFilter("");
              }}
              className="flex items-center gap-1 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-xl border border-border bg-white"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-2 bg-white rounded-xl border border-border shadow-sm">
            {[
              {
                label: "Category",
                value: categoryFilter,
                onChange: (v: string) => {
                  setCategoryFilter(v);
                  setPage(1);
                },
                options: categories.map((c) => ({
                  value: c.id,
                  label: `${c.icon ? `${c.icon} ` : ""}${c.name}`,
                })),
                placeholder: "All Categories",
              },
              {
                label: "Status",
                value: statusFilter,
                onChange: (v: string) => {
                  setStatusFilter(v);
                  setPage(1);
                },
                options: Object.entries(STATUS_CONFIG).map(([k, v]) => ({
                  value: k,
                  label: v.label,
                })),
                placeholder: "All Status",
              },
              {
                label: "Payment Type",
                value: paymentTypeFilter,
                onChange: (v: string) => {
                  setPaymentTypeFilter(v);
                  setPage(1);
                },
                options: [
                  { value: "CASH", label: "💵 Cash" },
                  { value: "CREDIT", label: "💳 Credit" },
                ],
                placeholder: "All Types",
              },
            ].map(({ label, value, onChange, options, placeholder }) => (
              <div key={label}>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                  {label}
                </label>
                <div className="relative">
                  <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-none border border-input focus:border-[#3c8dbc] bg-white text-sm appearance-none"
                  >
                    <option value="">{placeholder}</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-muted-foreground/70 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            ))}
            <div>
              <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-none border border-input focus:border-[#3c8dbc] bg-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-none border border-input focus:border-[#3c8dbc] bg-white text-sm"
              />
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {[
                    "Code",
                    "Title / Supplier",
                    "Category",
                    "Amount",
                    "Date",
                    "Type",
                    "Status",
                    "Payment",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider ${h === "Amount" ? "text-right" : h === "Actions" ? "text-center" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {expenses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-muted-foreground/70"
                    >
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium">No expenses found</p>
                      <p className="text-xs mt-0.5">
                        Try adjusting your filters or create a new expense
                      </p>
                    </td>
                  </tr>
                ) : (
                  expenses.map((exp) => {
                    const supplier = (exp as any).supplier;
                    return (
                      <tr
                        key={exp.id}
                        className="hover:bg-muted/60 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground/70 whitespace-nowrap">
                          {exp.expenseCode}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">
                            {exp.title}
                          </p>
                          {supplier ? (
                            <p className="text-xs text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {supplier.name}
                            </p>
                          ) : (
                            exp.description && (
                              <p className="text-xs text-muted-foreground/70 truncate max-w-[200px]">
                                {exp.description}
                              </p>
                            )
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-muted-foreground">
                            {categoryDisplay(exp)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-foreground whitespace-nowrap">
                            {formatCurrency(exp.amount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(exp.expenseDate)}
                        </td>
                        <td className="px-4 py-3">
                          <PaymentTypeBadge type={(exp as any).paymentType} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={exp.status} />
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const ps =
                              (exp as any).paymentStatus ?? "UNPAID";
                            const pc =
                              PAYMENT_STATUS_CONFIG[ps] ??
                              PAYMENT_STATUS_CONFIG.UNPAID;
                            return (
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${pc.bg} ${pc.text} ${pc.border}`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${pc.dot}`}
                                />
                                {pc.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <RowActions className="justify-center">
                            {(exp.status === "APPROVED" ||
                              exp.status === "POSTED") &&
                              ((exp as any).paymentStatus ?? "UNPAID") !==
                                "PAID" && (
                                <ActionButton
                                  tone="success"
                                  icon={Banknote}
                                  label={((exp as any).paymentStatus ?? "UNPAID") === "PARTIALLY_PAID" ? "Pay Bal." : "Pay"}
                                  onClick={() => setPayDialog({ open: true, expense: exp })}
                                />
                              )}
                            <ActionButton iconOnly tone="view" label="View details" onClick={() => setDetailDialog(exp)} />
                            {(exp.status === "DRAFT" ||
                              exp.status === "APPROVED") &&
                              ((exp as any).paymentStatus ?? "UNPAID") ===
                                "UNPAID" && (
                                <ActionButton iconOnly tone="edit" label="Edit" onClick={() => setExpenseDialog({ open: true, expense: exp })} />
                              )}
                            {exp.status === "DRAFT" && (
                              <>
                                <ActionButton iconOnly tone="success" label="Approve" icon={CheckCircle} onClick={() => setApproveDialog({ open: true, expense: exp })} />
                                <ActionButton iconOnly tone="delete" label="Reject" icon={XCircle} onClick={() => setRejectDialog({ open: true, expense: exp })} />
                              </>
                            )}
                            {exp.status !== "VOID" &&
                              exp.status !== "CANCELLED" && (
                                <ActionButton iconOnly tone="neutral" label="Void (reverse payments)" icon={Ban} onClick={() => handleVoid(exp)} />
                              )}
                            {(exp.status === "DRAFT" ||
                              exp.status === "APPROVED" ||
                              exp.status === "REJECTED" ||
                              exp.status === "CANCELLED" ||
                              exp.status === "VOID") &&
                              (((exp as any).paymentStatus ?? "UNPAID") ===
                                "UNPAID" ||
                                exp.status === "VOID") && (
                                <ActionButton iconOnly tone="delete" label="Delete" onClick={() => handleDelete(exp)} />
                              )}
                          </RowActions>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/50">
              <p className="text-xs text-muted-foreground">
                Showing {Math.min((page - 1) * limit + 1, total)}–
                {Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-border bg-white text-muted-foreground disabled:opacity-40 hover:bg-muted/50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-muted-foreground px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-border bg-white text-muted-foreground disabled:opacity-40 hover:bg-muted/50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {expenseDialog.open && (
        <ExpenseFormDialog
          expense={expenseDialog.expense}
          users={users}
          suppliers={suppliers}
          accounts={accounts}
          categories={categories.filter(
            (c) => c.isActive || c.id === expenseDialog.expense?.categoryId,
          )}
          onClose={() => setExpenseDialog({ open: false })}
          onSaved={() => {
            setExpenseDialog({ open: false });
            load();
          }}
        />
      )}
      {payDialog.open && payDialog.expense && (
        <PayExpenseDialog
          expense={payDialog.expense}
          accounts={accounts}
          users={users}
          onClose={() => setPayDialog({ open: false })}
          onSaved={() => {
            setPayDialog({ open: false });
            load();
          }}
        />
      )}
      {approveDialog.open && approveDialog.expense && (
        <ApproveDialog
          expense={approveDialog.expense}
          users={users}
          onClose={() => setApproveDialog({ open: false })}
          onSaved={() => {
            setApproveDialog({ open: false });
            load();
          }}
        />
      )}
      {rejectDialog.open && rejectDialog.expense && (
        <RejectDialog
          expense={rejectDialog.expense}
          onClose={() => setRejectDialog({ open: false })}
          onSaved={() => {
            setRejectDialog({ open: false });
            load();
          }}
        />
      )}
      {detailDialog && (
        <ExpenseDetailDialog
          expense={detailDialog}
          onClose={() => setDetailDialog(null)}
        />
      )}
    </div>
  );
}
