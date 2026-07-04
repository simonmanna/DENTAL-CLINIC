// src/components/payments/PaymentModal.tsx
'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Banknote, CreditCard, Smartphone, Building2, Receipt,
  AlertCircle, CheckCircle2, Loader2, Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { Account, PaymentContext, PaymentContextType } from '@/hooks/usePaymentModal';

// ─── Types ────────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'CASH',             label: 'Cash',              icon: Banknote,   color: 'text-green-600' },
  { value: 'BANK_TRANSFER',    label: 'Bank Transfer',     icon: Building2,  color: 'text-blue-600' },
  { value: 'MOBILE_MONEY',     label: 'Mobile Money',      icon: Smartphone, color: 'text-yellow-600' },
  { value: 'CHEQUE',           label: 'Cheque',            icon: Receipt,    color: 'text-purple-600' },
  { value: 'CREDIT_NOTE',      label: 'Credit Note',       icon: CreditCard, color: 'text-orange-600' },
] as const;

type PaymentMethodValue = typeof PAYMENT_METHODS[number]['value'];

const ACCOUNT_TYPE_ICONS: Record<string, React.ElementType> = {
  CASH: Banknote,
  BANK: Building2,
  MOBILE_MONEY: Smartphone,
  PETTY_CASH: Wallet,
};

