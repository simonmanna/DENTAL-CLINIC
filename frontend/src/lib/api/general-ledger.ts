import { api } from './client';

const BASE = '/general-ledger';

export type LedgerAccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'INCOME'
  | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';
export type JournalStatus = 'POSTED' | 'VOID';

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: LedgerAccountType;
  normalBalance: NormalBalance;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  parentId: string | null;
  /** Number of journal lines posted to this account (drives editability). */
  lineCount?: number;
  hasPostings?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountInput {
  code: string;
  name: string;
  type: LedgerAccountType;
  normalBalance?: NormalBalance;
  description?: string;
  parentId?: string | null;
}
export type UpdateAccountInput = Partial<
  Pick<
    LedgerAccount,
    'code' | 'name' | 'description' | 'isActive' | 'type' | 'parentId'
  >
>;

export interface JournalLineView {
  id: string;
  debit: string;
  credit: string;
  memo: string | null;
  patientId: string | null;
  account: { code: string; name: string; type?: LedgerAccountType };
}
export interface JournalEntryView {
  id: string;
  entryNumber: string;
  date: string;
  memo: string;
  sourceType: string | null;
  sourceId: string | null;
  status: JournalStatus;
  reversesId: string | null;
  lines: JournalLineView[];
}
export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface PostJournalInput {
  memo: string;
  date?: string;
  lines: { code: string; debit?: number; credit?: number; memo?: string }[];
}

export interface TrialBalance {
  asOf: string;
  rows: {
    code: string;
    name: string;
    type: LedgerAccountType;
    normalBalance: NormalBalance;
    debit: string;
    credit: string;
    balance: string;
  }[];
  totals: { debit: string; credit: string; balanced: boolean };
}

export interface AccountLedger {
  account: {
    code: string;
    name: string;
    type: LedgerAccountType;
    normalBalance: NormalBalance;
  };
  opening: string;
  closing: string;
  rows: {
    id: string;
    date: string;
    entryNumber: string;
    memo: string;
    sourceType: string | null;
    debit: string;
    credit: string;
    balance: string;
  }[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface StatementRow {
  code: string;
  name: string;
  type: LedgerAccountType;
  balance: string;
}
export interface IncomeStatement {
  period: { from: string | null; to: string | null };
  income: StatementRow[];
  expense: StatementRow[];
  totals: { income: string; expense: string; netIncome: string };
}
export interface BalanceSheet {
  asOf: string;
  assets: StatementRow[];
  liabilities: StatementRow[];
  equity: StatementRow[];
  totals: {
    assets: string;
    liabilities: string;
    equity: string;
    retainedEarnings: string;
    totalEquityAndRetained: string;
    liabilitiesPlusEquity: string;
    balanced: boolean;
  };
}

export const generalLedgerApi = {
  // Settings — optional double-entry posting toggle
  getAutoPosting: () =>
    api
      .get<{ enabled: boolean }>(`${BASE}/settings/auto-posting`)
      .then((r) => r.data),
  setAutoPosting: (enabled: boolean) =>
    api
      .patch<{ enabled: boolean }>(`${BASE}/settings/auto-posting`, { enabled })
      .then((r) => r.data),

  // Chart of accounts
  listAccounts: () =>
    api.get<LedgerAccount[]>(`${BASE}/accounts`).then((r) => r.data),
  createAccount: (input: CreateAccountInput) =>
    api.post<LedgerAccount>(`${BASE}/accounts`, input).then((r) => r.data),
  updateAccount: (id: string, input: UpdateAccountInput) =>
    api.patch<LedgerAccount>(`${BASE}/accounts/${id}`, input).then((r) => r.data),
  deleteAccount: (id: string) =>
    api.delete(`${BASE}/accounts/${id}`).then((r) => r.data),
  accountLedger: (code: string, params?: Record<string, any>) =>
    api
      .get<AccountLedger>(`${BASE}/accounts/${encodeURIComponent(code)}/ledger`, {
        params,
      })
      .then((r) => r.data),

  // Journal
  getJournal: (params?: Record<string, any>) =>
    api
      .get<Paginated<JournalEntryView>>(`${BASE}/journal`, { params })
      .then((r) => r.data),
  getEntry: (id: string) =>
    api.get<JournalEntryView>(`${BASE}/journal/${id}`).then((r) => r.data),
  postJournal: (input: PostJournalInput) =>
    api.post(`${BASE}/journal`, input).then((r) => r.data),
  reverse: (id: string, reason: string) =>
    api.post(`${BASE}/journal/${id}/reverse`, { reason }).then((r) => r.data),

  // Reports
  trialBalance: (asOf?: string) =>
    api
      .get<TrialBalance>(`${BASE}/trial-balance`, { params: { asOf } })
      .then((r) => r.data),
  incomeStatement: (from?: string, to?: string) =>
    api
      .get<IncomeStatement>(`${BASE}/reports/income-statement`, {
        params: { from, to },
      })
      .then((r) => r.data),
  balanceSheet: (asOf?: string) =>
    api
      .get<BalanceSheet>(`${BASE}/reports/balance-sheet`, { params: { asOf } })
      .then((r) => r.data),
};
