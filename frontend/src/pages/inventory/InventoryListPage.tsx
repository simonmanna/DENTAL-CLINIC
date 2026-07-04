import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package,
  Plus,
  Search,
  RefreshCw,
  AlertTriangle,
  TrendingDown,
  DollarSign,
  Boxes,
  Eye,
  Edit,
  X,
  Layers,
  PlusCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  inventoryApi,
  InventoryItem,
  InventoryStats,
  InventoryCategory,
  UOM_LABELS,
  getTotalQuantity,
  isItemLowStock,
  isItemOutOfStock,
} from "../../lib/api/inventory.api";

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatCurrency(val: number) {
  return `UGX ${val.toLocaleString("en-UG")}`;
}

// ─── AdminLTE Style Small Box ─────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  bgColor,
  textColor = "text-white",
  isActive,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  bgColor: string;
  textColor?: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`${bgColor} ${textColor} rounded shadow-sm overflow-hidden relative px-8 py-3 min-h-[60px] transition-all duration-200 ${
        onClick
          ? "cursor-pointer hover:brightness-110 hover:shadow-md active:scale-[0.98]"
          : ""
      } ${isActive ? "ring-2 ring-offset-2 ring-slate-900 brightness-110" : ""}`}
    >
      <div className="relative z-10">
        <h3 className="text-xl font-bold leading-tight">{value}</h3>
        <p className="text-xs font-medium uppercase opacity-80">{label}</p>
      </div>
      <div className="absolute right-2 top-2 opacity-20 z-0">
        <Icon className="h-10 w-10" />
      </div>
    </div>
  );
}

// ─── Main List Page ───────────────────────────────────────────────────────

type ViewMode = "all" | "low" | "out";

