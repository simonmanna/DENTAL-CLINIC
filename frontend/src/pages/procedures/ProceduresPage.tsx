// src/pages/ProceduresPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Activity,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { proceduresApi } from "../../lib/api";
import type { Procedure, PricingModel, BillingUnit, ProcedureInventoryInput } from "../../types/procedures";
import { useLocations } from "@/hooks/use-locations";
import { RevenueAccountSelect } from "@/components/RevenueAccountSelect";

const PRICING_MODELS: { value: PricingModel; label: string }[] = [
  { value: "FIXED", label: "Fixed Price" },
  { value: "PER_TOOTH", label: "Per Tooth" },
  { value: "PER_ARCH", label: "Per Arch" },
  { value: "PER_SESSION", label: "Per Session" },
  { value: "PER_BRACKET", label: "Per Bracket" },
  { value: "PER_UNIT", label: "Per Unit" },
];

const BILLING_UNITS: { value: BillingUnit; label: string }[] = [
  { value: "TOOTH", label: "Tooth" },
  { value: "ARCH", label: "Arch" },
  { value: "SESSION", label: "Session" },
  { value: "BRACKET", label: "Bracket" },
  { value: "UNIT", label: "Unit" },
];

const fmt = (n: number | undefined | null) =>
  n != null ? n.toLocaleString() : "0";

function statusBadge(isActive: boolean) {
  return isActive ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-medium">
      Active
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-slate-500">
      Inactive
    </Badge>
  );
}

interface FormData {
  code: string;
  name: string;
  category: string;
  description: string;
  baseCost: number;
  basePrice: number;
  defaultDuration: number;
  requiresXray: boolean;
  isActive: boolean;
  pricingModel: PricingModel;
  billingUnit?: BillingUnit;
  currency: string;
  revenueAccountId?: string | null;
  inputs: ProcedureInventoryInput[];
}

const emptyForm = (): FormData => ({
  code: "",
  name: "",
  category: "",
  description: "",
  baseCost: 0,
  basePrice: 0,
  defaultDuration: 30,
  requiresXray: false,
  isActive: true,
  pricingModel: "FIXED",
  billingUnit: undefined,
  currency: "UGX",
  revenueAccountId: null,
  inputs: [],
});

