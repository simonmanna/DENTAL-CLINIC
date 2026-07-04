import { useState, useEffect, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "./icons";
import {
  MoreHorizontal,
  Plus,
  Tag,
  CheckCircle,
  Box,
} from "lucide-react"; // Added icons
import { useCategories } from "../../../../hooks/use-categories";
import { CategoryForm } from "./category-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { inventoryCategoryApi } from "@/lib/api/inventory-category";

import { Edit2, Trash2, RefreshCw } from "lucide-react";
import { Eye, Pencil, Check, PlusCircle, MinusCircle, XCircle, Ban } from "lucide-react";

export function CategoryList() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  const {
    data: categories,
    isLoading,
    refetch,
  } = useCategories({
    search: search || undefined,
    includeItemCount: true,
  });

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories?.forEach((cat) => {
      map[cat.id] = cat.name;
    });
    return map;
  }, [categories]);

  // AdminLTE Stats calculation
  const stats = useMemo(() => {
    if (!categories) return { total: 0, active: 0, items: 0 };
    return {
      total: categories.length,
      active: categories.filter((c) => c.isActive).length,
      items: categories.reduce(
        (acc, curr) => acc + (curr._count?.inventoryItems || 0),
        0,
      ),
    };
  }, [categories]);

  const handleEdit = (category: any) => {
    setSelectedCategory(category);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    setCategoryToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;
    try {
      await inventoryCategoryApi.deactivate(categoryToDelete);
      toast.success("Category deactivated");
      refetch();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to deactivate category",
      );
    } finally {
      setIsDeleteDialogOpen(false);
      setCategoryToDelete(null);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await inventoryCategoryApi.restore(id);
      toast.success("Category restored");
      refetch();
    } catch (error) {
      toast.error("Failed to restore category");
    }
  };

  return (
    <div className="space-y-1 p-1">
      {/* --- ADMIN LTE TOP CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
        <div className="relative overflow-hidden rounded-lg bg-sky-500 p-4 text-white shadow-md">
          <div className="z-10 relative">
            <h3 className="text-2xl font-bold">{stats.total}</h3>
            <p className="text-sky-100">Total Categories</p>
          </div>
          <Tag className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-sky-400/50 rotate-12" />
        </div>

        <div className="relative overflow-hidden rounded-lg bg-emerald-500 p-4 text-white shadow-md">
          <div className="z-10 relative">
            <h3 className="text-2xl font-bold">{stats.active}</h3>
            <p className="text-emerald-100">Active Status</p>
          </div>
          <CheckCircle className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-emerald-400/50 rotate-12" />
        </div>

        <div className="relative overflow-hidden rounded-lg bg-amber-500 p-4 text-white shadow-md">
          <div className="z-10 relative">
            <h3 className="text-2xl font-bold">{stats.items}</h3>
            <p className="text-amber-100">Total Items Linked</p>
          </div>
          <Box className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-amber-400/50 rotate-12" />
        </div>
      </div>

      {/* --- MAIN TABLE CARD --- */}
      {/* --- MAIN TABLE CARD --- */}
      <div className="rounded-lg bg-white shadow-sm border-t-4 border-sky-500">
        <div className="p-2 border-b flex flex-col sm:flex-row justify-between items-center gap-1 bg-slate-50/50">
          <h2 className="text-lg font-semibold text-slate-700">
            Inventory Categories
          </h2>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-[200px] bg-white border-sky-200 focus-visible:ring-sky-50"
            />
            <Button
              size="sm"
              onClick={() => {
                setSelectedCategory(null);
                setIsFormOpen(true);
              }}
              className="bg-sky-600 hover:bg-sky-700 text-white h-8"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add New
            </Button>
          </div>
        </div>

        <div className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 py-0 font-bold text-slate-600">
                  Name
                </TableHead>
                <TableHead className="h-9 py-0 font-bold text-slate-600">
                  Parent
                </TableHead>
                <TableHead className="h-9 py-0 font-bold text-slate-600">
                  Code
                </TableHead>
                <TableHead className="h-9 py-0 font-bold text-slate-600">
                  Count
                </TableHead>
                <TableHead className="h-9 py-0 font-bold text-slate-600">
                  Status
                </TableHead>
                <TableHead className="h-9 py-0 text-right font-bold text-slate-600">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Icons.spinner className="h-6 w-8 animate-spin mx-auto text-sky-500" />
                  </TableCell>
                </TableRow>
              ) : categories?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-12 text-muted-foreground"
                  >
                    No categories found.
                  </TableCell>
                </TableRow>
              ) : (
                categories?.map((category) => (
                  <TableRow
                    key={category.id}
                    className="hover:bg-sky-50/30 transition-colors"
                  >
                    {/* py-1 reduces row height significantly */}
                    <TableCell className="py-1 font-medium">
                      <div className="flex items-center gap-2 text-sm">
                        <div
                          className="w-2.5 h-2.5 rounded-full border border-slate-200"
                          style={{
                            backgroundColor: category.color || "#e2e8f0",
                          }}
                        />
                        <span className="text-slate-700 truncate max-w-[150px]">
                          {category.name}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="py-1">
                      {category.parentId && categoryMap[category.parentId] ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 font-normal bg-sky-50 text-sky-700 border-sky-200"
                        >
                          {categoryMap[category.parentId]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </TableCell>

                    <TableCell className="py-1 text-xs">
                      <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                        {category.code || "N/A"}
                      </code>
                    </TableCell>

                    <TableCell className="py-1">
                      <span className="text-xs font-semibold text-slate-600">
                        {category._count?.inventoryItems || 0}
                      </span>
                    </TableCell>

                    <TableCell className="py-1">
                      <Badge
                        className={`text-[11px] px-1.5 py-0 leading-none ${
                          category.isActive
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : "bg-red-200 text-slate-600 border-slate-200"
                        }`}
                      >
                        {category.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>

                    <TableCell className="py-1 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          title="Edit Details"
                          className="h-6 w-8 rounded-md bg-amber-400 p-0 text-white hover:bg-amber-600 shadow-sm"
                          onClick={() => handleEdit(category)}
                        >
                          <Pencil size={16} strokeWidth={3} />
                        </Button>

                        {/* <Button
                          title="Edit Details"
                          className="h-6 w-8 rounded-md bg-amber-500 p-0 text-white hover:bg-amber-600 shadow-sm"
                          onClick={() => handleEdit(category)}
                        >
                          <MinusCircle size={16} strokeWidth={3} />
                        </Button> */}


{/* MinusCircle, XCircle, Ban */}
                        {/* <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 border-sky-200 text-sky-600 hover:bg-sky-600 hover:text-white transition-all"
                          onClick={() => handleEdit(category)}
                        >
                          <Edit2 className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button> */}

                        {category.isActive ? (
                          <Button
                          title="Deactivate"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 border-red-200 bg-red-100 text-red-600 hover:bg-red-600 hover:text-white transition-all"
                            onClick={() => handleDelete(category.id)}
                          >
                            <MinusCircle className="h-3.5 w-3.5 mr-1" />
                            
                          </Button>
                        ) : (
                          <Button
                          title="Activate"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 border-emerald-200 bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all"
                            onClick={() => handleRestore(category.id)}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      {/* <div className="rounded-lg bg-white shadow-sm border-t-4 border-sky-500">
        <div className="p-1 border-b flex flex-col sm:flex-row justify-between items-center gap-1 bg-slate-50/50">
          <h2 className="text-lg font-semibold text-slate-700">Inventory Categories Management</h2>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[240px] bg-white border-sky-200 focus-visible:ring-sky-500"
            />
            <Button 
              onClick={() => { setSelectedCategory(null); setIsFormOpen(true); }}
              className="bg-sky-600 hover:bg-sky-700 text-white"
            >
              <Icons.plus className="mr-2 h-4 w-4" />
              Add New
            </Button>
          </div>
        </div>

        <div className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold text-slate-600">Name</TableHead>
                <TableHead className="font-bold text-slate-600">Parent</TableHead>
                <TableHead className="font-bold text-slate-600">Code</TableHead>
                <TableHead className="font-bold text-slate-600">Count</TableHead>
                <TableHead className="font-bold text-slate-600">Status</TableHead>
                <TableHead className="text-right font-bold text-slate-600">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Icons.spinner className="h-6 w-8 animate-spin mx-auto text-sky-500" />
                  </TableCell>
                </TableRow>
              ) : categories?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No categories found.
                  </TableCell>
                </TableRow>
              ) : (
                categories?.map((category) => (
                  <TableRow key={category.id} className="hover:bg-sky-50/30 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {category.color ? (
                          <div className="w-3 h-3 rounded-full border border-slate-200" style={{ backgroundColor: category.color }} />
                        ) : (
                           <div className="w-3 h-3 rounded-full bg-slate-200" />
                        )}
                        <span className="text-slate-700">{category.name}</span>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      {category.parentId && categoryMap[category.parentId] ? (
                        <Badge variant="outline" className="font-normal bg-sky-50 text-sky-700 border-sky-200">
                          {categoryMap[category.parentId]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-mono">
                        {category.code || 'N/A'}
                      </code>
                    </TableCell>

                    <TableCell>
                      <span className="text-sm font-semibold text-slate-600">
                        {category._count?.inventoryItems || 0}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Badge className={category.isActive 
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-100'}>
                        {category.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="hover:text-sky-600 hover:bg-sky-50">
                            <Icons.moreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => handleEdit(category)}>
                            <Icons.edit className="mr-2 h-4 w-4 text-sky-600" />
                            Edit
                          </DropdownMenuItem>
                          {category.isActive ? (
                            <DropdownMenuItem 
                              onClick={() => handleDelete(category.id)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Icons.trash className="mr-2 h-4 w-4" />
                              Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleRestore(category.id)}>
                              <Icons.refreshCw className="mr-2 h-4 w-4 text-emerald-600" />
                              Restore
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div> */}

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-t-8 border-sky-500">
          <DialogHeader>
            <DialogTitle className="text-sky-700">
              {selectedCategory
                ? "Update Category Details"
                : "Create New Category"}
            </DialogTitle>
          </DialogHeader>
          <CategoryForm
            initialData={selectedCategory}
            onSuccess={() => {
              setIsFormOpen(false);
              refetch();
              toast.success(
                selectedCategory ? "Category updated" : "Category created",
              );
            }}
            onCancel={() => setIsFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the category. It will no longer appear in
              active dropdowns but historical data will remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
