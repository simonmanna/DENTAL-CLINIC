// src/components/pharmacy/PharmacySaleDetailDialog.tsx
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PharmacySale, PharmacySaleStatus } from '@/types/pharmacy-sales';
import { CreditCard, RefreshCw, X } from 'lucide-react';

interface Props {
  sale: PharmacySale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPayment?: (sale: PharmacySale) => void;
  onRefund?: (sale: PharmacySale) => void;
}

export function PharmacySaleDetailDialog({ sale, open, onOpenChange, onAddPayment, onRefund }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-lg">Sale Details</DialogTitle>
              <DialogDescription className="font-mono text-sm mt-1">
                {sale.saleCode}
              </DialogDescription>
            </div>
            <Badge variant={sale.status === PharmacySaleStatus.COMPLETED ? 'secondary' : 'outline'} className="capitalize">
              {sale.status.toLowerCase().replace('_', ' ')}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Patient & Location Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Patient:</span>
                <p className="font-medium">
                  {sale.patient ? `${sale.patient.firstName} ${sale.patient.lastName} (${sale.patient.patientCode})` : 'Walk-in Customer'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Location:</span>
                <p className="font-medium">{sale.location.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>
                <p className="font-medium capitalize">{sale.saleType.toLowerCase()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Date:</span>
                <p className="font-medium">{formatDate(sale.createdAt)}</p>
              </div>
            </div>

            <Separator />

            {/* Items */}
            <div>
              <h4 className="font-medium mb-3">Items ({sale.items.length})</h4>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Drug</th>
                      <th className="text-right p-3 font-medium">Qty</th>
                      <th className="text-right p-3 font-medium">Unit Price</th>
                      <th className="text-right p-3 font-medium">Discount</th>
                      <th className="text-right p-3 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.items.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="p-3">
                          <div className="font-medium">{item.drug.name}</div>
                          {item.drug.category && (
                            <div className="text-xs text-muted-foreground">{item.drug.category.name}</div>
                          )}
                        </td>
                        <td className="text-right p-3">{item.quantity}</td>
                        <td className="text-right p-3">{formatCurrency(item.unitPrice)}</td>
                        <td className="text-right p-3 text-muted-foreground">
                          {item.discount > 0 ? `-${formatCurrency(item.discount)}` : '-'}
                        </td>
                        <td className="text-right p-3 font-medium">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payments */}
            {sale.payments.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium mb-3">Payments ({sale.payments.length})</h4>
                  <div className="space-y-2">
                    {sale.payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between text-sm p-3 bg-muted/30 rounded">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span className="capitalize">{payment.method.toLowerCase()}</span>
                          {payment.reference && (
                            <span className="text-xs text-muted-foreground">({payment.reference})</span>
                          )}
                        </div>
                        <span className="font-medium">{formatCurrency(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Totals */}
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(sale.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium">{formatCurrency(sale.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="text-green-600">{formatCurrency(sale.amountPaid)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="font-medium">Balance</span>
                <span className={`font-bold ${sale.balance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {formatCurrency(sale.balance)}
                </span>
              </div>
            </div>

            {/* Notes */}
            {sale.notes && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2">Notes</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{sale.notes}</p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          {/* {sale.balance > 0 && sale.status !== PharmacySaleStatus.REFUNDED && (
            <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); onAddPayment?.(sale); }}>
              <CreditCard className="mr-2 h-4 w-4" /> Add Payment
            </Button>
          )}
          {sale.status !== PharmacySaleStatus.REFUNDED && (
            <Button variant="destructive" size="sm" onClick={() => { onOpenChange(false); onRefund?.(sale); }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refund
            </Button>
          )} */}
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            <X className="mr-2 h-4 w-4" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}