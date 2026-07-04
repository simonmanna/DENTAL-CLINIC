"use client";

import api from "@/lib/api/inventory.api";

// ============================================================
// RecordDeliveryModal.tsx
// ============================================================
import React from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Truck, Package, Trash2, Plus, AlertTriangle } from "lucide-react";
import { useCreateDelivery } from "@/hooks/usePurchase";
import type { PurchaseOrder } from "@/types/purchase.types";
import { toast } from "sonner";
import { useQuery } from '@tanstack/react-query';

const deliveryItemSchema = z.object({
  purchaseOrderItemId: z.string(),
  quantityDelivered: z.coerce.number().min(0),
  quantityAccepted: z.coerce.number().min(0),
  quantityRejected: z.coerce.number().min(0).default(0),
  rejectionReason: z.string().optional(),
  unitCost: z.coerce.number().min(0),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
});

const schema = z.object({
  deliveryDate: z.string().optional(),
  supplierRef: z.string().optional(),
  invoiceNumber: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(deliveryItemSchema),
});

// 👇 ADD THIS LINE 👇
type FormValues = z.infer<typeof schema>;

export function RecordDeliveryModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const mutation = useCreateDelivery();

  const pendingItems = (po.items ?? []).filter(
    (i) => i.quantityReceived < i.quantityOrdered,
  );

