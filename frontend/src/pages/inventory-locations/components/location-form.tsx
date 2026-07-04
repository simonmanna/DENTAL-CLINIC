'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Location, LocationType, LocationTreeNode } from '@/types/location';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
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
import { useLocationTree } from '@/hooks/use-locations';
import { 
  Loader2, 
  MapPin, 
  Phone, 
  Mail, 
  Settings2, 
  Building2, 
  Info,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  initialParentId?: string; // Functional addition from previous step
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

export function LocationForm({ location, initialParentId, onSubmit, isLoading }: LocationFormProps) {
  const { data: treeData } = useLocationTree();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: location?.name || '',
      type: location?.type || LocationType.STORAGE,
      parentId: location?.parentId || initialParentId || null,
      address: location?.address || '',
      phone: location?.phone || '',
      email: location?.email || '',
      isActive: location?.isActive ?? true,
      isDefault: location?.isDefault ?? false,
      sortOrder: location?.sortOrder || 0,
    },
  });

  const getAvailableParents = (nodes: LocationTreeNode[], excludeId?: string): LocationTreeNode[] => {
    const result: LocationTreeNode[] = [];
    nodes.forEach((node) => {
      if (node.id !== excludeId) {
        result.push(node);
        if (node.children?.length) {
          result.push(...getAvailableParents(node.children, excludeId));
        }
      }
    });
    return result;
  };

  const availableParents = treeData ? getAvailableParents(treeData, location?.id) : [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
        
        {/* Section: Basic Information */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 pb-2 border-b border-sky-100">
            <div className="p-1.5 bg-sky-100 rounded-md">
              <Building2 className="h-4 w-4 text-sky-600" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-sky-800">General Information</h3>
          </div>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sky-900 font-semibold">Location Name</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g., Dental Wing A - Storage" 
                    {...field} 
                    className="focus-visible:ring-sky-500 border-sky-100"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sky-900 font-semibold">Classification</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="border-sky-100 focus:ring-sky-500">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(locationTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
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
                  <FormLabel className="text-sky-900 font-semibold">Parent Structure</FormLabel>
                  <Select 
                    onValueChange={(val) => field.onChange(val === 'null' ? null : val)} 
                    value={field.value || 'null'}
                  >
                    <FormControl>
                      <SelectTrigger className="border-sky-100 focus:ring-sky-500 bg-sky-50/30">
                        <SelectValue placeholder="No parent (Root)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-[300px]">
                      <SelectItem value="null" className="font-medium text-sky-700 underline-offset-4">Top Level (Root)</SelectItem>
                      {availableParents.map((parent) => (
                        <SelectItem key={parent.id} value={parent.id}>
                          <span className="text-muted-foreground/50 mr-1">
                            {Array(parent.level).fill('—').join('')}
                          </span>
                          {parent.level > 0 && <ChevronRight className="inline h-3 w-3 mr-1 opacity-50" />}
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
        </div>

        {/* Section: Contact & Physical Details */}
        <div className="space-y-4 p-4 bg-sky-50/50 rounded-xl border border-sky-100">
          <div className="flex items-center gap-2 pb-2">
            <div className="p-1.5 bg-white rounded-md shadow-sm">
              <MapPin className="h-4 w-4 text-sky-600" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-sky-800">Contact & Logistics</h3>
          </div>

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Physical Address</FormLabel>
                <FormControl>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9 bg-white" placeholder="Room/Floor/Building" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Direct Phone</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9 bg-white" placeholder="+1..." {...field} />
                    </div>
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
                  <FormLabel>Contact Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9 bg-white" placeholder="dept@hospital.com" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Section: Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-sky-100 bg-white p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-semibold">Active Status</FormLabel>
                  <FormDescription className="text-[11px]">Visible in inventory lists</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="data-[state=checked]:bg-sky-600"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-sky-100 bg-white p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-semibold">Primary Location</FormLabel>
                  <FormDescription className="text-[11px]">Default for this type</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="data-[state=checked]:bg-sky-600"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <DialogFooter className="pt-4 gap-2">
          <Button 
            type="submit" 
            disabled={isLoading}
            className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white shadow-lg shadow-sky-200"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Settings2 className="mr-2 h-4 w-4" />
            )}
            {location ? 'Update Storage Details' : 'Initialize Location'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}