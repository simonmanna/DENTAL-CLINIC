import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  generalLedgerApi as glApi,
  type LedgerAccount,
  type JournalEntryView,
} from '@/lib/api/general-ledger';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
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
import { Plus, Undo2, Trash2, BookOpen } from 'lucide-react';
import { DataTable, type DataTableColumn } from './components/DataTable';
import { GLDialogContent } from './components/GLDialog';
import { fmtMoney, fmtDate } from './format';

const entryAmount = (e: JournalEntryView) =>
  e.lines.reduce((s, l) => s + Number(l.debit || 0), 0);

interface DraftLine {
  code: string;
  debit: string;
  credit: string;
}
const blankLine = (): DraftLine => ({ code: '', debit: '', credit: '' });

export function JournalTab() {
  const qc = useQueryClient();
  const [postOpen, setPostOpen] = useState(false);
  const [detail, setDetail] = useState<JournalEntryView | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['gl', 'journal'],
    queryFn: () => glApi.getJournal({ page: 1, limit: 250 }),
  });

  const reverse = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      glApi.reverse(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gl'] });
      toast.success('Entry reversed');
      setDetail(null);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Reverse failed'),
  });

  const askReverse = (e: JournalEntryView) => {
    const reason = prompt('Reason for reversal?');
    if (reason && reason.trim().length >= 3)
      reverse.mutate({ id: e.id, reason });
  };

  const columns: DataTableColumn<JournalEntryView>[] = [
    { key: 'date', header: 'Date', accessor: (e) => e.date, cell: (e) => fmtDate(e.date), width: 'w-28' },
    {
      key: 'entryNumber',
      header: 'Entry #',
      accessor: (e) => e.entryNumber,
      cell: (e) => <span className="font-mono text-xs text-slate-500">{e.entryNumber}</span>,
    },
    {
      key: 'memo',
      header: 'Memo',
      accessor: (e) => e.memo,
      cell: (e) => (
        <span className="block max-w-[320px] truncate font-medium text-slate-800" title={e.memo}>
          {e.memo}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      accessor: (e) => e.sourceType ?? '',
      cell: (e) =>
        e.sourceType ? (
          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 font-normal">
            {e.sourceType}
          </Badge>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      accessor: (e) => entryAmount(e),
      searchable: false,
      cell: (e) => <span className="font-mono tabular-nums">{fmtMoney(entryAmount(e))}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (e) => e.status,
      cell: (e) => (
        <Badge
          variant="outline"
          className={
            e.status === 'VOID'
              ? 'bg-slate-100 text-slate-400 border-slate-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }
        >
          {e.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-12',
      cell: (e) =>
        e.status === 'POSTED' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-amber-50"
            title="Reverse entry"
            onClick={(ev) => {
              ev.stopPropagation();
              askReverse(e);
            }}
          >
            <Undo2 className="h-4 w-4 text-amber-600" />
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        pageSize={15}
        initialSort={{ key: 'date', dir: 'desc' }}
        searchPlaceholder="Search journal by memo, entry # or source…"
        onRowClick={(e) => setDetail(e)}
        emptyText="No journal entries yet."
        toolbar={
          <Button
            size="sm"
            className="h-9 bg-[#0369a1] hover:bg-[#075985] text-white"
            onClick={() => setPostOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" /> Manual Entry
          </Button>
        }
      />

      <EntryDetailDialog
        entry={detail}
        onClose={() => setDetail(null)}
        onReverse={askReverse}
      />
      <ManualEntryDialog open={postOpen} onClose={() => setPostOpen(false)} />
    </div>
  );
}

function EntryDetailDialog({
  entry,
  onClose,
  onReverse,
}: {
  entry: JournalEntryView | null;
  onClose: () => void;
  onReverse: (e: JournalEntryView) => void;
}) {
  const totalDr = entry?.lines.reduce((s, l) => s + Number(l.debit || 0), 0) ?? 0;
  const totalCr = entry?.lines.reduce((s, l) => s + Number(l.credit || 0), 0) ?? 0;

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      {entry && (
        <GLDialogContent
          className="max-w-2xl"
          title={entry.entryNumber}
          subtitle={`${fmtDate(entry.date)} · ${entry.memo}`}
          icon={<BookOpen className="h-4 w-4" />}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Badge
                variant="outline"
                className={
                  entry.status === 'VOID'
                    ? 'bg-slate-100 text-slate-400 border-slate-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }
              >
                {entry.status}
              </Badge>
              {entry.sourceType && (
                <span className="text-slate-400">source: {entry.sourceType}</span>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="bg-sky-50 text-[#0369a1] text-[11px] uppercase tracking-wider">
                      Account
                    </TableHead>
                    <TableHead className="bg-sky-50 text-[#0369a1] text-[11px] uppercase tracking-wider text-right">
                      Debit
                    </TableHead>
                    <TableHead className="bg-sky-50 text-[#0369a1] text-[11px] uppercase tracking-wider text-right">
                      Credit
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entry.lines.map((l) => (
                    <TableRow key={l.id} className="border-b border-slate-100">
                      <TableCell className="py-2">
                        <span className="font-mono text-xs text-slate-500 mr-2">
                          {l.account.code}
                        </span>
                        {l.account.name}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums">
                        {Number(l.debit) ? fmtMoney(l.debit) : ''}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums">
                        {Number(l.credit) ? fmtMoney(l.credit) : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-50 font-semibold">
                    <TableCell className="py-2 text-right">Totals</TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">
                      {fmtMoney(totalDr)}
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">
                      {fmtMoney(totalCr)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {entry.status === 'POSTED' && (
              <Button
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => onReverse(entry)}
              >
                <Undo2 className="h-4 w-4 mr-1" /> Reverse Entry
              </Button>
            )}
          </DialogFooter>
        </GLDialogContent>
      )}
    </Dialog>
  );
}

function ManualEntryDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({
    queryKey: ['gl', 'accounts'],
    queryFn: glApi.listAccounts,
    enabled: open,
  });
  const activeAccounts = useMemo(
    () => accounts.filter((a: LedgerAccount) => a.isActive),
    [accounts],
  );

  const [memo, setMemo] = useState('');
  const [date, setDate] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()]);

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 && debit > 0 };
  }, [lines]);

  const post = useMutation({
    mutationFn: () =>
      glApi.postJournal({
        memo,
        date: date || undefined,
        lines: lines
          .filter((l) => l.code && (Number(l.debit) || Number(l.credit)))
          .map((l) => ({
            code: l.code,
            debit: Number(l.debit) || undefined,
            credit: Number(l.credit) || undefined,
          })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gl'] });
      toast.success('Journal entry posted');
      reset();
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Post failed'),
  });

  const reset = () => {
    setMemo('');
    setDate('');
    setLines([blankLine(), blankLine()]);
  };
  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <GLDialogContent
        className="max-w-2xl"
        title="Manual Journal Entry"
        subtitle="Post a balanced entry (e.g. rent, salaries, corrections)"
        icon={<Plus className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Memo</Label>
              <Input
                value={memo}
                placeholder="e.g. Pay June office rent"
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="bg-sky-50 text-[#0369a1] text-[11px] uppercase tracking-wider">
                    Account
                  </TableHead>
                  <TableHead className="bg-sky-50 text-[#0369a1] text-[11px] uppercase tracking-wider text-right w-32">
                    Debit
                  </TableHead>
                  <TableHead className="bg-sky-50 text-[#0369a1] text-[11px] uppercase tracking-wider text-right w-32">
                    Credit
                  </TableHead>
                  <TableHead className="bg-sky-50 w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i} className="border-b border-slate-100">
                    <TableCell className="py-1.5">
                      <Select value={l.code} onValueChange={(v) => setLine(i, { code: v })}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.code}>
                              {a.code} — {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Input
                        type="number"
                        className="h-9 text-right font-mono"
                        value={l.debit}
                        onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })}
                      />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Input
                        type="number"
                        className="h-9 text-right font-mono"
                        value={l.credit}
                        onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })}
                      />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={lines.length <= 2}
                        onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-4 w-4 text-rose-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines((ls) => [...ls, blankLine()])}
            >
              <Plus className="h-4 w-4 mr-1" /> Add line
            </Button>
            <div className="text-sm font-mono tabular-nums">
              DR {fmtMoney(totals.debit)} · CR {fmtMoney(totals.credit)}{' '}
              {totals.balanced ? (
                <span className="text-emerald-600 font-sans font-medium">✓ balanced</span>
              ) : (
                <span className="text-rose-500 font-sans font-medium">✗ unbalanced</span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-[#0369a1] hover:bg-[#075985] text-white"
            onClick={() => post.mutate()}
            disabled={!memo || !totals.balanced || post.isPending}
          >
            {post.isPending ? 'Posting…' : 'Post Entry'}
          </Button>
        </DialogFooter>
      </GLDialogContent>
    </Dialog>
  );
}
