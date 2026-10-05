import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStockTransactions } from '../../pages/pharmacy/drugs.hooks';
import type { Drug } from '../../pages/pharmacy/drugs.types';
import { STOCK_TRANSACTION_TYPES } from '../../pages/pharmacy/drugs.types';

interface Props {
  open: boolean;
  drug: Drug;
  onClose: () => void;
}

const UGX = (n: number) =>
  new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(n);

export function DrugDetailDialog({ open, drug, onClose }: Props) {
  const { transactions, loading } = useStockTransactions(open ? drug.id : '');

  const isLow = drug.stockQuantity > 0 && drug.stockQuantity <= drug.minStock;
  const isOut = drug.stockQuantity === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg">{drug.name}</DialogTitle>
          {drug.genericName && (
            <p className="text-sm text-muted-foreground">{drug.genericName}</p>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-4 pb-6">
            {/* Drug info grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Category', drug.category],
                ['Form', drug.form ?? '—'],
                ['Strength', drug.strength ?? '—'],
                // ['Manufacturer', drug.manufacturer ?? '—'],
                ['Unit', drug.unit],
                [
                  'Prescription',
                  drug.requiresPrescription ? 'Required' : 'Not required',
                ],
              ].map(([label, value]) => (
                <div key={label} className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground/70">{label}</p>
                  <p className="text-sm font-medium capitalize">{value}</p>
                </div>
              ))}
            </div>

            {/* Stock & Pricing */}
            <div className="grid grid-cols-3 gap-3">
              <div
                className={cn(
                  'rounded-lg p-3 text-center border-2',
                  isOut
                    ? 'border-danger/25 bg-danger-muted/60'
                    : isLow
                    ? 'border-warning/25 bg-warning-muted/60'
                    : 'border-success/25 bg-success-muted/60',
                )}
              >
                <p className="text-xs text-muted-foreground">Stock</p>
                <p
                  className={cn(
                    'text-2xl font-bold',
                    isOut
                      ? 'text-danger'
                      : isLow
                      ? 'text-warning'
                      : 'text-success',
                  )}
                >
                  {drug.stockQuantity}
                </p>
                <p className="text-xs text-muted-foreground/70">Min: {drug.minStock}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground/70">Cost Price</p>
                <p className="text-sm font-bold">{UGX(drug.unitPrice)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground/70">Sell Price</p>
                <p className="text-sm font-bold text-success">{UGX(drug.sellPrice)}</p>
              </div>
            </div>

            <Separator />

            {/* Transaction history */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Stock History</h4>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground/70 text-center py-6">
                  No stock transactions yet
                </p>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx) => {
                    const info = STOCK_TRANSACTION_TYPES.find(
                      (t) => t.value === tx.type,
                    );
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/60"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                              info?.isInflow
                                ? 'bg-success-muted'
                                : 'bg-danger-muted',
                            )}
                          >
                            {info?.isInflow ? (
                              <ArrowUp className="w-3.5 h-3.5 text-success" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-danger" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {info?.label ?? tx.type}
                            </p>
                            <p className="text-xs text-muted-foreground/70">
                              {new Date(tx.createdAt).toLocaleDateString(
                                'en-UG',
                                {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                },
                              )}
                              {tx.reference && ` · ${tx.reference}`}
                              {tx.batchNumber && ` · Batch: ${tx.batchNumber}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={cn(
                              'text-sm font-semibold',
                              info?.isInflow
                                ? 'text-success'
                                : 'text-danger',
                            )}
                          >
                            {info?.isInflow ? '+' : '-'}
                            {tx.quantity}
                          </p>
                          {tx.totalCost && (
                            <p className="text-xs text-muted-foreground/70">
                              {UGX(tx.totalCost)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
