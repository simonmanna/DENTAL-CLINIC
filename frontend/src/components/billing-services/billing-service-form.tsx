// src/components/billing-services/billing-service-form.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { BillingService, LedgerEntryType, BillingServiceCategory } from '@/types/billing-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save } from 'lucide-react';

const formSchema = z.object({
  serviceCode: z.string().min(2, 'Code must be at least 2 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  type: z.enum(['PROCEDURE', 'DRUG', 'CONSULTATION', 'SERVICE', 'LAB', 'IMAGING', 'OTHER', 'TREATMENT_PROCEDURE', 'TREATMENT_PROCEDURE_SESSION']),
  category: z.enum(['CONSULTATION', 'PROCEDURE', 'DIAGNOSTIC', 'MEDICATION', 'THERAPY', 'SURGICAL', 'PREVENTIVE', 'ADMINISTRATIVE', 'OTHER']),
  price: z.number().min(0, 'Price must be positive'),
  currency: z.string().default('UGX'),
  defaultTaxAmount: z.number().min(0).default(0),
  defaultTaxLabel: z.string().optional(),
  priceRangeMin: z.number().min(0).optional(),
  priceRangeMax: z.number().min(0).optional(),
  isActive: z.boolean().default(true),
  isFavorite: z.boolean().default(false),
  sortOrder: z.number().default(0),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface BillingServiceFormProps {
  initialData?: BillingService;
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function BillingServiceForm({ initialData, onSubmit, onCancel, isLoading }: BillingServiceFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      type: 'SERVICE',
      category: 'OTHER',
      currency: 'UGX',
      price: 0,
      isActive: true,
      isFavorite: false,
      sortOrder: 0,
    },
  });

  const isActive = watch('isActive');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="bg-primary-muted/50 border-b border-primary/20">
            <CardTitle className="text-primary text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="serviceCode" className="text-foreground">Service Code *</Label>
                <Input
                  id="serviceCode"
                  {...register('serviceCode')}
                  placeholder="e.g., CONS-001"
                  className="border-border focus:border-primary/60 focus:ring-primary/60"
                />
                {errors.serviceCode && (
                  <p className="text-sm text-danger">{errors.serviceCode.message}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">Service Name *</Label>
                <Input
                  id="name"
                  {...register('name')}
                  placeholder="e.g., General Consultation"
                  className="border-border focus:border-primary/60 focus:ring-primary/60"
                />
                {errors.name && (
                  <p className="text-sm text-danger">{errors.name.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-foreground">Description</Label>
              <Textarea
                id="description"
                {...register('description')}
                placeholder="Brief description of the service..."
                className="border-border focus:border-primary/60 focus:ring-primary/60 min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Type</Label>
                <Select 
                  value={watch('type')} 
                  onValueChange={(val) => setValue('type', val as LedgerEntryType)}
                >
                  <SelectTrigger className="border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONSULTATION">Consultation</SelectItem>
                    <SelectItem value="PROCEDURE">Procedure</SelectItem>
                    <SelectItem value="SERVICE">Service</SelectItem>
                    <SelectItem value="LAB">Laboratory</SelectItem>
                    <SelectItem value="IMAGING">Imaging</SelectItem>
                    <SelectItem value="DRUG">Drug</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Category</Label>
                <Select 
                  value={watch('category')} 
                  onValueChange={(val) => setValue('category', val as BillingServiceCategory)}
                >
                  <SelectTrigger className="border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONSULTATION">Consultation</SelectItem>
                    <SelectItem value="PROCEDURE">Procedure</SelectItem>
                    <SelectItem value="DIAGNOSTIC">Diagnostic</SelectItem>
                    <SelectItem value="SURGICAL">Surgical</SelectItem>
                    <SelectItem value="PREVENTIVE">Preventive</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="bg-primary-muted/50 border-b border-primary/20">
            <CardTitle className="text-primary text-lg">Pricing Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price" className="text-foreground">Base Price (UGX) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  {...register('price', { valueAsNumber: true })}
                  className="border-border focus:border-primary/60 focus:ring-primary/60"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="currency" className="text-foreground">Currency</Label>
                <Select 
                  value={watch('currency')} 
                  onValueChange={(val) => setValue('currency', val)}
                >
                  <SelectTrigger className="border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UGX">UGX (Uganda Shilling)</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="defaultTaxAmount" className="text-foreground">Default Tax Amount</Label>
                <Input
                  id="defaultTaxAmount"
                  type="number"
                  step="0.01"
                  {...register('defaultTaxAmount', { valueAsNumber: true })}
                  className="border-border focus:border-primary/60 focus:ring-primary/60"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="defaultTaxLabel" className="text-foreground">Tax Label</Label>
                <Input
                  id="defaultTaxLabel"
                  {...register('defaultTaxLabel')}
                  placeholder="e.g., VAT 18%"
                  className="border-border focus:border-primary/60 focus:ring-primary/60"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priceRangeMin" className="text-foreground">Min Price Range</Label>
                <Input
                  id="priceRangeMin"
                  type="number"
                  step="0.01"
                  {...register('priceRangeMin', { valueAsNumber: true })}
                  className="border-border focus:border-primary/60 focus:ring-primary/60"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="priceRangeMax" className="text-foreground">Max Price Range</Label>
                <Input
                  id="priceRangeMax"
                  type="number"
                  step="0.01"
                  {...register('priceRangeMax', { valueAsNumber: true })}
                  className="border-border focus:border-primary/60 focus:ring-primary/60"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Settings & Notes */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="bg-primary-muted/50 border-b border-primary/20">
          <CardTitle className="text-primary text-lg">Settings & Notes</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                <div>
                  <Label className="text-foreground font-medium">Active Service</Label>
                  <p className="text-xs text-muted-foreground">Available for billing</p>
                </div>
                <Switch
                  checked={isActive}
                  onCheckedChange={(checked) => setValue('isActive', checked)}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                <div>
                  <Label className="text-foreground font-medium">Favorite</Label>
                  <p className="text-xs text-muted-foreground">Pin to top of lists</p>
                </div>
                <Switch
                  checked={watch('isFavorite')}
                  onCheckedChange={(checked) => setValue('isFavorite', checked)}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortOrder" className="text-foreground">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                {...register('sortOrder', { valueAsNumber: true })}
                className="border-border focus:border-primary/60 focus:ring-primary/60"
              />
              <p className="text-xs text-muted-foreground">Lower numbers appear first</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-foreground">Internal Notes</Label>
              <Textarea
                id="notes"
                {...register('notes')}
                placeholder="Private notes about this service..."
                className="border-border focus:border-primary/60 focus:ring-primary/60 min-h-[100px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          className="border-input text-foreground hover:bg-muted/50"
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={isLoading}
          className="bg-primary hover:bg-primary text-white shadow-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {initialData ? 'Update Service' : 'Create Service'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}