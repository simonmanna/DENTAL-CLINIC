// src/pages/fixed-assets/FixedAssetsPage.tsx
// Drop into your router: <Route path="/fixed-assets" element={<FixedAssetsPage />} />

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Package, Wrench, TrendingDown, AlertTriangle, Plus, Search,
  MoreVertical, Eye, Edit, Trash2, ArrowRightLeft, ChevronLeft,
  ChevronRight, Building2, Monitor, Car, Microscope, ShieldCheck,
  Armchair, Camera, Syringe, Cpu, HelpCircle, X, CheckCircle2,
  Clock, XCircle, TrendingUp, DollarSign, BarChart3, Calendar,
  FileText, RefreshCw, Filter,
} from 'lucide-react';
import {
  FixedAsset, AssetSummary, AssetMaintenance,
  CATEGORY_LABELS, STATUS_CONFIG, CONDITION_CONFIG,
  AssetCategory, AssetStatus, AssetCondition,
  DepreciationMethod, MaintenanceType, DisposalMethod,
} from './types';

// â”€â”€ API layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ── API layer ─────────────────────────────────────────────────────────────────
import { api as sharedApi } from '@/lib/api/client';

const api = {
  getSummary: (): Promise<AssetSummary> =>
    sharedApi.get('/fixed-assets/summary').then(r => r.data),

  list: (params: Record<string, any> = {}): Promise<{ data: FixedAsset[]; meta: any }> => {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    );
    return sharedApi.get('/fixed-assets', { params: cleanParams }).then(r => r.data);
  },

  get: (id: string): Promise<FixedAsset> =>
    sharedApi.get(`/fixed-assets/${id}`).then(r => r.data),

  create: (data: any): Promise<FixedAsset> =>
    sharedApi.post('/fixed-assets', data).then(r => r.data),

  update: (id: string, data: any): Promise<FixedAsset> =>
    sharedApi.patch(`/fixed-assets/${id}`, data).then(r => r.data),

  dispose: (id: string, data: any): Promise<FixedAsset> =>
    sharedApi.post(`/fixed-assets/${id}/dispose`, data).then(r => r.data),

  createMaintenance: (data: any): Promise<AssetMaintenance> =>
    sharedApi.post('/fixed-assets/maintenance', data).then(r => r.data),

  completeMaintenance: (id: string, data: any): Promise<AssetMaintenance> =>
    sharedApi.patch(`/fixed-assets/maintenance/${id}/complete`, data).then(r => r.data),

  postDepreciation: (data: any) =>
    sharedApi.post('/fixed-assets/depreciation/post', data).then(r => r.data),
};

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const fmt = (n: string | number | undefined, currency = 'UGX') => {
  if (n === undefined || n === null) return 'â€”';
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(n));
};

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'â€”';

const CATEGORY_ICONS: Record<AssetCategory, React.ReactNode> = {
  DENTAL_EQUIPMENT: <Syringe className="w-4 h-4" />,
  IMAGING_EQUIPMENT: <Camera className="w-4 h-4" />,
  STERILIZATION: <ShieldCheck className="w-4 h-4" />,
  LABORATORY: <Microscope className="w-4 h-4" />,
  OFFICE_EQUIPMENT: <Monitor className="w-4 h-4" />,
  FURNITURE: <Armchair className="w-4 h-4" />,
  VEHICLES: <Car className="w-4 h-4" />,
  BUILDING: <Building2 className="w-4 h-4" />,
  IT_INFRASTRUCTURE: <Cpu className="w-4 h-4" />,
  MEDICAL_INSTRUMENTS: <Package className="w-4 h-4" />,
  OTHER: <HelpCircle className="w-4 h-4" />,
};

