import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Plus,
  Search,
  RefreshCw,
  Pill,
  TrendingUp,
  Package,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  useDrugs,
  useDrugCategories,
  useDrugStats,
  useCreateDrug,
  useUpdateDrug,
  useToggleDrugActive,
  useDeleteDrug,
} from "../../hooks/useDrugs";
import { useInventoryItems } from "../../hooks/useInventoryItems";
import { getDrugColumns } from "./DrugColumns";
import { DrugForm } from "./DrugForm";
import type { Drug, DrugQueryParams } from "../../types/drug.types";
import { formatPrice } from "../../types/drug.types";
import { useDebounce } from "../../hooks/useDebounce";
import { Eye, Pencil, Check, Trash2, PlusCircle } from "lucide-react";
// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value?: number;
  icon: any;
  color: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-md shadow-md text-white ${color} py-1 px-4 h-18`}
    >
      <div className="relative z-10">
        <h3 className="text-2xl font-bold">{value ?? "..."}</h3>
        <p className="text-sm font-medium opacity-90 uppercase tracking-wider">
          {label}
        </p>
      </div>
      <div className="absolute right-2 top-2 opacity-20 transition-transform hover:scale-110">
        <Icon className="h-12 w-12" />
      </div>
    </div>
  );
}

// ─── Drug Detail Sheet ────────────────────────────────────────────────────────

function DrugDetailSheet({
  drug,
  open,
  onOpenChange,
  onEdit,
}: {
  drug: Drug | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: () => void;
}) {
  if (!drug) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 border-none overflow-hidden shadow-xl">
        <div className="bg-[#3c8dbc] px-2 py-1">
          <DialogHeader className="text-white">
            <DialogTitle className="text-xl font-semibold text-white">
              {drug.name}
            </DialogTitle>
            {drug.genericName && (
              <DialogDescription className="text-sky-100 italic">
                {drug.genericName}
              </DialogDescription>
            )}
          </DialogHeader>
        </div>

        <div className="px-4 py-2 space-y-2 bg-[#f4f6f9]">
          <div className="bg-white rounded border shadow-sm p-4 space-y-4">
            <div className="flex flex-wrap gap-2 pb-2 border-b">
              <Badge
                className={
                  drug.isActive
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-gray-500"
                }
              >
                {drug.isActive ? "Active" : "Inactive"}
              </Badge>
              <Badge
                variant="outline"
                className={
                  drug.requiresPrescription
                    ? "border-red-500 text-red-500"
                    : "border-sky-500 text-sky-500"
                }
              >
                {drug.requiresPrescription ? "Rx Only" : "OTC"}
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-y-3">
              {[
                ["Category", drug.category?.name ?? "—"],
                ["Manufacturer", drug.manufacturer ?? "—"],
                ["Strength", drug.strength ?? "—"],
                ["UOM", drug.uom ?? "—"],
              ].map(([label, val]) => (
                <div
                  key={label}
                  className="flex justify-between items-center border-b border-gray-50 pb-2 last:border-0"
                >
                  <span className="text-sm font-bold text-gray-600 uppercase tracking-tight">
                    {label}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── NEW: Linked Inventory ── */}
          {drug.inventoryItem ? (
            <div className="bg-white rounded border-l-4 border-l-amber-500 shadow-sm p-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                <Package className="h-3 w-3" />
                Linked Inventory
              </h4>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-800">
                  {drug.inventoryItem.name}
                </span>
                <Badge variant="outline">{drug.inventoryItem.itemCode}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Current Stock:{" "}
                <span className="font-mono font-bold">
                  {drug.inventoryItem.quantity}
                </span>{" "}
                units
              </p>
            </div>
          ) : (
            <div className="bg-white rounded border shadow-sm p-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">
                Inventory Link
              </h4>
              <p className="text-sm text-muted-foreground">
                No inventory item linked.
              </p>
            </div>
          )}

          {/* Pricing Box */}
          <div className="bg-white rounded border-l-4 border-l-green-500 shadow-sm px-2 py-1 flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500 uppercase font-bold">
                Selling Price
              </p>
              <p className="text-xl font-black text-gray-800">
                {formatPrice(drug.sellPrice)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase font-bold">Cost</p>
              <p className="text-xl text-gray-400">
                {formatPrice(drug.unitPrice)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-1 flex justify-end gap-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="bg-[#3c8dbc] hover:bg-[#367fa9]" onClick={onEdit}>
            Edit Drug Details
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { DrugDetailSheet };

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DrugsPage() {
  const [query, setQuery] = useState<DrugQueryParams>({
    page: 1,
    limit: 20,
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 350);

  const activeQuery: DrugQueryParams = {
    ...query,
    ...(debouncedSearch && { search: debouncedSearch }),
  };

  const { data, isLoading, isFetching, refetch } = useDrugs(activeQuery);
  const { data: categories = [] } = useDrugCategories();
  const { data: stats } = useDrugStats();
  const { data: inventoryItems = [] } = useInventoryItems();
  const createDrug = useCreateDrug();
  const updateDrug = useUpdateDrug();
  const toggleActive = useToggleDrugActive();
  const deleteDrug = useDeleteDrug();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<Drug | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Drug | null>(null);

  const handleEdit = useCallback((drug: Drug) => {
    setSelected(drug);
    setFormOpen(true);
    setDetailOpen(false);
  }, []);

  const handleView = useCallback((drug: Drug) => {
    setSelected(drug);
    setDetailOpen(true);
  }, []);

  const handleDelete = useCallback((drug: Drug) => {
    setDeleteTarget(drug);
  }, []);

  const columns = getDrugColumns({
    onEdit: handleEdit,
    onView: handleView,
    onDelete: handleDelete,
    onToggleActive: (drug) => toggleActive.mutate(drug.id),
  });

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: data?.meta.totalPages ?? 1,
  });

  const handleSortChange = (s: SortingState) => {
    setSorting(s);
    if (s.length > 0) {
      setQuery((q) => ({
        ...q,
        sortBy: s[0].id as any,
        sortOrder: s[0].desc ? "desc" : "asc",
        page: 1,
      }));
    }
  };

  const handleFormSubmit = async (values: any) => {
    if (selected) {
      await updateDrug.mutateAsync({ id: selected.id, payload: values });
    } else {
      await createDrug.mutateAsync(values);
    }
    setFormOpen(false);
    setSelected(null);
  };

  const isSubmitting = createDrug.isPending || updateDrug.isPending;

  return (
    <div className="space-y-2  px-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Drugs</h1>
        </div>
        <Button
          className="bg-[#3c8dbc] hover:bg-[#367fa9] shadow-sm rounded font-bold"
          onClick={() => setFormOpen(true)}
        >
          <PlusCircle
            className="mr-2 h-5 w-5"
            fill="white" // Makes the "inside" white
            stroke="#3c8dbc" // Makes the plus sign the blue color of the button
            strokeWidth={2.5}
          />
          ADD NEW DRUG
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total Drugs"
          value={stats?.total}
          icon={Package}
          color="bg-blue-500"
        />
        <StatCard
          label="Active"
          value={stats?.active}
          icon={Pill}
          color="bg-green-500"
        />
        <StatCard
          label="Prescription"
          value={stats?.requiresPrescription}
          icon={AlertCircle}
          color="bg-red-500"
        />
        <StatCard
          label="Over The Counter"
          value={stats?.overTheCounter}
          icon={TrendingUp}
          color="bg-purple-500"
        />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search drugs…"
            className="pl-8"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setQuery((q) => ({ ...q, page: 1 }));
            }}
          />
        </div>

        <Select
          value={query.categoryId ?? "all"}
          onValueChange={(v) =>
            setQuery((q) => ({
              ...q,
              categoryId: v === "all" ? undefined : v,
              page: 1,
            }))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.isActive === undefined ? "all" : String(query.isActive)}
          onValueChange={(v) =>
            setQuery((q) => ({
              ...q,
              isActive: v === "all" ? undefined : v === "true",
              page: 1,
            }))
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={
            query.requiresPrescription === undefined
              ? "all"
              : String(query.requiresPrescription)
          }
          onValueChange={(v) =>
            setQuery((q) => ({
              ...q,
              requiresPrescription: v === "all" ? undefined : v === "true",
              page: 1,
            }))
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Rx / OTC" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="true">Prescription (Rx)</SelectItem>
            <SelectItem value="false">Over Counter (OTC)</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          className={isFetching ? "animate-spin" : ""}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  No drugs found. Add your first drug to get started.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(data.meta.page - 1) * data.meta.limit + 1}–
            {Math.min(data.meta.page * data.meta.limit, data.meta.total)} of{" "}
            {data.meta.total} drugs
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!data.meta.hasPrevPage}
              onClick={() =>
                setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }))
              }
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="px-2">
              Page {data.meta.page} of {data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.meta.hasNextPage}
              onClick={() =>
                setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))
              }
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <DrugForm
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setSelected(null);
        }}
        drug={selected}
        categories={categories}
        inventoryItems={inventoryItems}
        onSubmit={handleFormSubmit}
        isSubmitting={isSubmitting}
      />

      <DrugDetailSheet
        drug={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={() => handleEdit(selected!)}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Drug</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.name}</strong>?{" "}
              {(deleteTarget?._count?.prescriptionItems ?? 0) > 0 ||
              (deleteTarget?._count?.saleItems ?? 0) > 0
                ? "This drug has existing records and will be deactivated instead of permanently deleted."
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteDrug.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              {deleteDrug.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
