import type { LedgerAccountType } from '@/lib/api/general-ledger';

/** Format a numeric string/number with thousands separators and 2dp. */
export function fmtMoney(v: string | number | null | undefined): string {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export const TYPE_BADGE: Record<LedgerAccountType, string> = {
  ASSET: 'bg-primary-muted text-primary border-primary/25',
  LIABILITY: 'bg-warning-muted text-warning border-warning/25',
  EQUITY: 'bg-purple-100 text-purple-700 border-purple-200',
  INCOME: 'bg-success-muted text-success border-success/25',
  EXPENSE: 'bg-danger-muted text-danger border-danger/25',
};

export const ACCOUNT_TYPES: LedgerAccountType[] = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE',
];
