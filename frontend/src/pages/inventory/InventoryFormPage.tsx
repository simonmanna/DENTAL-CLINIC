import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Package,
  Loader2,
  AlertCircle,
  Info,
  BarChart3,
  Truck,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  inventoryApi,
  InventoryCategory,
  Supplier,
  UOM_LABELS,
  UnitOfMeasure,
} from "../../lib/api/inventory.api";

// ─── Helpers ──────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  itemCode: string;
  description: string;
  unit: string;
  uom: UnitOfMeasure;
  categoryId: string;
  supplierId: string;
  quantity: string;
  minQuantity: string;
  unitCost: string;
  batchTracking: boolean;
  location: string;
  isActive: boolean;
  type: "MEDICINE" | "CONSUMABLE" | "EQUIPMENT";
}

const defaultForm: FormState = {
  name: "",
  itemCode: "",
  description: "",
  unit: "",
  uom: "PIECES",
  categoryId: "",
  supplierId: "",
  quantity: "0",
  minQuantity: "0",
  unitCost: "0",
  batchTracking: false,
  location: "",
  isActive: true,
  type: "CONSUMABLE",
};

// Quick UOM category groupings for the select
const UOM_GROUPS: { label: string; items: UnitOfMeasure[] }[] = [
  { label: "Count", items: ["PIECES", "BOX", "PACK", "SET", "KIT"] },
  {
    label: "Medical",
    items: [
      "TABLET",
      "CAPSULE",
      "STRIP",
      "VIAL",
      "AMPULE",
      "SYRINGE",
      "BOTTLE",
      "TUBE",
      "ROLL",
      "GLOVES_PAIR",
    ],
  },
  { label: "Volume", items: ["ML", "LITER"] },
  { label: "Weight", items: ["MG", "G", "KG"] },
  { label: "Dimension", items: ["INCH", "MM"] },
];

