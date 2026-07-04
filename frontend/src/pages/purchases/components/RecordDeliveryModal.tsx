// src/pages/purchases/components/RecordDeliveryModal.tsx

"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Truck,
  Package,
  CheckCircle2,
  X,
  AlertTriangle,
  MapPin,
  Calendar,
  Hash,
  DollarSign,
  Warehouse,
  TrendingDown,
  Boxes,
  Receipt,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Bug,
  Eye,
  EyeOff,
  ClipboardCopy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCreateDelivery, useLocations } from "@/hooks/usePurchase";
import { toast } from "sonner";
import { UnitOfMeasure } from "@/types/purchase.types";

// Add this near your other useEffect hooks to debug locations

const deliveryItemSchema = z.object({
  purchaseOrderItemId: z.string().min(1, "Item ID is required"),
  itemName: z.string().min(1, "Item name is required"),
  unit: z.string().min(1, "Unit is required"),
  uom: z.nativeEnum(UnitOfMeasure),
  unitCost: z.number().min(0, "Unit cost must be 0 or greater"),
  quantityOrdered: z
    .number()
    .min(0.01, "Ordered quantity must be greater than 0"),
  quantityPreviouslyReceived: z.number().min(0),
  quantityReceivedNow: z
    .number()
    .min(0, "Received quantity cannot be negative"),
  remainingQty: z.number(),
  billedQty: z.number().min(0),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
  batchTracking: z.boolean().optional(),
});

const deliverySchema = z.object({
  locationId: z.string().min(1, "Delivery location is required"),
  deliveryDate: z.string().min(1, "Delivery date is required"),
  supplierRef: z.string().optional(),
  invoiceNumber: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(deliveryItemSchema).min(1, "At least one item is required"),
});

type DeliveryFormValues = z.infer<typeof deliverySchema>;

interface RecordDeliveryModalProps {
  purchaseOrder: any;
  onClose: () => void;
  onSuccess?: () => void;
}

