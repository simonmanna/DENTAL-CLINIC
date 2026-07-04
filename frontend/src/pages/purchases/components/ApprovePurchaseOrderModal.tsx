"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox"; // Using shadcn checkbox
import {
  CheckCircle2,
  AlertTriangle,
  Package,
  Pill,
  Calculator,
  Calendar,
  Building2,
  FileText,
} from "lucide-react";
import { useApprovePurchaseOrder } from "@/hooks/usePurchase";
import type { PurchaseOrder } from "@/types/purchase.types";
import { toast } from "sonner";
import { format } from "date-fns";

const schema = z.object({
  approvalNotes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ApprovePurchaseOrderModalProps {
  po: PurchaseOrder;
  onClose: () => void;
}

export default function ApprovePurchaseOrderModal({ po, onClose }: ApprovePurchaseOrderModalProps) {
  const mutation = useApprovePurchaseOrder();
  const [confirmed, setConfirmed] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      approvalNotes: "",
    },
  });

  const formatUGX = (n: number) =>
    new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(n);

  const subtotal = po.items?.reduce((sum, item) => {
    const lineTotal = item.quantityOrdered * item.unitCost;
    const lineTax = lineTotal * ((item.taxPercent || 0) / 100);
    const lineDiscount = item.discount || 0;
    return sum + lineTotal + lineTax - lineDiscount;
  }, 0) || 0;

  const totalTax = subtotal * ((po.taxPercent || 0) / 100);
  const total = subtotal + totalTax - (po.discountAmount || 0) + (po.shippingCost || 0);

  async function onSubmit(data: FormData) {
    if (!confirmed) {
      toast.error("Please verify quantities and confirm approval");
      return;
    }
    try {
      await mutation.mutateAsync({
        id: po.id,
        data: { approvalNotes: data.approvalNotes },
      });
      toast.success("Purchase order approved successfully");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to approve purchase order");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header - Fixed */}
        <DialogHeader className="px-6 py-1 border-b bg-emerald-50/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 shadow-sm">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">Approve Purchase Order</DialogTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-mono text-muted-foreground bg-white px-1.5 py-0.5 rounded border">{po.poNumber}</span>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none capitalize">
                    {po.status.toLowerCase()}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <ScrollArea className="flex-1 overflow-hidden">
            <div className="px-6 py-1 space-y-1">
              {/* Alert Section */}
              {/* <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-amber-900 text-sm">Action Required: Pre-approval Verification</h4>
                  <p className="text-xs text-amber-800/80 leading-relaxed">
                    Check item quantities and unit costs against the official quotation. Approved orders are legally binding and initiate the logistics workflow.
                  </p>
                </div>
              </div> */}

              {/* Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
                {[
                  { icon: Building2, label: "Supplier", value: po.supplier?.name, sub: po.paymentTerms?.replace(/_/g, " "), color: "text-blue-600" },
                  { icon: Calendar, label: "Expected Delivery", value: po.expectedDate ? format(new Date(po.expectedDate), "dd MMM yyyy") : "TBD", sub: `Created ${format(new Date(po.createdAt), "dd MMM yyyy")}`, color: "text-orange-600" },
                  { icon: Calculator, label: "Total Value", value: formatUGX(total), sub: `${po.items?.length || 0} Line Items`, color: "text-emerald-600", highlight: true },
                ].map((card, i) => (
                  <div key={i} className={`p-2 rounded-xl border bg-card shadow-sm ${card.highlight ? 'ring-1 ring-emerald-500/20' : ''}`}>
                    <div className="flex items-center gap-0 mb-0">
                      <card.icon className={`h-4 w-4 ${card.color}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{card.label}</span>
                    </div>
                    <p className={`font-bold ${card.highlight ? 'text-xl text-emerald-600' : 'text-sm'}`}>{card.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 font-medium">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Items Table */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Package className="h-3 w-4 text-primary" />
                    Line Item Details
                  </h4>
                </div>
                
                <div className="rounded-xl border shadow-sm overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left font-semibold p-2">Item Description</th>
                        <th className="text-left font-semibold p-2">Category</th>
                        <th className="text-right font-semibold p-2">Qty</th>
                        <th className="text-right font-semibold p-2">Unit Cost</th>
                        <th className="text-right font-semibold p-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {po.items?.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/5 transition-colors">
                          <td className="p-4">
                            <div className="font-bold text-slate-900">{item.itemName}</div>
                            <div className="text-[11px] text-muted-foreground font-medium uppercase">{item.unit}</div>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className="font-medium">
                              {item.itemType === "DRUG" ? <Pill className="h-3 w-3 mr-1" /> : <Package className="h-3 w-3 mr-1" />}
                              {item.itemType}
                            </Badge>
                          </td>
                          <td className="p-4 text-right font-mono font-bold text-slate-700">{item.quantityOrdered}</td>
                          <td className="p-4 text-right font-mono text-muted-foreground">{formatUGX(item.unitCost)}</td>
                          <td className="p-4 text-right font-mono font-bold">{formatUGX(item.quantityOrdered * item.unitCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Summary Footer in Table */}
                  <div className="bg-slate-50 border-t p-2 space-y-2">
                    {/* <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span>Subtotal</span>
                      <span>{formatUGX(subtotal)}</span>
                    </div>
                    {po.discountAmount > 0 && (
                      <div className="flex justify-between text-xs font-medium text-red-600">
                        <span>Discount</span>
                        <span>-{formatUGX(po.discountAmount)}</span>
                      </div>
                    )} */}
                    <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                      <span>Total Amount Payable</span>
                      <span className="text-emerald-700">{formatUGX(total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-3">
                <Label className="text-sm font-bold flex items-center gap-2 ml-1">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Internal Approval Notes
                </Label>
                <Textarea
                  className="min-h-[50px] rounded-xl border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none shadow-sm"
                  placeholder="Mention any deviations, partial approvals, or shipping instructions..."
                  {...register("approvalNotes")}
                />
              </div>

              {/* Sticky-like Confirmation */}
              <div className={`p-2 rounded-xl border-2 transition-all duration-200 ${confirmed ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-start gap-4">
                  <Checkbox 
                    id="confirm" 
                    checked={confirmed} 
                    onCheckedChange={(checked) => setConfirmed(checked as boolean)}
                    className="mt-1 bg-emerald-600"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <label htmlFor="confirm" className="text-sm font-bold cursor-pointer select-none">
                      Final Verification Confirmation
                    </label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      I have cross-checked the items, costs, and supplier info. This action will finalize the PO and notify the finance department.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Footer - Fixed */}
          <DialogFooter className="px-6 py-1 border-t bg-white shrink-0 sm:justify-between items-center">
            <div className="hidden sm:block">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Grand Total</p>
              <p className="text-lg font-black text-emerald-700">{formatUGX(total)}</p>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              <Button type="button" variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
                Discard
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || mutation.isPending || !confirmed}
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 shadow-lg shadow-emerald-200 transition-all active:scale-95"
              >
                {mutation.isPending ? "Processing..." : "Approve Order"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}