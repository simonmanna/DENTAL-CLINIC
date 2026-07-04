// src/pages/pharmacy/DrugsPage.tsx
import { useState, useCallback, useDeferredValue } from 'react';
import {
  Pill, Plus, Search, AlertTriangle, Edit2, ArrowUpDown,
  RefreshCw, Package, BarChart3, TrendingDown, X, ChevronRight,
  CheckCircle, Clock, Filter, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { useDrugs, useCategories } from '../../hooks/usePharmacy';
import { drugApi } from '../../lib/api/pharmacy';
import type { Drug } from '../../lib/api/pharmacy';
import { cn } from '@/lib/utils';

const DRUG_FORMS = ['tablet', 'capsule', 'syrup', 'injection', 'cream', 'ointment', 'drops', 'inhaler', 'patch', 'suppository', 'gel', 'powder', 'spray', 'lozenge'];
const STOCK_TX_TYPES = ['PURCHASE', 'USAGE', 'ADJUSTMENT', 'RETURN', 'EXPIRED', 'DAMAGED', 'TRANSFER'];

const UGX = (n: number) => new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

function StockStatusBadge({ drug }: { drug: Drug }) {
  if (drug.stockQuantity === 0) return <Badge variant="destructive" className="text-xs">Out of Stock</Badge>;
  if (drug.stockQuantity <= drug.minStock) return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Low Stock</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">In Stock</Badge>;
}

// ─── Drug Form Dialog ─────────────────────────────────────────────────────────

interface DrugFormData {
  name: string; genericName: string; category: string; form: string;
  strength: string; manufacturer: string; unit: string;
  unitPrice: number; sellPrice: number; minStock: number;
  requiresPrescription: boolean; sideEffects: string; contraindications: string;
  isActive: boolean;
}

const EMPTY_FORM: DrugFormData = {
  name: '', genericName: '', category: 'Analgesic', form: 'tablet',
  strength: '', manufacturer: '', unit: 'tablet',
  unitPrice: 0, sellPrice: 0, minStock: 10,
  requiresPrescription: false, sideEffects: '', contraindications: '', isActive: true,
};

function DrugFormDialog({
  open, drug, onClose, onSaved,
}: {
  open: boolean; drug?: Drug | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<DrugFormData>(drug ? {
    name: drug.name, genericName: drug.genericName ?? '', category: drug.category,
    form: drug.form ?? 'tablet', strength: drug.strength ?? '',
    manufacturer: drug.manufacturer ?? '', unit: drug.unit,
    unitPrice: drug.unitPrice, sellPrice: drug.sellPrice, minStock: drug.minStock,
    requiresPrescription: drug.requiresPrescription,
    sideEffects: drug.sideEffects ?? '', contraindications: drug.contraindications ?? '',
    isActive: drug.isActive,
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof DrugFormData>(k: K, v: DrugFormData[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Drug name is required'); return; }
    if (form.sellPrice < form.unitPrice) {
      toast.warning('Sell price is lower than purchase price');
    }
    setSaving(true);
    try {
      drug ? await drugApi.update(drug.id, form) : await drugApi.create(form);
      toast.success(drug ? 'Drug updated' : 'Drug added to inventory');
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
              <Pill className="w-4 h-4 text-sky-600" />
            </div>
            {drug ? 'Edit Drug' : 'Add New Drug'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-5 py-2">
            {/* Basic Info */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Basic Information</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Drug Name *</Label>
                  <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Amoxicillin" className="mt-1" />
                </div>
                <div>
                  <Label>Generic Name</Label>
                  <Input value={form.genericName} onChange={e => set('genericName', e.target.value)} placeholder="INN / Generic name" className="mt-1" />
                </div>
                <div>
                  <Label>Category</Label>
                  <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Antibiotic" className="mt-1" />
                </div>
                <div>
                  <Label>Dosage Form</Label>
                  <Select value={form.form} onValueChange={v => set('form', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DRUG_FORMS.map(f => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Strength</Label>
                  <Input value={form.strength} onChange={e => set('strength', e.target.value)} placeholder="e.g. 500mg, 250mg/5ml" className="mt-1" />
                </div>
                <div>
                  <Label>Unit of Measure</Label>
                  <Input value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="tablet, bottle, vial" className="mt-1" />
                </div>
                <div>
                  <Label>Manufacturer</Label>
                  <Input value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} placeholder="Brand / manufacturer" className="mt-1" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Pricing & Stock */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Pricing & Stock Control</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Purchase Price (UGX)</Label>
                  <Input type="number" value={form.unitPrice} onChange={e => set('unitPrice', +e.target.value)} min={0} className="mt-1" />
                </div>
                <div>
                  <Label>Selling Price (UGX)</Label>
                  <Input type="number" value={form.sellPrice} onChange={e => set('sellPrice', +e.target.value)} min={0} className="mt-1" />
                  {form.sellPrice > 0 && form.unitPrice > 0 && (
                    <p className="text-xs mt-1 text-emerald-600">
                      Margin: {(((form.sellPrice - form.unitPrice) / form.unitPrice) * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
                <div>
                  <Label>Min. Stock Level</Label>
                  <Input type="number" value={form.minStock} onChange={e => set('minStock', +e.target.value)} min={0} className="mt-1" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Flags */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispensing Rules</p>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Prescription Required</p>
                  <p className="text-xs text-slate-400">Drug cannot be sold without valid Rx</p>
                </div>
                <Switch checked={form.requiresPrescription} onCheckedChange={v => set('requiresPrescription', v)} />
              </div>
              {drug && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Active in Formulary</p>
                    <p className="text-xs text-slate-400">Deactivate to hide from POS and searches</p>
                  </div>
                  <Switch checked={form.isActive} onCheckedChange={v => set('isActive', v)} />
                </div>
              )}
            </div>

            <Separator />

            {/* Clinical */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Clinical Information</p>
              <div className="space-y-3">
                <div>
                  <Label>Side Effects</Label>
                  <Textarea value={form.sideEffects} onChange={e => set('sideEffects', e.target.value)} placeholder="Common and serious side effects…" rows={2} className="mt-1 resize-none" />
                </div>
                <div>
                  <Label>Contraindications</Label>
                  <Textarea value={form.contraindications} onChange={e => set('contraindications', e.target.value)} placeholder="When NOT to use this drug…" rows={2} className="mt-1 resize-none" />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : drug ? 'Update Drug' : 'Add to Formulary'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stock Adjustment Dialog ──────────────────────────────────────────────────

function StockAdjustDialog({
  open, drug, onClose, onSaved,
}: {
  open: boolean; drug: Drug; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    type: 'PURCHASE', quantity: 1, unitCost: drug.unitPrice,
    batchNumber: '', expiryDate: '', reference: '', notes: '', performedBy: '',
  });
  const [saving, setSaving] = useState(false);

  const isInflow = ['PURCHASE', 'RETURN', 'ADJUSTMENT'].includes(form.type);
  const projectedQty = isInflow
    ? drug.stockQuantity + form.quantity
    : Math.max(0, drug.stockQuantity - form.quantity);

  const save = async () => {
    if (form.quantity <= 0) { toast.error('Quantity must be positive'); return; }
    setSaving(true);
    try {
      await drugApi.adjustStock(drug.id, {
        ...form,
        expiryDate: form.expiryDate || undefined,
        batchNumber: form.batchNumber || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        performedBy: form.performedBy || undefined,
      });
      toast.success('Stock updated successfully');
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Stock Adjustment</DialogTitle>
          <p className="text-sm text-slate-500">{drug.name} {drug.strength && `· ${drug.strength}`}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current → Projected */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="text-center flex-1">
              <p className="text-xs text-slate-500">Current</p>
              <p className="text-2xl font-bold text-slate-800">{drug.stockQuantity}</p>
              <p className="text-xs text-slate-400">{drug.unit}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <div className="text-center flex-1">
              <p className="text-xs text-slate-500">After Adjustment</p>
              <p className={cn('text-2xl font-bold', projectedQty === 0 ? 'text-red-600' : projectedQty <= drug.minStock ? 'text-amber-600' : 'text-emerald-600')}>
                {projectedQty}
              </p>
              <p className="text-xs text-slate-400">{drug.unit}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Transaction Type</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STOCK_TX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: +e.target.value }))} min={1} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unit Cost (UGX)</Label>
              <Input type="number" value={form.unitCost} onChange={e => setForm(p => ({ ...p, unitCost: +e.target.value }))} min={0} className="mt-1" />
            </div>
            <div>
              <Label>Total Cost</Label>
              <div className="mt-1 h-9 flex items-center px-3 bg-slate-50 border rounded-md text-sm font-medium text-slate-700">
                {UGX(form.quantity * form.unitCost)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Batch / Lot #</Label>
              <Input value={form.batchNumber} onChange={e => setForm(p => ({ ...p, batchNumber: e.target.value }))} placeholder="Optional" className="mt-1" />
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiryDate} onChange={e => setForm(p => ({ ...p, expiryDate: e.target.value }))} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Reference (PO #, Invoice #)</Label>
            <Input value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} placeholder="Optional" className="mt-1" />
          </div>
          <div>
            <Label>Performed By</Label>
            <Input value={form.performedBy} onChange={e => setForm(p => ({ ...p, performedBy: e.target.value }))} placeholder="Staff name" className="mt-1" />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" className="mt-1" />
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Recording…' : 'Record Transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DrugsPage() {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'low' | 'out'>('all');
  const deferredSearch = useDeferredValue(search);

  const { drugs, pagination, loading, reload } = useDrugs({
    search: deferredSearch || undefined,
    category: filterCat || undefined,
    lowStock: filterStatus === 'low' ? true : undefined,
  });
  const categories = useCategories();

  const [drugDialog, setDrugDialog] = useState<{ open: boolean; drug?: Drug | null }>({ open: false });
  const [stockDialog, setStockDialog] = useState<{ open: boolean; drug?: Drug }>({ open: false });

  const filteredDrugs = filterStatus === 'out'
    ? drugs.filter(d => d.stockQuantity === 0)
    : drugs;

  const stats = {
    total: pagination.total,
    lowStock: drugs.filter(d => d.stockQuantity > 0 && d.stockQuantity <= d.minStock).length,
    outOfStock: drugs.filter(d => d.stockQuantity === 0).length,
    stockValue: drugs.reduce((s, d) => s + d.stockQuantity * d.unitPrice, 0),
    rxOnly: drugs.filter(d => d.requiresPrescription).length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Drug Formulary</h1>
          <p className="text-sm text-slate-500 mt-0.5">{pagination.total} drugs · Manage inventory and stock levels</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => reload()} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setDrugDialog({ open: true })} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Drug
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Drugs', value: stats.total, icon: Pill, color: 'text-sky-700', bg: 'bg-sky-50' },
          { label: 'Stock Value', value: UGX(stats.stockValue), icon: Package, color: 'text-indigo-700', bg: 'bg-indigo-50' },
          { label: 'Rx Only', value: stats.rxOnly, icon: CheckCircle, color: 'text-purple-700', bg: 'bg-purple-50' },
          { label: 'Low Stock', value: stats.lowStock, icon: AlertTriangle, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Out of Stock', value: stats.outOfStock, icon: TrendingDown, color: 'text-red-700', bg: 'bg-red-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', bg)}>
                <Icon className={cn('w-3.5 h-3.5', color)} />
              </div>
            </div>
            <p className={cn('text-xl font-bold', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            className="pl-9 w-64"
            placeholder="Search drugs, generics…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <Select value={filterCat || 'all'} onValueChange={v => setFilterCat(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.category} value={c.category}>{c.category} ({c.count})</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg text-xs">
          {([['all', 'All'], ['low', 'Low Stock'], ['out', 'Out of Stock']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilterStatus(v)}
              className={cn('px-2.5 py-1 rounded-md transition-colors font-medium',
                filterStatus === v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/60">
              <TableHead>Drug</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Form / Strength</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Buy Price</TableHead>
              <TableHead>Sell Price</TableHead>
              <TableHead>Margin</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-slate-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredDrugs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-16">
                  <Pill className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No drugs found</p>
                  <p className="text-sm text-slate-400 mt-1">Try adjusting your filters</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredDrugs.map(drug => {
                const margin = drug.unitPrice > 0 ? ((drug.sellPrice - drug.unitPrice) / drug.unitPrice * 100) : 0;
                const isLow = drug.stockQuantity > 0 && drug.stockQuantity <= drug.minStock;
                const isOut = drug.stockQuantity === 0;
                return (
                  <TableRow key={drug.id} className={cn(isOut ? 'bg-red-50/30' : isLow ? 'bg-amber-50/30' : '')}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={cn('w-2 h-8 rounded-full flex-shrink-0', isOut ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-emerald-400')} />
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{drug.name}</p>
                          {drug.genericName && <p className="text-xs text-slate-400">{drug.genericName}</p>}
                          {drug.requiresPrescription && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-semibold mt-0.5 inline-block">Rx</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{drug.category}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      <span className="capitalize">{drug.form ?? '—'}</span>
                      {drug.strength && <span className="text-slate-400"> · {drug.strength}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('font-semibold text-sm', isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-800')}>
                          {drug.stockQuantity}
                        </span>
                        <span className="text-xs text-slate-400">{drug.unit}</span>
                        {(isLow || isOut) && <AlertTriangle className={cn('w-3.5 h-3.5', isOut ? 'text-red-500' : 'text-amber-500')} />}
                      </div>
                      <div className="text-xs text-slate-400">min: {drug.minStock}</div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{UGX(drug.unitPrice)}</TableCell>
                    <TableCell className="text-sm font-semibold text-slate-800">{UGX(drug.sellPrice)}</TableCell>
                    <TableCell>
                      <span className={cn('text-sm font-medium', margin < 0 ? 'text-red-600' : margin < 20 ? 'text-amber-600' : 'text-emerald-600')}>
                        {margin.toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell><StockStatusBadge drug={drug} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7"
                          title="Adjust Stock"
                          onClick={() => setStockDialog({ open: true, drug })}
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7"
                          title="Edit Drug"
                          onClick={() => setDrugDialog({ open: true, drug })}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <p>Showing {filteredDrugs.length} of {pagination.total} drugs</p>
            <div className="flex gap-1">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => reload({ page: p })}
                  className={cn('w-7 h-7 rounded text-xs font-medium transition-colors',
                    p === pagination.page ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-600'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <DrugFormDialog
        open={drugDialog.open}
        drug={drugDialog.drug}
        onClose={() => setDrugDialog({ open: false })}
        onSaved={() => { setDrugDialog({ open: false }); reload(); }}
      />
      {stockDialog.drug && (
        <StockAdjustDialog
          open={stockDialog.open}
          drug={stockDialog.drug}
          onClose={() => setStockDialog({ open: false })}
          onSaved={() => { setStockDialog({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}