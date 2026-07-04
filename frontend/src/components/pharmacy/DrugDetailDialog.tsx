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
            <p className="text-sm text-slate-500">{drug.genericName}</p>
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
                <div key={label} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400">{label}</p>
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
                    ? 'border-red-200 bg-red-50'
                    : isLow
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-emerald-200 bg-emerald-50',
                )}
              >
                <p className="text-xs text-slate-500">Stock</p>
                <p
                  className={cn(
                    'text-2xl font-bold',
                    isOut
                      ? 'text-red-600'
                      : isLow
                      ? 'text-amber-600'
                      : 'text-emerald-600',
                  )}
                >
                  {drug.stockQuantity}
                </p>
                <p className="text-xs text-slate-400">Min: {drug.minStock}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400">Cost Price</p>
                <p className="text-sm font-bold">{UGX(drug.unitPrice)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400">Sell Price</p>
                <p className="text-sm font-bold text-emerald-700">{UGX(drug.sellPrice)}</p>
              </div>
            </div>

            <Separator />

            {/* Transaction history */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Stock History</h4>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
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
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                              info?.isInflow
                                ? 'bg-emerald-100'
                                : 'bg-red-100',
                            )}
                          >
                            {info?.isInflow ? (
                              <ArrowUp className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-red-600" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {info?.label ?? tx.type}
                            </p>
                            <p className="text-xs text-slate-400">
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
                                ? 'text-emerald-600'
                                : 'text-red-600',
                            )}
                          >
                            {info?.isInflow ? '+' : '-'}
                            {tx.quantity}
                          </p>
                          {tx.totalCost && (
                            <p className="text-xs text-slate-400">
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
