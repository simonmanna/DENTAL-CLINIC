import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import type { Drug, StockTransactionType } from '../../pages/pharmacy/drugs.types';
import { STOCK_TRANSACTION_TYPES } from '../../pages/pharmacy/drugs.types';

interface StockAdjustForm {
  type: StockTransactionType;
  quantity: number;
  unitCost: number;
  batchNumber: string;
  expiryDate: string;
  reference: string;
  notes: string;
}

const DEFAULT_FORM: StockAdjustForm = {
  type: 'PURCHASE',
  quantity: 1,
  unitCost: 0,
  batchNumber: '',
  expiryDate: '',
  reference: '',
  notes: '',
};

interface Props {
  open: boolean;
  drug: Drug;
  onClose: () => void;
  onSaved: () => void;
}

export function StockAdjustDialog({ open, drug, onClose, onSaved }: Props) {
  const [form, setForm] = useState<StockAdjustForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...DEFAULT_FORM, unitCost: drug.unitPrice });
    }
  }, [open, drug]);

  const set = <K extends keyof StockAdjustForm>(k: K, v: StockAdjustForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const txInfo = STOCK_TRANSACTION_TYPES.find((t) => t.value === form.type);
  const isInflow = txInfo?.isInflow ?? true;

  const projected = isInflow
    ? drug.stockQuantity + form.quantity
    : Math.max(0, drug.stockQuantity - form.quantity);

  const isInsufficient = !isInflow && form.quantity > drug.stockQuantity;

  const handleSubmit = async () => {
    if (form.quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }
    if (isInsufficient) {
      toast.error(`Insufficient stock. Only ${drug.stockQuantity} ${drug.unit}(s) available`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type: form.type,
        quantity: form.quantity,
        unitCost: form.unitCost || undefined,
        totalCost: form.unitCost ? form.unitCost * form.quantity : undefined,
        batchNumber: form.batchNumber || undefined,
        expiryDate: form.expiryDate || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      };
      await api.post(`/pharmacy/drugs/${drug.id}/stock`, payload);
      toast.success(`Stock ${isInflow ? 'added' : 'reduced'} successfully`);
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to adjust stock');
    } finally {
      setSaving(false);
    }
  };

  const UGX = (n: number) =>
    new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Stock Adjustment</DialogTitle>
          <p className="text-sm text-slate-500">
            {drug.name}
            {drug.strength && ` · ${drug.strength}`}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Stock preview */}
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border">
            <div className="flex-1 text-center">
              <p className="text-xs text-slate-400 mb-0.5">Current Stock</p>
              <p className="text-3xl font-bold text-slate-900">
                {drug.stockQuantity}
              </p>
              <p className="text-xs text-slate-400">{drug.unit}</p>
            </div>

            <div className="flex flex-col items-center gap-1">
              <ChevronRight className="w-5 h-5 text-slate-300" />
              {isInflow ? (
                <ArrowUp className="w-4 h-4 text-emerald-500" />
              ) : (
                <ArrowDown className="w-4 h-4 text-red-500" />
              )}
            </div>

            <div className="flex-1 text-center">
              <p className="text-xs text-slate-400 mb-0.5">New Stock</p>
              <p
                className={cn(
                  'text-3xl font-bold',
                  projected === 0
                    ? 'text-red-600'
                    : projected <= drug.minStock
                    ? 'text-amber-600'
                    : 'text-emerald-600',
                )}
              >
                {projected}
              </p>
              <p className="text-xs text-slate-400">{drug.unit}</p>
            </div>
          </div>

          {isInsufficient && (
            <p className="text-xs text-red-600 text-center font-medium">
              ⚠ Insufficient stock — only {drug.stockQuantity} available
            </p>
          )}

          {/* Transaction type */}
          <div className="space-y-1">
            <Label>Transaction Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => set('type', v as StockTransactionType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_TRANSACTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2">
                      {t.isInflow ? (
                        <ArrowUp className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-red-500" />
                      )}
                      {t.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity + Unit cost row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => set('quantity', Number(e.target.value))}
              />
            </div>
            {isInflow && (
              <div className="space-y-1">
                <Label htmlFor="unitCost">Unit Cost (UGX)</Label>
                <Input
                  id="unitCost"
                  type="number"
                  min={0}
                  value={form.unitCost}
                  onChange={(e) => set('unitCost', Number(e.target.value))}
                />
              </div>
            )}
          </div>

          {/* Total cost indicator */}
          {isInflow && form.unitCost > 0 && form.quantity > 0 && (
            <p className="text-xs text-slate-500">
              Total cost:{' '}
              <span className="font-semibold text-slate-700">
                {UGX(form.unitCost * form.quantity)}
              </span>
            </p>
          )}

          {/* Batch + Expiry (for purchases) */}
          {isInflow && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="batch">Batch Number</Label>
                <Input
                  id="batch"
                  value={form.batchNumber}
                  onChange={(e) => set('batchNumber', e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expiry">Expiry Date</Label>
                <Input
                  id="expiry"
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => set('expiryDate', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Reference */}
          <div className="space-y-1">
            <Label htmlFor="ref">Reference / Invoice No.</Label>
            <Input
              id="ref"
              value={form.reference}
              onChange={(e) => set('reference', e.target.value)}
              placeholder="e.g. INV-2025-001"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Reason or additional info…"
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || form.quantity <= 0 || isInsufficient}
            variant={isInsufficient ? 'destructive' : 'default'}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {saving ? 'Saving…' : 'Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
