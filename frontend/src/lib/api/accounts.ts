import { api } from '@/lib/api/client';

export type AccountType = 'CASH' | 'BANK' | 'MOBILE_MONEY' | 'PETTY_CASH';
export type AccountCurrency = 'UGX' | 'USD' | 'EUR' | 'GBP' | 'KES';

export interface Account {
  id: string;
  accountCode: string;
  name: string;
  type: AccountType;
  currency: AccountCurrency;
  bankName: string | null;
  bankBranch: string | null;
  accountNumber: string | null;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  currentBalance: number;
  orderNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency: AccountCurrency;
  bankName?: string;
  bankBranch?: string;
  accountNumber?: string;
  description?: string;
  isActive?: boolean;
  isDefault?: boolean;
  orderNumber?: number;
}

export type UpdateAccountInput = Partial<CreateAccountInput>;

export interface AccountsResponse {
  data: Account[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const accountsApi = {
  getAll: (params?: Record<string, any>) =>
    api.get<AccountsResponse>('/accounts', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<Account>(`/accounts/${id}`).then((r) => r.data),

  create: (input: CreateAccountInput) =>
    api.post<Account>('/accounts', input).then((r) => r.data),

  update: (id: string, input: UpdateAccountInput) =>
    api.patch<Account>(`/accounts/${id}`, input).then((r) => r.data),

  delete: (id: string) =>
    api.delete<Account>(`/accounts/${id}`).then((r) => r.data),
};