'use client';

import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  RotateCcw,
  Package,
  ShoppingCart,
  Search,
  ChevronLeft,
  ChevronRight,
  Building2,
  Phone,
  Mail,
  User,
  ArrowUpDown,
  Home,
  ChevronRightIcon,
} from 'lucide-react';
import { ActionButton, RowActions } from "@/components/ui/action-button";
import { Supplier } from '@/types/supplier';
import { useDeleteSupplier, useRestoreSupplier } from '@/hooks/useSuppliers';
import { toast } from 'sonner';

interface SuppliersTableProps {
  suppliers: Supplier[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onEdit: (supplier: Supplier) => void;
  onPageChange: (page: number) => void;
  onSearch: (search: string) => void;
  onStatusFilter: (status: string) => void;
  searchQuery: string;
  statusFilter: string;
}

type SortConfig = {
  key: keyof Supplier | string;
  direction: 'asc' | 'desc' | null;
};

export function SuppliersTable({
  suppliers,
  meta,
  onEdit,
  onPageChange,
  onSearch,
  onStatusFilter,
  searchQuery,
  statusFilter,
}: SuppliersTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'asc' });

  const deleteMutation = useDeleteSupplier();
  const restoreMutation = useRestoreSupplier();

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedSuppliers = useMemo(() => {
    const items = [...suppliers];
    if (sortConfig.direction !== null) {
      items.sort((a, b) => {
        const aValue = String(a[sortConfig.key as keyof Supplier] || '');
        const bValue = String(b[sortConfig.key as keyof Supplier] || '');
        return sortConfig.direction === 'asc' 
          ? aValue.localeCompare(bValue) 
          : bValue.localeCompare(aValue);
      });
    }
    return items;
  }, [suppliers, sortConfig]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      toast.success('Supplier deleted successfully');
      setDeleteId(null);
    } catch {
      toast.error('Failed to delete supplier');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreMutation.mutateAsync(id);
      toast.success('Supplier restored successfully');
    } catch {
      toast.error('Failed to restore supplier');
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9] -m-4 p-4 md:p-8 font-sans">
      {/* AdminLTE Content Header */}
      <section className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Suppliers Directory</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <Home className="h-3.5 w-3.5" />
            <span>Dashboard</span>
            <ChevronRightIcon className="h-3.5 w-3.5" />
            <span className="text-primary font-medium">Suppliers</span>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        {/* Search & Filters Box */}
        <div className="rounded-sm border-t-4 border-t-sky-400 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-border/60 bg-white px-5 py-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" /> Filter Options
            </h3>
          </div>
          <div className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                placeholder="Search by name, email or phone..."
                className="h-10 border-border pl-9 focus-visible:ring-primary/60"
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>

            <Select value={statusFilter} onValueChange={onStatusFilter}>
              <SelectTrigger className="h-10 w-full border-border sm:w-[200px] focus:ring-primary/60">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Data Table Box */}
        <div className="rounded-sm border-t-4 border-t-blue-600 bg-white shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-[#f8fafc]">
                <TableRow className="border-b border-border">
                  <TableHead className="h-12 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    <Button 
                      variant="ghost" 
                      className="h-auto p-0 hover:bg-transparent text-[11px] font-bold uppercase tracking-wider text-muted-foreground" 
                      onClick={() => handleSort('name')}
                    >
                      Supplier <ArrowUpDown className="ml-2 h-3 w-3 text-primary" />
                    </Button>
                  </TableHead>
                  <TableHead className="h-12 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Contact Person</TableHead>
                  <TableHead className="h-12 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Email Address</TableHead>
                  <TableHead className="h-12 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Phone / Mobile</TableHead>
                  <TableHead className="h-12 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">Activity</TableHead>
                  <TableHead className="h-12 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                  <TableHead className="h-12 w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="rounded-full bg-muted/50 p-4 text-muted-foreground/50">
                          <Building2 className="h-10 w-10" />
                        </div>
                        <p className="font-semibold text-muted-foreground">No records found</p>
                        <p className="text-xs text-muted-foreground/70">Try adjusting your filters or search keywords.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedSuppliers.map((supplier) => (
                    <TableRow key={supplier.id} className="transition-colors hover:bg-primary-muted/30 border-b border-border/60">
                      <TableCell className="py-4 px-5">
                        <div className="font-bold text-foreground">{supplier.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 max-w-[220px]">
                          {supplier.address || 'No address provided'}
                        </div>
                      </TableCell>

                      <TableCell className="py-4">
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <User className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium">{supplier.contactPerson || '—'}</span>
                        </div>
                      </TableCell>

                      <TableCell className="py-4">
                        {supplier.email ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground/70" />
                            <a href={`mailto:${supplier.email}`} className="underline-offset-4 hover:underline">{supplier.email}</a>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50 italic font-mono">N/A</span>
                        )}
                      </TableCell>

                      <TableCell className="py-4 font-mono text-xs">
                        {supplier.phone ? (
                          <div className="flex items-center gap-2 text-foreground">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground/70" />
                            {supplier.phone}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50 italic">No phone</span>
                        )}
                      </TableCell>

                      <TableCell className="py-4">
                        <div className="flex justify-center items-center gap-3">
                          <div className="flex flex-col items-center" title="Inventory Items">
                            <span className="text-xs font-bold text-foreground">{supplier.inventoryItemsCount || 0}</span>
                            <Package className="h-3.5 w-3.5 text-primary/70" />
                          </div>
                          <div className="w-px h-6 bg-muted" />
                          <div className="flex flex-col items-center" title="Purchase Orders">
                            <span className="text-xs font-bold text-foreground">{supplier.purchaseOrdersCount || 0}</span>
                            <ShoppingCart className="h-3.5 w-3.5 text-primary/70" />
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-4">
                        <Badge
                          variant="outline"
                          className={`rounded-sm px-2 py-0.5 font-bold text-[9px] uppercase shadow-sm border-none ${
                            supplier.isActive
                              ? 'bg-success text-white'
                              : 'bg-muted-foreground/70 text-white'
                          }`}
                        >
                          {supplier.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>

                      <TableCell className="py-4 text-right px-5">
                        <RowActions>
                          <ActionButton tone="edit" label="Edit" onClick={() => onEdit(supplier)} />
                          {!supplier.isActive ? (
                            <ActionButton tone="success" label="Restore" icon={RotateCcw} onClick={() => handleRestore(supplier.id)} />
                          ) : (
                            <ActionButton tone="delete" label="Delete" onClick={() => setDeleteId(supplier.id)} />
                          )}
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* AdminLTE Pagination Footer */}
          <div className="flex flex-col gap-3 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between border-t border-border/60">
            <p className="text-xs font-medium text-muted-foreground">
              Showing <span className="text-foreground font-bold">{((meta.page - 1) * meta.limit) + 1}</span> to{' '}
              <span className="text-foreground font-bold">{Math.min(meta.page * meta.limit, meta.total)}</span> of{' '}
              <span className="text-foreground font-bold">{meta.total}</span> records
            </p>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-border hover:bg-primary-muted/60 hover:text-primary"
                onClick={() => onPageChange(meta.page - 1)}
                disabled={meta.page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1 mx-2">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-xs font-bold text-white shadow-inner">
                  {meta.page}
                </div>
                <span className="text-xs text-muted-foreground/70 mx-1">of</span>
                <span className="text-xs font-bold text-foreground">{meta.totalPages}</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-8 border-border hover:bg-primary-muted/60 hover:text-primary"
                onClick={() => onPageChange(meta.page + 1)}
                disabled={meta.page === meta.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[400px] border-t-4 border-t-rose-500 rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-foreground">Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              This will deactivate <strong>{suppliers.find(s => s.id === deleteId)?.name}</strong>. Access to this supplier in new transactions will be restricted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded h-9 text-xs border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded h-9 text-xs bg-danger hover:bg-danger text-white shadow-md"
            >
              Deactivate Supplier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}