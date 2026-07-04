import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ColorPicker } from '@/components/ui/color-picker';
import { Icons } from './icons';
import { InventoryCategory } from '@/types/inventory';
import { useParentCategories } from '../../../../hooks/use-categories';
import { inventoryCategoryApi } from '@/lib/api/inventory-category';
import { Save, X, Info, Tag, Layers } from "lucide-react"; // Added for UI polish

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  code: z.string().max(10).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
  icon: z.string().optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().min(0).default(0),
});

type FormValues = z.infer<typeof formSchema>;

interface CategoryFormProps {
  initialData?: InventoryCategory | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export interface CreateCategoryInput {
  name: string;
  code?: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}


export function CategoryForm({ initialData, onSuccess, onCancel }: CategoryFormProps) {
  const [parentId, setParentId] = useState<string | null>(initialData?.parentId || null);
  const { data: parentCategories, isLoading: parentsLoading } = useParentCategories(initialData?.id);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || '',
      code: initialData?.code || '',
      description: initialData?.description || '',
      color: initialData?.color || '#3b82f6',
      icon: initialData?.icon || '',
      parentId: initialData?.parentId || null,
      isActive: initialData?.isActive ?? true,
      sortOrder: initialData?.sortOrder || 0,
    },
  });

  // category-form.tsx - line ~73

  const onSubmit = async (values: FormValues) => {
  try {
    const payload: CreateCategoryInput = {
      name: values.name,
      code: values.code || undefined,
      description: values.description || undefined,
      color: values.color || undefined,
      icon: values.icon || undefined,
      parentId: values.parentId ?? null,
      isActive: values.isActive ?? true,
      sortOrder: values.sortOrder ?? 0,
    };

    if (initialData) {
      await inventoryCategoryApi.update(initialData.id, payload);
    } else {
      await inventoryCategoryApi.create(payload); // ✅ No assertion needed!
    }
    onSuccess?.();
  } catch (error) {
    console.error(error);
  }
};

// const onSubmit = async (values: FormValues) => {
//   try {
//     // Transform values to match API expectations
//     const payload = {
//       name: values.name!,  // ✅ Non-null assertion (validated by zod)
//       code: values.code || undefined,
//       description: values.description || undefined,
//       color: values.color || undefined,
//       icon: values.icon || undefined,
//       parentId: values.parentId || null,
//       isActive: values.isActive ?? true,
//       sortOrder: values.sortOrder ?? 0,
//     };

//     if (initialData) {
//       await inventoryCategoryApi.update(initialData.id, payload);
//     } else {
//       // ✅ Type assertion: we know payload satisfies CreateCategoryInput
//       await inventoryCategoryApi.create(payload as CreateCategoryInput);
//     }
//     onSuccess?.();
//   } catch (error) {
//     console.error(error);
//   }
// };

  // const onSubmit = async (values: FormValues) => {
  //   try {
  //     if (initialData) {
  //       await inventoryCategoryApi.update(initialData.id, values);
  //     } else {
  //       await inventoryCategoryApi.create(values);
  //     }
  //     onSuccess?.();
  //   } catch (error) {
  //     console.error(error);
  //   }
  // };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-0">
        {/* <div className="bg-sky-50/50 p-4 border-b border-sky-100 mb-4 rounded-t-lg">
           <p className="text-xs font-medium text-sky-600 uppercase tracking-wider flex items-center gap-2">
            <Info className="h-3 w-3" /> Basic Information
           </p>
        </div> */}

        <div className="px-1 pt-4 pb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-bold">Category Name <span className="text-red-500">*</span></FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Office Supplies" 
                      className="border-slate-200 focus:border-sky-400 focus:ring-sky-100 transition-all" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-bold">Category Code</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., OFF-SUP" 
                      className="border-slate-200 focus:border-sky-400 focus:ring-sky-100 uppercase" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-700 font-bold">Description</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Provide context for this category..." 
                    className="resize-none border-slate-200 focus:border-sky-400 focus:ring-sky-100 min-h-[80px]" 
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 space-y-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Layers className="h-3 w-3" /> Hierarchy & Display
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <FormItem>
                <FormLabel className="text-slate-700 font-bold text-sm">Parent Category</FormLabel>
                <Select
                  value={parentId ?? 'null'}
                  onValueChange={(value) => {
                    const newParent = value === 'null' ? null : value;
                    setParentId(newParent);
                    form.setValue('parentId', newParent);
                  }}
                  disabled={parentsLoading}
                >
                  <FormControl>
                    <SelectTrigger className="bg-white border-slate-200">
                      <SelectValue placeholder="Select parent" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="null" className="font-medium text-sky-600">None (Top-Level)</SelectItem>
                    {parentCategories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {initialData?.children && initialData.children.length > 0 && (
                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1 font-medium">
                     Contains subcategories
                  </p>
                )}
              </FormItem>

              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-bold text-sm">Display Order</FormLabel>
                    <FormControl>
                      <Input type="number" className="bg-white" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-bold text-sm flex items-center gap-2">
                      <Tag className="h-3 w-3" /> Badge Color
                    </FormLabel>
                    <div className="flex items-center gap-2 p-1 bg-white border rounded-md border-slate-200">
                      <ColorPicker value={field.value} onChange={field.onChange} />
                      <Input 
                        className="border-none focus-visible:ring-0 h-8 text-xs font-mono" 
                        {...field} 
                      />
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-md border border-slate-200 bg-white py-1 px-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-bold text-slate-700">Active Status</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-sky-500"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-1 bg-slate-50 border-t border-slate-100 rounded-b-lg">
          <Button 
            type="button" 
            variant="ghost" 
            size="sm"
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-700 hover:bg-slate-200"
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button 
            type="submit" 
            size="sm"
            disabled={form.formState.isSubmitting}
            className="bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-100 px-6"
          >
            {form.formState.isSubmitting ? (
              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {initialData ? 'Update Category' : 'Create Category'}
          </Button>
        </div>
      </form>
    </Form>
  );
}