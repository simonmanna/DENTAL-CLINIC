import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Pill, Package } from "lucide-react";
import type { Drug, DrugCategory } from "../../types/drug.types";
import { UOM_OPTIONS, DRUG_FORMS } from "../../types/drug.types";

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, "Drug name is required").max(255),
  genericName: z.string().max(255).optional().or(z.literal("")),
  categoryId: z.string().optional().or(z.literal("")),
  form: z.string().optional().or(z.literal("")),
  strength: z.string().max(100).optional().or(z.literal("")),
  manufacturer: z.string().max(255).optional().or(z.literal("")),
  unit: z.string().max(50).optional().or(z.literal("")),
  uom: z.string().min(1, "Unit of measure is required"),
  unitPrice: z.coerce.number().min(0, "Must be ≥ 0"),
  sellPrice: z.coerce.number().min(0, "Must be ≥ 0"),
  isActive: z.boolean().default(true),
  requiresPrescription: z.boolean().default(false),
  inventoryItemId: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface InventoryItemOption {
  id: string;
  name: string;
  itemCode: string;
  quantity: number;
}

interface DrugFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drug?: Drug | null;
  categories: DrugCategory[];
  inventoryItems: InventoryItemOption[];
  onSubmit: (values: FormValues) => Promise<void>;
  isSubmitting?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DrugForm({
  open,
  onOpenChange,
  drug,
  categories,
  inventoryItems,
  onSubmit,
  isSubmitting,
}: DrugFormProps) {
  const isEditing = !!drug;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      genericName: "",
      categoryId: "",
      form: "",
      strength: "",
      manufacturer: "",
      unit: "",
      uom: "TABLET",
      unitPrice: 0,
      sellPrice: 0,
      isActive: true,
      requiresPrescription: false,
      inventoryItemId: "",
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (drug && open) {
      form.reset({
        name: drug.name,
        genericName: drug.genericName ?? "",
        categoryId: drug.categoryId ?? "",
        form: drug.form ?? "",
        strength: drug.strength ?? "",
        manufacturer: drug.manufacturer ?? "",
        unit: drug.unit ?? "",
        uom: drug.uom ?? "TABLET",
        unitPrice: Number(drug.unitPrice),
        sellPrice: Number(drug.sellPrice),
        isActive: drug.isActive,
        requiresPrescription: drug.requiresPrescription,
        inventoryItemId: drug.inventoryItemId ?? "",
      });
    } else if (!drug && open) {
      form.reset();
      form.reset({
        name: "",
        genericName: "",
        categoryId: "",
        form: "",
        strength: "",
        manufacturer: "",
        unit: "",
        uom: "TABLET",
        unitPrice: 0,
        sellPrice: 0,
        isActive: true,
        requiresPrescription: false,
        inventoryItemId: "none",
      });
    }
  }, [drug, open, form]);

  const handleSubmit = async (values: FormValues) => {
    const cleaned: any = {};

    for (const [key, value] of Object.entries(values)) {
      if (key === "inventoryItemId") {
        // 'none', '', or null explicitly unlinks
        if (value === "none" || value === "" || value === null) {
          cleaned[key] = null;
        } else {
          cleaned[key] = value;
        }
      } else if (value === "" || value === "none") {
        cleaned[key] = undefined;
      } else {
        cleaned[key] = value;
      }
    }

    await onSubmit(cleaned);
  };

  // const handleSubmit = async (values: FormValues) => {
  //   const cleaned = Object.fromEntries(
  //     Object.entries(values).map(([k, v]) => {
  //       // inventoryItemId: empty string tells backend to disconnect
  //       if (k === "inventoryItemId") {
  //         return [k, v === "none" ? "" : v];
  //       }
  //       if (v === "" || v === "none") return [k, undefined];
  //       return [k, v];
  //     }),
  //   ) as FormValues;

  //   await onSubmit(cleaned);
  // };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 border-none overflow-hidden shadow-2xl">
        {/* AdminLTE Themed Header */}
        <div className="bg-[#3c8dbc] px-4 py-3">
          <DialogHeader className="text-white">
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Pill className="h-5 w-5" />
              {isEditing ? `Edit: ${drug?.name}` : "Add New Drug"}
            </DialogTitle>
            <DialogDescription className="text-sky-100 opacity-90">
              {isEditing
                ? "Modify product specifications and pricing details."
                : "Enter the clinical and commercial details for the new medication."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="bg-[#f4f6f9]"
          >
            <div className="p-4 max-h-[70vh] overflow-y-auto space-y-6">
              {/* SECTION: Identity */}
              <div className="bg-white rounded border shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-[#3c8dbc] rounded-full" />
                    Drug Identity
                  </h3>
                </div>
                <div className="p-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase text-gray-500">
                          Brand Name *
                        </FormLabel>
                        <FormControl>
                          <Input
                            className="rounded-none border-gray-300 focus:border-[#3c8dbc]"
                            placeholder="e.g. Panadol"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="genericName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase text-gray-500">
                          Generic Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            className="rounded-none border-gray-300 focus:border-[#3c8dbc]"
                            placeholder="e.g. Paracetamol"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase text-gray-500">
                          Category
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="rounded-none border-gray-300">
                              <SelectValue placeholder="Select Category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="manufacturer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase text-gray-500">
                          Manufacturer
                        </FormLabel>
                        <FormControl>
                          <Input
                            className="rounded-none border-gray-300 focus:border-[#3c8dbc]"
                            placeholder="e.g. Bayer"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* ── NEW: Inventory Item Link ── */}
                  <FormField
                    control={form.control}
                    name="inventoryItemId"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel className="text-xs font-bold uppercase text-gray-500 flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          Linked Inventory Item
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger className="rounded-none border-gray-300">
                              <SelectValue placeholder="Select inventory item…" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">
                              None (Unlinked)
                            </SelectItem>
                            {inventoryItems.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name} ({item.itemCode}) — Stock:{" "}
                                {item.quantity}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Linking ties this drug to stock levels in inventory.
                        </p>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* SECTION: Pricing & Dosage Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Dosage Card */}
                <div className="bg-white rounded border shadow-sm overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b text-sm font-bold text-gray-700 uppercase tracking-wider">
                    Dosage Spec
                  </div>
                  <div className="p-4 space-y-4">
                    <FormField
                      control={form.control}
                      name="form"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-gray-500 uppercase">
                            Form
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="rounded-none border-gray-300">
                                <SelectValue placeholder="Select form" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {DRUG_FORMS.map((f) => (
                                <SelectItem key={f} value={f}>
                                  {f}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="uom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-gray-500 uppercase">
                            Base Unit (UOM)
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="rounded-none border-gray-300">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {UOM_OPTIONS.map((u) => (
                                <SelectItem key={u.value} value={u.value}>
                                  {u.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="strength"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-gray-500 uppercase">
                            Strength
                          </FormLabel>
                          <FormControl>
                            <Input
                              className="rounded-none border-gray-300"
                              placeholder="500mg"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Pricing Card */}
                <div className="bg-white rounded border border-l-4 border-l-green-500 shadow-sm overflow-hidden">
                  <div className="bg-green-50/50 px-4 py-2 border-b text-sm font-bold text-green-700 uppercase tracking-wider text-right">
                    Pricing (UGX)
                  </div>
                  <div className="p-4 space-y-4">
                    <FormField
                      control={form.control}
                      name="unitPrice"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex justify-between items-center">
                            <FormLabel className="text-xs font-bold text-gray-500 uppercase">
                              Cost Price
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                className="w-32 rounded-none h-8 text-right font-mono"
                                {...field}
                              />
                            </FormControl>
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sellPrice"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex justify-between items-center">
                            <FormLabel className="text-xs font-bold text-gray-700 uppercase">
                              Retail Price
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                className="w-32 rounded-none h-8 text-right font-mono border-green-300"
                                {...field}
                              />
                            </FormControl>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* SECTION: Status & Restrictions */}
                  <div className="bg-white rounded border shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b">
                      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-1 h-4 bg-[#3c8dbc] rounded-full" />
                        Status & Restrictions
                      </h3>
                    </div>
                    <div className="p-4 flex flex-col gap-4">

                        {/* Active Status Switch */}
                      <FormField
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded border p-3 hover:bg-gray-50 transition-colors">
                            <div className="space-y-0.5">
                              <FormLabel className="text-sm font-bold flex items-center gap-2">
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded">
                                  ●
                                </span>
                                Active Status
                              </FormLabel>
                              <p className="text-[10px] text-muted-foreground uppercase">
                                Visible in pharmacy catalog & search results
                              </p>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                className="data-[state=checked]:bg-[#3c8dbc]"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      
                      {/* Prescription (Rx) Switch */}
                      <FormField
                        control={form.control}
                        name="requiresPrescription"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded border p-3 hover:bg-gray-50 transition-colors">
                            <div className="space-y-0.5">
                              <FormLabel className="text-sm font-bold flex items-center gap-2">
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded">
                                  Rx
                                </span>
                                Prescription Required
                              </FormLabel>
                              <p className="text-[10px] text-muted-foreground uppercase">
                                Restricted dispensing – pharmacist verification
                                needed
                              </p>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                className="data-[state=checked]:bg-[#3c8dbc]"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                    
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: Switches */}
              {/* <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="requiresPrescription"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded bg-white border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-bold">
                          Prescription (Rx)
                        </FormLabel>
                        <p className="text-[10px] text-muted-foreground uppercase">
                          Restricted Dispensing
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded bg-white border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-bold">
                          Active Status
                        </FormLabel>
                        <p className="text-[10px] text-muted-foreground uppercase">
                          Visible in Pharmacy
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div> */}
            </div>

            {/* Footer Bar */}
            <div className="bg-white px-6 py-4 flex justify-between items-center border-t">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                {isEditing ? `Editing: ${drug?.name}` : "New Drug Entry"}
              </span>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none px-6"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#3c8dbc] hover:bg-[#367fa9] rounded-none px-8 font-bold shadow-md"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {isEditing ? "UPDATE PRODUCT" : "CREATE PRODUCT"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
