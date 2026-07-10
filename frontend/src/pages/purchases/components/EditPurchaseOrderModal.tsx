"use client";

import React, { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Package, Pill, Trash2, Plus, Calculator, X, Edit2 } from "lucide-react";
import { useUpdatePurchaseOrder, useSuppliers, useLocations, useInventoryItems } from "@/hooks/usePurchase";
import type { PurchaseOrder } from "@/types/purchase.types";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

// const API_BASE = import.meta.env?.VITE_API_URL || "http://localhost:3001";


const itemSchema = z.object({
  id: z.string().optional(),
  itemType: z.enum(["INVENTORY", "DRUG"]),
  inventoryItemId: z.string().optional(),
  drugId: z.string().optional(),
  itemName: z.string().min(1, "Item name required"),
  unit: z.string().min(1, "Unit required"),
  quantityOrdered: z.coerce.number().min(0.01, "Quantity must be greater than 0"),
  unitCost: z.coerce.number().min(0, "Cost cannot be negative"),
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  discount: z.coerce.number().min(0).optional(),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
  supplierRef: z.string().optional(),      // â† Add this
  invoiceNumber: z.string().optional(),    // â† Add this  
});

const schema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  locationId: z.string().min(1, "Location is required"),
  orderType: z.enum(["INVENTORY", "DRUG"]),
  paymentTerms: z.enum(["CASH_ON_DELIVERY", 
  "NET_7",    // â† Add missing values
  "NET_14",   // â† if used
  "NET_15", 
  "NET_30", 
  "NET_60", 
  "PREPAID",
  "CREDIT" ]).optional(),
  expectedDate: z.string().optional(),
  dueDate: z.string().optional(),
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  discountAmount: z.coerce.number().min(0).optional(),
  shippingCost: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item is required"),
  supplierRef: z.string().optional(),      // â† ADD THIS
  invoiceNumber: z.string().optional(),    // â† ADD THIS
});

type FormData = z.infer<typeof schema>;

interface EditPurchaseOrderModalProps {
  po: PurchaseOrder;
  onClose: () => void;
}

