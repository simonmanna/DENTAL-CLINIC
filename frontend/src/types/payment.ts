export type PaymentType = 'INVOICE_RECEIPT' | 'PURCHASE_ORDER' | 'EXPENSE' | 'OTHER';
export type CashFlowDirection = 'IN' | 'OUT';
export type PaymentMethod = 
  | 'CASH' | 'VISA_CARD' | 'MASTERCARD' | 'MTN_MOBILE_MONEY' 
  | 'AIRTEL_MONEY' | 'INSURANCE' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT_NOTE';
export type PaymentStatus = 
  | 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'OPEN' 
  | 'PARTIAL' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'WRITTEN_OFF' | 'INVOICED';

export interface Payment {
  id: string;
  paymentCode: string;
  type: PaymentType;
  direction: CashFlowDirection;
  amount: number;
  baseAmount: number;
  currency: string;
  exchangeRate: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  transactionId: string | null;
  bankName: string | null;
  chequeNumber: string | null;
  notes: string | null;
  receivedBy: string | null;
  recordedById: string | null;
  paidAt: string;
  createdAt: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    patient: { firstName: string; lastName: string };
  } | null;
  purchaseOrder: {
    id: string;
    poNumber: string;
    supplier: { name: string };
  } | null;
  expense: {
    id: string;
    expenseCode: string;
    title: string;
    category: string;
  } | null;
  receiptCount: number;
}

export interface PaymentFilters {
  search?: string;
  type?: PaymentType;
  direction?: CashFlowDirection;
  method?: PaymentMethod;
  status?: PaymentStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}