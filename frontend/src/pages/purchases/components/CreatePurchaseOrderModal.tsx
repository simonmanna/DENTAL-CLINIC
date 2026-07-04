"use client";

import React, { useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Package, ChevronsUpDown, Check, Calculator, Truck, CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCreatePurchaseOrder } from "@/hooks/usePurchase";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi, type InventoryItem } from "@/lib/api/inventory.api";
import { suppliersApi } from "@/lib/api/suppliersApi";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// Simplified item schema - removed itemType since we handle it via inventory
const itemSchema = z.object({
  inventoryItemId: z.string().min(1, "Item is required"),
  itemName: z.string().min(1),
  unit: z.string().min(1),
  quantityOrdered: z.coerce.number().min(0.01),
  unitCost: z.coerce.number().min(0),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
});

const schema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  paymentTerms: z.enum(["CASH_ON_DELIVERY", "NET_7", "NET_14", "NET_30", "NET_60", "CREDIT"]),
  discountAmount: z.coerce.number().min(0).default(0),
  shippingCost: z.coerce.number().min(0).default(0),
  expectedDate: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item required"),
});

type FormValues = z.infer<typeof schema>;

interface Props { onClose: () => void }

// Helper to extract InventoryItem[] from paginated or array response
const getInventoryItemsArray = (data: any): InventoryItem[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  // Handle paginated response - adjust property name based on your API structure
  return data.data ?? data.items ?? data.results ?? [];
};