export default function InventoryListPage() {
  const navigate = useNavigate();
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isActive, setIsActive] = useState<"true" | "false" | undefined>(undefined);
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch ALL items from API (no stock filtering on backend)
  const fetchItems = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await inventoryApi.getItems({
        search: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        isActive: isActive || undefined,
        // Don't send lowStock/outOfStock to backend — filter client-side
        sortBy,
        sortOrder,
        page,
        limit,
      });
      setAllItems(res.data);
      setMeta({ total: res.meta.total, totalPages: res.meta.totalPages });
    } finally {
      setRefreshing(false);
    }
  }, [debouncedSearch, categoryId, isActive, sortBy, sortOrder, page, limit]);

  useEffect(() => {
    Promise.all([
      inventoryApi.getStats(),
      inventoryApi.getCategories(true),
    ]).then(([s, c]) => {
      setStats(s);
      setCategories(c);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading) fetchItems();
  }, [fetchItems, loading]);

  // Client-side filtering: apply viewMode filter using API helpers
  const items = useMemo(() => {
    if (viewMode === "all") return allItems;
    if (viewMode === "low")
      return allItems.filter((item) => isItemLowStock(item));
    if (viewMode === "out")
      return allItems.filter((item) => isItemOutOfStock(item));
    return allItems;
  }, [allItems, viewMode]);

  // Update displayed meta count for filtered views
  const displayMeta = useMemo(() => {
    if (viewMode === "all") return meta;
    return {
      total: items.length,
      totalPages: Math.ceil(items.length / limit) || 1,
    };
  }, [items.length, limit, meta, viewMode]);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setPage(1);
  };

  const getViewContext = () => {
    switch (viewMode) {
      case "low":
        return {
          title: "Low Stock Items",
          subtitle: "Items below minimum quantity threshold",
          icon: AlertTriangle,
          headerBg: "bg-orange-50",
          headerBorder: "border-orange-200",
          headerText: "text-orange-800",
          badgeBg: "bg-orange-100",
          badgeText: "text-orange-700",
        };
      case "out":
        return {
          title: "Out of Stock Items",
          subtitle: "Items with zero quantity available",
          icon: TrendingDown,
          headerBg: "bg-red-50",
          headerBorder: "border-red-200",
          headerText: "text-red-800",
          badgeBg: "bg-red-100",
          badgeText: "text-red-700",
        };
      default:
        return {
          title: "All Inventory Items",
          subtitle: "Complete inventory list",
          icon: Layers,
          headerBg: "bg-white",
          headerBorder: "border-slate-200",
          headerText: "text-slate-800",
          badgeBg: "bg-slate-100",
          badgeText: "text-slate-700",
        };
    }
  };

  const viewContext = getViewContext();
  const ViewIcon = viewContext.icon;

  if (loading)
    return (
      <div className="px-4 py- space-y-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-[#f4f6f9]">
        {/* ── Header ── */}
        <div className="px-2 py-1 flex items-center justify-between bg-white border-b shadow-sm">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-sky-600" />
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">
              Inventory Manager
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={fetchItems}
              className="h-8 text-xs font-semibold uppercase py-2 px-4"
            >
              <RefreshCw
                className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`}
              />{" "}
              Sync
            </Button>
            <Button
              onClick={() => navigate("/inventory/new")}
              className="h-8 bg-sky-600 hover:bg-sky-700 text-xs font-semibold uppercase py-2 px-4"
            >
              <PlusCircle
                className="mr-2 h-5 w-5"
                fill="white" // Makes the "inside" white
                stroke="#3c8dbc" // Makes the plus sign the blue color of the button
                strokeWidth={2.5}
              />
              Add Item
            </Button>
          </div>
        </div>

        <div className="px-1 py-1 space-y-2 overflow-auto">
          {/* ── Clickable Stat Cards ── */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Items"
                value={stats.total}
                icon={Boxes}
                bgColor="bg-sky-500"
                isActive={viewMode === "all"}
                onClick={() => handleViewModeChange("all")}
              />
              <StatCard
                label="Low Stock"
                value={stats.lowStock}
                icon={AlertTriangle}
                bgColor="bg-orange-400"
                isActive={viewMode === "low"}
                onClick={() => handleViewModeChange("low")}
              />
              <StatCard
                label="Out of Stock"
                value={stats.outOfStock}
                icon={TrendingDown}
                bgColor="bg-red-500"
                isActive={viewMode === "out"}
                onClick={() => handleViewModeChange("out")}
              />
              <StatCard
                label="Inventory Value"
                value={formatCurrency(stats.stockValue)}
                icon={DollarSign}
                bgColor="bg-emerald-500"
              />
            </div>
          )}

          {/* ── Contextual View Header ── */}
          {/* <div className={`${viewContext.headerBg} ${viewContext.headerBorder} border rounded-lg px-4 py-3 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-md ${viewContext.badgeBg}`}>
                <ViewIcon className={`h-5 w-5 ${viewContext.badgeText}`} />
              </div>
              <div>
                <h2 className={`text-sm font-bold ${viewContext.headerText}`}>
                  {viewContext.title}
                </h2>
                <p className="text-xs text-slate-500">{viewContext.subtitle}</p>
              </div>
            </div>
            {viewMode !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleViewModeChange("all")}
                className="h-8 text-xs text-slate-600 hover:text-slate-900"
              >
                <X className="h-3 w-3 mr-1" />
                Clear Filter
              </Button>
            )}
          </div> */}

          {/* ── Action Bar / Filters ── */}
          <div className="bg-white px-2 rounded border shadow-sm flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 h-8 text-xs border-slate-200"
              />
            </div>
            <Select
              value={categoryId}
              onValueChange={(v) => {
                setCategoryId(v === "ALL" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs bg-slate-50">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id || "unknown"}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button
                variant={viewMode === "low" ? "default" : "outline"}
                onClick={() => handleViewModeChange("low")}
                className={`h-8 py-1 px-3 text-[11px] ${viewMode === "low" ? "bg-orange-500 hover:bg-orange-600" : ""}`}
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Low
              </Button>
              <Button
                variant={viewMode === "out" ? "default" : "outline"}
                onClick={() => handleViewModeChange("out")}
                className={`h-8 py-1 px-3 text-[11px] ${viewMode === "out" ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
              >
                <TrendingDown className="h-3 w-3 mr-1" />
                Out
              </Button>
            </div>
          </div>

          {/* ── Data Table ── */}
          <Card className="border-none shadow-sm rounded overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-100 border-b">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 py-0 text-[12px] font-bold uppercase text-slate-600">
                    Code
                  </TableHead>
                  <TableHead className="h-9 py-0 text-[12px] font-bold uppercase text-slate-600">
                    Name
                  </TableHead>
                  <TableHead className="h-9 py-0 text-[12px] font-bold uppercase text-slate-600">
                    Category
                  </TableHead>
                  <TableHead className="h-9 py-0 text-[12px] font-bold uppercase text-slate-600 text-right">
                    Qty
                  </TableHead>
                  <TableHead className="h-9 py-0 text-[12px] font-bold uppercase text-slate-600 text-right">
                    Cost
                  </TableHead>
                  <TableHead className="h-9 py-0 text-[12px] font-bold uppercase text-slate-600">
                    Status
                  </TableHead>
                  <TableHead className="h-9 py-0 text-[12px] font-bold uppercase text-slate-600 text-center">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white">
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <ViewIcon className="h-8 w-8 mb-2 opacity-50" />
                        <p className="text-sm font-medium">
                          No{" "}
                          {viewMode === "all"
                            ? "items"
                            : viewMode + " stock items"}{" "}
                          found
                        </p>
                        <p className="text-xs mt-1">
                          {viewMode !== "all" &&
                            "Try switching to 'All Items' view"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const totalQty = getTotalQuantity(item);
                    const lowStock = isItemLowStock(item);
                    const outOfStock = isItemOutOfStock(item);

                    return (
                      <TableRow
                        key={item.id}
                        className={`hover:bg-sky-50/30 border-b border-slate-100 last:border-0 group ${
                          lowStock ? "bg-orange-50/30" : ""
                        } ${outOfStock ? "bg-red-50/30" : ""}`}
                      >
                        <TableCell className="py-1 text-[12px] text-sky-700 font-bold">
                          {item.itemCode}
                        </TableCell>
                        <TableCell className="py-1">
                          <div className="font-semibold text-xs text-slate-700">
                            {item.name}
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {item.category?.name || "Uncategorized"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <span
                            className={`text-sm font-bold ${
                              outOfStock
                                ? "text-red-600"
                                : lowStock
                                  ? "text-orange-600"
                                  : "text-slate-700"
                            }`}
                          >
                            {totalQty}
                          </span>
                          <span className="text-[12px] text-slate-400 ml-1">
                            {UOM_LABELS[item.unit as keyof typeof UOM_LABELS] ||
                              item.unit}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-right text-xs font-medium">
                          {formatCurrency(item.unitCost)}
                        </TableCell>
                        <TableCell className="py-2">
                          {outOfStock ? (
                            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#f8d7da] border border-[#f5c6cb] rounded text-[11px] text-[#721c24]">
                              <TrendingDown className="h-3 w-3 flex-shrink-0" />
                              <span className="font-semibold">
                                Out of Stock
                              </span>
                            </div>
                          ) : lowStock ? (
                            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#fff3cd] border border-[#ffeeba] rounded text-[11px] text-[#856404]">
                              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                              <span className="font-semibold">Low Stock</span>
                              <span className="text-[#b38600] hidden sm:inline">
                                — {totalQty} &lt; {item.minQuantity}
                              </span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-800">
                              <Boxes className="h-3 w-3 flex-shrink-0" />
                              <span className="font-semibold">In Stock</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              className="h-7 w-7 bg-sky-500 hover:bg-sky-600 text-white shadow-sm"
                              onClick={() => navigate(`/inventory/${item.id}`)}
                            >
                              <Eye className="h-3.5 w-3.5 stroke-[3px]" />
                            </Button>
                            <Button
                              size="icon"
                              className="h-7 w-7 bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                              onClick={() =>
                                navigate(`/inventory/${item.id}/edit`)
                              }
                            >
                              <Edit className="h-3.5 w-3.5 stroke-[3px]" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="bg-slate-50 px-4 py-2 flex items-center justify-between border-t text-[11px]">
              <span className="text-slate-500">
                Showing {items.length} of {displayMeta.total}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-7 text-[12px]"
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={page === displayMeta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-7 text-[10px]"
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