const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      deliveryDate: new Date().toISOString().split("T")[0],
      items: pendingItems.map((item) => ({
        purchaseOrderItemId: item.id,
        quantityDelivered: item.quantityOrdered - item.quantityReceived,
        quantityAccepted: item.quantityOrdered - item.quantityReceived,
        quantityRejected: 0,
        unitCost: item.unitCost,
        batchNumber: item.batchNumber ?? "",
        expiryDate: item.expiryDate ? item.expiryDate.split("T")[0] : "",
      })),
    },
  });

  async function onSubmit(data: any) {
    try {
      await mutation.mutateAsync({
        ...data,
        purchaseOrderId: po.id,
        locationId: po.locationId || po.location?.id,
        items: data.items.filter((i: any) => i.quantityAccepted > 0),
      });
      toast.success("Delivery recorded and stock updated");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to record delivery");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Truck className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-base">Record Delivery</DialogTitle>
              <p className="text-xs text-muted-foreground">{po.poNumber} · {po.supplier?.name}</p>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Delivery Date</Label>
                  <Input type="date" className="h-9 text-sm" {...register("deliveryDate")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Supplier Reference</Label>
                  <Input className="h-9 text-sm" placeholder="Delivery note #" {...register("supplierRef")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Invoice Number</Label>
                  <Input className="h-9 text-sm" placeholder="Invoice #" {...register("invoiceNumber")} />
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Items to Receive ({pendingItems.length})
                </h4>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left text-xs font-medium text-muted-foreground p-2.5">Item</th>
                        <th className="text-right text-xs font-medium text-muted-foreground p-2.5">Ordered</th>
                        <th className="text-right text-xs font-medium text-muted-foreground p-2.5">Delivered</th>
                        <th className="text-right text-xs font-medium text-muted-foreground p-2.5">Accepted</th>
                        <th className="text-right text-xs font-medium text-muted-foreground p-2.5">Unit Cost</th>
                        <th className="text-center text-xs font-medium text-muted-foreground p-2.5">Batch #</th>
                        <th className="text-center text-xs font-medium text-muted-foreground p-2.5">Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingItems.map((item, idx) => (
                        <tr key={item.id} className="border-t hover:bg-muted/20">
                          <td className="p-2.5">
                            <div className="flex items-center gap-2">
                              <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <div>
                                <p className="font-medium text-sm">{item.itemName}</p>
                                <p className="text-xs text-muted-foreground">{item.unit}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-2.5 text-right text-xs font-mono text-muted-foreground">
                            {item.quantityOrdered - item.quantityReceived}
                          </td>
                          <td className="p-2.5">
                            <Input
                              type="number" step="0.01" min="0"
                              className="h-8 w-20 text-sm text-right ml-auto"
                              {...register(`items.${idx}.quantityDelivered`)}
                            />
                          </td>
                          <td className="p-2.5">
                            <Input
                              type="number" step="0.01" min="0"
                              className="h-8 w-20 text-sm text-right ml-auto"
                              {...register(`items.${idx}.quantityAccepted`)}
                            />
                          </td>
                          <td className="p-2.5">
                            <Input
                              type="number" step="1" min="0"
                              className="h-8 w-24 text-sm text-right ml-auto"
                              {...register(`items.${idx}.unitCost`)}
                            />
                          </td>
                          <td className="p-2.5">
                            <Input
                              className="h-8 w-28 text-sm text-center mx-auto"
                              placeholder="Optional"
                              {...register(`items.${idx}.batchNumber`)}
                            />
                          </td>
                          <td className="p-2.5">
                            <Input
                              type="date"
                              className="h-8 w-32 text-sm mx-auto"
                              {...register(`items.${idx}.expiryDate`)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea className="text-sm h-16 resize-none" placeholder="Any delivery notes..." {...register("notes")} />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Recording..." : "Confirm & Update Stock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default RecordDeliveryModal;

// ============================================================
// RecordPaymentModal.tsx
// ============================================================
import { useCreatePurchasePayment } from "@/hooks/usePurchase";
export function RecordPaymentModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {

  const schema = z.object({
  amount: z.coerce.number().min(1),
  method: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "CREDIT_NOTE"]),
  reference: z.string().optional(),
  bankName: z.string().optional(),
  chequeNumber: z.string().optional(),
  paidAt: z.string(),
  notes: z.string().optional(),
});

  const { useCreatePurchasePayment: _hook } = require("@/hooks/usePurchase");
  const mutation = _hook();
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      purchaseOrderId: po.id,
      amount: po.balance,
      method: "CASH",
      reference: "",
      bankName: "",
      chequeNumber: "",
      paidAt: new Date().toISOString().split("T")[0],
      notes: "",
    },
  });
  const method = watch("method");

  const formatUGX = (n: number) =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(n);

  async function onSubmit(data: any) {
    try {
      await mutation.mutateAsync(data);
      toast.success("Payment recorded");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Payment failed");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Record Payment</DialogTitle>
          <p className="text-xs text-muted-foreground">{po.poNumber} · Balance: {formatUGX(po.balance)}</p>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Balance Summary */}
          <div className="rounded-lg bg-muted/40 p-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-semibold text-sm font-mono">{formatUGX(po.total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="font-semibold text-sm font-mono text-emerald-600">{formatUGX(po.amountPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="font-semibold text-sm font-mono text-amber-600">{formatUGX(po.balance)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Amount (UGX) *</Label>
            <Input type="number" step="100" min="1" className="h-9 text-sm" {...register("amount", { required: true })} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Payment Method *</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background text-sm px-3" {...register("method")}>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CREDIT_NOTE">Credit Note</option>
            </select>
          </div>

          {method === "BANK_TRANSFER" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Bank Name</Label>
                <Input className="h-9 text-sm" {...register("bankName")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Transaction Reference</Label>
                <Input className="h-9 text-sm" {...register("reference")} />
              </div>
            </div>
          )}
          {method === "CHEQUE" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Bank Name</Label>
                <Input className="h-9 text-sm" {...register("bankName")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cheque Number</Label>
                <Input className="h-9 text-sm" {...register("chequeNumber")} />
              </div>
            </div>
          )}
          {method === "MOBILE_MONEY" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Transaction ID</Label>
              <Input className="h-9 text-sm" placeholder="e.g. MTN/Airtel ref" {...register("reference")} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Date</Label>
              <Input type="date" className="h-9 text-sm" {...register("paidAt")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input className="h-9 text-sm" placeholder="Optional" {...register("notes")} />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// StockAdjustmentModal.tsx
// ============================================================
export function StockAdjustmentModal({ onClose }: { onClose: () => void }) {
  const { useCreateStockAdjustment: _hook } = require("@/hooks/usePurchase");
  const mutation = _hook();
  const [items, setItems] = React.useState([{
    itemType: "INVENTORY", inventoryItemId: "", drugId: "",
    itemName: "", unit: "", quantitySystem: 0, quantityActual: 0, unitCost: 0, batchNumber: "", notes: "",
  }]);

  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: { locationId: "", reason: "CYCLE_COUNT", notes: "" },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get("/locations").then((r) => r.data),
  });

  async function onSubmit(data: any) {
    if (items.some((i) => !i.itemName)) {
      toast.error("All items must have a name");
      return;
    }
    try {
      await mutation.mutateAsync({ ...data, items });
      toast.success("Stock adjustment applied");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Adjustment failed");
    }
  }

  function updateItem(idx: number, field: string, value: any) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-base">Stock Adjustment</DialogTitle>
          <p className="text-xs text-muted-foreground">Reconcile physical vs system quantities</p>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Location *</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background text-sm px-3" {...register("locationId")}>
                    <option value="">Select location...</option>
                    {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Reason *</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background text-sm px-3" {...register("reason")}>
                    <option value="CYCLE_COUNT">Cycle Count</option>
                    <option value="DAMAGED">Damaged</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="THEFT">Theft</option>
                    <option value="RETURNED_TO_SUPPLIER">Returned to Supplier</option>
                    <option value="FOUND">Found / Over-count</option>
                    <option value="INITIAL_COUNT">Initial Count</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left text-xs font-medium text-muted-foreground p-2.5">Item Name</th>
                      <th className="text-left text-xs font-medium text-muted-foreground p-2.5">Type</th>
                      <th className="text-left text-xs font-medium text-muted-foreground p-2.5">Unit</th>
                      <th className="text-right text-xs font-medium text-muted-foreground p-2.5">System Qty</th>
                      <th className="text-right text-xs font-medium text-muted-foreground p-2.5">Actual Qty</th>
                      <th className="text-right text-xs font-medium text-muted-foreground p-2.5">Diff</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const diff = (item.quantityActual || 0) - (item.quantitySystem || 0);
                      return (
                        <tr key={idx} className="border-t">
                          <td className="p-1.5">
                            <Input
                              className="h-8 text-sm"
                              value={item.itemName}
                              onChange={(e) => updateItem(idx, "itemName", e.target.value)}
                              placeholder="Item name"
                            />
                          </td>
                          <td className="p-1.5">
                            <select
                              className="h-8 rounded-md border border-input bg-background text-xs px-2 w-full"
                              value={item.itemType}
                              onChange={(e) => updateItem(idx, "itemType", e.target.value)}
                            >
                              <option value="INVENTORY">Supply</option>
                              <option value="DRUG">Drug</option>
                            </select>
                          </td>
                          <td className="p-1.5">
                            <Input className="h-8 text-sm w-16" value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} placeholder="pcs" />
                          </td>
                          <td className="p-1.5">
                            <Input
                              type="number" className="h-8 text-sm w-24 text-right"
                              value={item.quantitySystem}
                              onChange={(e) => updateItem(idx, "quantitySystem", parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="p-1.5">
                            <Input
                              type="number" className="h-8 text-sm w-24 text-right"
                              value={item.quantityActual}
                              onChange={(e) => updateItem(idx, "quantityActual", parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="p-1.5 text-right font-mono font-semibold text-sm">
                            <span className={diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-muted-foreground"}>
                              {diff > 0 ? "+" : ""}{diff}
                            </span>
                          </td>
                          <td className="p-1.5">
                            <Button
                              type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500"
                              onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                              disabled={items.length === 1}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="p-2 border-t bg-muted/20">
                  <Button
                    type="button" variant="ghost" size="sm" className="gap-1.5 text-xs h-7"
                    onClick={() => setItems((prev) => [...prev, { itemType: "INVENTORY", inventoryItemId: "", drugId: "", itemName: "", unit: "", quantitySystem: 0, quantityActual: 0, unitCost: 0, batchNumber: "", notes: "" }])}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea className="text-sm h-16 resize-none" {...register("notes")} placeholder="Reason for discrepancy..." />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Applying..." : "Apply Adjustment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// WasteRecordModal.tsx
// ============================================================
export function WasteRecordModal({ onClose }: { onClose: () => void }) {
  const { useCreateWasteRecord: _hook } = require("@/hooks/usePurchase");
  const mutation = _hook();
  const [items, setItems] = React.useState([{
    itemType: "INVENTORY", inventoryItemId: "", drugId: "",
    itemName: "", unit: "", quantity: 1, unitCost: 0, batchNumber: "", expiryDate: "", reason: "",
  }]);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { locationId: "", category: "EXPIRED", notes: "", witnessName: "", disposalMethod: "" },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get("/locations").then((r) => r.data),
  });

  const totalValue = items.reduce((sum, i) => sum + ((i.quantity || 0) * (i.unitCost || 0)), 0);
  const formatUGX = (n: number) =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(n);

  function updateItem(idx: number, field: string, value: any) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function onSubmit(data: any) {
    try {
      await mutation.mutateAsync({ ...data, items });
      toast.success("Waste record created and stock deducted");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to record waste");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <DialogTitle className="text-base">Record Waste / Damage</DialogTitle>
              <p className="text-xs text-muted-foreground">Stock will be deducted immediately upon saving</p>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Location *</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background text-sm px-3" {...register("locationId")}>
                    <option value="">Select...</option>
                    {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Category *</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background text-sm px-3" {...register("category")}>
                    <option value="EXPIRED">Expired</option>
                    <option value="DAMAGED">Damaged</option>
                    <option value="CONTAMINATED">Contaminated</option>
                    <option value="SPILLAGE">Spillage</option>
                    <option value="BREAKAGE">Breakage</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Witness Name</Label>
                  <Input className="h-9 text-sm" {...register("witnessName")} placeholder="Staff witness" />
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left text-xs font-medium text-muted-foreground p-2.5">Item</th>
                      <th className="text-left text-xs font-medium text-muted-foreground p-2.5">Type</th>
                      <th className="text-left text-xs font-medium text-muted-foreground p-2.5">Unit</th>
                      <th className="text-right text-xs font-medium text-muted-foreground p-2.5">Qty</th>
                      <th className="text-right text-xs font-medium text-muted-foreground p-2.5">Unit Cost</th>
                      <th className="text-right text-xs font-medium text-muted-foreground p-2.5">Total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-1.5">
                          <Input className="h-8 text-sm" value={item.itemName} onChange={(e) => updateItem(idx, "itemName", e.target.value)} placeholder="Item name" />
                        </td>
                        <td className="p-1.5">
                          <select className="h-8 rounded-md border border-input bg-background text-xs px-2 w-20" value={item.itemType} onChange={(e) => updateItem(idx, "itemType", e.target.value)}>
                            <option value="INVENTORY">Supply</option>
                            <option value="DRUG">Drug</option>
                          </select>
                        </td>
                        <td className="p-1.5">
                          <Input className="h-8 text-sm w-16" value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} placeholder="pcs" />
                        </td>
                        <td className="p-1.5">
                          <Input type="number" className="h-8 text-sm w-20 text-right" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)} min="0.01" step="0.01" />
                        </td>
                        <td className="p-1.5">
                          <Input type="number" className="h-8 text-sm w-24 text-right" value={item.unitCost} onChange={(e) => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)} min="0" />
                        </td>
                        <td className="p-1.5 text-right font-mono text-sm font-medium">
                          {new Intl.NumberFormat("en-UG", { minimumFractionDigits: 0 }).format((item.quantity || 0) * (item.unitCost || 0))}
                        </td>
                        <td className="p-1.5">
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 hover:text-red-500" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/20">
                    <tr>
                      <td colSpan={5} className="p-2 text-right text-xs font-semibold text-muted-foreground">Total Waste Value:</td>
                      <td className="p-2 text-right font-mono font-bold text-red-600">{formatUGX(totalValue)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                <div className="p-2 border-t bg-muted/20">
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs h-7"
                    onClick={() => setItems((p) => [...p, { itemType: "INVENTORY", inventoryItemId: "", drugId: "", itemName: "", unit: "", quantity: 1, unitCost: 0, batchNumber: "", expiryDate: "", reason: "" }])}>
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Disposal Method</Label>
                  <Input className="h-9 text-sm" {...register("disposalMethod")} placeholder="e.g. Incineration, Burial" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Notes</Label>
                  <Input className="h-9 text-sm" {...register("notes")} placeholder="Additional details..." />
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? "Recording..." : "Record & Deduct Stock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