interface PaymentFormState {
  accountId: string;
  amount: string;
  method: PaymentMethodValue | '';
  reference: string;
  bankName: string;
  chequeNumber: string;
  transactionId: string;
  notes: string;
  paidAt: string;
}

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  contextType: PaymentContextType;
  contextId: string;
  contextData: PaymentContext | undefined;
  isLoadingContext: boolean;
  contextError: Error | null;
  onSubmit: (payload: any) => void;
  isSubmitting: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUGX(amount: number) {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getAccountTypeIcon(type: string) {
  const Icon = ACCOUNT_TYPE_ICONS[type] ?? Wallet;
  return Icon;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentModal({
  open,
  onClose,
  contextType,
  contextId,
  contextData,
  isLoadingContext,
  contextError,
  onSubmit,
  isSubmitting,
}: PaymentModalProps) {
  const defaultForm: PaymentFormState = {
    accountId: '',
    amount: '',
    method: '',
    reference: '',
    bankName: '',
    chequeNumber: '',
    transactionId: '',
    notes: '',
    paidAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  };

  const [form, setForm] = useState<PaymentFormState>(defaultForm);
  const [amountError, setAmountError] = useState('');

  // Pre-fill amount when context loads
  useEffect(() => {
    if (contextData) {
      setForm((f) => ({
        ...f,
        amount: contextData.maxAmount > 0 ? String(contextData.maxAmount.toFixed(0)) : '',
        accountId: contextData.accounts.find((a) => a.isActive)?.id ?? '',
      }));
    }
  }, [contextData]);

  // Reset on open
  useEffect(() => {
    if (!open) {
      setForm(defaultForm);
      setAmountError('');
    }
  }, [open]);

  const selectedAccount = contextData?.accounts.find((a) => a.id === form.accountId);
  const parsedAmount = parseFloat(form.amount) || 0;
  const exceedsBalance = selectedAccount && parsedAmount > selectedAccount.currentBalance;
  const exceedsOutstanding = contextData && parsedAmount > contextData.maxAmount + 0.01;

  const needsBankName   = form.method === 'BANK_TRANSFER' || form.method === 'CHEQUE';
  const needsCheque     = form.method === 'CHEQUE';
  const needsTxId       = form.method === 'MOBILE_MONEY' || form.method === 'BANK_TRANSFER';

  const isValid = form.accountId && form.amount && form.method &&
    parsedAmount > 0 && !exceedsBalance && !exceedsOutstanding;

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({
      contextType,
      contextId,
      accountId: form.accountId,
      amount: parsedAmount,
      method: form.method,
      reference: form.reference || undefined,
      bankName: form.bankName || undefined,
      chequeNumber: form.chequeNumber || undefined,
      transactionId: form.transactionId || undefined,
      notes: form.notes || undefined,
      paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : undefined,
    });
  };

  const contextLabel = contextType === 'PURCHASE_ORDER' ? 'Purchase Order' : 'Expense';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[540px] p-0 gap-0 overflow-hidden">
        {/* ── Header ────────────────────────────────────── */}
        <DialogHeader className="px-6 pt-6 pb-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Banknote className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-white text-lg font-semibold">
                Record Payment
              </DialogTitle>
              <p className="text-slate-300 text-sm mt-0.5">{contextLabel}</p>
            </div>
          </div>

          {/* Context summary */}
          {isLoadingContext ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-3/4 bg-white/10" />
              <Skeleton className="h-6 w-1/2 bg-white/10" />
            </div>
          ) : contextData ? (
            <div className="mt-4 p-3 rounded-xl bg-white/10 backdrop-blur-sm">
              <p className="text-xs text-slate-300 font-medium uppercase tracking-wider">
                {contextLabel}
              </p>
              <p className="text-sm text-white font-medium mt-0.5 truncate">{contextData.label}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-slate-300">Outstanding Balance</span>
                <span className="text-base font-bold text-emerald-400">
                  {formatUGX(contextData.outstanding)}
                </span>
              </div>
            </div>
          ) : contextError ? (
            <Alert variant="destructive" className="mt-3 bg-red-900/50 border-red-700 text-white">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Failed to load payment context</AlertDescription>
            </Alert>
          ) : null}
        </DialogHeader>

        {/* ── Body ──────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Account selection */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">
              Pay From Account <span className="text-red-500">*</span>
            </Label>
            {isLoadingContext ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {contextData?.accounts.map((acc) => {
                  const Icon = getAccountTypeIcon(acc.type);
                  const isSelected = form.accountId === acc.id;
                  const insufficient = parsedAmount > acc.currentBalance;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, accountId: acc.id }))}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all',
                        isSelected
                          ? 'border-slate-800 bg-slate-50'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                        insufficient && parsedAmount > 0 && 'border-red-200 bg-red-50',
                      )}
                    >
                      <div className={cn(
                        'h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0',
                        isSelected ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600',
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{acc.name}</p>
                        <p className={cn(
                          'text-xs font-semibold',
                          insufficient && parsedAmount > 0 ? 'text-red-600' : 'text-emerald-600',
                        )}>
                          {formatUGX(acc.currentBalance)}
                          {insufficient && parsedAmount > 0 && ' — Insufficient'}
                        </p>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-5 w-5 text-slate-800 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-sm font-semibold text-slate-700">
              Amount (UGX) <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                UGX
              </span>
              <Input
                id="amount"
                type="number"
                min="1"
                max={contextData?.maxAmount}
                value={form.amount}
                onChange={(e) => {
                  setForm((f) => ({ ...f, amount: e.target.value }));
                  setAmountError('');
                }}
                className="pl-14 h-11 text-base font-semibold"
                placeholder="0"
              />
            </div>
            {exceedsOutstanding && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Exceeds outstanding balance of {formatUGX(contextData!.maxAmount)}
              </p>
            )}
            {exceedsBalance && !exceedsOutstanding && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Insufficient account balance ({formatUGX(selectedAccount!.currentBalance)})
              </p>
            )}
            {contextData && parsedAmount > 0 && !exceedsOutstanding && !exceedsBalance && (
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Remaining after payment: {formatUGX(contextData.maxAmount - parsedAmount)}
              </p>
            )}
          </div>

          {/* Payment method */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">
              Payment Method <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PAYMENT_METHODS.map((m) => {
                const Icon = m.icon;
                const isSelected = form.method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, method: m.value }))}
                    className={cn(
                      'flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-center transition-all',
                      isSelected
                        ? 'border-slate-800 bg-slate-50'
                        : 'border-slate-200 bg-white hover:border-slate-300',
                    )}
                  >
                    <Icon className={cn('h-5 w-5', isSelected ? 'text-slate-800' : m.color)} />
                    <span className="text-xs font-medium text-slate-700 leading-tight">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditional fields */}
          {(needsBankName || needsTxId || needsCheque) && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Additional Details
              </p>

              {needsBankName && (
                <div className="space-y-1.5">
                  <Label htmlFor="bankName" className="text-sm text-slate-700">Bank Name</Label>
                  <Input
                    id="bankName"
                    value={form.bankName}
                    onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                    placeholder="e.g. Stanbic Bank"
                    className="h-9 bg-white"
                  />
                </div>
              )}

              {needsCheque && (
                <div className="space-y-1.5">
                  <Label htmlFor="chequeNumber" className="text-sm text-slate-700">Cheque Number</Label>
                  <Input
                    id="chequeNumber"
                    value={form.chequeNumber}
                    onChange={(e) => setForm((f) => ({ ...f, chequeNumber: e.target.value }))}
                    placeholder="e.g. CHQ-00123"
                    className="h-9 bg-white"
                  />
                </div>
              )}

              {needsTxId && (
                <div className="space-y-1.5">
                  <Label htmlFor="transactionId" className="text-sm text-slate-700">Transaction ID</Label>
                  <Input
                    id="transactionId"
                    value={form.transactionId}
                    onChange={(e) => setForm((f) => ({ ...f, transactionId: e.target.value }))}
                    placeholder="e.g. MPESA-XXXXXXX"
                    className="h-9 bg-white"
                  />
                </div>
              )}
            </div>
          )}

          {/* Reference & date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reference" className="text-sm font-medium text-slate-700">
                Reference No.
              </Label>
              <Input
                id="reference"
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Optional"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paidAt" className="text-sm font-medium text-slate-700">
                Payment Date
              </Label>
              <Input
                id="paidAt"
                type="datetime-local"
                value={form.paidAt}
                onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm font-medium text-slate-700">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Any additional notes..."
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────── */}
        <DialogFooter className="px-6 py-4 border-t border-slate-200 bg-slate-50 gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="bg-slate-900 hover:bg-slate-800 min-w-[140px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Banknote className="h-4 w-4 mr-2" />
                Pay {parsedAmount > 0 ? formatUGX(parsedAmount) : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
