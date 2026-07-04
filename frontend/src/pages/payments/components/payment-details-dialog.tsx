import { Payment } from '@/types/payment';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PaymentStatusBadge } from './payment-status-badge';
import { PaymentMethodBadge } from './payment-method-badge';
import { ArrowDownLeft, ArrowUpRight, Calendar, User, Receipt, Banknote } from 'lucide-react';

interface Props {
  payment: Payment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaymentDetailsDialog({ payment, open, onOpenChange }: Props) {
  if (!payment) return null;

  const isIncoming = payment.direction === 'IN';
  const formattedAmount = new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: payment.currency,
  }).format(payment.amount);

  const formattedBase = new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: payment.currency || 'UGX',
  }).format(payment.baseAmount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Payment {payment.paymentCode}</span>
            <PaymentStatusBadge status={payment.status} />
          </DialogTitle>
        </DialogHeader>

        {/* Amount Header */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isIncoming ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {isIncoming ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{isIncoming ? 'Money In' : 'Money Out'}</p>
              <p className="text-2xl font-bold">{formattedAmount}</p>
            </div>
          </div>
          <div className="text-right">
            <Badge variant="outline">{payment.type.replace(/_/g, ' ')}</Badge>
            <p className="text-xs text-muted-foreground mt-1">
              Base: {formattedBase} @ {payment.exchangeRate}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Banknote className="h-4 w-4" /> Payment Details
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method</span>
                  <PaymentMethodBadge method={payment.method} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono">{payment.reference || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction ID</span>
                  <span className="font-mono">{payment.transactionId || '—'}</span>
                </div>
                {payment.bankName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank</span>
                    <span>{payment.bankName}</span>
                  </div>
                )}
                {payment.chequeNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cheque No.</span>
                    <span>{payment.chequeNumber}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Dates
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid At</span>
                  <span>{new Date(payment.paidAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(payment.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Source Document
              </h4>
              <div className="space-y-2 text-sm">
                {payment.invoice && (
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Invoice</p>
                    <p className="font-medium">{payment.invoice.invoiceNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {payment.invoice.patient.firstName} {payment.invoice.patient.lastName}
                    </p>
                  </div>
                )}
                {payment.purchaseOrder && (
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Purchase Order</p>
                    <p className="font-medium">{payment.purchaseOrder.poNumber}</p>
                    <p className="text-sm text-muted-foreground">{payment.purchaseOrder.supplier.name}</p>
                  </div>
                )}
                {payment.expense && (
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Expense</p>
                    <p className="font-medium">{payment.expense.expenseCode}</p>
                    <p className="text-sm">{payment.expense.title}</p>
                    <Badge variant="secondary" className="mt-1 text-xs">{payment.expense.category}</Badge>
                  </div>
                )}
                {!payment.invoice && !payment.purchaseOrder && !payment.expense && (
                  <p className="text-sm text-muted-foreground italic">No linked document</p>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <User className="h-4 w-4" /> People
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Received By</span>
                  <span>{payment.receivedBy || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recorded By</span>
                  <span className="font-mono text-xs">{payment.recordedById || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipts</span>
                  <span>{payment.receiptCount} issued</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {payment.notes && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-semibold mb-1">Notes</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{payment.notes}</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}