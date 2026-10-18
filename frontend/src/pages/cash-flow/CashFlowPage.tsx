import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Landmark,
  RefreshCw,
  Scale,
  Search,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { accountsApi, type Account, type AccountType } from '@/lib/api/accounts';
import {
  cashFlowApi,
  SOURCE_LABELS,
  type CashFlowDirection,
  type CashFlowSource,
  type CashMovement,
} from '@/lib/api/cash-flow';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: 'Cash',
  BANK: 'Bank',
  MOBILE_MONEY: 'Mobile Money',
  PETTY_CASH: 'Petty Cash',
};

const SOURCES: CashFlowSource[] = [
  'RECEIPT',
  'EXPENSE_PAYMENT',
  'PURCHASE_PAYMENT',
  'DEPOSIT',
  'WITHDRAWAL',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT',
  'OPENING_BALANCE',
];

const SOURCE_BADGE: Record<CashFlowSource, string> = {
  RECEIPT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPENSE_PAYMENT: 'bg-red-50 text-red-700 border-red-200',
  PURCHASE_PAYMENT: 'bg-orange-50 text-orange-700 border-orange-200',
  TRANSFER_IN: 'bg-blue-50 text-blue-700 border-blue-200',
  TRANSFER_OUT: 'bg-blue-50 text-blue-700 border-blue-200',
  OPENING_BALANCE: 'bg-slate-100 text-slate-600 border-slate-200',
  DEPOSIT: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  WITHDRAWAL: 'bg-purple-50 text-purple-700 border-purple-200',
  ADJUSTMENT: 'bg-amber-50 text-amber-700 border-amber-200',
};

/** Figures that span accounts are summed in the clinic's base currency. */
const BASE_CURRENCY = 'UGX';

