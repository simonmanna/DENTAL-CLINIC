import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

type AccountType = 'CASH' | 'BANK' | 'MOBILE_MONEY' | 'PETTY_CASH';
type AccountCurrency = 'UGX' | 'USD' | 'EUR' | 'GBP' | 'KES';

interface Account {
  id: string;
  accountCode: string;
  name: string;
  type: AccountType;
  currency: AccountCurrency;
  bankName?: string | null;
  accountNumber?: string | null;
  isActive: boolean;
  isDefault: boolean;
}

const ACCOUNT_TYPES: AccountType[] = ['CASH', 'MOBILE_MONEY', 'BANK', 'PETTY_CASH'];
const CURRENCIES: AccountCurrency[] = ['UGX', 'USD', 'EUR', 'GBP', 'KES'];

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: 'Cash',
  BANK: 'Bank',
  MOBILE_MONEY: 'Mobile Money',
  PETTY_CASH: 'Petty Cash',
};

const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  CASH: '💵',
  BANK: '🏦',
  MOBILE_MONEY: '📱',
  PETTY_CASH: '🪙',
};

const ACCOUNT_TYPE_THEMES: Record<AccountType, { card: string; icon: string; text: string }> = {
  CASH: { card: 'border-t-emerald-500', icon: 'bg-emerald-500', text: 'text-emerald-600' },
  BANK: { card: 'border-t-blue-500', icon: 'bg-blue-500', text: 'text-blue-600' },
  MOBILE_MONEY: { card: 'border-t-orange-500', icon: 'bg-orange-500', text: 'text-orange-600' },
  PETTY_CASH: { card: 'border-t-purple-500', icon: 'bg-purple-500', text: 'text-purple-600' },
};

const useAccounts = () =>
  useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then(r => r.data),
  });

const useSaveAccount = (editingId: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      editingId
        ? api.patch(`/accounts/${editingId}`, data).then(r => r.data)
        : api.post('/accounts', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(editingId ? 'Account updated' : 'Account created');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message ?? 'Save failed'),
  });
};

const defaultForm = {
  name: '',
  type: 'CASH' as AccountType,
  currency: 'UGX' as AccountCurrency,
  bankName: '',
  accountNumber: '',
  isDefault: false,
};

export default function AccountsPage() {
  const { data: accounts = [] } = useAccounts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form, setForm] = useState(defaultForm);
  const save = useSaveAccount(editingAccount?.id ?? null);

  const openCreate = () => {
    setEditingAccount(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (acc: Account) => {
    setEditingAccount(acc);
    setForm({
      name: acc.name,
      type: acc.type,
      currency: acc.currency,
      bankName: acc.bankName ?? '',
      accountNumber: acc.accountNumber ?? '',
      isDefault: acc.isDefault,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('Account name is required');
      return;
    }
    save.mutate(form, { onSuccess: () => setDialogOpen(false) });
  };

  const grouped = ACCOUNT_TYPES.reduce<Record<AccountType, Account[]>>((acc, type) => {
    acc[type] = accounts.filter(a => a.type === type);
    return acc;
  }, {} as any);

  return (
    <div className="p-6 space-y-8 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">FINANCIAL ACCOUNTS</h1>
          <p className="text-slate-500 text-sm font-medium">Accounts &amp; payment modes used on receipts and payments</p>
        </div>
        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200">
          <Plus className="mr-2 h-4 w-4" /> Add Account
        </Button>
      </div>

      <div className="space-y-4">
        {ACCOUNT_TYPES.map(type => {
          const typeAccounts = grouped[type];
          if (typeAccounts.length === 0) return null;
          const theme = ACCOUNT_TYPE_THEMES[type];

          return (
            <div key={type} className="space-y-2">
              <div className="flex items-center gap-1">
                <div className={cn('h-8 w-1 rounded-full', theme.icon)} />
                <h3 className="font-black text-slate-700 uppercase tracking-wider text-sm">
                  {ACCOUNT_TYPE_LABELS[type]}
                </h3>
                <Badge variant="outline" className="bg-white text-slate-500 border-slate-200">
                  {typeAccounts.length} Accounts
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {typeAccounts.map(acc => (
                  <div
                    key={acc.id}
                    className={cn(
                      'relative bg-white rounded-lg shadow-sm border-t-4 transition-all hover:shadow-md',
                      theme.card,
                    )}
                  >
                    <div className="p-5">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className={cn('p-2 rounded-lg text-white shadow-inner', theme.icon)}>
                            {ACCOUNT_TYPE_ICONS[type]}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-800 leading-none">{acc.name}</h4>
                              {acc.isDefault && (
                                <span className="bg-slate-100 text-slate-500 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">Main</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono mt-1 uppercase tracking-tighter">
                              {acc.bankName || ACCOUNT_TYPE_LABELS[type]} · {acc.currency}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(acc)}
                          className="h-8 w-8 text-slate-400 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="bg-slate-50/50 px-5 py-2 border-t border-slate-100 rounded-b-lg flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Code: {acc.accountCode}</span>
                      <span className={cn('text-[10px] font-bold uppercase', theme.text)}>{ACCOUNT_TYPE_LABELS[type]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {accounts.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-100 p-12 text-center text-slate-400">
            No accounts yet. Click "Add Account" to create one.
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none rounded-2xl">
          <div className="bg-indigo-600 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <div className="bg-white/20 p-2 rounded-lg"><Wallet className="h-5 w-5 text-white" /></div>
                {editingAccount ? 'Edit Account' : 'New Account'}
              </DialogTitle>
              <p className="text-indigo-100 text-xs mt-1">Accounts and modes shown on receipts &amp; payments.</p>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase">Account Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                placeholder="e.g. Main Operations Bank"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Type</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as AccountType })}>
                  <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v as AccountCurrency })}>
                  <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase">Bank / Provider (optional)</Label>
              <Input
                value={form.bankName}
                onChange={e => setForm({ ...form, bankName: e.target.value })}
                className="bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                placeholder="e.g. Stanbic, MTN"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase">Account / Phone Number (optional)</Label>
              <Input
                value={form.accountNumber}
                onChange={e => setForm({ ...form, accountNumber: e.target.value })}
                className="bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                placeholder="e.g. 9030001234567"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
              <div className="space-y-0.5">
                <Label className="text-indigo-900 font-bold text-sm">Default Account</Label>
                <p className="text-[10px] text-indigo-600 font-medium">Primary source for {form.currency} transactions</p>
              </div>
              <Switch checked={form.isDefault} onCheckedChange={v => setForm({ ...form, isDefault: v })} />
            </div>
          </div>

          <DialogFooter className="p-6 bg-slate-50 flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-slate-500 font-bold">CANCEL</Button>
            <Button onClick={handleSave} disabled={save.isPending} className="bg-indigo-600 hover:bg-indigo-700 px-6 font-bold shadow-md">
              {editingAccount ? 'UPDATE ACCOUNT' : 'SAVE ACCOUNT'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
