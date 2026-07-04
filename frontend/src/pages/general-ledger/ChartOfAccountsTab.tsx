import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  generalLedgerApi as glApi,
  type LedgerAccount,
  type CreateAccountInput,
} from '@/lib/api/general-ledger';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, BookOpen, Lock, Info } from 'lucide-react';
import { DataTable, type DataTableColumn } from './components/DataTable';
import { GLDialogContent } from './components/GLDialog';
import { fmtMoney, fmtDate, TYPE_BADGE, ACCOUNT_TYPES } from './format';

const emptyForm: CreateAccountInput = {
  code: '',
  name: '',
  type: 'ASSET',
  description: '',
};

export function ChartOfAccountsTab() {
  const qc = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['gl', 'accounts'],
    queryFn: glApi.listAccounts,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerAccount | null>(null);
  const [form, setForm] = useState<CreateAccountInput>(emptyForm);
  const [ledgerCode, setLedgerCode] = useState<string | null>(null);

  // Editability rules. Code / name / description are ALWAYS editable. Only the
  // account TYPE is protected — locked once there are postings (changing it
  // would corrupt historical statements) and for system accounts (structural).
  const editHasPostings = !!editing?.hasPostings || (editing?.lineCount ?? 0) > 0;
  const editIsSystem = !!editing?.isSystem;
  const typeLocked = !!editing && (editIsSystem || editHasPostings);

  const save = useMutation({
    mutationFn: (data: CreateAccountInput) =>
      editing
        ? glApi.updateAccount(editing.id, {
            // `code`/`type` are sent but the backend no-ops them when unchanged
            // and rejects disallowed changes — the UI just hides the controls.
            code: data.code,
            name: data.name,
            description: data.description,
            type: data.type,
          })
        : glApi.createAccount(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gl', 'accounts'] });
      toast.success(editing ? 'Account updated' : 'Account created');
      setDialogOpen(false);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const toggleActive = useMutation({
    mutationFn: (acc: LedgerAccount) =>
      glApi.updateAccount(acc.id, { isActive: !acc.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gl', 'accounts'] }),
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Update failed'),
  });

  const del = useMutation({
    mutationFn: (id: string) => glApi.deleteAccount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gl', 'accounts'] });
      toast.success('Account deleted');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Delete failed'),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };
  const openEdit = (acc: LedgerAccount) => {
    setEditing(acc);
    setForm({
      code: acc.code,
      name: acc.name,
      type: acc.type,
      description: acc.description ?? '',
    });
    setDialogOpen(true);
  };

  const columns: DataTableColumn<LedgerAccount>[] = [
    {
      key: 'code',
      header: 'Code',
      accessor: (a) => a.code,
      width: 'w-24',
      cell: (a) => <span className="font-mono text-slate-600">{a.code}</span>,
    },
    {
      key: 'name',
      header: 'Account Name',
      accessor: (a) => a.name,
      cell: (a) => (
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
          {a.name}
          {a.isSystem && <Lock className="h-3 w-3 text-slate-400" />}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      accessor: (a) => a.type,
      cell: (a) => (
        <Badge variant="outline" className={TYPE_BADGE[a.type]}>
          {a.type}
        </Badge>
      ),
    },
    {
      key: 'normalBalance',
      header: 'Normal',
      accessor: (a) => a.normalBalance,
      cell: (a) => <span className="text-slate-500">{a.normalBalance}</span>,
    },
    {
      key: 'status',
      header: 'Active',
      accessor: (a) => (a.isActive ? 'active' : 'inactive'),
      searchable: false,
      cell: (a) => (
        <Switch
          checked={a.isActive}
          onCheckedChange={() => toggleActive.mutate(a)}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-32',
      cell: (a) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#0369a1] hover:bg-sky-50"
            title="View ledger"
            onClick={() => setLedgerCode(a.code)}
          >
            <BookOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-sky-50"
            title="Edit"
            onClick={() => openEdit(a)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-rose-50"
            title={
              a.isSystem
                ? 'System account — cannot delete'
                : a.hasPostings || (a.lineCount ?? 0) > 0
                  ? 'Has postings — deactivate instead'
                  : 'Delete'
            }
            disabled={a.isSystem || a.hasPostings || (a.lineCount ?? 0) > 0}
            onClick={() => {
              if (confirm(`Delete account ${a.code} — ${a.name}?`))
                del.mutate(a.id);
            }}
          >
            <Trash2 className="h-4 w-4 text-rose-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={accounts}
        rowKey={(a) => a.id}
        isLoading={isLoading}
        searchPlaceholder="Search accounts by code, name or type…"
        initialSort={{ key: 'code', dir: 'asc' }}
        rowClassName={(a) => (!a.isActive ? 'opacity-50' : '')}
        emptyText="No accounts yet."
        toolbar={
          <Button
            onClick={openNew}
            size="sm"
            className="h-9 bg-[#0369a1] hover:bg-[#075985] text-white"
          >
            <Plus className="h-4 w-4 mr-1" /> New Account
          </Button>
        }
      />

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <GLDialogContent
          title={editing ? 'Edit Account' : 'New Account'}
          subtitle={
            editing ? editing.code : 'Add a bucket to your chart of accounts'
          }
          icon={<Pencil className="h-4 w-4" />}
        >
          <div className="space-y-4">
            {editing && (
              <div
                className={
                  'flex items-start gap-2 rounded-md border px-3 py-2 text-xs space-y-2 gap-3' +
                  (editIsSystem
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : editHasPostings
                      ? 'border-sky-200 bg-sky-50 text-sky-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800')
                }
              >
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  {editIsSystem
                    ? 'System account — code, name & description are editable; the account type is fixed.'
                    : editHasPostings
                      ? `This account has ${editing.lineCount ?? 'existing'} posting(s). Code, name & description stay editable; only the type is locked (to protect historical statements).`
                      : 'No postings yet — every field is editable.'}
                </span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className='pb-1 mb-1' >Code</Label>
                <Input
                  value={form.code}
                  placeholder="5400"
                  className="font-mono"
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label className='pb-1 mb-1'>Name</Label>
                <Input
                  value={form.name}
                  placeholder="Marketing Expense"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="flex items-center gap-1 mb-1 pb-1">
                Type {typeLocked && <Lock className="h-3 w-3 text-slate-400" />}
              </Label>
              <Select
                value={form.type}
                disabled={typeLocked}
                onValueChange={(v) => setForm({ ...form, type: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1.5">
                {typeLocked
                  ? editIsSystem
                    ? 'Type is fixed for system accounts.'
                    : 'Type is locked once an account has postings.'
                  : 'Normal balance is derived automatically (Asset/Expense → Debit, otherwise Credit).'}
              </p>
            </div>
            <div>
              <Label className=' mb-1 pb-1'>Description</Label>
              <Input
                value={form.description ?? ''}
                placeholder="Optional"
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#0369a1] hover:bg-[#075985] text-white"
              onClick={() => save.mutate(form)}
              disabled={!form.code || !form.name || save.isPending}
            >
              {save.isPending ? 'Saving…' : 'Save Account'}
            </Button>
          </DialogFooter>
        </GLDialogContent>
      </Dialog>

      <AccountLedgerDialog
        code={ledgerCode}
        onClose={() => setLedgerCode(null)}
      />
    </div>
  );
}

interface LedgerRow {
  id: string;
  date: string;
  entryNumber: string;
  memo: string;
  sourceType: string | null;
  debit: string;
  credit: string;
  balance: string;
}

function AccountLedgerDialog({
  code,
  onClose,
}: {
  code: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['gl', 'ledger', code],
    queryFn: () => glApi.accountLedger(code!),
    enabled: !!code,
  });

  const columns: DataTableColumn<LedgerRow>[] = [
    { key: 'date', header: 'Date', accessor: (r) => r.date, cell: (r) => fmtDate(r.date), width: 'w-28' },
    {
      key: 'entryNumber',
      header: 'Entry #',
      accessor: (r) => r.entryNumber,
      cell: (r) => <span className="font-mono text-xs text-slate-500">{r.entryNumber}</span>,
    },
    {
      key: 'memo',
      header: 'Memo',
      accessor: (r) => r.memo,
      cell: (r) => (
        <span className="block max-w-[260px] truncate" title={r.memo}>
          {r.memo}
        </span>
      ),
    },
    {
      key: 'debit',
      header: 'Debit',
      align: 'right',
      accessor: (r) => Number(r.debit),
      searchable: false,
      cell: (r) => (
        <span className="font-mono tabular-nums">
          {Number(r.debit) ? fmtMoney(r.debit) : ''}
        </span>
      ),
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right',
      accessor: (r) => Number(r.credit),
      searchable: false,
      cell: (r) => (
        <span className="font-mono tabular-nums">
          {Number(r.credit) ? fmtMoney(r.credit) : ''}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      sortable: false,
      cell: (r) => (
        <span className="font-mono tabular-nums font-medium text-slate-800">
          {fmtMoney(r.balance)}
        </span>
      ),
    },
  ];

  return (
    <Dialog open={!!code} onOpenChange={(o) => !o && onClose()}>
      <GLDialogContent
        className="max-w-3xl"
        title={data ? `${data.account.code} — ${data.account.name}` : 'Account Ledger'}
        subtitle={data ? `${data.account.type} · normal ${data.account.normalBalance}` : undefined}
        icon={<BookOpen className="h-4 w-4" />}
      >
        {isLoading && <p className="text-slate-400 py-6">Loading…</p>}
        {data && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Opening</p>
                <p className="font-mono font-semibold text-slate-700">{fmtMoney(data.opening)}</p>
              </div>
              <div className="flex-1 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-[#0369a1]">Closing</p>
                <p className="font-mono font-semibold text-[#0369a1]">{fmtMoney(data.closing)}</p>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-auto">
              <DataTable
                columns={columns}
                data={data.rows}
                rowKey={(r) => r.id}
                searchPlaceholder="Search this account's postings…"
                emptyText="No postings."
                dense
              />
            </div>
          </div>
        )}
      </GLDialogContent>
    </Dialog>
  );
}