const money = (v: number, currency?: string) =>
  `${currency ? `${currency} ` : ''}${Number(v ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateTime = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
};

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const today = () => new Date().toISOString().slice(0, 10);

type DialogMode = 'deposit' | 'withdraw' | 'transfer' | null;

const emptyEntry = {
  accountId: '',
  toAccountId: '',
  amount: '',
  description: '',
  reference: '',
  notes: '',
};

export default function CashFlowPage() {
  const qc = useQueryClient();

  const [accountId, setAccountId] = useState('all');
  const [direction, setDirection] = useState<'all' | CashFlowDirection>('all');
  const [source, setSource] = useState<'all' | CashFlowSource>('all');
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [form, setForm] = useState(emptyEntry);

  const filters = useMemo(
    () => ({
      accountId: accountId === 'all' ? undefined : accountId,
      direction: direction === 'all' ? undefined : direction,
      source: source === 'all' ? undefined : source,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      search: search || undefined,
    }),
    [accountId, direction, source, startDate, endDate, search],
  );

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    // The accounts endpoint returns a bare array.
    queryFn: () => accountsApi.getAll() as unknown as Promise<Account[]>,
  });
  const accounts = (
    Array.isArray(accountsQuery.data)
      ? accountsQuery.data
      : (accountsQuery.data as any)?.data ?? []
  ) as Account[];

  const summaryQuery = useQuery({
    queryKey: ['cash-flow', 'summary', filters],
    queryFn: () => cashFlowApi.summary(filters),
  });

  const movementsQuery = useQuery({
    queryKey: ['cash-flow', 'movements', filters, page],
    queryFn: () => cashFlowApi.movements({ ...filters, page, limit: 25 }),
  });

  const totals = summaryQuery.data?.totals ?? movementsQuery.data?.totals;
  const balances = summaryQuery.data?.balances ?? [];
  const movements = movementsQuery.data?.data ?? [];
  const meta = movementsQuery.data?.meta;

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['cash-flow'] });
    qc.invalidateQueries({ queryKey: ['accounts'] });
  };

  const submit = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      if (!(amount > 0)) throw new Error('Enter an amount greater than 0');

      if (dialogMode === 'transfer') {
        if (!form.accountId || !form.toAccountId) {
          throw new Error('Pick both accounts');
        }
        if (form.accountId === form.toAccountId) {
          throw new Error('Pick two different accounts');
        }
        return cashFlowApi.transfer({
          fromAccountId: form.accountId,
          toAccountId: form.toAccountId,
          amount,
          reference: form.reference || undefined,
          notes: form.notes || undefined,
        });
      }

      if (!form.accountId) throw new Error('Pick an account');
      if (!form.description.trim()) throw new Error('Describe the movement');

      const payload = {
        accountId: form.accountId,
        amount,
        description: form.description.trim(),
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      };
      return dialogMode === 'deposit'
        ? cashFlowApi.deposit(payload)
        : cashFlowApi.withdraw(payload);
    },
    onSuccess: () => {
      toast.success(
        dialogMode === 'deposit'
          ? 'Deposit recorded'
          : dialogMode === 'withdraw'
            ? 'Withdrawal recorded'
            : 'Transfer recorded',
      );
      setDialogMode(null);
      setForm(emptyEntry);
      refreshAll();
    },
    onError: (err: any) =>
      toast.error(
        err?.response?.data?.message ?? err?.message ?? 'Could not save',
      ),
  });

  const openDialog = (mode: Exclude<DialogMode, null>) => {
    const fallback = accounts.find((a) => a.isDefault) ?? accounts[0];
    setForm({ ...emptyEntry, accountId: fallback?.id ?? '' });
    setDialogMode(mode);
  };

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const resetFilters = () => {
    setAccountId('all');
    setDirection('all');
    setSource('all');
    setStartDate(firstOfMonth());
    setEndDate(today());
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const loading = movementsQuery.isLoading || summaryQuery.isLoading;

  return (
    <div className="p-6 space-y-6 bg-muted/50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">CASH FLOW</h1>
          <p className="text-muted-foreground text-sm font-medium">
            Every movement of money — receipts, payments, deposits, withdrawals and transfers
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={refreshAll}
            className="bg-white"
            disabled={loading}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            onClick={() => openDialog('deposit')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <ArrowDownLeft className="mr-2 h-4 w-4" /> Deposit
          </Button>
          <Button
            onClick={() => openDialog('withdraw')}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            <ArrowUpRight className="mr-2 h-4 w-4" /> Withdraw
          </Button>
          <Button
            onClick={() => openDialog('transfer')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <ArrowLeftRight className="mr-2 h-4 w-4" /> Transfer
          </Button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Cash In"
          value={money(totals?.totalIn ?? 0, BASE_CURRENCY)}
          hint={`${totals?.inCount ?? 0} movements`}
          icon={<ArrowDownLeft className="h-5 w-5" />}
          tone="bg-emerald-500"
        />
        <StatCard
          label="Cash Out"
          value={money(totals?.totalOut ?? 0, BASE_CURRENCY)}
          hint={`${totals?.outCount ?? 0} movements`}
          icon={<ArrowUpRight className="h-5 w-5" />}
          tone="bg-rose-500"
        />
        <StatCard
          label="Net Movement"
          value={money(totals?.net ?? 0, BASE_CURRENCY)}
          hint={`${totals?.count ?? 0} in the selected period`}
          icon={<Scale className="h-5 w-5" />}
          tone={(totals?.net ?? 0) >= 0 ? 'bg-blue-500' : 'bg-amber-500'}
        />
        <StatCard
          label="Cash On Hand"
          value={money(
            balances.reduce((t, b) => t + b.balance, 0),
            BASE_CURRENCY,
          )}
          hint={`${balances.length} active accounts`}
          icon={<Wallet className="h-5 w-5" />}
          tone="bg-indigo-500"
        />
      </div>

      {/* Account balances */}
      <div className="bg-white rounded-lg border border-border/60 shadow-sm">
        <div className="px-5 py-3 border-b border-border/60 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-indigo-600" />
          <h2 className="font-black text-sm uppercase tracking-wider">Account Balances</h2>
          <span className="text-[11px] text-muted-foreground">
            life-to-date, in {BASE_CURRENCY}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-bold px-5 py-2">Account</th>
                <th className="text-left font-bold px-3 py-2">Type</th>
                <th className="text-right font-bold px-3 py-2">Opening</th>
                <th className="text-right font-bold px-3 py-2">In</th>
                <th className="text-right font-bold px-3 py-2">Out</th>
                <th className="text-right font-bold px-5 py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr
                  key={b.accountId}
                  className="border-t border-border/50 hover:bg-muted/40 cursor-pointer"
                  onClick={() => {
                    setAccountId(b.accountId);
                    setPage(1);
                  }}
                >
                  <td className="px-5 py-2">
                    <div className="font-bold text-foreground">{b.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {b.accountCode} · {b.currency}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {ACCOUNT_TYPE_LABELS[b.type] ?? b.type}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {money(b.openingBalance)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-600 font-semibold">
                    {money(b.totalIn)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-600 font-semibold">
                    {money(b.totalOut)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums font-black">
                    {money(b.balance, BASE_CURRENCY)}
                  </td>
                </tr>
              ))}
              {balances.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                    No active accounts yet. Add one on the Accounts page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-border/60 shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-muted-foreground uppercase">Account</Label>
            <Select
              value={accountId}
              onValueChange={(v) => {
                setAccountId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-muted-foreground uppercase">Direction</Label>
            <Select
              value={direction}
              onValueChange={(v) => {
                setDirection(v as any);
                setPage(1);
              }}
            >
              <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">In &amp; out</SelectItem>
                <SelectItem value="IN">Cash in</SelectItem>
                <SelectItem value="OUT">Cash out</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-muted-foreground uppercase">Movement type</Label>
            <Select
              value={source}
              onValueChange={(v) => {
                setSource(v as any);
                setPage(1);
              }}
            >
              <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-muted-foreground uppercase">From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="bg-muted/50"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-muted-foreground uppercase">To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="bg-muted/50"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <form onSubmit={applySearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by code, description, patient, supplier, reference…"
                className="pl-9 bg-muted/50"
              />
            </div>
            <Button type="submit" variant="outline" className="bg-white">Search</Button>
          </form>
          <Button variant="ghost" onClick={resetFilters} className="text-muted-foreground">
            Reset
          </Button>
        </div>
      </div>

      {/* Movements */}
      <div className="bg-white rounded-lg border border-border/60 shadow-sm">
        <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-indigo-600" />
            <h2 className="font-black text-sm uppercase tracking-wider">Cash Movements</h2>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {meta?.total ?? 0} movements
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-bold px-5 py-2">Date</th>
                <th className="text-left font-bold px-3 py-2">Reference</th>
                <th className="text-left font-bold px-3 py-2">Type</th>
                <th className="text-left font-bold px-3 py-2">Description</th>
                <th className="text-left font-bold px-3 py-2">Account</th>
                <th className="text-right font-bold px-3 py-2">In</th>
                <th className="text-right font-bold px-5 py-2">Out</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <MovementRow key={m.id} movement={m} />
              ))}
              {movements.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                    No cash movements in this period.
                  </td>
                </tr>
              )}
              {loading && movements.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                    Loading movements…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(meta?.totalPages ?? 1) > 1 && (
          <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Page {meta?.page} of {meta?.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-white"
                disabled={(meta?.page ?? 1) <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-white"
                disabled={(meta?.page ?? 1) >= (meta?.totalPages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Deposit / Withdraw / Transfer */}
      <Dialog open={dialogMode !== null} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none rounded-2xl">
          <div
            className={cn(
              'p-6 text-white',
              dialogMode === 'deposit' && 'bg-emerald-600',
              dialogMode === 'withdraw' && 'bg-rose-600',
              dialogMode === 'transfer' && 'bg-indigo-600',
            )}
          >
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {dialogMode === 'deposit'
                  ? 'Record Deposit'
                  : dialogMode === 'withdraw'
                    ? 'Record Withdrawal'
                    : 'Transfer Between Accounts'}
              </DialogTitle>
              <p className="text-white/80 text-xs mt-1">
                {dialogMode === 'transfer'
                  ? 'Moves money out of one account and into another.'
                  : 'Posts a single movement against the chosen account.'}
              </p>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                {dialogMode === 'transfer' ? 'From account' : 'Account'}
              </Label>
              <Select
                value={form.accountId}
                onValueChange={(v) => setForm({ ...form, accountId: v })}
              >
                <SelectTrigger className="bg-muted/50">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dialogMode === 'transfer' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground uppercase">To account</Label>
                <Select
                  value={form.toAccountId}
                  onValueChange={(v) => setForm({ ...form, toAccountId: v })}
                >
                  <SelectTrigger className="bg-muted/50">
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.id !== form.accountId)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="bg-muted/50"
                placeholder="0.00"
              />
            </div>

            {dialogMode !== 'transfer' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="bg-muted/50"
                  placeholder={
                    dialogMode === 'deposit'
                      ? 'e.g. Cash banked from reception'
                      : 'e.g. Cash taken to buy supplies'
                  }
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                Reference (optional)
              </Label>
              <Input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                className="bg-muted/50"
                placeholder="e.g. bank slip number"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                Notes (optional)
              </Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="bg-muted/50"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="p-6 bg-muted/50 flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setDialogMode(null)}
              className="text-muted-foreground font-bold"
            >
              CANCEL
            </Button>
            <Button
              onClick={() => submit.mutate()}
              disabled={submit.isPending}
              className={cn(
                'px-6 font-bold shadow-md text-white',
                dialogMode === 'deposit' && 'bg-emerald-600 hover:bg-emerald-700',
                dialogMode === 'withdraw' && 'bg-rose-600 hover:bg-rose-700',
                dialogMode === 'transfer' && 'bg-indigo-600 hover:bg-indigo-700',
              )}
            >
              {submit.isPending ? 'SAVING…' : 'SAVE MOVEMENT'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-border/60 shadow-sm p-4 flex items-center gap-3">
      <div className={cn('p-2.5 rounded-lg text-white shadow-inner', tone)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="text-lg font-black tabular-nums leading-tight truncate">{value}</p>
        <p className="text-[11px] text-muted-foreground/70">{hint}</p>
      </div>
    </div>
  );
}

/** Native amount, plus the base-currency equivalent when the two differ. */
function Amount({ movement: m }: { movement: CashMovement }) {
  return (
    <>
      <div>{money(m.amount, m.currency)}</div>
      {m.currency !== BASE_CURRENCY && (
        <div className="text-[11px] font-normal text-muted-foreground">
          = {money(m.baseAmount, BASE_CURRENCY)}
        </div>
      )}
    </>
  );
}

function MovementRow({ movement: m }: { movement: CashMovement }) {
  const isIn = m.direction === 'IN';
  return (
    <tr className="border-t border-border/50 hover:bg-muted/40">
      <td className="px-5 py-2 whitespace-nowrap text-muted-foreground">{dateTime(m.date)}</td>
      <td className="px-3 py-2 font-mono text-[11px]">
        <div className="font-bold text-foreground">{m.code}</div>
        {m.reference && <div className="text-muted-foreground">{m.reference}</div>}
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline" className={cn('font-bold text-[10px]', SOURCE_BADGE[m.source])}>
          {SOURCE_LABELS[m.source] ?? m.source}
        </Badge>
      </td>
      <td className="px-3 py-2">
        <div className="text-foreground">{m.description}</div>
        {m.method && (
          <div className="text-[11px] text-muted-foreground">
            {m.method.toLowerCase().replace(/_/g, ' ')}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{m.accountName ?? '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600">
        {isIn ? <Amount movement={m} /> : ''}
      </td>
      <td className="px-5 py-2 text-right tabular-nums font-semibold text-rose-600">
        {isIn ? '' : <Amount movement={m} />}
      </td>
    </tr>
  );
}
