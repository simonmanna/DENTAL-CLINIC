'use client';

import { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  RefreshCw, 
  Truck, 
  CheckCircle2, 
  AlertTriangle, 
  Users,
  Eye,
  Edit,
  Power,
  PowerOff,
  Trash2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { 
  useReactTable, 
  getCoreRowModel, 
  flexRender, 
  createColumnHelper 
} from "@tanstack/react-table";

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SupplierFormDialog } from './components/SupplierFormDialog';
import {
  useSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  // Assuming these exist based on the previous pattern
  // useToggleSupplierActive, 
  // useDeleteSupplier 
} from '@/hooks/useSuppliers';
import { Supplier, CreateSupplierInput, UpdateSupplierInput } from '@/types/supplier';
import { toast } from 'sonner';
import { cn } from "@/lib/utils";

// ─── Stat Card Component ──────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: { label: string; value?: number | string; icon: any; color: string }) {
  return (
    <div className={`relative overflow-hidden rounded shadow-sm text-white ${color} p-4 h-14 flex flex-col justify-center`}>
      <div className="relative z-10">
        <h3 className="text-3xl font-bold">{value ?? "0"}</h3>
        <p className="text-xs font-medium uppercase tracking-wider opacity-80">{label}</p>
      </div>
      <Icon className="absolute right-2 bottom-2 h-12 w-12 opacity-20" />
    </div>
  );
}

const columnHelper = createColumnHelper<Supplier>();

export default function SuppliersPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading, isFetching, refetch } = useSuppliers({
    page,
    limit: 10,
    search: search || undefined,
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
  });

  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();

  // ─── Table Columns Configuration ───────────────────────────────────────────
  const columns = useMemo(() => [
    columnHelper.accessor("name", {
      header: "Supplier / Vendor",
      cell: (info) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#3c8dbc]">{info.getValue()}</span>
          <span className="text-[11px] text-gray-500">{info.row.original.code || 'No Code'}</span>
        </div>
      ),
    }),
    columnHelper.accessor("contactPerson", {
      header: "Contact Person",
      cell: (info) => <span className="text-sm">{info.getValue() || "—"}</span>,
    }),
    columnHelper.accessor("phone", {
      header: "Phone",
      cell: (info) => <span className="font-mono text-sm">{info.getValue() || "—"}</span>,
    }),
    columnHelper.accessor("isActive", {
      header: "Status",
      cell: (info) => (
        <Badge className={cn(
          "rounded-none px-2 py-0 text-[10px] uppercase", 
          info.getValue() ? "bg-green-500" : "bg-red-500"
        )}>
          {info.getValue() ? "Active" : "Inactive"}
        </Badge>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: (info) => {
        const supplier = info.row.original;
        return (
          <div className="flex items-center justify-center gap-1">
            {/* <Button 
              size="icon" variant="outline" title="View Details"
              className="h-7 w-7 text-blue-600 border-blue-200 hover:bg-blue-50" 
              onClick={() => {  }}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button> */}
            <Button 
              size="icon" variant="outline" title="Edit Supplier"
              className="h-7 w-7 text-amber-600 border-amber-200 hover:bg-amber-50"
              onClick={() => {
                setEditingSupplier(supplier);
                setIsFormOpen(true);
              }}
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            {/* <Button 
              size="icon" variant="outline" title={supplier.isActive ? "Deactivate" : "Activate"}
              className={cn("h-7 w-7", supplier.isActive ? "text-gray-500 border-gray-200" : "text-green-600 border-green-200")}
              onClick={() => {  }}
            >
              {supplier.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
            </Button> */}
            {/* <Button 
              size="icon" variant="outline" title="Delete"
              className="h-7 w-7 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => { }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button> */}
          </div>
        );
      },
    }),
  ], []);

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleCreate = async (input: CreateSupplierInput) => {
    try {
      await createMutation.mutateAsync(input);
      toast.success('Supplier created successfully');
      setIsFormOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create supplier');
    }
  };

  const handleUpdate = async (input: UpdateSupplierInput) => {
    if (!editingSupplier) return;
    try {
      await updateMutation.mutateAsync({ id: editingSupplier.id, input });
      toast.success('Supplier updated successfully');
      setIsFormOpen(false);
      setEditingSupplier(null);
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update supplier');
    }
  };

  const handleSubmit = async (data: CreateSupplierInput | UpdateSupplierInput) => {
  if (editingSupplier) {
    await handleUpdate(data as UpdateSupplierInput);
  } else {
    await handleCreate(data as CreateSupplierInput);
  }
};

  return (
    <div className="space-y-4 p-4 bg-[#f4f6f9] min-h-screen">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-light text-gray-800 uppercase tracking-tight">
          Suppliers <small className="text-gray-500 text-sm normal-case ">Vendors Directory</small>
        </h1>
        <Button className="bg-[#3c8dbc] hover:bg-[#367fa9] rounded-none shadow-sm font-bold" onClick={() => setIsFormOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> ADD NEW SUPPLIER
        </Button>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Suppliers" value={data?.meta?.total} icon={Users} color="bg-[#00c0ef]" />
        <StatCard label="Active Vendors" value={data?.data?.filter(s => s.isActive).length} icon={CheckCircle2} color="bg-[#00a65a]" />
        <StatCard label="Pending Review" value="2" icon={AlertTriangle} color="bg-[#f39c12]" />
        <StatCard label="Total Logistics" value="14" icon={Truck} color="bg-[#dd4b39]" />
      </div>

      {/* ── Main Content Box (AdminLTE Style) ───────────────────────────────── */}
      <div className="bg-white border-t-4 border-t-[#3c8dbc] shadow-md rounded-sm">
        {/* Filters Bar */}
        <div className="p-4 border-b flex flex-wrap gap-3 items-center justify-between bg-gray-50/50">
          <div className="flex gap-2">
            <div className="relative w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                <Search className="h-4 w-4" />
              </span>
              <Input
                placeholder="Search by name, email or code..."
                className="pl-10 rounded-none h-9 border-gray-300 focus-visible:ring-[#3c8dbc]"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40 h-9 rounded-none border-gray-300">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => refetch()} 
            className={cn("text-gray-500", isFetching && "animate-spin")}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Table Area */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-100">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((header) => (
                    <TableHead key={header.id} className="text-[#444] font-bold border-b border-r last:border-r-0 uppercase text-[12px]">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((_, j) => (
                      <TableCell key={j} className="border-r last:border-r-0"><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center text-gray-500 italic">
                    No suppliers found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-gray-50 even:bg-gray-50/30 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-2.5 px-4 border-r last:border-r-0 text-sm">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>


        {/* Footer / Pagination */}
        {data?.meta && (
          <div className="p-4 border-t flex items-center justify-between bg-gray-50/50">
            <div className="text-sm text-gray-600">
              Showing <b>{(page - 1) * 10 + 1}</b> to <b>{Math.min(page * 10, data.meta.total)}</b> of <b>{data.meta.total}</b> suppliers
            </div>
            <div className="flex gap-0 border rounded overflow-hidden">
              <Button
                variant="ghost" size="sm" className="rounded-none border-r h-8 px-3"
                
                disabled={!(data.meta.page > 1)}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <div className="px-4 flex items-center bg-white text-sm font-bold border-r h-8">
                {page}
              </div>
              <Button
                variant="ghost" size="sm" className="rounded-none h-8 px-3"
                disabled={!(data.meta.page < data.meta.totalPages)}
                onClick={() => setPage(p => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <SupplierFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingSupplier(null);
        }}
        supplier={editingSupplier}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}