function ProcedureFormDialog({
  open,
  onClose,
  onSaved,
  existing,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: Procedure | null;
  categories: string[];
}) {
  const [form, setForm] = useState<FormData>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        code: existing.code ?? "",
        name: existing.name,
        category: existing.category,
        description: existing.description ?? "",
        baseCost: existing.baseCost ?? 0,
        basePrice: existing.basePrice ?? existing.baseCost ?? 0,
        defaultDuration: existing.defaultDuration ?? 30,
        requiresXray: existing.requiresXray ?? false,
        isActive: existing.isActive ?? true,
        pricingModel: existing.pricingModel ?? "FIXED",
        billingUnit: existing.billingUnit,
        currency: existing.currency ?? "UGX",
        revenueAccountId: existing.revenueAccountId ?? null,
        inputs: [],
      });
    } else {
      setForm(emptyForm());
    }
    setErrors({});
  }, [existing, open]);

  const set = (k: keyof FormData, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.category) e.category = "Category is required";
    if (form.baseCost < 0) e.baseCost = "Cost must be ≥ 0";
    if ((form.basePrice ?? 0) < 0) e.basePrice = "Price must be ≥ 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        code: form.code || undefined,
        inputs: [],
      };
      if (existing) await proceduresApi.update(existing.id, payload);
      else await proceduresApi.create(payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setErrors({ _global: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {existing ? "Edit Procedure" : "New Procedure"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {errors._global && (
            <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
              {errors._global}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name <span className="text-rose-500">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Root Canal Treatment"
                className={errors.name ? "border-rose-400" : ""}
              />
              {errors.name && <p className="text-xs text-rose-500">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder="e.g. D3310 (optional)"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category <span className="text-rose-500">*</span></Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className={errors.category ? "border-rose-400" : ""}>
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.length === 0 ? (
                    <SelectItem value="" disabled>No categories available</SelectItem>
                  ) : (
                    categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {errors.category && <p className="text-xs text-rose-500">{errors.category}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min={5}
                step={5}
                value={form.defaultDuration}
                onChange={(e) => set("defaultDuration", parseInt(e.target.value) || 30)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Internal Cost (UGX) <span className="text-rose-500">*</span></Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={form.baseCost}
                onChange={(e) => set("baseCost", parseFloat(e.target.value) || 0)}
                className={errors.baseCost ? "border-rose-400" : ""}
              />
              <p className="text-xs text-slate-500">What the clinic pays for materials</p>
            </div>
            <div className="space-y-1.5">
              <Label>Selling Price <span className="text-rose-500">*</span></Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={form.basePrice}
                onChange={(e) => set("basePrice", parseFloat(e.target.value) || 0)}
                className={errors.basePrice ? "border-rose-400" : ""}
              />
              <p className="text-xs text-slate-500">What the patient pays</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Pricing Model</Label>
              <Select value={form.pricingModel} onValueChange={(v) => set("pricingModel", v as PricingModel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRICING_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Billing Unit</Label>
              <Select
                value={form.billingUnit || "__none__"}
                onValueChange={(v) => set("billingUnit", v === "__none__" ? undefined : (v as BillingUnit))}
              >
                <SelectTrigger><SelectValue placeholder="Select unit..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {BILLING_UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UGX">UGX</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Revenue Account</Label>
            <RevenueAccountSelect
              value={form.revenueAccountId}
              onChange={(v) => set("revenueAccountId", v)}
              inheritLabel="Inherit from category (else Treatment Revenue)"
            />
            <p className="text-xs text-slate-500">
              GL account this procedure's revenue is recognised into when invoiced.
            </p>
          </div>

          <div className="space-y-0.5">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Brief description of this procedure…"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.requiresXray} onCheckedChange={(v) => set("requiresXray", v)} />
              <Label>Requires X-Ray</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
              <Label>Active</Label>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Saving…" : existing ? "Update Procedure" : "Create Procedure"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProceduresPage() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [editingProcedure, setEditingProcedure] = useState<Procedure | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("__all__");
  const [formOpen, setFormOpen] = useState(false);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: "15" };
      if (search) params.search = search;
      if (filterCategory !== "__all__") params.category = filterCategory;
      const res = await proceduresApi.getAll(params);
      setProcedures(res.data);
      setMeta({ total: res.meta.total, pages: res.meta.pages });
      if (res.categories?.length > 0) setCategories(res.categories);
    } finally {
      setLoading(false);
    }
  }, [search, filterCategory, page]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingProcedure(null);
    setFormOpen(true);
  };

  const openEdit = (p: Procedure) => {
    setEditingProcedure(p);
    setFormOpen(true);
  };

  const handleDelete = async (p: Procedure) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await proceduresApi.delete(p.id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Procedures & Treatments</h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage the procedure catalog with pricing</p>
          </div>
          <Button onClick={openCreate} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus size={16} /> New Procedure
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9 h-8 text-sm"
            placeholder="Search procedures…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-44 text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-2 py-2">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <Activity size={24} className="animate-spin mr-2" /> Loading procedures…
          </div>
        ) : procedures.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Layers size={32} className="mb-3 text-slate-300" />
            <p className="text-sm">No procedures found</p>
            <Button variant="outline" size="sm" onClick={openCreate} className="mt-3">Create first procedure</Button>
          </div>
        ) : (
          <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead>Procedure</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Selling Price</TableHead>
                  <TableHead className="text-center">Internal Cost</TableHead>
                  <TableHead className="text-center">Duration</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procedures.map((proc) => (
                  <TableRow key={proc.id} className="hover:bg-slate-50">
                    <TableCell>
                      <div className="font-medium text-slate-800">{proc.name}</div>
                      {proc.code && <div className="text-xs text-slate-400 font-mono">{proc.code}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-normal">{proc.category}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-semibold text-slate-700">
                      {fmt(proc.basePrice)} {proc.currency}
                    </TableCell>
                    <TableCell className="text-center text-rose-600 font-medium">
                      {fmt(proc.baseCost)}
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-600">
                      {proc.defaultDuration} min
                    </TableCell>
                    <TableCell className="text-center">{statusBadge(proc.isActive)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-500 hover:bg-slate-100"
                          onClick={() => openEdit(proc)}
                        >
                          <Edit2 size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-rose-400 hover:bg-rose-50"
                          onClick={() => handleDelete(proc)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
                <span className="text-xs text-slate-500">{meta.total} total procedures</span>
                <div className="flex gap-1">
                  {Array.from({ length: meta.pages }, (_, i) => i + 1).map((p) => (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Procedure Form Dialog */}
      <ProcedureFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        existing={editingProcedure}
        categories={categories}
      />
    </div>
  );
}