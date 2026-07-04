"use client";

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Package,
  MapPin,
  Calendar,
  Loader2,
  Boxes,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

import {
  listLocations,
  getAvailableBatches,
  createTransfer,
  getTransfer,
  updateTransfer,
} from "../../services/stock-transfer.api";
import { inventoryApi } from "../../lib/api/inventory.api";

// ── Types ────────────────────────────────────────────────────────────────────

type DistributionStrategy = "FEFO" | "FIFO" | "MANUAL";

interface BatchInfo {
  id: string;
  batchNumber: string | null;
  quantity: number;
  expiryDate?: string | null;
  receivedAt?: string | null;
  unitCost?: number;
}

interface InventoryItemOption {
  id: string;
  name: string;
  unit: string;
  uom: string;
  batchTracking: boolean;
}

interface FormRow {
  _key: string;
  inventoryItemId: string;
  itemName: string;
  unit: string;
  uom: string;
  quantityRequested: string;
  quantityTransferred: string;
  batchTracking?: boolean;
  availableBatches?: BatchInfo[];
  selectedBatchNumber?: string;
  // distributionStrategy?: "FEFO" | "FIFO" | "MANUAL";
  distributionStrategy?: DistributionStrategy;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function genKey() {
  return Math.random().toString(36).substring(2, 9);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StockTransferFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [inventoryItems, setInventoryItems] = useState<InventoryItemOption[]>(
    [],
  );

  const [form, setForm] = useState({
    fromLocationId: "",
    toLocationId: "",
    transferDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [rows, setRows] = useState<FormRow[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  type DistributionStrategy = "FEFO" | "FIFO" | "MANUAL";

  // ── Load references ───────────────────────────────────────────────────────

  // ── Load references ───────────────────────────────────────────────────────
  useEffect(() => {
    listLocations()
      .then(setLocations)
      .catch(() => toast.error("Failed to load locations"));

    // ✅ FIXED: Use inventoryApi instead of raw fetch
    inventoryApi
      .getItems({ limit: 2000, isActive: true })
      .then((res) => {
        // ✅ Your backend returns { data: [...], meta: {...} }
        const items =
          res.data?.map((item: any) => ({
            id: item.id,
            name: item.name,
            unit: item.unit,
            uom: item.uom,
            batchTracking: item.batchTracking ?? false, // ✅ Ensure this field is included
          })) || [];
        setInventoryItems(items);
      })
      .catch((err) => {
        console.error("Failed to load inventory items:", err);
        toast.error("Failed to load inventory items");
      });
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getTransfer(id)
      .then((data: any) => {
        setForm({
          fromLocationId: data.fromLocationId || "",
          toLocationId: data.toLocationId || "",
          transferDate:
            data.transferDate?.split("T")[0] ||
            new Date().toISOString().split("T")[0],
          notes: data.notes || "",
        });
        setRows(
          (data.items || []).map((item: any) => ({
            _key: genKey(),
            inventoryItemId: item.inventoryItemId || "",
            itemName: item.itemName || "",
            unit: item.unit || "",
            uom: item.uom || "PIECES",
            quantityRequested: String(item.quantityRequested ?? ""),
            quantityTransferred: String(item.quantityTransferred ?? ""),
            batchTracking: item.batchTracking,
            selectedBatchNumber: item.batchNumber || undefined,
            distributionStrategy: (item.distributionStrategy as DistributionStrategy) || "FEFO",
            // distributionStrategy: item.distributionStrategy || "FEFO",
          })),
        );
        // Refetch batches for edit mode after locations/items are set
        setTimeout(() => {
          rowsRef.current.forEach((row) => {
            if (
              row.inventoryItemId &&
              row.batchTracking &&
              data.fromLocationId
            ) {
              const item = inventoryItems.find(
                (i) => i.id === row.inventoryItemId,
              );
              if (item)
                refreshBatchesForRow(row._key, item.id, data.fromLocationId);
            }
          });
        }, 0);
      })
      .catch((err: any) => {
        toast.error(err?.message || "Failed to load transfer");
        navigate("/stock-transfers");
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  // ── Row management ────────────────────────────────────────────────────────
  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        _key: genKey(),
        inventoryItemId: "",
        itemName: "",
        unit: "",
        uom: "PIECES",
        quantityRequested: "",
        quantityTransferred: "",
        distributionStrategy: "FEFO",
      },
    ]);
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r._key !== key));
  };

  const patchRow = (key: string, patch: Partial<FormRow>) => {
    setRows((prev) =>
      prev.map((r) => (r._key === key ? { ...r, ...patch } : r)),
    );
  };

  const refreshBatchesForRow = async (
    key: string,
    itemId: string,
    locationId: string,
  ) => {
    try {
      const { batches } = await getAvailableBatches(itemId, locationId);
      patchRow(key, { availableBatches: batches });
    } catch (e) {
      console.warn("Failed to fetch batches:", e);
    }
  };

  const selectItemForRow = async (key: string, item: InventoryItemOption) => {
    patchRow(key, {
      inventoryItemId: item.id,
      itemName: item.name,
      unit: item.unit,
      uom: item.uom,
      batchTracking: item.batchTracking,
      selectedBatchNumber: undefined,
      availableBatches: undefined,
    });

    if (item.batchTracking && form.fromLocationId) {
      await refreshBatchesForRow(key, item.id, form.fromLocationId);
    }
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    if (!form.fromLocationId) {
      toast.error("Please select a source location");
      return false;
    }
    if (!form.toLocationId) {
      toast.error("Please select a destination location");
      return false;
    }
    if (form.fromLocationId === form.toLocationId) {
      toast.error("Source and destination must be different");
      return false;
    }
    if (!form.transferDate) {
      toast.error("Please select a transfer date");
      return false;
    }
    if (rows.length === 0) {
      toast.error("Add at least one item");
      return false;
    }

    for (const row of rows) {
      if (!row.inventoryItemId) {
        toast.error(`Please select an item for row ${rows.indexOf(row) + 1}`);
        return false;
      }
      const req = parseFloat(row.quantityRequested);
      if (!req || req <= 0 || isNaN(req)) {
        toast.error(
          `Enter a valid requested quantity for ${row.itemName || "item"}`,
        );
        return false;
      }
      if (row.batchTracking) {
        if (!row.distributionStrategy) {
          toast.error(`Select a distribution strategy for ${row.itemName}`);
          return false;
        }
        if (row.distributionStrategy === "MANUAL" && !row.selectedBatchNumber) {
          toast.error(`Select a batch for ${row.itemName}`);
          return false;
        }
      }
    }
    return true;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);

    try {
      const payload = {
        fromLocationId: form.fromLocationId,
        toLocationId: form.toLocationId,
        transferDate: new Date(form.transferDate).toISOString(),
        notes: form.notes || undefined,
        items: rows.map((row) => ({
          inventoryItemId: row.inventoryItemId,
          itemName: row.itemName,
          unit: row.unit,
          uom: row.uom,
          quantityRequested: parseFloat(row.quantityRequested),
          quantityTransferred: parseFloat(
            row.quantityTransferred || row.quantityRequested,
          ),
          ...(row.batchTracking
            ? row.distributionStrategy === "MANUAL"
              ? {
                batchNumber: row.selectedBatchNumber,
                distributionStrategy: "MANUAL" as const,
                }
              : { distributionStrategy: row.distributionStrategy  as DistributionStrategy}
            : {}),
        })),
      };

      if (isEdit) {
        await updateTransfer(id!, payload);
        toast.success("Transfer updated");
      } else {
        await createTransfer(payload);
        toast.success("Transfer created");
      }
      navigate("/stock-transfers");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save transfer");
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const sortedBatches = (row: FormRow): BatchInfo[] => {
    if (!row.availableBatches) return [];
    const list = [...row.availableBatches];
    if (row.distributionStrategy === "FEFO") {
      list.sort((a, b) => {
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return (
          new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
        );
      });
    } else if (row.distributionStrategy === "FIFO") {
      list.sort((a, b) => {
        if (!a.receivedAt) return 1;
        if (!b.receivedAt) return -1;
        return (
          new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
        );
      });
    }
    return list;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {isEdit ? "Edit Stock Transfer" : "New Stock Transfer"}
            </h1>
            <p className="text-xs text-slate-500">
              {isEdit
                ? "Update transfer details"
                : "Move inventory between locations"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-sky-600 hover:bg-sky-700"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEdit ? "Update Transfer" : "Create Transfer"}
          </Button>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Transfer Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-400" />
              Transfer Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">From Location *</Label>
              <Select
                value={form.fromLocationId || "SELECT"}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    fromLocationId: v === "SELECT" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SELECT">Select source...</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">To Location *</Label>
              <Select
                value={form.toLocationId || "SELECT"}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    toLocationId: v === "SELECT" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SELECT">Select destination...</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Transfer Date *</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="date"
                  className="pl-9"
                  value={form.transferDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, transferDate: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <Label className="text-xs text-slate-600">Notes</Label>
              <Textarea
                placeholder="Optional notes about this transfer..."
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-400" />
              Items to Transfer
            </CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                No items added. Click <strong>Add Item</strong> to begin.
              </div>
            )}

            {rows.map((row, idx) => (
              <div
                key={row._key}
                className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    Item #{idx + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => removeRow(row._key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  {/* Item */}
                  <div className="md:col-span-5 space-y-1">
                    <Label className="text-xs text-slate-600">Item *</Label>
                    <Select
                      value={row.inventoryItemId || "SELECT"}
                      onValueChange={(v) => {
                        const item = inventoryItems.find((i) => i.id === v);
                        if (item) selectItemForRow(row._key, item);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select item..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SELECT">Select item...</SelectItem>
                        {inventoryItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}{" "}
                            <span className="text-slate-400">
                              ({item.unit})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* UOM */}
                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs text-slate-600">UOM</Label>
                    <Input
                      value={row.uom}
                      disabled
                      className="bg-slate-50 text-xs"
                    />
                  </div>

                  {/* Qty Requested */}
                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs text-slate-600">
                      Qty Requested *
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={row.quantityRequested}
                      onChange={(e) =>
                        patchRow(row._key, {
                          quantityRequested: e.target.value,
                        })
                      }
                    />
                  </div>

                  {/* Qty Transferred */}
                  <div className="md:col-span-3 space-y-1">
                    <Label className="text-xs text-slate-600">
                      Qty Transferred
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={row.quantityRequested || "0"}
                      value={row.quantityTransferred}
                      onChange={(e) =>
                        patchRow(row._key, {
                          quantityTransferred: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                {/* Batch Tracking Panel */}
                {row.batchTracking && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Boxes className="h-4 w-4 text-amber-600" />
                      <span className="text-xs font-semibold text-amber-800">
                        Batch Tracking — Select distribution method
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-amber-700">Strategy:</span>
                      <Select
                        value={row.distributionStrategy || "FEFO"}
                        onValueChange={(value: string) =>
                          patchRow(row._key, { distributionStrategy: value as DistributionStrategy })
                        }
                      >
                        <SelectTrigger className="w-40 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FEFO">
                            FEFO (First Expiry)
                          </SelectItem>
                          <SelectItem value="FIFO">FIFO (First In)</SelectItem>
                          <SelectItem value="MANUAL">
                            Manual Selection
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Auto-distribution preview */}
                    {row.distributionStrategy !== "MANUAL" &&
                      row.availableBatches &&
                      row.availableBatches.length > 0 && (
                        <div className="space-y-1 mb-3">
                          <p className="text-xs font-medium text-amber-800">
                            Batches will be consumed in this order:
                          </p>
                          <div className="space-y-1">
                            {sortedBatches(row).map((b, i) => (
                              <div
                                key={b.id}
                                className="flex items-center justify-between text-xs bg-white/60 rounded px-2 py-1"
                              >
                                <span className="font-medium text-amber-900">
                                  {i + 1}. {b.batchNumber || "DEFAULT"}
                                </span>
                                <span className="text-amber-700">
                                  Qty: {b.quantity}
                                  {b.expiryDate &&
                                    ` · Exp: ${fmtDate(b.expiryDate)}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Manual batch selection */}
                    {row.distributionStrategy === "MANUAL" && (
                      <div className="space-y-2">
                        {row.availableBatches &&
                          row.availableBatches.length > 0 ? (
                          <Select
                            value={row.selectedBatchNumber || "SELECT_BATCH"}
                            onValueChange={(v) =>
                              patchRow(row._key, {
                                selectedBatchNumber:
                                  v === "SELECT_BATCH" ? undefined : v,
                              })
                            }
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Select batch..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SELECT_BATCH">
                                Select batch...
                              </SelectItem>
                              {row.availableBatches.map((b) => (
                                <SelectItem
                                  key={b.id}
                                  value={b.batchNumber || "DEFAULT"}
                                >
                                  <div className="flex items-center justify-between w-full gap-4">
                                    <span>{b.batchNumber || "DEFAULT"}</span>
                                    <span className="text-xs text-slate-400">
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
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
