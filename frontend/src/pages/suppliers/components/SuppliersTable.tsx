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
          <h1 className="text-2xl font-semibold text-slate-800">Suppliers Directory</h1>
          <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
            <Home className="h-3.5 w-3.5" />
            <span>Dashboard</span>
            <ChevronRightIcon className="h-3.5 w-3.5" />
            <span className="text-sky-600 font-medium">Suppliers</span>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        {/* Search & Filters Box */}
        <div className="rounded-sm border-t-4 border-t-sky-400 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-white px-5 py-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Search className="h-4 w-4 text-sky-500" /> Filter Options
            </h3>
          </div>
          <div className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by name, email or phone..."
                className="h-10 border-slate-200 pl-9 focus-visible:ring-sky-500"
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>

            <Select value={statusFilter} onValueChange={onStatusFilter}>
              <SelectTrigger className="h-10 w-full border-slate-200 sm:w-[200px] focus:ring-sky-500">
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
                <TableRow className="border-b border-slate-200">
                  <TableHead className="h-12 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <Button 
                      variant="ghost" 
                      className="h-auto p-0 hover:bg-transparent text-[11px] font-bold uppercase tracking-wider text-slate-600" 
                      onClick={() => handleSort('name')}
                    >
                      Supplier <ArrowUpDown className="ml-2 h-3 w-3 text-sky-500" />
                    </Button>
                  </TableHead>
                  <TableHead className="h-12 text-[11px] font-bold text-slate-600 uppercase tracking-wider">Contact Person</TableHead>
                  <TableHead className="h-12 text-[11px] font-bold text-slate-600 uppercase tracking-wider">Email Address</TableHead>
                  <TableHead className="h-12 text-[11px] font-bold text-slate-600 uppercase tracking-wider">Phone / Mobile</TableHead>
                  <TableHead className="h-12 text-[11px] font-bold text-slate-600 uppercase tracking-wider text-center">Activity</TableHead>
                  <TableHead className="h-12 text-[11px] font-bold text-slate-600 uppercase tracking-wider">Status</TableHead>
                  <TableHead className="h-12 w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="rounded-full bg-slate-50 p-4 text-slate-300">
                          <Building2 className="h-10 w-10" />
                        </div>
                        <p className="font-semibold text-slate-500">No records found</p>
                        <p className="text-xs text-slate-400">Try adjusting your filters or search keywords.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedSuppliers.map((supplier) => (
                    <TableRow key={supplier.id} className="transition-colors hover:bg-sky-50/30 border-b border-slate-100">
                      <TableCell className="py-4 px-5">
                        <div className="font-bold text-slate-800">{supplier.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 max-w-[220px]">
                          {supplier.address || 'No address provided'}
                        </div>
                      </TableCell>

                      <TableCell className="py-4">
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <User className="h-3.5 w-3.5 text-sky-500" />
                          <span className="font-medium">{supplier.contactPerson || '—'}</span>
                        </div>
                      </TableCell>

                      <TableCell className="py-4">
                        {supplier.email ? (
                          <div className="flex items-center gap-2 text-sm text-slate-600 hover:text-sky-600 transition-colors">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            <a href={`mailto:${supplier.email}`} className="underline-offset-4 hover:underline">{supplier.email}</a>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 italic font-mono">N/A</span>
                        )}
                      </TableCell>

                      <TableCell className="py-4 font-mono text-xs">
                        {supplier.phone ? (
                          <div className="flex items-center gap-2 text-slate-700">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            {supplier.phone}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic">No phone</span>
                        )}
                      </TableCell>

                      <TableCell className="py-4">
                        <div className="flex justify-center items-center gap-3">
                          <div className="flex flex-col items-center" title="Inventory Items">
                            <span className="text-xs font-bold text-slate-800">{supplier.inventoryItemsCount || 0}</span>
                            <Package className="h-3.5 w-3.5 text-sky-400" />
                          </div>
                          <div className="w-px h-6 bg-slate-200" />
                          <div className="flex flex-col items-center" title="Purchase Orders">
                            <span className="text-xs font-bold text-slate-800">{supplier.purchaseOrdersCount || 0}</span>
                            <ShoppingCart className="h-3.5 w-3.5 text-sky-400" />
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-4">
                        <Badge
                          variant="outline"
                          className={`rounded-sm px-2 py-0.5 font-bold text-[9px] uppercase shadow-sm border-none ${
                            supplier.isActive
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-400 text-white'
                          }`}
                        >
                          {supplier.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>

                      <TableCell className="py-4 text-right px-5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded hover:bg-sky-100">
                              <MoreHorizontal className="h-4 w-4 text-slate-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 shadow-xl border-slate-200">
                            <DropdownMenuItem onClick={() => onEdit(supplier)} className="cursor-pointer font-medium py-2">
                              <Pencil className="mr-2 h-4 w-4 text-sky-500" /> Edit Details
                            </DropdownMenuItem>

                            {!supplier.isActive ? (
                              <DropdownMenuItem onClick={() => handleRestore(supplier.id)} className="cursor-pointer text-emerald-600 font-medium py-2">
                                <RotateCcw className="mr-2 h-4 w-4 text-emerald-500" /> Restore Supplier
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => setDeleteId(supplier.id)}
                                className="cursor-pointer text-rose-600 font-medium py-2 focus:bg-rose-50 focus:text-rose-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4 text-rose-400" /> Delete Supplier
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

          {/* AdminLTE Pagination Footer */}
          <div className="flex flex-col gap-3 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500">
              Showing <span className="text-slate-900 font-bold">{((meta.page - 1) * meta.limit) + 1}</span> to{' '}
              <span className="text-slate-900 font-bold">{Math.min(meta.page * meta.limit, meta.total)}</span> of{' '}
              <span className="text-slate-900 font-bold">{meta.total}</span> records
            </p>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 hover:bg-sky-50 hover:text-sky-700"
                onClick={() => onPageChange(meta.page - 1)}
                disabled={meta.page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1 mx-2">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-sky-600 text-xs font-bold text-white shadow-inner">
                  {meta.page}
                </div>
                <span className="text-xs text-slate-400 mx-1">of</span>
                <span className="text-xs font-bold text-slate-700">{meta.totalPages}</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 hover:bg-sky-50 hover:text-sky-700"
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
            <AlertDialogTitle className="text-lg font-bold text-slate-800">Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 text-sm">
              This will deactivate <strong>{suppliers.find(s => s.id === deleteId)?.name}</strong>. Access to this supplier in new transactions will be restricted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded h-9 text-xs border-slate-200">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded h-9 text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-md"
            >
              Deactivate Supplier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}