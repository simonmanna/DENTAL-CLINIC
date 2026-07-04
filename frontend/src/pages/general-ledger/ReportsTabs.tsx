import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  generalLedgerApi as glApi,
  type StatementRow,
} from '@/lib/api/general-ledger';
import { TableRow, TableCell } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from './components/DataTable';
import { fmtMoney } from './format';

function BalancedBadge({ ok }: { ok: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        ok
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-rose-50 text-rose-700 border-rose-200'
      }
    >
      {ok ? '✓ Balanced' : '✗ Out of balance'}
    </Badge>
  );
}

function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      {children}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-44 h-9"
      />
    </div>
  );
}

// ── Trial Balance ─────────────────────────────────────────────────────────────
export function TrialBalanceTab() {
  const [asOf, setAsOf] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['gl', 'trial-balance', asOf],
    queryFn: () => glApi.trialBalance(asOf || undefined),
  });

  const rows = (data?.rows ?? []).filter(
    (r) => Number(r.debit) || Number(r.credit),
  );

  type Row = (typeof rows)[number];
  const columns: DataTableColumn<Row>[] = [
    {
      key: 'code',
      header: 'Code',
      accessor: (r) => r.code,
      width: 'w-24',
      cell: (r) => <span className="font-mono text-slate-500">{r.code}</span>,
    },
    {
      key: 'name',
      header: 'Account',
      accessor: (r) => r.name,
      cell: (r) => <span className="font-medium text-slate-800">{r.name}</span>,
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
  ];

  return (
    <div className="space-y-4">
      <FilterBar>
        <DateField label="As of" value={asOf} onChange={setAsOf} />
        {data && <BalancedBadge ok={data.totals.balanced} />}
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.code}
        isLoading={isLoading}
        initialSort={{ key: 'code', dir: 'asc' }}
        searchPlaceholder="Search accounts…"
        emptyText="No postings."
        footer={
          data ? (
            <TableRow className="bg-sky-50 font-semibold border-t-2 border-sky-200">
              <TableCell colSpan={2} className="py-2.5 text-[#0369a1]">
                Totals
              </TableCell>
              <TableCell className="py-2.5 text-right font-mono tabular-nums text-[#0369a1]">
                {fmtMoney(data.totals.debit)}
              </TableCell>
              <TableCell className="py-2.5 text-right font-mono tabular-nums text-[#0369a1]">
                {fmtMoney(data.totals.credit)}
              </TableCell>
            </TableRow>
          ) : null
        }
      />
    </div>
  );
}

// ── Statement table (shared by P&L and Balance Sheet) ─────────────────────────
function StatementTable({ rows, totalLabel, total }: { rows: StatementRow[]; totalLabel: string; total: string }) {
  const filtered = rows.filter((r) => Number(r.balance));
  const columns: DataTableColumn<StatementRow>[] = [
    {
      key: 'code',
      header: 'Code',
      accessor: (r) => r.code,
      width: 'w-20',
      cell: (r) => <span className="font-mono text-xs text-slate-500">{r.code}</span>,
    },
    { key: 'name', header: 'Account', accessor: (r) => r.name },
    {
      key: 'balance',
      header: 'Amount',
      align: 'right',
      accessor: (r) => Number(r.balance),
      searchable: false,
      cell: (r) => <span className="font-mono tabular-nums">{fmtMoney(r.balance)}</span>,
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={filtered}
      rowKey={(r) => r.code}
      searchable={false}
      dense
      emptyText="—"
      footer={
        <TableRow className="bg-slate-50 font-semibold border-t">
          <TableCell colSpan={2} className="py-2">
            {totalLabel}
          </TableCell>
          <TableCell className="py-2 text-right font-mono tabular-nums">
            {fmtMoney(total)}
          </TableCell>
        </TableRow>
      }
    />
  );
}

// ── Income Statement ──────────────────────────────────────────────────────────
export function IncomeStatementTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data } = useQuery({
    queryKey: ['gl', 'income-statement', from, to],
    queryFn: () => glApi.incomeStatement(from || undefined, to || undefined),
  });

  return (
    <div className="space-y-4">
      <FilterBar>
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
      </FilterBar>

      {data && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-slate-50/60">
            <CardTitle className="text-base text-[#0369a1]">
              Income Statement (Profit &amp; Loss)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-5">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">
                Revenue
              </h4>
              <StatementTable rows={data.income} totalLabel="Total Revenue" total={data.totals.income} />
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-700 mb-1.5">
                Expenses
              </h4>
              <StatementTable rows={data.expense} totalLabel="Total Expenses" total={data.totals.expense} />
            </div>
            <div
              className="flex items-center justify-between rounded-lg px-4 py-3 text-white"
              style={{ backgroundColor: '#0369a1' }}
            >
              <span className="font-semibold">Net Income</span>
              <span className="font-mono tabular-nums text-lg font-bold">
                {fmtMoney(data.totals.netIncome)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────
export function BalanceSheetTab() {
  const [asOf, setAsOf] = useState('');
  const { data } = useQuery({
    queryKey: ['gl', 'balance-sheet', asOf],
    queryFn: () => glApi.balanceSheet(asOf || undefined),
  });

  return (
    <div className="space-y-4">
      <FilterBar>
        <DateField label="As of" value={asOf} onChange={setAsOf} />
        {data && <BalancedBadge ok={data.totals.balanced} />}
      </FilterBar>

      {data && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b bg-slate-50/60">
              <CardTitle className="text-base text-[#0369a1]">Assets</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <StatementTable rows={data.assets} totalLabel="Total Assets" total={data.totals.assets} />
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b bg-slate-50/60">
              <CardTitle className="text-base text-[#0369a1]">
                Liabilities &amp; Equity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1.5">
                  Liabilities
                </h4>
                <StatementTable
                  rows={data.liabilities}
                  totalLabel="Total Liabilities"
                  total={data.totals.liabilities}
                />
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-700 mb-1.5">
                  Equity
                </h4>
                <StatementTable rows={data.equity} totalLabel="Total Equity" total={data.totals.equity} />
              </div>
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-slate-500">Retained earnings (net income)</span>
                <span className="font-mono tabular-nums">
                  {fmtMoney(data.totals.retainedEarnings)}
                </span>
              </div>
              <div
                className="flex items-center justify-between rounded-lg px-4 py-2.5 text-white"
                style={{ backgroundColor: '#0369a1' }}
              >
                <span className="font-semibold">Total Liabilities &amp; Equity</span>
                <span className="font-mono tabular-nums font-bold">
                  {fmtMoney(data.totals.liabilitiesPlusEquity)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
