export interface ReceiptData {
  id: string;
  receiptNumber: string;
  amountReceived: number;
  generatedAt: string;
  generatedBy?: string;
  notes?: string;
  clinic: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    licenseNo?: string;
  };
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    taxPercent: number;
    total: number;
    amountPaid: number;
    balance: number;
    items: Array<{
      id: string;
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
  };
  patient: {
    firstName: string;
    lastName: string;
    patientCode: string;
    phone?: string;
    email?: string;
  };
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    reference?: string;
    receivedBy?: string;
    paidAt: string;
  }>;
  receipts: Array<{
    id: string;
    receiptNumber: string;
    amountReceived: number;
    generatedAt: string;
  }>;
}