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
        <div className="relative overflow-hidden rounded-lg bg-primary p-4 text-white shadow-md">
          <div className="z-10 relative">
            <h3 className="text-2xl font-bold">{stats.total}</h3>
            <p className="text-primary/40">Total Categories</p>
          </div>
          <Tag className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-primary/50 rotate-12" />
        </div>

        <div className="relative overflow-hidden rounded-lg bg-success p-4 text-white shadow-md">
          <div className="z-10 relative">
            <h3 className="text-2xl font-bold">{stats.active}</h3>
            <p className="text-success/40">Active Status</p>
          </div>
          <CheckCircle className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-success/50 rotate-12" />
        </div>

        <div className="relative overflow-hidden rounded-lg bg-warning p-4 text-white shadow-md">
          <div className="z-10 relative">
            <h3 className="text-2xl font-bold">{stats.items}</h3>
            <p className="text-warning/40">Total Items Linked</p>
          </div>
          <Box className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-warning/50 rotate-12" />
        </div>
      </div>

      {/* --- MAIN TABLE CARD --- */}
      {/* --- MAIN TABLE CARD --- */}
      <div className="rounded-lg bg-white shadow-sm border-t-4 border-primary/60">
        <div className="p-2 border-b flex flex-col sm:flex-row justify-between items-center gap-1 bg-muted/50">
          <h2 className="text-lg font-semibold text-foreground">
            Inventory Categories
          </h2>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-[200px] bg-white border-primary/25 focus-visible:ring-primary/15"
            />
            <Button
              size="sm"
              onClick={() => {
                setSelectedCategory(null);
                setIsFormOpen(true);
              }}
              className="bg-primary hover:bg-primary text-white h-8"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add New
            </Button>
          </div>
        </div>

        <div className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 py-0 font-bold text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="h-9 py-0 font-bold text-muted-foreground">
                  Parent
                </TableHead>
                <TableHead className="h-9 py-0 font-bold text-muted-foreground">
                  Code
                </TableHead>
                <TableHead className="h-9 py-0 font-bold text-muted-foreground">
                  Count
                </TableHead>
                <TableHead className="h-9 py-0 font-bold text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="h-9 py-0 text-right font-bold text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Icons.spinner className="h-6 w-8 animate-spin mx-auto text-primary" />
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
                    className="hover:bg-primary-muted/30 transition-colors"
                  >
                    {/* py-1 reduces row height significantly */}
                    <TableCell className="py-1 font-medium">
                      <div className="flex items-center gap-2 text-sm">
                        <div
                          className="w-2.5 h-2.5 rounded-full border border-border"
                          style={{
                            backgroundColor: category.color || "#e2e8f0",
                          }}
                        />
                        <span className="text-foreground truncate max-w-[150px]">
                          {category.name}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="py-1">
                      {category.parentId && categoryMap[category.parentId] ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 font-normal bg-primary-muted/60 text-primary border-primary/25"
                        >
                          {categoryMap[category.parentId]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </TableCell>

                    <TableCell className="py-1 text-xs">
                      <code className="px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                        {category.code || "N/A"}
                      </code>
                    </TableCell>

                    <TableCell className="py-1">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {category._count?.inventoryItems || 0}
                      </span>
                    </TableCell>

                    <TableCell className="py-1">
                      <Badge
                        className={`text-[11px] px-1.5 py-0 leading-none ${
                          category.isActive
                            ? "bg-success-muted text-success border-success/25"
                            : "bg-danger-muted text-muted-foreground border-border"
                        }`}
                      >
                        {category.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>

                    <TableCell className="py-1 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          title="Edit Details"
                          className="h-6 w-8 rounded-md bg-warning/80 p-0 text-white hover:bg-warning shadow-sm"
                          onClick={() => handleEdit(category)}
                        >
                          <Pencil size={16} strokeWidth={3} />
                        </Button>

                        {/* <Button
                          title="Edit Details"
                          className="h-6 w-8 rounded-md bg-warning p-0 text-white hover:bg-warning shadow-sm"
                          onClick={() => handleEdit(category)}
                        >
                          <MinusCircle size={16} strokeWidth={3} />
                        </Button> */}


{/* MinusCircle, XCircle, Ban */}
                        {/* <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 border-primary/25 text-primary hover:bg-primary hover:text-white transition-all"
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
                            className="h-7 px-2 border-danger/25 bg-danger-muted text-danger hover:bg-danger hover:text-white transition-all"
                            onClick={() => handleDelete(category.id)}
                          >
                            <MinusCircle className="h-3.5 w-3.5 mr-1" />
                            
                          </Button>
                        ) : (
                          <Button
                          title="Activate"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 border-success/25 bg-success-muted text-success hover:bg-success hover:text-white transition-all"
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
      {/* <div className="rounded-lg bg-white shadow-sm border-t-4 border-primary/60">
        <div className="p-1 border-b flex flex-col sm:flex-row justify-between items-center gap-1 bg-muted/50">
          <h2 className="text-lg font-semibold text-foreground">Inventory Categories Management</h2>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[240px] bg-white border-primary/25 focus-visible:ring-primary/60"
            />
            <Button 
              onClick={() => { setSelectedCategory(null); setIsFormOpen(true); }}
              className="bg-primary hover:bg-primary text-white"
            >
              <Icons.plus className="mr-2 h-4 w-4" />
              Add New
            </Button>
          </div>
        </div>

        <div className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-bold text-muted-foreground">Name</TableHead>
                <TableHead className="font-bold text-muted-foreground">Parent</TableHead>
                <TableHead className="font-bold text-muted-foreground">Code</TableHead>
                <TableHead className="font-bold text-muted-foreground">Count</TableHead>
                <TableHead className="font-bold text-muted-foreground">Status</TableHead>
                <TableHead className="text-right font-bold text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Icons.spinner className="h-6 w-8 animate-spin mx-auto text-primary" />
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
                  <TableRow key={category.id} className="hover:bg-primary-muted/30 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {category.color ? (
                          <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: category.color }} />
                        ) : (
                           <div className="w-3 h-3 rounded-full bg-muted" />
                        )}
                        <span className="text-foreground">{category.name}</span>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      {category.parentId && categoryMap[category.parentId] ? (
                        <Badge variant="outline" className="font-normal bg-primary-muted/60 text-primary border-primary/25">
                          {categoryMap[category.parentId]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <code className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs font-mono">
                        {category.code || 'N/A'}
                      </code>
                    </TableCell>

                    <TableCell>
                      <span className="text-sm font-semibold text-muted-foreground">
                        {category._count?.inventoryItems || 0}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Badge className={category.isActive 
                        ? 'bg-success-muted text-success hover:bg-success-muted border-success/25' 
                        : 'bg-muted text-muted-foreground hover:bg-muted'}>
                        {category.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="hover:text-primary hover:bg-primary-muted/60">
                            <Icons.moreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => handleEdit(category)}>
                            <Icons.edit className="mr-2 h-4 w-4 text-primary" />
                            Edit
                          </DropdownMenuItem>
                          {category.isActive ? (
                            <DropdownMenuItem 
                              onClick={() => handleDelete(category.id)}
                              className="text-danger focus:text-danger"
                            >
                              <Icons.trash className="mr-2 h-4 w-4" />
                              Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleRestore(category.id)}>
                              <Icons.refreshCw className="mr-2 h-4 w-4 text-success" />
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-t-8 border-primary/60">
          <DialogHeader>
            <DialogTitle className="text-primary">
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
              className="bg-danger hover:bg-danger"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
