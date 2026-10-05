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
        className="fixed bottom-4 right-4 z-50 bg-foreground text-white p-3 rounded-full shadow-lg hover:bg-foreground transition-colors"
        title="Show Debug Panel"
      >
        <Bug className="h-5 w-5" />
      </button>
    );
  }

  const emptyFields = findEmptyFields(data);
  const validationIssues = findValidationIssues(data);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[500px] max-h-[70vh] bg-foreground text-muted-foreground/30 rounded-xl shadow-2xl border border-foreground overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-foreground border-b border-foreground">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-warning/70" />
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
            className="p-1.5 hover:bg-foreground rounded transition-colors"
            title="Copy data to clipboard"
          >
            <ClipboardCopy className="h-4 w-4" />
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-foreground rounded transition-colors"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-foreground">
        {(["data", "errors", "raw"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors",
              activeTab === tab
                ? "bg-foreground text-white border-b-2 border-warning/40"
                : "text-muted-foreground/70 hover:text-muted-foreground/40 hover:bg-foreground/50",
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
            <div className="bg-foreground/50 rounded-lg p-3 space-y-2">
              <h4 className="text-warning/70 font-semibold uppercase text-[10px] tracking-wider">
                Summary
              </h4>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground/50">
                <div>
                  Location ID:{" "}
                  <span
                    className={
                      data.locationId ? "text-success/70" : "text-danger/70"
                    }
                  >
                    {data.locationId || "EMPTY"}
                  </span>
                </div>
                <div>
                  Date:{" "}
                  <span
                    className={
                      data.deliveryDate ? "text-success/70" : "text-danger/70"
                    }
                  >
                    {data.deliveryDate || "EMPTY"}
                  </span>
                </div>
                <div>
                  Items Count:{" "}
                  <span className="text-success/70">
                    {data.items?.length || 0}
                  </span>
                </div>
                <div>
                  Total Receiving:{" "}
                  <span className="text-success/70">
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
              <div className="bg-danger/30 border border-danger/50 rounded-lg p-3">
                <h4 className="text-danger/70 font-semibold uppercase text-[10px] tracking-wider mb-2">
                  ⚠️ Empty/Invalid Fields ({emptyFields.length})
                </h4>
                <ul className="space-y-1 text-danger/60">
                  {emptyFields.map((field, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-danger" />
                      {field.path}:{" "}
                      <span className="text-danger/70">{field.issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Validation Issues */}
            {validationIssues.length > 0 && (
              <div className="bg-warning/30 border border-warning/50 rounded-lg p-3">
                <h4 className="text-warning/70 font-semibold uppercase text-[10px] tracking-wider mb-2">
                  ⚠️ Validation Warnings ({validationIssues.length})
                </h4>
                <ul className="space-y-1 text-warning/60">
                  {validationIssues.map((issue, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-warning" />
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Items Detail */}
            <div className="space-y-2">
              <h4 className="text-success/70 font-semibold uppercase text-[10px] tracking-wider">
                Items Detail
              </h4>
              {data.items?.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-foreground/50 rounded-lg p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground/40 font-medium">
                      {item.itemName}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {item.purchaseOrderItemId ? "✓ ID" : "✗ No ID"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-muted-foreground/70 text-[10px]">
                    <div>Ordered: {item.quantityOrdered}</div>
                    <div>Prev: {item.quantityPreviouslyReceived}</div>
                    <div
                      className={
                        item.quantityReceivedNow > 0
                          ? "text-success/70"
                          : "text-warning/70"
                      }
                    >
                      Now: {item.quantityReceivedNow}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-[10px]">
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
              <div className="text-success/70">✓ No validation errors</div>
            ) : (
              <pre className="text-danger/70 whitespace-pre-wrap">
                {JSON.stringify(errors, null, 2)}
              </pre>
            )}
          </div>
        )}

        {activeTab === "raw" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground/70">Full Form Data (JSON)</span>
              <button
                onClick={() => copyToClipboard(JSON.stringify(data, null, 2))}
                className="text-xs text-warning/70 hover:text-warning/60"
              >
                Copy
              </button>
            </div>
            <pre className="text-muted-foreground/50 whitespace-pre-wrap break-all">
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
      <DialogContent className="max-w-7xl max-h-[95vh] p-0 gap-0 overflow-hidden flex flex-col bg-muted/50">
        {/* Debug Panel */}
        <DebugPanel
          data={formData}
          errors={errors}
          isVisible={showDebug}
          onToggle={() => setShowDebug(!showDebug)}
        />

        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-white/10 bg-gradient-to-r from-primary to-indigo-400 text-white shrink-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl border border-white/30">
                <Truck className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white">
                  Record Goods Receipt
                </DialogTitle>
                <p className="text-sm text-success/30 mt-1 flex items-center gap-2">
                  <span className="font-mono bg-white/20 px-2 py-0.5 rounded">
                    {purchaseOrder?.poNumber || "NO PO NUMBER"}
                  </span>
                  <span>•</span>
                  <span>{purchaseOrder?.supplier?.name || "NO SUPPLIER"}</span>
                </p>

                {/* Alert Banner */}
                {/* <div className="mb-6 bg-warning-muted/60 border-l-4 border-warning/40 p-4 rounded-r-lg shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-warning">Verification Required</p>
                  <p className="text-warning mt-1">
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
                <Label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1">
                  <Warehouse className="h-3.5 w-3.5 text-success" />
                  Delivery Location <span className="text-danger">*</span>
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
                            "h-11 border-2 bg-muted/50",
                            selectValue
                              ? "border-success/60 bg-success-muted/30"
                              : "border-border",
                            errors.locationId && "border-danger/40",
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
                                  <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" />
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
                  <p className="text-xs text-danger font-medium">
                    {errors.locationId.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                  <Calendar className="inline h-3.5 w-3.5 mr-1 text-success" />
                  Receipt Date
                </Label>
                <Input
                  type="date"
                  className="h-11 border-border bg-muted/50"
                  {...register("deliveryDate")}
                />
                {errors.deliveryDate && (
                  <p className="text-xs text-danger">
                    {errors.deliveryDate.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                  <Hash className="inline h-3.5 w-3.5 mr-1 text-success" />
                  Supplier Ref / AWB
                </Label>
                <Input
                  className="h-11 border-border bg-muted/50"
                  {...register("supplierRef")}
                  placeholder="Tracking number..."
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                  <Receipt className="inline h-3.5 w-3.5 mr-1 text-success" />
                  Supplier Invoice
                </Label>
                <Input
                  className="h-11 border-border bg-muted/50"
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
              <div className="mb-6 bg-danger-muted/60 border-l-4 border-danger/40 p-4 rounded-r-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-danger" />
                  <div>
                    <p className="font-semibold text-danger">
                      No Items Available
                    </p>
                    <p className="text-danger text-sm mt-1">
                      This purchase order has no items to receive. Check the PO
                      data.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-2 mb-1">
              <Card className="bg-gradient-to-br from-primary-muted/60 to-indigo-50 border-primary/25">
                <CardContent className="p-4 pl-10 flex items-center gap-6">
                  <div className="p-2 bg-primary rounded-lg">
                    <Boxes className="h-3 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-primary font-semibold uppercase">
                      Total Items
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      {totalItems}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-success-muted/60 to-primary-muted/60 border-success/25">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 bg-success rounded-lg">
                    <Package className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-success font-semibold uppercase">
                      Receiving Now
                    </p>
                    <p className="text-2xl font-bold text-success">
                      {totalReceiving}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-warning-muted/60 to-warning-muted/60 border-warning/25">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 bg-warning rounded-lg">
                    <TrendingDown className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-warning font-semibold uppercase">
                      Remaining After
                    </p>
                    <p className="text-2xl font-bold text-warning">
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
              <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted border-b border-border">
                        <th className="text-left text-xs font-bold text-muted-foreground uppercase tracking-wider p-4 w-[22%]">
                          Item Name
                        </th>
                        <th className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider p-4 w-[7%]">
                          Unit
                        </th>
                        <th className="text-right text-xs font-bold text-muted-foreground uppercase tracking-wider p-4 w-[10%]">
                          Unit Price
                        </th>
                        <th className="text-right text-xs font-bold text-muted-foreground uppercase tracking-wider p-4 w-[9%]">
                          Ordered
                        </th>
                        <th className="text-right text-xs font-bold text-muted-foreground uppercase tracking-wider p-4 w-[9%]">
                          Prev. Rec'd
                        </th>
                        <th className="text-right text-xs font-bold text-success uppercase tracking-wider p-4 w-[11%] bg-success-muted/50">
                          <div className="flex flex-col items-end">
                            <span>Qty Received</span>
                            <span className="text-[9px] text-success font-normal">
                              (Type here)
                            </span>
                          </div>
                        </th>
                        <th className="text-right text-xs font-bold text-warning uppercase tracking-wider p-4 w-[11%] bg-warning-muted/50">
                          Remaining Qty
                        </th>
                        <th className="text-right text-xs font-bold text-muted-foreground uppercase tracking-wider p-4 w-[10%]">
                          Billed Qty
                        </th>
                        <th className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider p-4 w-[11%]">
                          Batch / Expiry
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
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
                                isComplete && "bg-success-muted/40",
                                isOver && "bg-danger-muted/40",
                                hasInput && !isComplete && "bg-primary-muted/20",
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
                                        : "bg-primary-muted text-primary",
                                    )}
                                  >
                                    {purchaseOrder?.orderType === "DRUG" ? (
                                      <Package className="h-4 w-4" />
                                    ) : (
                                      <Boxes className="h-4 w-4" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-foreground text-sm leading-tight">
                                      {item.itemName || "Unnamed Item"}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      ID:{" "}
                                      {item.purchaseOrderItemId?.slice(-8) ||
                                        "N/A"}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => toggleRow(index)}
                                      className="text-xs text-muted-foreground/70 hover:text-muted-foreground mt-1 flex items-center gap-1"
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
                                  className="font-mono text-xs bg-muted/50"
                                >
                                  {getUOMLabel(item.uom)}
                                </Badge>
                              </td>

                              {/* Unit Price */}
                              <td className="p-4 text-right font-mono text-sm text-foreground">
                                {formatUGX(Number(item.unitCost))}
                              </td>

                              {/* Qty Ordered */}
                              <td className="p-4 text-right">
                                <span className="font-mono font-semibold text-foreground bg-muted px-2 py-1 rounded">
                                  {item.quantityOrdered}
                                </span>
                              </td>

                              {/* Previously Received */}
                              <td className="p-4 text-right">
                                <span className="font-mono text-muted-foreground">
                                  {item.quantityPreviouslyReceived}
                                </span>
                              </td>

                              {/* Qty Received - INPUT with Controller */}
                              <td className="p-4 text-right bg-success-muted/30">
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
                                          ? "border-success/40 bg-success-muted/50 text-success"
                                          : "border-border bg-white text-foreground",
                                        isOver &&
                                        "border-danger/40 bg-danger-muted/60 text-danger",
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
                              <td className="p-4 text-right bg-warning-muted/30">
                                <div
                                  className={cn(
                                    "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-mono font-bold text-base min-w-[60px]",
                                    isComplete
                                      ? "bg-success-muted text-success shadow-sm"
                                      : isOver
                                        ? "bg-danger-muted text-danger shadow-sm"
                                        : hasInput
                                          ? "bg-warning-muted text-warning"
                                          : "bg-muted text-muted-foreground",
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
                                      className="h-11 text-right font-mono text-sm border-border bg-muted/50"
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
                                            "h-8 text-xs font-mono border-border",
                                            // Lines 1247, 1251, 1257, 1262, 1267 ✅
                                            // watchedItems[index]?.batchTracking

                                            watchedItems[index]
                                              ?.batchTracking &&
                                            (!field.value?.trim() || error) &&
                                            "border-danger/40 bg-danger-muted/60",
                                            watchedItems[index]
                                              ?.batchTracking &&
                                            field.value?.trim() &&
                                            !error &&
                                            "border-success/40 bg-success-muted/60",
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
                                            <span className="text-[10px] text-danger flex items-center gap-1">
                                              <AlertTriangle className="h-3 w-3" />{" "}
                                              Required
                                            </span>
                                          )}
                                        {/* ✅ Show Zod error message */}
                                        {error && (
                                          <p className="text-[10px] text-danger">
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
                                    className="h-8 text-xs font-mono bg-white border-border" 
                                    placeholder="Batch #"
                                    {...register(`items.${index}.batchNumber`)} 
                                  />
                                  <Input 
                                    type="date"
                                    className="h-8 text-xs bg-white border-border" 
                                    {...register(`items.${index}.expiryDate`)} 
                                  />
                                </div>
                              </td> */}
                            </tr>

                            {/* Expanded Row */}
                            {expandedRows.has(index) && (
                              <tr className="bg-muted/50 border-b border-border/60">
                                <td colSpan={9} className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-6 text-sm">
                                      <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">
                                          Line Total:
                                        </span>
                                        <span className="font-mono font-bold text-foreground text-lg">
                                          {formatUGX(lineTotal)}
                                        </span>
                                      </div>
                                      <div className="h-4 w-px bg-border" />
                                      <div className="text-muted-foreground">
                                        Calculation:{" "}
                                        <span className="font-mono text-foreground">
                                          {item.quantityReceivedNow}
                                        </span>{" "}
                                        ×{" "}
                                        <span className="font-mono text-foreground">
                                          {formatUGX(Number(item.unitCost))}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex-1 max-w-md ml-8">
                                      <Input
                                        className="h-9 text-sm bg-white border-border"
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
              <Label className="text-sm font-semibold text-foreground mb-2 block">
                General Delivery Notes
              </Label>
              <Textarea
                className="min-h-[100px] bg-white border-border resize-none"
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
              className="h-11 px-8 bg-gradient-to-r from-success to-primary hover:from-success hover:to-primary text-white font-semibold shadow-lg shadow-emerald-200 disabled:opacity-50"
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
