// src/components/pharmacy/DrugFormDialog.tsx
import { useEffect, useState } from 'react';
import { Pill, Loader2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api/client';
import type { Drug, DrugFormData } from '../../pages/pharmacy/drugs.types';
import { EMPTY_DRUG_FORM, DRUG_FORMS } from '../../pages/pharmacy/drugs.types';

interface Props {
  open: boolean;
  drug?: Drug | null;
  onClose: () => void;
  onSaved: () => void;
}

export function DrugFormDialog({ open, drug, onClose, onSaved }: Props) {
  const [form, setForm] = useState<DrugFormData>(EMPTY_DRUG_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (drug) {
      // Use safe fallbacks for properties that may not exist on the Drug type
      setForm({
        name: drug.name,
        genericName: (drug as any).genericName ?? '',
        categoryId: (drug as any).categoryId ?? (drug as any).category ?? '', // fallback to category if categoryId missing
        form: (drug as any).form ?? 'tablet',
        strength: (drug as any).strength ?? '',
        manufacturer: (drug as any).manufacturer ?? '',
        unit: (drug as any).unit ?? '',
        unitPrice: (drug as any).unitPrice ?? 0,
        sellPrice: (drug as any).sellPrice ?? 0,
        minStock: (drug as any).minStock ?? 0,
        requiresPrescription: (drug as any).requiresPrescription ?? false,
        isActive: (drug as any).isActive ?? true,
      });
    } else {
      setForm(EMPTY_DRUG_FORM);
    }
  }, [drug, open]);

  const set = <K extends keyof DrugFormData>(key: K, val: DrugFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Drug name is required');
      return;
    }
    if (!form.categoryId.trim()) {
      toast.error('Category is required');
      return;
    }

    setSaving(true);
    try {
      if (drug) {
        await api.patch(`/pharmacy/drugs/${drug.id}`, form);
        toast.success('Drug updated');
      } else {
        await api.post('/pharmacy/drugs', form);
        toast.success('Drug added');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  // Compute margin for display
  const margin =
    form.sellPrice > 0 && form.unitPrice > 0
      ? (((form.sellPrice - form.unitPrice) / form.unitPrice) * 100).toFixed(1)
      : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="p-1.5 bg-sky-100 rounded-lg">
              <Pill className="w-5 h-5 text-sky-600" />
            </div>
            {drug ? 'Edit Drug' : 'Add New Drug'}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-5 py-4">
            {/* Basic Info */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Basic Information
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="name">
                    Drug Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="e.g. Amoxicillin"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="genericName">Generic Name</Label>
                  <Input
                    id="genericName"
                    value={form.genericName}
                    onChange={(e) => set('genericName', e.target.value)}
                    placeholder="INN / generic"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="categoryId">
                    Category <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="categoryId"
                    value={form.categoryId}
                    onChange={(e) => set('categoryId', e.target.value)}
                    placeholder="e.g. Antibiotic"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Dosage Form</Label>
                  <Select
                    value={form.form}
                    onValueChange={(v) => set('form', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DRUG_FORMS.map((f) => (
                        <SelectItem key={f} value={f} className="capitalize">
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="strength">Strength</Label>
                  <Input
                    id="strength"
                    value={form.strength}
                    onChange={(e) => set('strength', e.target.value)}
                    placeholder="e.g. 500mg, 250mg/5ml"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Input
                    id="manufacturer"
                    value={form.manufacturer}
                    onChange={(e) => set('manufacturer', e.target.value)}
                    placeholder="e.g. GSK, Cipla"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="unit">Unit Label</Label>
                  <Input
                    id="unit"
                    value={form.unit}
                    onChange={(e) => set('unit', e.target.value)}
                    placeholder="tablet, bottle, vial"
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* Pricing & Stock */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pricing & Stock
              </h4>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="unitPrice">Purchase Price (UGX)</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    min={0}
                    value={form.unitPrice}
                    onChange={(e) => set('unitPrice', Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sellPrice">Selling Price (UGX)</Label>
                  <Input
                    id="sellPrice"
                    type="number"
                    min={0}
                    value={form.sellPrice}
                    onChange={(e) => set('sellPrice', Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="minStock">Min. Stock Level</Label>
                  <Input
                    id="minStock"
                    type="number"
                    min={0}
                    value={form.minStock}
                    onChange={(e) => set('minStock', Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Margin indicator */}
              {margin !== null && (
                <p className="text-xs text-slate-500">
                  Margin:{' '}
                  <span
                    className={
                      Number(margin) > 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'
                    }
                  >
                    {margin}%
                  </span>{' '}
                  · Profit per unit:{' '}
                  <span className="font-semibold">
                    {new Intl.NumberFormat('en-UG', {
                      style: 'currency',
                      currency: 'UGX',
                      maximumFractionDigits: 0,
                    }).format(form.sellPrice - form.unitPrice)}
                  </span>
                </p>
              )}
            </section>

            <Separator />

            {/* Settings */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Settings
              </h4>

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Prescription Required</p>
                    <p className="text-xs text-slate-500">
                      Drug cannot be sold without a valid prescription
                    </p>
                  </div>
                  <Switch
                    checked={form.requiresPrescription}
                    onCheckedChange={(v) => set('requiresPrescription', v)}
                  />
                </div>

                {drug && (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Active</p>
                      <p className="text-xs text-slate-500">
                        Inactive drugs are hidden from listings
                      </p>
                    </div>
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(v) => set('isActive', v)}
                    />
                  </div>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-slate-50/50">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !form.name.trim() || !form.categoryId.trim()}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {saving ? 'Saving…' : drug ? 'Update Drug' : 'Add Drug'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}