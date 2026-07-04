import { useState } from "react";
import React from 'react';
import {
  useDrugCategories,
  useCreateDrugCategory,
  useUpdateDrugCategory,
  useDeleteDrugCategory,
} from "@/hooks/use-drug-categories";
import { DrugCategoryTable } from "./DrugCategoryTable";
import DrugCategoryForm from "./DrugCategoryForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, RefreshCw, Layers } from "lucide-react";
import { DrugCategory } from "@/lib/api/drug-categories";
import { cn } from "@/lib/utils";

export function DrugCategoryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<DrugCategory | null>(
    null,
  );

  const { data, isLoading, refetch, error } = useDrugCategories({
    search: searchQuery || undefined,
    // includeChildren: true,
  });

  const categories = React.useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    // If it's a single object, wrap it in an array (for debugging only!)
    console.warn("⚠️ API returned single object instead of array:", data);
    return [data];
  }, [data]);
  const createMutation = useCreateDrugCategory();
  const updateMutation = useUpdateDrugCategory();
  const deleteMutation = useDeleteDrugCategory();

  const handleCreate = async (data: any) => {
    await createMutation.mutateAsync(data);
    setDialogOpen(false);
  };

  const handleUpdate = async (data: any) => {
    if (!editingCategory) return;
    await updateMutation.mutateAsync({ id: editingCategory.id, data });
    setEditingCategory(null);
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (
      window.confirm(
        "Deactivate this category? Drugs cannot be assigned to inactive categories.",
      )
    ) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const openCreate = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const openEdit = (category: DrugCategory) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  return (
    /* AdminLTE-style background: light gray-blue */
    <div className="min-h-full bg-[#f4f6f9] -m-6 p-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
            <Layers className="h-6 w-6 text-sky-600" />
            Drug Categories
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage and organize your medication classification hierarchy
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="bg-white hover:bg-gray-50 border-gray-300 shadow-sm"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4 mr-2 text-gray-600",
                isLoading && "animate-spin",
              )}
            />
            Sync Data
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openCreate}
                className="bg-sky-600 hover:bg-sky-700 text-white shadow-sm border-b-2 border-sky-800 transition-all active:translate-y-[1px]"
              >
                <Plus className="mr-2 h-4 w-4" /> Add New Category
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-t-4 border-sky-500">
              <DialogHeader>
                <DialogTitle className="text-xl text-gray-800">
                  {editingCategory
                    ? "🛠️ Edit Category"
                    : "✨ Create New Category"}
                </DialogTitle>
              </DialogHeader>
              <DrugCategoryForm
                onSubmit={editingCategory ? handleUpdate : handleCreate}
                initialData={editingCategory}
                categories={categories}
                isLoading={createMutation.isPending || updateMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* MAIN CARD CONTAINER */}
      <div className="bg-white rounded shadow-md border-t-[3px] border-sky-400">
        {/* Card Header (Optional Style) */}
        {/* <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">
            Classification Registry
          </h3>
        </div> */}

        <div className="p-0">
          {" "}
          {/* Usually tables in AdminLTE have 0 padding in the card body */}
          <DrugCategoryTable
            categories={categories}
            onEdit={openEdit}
            onDelete={handleDelete}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>
      </div>

      {/* FOOTER-STYLE INFO */}
      <div className="mt-2 text-xs text-gray-400 text-right">
        Showing classification data for {categories.length} main categories
      </div>
    </div>
  );
}