// â”€â”€ Stat Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatCard({ label, value, sub, icon, accent = false, alert = false }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; accent?: boolean; alert?: boolean;
}) {
  return (
    <Card className={`border ${alert ? 'border-amber-200 bg-amber-50' : accent ? 'border-blue-200 bg-blue-50' : ''}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${alert ? 'text-amber-700' : accent ? 'text-blue-700' : ''}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-lg ${alert ? 'bg-amber-100 text-amber-600' : accent ? 'bg-blue-100 text-blue-600' : 'bg-muted text-muted-foreground'}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// â”€â”€ Asset Form Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AssetFormDialog({
  open, onClose, asset, onSaved,
}: {
  open: boolean; onClose: () => void;
  asset?: FixedAsset | null; onSaved: (a: FixedAsset) => void;
}) {
  const isEdit = !!asset;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    name: '', category: 'DENTAL_EQUIPMENT', purchaseDate: '', purchaseCost: '',
    currency: 'UGX', depreciationMethod: 'STRAIGHT_LINE', usefulLifeYears: '',
    salvageValue: '', isDepreciable: true, condition: 'GOOD',
    serialNumber: '', modelNumber: '', manufacturer: '', invoiceNumber: '',
    warrantyExpiry: '', notes: '',
  });

  useEffect(() => {
    if (asset) {
      setForm({
        name: asset.name,
        category: asset.category,
        purchaseDate: asset.purchaseDate?.split('T')[0] ?? '',
        purchaseCost: asset.purchaseCost,
        currency: asset.currency,
        depreciationMethod: asset.depreciationMethod,
        usefulLifeYears: asset.usefulLifeYears ?? '',
        salvageValue: asset.salvageValue ?? '',
        isDepreciable: asset.isDepreciable,
        condition: asset.condition,
        serialNumber: asset.serialNumber ?? '',
        modelNumber: asset.modelNumber ?? '',
        manufacturer: asset.manufacturer ?? '',
        invoiceNumber: asset.invoiceNumber ?? '',
        warrantyExpiry: asset.warrantyExpiry?.split('T')[0] ?? '',
        notes: asset.notes ?? '',
        description: asset.description ?? '',
      });
    } else {
      setForm({
        name: '', category: 'DENTAL_EQUIPMENT', purchaseDate: new Date().toISOString().split('T')[0],
        purchaseCost: '', currency: 'UGX', depreciationMethod: 'STRAIGHT_LINE',
        usefulLifeYears: '', salvageValue: '', isDepreciable: true, condition: 'GOOD',
        serialNumber: '', modelNumber: '', manufacturer: '', invoiceNumber: '',
        warrantyExpiry: '', notes: '', description: '',
      });
    }
  }, [asset, open]);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        purchaseCost: Number(form.purchaseCost),
        usefulLifeYears: form.usefulLifeYears ? Number(form.usefulLifeYears) : undefined,
        salvageValue: form.salvageValue ? Number(form.salvageValue) : undefined,
        warrantyExpiry: form.warrantyExpiry || undefined,
      };
      const result = isEdit
        ? await api.update(asset!.id, payload)
        : await api.create(payload);
      onSaved(result);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Asset' : 'Register New Asset'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Asset Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Dental Chair Unit #2" />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={v => set('condition', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'SCRAP'] as AssetCondition[]).map(c => (
                    <SelectItem key={c} value={c}>{CONDITION_CONFIG[c].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Purchase Details */}
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Purchase Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Purchase Date *</Label>
              <Input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Purchase Cost (UGX) *</Label>
              <Input type="number" value={form.purchaseCost} onChange={e => set('purchaseCost', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice Number</Label>
              <Input value={form.invoiceNumber} onChange={e => set('invoiceNumber', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Warranty Expiry</Label>
              <Input type="date" value={form.warrantyExpiry} onChange={e => set('warrantyExpiry', e.target.value)} />
            </div>
          </div>

          <Separator />

          {/* Identification */}
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Identification</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Serial Number</Label>
              <Input value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Model Number</Label>
              <Input value={form.modelNumber} onChange={e => set('modelNumber', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Manufacturer</Label>
              <Input value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
            </div>
          </div>

          <Separator />

          {/* Depreciation */}
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Depreciation</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={form.depreciationMethod} onValueChange={v => set('depreciationMethod', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STRAIGHT_LINE">Straight Line</SelectItem>
                  <SelectItem value="DECLINING_BALANCE">Declining Balance</SelectItem>
                  <SelectItem value="NONE">None (Non-depreciable)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.depreciationMethod === 'STRAIGHT_LINE' && (
              <div className="space-y-1.5">
                <Label>Useful Life (years)</Label>
                <Input type="number" value={form.usefulLifeYears} onChange={e => set('usefulLifeYears', e.target.value)} placeholder="5" min={1} />
              </div>
            )}
            {form.depreciationMethod === 'DECLINING_BALANCE' && (
              <div className="space-y-1.5">
                <Label>Annual Rate (e.g. 0.2 = 20%)</Label>
                <Input type="number" value={form.depreciationRate} onChange={e => set('depreciationRate', e.target.value)} placeholder="0.20" step={0.01} />
              </div>
            )}
            {form.depreciationMethod !== 'NONE' && (
              <div className="space-y-1.5">
                <Label>Salvage Value (UGX)</Label>
                <Input type="number" value={form.salvageValue} onChange={e => set('salvageValue', e.target.value)} placeholder="0" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name || !form.purchaseCost || !form.purchaseDate}>
            {saving ? 'Savingâ€¦' : isEdit ? 'Save Changes' : 'Register Asset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€ Maintenance Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MaintenanceDialog({
  open, onClose, assetId, onSaved,
}: {
  open: boolean; onClose: () => void; assetId: string; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: 'PREVENTIVE', title: '', description: '',
    scheduledDate: new Date().toISOString().split('T')[0],
    estimatedCost: '', serviceProvider: '', technicianName: '', nextDueDate: '',
  });
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.createMaintenance({
        ...form,
        assetId,
        estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
        nextDueDate: form.nextDueDate || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Schedule Maintenance</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => set('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['PREVENTIVE', 'CORRECTIVE', 'CALIBRATION', 'INSPECTION', 'OTHER'] as MaintenanceType[]).map(t => (
                    <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scheduled Date</Label>
              <Input type="date" value={form.scheduledDate} onChange={e => set('scheduledDate', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Annual compressor service" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Service Provider</Label>
              <Input value={form.serviceProvider} onChange={e => set('serviceProvider', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Estimated Cost (UGX)</Label>
              <Input type="number" value={form.estimatedCost} onChange={e => set('estimatedCost', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Next Due Date</Label>
            <Input type="date" value={form.nextDueDate} onChange={e => set('nextDueDate', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.title}>
            {saving ? 'Schedulingâ€¦' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€ Dispose Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DisposeDialog({
  open, onClose, asset, onDisposed,
}: {
  open: boolean; onClose: () => void; asset: FixedAsset | null; onDisposed: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    disposalMethod: 'WRITTEN_OFF' as DisposalMethod,
    disposedAt: new Date().toISOString().split('T')[0],
    disposalValue: '', disposalNotes: '',
  });
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleDispose = async () => {
    if (!asset) return;
    setSaving(true);
    try {
      await api.dispose(asset.id, {
        ...form,
        disposalValue: form.disposalValue ? Number(form.disposalValue) : undefined,
      });
      onDisposed();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={v => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dispose Asset</AlertDialogTitle>
          <AlertDialogDescription>
            This will mark <strong>{asset?.name}</strong> ({asset?.assetCode}) as disposed. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 my-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Disposal Method</Label>
              <Select value={form.disposalMethod} onValueChange={v => set('disposalMethod', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['SOLD', 'SCRAPPED', 'DONATED', 'WRITTEN_OFF', 'RETURNED_TO_SUPPLIER', 'STOLEN_LOST'] as DisposalMethod[]).map(m => (
                    <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Disposal Date</Label>
              <Input type="date" value={form.disposedAt} onChange={e => set('disposedAt', e.target.value)} />
            </div>
          </div>
          {form.disposalMethod === 'SOLD' && (
            <div className="space-y-1.5">
              <Label>Sale Value (UGX)</Label>
              <Input type="number" value={form.disposalValue} onChange={e => set('disposalValue', e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.disposalNotes} onChange={e => set('disposalNotes', e.target.value)} rows={2} />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDispose} disabled={saving} className="bg-destructive hover:bg-destructive/90">
            {saving ? 'Disposingâ€¦' : 'Confirm Disposal'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// â”€â”€ Asset Detail Drawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AssetDetailDialog({
  open, onClose, assetId, onScheduleMaintenance, onEdit, onDispose,
}: {
  open: boolean; onClose: () => void; assetId: string | null;
  onScheduleMaintenance: (id: string) => void;
  onEdit: (a: FixedAsset) => void;
  onDispose: (a: FixedAsset) => void;
}) {
  const [asset, setAsset] = useState<FixedAsset | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!assetId || !open) return;
    setLoading(true);
    api.get(assetId).then(a => { setAsset(a as any); setLoading(false); });
  }, [assetId, open]);

  if (!open) return null;

  const statusCfg = asset ? STATUS_CONFIG[asset.status] : null;
  const condCfg = asset ? CONDITION_CONFIG[asset.condition] : null;

  const depPct = asset
    ? (Number(asset.accumulatedDepreciation) / Number(asset.purchaseCost) * 100).toFixed(1)
    : '0';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        {loading || !asset ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">Loadingâ€¦</div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle className="text-xl">{asset.name}</DialogTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">{asset.assetCode} Â· {CATEGORY_LABELS[asset.category]}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline" className={`${statusCfg?.bg} ${statusCfg?.color} border font-medium`}>
                    {statusCfg?.label}
                  </Badge>
                  <span className={`text-sm font-medium ${condCfg?.color}`}>{condCfg?.label}</span>
                </div>
              </div>
            </DialogHeader>

            <Tabs defaultValue="overview" className="mt-2">
              <TabsList className="w-full">
                <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
                <TabsTrigger value="depreciation" className="flex-1">Depreciation</TabsTrigger>
                <TabsTrigger value="maintenance" className="flex-1">Maintenance</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 pt-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Purchase Date', value: fmtDate(asset.purchaseDate) },
                    { label: 'Purchase Cost', value: fmt(asset.purchaseCost) },
                    { label: 'Current Book Value', value: fmt(asset.currentBookValue) },
                    { label: 'Warranty Expiry', value: fmtDate(asset.warrantyExpiry) },
                    { label: 'Serial Number', value: asset.serialNumber || 'â€”' },
                    { label: 'Manufacturer', value: asset.manufacturer || 'â€”' },
                    { label: 'Location', value: asset.location?.name || 'â€”' },
                    { label: 'Assigned To', value: asset.assignedToStaff ? `${asset.assignedToStaff.firstName} ${asset.assignedToStaff.lastName}` : 'â€”' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-semibold mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
                {asset.notes && (
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{asset.notes}</p>
                  </div>
                )}

                {asset.status !== 'DISPOSED' && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => onEdit(asset)}>
                      <Edit className="w-3.5 h-3.5 mr-1.5" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onScheduleMaintenance(asset.id)}>
                      <Wrench className="w-3.5 h-3.5 mr-1.5" /> Schedule Maintenance
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/5" onClick={() => onDispose(asset)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Dispose
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="depreciation" className="space-y-4 pt-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Purchase Cost</p>
                    <p className="font-bold text-base mt-1">{fmt(asset.purchaseCost)}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Accumulated Dep.</p>
                    <p className="font-bold text-base mt-1 text-red-600">{fmt(asset.accumulatedDepreciation)}</p>
                    <p className="text-xs text-muted-foreground">{depPct}%</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Book Value</p>
                    <p className="font-bold text-base mt-1 text-emerald-700">{fmt(asset.currentBookValue)}</p>
                  </div>
                </div>

                {/* Depreciation bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Depreciation progress</span>
                    <span>{depPct}% depreciated</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${Math.min(100, Number(depPct))}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Method</p>
                    <p className="font-medium mt-0.5">{asset.depreciationMethod.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Useful Life</p>
                    <p className="font-medium mt-0.5">{asset.usefulLifeYears ? `${asset.usefulLifeYears} years` : 'â€”'}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Salvage Value</p>
                    <p className="font-medium mt-0.5">{asset.salvageValue ? fmt(asset.salvageValue) : 'â€”'}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Last Depreciation</p>
                    <p className="font-medium mt-0.5">{fmtDate(asset.lastDepreciationDate)}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="maintenance" className="pt-3">
                {(asset as any).maintenanceRecords?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No maintenance records yet.</div>
                ) : (
                  <div className="space-y-2">
                    {(asset as any).maintenanceRecords?.map((m: AssetMaintenance) => (
                      <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                        <div className={`mt-0.5 p-1.5 rounded-md ${m.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : m.status === 'OVERDUE' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                          <Wrench className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{m.title}</p>
                            <Badge variant="outline" className="text-xs shrink-0">{m.type}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fmtDate(m.scheduledDate)} Â· {m.serviceProvider ?? 'Internal'}
                            {m.actualCost && ` Â· ${fmt(m.actualCost)}`}
                          </p>
                        </div>
                        <Badge variant="outline" className={`text-xs ${m.status === 'COMPLETED' ? 'text-emerald-700' : m.status === 'OVERDUE' ? 'text-red-700' : 'text-amber-700'}`}>
                          {m.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function FixedAssetsPage() {
  const [summary, setSummary] = useState<AssetSummary | null>(null);
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [maintenanceForAsset, setMaintenanceForAsset] = useState<string | null>(null);
  const [disposeAsset, setDisposeAsset] = useState<FixedAsset | null>(null);
  const [depreciationOpen, setDepreciationOpen] = useState(false);
  const [depreciationRunning, setDepreciationRunning] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        api.getSummary(),
        api.list({ search: search || undefined, category: categoryFilter || undefined, status: statusFilter || undefined, page }),
      ]);
      setSummary(s);
      setAssets(r.data);
      setMeta(r.meta);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, statusFilter, page]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRunDepreciation = async () => {
    setDepreciationRunning(true);
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    try {
      await api.postDepreciation({
        assetIds: [],
        periodStart: firstOfMonth.toISOString(),
        periodEnd: lastOfMonth.toISOString(),
        notes: `Monthly depreciation run â€” ${now.toLocaleDateString()}`,
      });
      await loadAll();
    } finally {
      setDepreciationRunning(false);
      setDepreciationOpen(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Fixed Assets</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {summary ? `${summary.counts.total} assets Â· Book value ${fmt(summary.financials.totalBookValue)}` : 'Asset register'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDepreciationOpen(true)}>
              <TrendingDown className="w-4 h-4 mr-1.5" /> Post Depreciation
            </Button>
            <Button size="sm" onClick={() => { setEditingAsset(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-1.5" /> Register Asset
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Active Assets" value={summary.counts.active} sub={`of ${summary.counts.total} total`} icon={<Package className="w-4 h-4" />} accent />
            <StatCard label="Total Book Value" value={fmt(summary.financials.totalBookValue)} sub={`${summary.financials.depreciationPercent}% depreciated`} icon={<DollarSign className="w-4 h-4" />} />
            <StatCard label="Under Maintenance" value={summary.counts.underMaintenance} sub={`${summary.alerts.maintenanceDue} due soon`} icon={<Wrench className="w-4 h-4" />} alert={summary.counts.underMaintenance > 0} />
            <StatCard label="Warranty Alerts" value={summary.alerts.warrantyExpiring} sub="expiring in 30 days" icon={<AlertTriangle className="w-4 h-4" />} alert={summary.alerts.warrantyExpiring > 0} />
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, serialâ€¦"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v === 'ALL' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              {Object.keys(STATUS_CONFIG).map(s => <SelectItem key={s} value={s}>{STATUS_CONFIG[s as AssetStatus].label}</SelectItem>)}
            </SelectContent>
          </Select>
          {(search || categoryFilter || statusFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setCategoryFilter(''); setStatusFilter(''); setPage(1); }}>
              <X className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Purchase Cost</TableHead>
                <TableHead>Book Value</TableHead>
                <TableHead>Location / Staff</TableHead>
                <TableHead>Warranty</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : assets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No assets found. Register your first asset.
                  </TableCell>
                </TableRow>
              ) : (
                assets.map(asset => {
                  const statusCfg = STATUS_CONFIG[asset.status];
                  const warrantyDate = asset.warrantyExpiry ? new Date(asset.warrantyExpiry) : null;
                  const warrantyExpiringSoon = warrantyDate && warrantyDate > new Date() && warrantyDate < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                  const depPct = Number(asset.accumulatedDepreciation) / Number(asset.purchaseCost) * 100;

                  return (
                    <TableRow key={asset.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailId(asset.id)}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-muted rounded text-muted-foreground">
                            {CATEGORY_ICONS[asset.category]}
                          </div>
                          <div>
                            <p className="font-medium text-sm leading-tight">{asset.name}</p>
                            <p className="text-xs text-muted-foreground">{asset.assetCode}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{CATEGORY_LABELS[asset.category]}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${statusCfg.bg} ${statusCfg.color} border text-xs font-medium`}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{fmt(asset.purchaseCost)}</TableCell>
                      <TableCell>
                        <div>
                          <span className="text-sm font-medium">{fmt(asset.currentBookValue)}</span>
                          {depPct > 0 && (
                            <div className="mt-1 h-1 w-16 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min(100, depPct)}%` }} />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {asset.location?.name ?? (asset.assignedToStaff ? `${asset.assignedToStaff.firstName} ${asset.assignedToStaff.lastName}` : 'â€”')}
                      </TableCell>
                      <TableCell>
                        {warrantyDate ? (
                          <span className={`text-xs ${warrantyExpiringSoon ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                            {warrantyExpiringSoon && 'âš  '}{fmtDate(asset.warrantyExpiry)}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">â€”</span>}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailId(asset.id)}>
                              <Eye className="w-4 h-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            {asset.status !== 'DISPOSED' && <>
                              <DropdownMenuItem onClick={() => { setEditingAsset(asset); setFormOpen(true); }}>
                                <Edit className="w-4 h-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setMaintenanceForAsset(asset.id)}>
                                <Wrench className="w-4 h-4 mr-2" /> Schedule Maintenance
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDisposeAsset(asset)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Dispose Asset
                              </DropdownMenuItem>
                            </>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                {meta.total} assets Â· Page {meta.page} of {meta.totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Depreciation Confirm Dialog */}
      <AlertDialog open={depreciationOpen} onOpenChange={setDepreciationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post Monthly Depreciation</AlertDialogTitle>
            <AlertDialogDescription>
              This will calculate and post depreciation for all active depreciable assets for the current month.
              Existing entries for this period will not be duplicated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRunDepreciation} disabled={depreciationRunning}>
              {depreciationRunning ? 'Runningâ€¦' : 'Run Depreciation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Asset Form */}
      <AssetFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        asset={editingAsset}
        onSaved={() => loadAll()}
      />

      {/* Detail */}
      <AssetDetailDialog
        open={!!detailId}
        onClose={() => setDetailId(null)}
        assetId={detailId}
        onScheduleMaintenance={id => { setDetailId(null); setMaintenanceForAsset(id); }}
        onEdit={a => { setDetailId(null); setEditingAsset(a); setFormOpen(true); }}
        onDispose={a => { setDetailId(null); setDisposeAsset(a); }}
      />

      {/* Maintenance Dialog */}
      {maintenanceForAsset && (
        <MaintenanceDialog
          open={!!maintenanceForAsset}
          onClose={() => setMaintenanceForAsset(null)}
          assetId={maintenanceForAsset}
          onSaved={loadAll}
        />
      )}

      {/* Dispose Dialog */}
      <DisposeDialog
        open={!!disposeAsset}
        onClose={() => setDisposeAsset(null)}
        asset={disposeAsset}
        onDisposed={loadAll}
      />
    </div>
  );
}


