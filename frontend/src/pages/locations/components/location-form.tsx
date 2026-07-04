// src/pages/locations/components/location-form.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Location, LocationType } from '@/types/location';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  type: z.nativeEnum(LocationType),
  parentId: z.string().optional().nullable(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

interface LocationFormProps {
  location?: Location;
  allLocations?: Location[]; // flat list of all locations (for parent selection)
  onSubmit: (values: z.infer<typeof formSchema>) => void;
  isLoading?: boolean;
}

const locationTypeLabels: Record<LocationType, string> = {
  [LocationType.MAIN_CLINIC]: 'Main Clinic',
  [LocationType.BRANCH]: 'Branch',
  [LocationType.STORAGE]: 'Storage',
  [LocationType.PHARMACY]: 'Pharmacy',
  [LocationType.LAB]: 'Laboratory',
  [LocationType.RECEPTION]: 'Reception',
  [LocationType.WAREHOUSE]: 'Warehouse',
  [LocationType.MOBILE_UNIT]: 'Mobile Unit',
  [LocationType.STORE]: 'Store',
  [LocationType.CLINIC]: 'Clinic',
  [LocationType.DISPENSARY]: 'Dispensary',
};

export function LocationForm({ location, allLocations = [], onSubmit, isLoading }: LocationFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: location?.name || '',
      type: location?.type || LocationType.STORAGE,
      parentId: location?.parentId || null,
      address: location?.address || '',
      phone: location?.phone || '',
      email: location?.email || '',
      isActive: location?.isActive ?? true,
      isDefault: location?.isDefault ?? false,
      sortOrder: location?.sortOrder || 0,
    },
  });

  // Filter out current location from parent options to avoid self-parenting
  const parentOptions = allLocations.filter((loc) => loc.id !== location?.id);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Main Storage Room" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(locationTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="parentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Parent Location</FormLabel>
                <Select
                  onValueChange={(val) => field.onChange(val === 'null' ? null : val)}
                  value={field.value || 'null'}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="No parent (Root)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="null">No parent (Root)</SelectItem>
                    {parentOptions.map((parent) => (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input placeholder="Physical address" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input placeholder="Contact number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="contact@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-4 pt-4 border-t">
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Active</FormLabel>
                  <div className="text-sm text-muted-foreground">
                    Location is available for use
                  </div>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Default Location</FormLabel>
                  <div className="text-sm text-muted-foreground">
                    Set as default for this location type
                  </div>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {location ? 'Update' : 'Create'} Location
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}