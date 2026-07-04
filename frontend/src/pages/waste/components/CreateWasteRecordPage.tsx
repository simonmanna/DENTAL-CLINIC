import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Package,
  Pill,
  Search,
  MapPin,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
  Calendar,
  Hash,
  FileWarning,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { wasteApi, locationsApi } from "../../../lib/api/waste.api";
import type {
  WasteItemForm,
  LocationStockItem,
  Location,
} from "../../../types/waste.types";
import { WASTE_CATEGORY_META } from "../../../types/waste.types";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(d: string | Date | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-UG", {
    month: "short",
    year: "numeric",
  });
}

// ─── Item Row Component ────────────────────────────────────────────────────────
function ItemRow({
  item,
  index,
  stockItems,
  locationId,
  onUpdate,
  onRemove,
}: {
  item: WasteItemForm;
  index: number;
  stockItems: LocationStockItem[];
  locationId: string;
  onUpdate: (id: string, field: keyof WasteItemForm, value: any) => void;
  onRemove: (id: string) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");

  const filteredItems = stockItems.filter(
    (s) =>
      s.name.toLowerCase().includes(searchVal.toLowerCase()) ||
      (s.itemCode &&
        s.itemCode.toLowerCase().includes(searchVal.toLowerCase())) ||
      (s.genericName &&
        s.genericName.toLowerCase().includes(searchVal.toLowerCase())),
  );

  const handleSelectItem = async (stock: LocationStockItem) => {
    onUpdate(
      item.id,
      "inventoryItemId",
      stock.type === "INVENTORY" ? stock.id : undefined,
    );
    onUpdate(item.id, "drugId", stock.type === "DRUG" ? stock.id : undefined);
    onUpdate(item.id, "itemType", stock.type);
    onUpdate(item.id, "itemName", stock.name);
    onUpdate(item.id, "unit", stock.unit);
    onUpdate(item.id, "unitCost", stock.unitCost);
    onUpdate(item.id, "availableQty", stock.availableQty);
    onUpdate(item.id, "batchNumber", stock.batchNumber || "");
    onUpdate(
      item.id,
      "expiryDate",
      stock.expiryDate ? stock.expiryDate.split("T")[0] : "",
    );
    setPopoverOpen(false);
    setSearchVal("");

    if ((stock as any).batchTracking && locationId) {
      try {
        const { batches } = await wasteApi.getAvailableBatches(
          stock.id,
          locationId,
        );
        onUpdate(item.id, "availableBatches", batches);
        onUpdate(item.id, "batchTracking", true);
      } catch (e) {
        console.warn("Failed to fetch batches:", e);
        onUpdate(item.id, "batchTracking", true);
      }
    }
  };

  const isOverQty = item.quantity > item.availableQty && item.availableQty > 0;
  const totalCost = item.quantity * item.unitCost;

  return (
    <div className="relative bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:border-gray-300 transition-colors">
      {/* Row header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
            {index + 1}
          </span>
          {item.itemType === "DRUG" ? (
            <Badge
              variant="outline"
              className="text-xs gap-1 text-blue-700 border-blue-200 bg-blue-50"
            >
              <Pill className="w-3 h-3" /> Drug
            </Badge>
          ) : item.itemName ? (
            <Badge
              variant="outline"
              className="text-xs gap-1 text-emerald-700 border-emerald-200 bg-emerald-50"
            >
              <Package className="w-3 h-3" /> Inventory
            </Badge>
          ) : null}
          {item.itemName && (
            <span className="text-sm font-semibold text-gray-800">
              {item.itemName}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(item.id)}
          className="h-7 w-7 p-0 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Item picker */}
        <div className="sm:col-span-2 lg:col-span-1">
          <Label className="text-xs font-medium text-gray-600 mb-1.5 block">
            Select Item <span className="text-red-500">*</span>
          </Label>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between rounded-xl border-gray-200 font-normal text-left"
              >
                <span
                  className={item.itemName ? "text-gray-900" : "text-gray-400"}
                >
                  {item.itemName || "Search and select item..."}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-0 rounded-xl shadow-xl"
              align="start"
            >
              <Command>
                <CommandInput
                  placeholder="Search items, drugs, codes..."
                  value={searchVal}
                  onValueChange={setSearchVal}
                />
                <CommandList className="max-h-60">
                  <CommandEmpty className="py-6 text-center text-sm text-gray-500">
                    No items found at this location.
                  </CommandEmpty>
                  {filteredItems.length > 0 && (
                    <>
                      {filteredItems.filter((i) => i.type === "INVENTORY")
                        .length > 0 && (
                        <CommandGroup heading="Inventory Items">
                          {filteredItems
                            .filter((i) => i.type === "INVENTORY")
                            .map((s) => (
                              <CommandItem
                                key={s.stockId}
                                onSelect={() => handleSelectItem(s)}
                                className="cursor-pointer"
                              >
                                <Package className="w-3.5 h-3.5 mr-2 text-emerald-600 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {s.name}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {s.itemCode} · Qty: {s.availableQty}{" "}
                                    {s.unit}
                                    {s.expiryDate && (
                                      <span className="text-orange-500 ml-1">
                                        · Exp:{" "}
                                        {new Date(
                                          s.expiryDate,
                                        ).toLocaleDateString("en-UG", {
                                          month: "short",
                                          year: "numeric",
                                        })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      )}
                      {filteredItems.filter((i) => i.type === "DRUG").length >
                        0 && (
                        <CommandGroup heading="Drugs / Medications">
                          {filteredItems
                            .filter((i) => i.type === "DRUG")
                            .map((s) => (
                              <CommandItem
                                key={s.stockId}
                                onSelect={() => handleSelectItem(s)}
                                className="cursor-pointer"
                              >
                                <Pill className="w-3.5 h-3.5 mr-2 text-blue-600 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {s.name}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {s.genericName} · Qty: {s.availableQty}{" "}
                                    {s.unit}
                                    {s.expiryDate && (
                                      <span className="text-orange-500 ml-1">
                                        · Exp:{" "}
                                        {new Date(
                                          s.expiryDate,
                                        ).toLocaleDateString("en-UG", {
                                          month: "short",
                                          year: "numeric",
                                        })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      )}
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {item.availableQty > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              Available:{" "}
              <strong>
                {item.availableQty} {item.unit}
              </strong>
              {item.expiryDate && (
                <span className="ml-2 text-orange-500">
                  · Expires: {new Date(item.expiryDate).toLocaleDateString()}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Quantity */}
        <div>
          <Label className="text-xs font-medium text-gray-600 mb-1.5 block">
            Quantity <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input
              type="number"
              min={0.01}
              step="any"
              value={item.quantity || ""}
              onChange={(e) =>
                onUpdate(item.id, "quantity", parseFloat(e.target.value) || 0)
              }
              placeholder="0"
              className={`rounded-xl border-gray-200 pr-14 ${isOverQty ? "border-red-400 focus-visible:ring-red-400" : ""}`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
              {item.unit || "unit"}
            </span>
          </div>
          {isOverQty && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Exceeds available stock ({item.availableQty})
            </p>
          )}
        </div>

        {/* Unit Cost */}
        <div>
          <Label className="text-xs font-medium text-gray-600 mb-1.5 block">
            Unit Cost (UGX)
          </Label>
          <Input
            type="number"
            min={0}
            step="any"
            value={item.unitCost || ""}
            onChange={(e) =>
              onUpdate(item.id, "unitCost", parseFloat(e.target.value) || 0)
            }
            placeholder="0"
            className="rounded-xl border-gray-200"
          />
        </div>

        {/* Batch Number */}
        <div>
          <Label className="text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1">
            <Hash className="w-3 h-3" /> Batch Number
          </Label>
          <Input
            value={item.batchNumber || ""}
            onChange={(e) => onUpdate(item.id, "batchNumber", e.target.value)}
            placeholder="e.g. BT-2024-001"
            className="rounded-xl border-gray-200"
          />
        </div>

        {/* Batch Strategy Panel - for batch-tracked items */}
        {item.batchTracking && (
          <div className="col-span-full bg-amber-50 border border-amber-200 rounded-xl p-3 mt-2">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-800">
                Batch Tracking — Select how to deduct stock
              </span>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-amber-700">Strategy:</span>
              <Select
                value={item.distributionStrategy || "FEFO"}
                onValueChange={(v: "FEFO" | "FIFO" | "MANUAL") =>
                  onUpdate(item.id, "distributionStrategy", v)
                }
              >
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FEFO">FEFO (First Expiry)</SelectItem>
                  <SelectItem value="FIFO">FIFO (First In)</SelectItem>
                  <SelectItem value="MANUAL">Manual Selection</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Manual batch selection */}
            {item.distributionStrategy === "MANUAL" && (
              <div className="space-y-2">
                {item.availableBatches?.length ? (
                  <Select
                    value={item.selectedBatchNumber || ""}
                    onValueChange={(v) =>
                      onUpdate(item.id, "selectedBatchNumber", v)
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select batch..." />
                    </SelectTrigger>
                    <SelectContent>
                      {item.availableBatches.map((b) => (
                        <SelectItem
                          key={b.id}
                          value={b.batchNumber || "DEFAULT"}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span>{b.batchNumber || "DEFAULT"}</span>
                            <span className="text-xs text-gray-400 ml-4">
                              Qty: {b.quantity}
                              {b.expiryDate &&
                                ` · Exp: ${fmtDate(b.expiryDate)}`}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-amber-600">
                    No active batches with stock found at this location.
                  </p>
                )}
              </div>
            )}

            {/* Auto-distribution preview */}
            {item.distributionStrategy !== "MANUAL" &&
              item.availableBatches?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-800">
                    Batches will be consumed in this order:
                  </p>
                  <div className="space-y-1">
                    {[...item.availableBatches] // ← spread to avoid mutating state
                      .sort((a, b) => {
                        if (item.distributionStrategy === "FIFO") {
                          return (
                            new Date(a.receivedAt || 0).getTime() -
                            new Date(b.receivedAt || 0).getTime()
                          );
                        }
                        if (!a.expiryDate) return 1;
                        if (!b.expiryDate) return -1;
                        return (
                          new Date(a.expiryDate).getTime() -
                          new Date(b.expiryDate).getTime()
                        );
                      })
                      .slice(0, 3)
                      .map((b, i) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between text-xs bg-white/60 rounded px-2 py-1"
                        >
                          <span className="font-medium text-amber-900">
                            {i + 1}. {b.batchNumber || "DEFAULT"}
                          </span>
                          <span className="text-amber-700">
                            Qty: {b.quantity}
                            {b.expiryDate && ` · Exp: ${fmtDate(b.expiryDate)}`}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Expiry Date */}
        <div>
          <Label className="text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Expiry Date
          </Label>
          <Input
            type="date"
            value={item.expiryDate || ""}
            onChange={(e) => onUpdate(item.id, "expiryDate", e.target.value)}
            className="rounded-xl border-gray-200"
          />
        </div>

        {/* Reason */}
        <div>
          <Label className="text-xs font-medium text-gray-600 mb-1.5 block">
            Item Reason
          </Label>
          <Input
            value={item.reason || ""}
            onChange={(e) => onUpdate(item.id, "reason", e.target.value)}
            placeholder="e.g. Found damaged on shelf"
            className="rounded-xl border-gray-200"
          />
        </div>
      </div>

      {/* Cost summary */}
      {item.itemName && item.quantity > 0 && (
        <div className="mt-3 flex justify-end">
          <div className="bg-gray-50 rounded-xl px-3 py-1.5 text-sm">
            <span className="text-gray-500">Estimated Loss:</span>{" "}
            <span className="font-bold text-gray-900">
              {formatCurrency(totalCost)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Create Page ──────────────────────────────────────────────────────────
export default function CreateWasteRecordPage() {
  const navigate = useNavigate();

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [witnessName, setWitnessName] = useState("");
  const [disposalMethod, setDisposalMethod] = useState("");
  const [disposalDate, setDisposalDate] = useState("");

  const [items, setItems] = useState<WasteItemForm[]>([]);
  const [stockItems, setStockItems] = useState<LocationStockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load locations
  useEffect(() => {
    locationsApi.list().then(setLocations).catch(console.error);
  }, []);

  // Load stock when location changes
  const loadLocationStock = useCallback(async (locId: string) => {
    if (!locId) return;
    setStockLoading(true);
    try {
      const stock = await wasteApi.locationStock(locId);

      // ✅ Frontend filter: only items with availableQty > 0
    const filteredInventory = stock.inventoryItems.filter(i => i.availableQty > 0);
    const filteredDrugs = stock.drugs?.filter(i => i.availableQty > 0) || [];
    
    console.log(`✅ Showing ${filteredInventory.length + filteredDrugs.length} items with stock > 0`);
    
    setStockItems([...filteredInventory, ...filteredDrugs]);
    setItems([]);

      // setStockItems([...stock.inventoryItems, ...stock.drugs]);
      // // Clear items when location changes
      // setItems([]);
    } catch {
      toast.error("Failed to load stock for this location");
    } finally {
      setStockLoading(false);
    }
  }, []);

  useEffect(() => {
    if (locationId) loadLocationStock(locationId);
  }, [locationId, loadLocationStock]);

  // ─── Item management ────────────────────────────────────────────────────────
  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: uuidv4(),
        itemType: "INVENTORY",
        itemName: "",
        unit: "",
        quantity: 1,
        unitCost: 0,
        availableQty: 0,
      },
    ]);
  };

  const updateItem = (id: string, field: keyof WasteItemForm, value: any) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // ─── Totals ─────────────────────────────────────────────────────────────────
  const totalValue = items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
  const totalItems = items.filter((i) => i.itemName).length;

  // ─── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const errs: Record<string, string> = {};
    if (!locationId) errs.locationId = "Location is required";
    if (!category) errs.category = "Category is required";
    if (items.length === 0) errs.items = "At least one item is required";

    items.forEach((item, i) => {
      if (!item.itemName) errs[`item_${i}_name`] = "Select an item";
      if (!item.quantity || item.quantity <= 0)
        errs[`item_${i}_qty`] = "Quantity must be greater than 0";
      if (item.quantity > item.availableQty && item.availableQty > 0)
        errs[`item_${i}_over`] = "Quantity exceeds available stock";
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) {
      toast.error("Please fix validation errors before submitting");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        locationId,
        category,
        notes: notes || undefined,
        witnessName: witnessName || undefined,
        disposalMethod: disposalMethod || undefined,
        disposalDate: disposalDate || undefined,
        items: items.map((item) => ({
          itemType: item.itemType,
          inventoryItemId: item.inventoryItemId,
          drugId: item.drugId,
          itemName: item.itemName,
          unit: item.unit,
          quantity: item.quantity,
          unitCost: item.unitCost,
          batchNumber: item.batchNumber || undefined,
          expiryDate: item.expiryDate || undefined,
          reason: item.reason || undefined,
        })),
      };

      const result = await wasteApi.create(payload);
      toast.success(
        `Waste record ${result.wasteCode} created successfully. Awaiting approval.`,
      );
      navigate("/waste-records");
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        (Array.isArray(e?.response?.data?.message)
          ? e.response.data.message.join(", ")
          : "Failed to create waste record");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="gap-1.5 text-gray-600 rounded-xl"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div className="w-px h-5 bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-red-50 rounded-lg">
                <FileWarning className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">
                  Record Waste / Damage / Expiry
                </h1>
                <p className="text-xs text-gray-500">
                  Creates a record pending approval
                </p>
              </div>
            </div>
          </div>

          {/* Summary pill */}
          {totalItems > 0 && (
            <div className="hidden sm:flex items-center gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-sm">
                <span className="text-gray-500">
                  {totalItems} item{totalItems !== 1 ? "s" : ""} ·
                </span>{" "}
                <span className="font-bold text-gray-900">
                  {formatCurrency(totalValue)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {/* ── Info banner ──────────────────────────────────────────────────── */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700">
            <strong>Approval Required:</strong> This waste record will be
            submitted for review. Stock will only be deducted after an Admin or
            Super Admin approves the record. You will be notified once reviewed.
          </div>
        </div>

        {/* ── Step 1: Location & Category ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              1
            </div>
            <h2 className="font-semibold text-gray-900">Location & Category</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Location */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                Location <span className="text-red-500">*</span>
              </Label>
              <Select
                value={locationId}
                onValueChange={(v) => {
                  setLocationId(v);
                  setErrors((e) => ({ ...e, locationId: "" }));
                }}
              >
                <SelectTrigger
                  className={`rounded-xl border-gray-200 ${errors.locationId ? "border-red-400" : ""}`}
                >
                  <SelectValue placeholder="Select location..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}{" "}
                      <span className="text-gray-400 text-xs ml-1">
                        ({l.type})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.locationId && (
                <p className="text-xs text-red-500 mt-1">{errors.locationId}</p>
              )}
              {locationId && (
                <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                  {stockLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading
                      stock…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      {stockItems.length} items available at this location
                    </>
                  )}
                </p>
              )}
            </div>

            {/* Category */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Waste Category <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(WASTE_CATEGORY_META).map(([key, meta]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setCategory(key);
                      setErrors((e) => ({ ...e, category: "" }));
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      category === key
                        ? `${meta.bg} ${meta.color} border-current shadow-sm`
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <span className="text-base">{meta.icon}</span>
                    <span className="text-xs">{meta.label}</span>
                  </button>
                ))}
              </div>
              {errors.category && (
                <p className="text-xs text-red-500 mt-1">{errors.category}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Step 2: Items ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                2
              </div>
              <h2 className="font-semibold text-gray-900">
                Items to Write Off
              </h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addItem}
              disabled={!locationId || stockLoading}
              className="gap-1.5 rounded-xl border-gray-200 text-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Item
            </Button>
          </div>

          {!locationId ? (
            <div className="py-10 flex flex-col items-center gap-2 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
              <MapPin className="w-8 h-8 text-gray-200" />
              <p className="text-sm font-medium">Select a location first</p>
              <p className="text-xs">Items are filtered by location stock</p>
            </div>
          ) : stockLoading ? (
            <div className="py-10 flex flex-col items-center gap-2 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
              <p className="text-sm">Loading stock for this location…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
              <Package className="w-8 h-8 text-gray-200" />
              <p className="text-sm font-medium text-gray-500">
                No items added yet
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={addItem}
                className="mt-1 gap-1.5 rounded-xl"
              >
                <Plus className="w-3.5 h-3.5" />
                Add First Item
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  locationId={locationId}
                  stockItems={stockItems}
                  onUpdate={updateItem}
                  onRemove={removeItem}
                />
              ))}
              <Button
                variant="outline"
                onClick={addItem}
                className="w-full gap-2 rounded-xl border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700"
              >
                <Plus className="w-4 h-4" />
                Add Another Item
              </Button>
            </div>
          )}

          {errors.items && (
            <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {errors.items}
            </p>
          )}
        </div>

        {/* ── Step 3: Additional Details ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              3
            </div>
            <h2 className="font-semibold text-gray-900">Additional Details</h2>
            <span className="text-xs text-gray-400">(optional)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
                General Notes
              </Label>
              <Textarea
                placeholder="Describe the situation, storage conditions, or any other context..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-xl border-gray-200 resize-none"
                rows={3}
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Witness Name
              </Label>
              <Input
                value={witnessName}
                onChange={(e) => setWitnessName(e.target.value)}
                placeholder="Name of witness present"
                className="rounded-xl border-gray-200"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Disposal Method
              </Label>
              <Select value={disposalMethod} onValueChange={setDisposalMethod}>
                <SelectTrigger className="rounded-xl border-gray-200">
                  <SelectValue placeholder="How will items be disposed?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCINERATION">Incineration</SelectItem>
                  <SelectItem value="LANDFILL">Landfill / Skip</SelectItem>
                  <SelectItem value="RETURN_TO_SUPPLIER">
                    Return to Supplier
                  </SelectItem>
                  <SelectItem value="PHARMACEUTICAL_WASTE">
                    Pharmaceutical Waste Disposal
                  </SelectItem>
                  <SelectItem value="SHARPS_CONTAINER">
                    Sharps Container
                  </SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Planned Disposal Date
              </Label>
              <Input
                type="date"
                value={disposalDate}
                onChange={(e) => setDisposalDate(e.target.value)}
                className="rounded-xl border-gray-200"
              />
            </div>
          </div>
        </div>

        {/* ── Summary & Submit ──────────────────────────────────────────────── */}
        {items.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-red-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                Summary
              </h3>
            </div>
            <div className="space-y-1.5">
              {items
                .filter((i) => i.itemName)
                .map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-red-700">
                      {item.itemName}
                      <span className="text-red-400 ml-2">
                        × {item.quantity} {item.unit}
                      </span>
                    </span>
                    <span className="font-medium text-red-900">
                      {formatCurrency(item.quantity * item.unitCost)}
                    </span>
                  </div>
                ))}
            </div>
            <div className="border-t border-red-200 mt-3 pt-3 flex justify-between items-center">
              <span className="font-semibold text-red-900">
                Total Estimated Loss
              </span>
              <span className="text-xl font-bold text-red-900">
                {formatCurrency(totalValue)}
              </span>
            </div>
          </div>
        )}

        {/* ── Action Buttons ────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pb-6">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            disabled={submitting}
            className="rounded-xl border-gray-200"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting || !locationId || !category || items.length === 0
            }
            className="bg-red-600 hover:bg-red-700 text-white rounded-xl gap-2 min-w-36"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Submit for Approval
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}