export default function CreatePurchaseOrderModal({ onClose }: Props) {
  const createMutation = useCreatePurchaseOrder();
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState<{ [key: number]: string }>({});
  const [itemOpen, setItemOpen] = useState<{ [key: number]: boolean }>({});

  // Fetch suppliers
  const { 
    data: suppliersData,
    isLoading: suppliersLoading,
    error: suppliersError 
  } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      try {
        const response = await suppliersApi.getSuppliers();
        console.log("Suppliers fetched:", response);
        return response?.data ?? response ?? [];
      } catch (error) {
        console.error("Failed to fetch suppliers:", error);
        toast.error("Failed to load suppliers");
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const suppliers = suppliersData || [];

  // Fetch inventory items - handles both regular inventory and drugs
  const { 
    data: inventoryItemsData,
    isLoading: itemsLoading,
  } = useQuery({
    queryKey: ["inventory-items"],
    queryFn: async () => {
      try {
        const response = await inventoryApi.getItems({ limit: 500, isActive: true });
        console.log("Inventory items response:", response);
        return response?.data ?? response ?? [];
      } catch (error) {
        console.error("Failed to fetch inventory items:", error);
        toast.error("Failed to load inventory items");
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

const inventoryItems = getInventoryItemsArray(inventoryItemsData);

  const {
    register, control, handleSubmit, watch, setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      paymentTerms: "CASH_ON_DELIVERY",
      discountAmount: 0,
      shippingCost: 0,
      items: [{ 
        inventoryItemId: "", 
        itemName: "", 
        unit: "", 
        quantityOrdered: 1, 
        unitCost: 0 
      }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const watchedItems = watch("items");
  const shippingCost = watch("shippingCost") ?? 0;
  const discountAmount = watch("discountAmount") ?? 0;
  const selectedSupplierId = watch("supplierId");

  // Compute totals
  const subtotal = watchedItems.reduce((sum, item) => {
    const base = (item.quantityOrdered || 0) * (item.unitCost || 0);
    return sum + base;
  }, 0);
  const total = subtotal - discountAmount + shippingCost;

  const formatUGX = (n: number) =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(n);

  // Filter suppliers
  const filteredSuppliers = suppliers.filter((s: any) => 
    s.name?.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    s.email?.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    s.phone?.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const selectedSupplier = suppliers.find((s: any) => s.id === selectedSupplierId);

  const getFilteredItems = (searchTerm: string) => {
    if (!searchTerm) return inventoryItems;
    return inventoryItems.filter((item: any) => 
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.itemCode?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  function onSelectItem(index: number, itemId: string) {
    const item = inventoryItems.find((i: any) => i.id === itemId);
    if (item) {
      setValue(`items.${index}.inventoryItemId`, item.id);
      setValue(`items.${index}.itemName`, item.name);
      setValue(`items.${index}.unit`, item.unit);
      setValue(`items.${index}.unitCost`, item.unitCost ?? 0);
      setItemOpen({ ...itemOpen, [index]: false });
      setItemSearch({ ...itemSearch, [index]: "" });
    }
  }

  const getSelectedItemName = (index: number) => {
    const itemId = watchedItems[index]?.inventoryItemId;
    if (!itemId) return "";
    const item = inventoryItems.find((i: any) => i.id === itemId);
    return item?.name || "";
  };

  async function onSubmit(data: FormValues, isDraft: boolean = false) {
    try {
      // Determine itemType based on the item's category from inventory
      const itemsWithType = data.items.map(item => {
        const inventoryItem = inventoryItems.find((i: any) => i.id === item.inventoryItemId);
        // Infer type from category or default to INVENTORY
        const itemType = inventoryItem?.type === "MEDICATION" || inventoryItem?.type === "DRUG" 
          ? "DRUG" 
          : "INVENTORY";
        
        return {
          ...item,
          itemType,
           quantityOrdered: Number(item.quantityOrdered),
        unitCost: Number(item.unitCost),
        };
      });

      const payload = {
        ...data,
        locationId: null,
        status: isDraft ? "DRAFT" : "SUBMITTED",
        items: itemsWithType,
      };
      
      await createMutation.mutateAsync(payload);
      toast.success(isDraft ? "Draft saved successfully" : "Purchase order created successfully");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to create purchase order");
    }
  }

  const paymentTermsLabel: Record<string, string> = {
    CASH_ON_DELIVERY: "Cash on Delivery",
    NET_7: "Net 7 Days",
    NET_14: "Net 14 Days",
    NET_30: "Net 30 Days",
    NET_60: "Net 60 Days",
    CREDIT: "Credit",
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Package className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  New Purchase Order
                </DialogTitle>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Create order for supplier • Delivery note will be created later
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-6">
            
            {/* Supplier & Order Details - 2 Column Layout */}
            <div className="grid grid-cols-2 gap-4">
              {/* Supplier Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Truck className="inline h-3 w-3 mr-1" />
                  Supplier <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="supplierId"
                  render={({ field }) => (
                    <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between h-9 text-sm bg-white dark:bg-slate-800",
                            !field.value && "text-slate-400",
                            errors.supplierId && "border-red-400 ring-red-100"
                          )}
                        >
                          {field.value && selectedSupplier
                            ? selectedSupplier.name
                            : suppliersLoading ? "Loading suppliers..." : "Select supplier..."}
                          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[350px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput 
                            placeholder="Search suppliers..." 
                            className="h-9"
                            value={supplierSearch}
                            onValueChange={setSupplierSearch}
                          />
                          <CommandList className="max-h-[200px]">
                            {suppliersLoading ? (
                              <div className="py-4 text-center text-sm text-slate-500">Loading suppliers...</div>
                            ) : suppliersError ? (
                              <div className="py-4 text-center text-sm text-red-500">Failed to load suppliers</div>
                            ) : filteredSuppliers.length === 0 ? (
                              <CommandEmpty>No supplier found.</CommandEmpty>
                            ) : (
                              <CommandGroup>
                                {filteredSuppliers.map((supplier: any) => (
                                  <CommandItem
                                    key={supplier.id}
                                    value={supplier.id}
                                    onSelect={(currentValue) => {
                                      field.onChange(currentValue === field.value ? "" : currentValue);
                                      setSupplierOpen(false);
                                      setSupplierSearch("");
                                    }}
                                    className="text-sm"
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", field.value === supplier.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col">
                                      <span className="font-medium">{supplier.name}</span>
                                      {supplier.contactPerson && (
                                        <span className="text-xs text-slate-500">
                                          {supplier.contactPerson} • {supplier.phone || supplier.email}
                                        </span>
                                      )}
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                />
                {errors.supplierId && <p className="text-xs text-red-500">{errors.supplierId.message}</p>}
              </div>

              {/* Payment Terms */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <CreditCard className="inline h-3 w-3 mr-1" />
                  Payment Terms
                </Label>
                <Controller control={control} name="paymentTerms" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="h-9 text-sm bg-white dark:bg-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(paymentTermsLabel).map(([val, label]) => (
                        <SelectItem key={val} value={val} className="text-sm">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>

              {/* Expected Date */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Expected Delivery</Label>
                <Input type="date" className="h-9 text-sm bg-white dark:bg-slate-800" {...register("expectedDate")} />
              </div>

              {/* Due Date */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Due Date</Label>
                <Input type="date" className="h-9 text-sm bg-white dark:bg-slate-800" {...register("dueDate")} />
              </div>
            </div>

            <Separator />

            {/* Items Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Package className="h-4 w-4 text-blue-500" />
                  Order Items
                  <Badge variant="secondary" className="text-xs">{fields.length} item(s)</Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => append({ inventoryItemId: "", itemName: "", unit: "", quantityOrdered: 1, unitCost: 0 })}
                  className="h-8 gap-1.5 bg-blue-500 hover:bg-blue-600"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </Button>
              </div>

              {/* Items Table */}
              <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700/50 border-b">
                    <tr>
                      <th className="text-left text-xs font-semibold text-slate-600 dark:text-slate-400 p-3 w-[40%]">Item</th>
                      <th className="text-center text-xs font-semibold text-slate-600 dark:text-slate-400 p-3 w-[10%]">Unit</th>
                      <th className="text-right text-xs font-semibold text-slate-600 dark:text-slate-400 p-3 w-[12%]">Qty</th>
                      <th className="text-right text-xs font-semibold text-slate-600 dark:text-slate-400 p-3 w-[15%]">Unit Cost</th>
                      <th className="text-right text-xs font-semibold text-slate-600 dark:text-slate-400 p-3 w-[15%]">Total</th>
                      <th className="text-center text-xs font-semibold text-slate-600 dark:text-slate-400 p-3 w-[10%]">Batch</th>
                      <th className="w-[8%]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {fields.map((field, index) => {
                      const item = watchedItems[index];
                      const lineTotal = (item?.quantityOrdered || 0) * (item?.unitCost || 0);
                      const filteredItems = getFilteredItems(itemSearch[index] || "");
                      
                      return (
                        <tr key={field.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                          {/* Item Selection */}
                          <td className="p-2">
                            <Controller
                              control={control}
                              name={`items.${index}.inventoryItemId`}
                              render={({ field: itemField }) => (
                                <Popover 
                                  open={itemOpen[index]} 
                                  onOpenChange={(open) => setItemOpen({ ...itemOpen, [index]: open })}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      className={cn(
                                        "w-full justify-between h-8 text-xs bg-white dark:bg-slate-800 border-slate-200",
                                        !itemField.value && "text-slate-400",
                                        errors.items?.[index]?.inventoryItemId && "border-red-400"
                                      )}
                                    >
                                      <span className="truncate">{getSelectedItemName(index) || "Select item..."}</span>
                                      <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[280px] p-0" align="start">
                                    <Command shouldFilter={false}>
                                      <CommandInput 
                                        placeholder="Search items..."
                                        className="h-8 text-xs"
                                        value={itemSearch[index] || ""}
                                        onValueChange={(value) => setItemSearch({ ...itemSearch, [index]: value })}
                                      />
                                      <CommandList className="max-h-[180px]">
                                        {itemsLoading ? (
                                          <div className="py-3 text-center text-xs text-slate-500">Loading...</div>
                                        ) : filteredItems.length === 0 ? (
                                          <CommandEmpty className="text-xs py-3">No items found.</CommandEmpty>
                                        ) : (
                                          <CommandGroup>
                                            {filteredItems.slice(0, 50).map((item: any) => (
                                              <CommandItem
                                                key={item.id}
                                                value={item.id}
                                                onSelect={() => onSelectItem(index, item.id)}
                                                className="text-xs py-2"
                                              >
                                                <Check className={cn("mr-2 h-3 w-3", itemField.value === item.id ? "opacity-100" : "opacity-0")} />
                                                <div className="flex flex-col min-w-0">
                                                  <span className="font-medium truncate">{item.name}</span>
                                                  <span className="text-slate-500 text-[10px]">
                                                    {item.itemCode && `${item.itemCode} • `}{item.unit} • Stock: {item.stockQuantity || 0}
                                                    {item.category && ` • ${item.category}`}
                                                  </span>
                                                </div>
                                              </CommandItem>
                                            ))}
                                          </CommandGroup>
                                        )}
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                              )}
                            />
                          </td>

                          {/* Unit */}
                          <td className="p-2">
                            <Input 
                              className="h-8 text-xs text-center bg-slate-50 dark:bg-slate-700 border-0" 
                              {...register(`items.${index}.unit`)} 
                              readOnly 
                              tabIndex={-1}
                            />
                          </td>

                          {/* Quantity */}
                          <td className="p-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              className="h-8 text-xs text-right"
                              {...register(`items.${index}.quantityOrdered`)}
                            />
                          </td>

                          {/* Unit Cost */}
                          <td className="p-2">
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              className="h-8 text-xs text-right"
                              {...register(`items.${index}.unitCost`)}
                            />
                          </td>

                          {/* Line Total */}
                          <td className="p-2 text-right font-mono text-xs font-semibold text-slate-700">
                            {formatUGX(lineTotal)}
                          </td>

                          {/* Batch */}
                          <td className="p-2">
                            <Input 
                              className="h-8 text-xs text-center" 
                              {...register(`items.${index}.batchNumber`)} 
                              placeholder="Optional"
                            />
                          </td>

                          {/* Remove */}
                          <td className="p-2 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                              onClick={() => fields.length > 1 && remove(index)}
                              disabled={fields.length === 1}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {errors.items && <p className="text-xs text-red-500">{(errors.items as any).message}</p>}
            </div>

            {/* Notes & Totals */}
            <div className="grid grid-cols-5 gap-4">
              {/* Notes */}
              <div className="col-span-3 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Supplier Notes</Label>
                  <Textarea 
                    className="text-sm h-20 resize-none bg-white dark:bg-slate-800" 
                    {...register("notes")} 
                    placeholder="Delivery instructions, special requirements..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Internal Notes</Label>
                  <Textarea 
                    className="text-sm h-16 resize-none bg-white dark:bg-slate-800" 
                    {...register("internalNotes")} 
                    placeholder="Internal use only..."
                  />
                </div>
              </div>

              {/* Totals */}
              <Card className="col-span-2 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700 border-slate-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <Calculator className="h-4 w-4 text-blue-500" />
                    Order Summary
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Subtotal</span>
                      <span className="font-mono font-medium">{formatUGX(subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 dark:text-slate-400">Discount</span>
                      <Input
                        type="number"
                        step="100"
                        min="0"
                        className="w-24 h-7 text-xs text-right"
                        {...register("discountAmount")}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 dark:text-slate-400">Shipping</span>
                      <Input
                        type="number"
                        step="100"
                        min="0"
                        className="w-24 h-7 text-xs text-right"
                        {...register("shippingCost")}
                      />
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between text-lg font-bold text-slate-900 dark:text-white">
                      <span>Total</span>
                      <span className="font-mono text-blue-600 dark:text-blue-400">{formatUGX(total)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Spacer */}
          <div className="h-4"></div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-800/50 shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="h-9">
            Cancel
          </Button>
          <Button 
            type="button" 
            variant="secondary" 
            disabled={isSubmitting} 
            className="h-9" 
            onClick={() => onSubmit(watch(), true)}
          >
            Save as Draft
          </Button>
          <Button 
            type="button" 
            disabled={isSubmitting} 
            className="h-9 bg-blue-500 hover:bg-blue-600" 
            onClick={() => onSubmit(watch(), false)}
          >
            {isSubmitting ? "Creating..." : "Create Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}