// Debug Panel Component
function DebugPanel({
  data,
  errors,
  isVisible,
  onToggle,
}: {
  data: any;
  errors: any;
  isVisible: boolean;
  onToggle: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"data" | "errors" | "raw">("data");

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  if (!isVisible) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-50 bg-slate-800 text-white p-3 rounded-full shadow-lg hover:bg-slate-700 transition-colors"
        title="Show Debug Panel"
      >
        <Bug className="h-5 w-5" />
      </button>
    );
  }

  const emptyFields = findEmptyFields(data);
  const validationIssues = findValidationIssues(data);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[500px] max-h-[70vh] bg-slate-900 text-slate-100 rounded-xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-amber-400" />
          <span className="font-semibold text-sm">Debug Panel</span>
          {(emptyFields.length > 0 || validationIssues.length > 0) && (
            <Badge variant="destructive" className="text-xs">
              {emptyFields.length + validationIssues.length} issues
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => copyToClipboard(JSON.stringify(data, null, 2))}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
            title="Copy data to clipboard"
          >
            <ClipboardCopy className="h-4 w-4" />
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        {(["data", "errors", "raw"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors",
              activeTab === tab
                ? "bg-slate-700 text-white border-b-2 border-amber-400"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 text-xs font-mono">
        {activeTab === "data" && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
              <h4 className="text-amber-400 font-semibold uppercase text-[10px] tracking-wider">
                Summary
              </h4>
              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div>
                  Location ID:{" "}
                  <span
                    className={
                      data.locationId ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    {data.locationId || "EMPTY"}
                  </span>
                </div>
                <div>
                  Date:{" "}
                  <span
                    className={
                      data.deliveryDate ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    {data.deliveryDate || "EMPTY"}
                  </span>
                </div>
                <div>
                  Items Count:{" "}
                  <span className="text-emerald-400">
                    {data.items?.length || 0}
                  </span>
                </div>
                <div>
                  Total Receiving:{" "}
                  <span className="text-emerald-400">
                    {data.items?.reduce(
                      (s: number, i: any) => s + (i.quantityReceivedNow || 0),
                      0,
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Empty Fields */}
            {emptyFields.length > 0 && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3">
                <h4 className="text-red-400 font-semibold uppercase text-[10px] tracking-wider mb-2">
                  ⚠️ Empty/Invalid Fields ({emptyFields.length})
                </h4>
                <ul className="space-y-1 text-red-300">
                  {emptyFields.map((field, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      {field.path}:{" "}
                      <span className="text-red-400">{field.issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Validation Issues */}
            {validationIssues.length > 0 && (
              <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3">
                <h4 className="text-amber-400 font-semibold uppercase text-[10px] tracking-wider mb-2">
                  ⚠️ Validation Warnings ({validationIssues.length})
                </h4>
                <ul className="space-y-1 text-amber-300">
                  {validationIssues.map((issue, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Items Detail */}
            <div className="space-y-2">
              <h4 className="text-emerald-400 font-semibold uppercase text-[10px] tracking-wider">
                Items Detail
              </h4>
              {data.items?.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-slate-800/50 rounded-lg p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-slate-200 font-medium">
                      {item.itemName}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {item.purchaseOrderItemId ? "✓ ID" : "✗ No ID"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-slate-400 text-[10px]">
                    <div>Ordered: {item.quantityOrdered}</div>
                    <div>Prev: {item.quantityPreviouslyReceived}</div>
                    <div
                      className={
                        item.quantityReceivedNow > 0
                          ? "text-emerald-400"
                          : "text-amber-400"
                      }
                    >
                      Now: {item.quantityReceivedNow}
                    </div>
                  </div>
                  <div className="text-slate-500 text-[10px]">
                    Remaining: {item.remainingQty} | Billed: {item.billedQty}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "errors" && (
          <div className="space-y-2">
            {Object.keys(errors).length === 0 ? (
              <div className="text-emerald-400">✓ No validation errors</div>
            ) : (
              <pre className="text-red-400 whitespace-pre-wrap">
                {JSON.stringify(errors, null, 2)}
              </pre>
            )}
          </div>
        )}

        {activeTab === "raw" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Full Form Data (JSON)</span>
              <button
                onClick={() => copyToClipboard(JSON.stringify(data, null, 2))}
                className="text-xs text-amber-400 hover:text-amber-300"
              >
                Copy
              </button>
            </div>
            <pre className="text-slate-300 whitespace-pre-wrap break-all">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper functions for debugging
function findEmptyFields(
  data: any,
): Array<{ path: string; issue: string; value: any }> {
  const issues: Array<{ path: string; issue: string; value: any }> = [];

  if (!data.locationId) {
    issues.push({
      path: "locationId",
      issue: "Location is required",
      value: data.locationId,
    });
  }

  if (!data.deliveryDate) {
    issues.push({
      path: "deliveryDate",
      issue: "Date is required",
      value: data.deliveryDate,
    });
  }

  if (!data.items || data.items.length === 0) {
    issues.push({
      path: "items",
      issue: "No items in delivery",
      value: data.items,
    });
  } else {
    data.items.forEach((item: any, idx: number) => {
      if (!item.purchaseOrderItemId) {
        issues.push({
          path: `items[${idx}].purchaseOrderItemId`,
          issue: "Missing item ID",
          value: item.purchaseOrderItemId,
        });
      }
      if (!item.itemName) {
        issues.push({
          path: `items[${idx}].itemName`,
          issue: "Missing item name",
          value: item.itemName,
        });
      }
      if (
        item.quantityReceivedNow === undefined ||
        item.quantityReceivedNow === null
      ) {
        issues.push({
          path: `items[${idx}].quantityReceivedNow`,
          issue: "Received quantity not set",
          value: item.quantityReceivedNow,
        });
      }
      if (item.quantityReceivedNow < 0) {
        issues.push({
          path: `items[${idx}].quantityReceivedNow`,
          issue: "Negative quantity",
          value: item.quantityReceivedNow,
        });
      }
    });
  }

  return issues;
}

function findValidationIssues(data: any): string[] {
  const issues: string[] = [];

  if (data.items) {
    data.items.forEach((item: any, idx: number) => {
      const maxAllowed =
        (item.quantityOrdered || 0) - (item.quantityPreviouslyReceived || 0);
      if (item.quantityReceivedNow > maxAllowed) {
        issues.push(
          `Item ${idx + 1} (${item.itemName}): Receiving ${item.quantityReceivedNow} but only ${maxAllowed} allowed`,
        );
      }
      if (item.quantityReceivedNow > 0 && item.remainingQty < 0) {
        issues.push(
          `Item ${idx + 1} (${item.itemName}): Remaining quantity is negative (${item.remainingQty})`,
        );
      }
    });
  }

  return issues;
}

export default function RecordDeliveryModal({
  purchaseOrder,
  onClose,
  onSuccess,
}: RecordDeliveryModalProps) {
  const createDelivery = useCreateDelivery();
  const { data: locations = [] } = useLocations();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showDebug, setShowDebug] = useState(false); // Debug panel visibility

  //   useEffect(() => {
  //   console.log("📍 Locations loaded:", locations);
  //   console.log("📍 Locations with empty IDs:", locations.filter((l: any) => !l.id || l.id === ""));
  // }, [locations]);

  // Calculate initial values with proper remaining quantities
  const defaultItems = useMemo(() => {
    console.log(
      "🔄 Initializing default items from purchaseOrder:",
      purchaseOrder,
    );

    if (!purchaseOrder?.items || !Array.isArray(purchaseOrder.items)) {
      console.error("❌ No items found in purchaseOrder:", purchaseOrder);
      return [];
    }

    return purchaseOrder.items.map((item: any, idx: number) => {
      const ordered = Number(item.quantityOrdered) || 0;
      const prevReceived = Number(item.quantityReceived) || 0;
      const remaining = ordered - prevReceived;
      const receivingNow = remaining > 0 ? remaining : 0;

      console.log(`📦 Item ${idx}: ${item.itemName}`, {
        ordered,
        prevReceived,
        remaining,
        receivingNow,
        unitCost: item.unitCost,
        uom: item.uom,
      });

      return {
        purchaseOrderItemId: item.id,
        itemName: item.itemName || "Unknown Item",
        unit: item.unit || "pcs",
        uom: item.uom || "PIECES",
        unitCost: Number(item.unitCost) || 0,
        quantityOrdered: ordered,
        quantityPreviouslyReceived: prevReceived,
        quantityReceivedNow: receivingNow,
        remainingQty: remaining - receivingNow,
        billedQty: receivingNow,
        batchNumber: "",
        expiryDate: "",
        notes: "",
        batchTracking: item.inventoryItem?.batchTracking ?? false,
      };
    });
  }, [purchaseOrder]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      locationId: purchaseOrder?.locationId || "",
      deliveryDate: new Date().toISOString().split("T")[0],
      items: defaultItems,
    },
  });

  const { fields } = useFieldArray({
    control,
    name: "items",
  });

  // Watch all form data for debugging
  const formData = watch();
  const watchedItems = watch("items");
  const selectedLocationId = watch("locationId");

  // Log whenever form data changes
  React.useEffect(() => {
    console.log("📊 Form data updated:", formData);
  }, [formData]);

  // Proper handler using Controller's onChange
  const handleQuantityChange = useCallback(
    (index: number, value: string, onChange: (val: number) => void) => {
      const numValue = parseFloat(value) || 0;
      const ordered = Number(getValues(`items.${index}.quantityOrdered`)) || 0;
      const prevReceived =
        Number(getValues(`items.${index}.quantityPreviouslyReceived`)) || 0;
      const maxAllowed = ordered - prevReceived;

      console.log(`✏️ Quantity change for item ${index}:`, {
        input: value,
        parsed: numValue,
        ordered,
        prevReceived,
        maxAllowed,
      });

      // Clamp value
      const clampedValue = Math.max(0, Math.min(numValue, maxAllowed));

      // Update the field value using Controller's onChange
      onChange(clampedValue);

      // Calculate remaining
      const remaining = ordered - prevReceived - clampedValue;

      console.log(`📊 Updated values for item ${index}:`, {
        receivedNow: clampedValue,
        remaining,
        billed: clampedValue,
      });

      // Update remainingQty
      setValue(`items.${index}.remainingQty`, remaining, {
        shouldValidate: false,
      });

      // Update billedQty to match
      setValue(`items.${index}.billedQty`, clampedValue, {
        shouldValidate: false,
      });
    },
    [getValues, setValue],
  );

  const formatUGX = (n: number) =>
    new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(n || 0);

  const getUOMLabel = (uom: UnitOfMeasure): string => {
    const labels: Record<string, string> = {
      PIECES: "pcs",
      BOX: "box",
      PACK: "pack",
      BOTTLE: "bottle",
      VIAL: "vial",
      AMPULE: "amp",
      TABLET: "tab",
      CAPSULE: "cap",
      STRIP: "strip",
      TUBE: "tube",
      SYRINGE: "syringe",
      GLOVES_PAIR: "pair",
      ROLL: "roll",
      ML: "ml",
      LITER: "L",
      MG: "mg",
      G: "g",
      KG: "kg",
      INCH: "in",
      MM: "mm",
      SET: "set",
      KIT: "kit",
    };
    return labels[uom] || String(uom).toLowerCase();
  };

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const onSubmit = async (data: DeliveryFormValues) => {
    console.log("🚀 SUBMIT TRIGGERED");
    console.log("📦 Raw form data:", data);
    console.log("📋 Purchase Order:", purchaseOrder); // Add this
    console.log("🆔 Purchase Order ID:", purchaseOrder?.id); // Add this

    if (!purchaseOrder?.id) {
      toast.error("Purchase Order ID is missing!");
      return;
    }
    console.log("🚀 SUBMIT TRIGGERED");
    console.log("📦 Raw form data:", data);
    console.log(
      "📍 Location ID type:",
      typeof data.locationId,
      "value:",
      JSON.stringify(data.locationId),
    );
    console.log(
      "📦 Items:",
      data.items.map((i) => ({ id: i.purchaseOrderItemId, name: i.itemName })),
    );

    // Check for empty/invalid fields before submitting
    if (!data.locationId || data.locationId.trim() === "") {
      toast.error("Please select a delivery location");
      return;
    }
    console.log("🚀 SUBMIT TRIGGERED");
    console.log("📦 Raw form data:", data);

    // Check for empty/invalid fields before submitting
    const emptyFields = findEmptyFields(data);
    if (emptyFields.length > 0) {
      console.error("❌ Empty fields found:", emptyFields);
      toast.error(
        `Missing required fields: ${emptyFields.map((f) => f.path).join(", ")}`,
      );
      return;
    }

    const validationIssues = findValidationIssues(data);
    if (validationIssues.length > 0) {
      console.error("❌ Validation issues:", validationIssues);
      toast.error(validationIssues[0]);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        purchaseOrderId: purchaseOrder?.id,
        locationId: data.locationId,
        deliveryDate: data.deliveryDate,
        supplierRef: data.supplierRef,
        invoiceNumber: data.invoiceNumber,
        notes: data.notes,
        items: data.items.map((item) => {
          return {
            purchaseOrderItemId: item.purchaseOrderItemId,
            quantityDelivered: Number(item.quantityReceivedNow),
            quantityAccepted: Number(item.quantityReceivedNow),
            quantityRejected: 0,
            quantityBilled: Number(item.billedQty),
            unitCost: Number(item.unitCost),
            // batchNumber: item.batchTracking
            //   ? item.batchNumber?.trim() || null
            //   : null,
            // expiryDate: item.batchTracking ? item.expiryDate || null : null,
            // Line 680 ✅
            batchNumber: item.batchTracking ? item.batchNumber?.trim() || null : null,
            // Line 683 ✅
            expiryDate: item.batchTracking ? item.expiryDate || null : null,
            notes: item.notes,
          };
        }),
      };
      console.log("📤 FINAL API PAYLOAD:", JSON.stringify(payload, null, 2));

      // Validate payload has required fields
      if (!payload.purchaseOrderId) {
        throw new Error("Purchase Order ID is missing");
      }
      if (!payload.locationId) {
        throw new Error("Location ID is required");
      }
      if (!payload.items || payload.items.length === 0) {
        throw new Error("No items to deliver");
      }

      const result = await createDelivery.mutateAsync(payload);
      console.log("✅ API SUCCESS:", result);

      toast.success("Delivery recorded and stock updated successfully");
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("❌ SUBMIT ERROR:", err);
      console.error("Error details:", {
        message: err?.message,
        response: err?.response?.data,
        status: err?.response?.status,
      });

      const errorMsg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to record delivery";
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate totals from watched items
  const totalItems = watchedItems?.length || 0;
  const totalReceiving =
    watchedItems?.reduce(
      (sum, item) => sum + (Number(item?.quantityReceivedNow) || 0),
      0,
    ) || 0;
  const totalValue =
    watchedItems?.reduce(
      (sum, item) =>
        sum +
        (Number(item?.quantityReceivedNow) || 0) *
        (Number(item?.unitCost) || 0),
      0,
    ) || 0;
  const totalRemaining =
    watchedItems?.reduce(
      (sum, item) => sum + (Number(item?.remainingQty) || 0),
      0,
    ) || 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[95vh] p-0 gap-0 overflow-hidden flex flex-col bg-slate-50">
        {/* Debug Panel */}
        <DebugPanel
          data={formData}
          errors={errors}
          isVisible={showDebug}
          onToggle={() => setShowDebug(!showDebug)}
        />

        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-white/10 bg-gradient-to-r from-blue-500 to-indigo-400 text-white shrink-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl border border-white/30">
                <Truck className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white">
                  Record Goods Receipt
                </DialogTitle>
                <p className="text-sm text-emerald-50 mt-1 flex items-center gap-2">
                  <span className="font-mono bg-white/20 px-2 py-0.5 rounded">
                    {purchaseOrder?.poNumber || "NO PO NUMBER"}
                  </span>
                  <span>•</span>
                  <span>{purchaseOrder?.supplier?.name || "NO SUPPLIER"}</span>
                </p>

                {/* Alert Banner */}
                {/* <div className="mb-6 bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-900">Verification Required</p>
                  <p className="text-amber-700 mt-1">
                    Enter the quantity received for each item. Remaining quantity updates automatically as you type.
                  </p>
                </div>
              </div>
            </div> */}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDebug(!showDebug)}
                className="p-1 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                title="Toggle Debug Panel"
              >
                <Bug className="h-5 w-5" />
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-10 w-10 text-white hover:bg-white/20 hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col h-full overflow-hidden"
        >
          {/* Top Bar */}
          <div className="px-6 py-4 bg-white border-b shadow-sm shrink-0">
            <div className="grid grid-cols-4 gap-4 items-end">
              {/* Location Selection - FIXED VERSION */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Warehouse className="h-3.5 w-3.5 text-emerald-600" />
                  Delivery Location <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="locationId"
                  render={({ field }) => {
                    // CRITICAL FIX: Ensure value is never empty string
                    const selectValue =
                      field.value && field.value !== ""
                        ? field.value
                        : undefined;

                    return (
                      <Select
                        onValueChange={field.onChange}
                        value={selectValue} // This ensures no empty string is passed
                      >
                        <SelectTrigger
                          className={cn(
                            "h-11 border-2 bg-slate-50",
                            selectValue
                              ? "border-emerald-500 bg-emerald-50/30"
                              : "border-slate-200",
                            errors.locationId && "border-red-400",
                          )}
                        >
                          <SelectValue placeholder="Select warehouse/location..." />
                        </SelectTrigger>
                        <SelectContent>
                          {/* IMPORTANT: Only render items with valid IDs */}
                          {locations
                            .filter(
                              (loc: any) =>
                                loc && loc.id && String(loc.id).trim() !== "",
                            )
                            .map((loc: any) => (
                              <SelectItem
                                key={loc.id}
                                value={String(loc.id)}
                                className="text-sm"
                              >
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                  <span>{loc.name || "Unnamed"}</span>
                                  {loc.type && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px]"
                                    >
                                      {loc.type}
                                    </Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    );
                  }}
                />
                {errors.locationId && (
                  <p className="text-xs text-red-500 font-medium">
                    {errors.locationId.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Calendar className="inline h-3.5 w-3.5 mr-1 text-emerald-600" />
                  Receipt Date
                </Label>
                <Input
                  type="date"
                  className="h-11 border-slate-200 bg-slate-50"
                  {...register("deliveryDate")}
                />
                {errors.deliveryDate && (
                  <p className="text-xs text-red-500">
                    {errors.deliveryDate.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Hash className="inline h-3.5 w-3.5 mr-1 text-emerald-600" />
                  Supplier Ref / AWB
                </Label>
                <Input
                  className="h-11 border-slate-200 bg-slate-50"
                  {...register("supplierRef")}
                  placeholder="Tracking number..."
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Receipt className="inline h-3.5 w-3.5 mr-1 text-emerald-600" />
                  Supplier Invoice
                </Label>
                <Input
                  className="h-11 border-slate-200 bg-slate-50"
                  {...register("invoiceNumber")}
                  placeholder="Invoice #..."
                />
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* No Items Warning */}
            {(!watchedItems || watchedItems.length === 0) && (
              <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="font-semibold text-red-900">
                      No Items Available
                    </p>
                    <p className="text-red-700 text-sm mt-1">
                      This purchase order has no items to receive. Check the PO
                      data.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-2 mb-1">
              <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                <CardContent className="p-4 pl-10 flex items-center gap-6">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <Boxes className="h-3 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-semibold uppercase">
                      Total Items
                    </p>
                    <p className="text-2xl font-bold text-blue-900">
                      {totalItems}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 bg-emerald-500 rounded-lg">
                    <Package className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-semibold uppercase">
                      Receiving Now
                    </p>
                    <p className="text-2xl font-bold text-emerald-900">
                      {totalReceiving}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 bg-amber-500 rounded-lg">
                    <TrendingDown className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-amber-600 font-semibold uppercase">
                      Remaining After
                    </p>
                    <p className="text-2xl font-bold text-amber-900">
                      {totalRemaining}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-violet-50 to-purple-50 border-violet-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 bg-violet-500 rounded-lg">
                    <DollarSign className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-violet-600 font-semibold uppercase">
                      Total Value
                    </p>
                    <p className="text-lg font-bold text-violet-900">
                      {formatUGX(totalValue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Items Table */}
            {watchedItems && watchedItems.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200">
                        <th className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider p-4 w-[22%]">
                          Item Name
                        </th>
                        <th className="text-center text-xs font-bold text-slate-600 uppercase tracking-wider p-4 w-[7%]">
                          Unit
                        </th>
                        <th className="text-right text-xs font-bold text-slate-600 uppercase tracking-wider p-4 w-[10%]">
                          Unit Price
                        </th>
                        <th className="text-right text-xs font-bold text-slate-600 uppercase tracking-wider p-4 w-[9%]">
                          Ordered
                        </th>
                        <th className="text-right text-xs font-bold text-slate-600 uppercase tracking-wider p-4 w-[9%]">
                          Prev. Rec'd
                        </th>
                        <th className="text-right text-xs font-bold text-emerald-700 uppercase tracking-wider p-4 w-[11%] bg-emerald-50/50">
                          <div className="flex flex-col items-end">
                            <span>Qty Received</span>
                            <span className="text-[9px] text-emerald-600 font-normal">
                              (Type here)
                            </span>
                          </div>
                        </th>
                        <th className="text-right text-xs font-bold text-amber-700 uppercase tracking-wider p-4 w-[11%] bg-amber-50/50">
                          Remaining Qty
                        </th>
                        <th className="text-right text-xs font-bold text-slate-600 uppercase tracking-wider p-4 w-[10%]">
                          Billed Qty
                        </th>
                        <th className="text-center text-xs font-bold text-slate-600 uppercase tracking-wider p-4 w-[11%]">
                          Batch / Expiry
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fields.map((field, index) => {
                        const item = watchedItems[index];
                        if (!item) return null;

                        const lineTotal =
                          (Number(item?.quantityReceivedNow) || 0) *
                          (Number(item?.unitCost) || 0);
                        const isComplete =
                          (Number(item?.remainingQty) || 0) === 0 &&
                          (Number(item?.quantityReceivedNow) || 0) > 0;
                        const isOver = (Number(item?.remainingQty) || 0) < 0;
                        const hasInput =
                          (Number(item?.quantityReceivedNow) || 0) > 0;

                        return (
                          <React.Fragment key={field.id}>
                            <tr
                              className={cn(
                                "transition-colors group",
                                isComplete && "bg-emerald-50/40",
                                isOver && "bg-red-50/40",
                                hasInput && !isComplete && "bg-blue-50/20",
                              )}
                            >
                              {/* Item Name */}
                              <td className="p-4">
                                <div className="flex items-start gap-3">
                                  <div
                                    className={cn(
                                      "p-2 rounded-lg mt-0.5",
                                      purchaseOrder?.orderType === "DRUG"
                                        ? "bg-purple-100 text-purple-600"
                                        : "bg-blue-100 text-blue-600",
                                    )}
                                  >
                                    {purchaseOrder?.orderType === "DRUG" ? (
                                      <Package className="h-4 w-4" />
                                    ) : (
                                      <Boxes className="h-4 w-4" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-slate-900 text-sm leading-tight">
                                      {item.itemName || "Unnamed Item"}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">
                                      ID:{" "}
                                      {item.purchaseOrderItemId?.slice(-8) ||
                                        "N/A"}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => toggleRow(index)}
                                      className="text-xs text-slate-400 hover:text-slate-600 mt-1 flex items-center gap-1"
                                    >
                                      {expandedRows.has(index) ? (
                                        <>
                                          Less <ChevronUp className="h-3 w-3" />
                                        </>
                                      ) : (
                                        <>
                                          More{" "}
                                          <ChevronDown className="h-3 w-3" />
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </td>

                              {/* Unit */}
                              <td className="p-4 text-center">
                                <Badge
                                  variant="outline"
                                  className="font-mono text-xs bg-slate-50"
                                >
                                  {getUOMLabel(item.uom)}
                                </Badge>
                              </td>

                              {/* Unit Price */}
                              <td className="p-4 text-right font-mono text-sm text-slate-700">
                                {formatUGX(Number(item.unitCost))}
                              </td>

                              {/* Qty Ordered */}
                              <td className="p-4 text-right">
                                <span className="font-mono font-semibold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                                  {item.quantityOrdered}
                                </span>
                              </td>

                              {/* Previously Received */}
                              <td className="p-4 text-right">
                                <span className="font-mono text-slate-600">
                                  {item.quantityPreviouslyReceived}
                                </span>
                              </td>

                              {/* Qty Received - INPUT with Controller */}
                              <td className="p-4 text-right bg-emerald-50/30">
                                <Controller
                                  control={control}
                                  name={`items.${index}.quantityReceivedNow`}
                                  render={({ field }) => (
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      className={cn(
                                        "h-11 text-right font-mono font-bold text-base border-2 transition-all",
                                        hasInput
                                          ? "border-emerald-400 bg-emerald-50/50 text-emerald-900"
                                          : "border-slate-200 bg-white text-slate-700",
                                        isOver &&
                                        "border-red-400 bg-red-50 text-red-900",
                                      )}
                                      value={field.value}
                                      onChange={(e) =>
                                        handleQuantityChange(
                                          index,
                                          e.target.value,
                                          field.onChange,
                                        )
                                      }
                                    />
                                  )}
                                />
                              </td>

                              {/* Remaining Qty - READ ONLY */}
                              <td className="p-4 text-right bg-amber-50/30">
                                <div
                                  className={cn(
                                    "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-mono font-bold text-base min-w-[60px]",
                                    isComplete
                                      ? "bg-emerald-200 text-emerald-900 shadow-sm"
                                      : isOver
                                        ? "bg-red-200 text-red-900 shadow-sm"
                                        : hasInput
                                          ? "bg-amber-200 text-amber-900"
                                          : "bg-slate-100 text-slate-600",
                                  )}
                                >
                                  {item.remainingQty ?? 0}
                                  {isComplete && (
                                    <CheckCircle className="h-4 w-4" />
                                  )}
                                </div>
                              </td>

                              {/* Billed Qty */}
                              <td className="p-4 text-right">
                                <Controller
                                  control={control}
                                  name={`items.${index}.billedQty`}
                                  render={({ field }) => (
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      className="h-11 text-right font-mono text-sm border-slate-200 bg-slate-50/50"
                                      {...field}
                                    />
                                  )}
                                />
                              </td>

                              {/* Batch & Expiry */}
                              {/* Batch & Expiry - Conditional Rendering */}
                              <td className="p-4">
                                <div className="space-y-1.5">
                                  {/* Batch Number Input */}
                                  {/* Batch Number Input - with conditional validation */}
                                  {/* Batch Number Input - already correct, just verify */}
                                  <Controller
                                    control={control}
                                    name={`items.${index}.batchNumber`}
                                    render={({
                                      field,
                                      fieldState: { error },
                                    }) => (
                                      <>
                                        <Input
                                          className={cn(
                                            "h-8 text-xs font-mono border-slate-200",
                                            // Lines 1247, 1251, 1257, 1262, 1267 ✅
                                            // watchedItems[index]?.batchTracking

                                            watchedItems[index]
                                              ?.batchTracking &&
                                            (!field.value?.trim() || error) &&
                                            "border-red-400 bg-red-50",
                                            watchedItems[index]
                                              ?.batchTracking &&
                                            field.value?.trim() &&
                                            !error &&
                                            "border-emerald-400 bg-emerald-50",
                                          )}
                                          placeholder={
                                            watchedItems[index]?.batchTracking
                                              ? "Batch # *"
                                              : "Batch # (optional)"
                                          }
                                          disabled={
                                            !watchedItems[index]?.batchTracking
                                          }
                                          {...field}
                                        />
                                        {/* ✅ Show "Required" hint when batchTracking=true and field empty */}
                                        {watchedItems[index]?.batchTracking &&
                                          !field.value?.trim() && (
                                            <span className="text-[10px] text-red-500 flex items-center gap-1">
                                              <AlertTriangle className="h-3 w-3" />{" "}
                                              Required
                                            </span>
                                          )}
                                        {/* ✅ Show Zod error message */}
                                        {error && (
                                          <p className="text-[10px] text-red-500">
                                            {error.message}
                                          </p>
                                        )}
                                      </>
                                    )}
                                  />
                                </div>
                              </td>
                              {/* <td className="p-4">
                                <div className="space-y-1.5">
                                  <Input 
                                    className="h-8 text-xs font-mono bg-white border-slate-200" 
                                    placeholder="Batch #"
                                    {...register(`items.${index}.batchNumber`)} 
                                  />
                                  <Input 
                                    type="date"
                                    className="h-8 text-xs bg-white border-slate-200" 
                                    {...register(`items.${index}.expiryDate`)} 
                                  />
                                </div>
                              </td> */}
                            </tr>

                            {/* Expanded Row */}
                            {expandedRows.has(index) && (
                              <tr className="bg-slate-50/50 border-b border-slate-100">
                                <td colSpan={9} className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-6 text-sm">
                                      <div className="flex items-center gap-2">
                                        <span className="text-slate-500">
                                          Line Total:
                                        </span>
                                        <span className="font-mono font-bold text-slate-900 text-lg">
                                          {formatUGX(lineTotal)}
                                        </span>
                                      </div>
                                      <div className="h-4 w-px bg-slate-300" />
                                      <div className="text-slate-500">
                                        Calculation:{" "}
                                        <span className="font-mono text-slate-700">
                                          {item.quantityReceivedNow}
                                        </span>{" "}
                                        ×{" "}
                                        <span className="font-mono text-slate-700">
                                          {formatUGX(Number(item.unitCost))}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex-1 max-w-md ml-8">
                                      <Input
                                        className="h-9 text-sm bg-white border-slate-200"
                                        placeholder="Item notes (damages, discrepancies...)"
                                        {...register(`items.${index}.notes`)}
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Delivery Notes */}
            <div className="mt-6">
              <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                General Delivery Notes
              </Label>
              <Textarea
                className="min-h-[100px] bg-white border-slate-200 resize-none"
                placeholder="Describe any damages, discrepancies, or special handling instructions..."
                {...register("notes")}
              />
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-5 border-t bg-white gap-3 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-11 px-6"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting || !watchedItems || watchedItems.length === 0
              }
              className="h-11 px-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-lg shadow-emerald-200 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Confirm Receipt & Update Stock
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
