'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Building2, User, Phone, Mail, MapPin, FileText, Save, X } from 'lucide-react';
import { Supplier, CreateSupplierInput, UpdateSupplierInput } from '@/types/supplier';

const supplierSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

type SupplierFormData = z.infer<typeof supplierSchema>;

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  onSubmit: (data: CreateSupplierInput | UpdateSupplierInput) => void;
  isSubmitting?: boolean;
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
  onSubmit,
  isSubmitting,
}: SupplierFormDialogProps) {
  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
      isActive: true,
    },
  });

  useEffect(() => {
    if (supplier) {
      form.reset({
        name: supplier.name,
        contactPerson: supplier.contactPerson || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        address: supplier.address || '',
        notes: supplier.notes || '',
        isActive: supplier.isActive,
      });
    } else {
      form.reset({
        name: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
        isActive: true,
      });
    }
  }, [supplier, form, open]);

  const handleSubmit = (data: SupplierFormData) => {
    const cleanedData = {
      ...data,
      contactPerson: data.contactPerson || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined,
      address: data.address || undefined,
      notes: data.notes || undefined,
    };
    onSubmit(cleanedData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* AdminLTE Box Style: Small rounded corners, solid top border */}
      <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden border-t-4 border-t-sky-500 rounded-sm">
        <DialogHeader className="px-6 py-1 border-b border-slate-100 bg-slate-50/50">
          <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-sky-500" />
            {supplier ? 'Edit Supplier Details' : 'Register New Supplier'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="px-4 py-1 space-y-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
              {/* Company Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel className="text-xs font-bold uppercase text-slate-600">Company Name <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="e.g. Global Tech Solutions" className="pl-10 h-10 focus-visible:ring-sky-500" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              {/* Contact Person */}
              <FormField
                control={form.control}
                name="contactPerson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase text-slate-600">Contact Person</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="John Doe" className="pl-10 h-10 focus-visible:ring-sky-500" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              {/* Phone */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase text-slate-600">Phone / Mobile</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="+256..." className="pl-10 h-10 focus-visible:ring-sky-500 font-mono text-sm" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel className="text-xs font-bold uppercase text-slate-600">Email Address</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input type="email" placeholder="contact@supplier.com" className="pl-10 h-10 focus-visible:ring-sky-500" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              {/* Address */}
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel className="text-xs font-bold uppercase text-slate-600">Physical Address</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Textarea 
                          placeholder="Plot number, Street, City..." 
                          className="pl-10 min-h-[80px] resize-none focus-visible:ring-sky-500"
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel className="text-xs font-bold uppercase text-slate-600">Internal Notes</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <FileText className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Textarea 
                          placeholder="Special delivery instructions, credit terms, etc." 
                          className="pl-10 min-h-[80px] resize-none focus-visible:ring-sky-500"
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              {/* Active Status Toggle - Styled as an Admin Panel setting */}
              {supplier && (
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="col-span-2 flex flex-row items-center justify-between rounded border border-slate-200 bg-slate-50/50 p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-bold text-slate-700">Account Status</FormLabel>
                        <div className="text-[11px] text-slate-500">
                          Toggle whether this supplier is currently available for orders.
                        </div>
                      </div>
                      <FormControl>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase ${field.value ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {field.value ? 'Active' : 'Inactive'}
                            </span>
                            <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                className="data-[state=checked]:bg-sky-500"
                            />
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* AdminLTE Footer Buttons */}
            <div className="flex justify-end gap-3 pt-1 mt-1 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-4 rounded border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold text-xs"
                onClick={() => onOpenChange(false)}
              >
                <X className="mr-2 h-3.5 w-3.5" /> Close
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="h-9 px-6 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs shadow-sm transition-all"
              >
                {isSubmitting ? (
                  'Processing...'
                ) : (
                  <>
                    <Save className="mr-2 h-3.5 w-3.5" /> 
                    {supplier ? 'Save Changes' : 'Create Supplier'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}