export class ReceiptResponseDto {
  id: string;
  receiptNumber: string;
  invoiceId: string;
  paymentId?: string;
  amountReceived: number;
  generatedAt: Date;
  generatedBy?: string;
  notes?: string;
  invoice: {
    invoiceNumber: string;
    total: number;
    amountPaid: number;
    balance: number;
    patient: {
      firstName: string;
      lastName: string;
      patientCode: string;
    };
  };
}
