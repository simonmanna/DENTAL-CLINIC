import { PaymentType, CashFlowDirection, PaymentMethod, PaymentStatus } from '@prisma/client';

export class PaymentResponseDto {
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
  paidAt: Date;
  createdAt: Date;

  // Relations
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