export function EditPurchaseOrderModal({ po, onClose }: EditPurchaseOrderModalProps) {
  const mutation = useUpdatePurchaseOrder();
  const { data: suppliers = [] } = useSuppliers();
  const { data: locations = [] } = useLocations();
  const { data: inventoryItems = [] } = useInventoryItems();

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplierId: po.supplierId,
      locationId: po.locationId,
      orderType: po.orderType || "INVENTORY",
      paymentTerms: po.paymentTerms || "NET_30",
      expectedDate: po.expectedDate ? po.expectedDate.split("T")[0] : "",
      dueDate: po.dueDate ? po.dueDate.split("T")[0] : "",
      taxPercent: po.taxPercent || 0,
      discountAmount: po.discountAmount || 0,
      shippingCost: po.shippingCost || 0,
      notes: po.notes || "",
      internalNotes: po.internalNotes || "",
      items: po.items?.map((item) => ({
        id: item.id,
        itemType: item.itemType,
        inventoryItemId: item.inventoryItemId || "",
        drugId: item.drugId || "",
        itemName: item.itemName,
        unit: item.unit,
        quantityOrdered: item.quantityOrdered,
        unitCost: item.unitCost,
        taxPercent: item.taxPercent || 0,
        discount: item.discount || 0,
        batchNumber: item.batchNumber || "",
        expiryDate: item.expiryDate ? item.expiryDate.split("T")[0] : "",
        notes: item.notes || "",
      })) || [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const items = watch("items");
  const taxPercent = watch("taxPercent") || 0;
  const discountAmount = watch("discountAmount") || 0;
  const shippingCost = watch("shippingCost") || 0;

  // Calculate totals
  const subtotal = items?.reduce((sum, item) => {
    const lineTotal = (item.quantityOrdered || 0) * (item.unitCost || 0);
    const lineTax = lineTotal * ((item.taxPercent || 0) / 100);
    const lineDiscount = item.discount || 0;
    return sum + lineTotal + lineTax - lineDiscount;
  }, 0) || 0;

  const totalTax = subtotal * (taxPercent / 100);
  const total = subtotal + totalTax - discountAmount + shippingCost;

  const formatUGX = (n: number) =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(n);

  async function onSubmit(data: FormData) {
    try {
      const itemsPayload = data.items.map((item) => ({
        ...item,
        inventoryItemId: item.inventoryItemId || undefined,
        drugId: item.drugId || undefined,
        batchNumber: item.batchNumber || undefined,
        expiryDate: item.expiryDate || undefined,
        notes: item.notes || undefined,
      }));

      await mutation.mutateAsync({
        id: po.id,
        data: {
          ...data,
          items: itemsPayload,
          expectedDate: data.expectedDate || undefined,
          dueDate: data.dueDate || undefined,
        },
      });
      toast.success("Purchase order updated successfully");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to update purchase order");
    }
  }

  function addItem() {
    append({
      itemType: watch("orderType"),
      itemName: "",
      unit: "pcs",
      quantityOrdered: 1,
      unitCost: 0,
      taxPercent: 0,
      discount: 0,
    });
  }

  function selectInventoryItem(index: number, itemId: string) {
    const item = inventoryItems.find((i: any) => i.id === itemId);
    if (item) {
      setValue(`items.${index}.inventoryItemId`, item.id);
      setValue(`items.${index}.itemName`, item.name);
      setValue(`items.${index}.unit`, item.unit);
      setValue(`items.${index}.unitCost`, item.lastPurchasePrice || item.averageCost || 0);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Edit2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle className="text-lg">Edit Purchase Order</DialogTitle>
                <p className="text-sm text-muted-foreground">{po.poNumber}</p>
              </div>
            </div>
            <Badge variant={po.status === "DRAFT" ? "default" : "secondary"}>
              {po.status}
            </Badge>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Supplier *</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3"
                    {...register("supplierId")}
                  >
                    <option value="">Select supplier...</option>
                    {suppliers.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {errors.supplierId && (
                    <p className="text-xs text-red-500">{errors.supplierId.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Delivery Location *</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3"
                    {...register("locationId")}
                  >
                    <option value="">Select location...</option>
                    {locations.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Order Type</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3"
                    {...register("orderType")}
                  >
                    <option value="INVENTORY">Supplies/Inventory</option>
                    <option value="DRUG">Drugs/Pharmacy</option>
                  </select>
                </div>
              </div>

              {/* Dates & Terms */}
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Payment Terms</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3"
                    {...register("paymentTerms")}
                  >
                    <option value="CASH_ON_DELIVERY">Cash on Delivery</option>
                    <option value="NET_15">Net 15 days</option>
                    <option value="NET_30">Net 30 days</option>
                    <option value="NET_60">Net 60 days</option>
                    <option value="PREPAID">Prepaid</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Expected Date</Label>
                  <Input type="date" className="h-10" {...register("expectedDate")} />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Due Date</Label>
                  <Input type="date" className="h-10" {...register("dueDate")} />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Order Tax (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="h-10"
                    {...register("taxPercent")}
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Order Items ({fields.length})</h4>
                  <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
                    <Plus className="h-4 w-4" /> Add Item
                  </Button>
                </div>

                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left text-xs font-medium p-3 w-12">Type</th>
                        <th className="text-left text-xs font-medium p-3">Item Name</th>
                        <th className="text-left text-xs font-medium p-3 w-20">Unit</th>
                        <th className="text-right text-xs font-medium p-3 w-24">Qty</th>
                        <th className="text-right text-xs font-medium p-3 w-28">Unit Cost</th>
                        <th className="text-right text-xs font-medium p-3 w-20">Tax%</th>
                        <th className="text-right text-xs font-medium p-3 w-20">Disc</th>
                        <th className="text-center text-xs font-medium p-3 w-24">Batch</th>
                        <th className="text-center text-xs font-medium p-3 w-32">Expiry</th>
                        <th className="text-right text-xs font-medium p-3 w-28">Total</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field, index) => {
                        const item = items[index];
                        const lineTotal = (item?.quantityOrdered || 0) * (item?.unitCost || 0);
                        const lineTax = lineTotal * ((item?.taxPercent || 0) / 100);
                        const lineDiscount = item?.discount || 0;
                        const lineTotalWithTax = lineTotal + lineTax - lineDiscount;

                        return (
                          <tr key={field.id} className="border-t">
                            <td className="p-2">
                              <select
                                className="w-full h-8 rounded border border-input bg-background text-xs px-2"
                                {...register(`items.${index}.itemType`)}
                              >
                                <option value="INVENTORY">
                                  <Package className="h-3 w-3" />
                                </option>
                                <option value="DRUG">
                                  <Pill className="h-3 w-3" />
                                </option>
                              </select>
                            </td>
                            <td className="p-2">
                              <div className="space-y-1">
                                <Input
                                  className="h-8 text-sm"
                                  placeholder="Item name"
                                  {...register(`items.${index}.itemName`)}
                                />
                                {watch(`items.${index}.itemType`) === "INVENTORY" && (
                                  <select
                                    className="w-full h-7 rounded border border-input bg-background text-xs px-2"
                                    onChange={(e) => selectInventoryItem(index, e.target.value)}
                                  >
                                    <option value="">Select from inventory...</option>
                                    {inventoryItems.map((i: any) => (
                                      <option key={i.id} value={i.id}>{i.name}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </td>
                            <td className="p-2">
                              <Input className="h-8 text-sm text-center" {...register(`items.${index}.unit`)} />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                className="h-8 text-sm text-right"
                                {...register(`items.${index}.quantityOrdered`)}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                className="h-8 text-sm text-right"
                                {...register(`items.${index}.unitCost`)}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                className="h-8 text-sm text-right"
                                {...register(`items.${index}.taxPercent`)}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                className="h-8 text-sm text-right"
                                {...register(`items.${index}.discount`)}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                className="h-8 text-sm text-center"
                                placeholder="Batch"
                                {...register(`items.${index}.batchNumber`)}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="date"
                                className="h-8 text-sm"
                                {...register(`items.${index}.expiryDate`)}
                              />
                            </td>
                            <td className="p-2 text-right font-mono font-medium">
                              {formatUGX(lineTotalWithTax)}
                            </td>
                            <td className="p-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                onClick={() => remove(index)}
                                disabled={fields.length === 1}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals & Notes */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Notes (visible to supplier)</Label>
                    <Textarea
                      className="h-20 resize-none"
                      placeholder="Delivery instructions, special requirements..."
                      {...register("notes")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Internal Notes</Label>
                    <Textarea
                      className="h-20 resize-none"
                      placeholder="Internal comments..."
                      {...register("internalNotes")}
                    />
                  </div>
                </div>

                <div className="space-y-3 bg-muted/30 p-4 rounded-lg">
                  <h4 className="font-semibold text-sm">Order Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-mono">{formatUGX(subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax ({taxPercent}%)</span>
                      <span className="font-mono">{formatUGX(totalTax)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="font-mono text-red-500">-{formatUGX(discountAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Shipping</span>
                      <span className="font-mono">{formatUGX(shippingCost)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between text-lg font-bold">
                      <span>Total</span>
                      <span className="font-mono text-blue-600">{formatUGX(total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="px-6 py-4 border-t bg-muted/30 shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default EditPurchaseOrderModal;