export default function InventoryFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id && id !== "new");

  const [form, setForm] = useState<FormState>(defaultForm);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});

  // Load categories + suppliers on mount
  useEffect(() => {
    inventoryApi.getCategories(true).then(setCategories);
    // Fetch suppliers – replace with your actual endpoint
    fetch("/suppliers?isActive=true&limit=200")
      .then((r) => r.json())
      .then((d) => setSuppliers(d.data ?? d))
      .catch(() => {});
  }, []);

  // Load item data in edit mode (only once)
  useEffect(() => {
    if (!isEdit || !id) return;
    setPageLoading(true);
    inventoryApi
      .getItem(id)
      .then((item) => {
        setForm({
          name: item.name,
          itemCode: item.itemCode,
          description: item.description ?? "",
          unit: item.unit,
          uom: item.uom as UnitOfMeasure, // ✅ cast to correct union type
          categoryId: item.category?.id ?? "", // ✅ extract ID from nested object
          supplierId: item.supplier?.id ?? "", // ✅ extract ID from nested object
          quantity: String((item as any).quantity ?? 0), // ✅ fallback if missing
          minQuantity: String(item.minQuantity ?? 0),
          unitCost: String(item.unitCost ?? 0),
          batchTracking: item.batchTracking ?? false,
          location: (item as any).location ?? "", // ✅ fallback if property missing
          isActive: item.isActive ?? true,
          type: (item as any).type ?? "CONSUMABLE", // ✅ fallback if property missing
        });
        setPageLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load item");
        setPageLoading(false);
      });
  }, [id, isEdit]);

  // ── Validation ─────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.unit.trim()) errs.unit = "Unit label is required";
    if (Number(form.quantity) < 0) errs.quantity = "Cannot be negative";
    if (Number(form.minQuantity) < 0) errs.minQuantity = "Cannot be negative";
    if (Number(form.unitCost) < 0) errs.unitCost = "Cannot be negative";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      itemCode: form.itemCode.trim() || undefined,
      description: form.description.trim() || undefined,
      unit: form.unit.trim(),
      uom: form.uom,
      categoryId: form.categoryId || undefined,
      supplierId: form.supplierId || undefined,
      minQuantity: Number(form.minQuantity),
      unitCost: Number(form.unitCost),
      batchTracking: form.batchTracking,
      location: form.location.trim() || undefined,
      isActive: form.isActive,
      type: form.type,
    };

    try {
      const result = isEdit
        ? await inventoryApi.updateItem(id!, payload)
        : await inventoryApi.createItem(payload);
      navigate(`/inventory/${result.id}`);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  if (pageLoading) {
    return (
      <div className="p-2 space-y-2 w-full">
        <Skeleton className="h-8 w-84" />
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 px-0 mx-0">
      {/* ── AdminLTE Style Header ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-0 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-slate-500 hover:text-sky-600 hover:bg-sky-50"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="h-8 w-[1px] bg-slate-200 mx-1" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {isEdit ? "Edit Item" : "Create New Item"}
            </h1>
            <nav className="flex text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              <span>Inventory</span>
              <span className="mx-2">/</span>
              <span className="text-sky-600">
                {isEdit ? form.itemCode : "New Record"}
              </span>
            </nav>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="bg-white"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-sky-600 hover:bg-sky-700 text-white shadow-sm px-6"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {isEdit ? "Update Product" : "Save Product"}
          </Button>
        </div>
      </div>

      {/* ── Main Content Area ── */}
      <div className="py-2 px-0 mx-0">
        <form onSubmit={handleSubmit} className="w-full px-2">
          {error && (
            <Alert variant="destructive" className="mb-2 shadow-md border-l-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="font-medium">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-0 mx-0">
            {/* Left Column: Primary Details */}
            <div className="lg:col-span-2 space-y-2 px-0 mx-0">
              {/* General Information Card */}
              <Card className="border-none shadow-md ring-1 ring-slate-200">
                <CardHeader className="border-b border-slate-50 bg-slate-50/50 rounded-t-lg border-t-4 border-t-sky-500">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-700 uppercase tracking-wide">
                    <Info className="h-4 w-4 text-sky-600" /> General
                    Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-2">
                      <Label
                        htmlFor="name"
                        className="text-slate-600 font-semibold"
                      >
                        Item Display Name
                      </Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                        placeholder="Enter full descriptive name..."
                        className={`focus-visible:ring-sky-500 ${fieldErrors.name ? "border-red-500" : "border-slate-200"}`}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="itemCode"
                        className="text-slate-600 font-semibold"
                      >
                        Internal Sku / Code
                      </Label>
                      <Input
                        id="itemCode"
                        value={form.itemCode}
                        onChange={(e) =>
                          set("itemCode", e.target.value.toUpperCase())
                        }
                        placeholder="SKU-XXXX"
                        className="font-mono bg-slate-50 border-slate-200"
                        disabled={isEdit}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-600 font-semibold">
                        Classification
                      </Label>
                      <Select
                        value={form.categoryId || "NONE"}
                        onValueChange={(v) =>
                          set("categoryId", v === "NONE" ? "" : v)
                        }
                      >
                        <SelectTrigger className="border-slate-200">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Uncategorized</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-600 font-semibold">
                        Inventory Type
                      </Label>
                      <Select
                        value={form.type}
                        onValueChange={(v) => {
                          if (
                            v === "MEDICINE" ||
                            v === "CONSUMABLE" ||
                            v === "EQUIPMENT"
                          ) {
                            set("type", v);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEDICINE">Medicine</SelectItem>
                          <SelectItem value="CONSUMABLE">Consumable</SelectItem>
                          <SelectItem value="EQUIPMENT">Equipment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label
                        htmlFor="description"
                        className="text-slate-600 font-semibold"
                      >
                        Notes & Description
                      </Label>
                      <Textarea
                        id="description"
                        value={form.description}
                        onChange={(e) => set("description", e.target.value)}
                        rows={3}
                        className="resize-none border-slate-200 focus-visible:ring-sky-500"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Inventory & Stock Card */}
              <Card className="border-none shadow-md ring-1 ring-slate-200 overflow-hidden">
                <CardHeader className="border-b border-slate-50 bg-slate-50/50 border-t-4 border-t-sky-500">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-700 uppercase tracking-wide">
                    <BarChart3 className="h-4 w-4 text-sky-600" /> Stock &
                    Measurement
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-4 px-4 py-3 bg-sky-50/30 rounded-lg border border-sky-100">
                      <div className="space-y-2">
                        <Label className="text-sky-900 font-bold">
                          Standard Unit of Measure
                        </Label>
                        <Select
                          value={form.uom}
                          onValueChange={(v) => set("uom", v as UnitOfMeasure)}
                        >
                          <SelectTrigger className="bg-white border-sky-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UOM_GROUPS.map((group) => (
                              <React.Fragment key={group.label}>
                                <div className="px-2 py-1 text-[10px] font-black text-slate-400 uppercase">
                                  {group.label}
                                </div>
                                {group.items.map((uom) => (
                                  <SelectItem key={uom} value={uom}>
                                    {UOM_LABELS[uom]}
                                  </SelectItem>
                                ))}
                              </React.Fragment>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sky-900 font-bold">
                          Display Label
                        </Label>
                        <Input
                          value={form.unit}
                          onChange={(e) => set("unit", e.target.value)}
                          placeholder="e.g. Box of 50"
                          className="bg-white border-sky-200"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label className="text-slate-600 font-semibold">
                          Minimum Threshold
                        </Label>
                        <Input
                          type="number"
                          value={form.minQuantity}
                          onChange={(e) => set("minQuantity", e.target.value)}
                        />
                        <p className="text-[10px] text-slate-400 italic">
                          Triggers low-stock alerts
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-600 font-semibold">
                          Unit Cost (UGX)
                        </Label>
                        <Input
                          type="number"
                          value={form.unitCost}
                          onChange={(e) => set("unitCost", e.target.value)}
                          className="font-semibold text-sky-700"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-600 font-semibold">
                        Batch Tracking
                      </Label>
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                          <p className="text-sm font-medium text-slate-700">
                            Enable batch/lot tracking
                          </p>
                          <p className="text-xs text-slate-500">
                            Track items by batch number and expiry
                          </p>
                        </div>
                        <Switch
                          checked={form.batchTracking}
                          onCheckedChange={(v) => set("batchTracking", v)}
                          className="data-[state=checked]:bg-sky-600"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Logistics & Status */}
            <div className="space-y-8">
              {/* Supplier & Location */}
              <Card className="border-none shadow-md ring-1 ring-slate-200">
                <CardHeader className="border-b border-slate-50 bg-slate-50/50 border-t-4 border-t-sky-500">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-700 uppercase tracking-wide">
                    <Truck className="h-4 w-4 text-sky-600" /> Logistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-semibold text-xs">
                      Primary Supplier
                    </Label>
                    <Select
                      value={form.supplierId || "NONE"}
                      onValueChange={(v) =>
                        set("supplierId", v === "NONE" ? "" : v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Walk-in / Various</SelectItem>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600 font-semibold text-xs">
                      Warehouse Location
                    </Label>
                    <Input
                      value={form.location}
                      onChange={(e) => set("location", e.target.value)}
                      placeholder="e.g. Aisle 4, Bin B"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Visibility Status */}
              <Card className="border-none shadow-md ring-1 ring-slate-200 overflow-hidden">
                <CardHeader className="border-b border-slate-50 bg-slate-50/50 border-t-4 border-t-sky-500">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-700 uppercase tracking-wide">
                    <Activity className="h-4 w-4 text-sky-600" /> Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div
                    className={`p-4 rounded-lg flex items-center justify-between transition-colors ${form.isActive ? "bg-emerald-50" : "bg-slate-100"}`}
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        {form.isActive ? "Active" : "Archived"}
                      </p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-tight">
                        Visibility in System
                      </p>
                    </div>
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(v) => set("isActive", v)}
                      className="data-[state=checked]:bg-emerald-500"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Total Value Widget (AdminLTE style info box) */}
              {Number(form.quantity) > 0 && (
                <div className="bg-sky-600 rounded-lg shadow-md p-4 text-white flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-lg">
                    <Package className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs uppercase font-bold opacity-80">
                      Estimated Stock Value
                    </p>
                    <p className="text-xl font-black">
                      UGX{" "}
                      {(
                        Number(form.quantity) * Number(form.unitCost)
                      ).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}