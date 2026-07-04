import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Package,
  MapPin,
  ArrowRightLeft,
  FileText,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Activity,
  ShoppingCart,
  Stethoscope,
  RefreshCw,
  PowerOff,
  MoreHorizontal,
  Clock,
  ChevronRight,
  TrendingUp,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  inventoryApi,
  InventoryItem,
  UOM_LABELS,
  getTotalQuantity,
  isItemLowStock,
  isItemOutOfStock,
} from "../../lib/api/inventory.api";

// ─── AdminLTE Color Constants ─────────────────────────────────────────────

const COLORS = {
  primary: "#3c8dbc",
  primaryLight: "#5dade2",
  primaryDark: "#367fa9",
  primaryFaint: "#ebf5fb",
  success: "#00a65a",
  warning: "#f39c12",
  danger: "#dd4b39",
  info: "#00c0ef",
  pageBg: "#f4f6f9",
  cardBg: "#ffffff",
  headerBg: "#f8fafc",
  subtleBg: "#f4f8fb",
  borderLight: "#e3e8ec",
  borderMedium: "#d2d6de",
  textPrimary: "#2c3e50",
  textSecondary: "#546e7a",
  textMuted: "#90a4ae",
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(v: number) {
  return `UGX ${v.toLocaleString("en-UG", { minimumFractionDigits: 0 })}`;
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StockStatusBanner({ item }: { item: InventoryItem }) {
  // ✅ Use helper functions instead of direct property access
  const totalQty = getTotalQuantity(item);
  const lowStock = isItemLowStock(item);
  const outOfStock = isItemOutOfStock(item);

  if (outOfStock)
    return (
      <div className="flex items-center gap-2 px-1 py-1 bg-[#f8d7da] border border-[#f5c6cb] rounded-lg text-sm text-[#721c24]">
        <TrendingDown className="h-4 w-4 flex-shrink-0" />
        <span className="font-semibold">Out of Stock</span>
        <span className="text-[#a94442]">
          — Current quantity is 0. Create a purchase order to restock.
        </span>
      </div>
    );

  if (lowStock)
    return (
      <div className="flex items-center gap-0 px-1 py-1 my-1 bg-[#fff3cd] border border-[#ffeeba] rounded-lg text-sm text-[#856404]">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span className="font-semibold">Low Stock</span>
        <span className="text-[#b38600]">
          — Quantity ({totalQty}) is below minimum ({item.minQuantity}).
        </span>
      </div>
    );

  return null;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start py-2.5 gap-4">
      <dt className="w-36 flex-shrink-0 text-xs text-[#90a4ae] font-semibold pt-0.5 uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-[#2c3e50] flex-1">
        {value ?? <span className="text-[#90a4ae]">—</span>}
      </dd>
    </div>
  );
}

// ─── Transaction Type Pill ─────────────────────────────────────────────────

const TXN_COLORS: Record<string, { bg: string; text: string; label: string }> =
{
  PURCHASE: { bg: "bg-[#ebf5fb]", text: "text-[#3c8dbc]", label: "Purchase" },
  PURCHASE_RECEIPT: {
    bg: "bg-[#ebf5fb]",
    text: "text-[#3c8dbc]",
    label: "Receipt",
  },
  USAGE: { bg: "bg-[#f3e5f5]", text: "text-[#8e24aa]", label: "Usage" },
  ADJUSTMENT: {
    bg: "bg-[#fff3cd]",
    text: "text-[#856404]",
    label: "Adjustment",
  },
  RETURN: { bg: "bg-[#d4edda]", text: "text-[#155724]", label: "Return" },
  EXPIRED: { bg: "bg-[#f8d7da]", text: "text-[#721c24]", label: "Expired" },
  DAMAGED: { bg: "bg-[#f8d7da]", text: "text-[#721c24]", label: "Damaged" },
  WASTE: { bg: "bg-[#f8d7da]", text: "text-[#721c24]", label: "Waste" },
  TRANSFER: { bg: "bg-[#eceff1]", text: "text-[#546e7a]", label: "Transfer" },
};

function TxnTypePill({ type }: { type: string }) {
  const c = TXN_COLORS[type] ?? {
    bg: "bg-[#f4f6f9]",
    text: "text-[#546e7a]",
    label: type,
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

// ─── PO Status Badge ──────────────────────────────────────────────────────

function PoStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-[#eceff1] text-[#546e7a]",
    SUBMITTED: "bg-[#ebf5fb] text-[#3c8dbc]",
    APPROVED: "bg-[#d4edda] text-[#155724]",
    PARTIALLY_RECEIVED: "bg-[#fff3cd] text-[#856404]",
    FULLY_RECEIVED: "bg-[#d4edda] text-[#155724]",
    CANCELLED: "bg-[#f8d7da] text-[#721c24]",
  };
  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded text-xs font-semibold ${map[status] ?? "bg-[#f4f6f9] text-[#546e7a]"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Tab: Overview (Details) ──────────────────────────────────────────────

function TabOverview({ item }: { item: InventoryItem }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Core Details */}
      <Card className="border-[#e3e8ec] shadow-sm bg-white">
        <CardHeader className="pb-2 pt-4 px-5 bg-[#f8fafc] border-b border-[#e3e8ec] rounded-t-lg">
          <CardTitle className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
            Item Details
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <dl className="divide-y divide-[#e3e8ec]/60">
            <InfoRow
              label="Item Code"
              value={
                <code className="text-xs bg-[#f4f6f9] px-2 py-0.5 rounded font-mono text-[#3c8dbc] font-semibold">
                  {item.itemCode}
                </code>
              }
            />
            <InfoRow
              label="Name"
              value={
                <span className="font-semibold text-[#2c3e50]">
                  {item.name}
                </span>
              }
            />
            <InfoRow label="Description" value={item.description} />
            <InfoRow
              label="Category"
              value={
                item.category ? (
                  <span className="inline-flex items-center gap-1.5">
                    {item.category.color && (
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: item.category.color }}
                      />
                    )}
                    {item.category.parent && (
                      <>
                        <span className="text-[#90a4ae]">
                          {item.category.parent.name}
                        </span>
                        <ChevronRight className="h-3 w-3 text-[#90a4ae]" />
                      </>
                    )}
                    <span className="font-semibold text-[#2c3e50]">
                      {item.category.name}
                    </span>
                  </span>
                ) : null
              }
            />
            <InfoRow
              label="Type"
              value={
                item.type ? (
                  <span className="inline-flex items-center gap-1.5">
                   {item.type}
                  </span>
                ) : null
              }
            />
            <InfoRow label="Unit Label" value={item.unit} />
            <InfoRow
              label="Standard UOM"
              value={
                <span className="flex items-center gap-1.5">
                  <code className="text-xs bg-[#f4f6f9] px-1.5 py-0.5 rounded font-mono text-[#3c8dbc] font-semibold">
                    {item.uom}
                  </code>
                  <span className="text-[#90a4ae] text-xs">
                    {UOM_LABELS[item.uom]}
                  </span>
                </span>
              }
            />
            <InfoRow
              label="Status"
              value={
                item.isActive ? (
                  <Badge
                    variant="outline"
                    className="border-[#00a65a] text-[#00a65a] bg-[#d4edda] text-xs font-semibold"
                  >
                    Active
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-[#90a4ae] text-[#90a4ae] text-xs"
                  >
                    Inactive
                  </Badge>
                )
              }
            />
            <InfoRow
              label="Batch Tracking"
              value={
                item.batchTracking ? (
                  <Badge className="bg-[#d4edda] text-[#155724] border-[#c3e6cb] text-xs">
                    Enabled
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-[#90a4ae]">
                    Disabled
                  </Badge>
                )
              }
            />
            <InfoRow label="Primary Location" value={item.locationStocks?.[0]?.location.name ?? "—"} />
          </dl>
        </CardContent>
      </Card>

      {/* Right: Stock & Financials */}
      <div className="space-y-4">
        <Card className="border-[#e3e8ec] shadow-sm bg-white">
          <CardHeader className="pb-2 pt-4 px-5 bg-[#f8fafc] border-b border-[#e3e8ec] rounded-t-lg">
            <CardTitle className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Stock Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-2 gap-4 mb-2 mt-3">
              <div className="p-3 bg-[#f4f6f9] rounded-lg border border-[#e3e8ec]/50">
                <p className="text-xs text-[#90a4ae] font-medium uppercase tracking-wide">
                  On Hand
                </p>
                <p
                  className={`text-2xl font-bold mt-0.5 ${isItemOutOfStock(item)
                      ? "text-[#dd4b39]"
                      : isItemLowStock(item)
                        ? "text-[#f39c12]"
                        : "text-[#2c3e50]"
                    }`}
                >
                  {getTotalQuantity(item).toLocaleString()}
                </p>
                <p className="text-xs text-[#90a4ae]">{item.unit}</p>
              </div>
              <div className="p-3 bg-[#f4f6f9] rounded-lg border border-[#e3e8ec]/50">
                <p className="text-xs text-[#90a4ae] font-medium uppercase tracking-wide">
                  Min. Level
                </p>
                <p className="text-2xl font-bold mt-0.5 text-[#2c3e50]">
                  {item.minQuantity.toLocaleString()}
                </p>
                <p className="text-xs text-[#90a4ae]">{item.unit}</p>
              </div>
            </div>
            <dl className="divide-y divide-[#e3e8ec]/60">
              <InfoRow label="Unit Cost" value={fmt(item.unitCost)} />
              <InfoRow
                label="Stock Value"
                value={
                  <span className="font-bold text-[#00a65a]">
                    {fmt(item.stockValue ?? 0)}
                  </span>
                }
              />
              <InfoRow label="Default Supplier" value={item.supplier?.name} />
            </dl>
          </CardContent>
        </Card>

        <Card className="border-[#e3e8ec] shadow-sm bg-white">
          <CardHeader className="pb-2 pt-4 px-5 bg-[#f8fafc] border-b border-[#e3e8ec] rounded-t-lg">
            <CardTitle className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Usage Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Transactions",
                  value: item._count?.transactions ?? 0,
                  icon: ArrowRightLeft,
                },
                {
                  label: "Locations",
                  value: item._count?.locationStocks ?? 0,
                  icon: MapPin,
                },
                {
                  label: "Procedures",
                  value: item._count?.procedureInputs ?? 0,
                  icon: Stethoscope,
                },
                {
                  label: "PO Lines",
                  value: item._count?.purchaseOrderItems ?? 0,
                  icon: ShoppingCart,
                },
              ].map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 p-3 bg-[#f4f6f9] rounded-lg border border-[#e3e8ec]/50"
                >
                  <div className="p-1.5 bg-[#ebf5fb] rounded-md">
                    <Icon className="h-4 w-4 text-[#3c8dbc]" />
                  </div>
                  <div>
                    <p className="text-lg font-bold leading-none text-[#2c3e50]">
                      {value}
                    </p>
                    <p className="text-xs text-[#90a4ae] mt-0.5 font-medium uppercase tracking-wide">
                      {label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <dl className="divide-y divide-[#e3e8ec]/60 mt-4">
              <InfoRow label="Created" value={fmtDate(item.createdAt)} />
              <InfoRow label="Last Updated" value={fmtDate(item.updatedAt)} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Stock Moves ─────────────────────────────────────────────────────

function TabStockMoves({ item }: { item: InventoryItem }) {
  const logs = item.stockLogs ?? [];

  if (logs.length === 0) {
    return (
      <Card className="border-[#e3e8ec] shadow-sm bg-white">
        <CardContent className="py-16 flex flex-col items-center text-[#90a4ae] gap-2">
          <ArrowRightLeft className="h-10 w-10 opacity-30" />
          <p className="font-semibold text-[#546e7a]">No stock movements yet</p>
          <p className="text-xs">
            Movements will appear here after purchases, adjustments, or usage
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#e3e8ec] shadow-sm bg-white">
      <CardHeader className="pb-2 pt-4 px-5 flex-row items-center justify-between bg-[#f8fafc] border-b border-[#e3e8ec] rounded-t-lg">
        <CardTitle className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
          Stock Movements
        </CardTitle>
        <p className="text-xs text-[#90a4ae] font-medium">
          {logs.length} records (last 100)
        </p>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow className="bg-[#f8fafc] hover:bg-[#f8fafc] border-b border-[#e3e8ec]">
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Date
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Type
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Location
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider text-right">
              Change
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider text-right">
              Before
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider text-right">
              After
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Batch
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Reference
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow
              key={log.id}
              className="hover:bg-[#f4f8fb] border-b border-[#e3e8ec]/50"
            >
              <TableCell className="text-xs text-[#90a4ae] whitespace-nowrap">
                {fmtDateTime(log.createdAt)}
              </TableCell>
              <TableCell>
                <TxnTypePill type={log.transactionType} />
              </TableCell>
              <TableCell className="text-sm text-[#2c3e50]">
                {log.location?.name ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={`font-bold text-sm ${log.quantityChange >= 0 ? "text-[#00a65a]" : "text-[#dd4b39]"}`}
                >
                  {log.quantityChange >= 0 ? "+" : ""}
                  {log.quantityChange.toLocaleString()}
                </span>
              </TableCell>
              <TableCell className="text-right text-sm text-[#90a4ae]">
                {log.quantityBefore.toLocaleString()}
              </TableCell>
              <TableCell className="text-right text-sm font-semibold text-[#2c3e50]">
                {log.quantityAfter.toLocaleString()}
              </TableCell>
              <TableCell className="text-xs text-[#90a4ae] font-mono">
                {log.batchNumber ?? "—"}
              </TableCell>
              <TableCell className="text-xs text-[#90a4ae]">
                {log.reference ?? log.notes ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ─── Tab: Locations & Qty ─────────────────────────────────────────────────

function TabLocations({ item }: { item: InventoryItem }) {
  const locations = item.locationStocks ?? [];

  const totalQty = locations.reduce((s, l) => s + l.quantity, 0);

  if (locations.length === 0) {
    return (
      <Card className="border-[#e3e8ec] shadow-sm bg-white">
        <CardContent className="py-16 flex flex-col items-center text-[#90a4ae] gap-2">
          <MapPin className="h-10 w-10 opacity-30" />
          <p className="font-semibold text-[#546e7a]">
            No location stock records
          </p>
          <p className="text-xs">
            Stock will be tracked per location once received via purchase orders
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 p-4 bg-white rounded-lg border border-[#e3e8ec] shadow-sm">
        <div>
          <p className="text-xs text-[#90a4ae] font-medium uppercase tracking-wide">
            Total Across All Locations
          </p>
          <p className="text-2xl font-bold text-[#2c3e50]">
            {totalQty.toLocaleString()}
          </p>
        </div>
        <Separator orientation="vertical" className="h-10 bg-[#e3e8ec]" />
        <div>
          <p className="text-xs text-[#90a4ae] font-medium uppercase tracking-wide">
            Total Locations
          </p>
          <p className="text-2xl font-bold text-[#2c3e50]">
            {locations.length}
          </p>
        </div>
        <Separator orientation="vertical" className="h-10 bg-[#e3e8ec]" />
        <div>
          <p className="text-xs text-[#90a4ae] font-medium uppercase tracking-wide">
            Stock Value
          </p>
          <p className="text-2xl font-bold text-[#00a65a]">
            {fmt(item.stockValue ?? 0)}
          </p>
        </div>
      </div>

      {/* Location cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {locations.map((ls) => {
          const pct =
            totalQty > 0 ? Math.round((ls.quantity / totalQty) * 100) : 0;
          const isLow = ls.quantity < ls.minQuantity;
          // ✅ Type assertions for missing properties
          const batchNumber = (ls as any).batchNumber;
          const expiryDate = (ls as any).expiryDate;
          return (
            <Card
              key={ls.id}
              className={`border shadow-sm ${isLow ? "border-[#f39c12] bg-[#fffbf0]" : "border-[#e3e8ec] bg-white"}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-1.5 rounded-lg ${isLow ? "bg-[#fff3cd]" : "bg-[#ebf5fb]"}`}
                    >
                      <MapPin
                        className={`h-3.5 w-3.5 ${isLow ? "text-[#f39c12]" : "text-[#3c8dbc]"}`}
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-[#2c3e50]">
                        {ls.location.name}
                      </p>
                      <p className="text-xs text-[#90a4ae] capitalize">
                        {ls.location.type.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                  {isLow && (
                    <Badge
                      variant="outline"
                      className="text-xs border-[#f39c12] text-[#f39c12] bg-[#fff3cd] font-semibold"
                    >
                      Low Stock
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="p-2 bg-[#f4f6f9] rounded border border-[#e3e8ec]/50">
                    <p className="text-xs text-[#90a4ae] font-medium uppercase tracking-wide">
                      On Hand
                    </p>
                    <p
                      className={`text-lg font-bold ${isLow ? "text-[#f39c12]" : "text-[#2c3e50]"}`}
                    >
                      {ls.quantity.toLocaleString()}
                    </p>
                    <p className="text-xs text-[#90a4ae]">{item.unit}</p>
                  </div>
                  <div className="p-2 bg-[#f4f6f9] rounded border border-[#e3e8ec]/50">
                    <p className="text-xs text-[#90a4ae] font-medium uppercase tracking-wide">
                      Minimum
                    </p>
                    <p className="text-lg font-bold text-[#2c3e50]">
                      {ls.minQuantity.toLocaleString()}
                    </p>
                    <p className="text-xs text-[#90a4ae]">{item.unit}</p>
                  </div>
                </div>

                {/* Stock bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-[#90a4ae]">
                    <span>{pct}% of total stock</span>
                    {batchNumber && (
                      <span className="font-mono">Batch: {batchNumber}</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-[#e3e8ec] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isLow ? "bg-[#f39c12]" : "bg-[#3c8dbc]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {expiryDate && (
                  <p className="text-xs text-[#90a4ae] mt-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Expires: {fmtDate(expiryDate)}
                  </p>
                )}
                <p className="text-xs text-[#90a4ae] mt-1 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Updated: {fmtDate(ls.updatedAt)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: Transactions ────────────────────────────────────────────────────

function TabTransactions({ item }: { item: InventoryItem }) {
  const txns = item.transactions ?? [];

  if (txns.length === 0) {
    return (
      <Card className="border-[#e3e8ec] shadow-sm bg-white">
        <CardContent className="py-16 flex flex-col items-center text-[#90a4ae] gap-2">
          <Activity className="h-10 w-10 opacity-30" />
          <p className="font-semibold text-[#546e7a]">No transactions yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#e3e8ec] shadow-sm bg-white">
      <CardHeader className="pb-2 pt-4 px-5 flex-row items-center justify-between bg-[#f8fafc] border-b border-[#e3e8ec] rounded-t-lg">
        <CardTitle className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
          Transaction History
        </CardTitle>
        <p className="text-xs text-[#90a4ae] font-medium">
          {txns.length} records
        </p>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow className="bg-[#f8fafc] hover:bg-[#f8fafc] border-b border-[#e3e8ec]">
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Date
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Type
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider text-right">
              Quantity
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider text-right">
              Unit Cost
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Batch
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Expiry
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Reference
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {txns.map((t) => (
            <TableRow
              key={t.id}
              className="hover:bg-[#f4f8fb] border-b border-[#e3e8ec]/50"
            >
              <TableCell className="text-xs text-[#90a4ae] whitespace-nowrap">
                {fmtDateTime(t.createdAt)}
              </TableCell>
              <TableCell>
                <TxnTypePill type={t.type} />
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={`font-bold text-sm ${t.quantity >= 0 ? "text-[#00a65a]" : "text-[#dd4b39]"}`}
                >
                  {t.quantity >= 0 ? "+" : ""}
                  {t.quantity.toLocaleString()}
                </span>
              </TableCell>
              <TableCell className="text-right text-sm text-[#2c3e50]">
                {t.unitCost ? fmt(t.unitCost) : "—"}
              </TableCell>
              <TableCell className="text-xs font-mono text-[#90a4ae]">
                {t.batchNumber ?? "—"}
              </TableCell>
              <TableCell className="text-xs text-[#90a4ae]">
                {fmtDate(t.expiryDate)}
              </TableCell>
              <TableCell className="text-xs text-[#90a4ae]">
                {t.reference ?? t.notes ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ─── Tab: Procedure Usage ─────────────────────────────────────────────────

function TabProcedures({ item }: { item: InventoryItem }) {
  const inputs = item.procedureInputs ?? [];

  if (inputs.length === 0) {
    return (
      <Card className="border-[#e3e8ec] shadow-sm bg-white">
        <CardContent className="py-16 flex flex-col items-center text-[#90a4ae] gap-2">
          <Stethoscope className="h-10 w-10 opacity-30" />
          <p className="font-semibold text-[#546e7a]">
            Not linked to any procedures
          </p>
          <p className="text-xs">
            Configure this item as an input in procedure settings
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#e3e8ec] shadow-sm bg-white">
      <CardHeader className="pb-2 pt-4 px-5 bg-[#f8fafc] border-b border-[#e3e8ec] rounded-t-lg">
        <CardTitle className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
          Procedure Inputs
        </CardTitle>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow className="bg-[#f8fafc] hover:bg-[#f8fafc] border-b border-[#e3e8ec]">
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Procedure
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Code
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider text-right">
              Qty / Use
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider text-right">
              Unit Cost
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Location
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Optional
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inputs.map((pi) => (
            <TableRow
              key={pi.id}
              className="hover:bg-[#f4f8fb] border-b border-[#e3e8ec]/50"
            >
              <TableCell className="font-semibold text-sm text-[#2c3e50]">
                {pi.procedure.name}
              </TableCell>
              <TableCell>
                {pi.procedure.code && (
                  <code className="text-xs bg-[#f4f6f9] px-1.5 py-0.5 rounded font-mono text-[#3c8dbc] font-semibold">
                    {pi.procedure.code}
                  </code>
                )}
              </TableCell>
              <TableCell className="text-right font-bold text-sm text-[#2c3e50]">
                {pi.quantityUsed}
              </TableCell>
              <TableCell className="text-right text-sm text-[#2c3e50]">
                {pi.unitCost ? fmt(pi.unitCost) : "—"}
              </TableCell>
              <TableCell className="text-sm text-[#90a4ae]">
                {pi.location?.name ?? "—"}
              </TableCell>
              <TableCell>
                {pi.isOptional ? (
                  <Badge
                    variant="outline"
                    className="text-xs border-[#90a4ae] text-[#90a4ae]"
                  >
                    Optional
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="text-xs bg-[#ebf5fb] text-[#3c8dbc] font-semibold"
                  >
                    Required
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ─── Tab: Purchase Orders ─────────────────────────────────────────────────

function TabPurchaseOrders({ item }: { item: InventoryItem }) {
  const poItems = item.purchaseOrderItems ?? [];

  if (poItems.length === 0) {
    return (
      <Card className="border-[#e3e8ec] shadow-sm bg-white">
        <CardContent className="py-16 flex flex-col items-center text-[#90a4ae] gap-2">
          <ShoppingCart className="h-10 w-10 opacity-30" />
          <p className="font-semibold text-[#546e7a]">
            No purchase orders found
          </p>
          <p className="text-xs">This item hasn't been ordered yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#e3e8ec] shadow-sm bg-white">
      <CardHeader className="pb-2 pt-4 px-5 flex-row items-center justify-between bg-[#f8fafc] border-b border-[#e3e8ec] rounded-t-lg">
        <CardTitle className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
          Purchase History
        </CardTitle>
        <p className="text-xs text-[#90a4ae] font-medium">
          {poItems.length} purchase lines
        </p>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow className="bg-[#f8fafc] hover:bg-[#f8fafc] border-b border-[#e3e8ec]">
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              PO Number
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Supplier
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Date
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Status
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider text-right">
              Ordered
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider text-right">
              Received
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider text-right">
              Unit Cost
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider text-right">
              Total
            </TableHead>
            <TableHead className="text-xs font-bold text-[#546e7a] uppercase tracking-wider">
              Batch
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {poItems.map((poi) => (
            <TableRow
              key={poi.id}
              className="hover:bg-[#f4f8fb] border-b border-[#e3e8ec]/50"
            >
              <TableCell>
                <code className="text-xs bg-[#f4f6f9] px-1.5 py-0.5 rounded font-mono font-bold text-[#3c8dbc]">
                  {poi.purchaseOrder.poNumber}
                </code>
              </TableCell>
              <TableCell className="text-sm text-[#2c3e50]">
                {poi.purchaseOrder.supplier.name}
              </TableCell>
              <TableCell className="text-xs text-[#90a4ae] whitespace-nowrap">
                {fmtDate(poi.purchaseOrder.createdAt)}
              </TableCell>
              <TableCell>
                <PoStatusBadge status={poi.purchaseOrder.status} />
              </TableCell>
              <TableCell className="text-right font-bold text-sm text-[#2c3e50]">
                {poi.quantityOrdered.toLocaleString()}
              </TableCell>
              <TableCell className="text-right text-sm">
                <span
                  className={
                    poi.quantityReceived < poi.quantityOrdered
                      ? "text-[#f39c12] font-bold"
                      : "text-[#00a65a] font-bold"
                  }
                >
                  {poi.quantityReceived.toLocaleString()}
                </span>
              </TableCell>
              <TableCell className="text-right text-sm text-[#2c3e50]">
                {fmt(poi.unitCost)}
              </TableCell>
              <TableCell className="text-right font-bold text-sm text-[#2c3e50]">
                {fmt(poi.total)}
              </TableCell>
              <TableCell className="text-xs font-mono text-[#90a4ae]">
                {poi.batchNumber ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DETAIL PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function InventoryDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchItem = async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      const data = await inventoryApi.getItem(id);
      setItem(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchItem();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 space-y-4 bg-[#f4f6f9] min-h-screen">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex items-center justify-center h-64 text-[#90a4ae] bg-[#f4f6f9]">
        <div className="text-center">
          <Package className="h-12 w-12 opacity-30 mx-auto mb-2" />
          <p className="text-[#546e7a] font-semibold">Item not found</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview", icon: FileText, count: null },
    {
      id: "stock-moves",
      label: "Stock Moves",
      icon: ArrowRightLeft,
      count: item.stockLogs?.length,
    },
    {
      id: "locations",
      label: "Locations & Qty",
      icon: MapPin,
      count: item._count?.locationStocks,
    },
    {
      id: "transactions",
      label: "Transactions",
      icon: Activity,
      count: item._count?.transactions,
    },
    {
      id: "procedures",
      label: "Procedure Usage",
      icon: Stethoscope,
      count: item._count?.procedureInputs,
    },
    {
      id: "purchases",
      label: "Purchase Orders",
      icon: ShoppingCart,
      count: item._count?.purchaseOrderItems,
    },
  ];

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-[#f4f6f9]">
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-[#e3e8ec] bg-white shadow-sm">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-[#90a4ae] mb-3">
            <button
              onClick={() => navigate("/inventory")}
              className="hover:text-[#3c8dbc] transition-colors font-medium"
            >
              Inventory
            </button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-[#2c3e50] font-semibold">{item.name}</span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/inventory")}
                className="h-8 w-8 flex-shrink-0 hover:bg-[#f4f6f9]"
              >
                <ArrowLeft className="h-4 w-4 text-[#546e7a]" />
              </Button>
              <div className="p-2 bg-[#ebf5fb] rounded-lg flex-shrink-0">
                <Package className="h-5 w-5 text-[#3c8dbc]" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-[#2c3e50]">
                    {item.name}
                  </h1>
                  <code className="text-xs bg-[#f4f6f9] px-2 py-0.5 rounded font-mono text-[#90a4ae] font-semibold">
                    {item.itemCode}
                  </code>
                  {!item.isActive && (
                    <Badge
                      variant="secondary"
                      className="text-xs bg-[#eceff1] text-[#546e7a] font-semibold"
                    >
                      Inactive
                    </Badge>
                  )}
                  {isItemOutOfStock(item) && (
                    <Badge
                      variant="destructive"
                      className="text-xs bg-[#dd4b39] text-white font-semibold"
                    >
                      Out of Stock
                    </Badge>
                  )}
                  {isItemLowStock(item) && !isItemOutOfStock(item) && (
                    <Badge
                      variant="outline"
                      className="text-xs border-[#f39c12] text-[#f39c12] bg-[#fff3cd] font-semibold"
                    >
                      Low Stock
                    </Badge>
                  )}
                </div>
                {item.category && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {item.category.color && (
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: item.category.color }}
                      />
                    )}
                    <span className="text-sm text-[#90a4ae]">
                      {item.category.parent
                        ? `${item.category.parent.name} › `
                        : ""}
                      {item.category.name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-[#e3e8ec] hover:bg-[#f4f6f9] hover:border-[#3c8dbc]"
                    onClick={fetchItem}
                    disabled={refreshing}
                  >
                    <RefreshCw
                      className={`h-4 w-4 text-[#546e7a] ${refreshing ? "animate-spin" : ""}`}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>

              <Button
                variant="outline"
                size="sm"
                className="border-[#3c8dbc] text-[#3c8dbc] hover:bg-[#ebf5fb] font-semibold"
                onClick={() => navigate(`/inventory/${id}/edit`)}
              >
                <Edit className="h-4 w-4 mr-1.5" />
                Edit
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-[#e3e8ec] hover:bg-[#f4f6f9]"
                  >
                    <MoreHorizontal className="h-4 w-4 text-[#546e7a]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-44 border-[#e3e8ec]"
                >
                  <DropdownMenuItem
                    onClick={() => navigate("/inventory/new")}
                    className="text-[#2c3e50] hover:bg-[#f4f8fb]"
                  >
                    <Package className="h-4 w-4 mr-2 text-[#3c8dbc]" /> New Item
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-[#e3e8ec]" />
                  <DropdownMenuItem
                    className="text-[#dd4b39] hover:bg-[#f8d7da]"
                    onClick={() =>
                      inventoryApi
                        .deactivate(item.id)
                        .then(() => navigate("/inventory"))
                    }
                  >
                    <PowerOff className="h-4 w-4 mr-2" /> Deactivate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Key metrics strip */}
          <div className="flex items-center gap-6 mt-1 pt-1 border-t border-[#e3e8ec]">
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-[#90a4ae] font-medium uppercase tracking-wide">
                Qty On Hand:
              </span>
              <span
                className={`font-bold text-sm ${getTotalQuantity(item) === 0 ? "text-[#dd4b39]" : item.isLowStock ? "text-[#f39c12]" : "text-[#00a65a]"}`}
              >
                {getTotalQuantity(item).toLocaleString()} {item.unit}
              </span>
            </div>
            <Separator orientation="vertical" className="h-4 bg-[#e3e8ec]" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#90a4ae] font-medium uppercase tracking-wide">
                Unit Cost:
              </span>
              <span className="font-semibold text-sm text-[#2c3e50]">
                {fmt(item.unitCost)}
              </span>
            </div>
            <Separator orientation="vertical" className="h-4 bg-[#e3e8ec]" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#90a4ae] font-medium uppercase tracking-wide">
                Stock Value:
              </span>
              <span className="font-bold text-sm text-[#00a65a]">
                {fmt(item.stockValue ?? 0)}
              </span>
            </div>
            <Separator orientation="vertical" className="h-4 bg-[#e3e8ec]" />
            {/* <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#90a4ae] font-medium uppercase tracking-wide">
                Supplier:
              </span>
              <span className="text-sm text-[#2c3e50] font-medium">
                {item.supplier?.name ?? "—"}
              </span>
            </div> */}

            {/* ── Stock Alert Banner ── */}
            {(getTotalQuantity(item) === 0 || item.isLowStock) && (
              <div className="px-2 pt-2">
                <StockStatusBanner item={item} />
              </div>
            )}

          </div>
        </div>


        {/* ── Tabs ── */}

        <div className="flex-1 overflow-auto">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="h-full flex flex-col"
          >
            {/* High-Fidelity AI Gradient Strip */}
            <div className="px-2 py-1 bg-gradient-to-r from-[#4285f4] via-[#4285f4] to-[#4285f4] rounded-xl shadow-lg sticky top-0 z-10 mx-2 mt-1 border border-white/10 backdrop-blur-md">
              <TabsList className="bg-transparent p-0 h-auto gap-2 rounded-none w-full justify-start border-none">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="
              relative px-4 py-2 rounded-lg text-sm font-medium text-white/80
              hover:bg-white/15 hover:text-white transition-all duration-300
              data-[state=active]:bg-white 
              data-[state=active]:text-indigo-600
              data-[state=active]:shadow-[0_4px_12px_rgba(0,0,0,0.15)]
              data-[state=active]:font-bold
              data-[state=active]:scale-105
            "
                  >
                    <span className="flex items-center gap-2">
                      <tab.icon
                        className={`h-4 w-4 ${activeTab === tab.id ? "text-indigo-600" : "text-white/70"}`}
                      />
                      <span className="hidden sm:inline">{tab.label}</span>

                      {tab.count !== null &&
                        tab.count !== undefined &&
                        tab.count > 0 && (
                          <span
                            className={`
                  ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tighter
                  ${activeTab === tab.id
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-white/20 text-white backdrop-blur-sm border border-white/20"
                              }
                `}
                          >
                            {tab.count}
                          </span>
                        )}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto py-2 px-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <TabsContent value="overview" className="mt-0 outline-none">
                <TabOverview item={item} />
              </TabsContent>
              <TabsContent value="stock-moves" className="mt-0 outline-none">
                <TabStockMoves item={item} />
              </TabsContent>
              <TabsContent value="locations" className="mt-0 outline-none">
                <TabLocations item={item} />
              </TabsContent>
              <TabsContent value="transactions" className="mt-0 outline-none">
                <TabTransactions item={item} />
              </TabsContent>
              <TabsContent value="procedures" className="mt-0 outline-none">
                <TabProcedures item={item} />
              </TabsContent>
              <TabsContent value="purchases" className="mt-0 outline-none">
                <TabPurchaseOrders item={item} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}
