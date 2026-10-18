import { api } from '@/lib/api/client';
import type { AccountCurrency, AccountType } from '@/lib/api/accounts';

export type CashFlowDirection = 'IN' | 'OUT';

export type CashFlowSource =
  | 'RECEIPT'
  | 'EXPENSE_PAYMENT'
  | 'PURCHASE_PAYMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'OPENING_BALANCE'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'ADJUSTMENT';

export interface CashMovement {
  id: string;
  code: string;
  direction: CashFlowDirection;
  source: CashFlowSource;
  amount: number;
  currency: string;
  /** Converted to base currency (UGX) — the figure totals are built from. */
  baseAmount: number;
  date: string;
  accountId: string | null;
  accountName: string | null;
  accountType: AccountType | null;
  description: string;
  reference: string | null;
  method: string | null;
  party: string | null;
  notes: string | null;
  originType: 'RECEIPT' | 'PAYMENT' | 'TRANSFER' | 'ENTRY';
  originId: string;
}

export interface CashFlowTotals {
  totalIn: number;
  totalOut: number;
  net: number;
  count: number;
  inCount: number;
  outCount: number;
}

export interface AccountBalance {
  accountId: string;
  accountCode: string;
  name: string;
  type: AccountType;
  currency: AccountCurrency;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  balance: number;
  movements: number;
}

export interface CashFlowSummary {
  totals: CashFlowTotals;
  balances: AccountBalance[];
  bySource: {
    source: CashFlowSource;
    totalIn: number;
    totalOut: number;
    count: number;
  }[];
  byCurrency: {
    currency: string;
    totalIn: number;
    totalOut: number;
    net: number;
  }[];
}

export interface MovementsResponse {
  data: CashMovement[];
  totals: CashFlowTotals;
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface CashFlowQuery {
  accountId?: string;
  direction?: CashFlowDirection;
  source?: CashFlowSource;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CashEntryInput {
  accountId: string;
  amount: number;
  description: string;
  reference?: string;
  notes?: string;
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  exchangeRate?: number;
  reference?: string;
  notes?: string;
}

/** Strip empty filter values so the API never sees `?source=` */
const clean = (q: CashFlowQuery = {}) =>
  Object.fromEntries(
    Object.entries(q).filter(([, v]) => v !== undefined && v !== '' && v !== null),
  );

export const cashFlowApi = {
  movements: (query: CashFlowQuery = {}) =>
    api
      .get<MovementsResponse>('/cash-flow/movements', { params: clean(query) })
      .then((r) => r.data),

  summary: (query: CashFlowQuery = {}) =>
    api
      .get<CashFlowSummary>('/cash-flow/summary', { params: clean(query) })
      .then((r) => r.data),

  deposit: (input: CashEntryInput) =>
    api.post('/cash-flow/deposit', input).then((r) => r.data),

  withdraw: (input: CashEntryInput) =>
    api.post('/cash-flow/withdraw', input).then((r) => r.data),

  transfer: (input: TransferInput) =>
    api.post('/cash-flow/transfer', input).then((r) => r.data),
};

export const SOURCE_LABELS: Record<CashFlowSource, string> = {
  RECEIPT: 'Patient receipt',
  EXPENSE_PAYMENT: 'Expense payment',
  PURCHASE_PAYMENT: 'Supplier payment',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  OPENING_BALANCE: 'Opening balance',
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  ADJUSTMENT: 'Adjustment',
};
