import axios from 'axios'; // use your configured axios instance

const API_URL = '/api/accounts';

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
    axios.get<AccountsResponse>(API_URL, { params }).then((r) => r.data),

  getById: (id: string) =>
    axios.get<Account>(`${API_URL}/${id}`).then((r) => r.data),

  create: (input: CreateAccountInput) =>
    axios.post<Account>(API_URL, input).then((r) => r.data),

  update: (id: string, input: UpdateAccountInput) =>
    axios.patch<Account>(`${API_URL}/${id}`, input).then((r) => r.data),

  delete: (id: string) =>
    axios.delete<Account>(`${API_URL}/${id}`).then((r) => r.data),
};