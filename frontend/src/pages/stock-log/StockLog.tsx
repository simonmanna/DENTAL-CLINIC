"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  Download,
  RefreshCw,
  Search,
  FilterX,
  Loader2,
  PackageX,
  ChevronRight,
  Home,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
  SortingState,
} from "@tanstack/react-table";

import type { StockLog, StockLogResponse } from "@/types/stock-log";

import { api as sharedApi } from '@/lib/api/client';

const api = {
  list: (params: Record<string, any> = {}): Promise<StockLogResponse> => {
    const cleanParams = Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '' && v !== null)
    );
    return sharedApi.get('/stock-logs', { params: cleanParams }).then(r => r.data);
  },
};

type StockLogTransactionType =
  | "PURCHASE_RECEIPT"
  | "USAGE"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "WASTE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "SALE"
  | "RETURN_IN"
  | "RETURN_TO_SUPPLIER"
  | "OPENING_BALANCE"
  | "EXPIRY_WRITE_OFF";

const transactionTypeColors: Record<string, string> = {
  PURCHASE_RECEIPT: "bg-success-muted/60 text-success border-success/25",
  USAGE: "bg-danger-muted/60 text-danger border-danger/25",
  ADJUSTMENT_IN: "bg-primary-muted/60 text-primary border-primary/25",
  ADJUSTMENT_OUT: "bg-warning-muted/60 text-warning border-warning/25",
  WASTE: "bg-danger-muted/60 text-danger border-danger/25",
  TRANSFER_IN: "bg-primary-muted/60 text-primary border-primary/25",
  TRANSFER_OUT: "bg-indigo-50 text-indigo-700 border-indigo-200",
  SALE: "bg-purple-50 text-purple-700 border-purple-200",
  RETURN_IN: "bg-success-muted/60 text-success border-success/25",
  RETURN_TO_SUPPLIER: "bg-muted/50 text-foreground border-border",
  OPENING_BALANCE: "bg-warning-muted/60 text-warning border-warning/25",
  EXPIRY_WRITE_OFF: "bg-pink-50 text-pink-700 border-pink-200",
};

export default function StockLogPage() {
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState<"INVENTORY" | "DRUG" | "">("");
  const [transactionType, setTransactionType] = useState<
    StockLogTransactionType | ""
  >("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        limit,
        sortBy: sorting[0]?.id || "createdAt",
        sortOrder: sorting[0]?.desc ? "desc" : "asc",
      };

      if (search) params.search = search;
      if (itemType) params.itemType = itemType;
if (transactionType) {
  params.type = transactionType;  // Preferred
  params.transactionType = transactionType;  // Fallback
}
      if (dateFrom) params.dateFrom = dateFrom.toISOString().split("T")[0];
      if (dateTo) params.dateTo = dateTo.toISOString().split("T")[0];

      const result = await api.list(params);
      setLogs(result.data);
      console.log(result.data);
      setTotal(result.meta.total);
    } catch (error: any) {
      console.error("Failed to fetch stock logs:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, itemType, transactionType, dateFrom, dateTo, sorting]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
  if (logs.length > 0) {
    console.log('📋 First log entry:', {
      hasType: 'type' in logs[0],
      hasTransactionType: 'transactionType' in logs[0],
      type: logs[0].type,
      transactionType: (logs[0] as any).transactionType,
    });
  }
}, [logs]);

  const clearFilters = () => {
    setSearch("");
    setItemType("");
    setTransactionType("");
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(1);
  };

  const columns: ColumnDef<StockLog>[] = [
    {
      accessorKey: "ledgerCode",
      header: "Log Code",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-primary bg-primary-muted/60 px-0.5 py-0.5 rounded border border-primary/20">
          {row.original.ledgerCode}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Date & Time",
      cell: ({ row }) => (
        <div className="text-muted-foreground text-xs">
          <div className="font-medium text-foreground">
            {format(new Date(row.original.createdAt), "dd MMM yyyy")}
          </div>
          <div>{format(new Date(row.original.createdAt), "HH:mm:ss")}</div>
        </div>
      ),
    },
    {
      id: "item",
      header: "Item Details",
      cell: ({ row }) => {
        const log = row.original;
        const item = row.original.item;

        if (!item?.name) return <span className="text-muted-foreground/70 italic">N/A</span>;

        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-foreground text-sm">{item.name}</span>
                         <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="font-mono text-xs text-muted-foreground">{item.itemCode}</span>

              {/* <Badge
                variant="secondary"
                className="px-1 py-0 h-4 text-[9px] bg-muted text-muted-foreground border-none"
              >
                {log.itemType}
              </Badge>  */}
              <span className="text-muted-foreground/70">|</span>
              <span className="text-muted-foreground uppercase font-medium">
                {item.uom}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "location.name",
      header: "Location",
      cell: ({ row }) => (
        <span className="text-foreground font-medium">
          {row.original.location?.name || "-"}
        </span>
      ),
    },
    {
      accessorKey: "type", // ✅ Changed from "transactionType"
      header: "Type",
      cell: ({ row }) => {
        const log = row.original;
        const type = log.type; // ✅ Use 'type' instead of 'transactionType'

        // ✅ Safe fallback if type is undefined
        if (!type) {
          return <span className="text-muted-foreground/70 italic">—</span>;
        }

        // ✅ Format for display: "PURCHASE_RECEIPT" → "Purchase Receipt"
        const displayType = type
          .split("_")
          .map((word, i) =>
            i === 0
              ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
              : word.toLowerCase(),
          )
          .join(" ");

        return (
          <Badge
            variant="outline"
            className={`font-semibold shadow-sm ${
              transactionTypeColors[type] ??
              "bg-muted/50 text-foreground border-border"
            }`}
          >
            {displayType}
          </Badge>
        );
      },
    },
    // {
    //   accessorKey: "type",
    //   header: "Type",
    //   cell: ({ row }) => (
    //     <Badge
    //       variant="outline"
    //       className={`capitalize font-semibold shadow-sm ${
    //         transactionTypeColors[row.original.transactionType as StockLogTransactionType]
    //       }`}
    //     >
    //       {row.original.transactionType.toLowerCase().replace("_", " ")}
    //     </Badge>
    //   ),
    // },
    {
      accessorKey: "quantityBefore",
      header: "Quantity Before",
      cell: ({ row }) => (
        <div className="text-left pl-2 font-mono font-bold text-foreground">
          {row.original.quantityBefore}
        </div>
      ),
    },
    {
      accessorKey: "quantityChange",
      header: "Qty Change",
      cell: ({ row }) => {
        const change = row.original.quantityChange;
        return (
          <div
            className={`font-bold text-left pl-2 ${change > 0 ? "text-left text-success" : change < 0 ? "text-left text-danger" : "text-left text-muted-foreground/70"}`}
          >
            {change > 0 ? "+" : ""}
            {change}
          </div>
        );
      },
    },
    {
      accessorKey: "quantityAfter",
      header: "Final Stock",
      cell: ({ row }) => (
        <div className="text-left font-mono font-bold text-foreground pl-2">
          {row.original.quantityAfter}
        </div>
      ),
    },
    {
      accessorKey: "unitCost",
      header: "Unit Cost",
      cell: ({ row }) => (
        <span className="text-muted-foreground font-medium">
          {Number(row.original.unitCost).toLocaleString()}{" "}
          <small className="text-[10px] text-muted-foreground/70">UGX</small>
        </span>
      ),
    },
  ];

  const table = useReactTable({
    data: logs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / limit),
    state: { pagination: { pageIndex: page - 1, pageSize: limit }, sorting },
    onSortingChange: setSorting,
    manualSorting: true,
  });

  return (
    <div className="min-h-screen bg-[#f4f6f9] pb-8 font-sans">
      {/* AdminLTE Content Header */}
      <section className="bg-white border-b border-border px-1 py-1 mb-1">
        <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Stock Ledger
            </h1>
            {/* <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <Home className="h-3.5 w-3.5" />
              <span>Dashboard</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-primary font-medium">Stock Logs</span>
            </div> */}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              onClick={fetchLogs}
              disabled={loading}
              className="bg-white border-primary/25 text-primary hover:bg-primary-muted/60"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button className="bg-primary hover:bg-primary shadow-md">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </section>

      <div className="px-1 md:px-1 max-w-screen-2xl mx-auto space-y-6">
        {/* Filters Box */}
        <Card className="border-none shadow-sm border-t-4 border-t-sky-500 rounded-t-sm">
          <CardHeader className="py-1 px-1 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Search className="h-4 w-4" /> Search Filters
            </CardTitle>
            {(search || itemType || transactionType || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 text-danger hover:text-danger hover:bg-danger-muted/60"
              >
                <FilterX className="h-3.5 w-3.5 mr-1" /> Reset
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Input
                placeholder="Log Code / Item Name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="border-border focus-visible:ring-primary/60 h-9"
              />

              <Select
                value={itemType}
                onValueChange={(v: any) => {
                  setItemType(v === "ALL" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 border-border focus:ring-primary/60">
                  <SelectValue placeholder="All Item Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Items</SelectItem>
                  <SelectItem value="INVENTORY">Inventory</SelectItem>
                  <SelectItem value="DRUG">Drugs / Medications</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={transactionType}
                onValueChange={(v: any) => {
                  setTransactionType(v === "ALL" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 border-border">
                  <SelectValue placeholder="All Transactions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Transactions</SelectItem>
                  {/* ✅ Updated options to match StockLedgerType enum */}
                  {[
                    "PURCHASE_RECEIPT",
                    "USAGE",
                    "ADJUSTMENT_IN",
                    "ADJUSTMENT_OUT",
                    "WASTE",
                    "TRANSFER_IN",
                    "TRANSFER_OUT",
                    "SALE",
                    "RETURN_IN",
                    "RETURN_TO_SUPPLIER",
                    "OPENING_BALANCE",
                    "EXPIRY_WRITE_OFF",
                  ].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t
                        .replace(/_/g, " ")
                        .toLowerCase()
                        .split(" ")
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(" ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* <Select
                value={transactionType}
                onValueChange={(v: any) => {
                  setTransactionType(v === "ALL" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 border-border">
                  <SelectValue placeholder="All Transactions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Transactions</SelectItem>
                  {[
                    "PURCHASE_RECEIPT",
                    "USAGE",
                    "ADJUSTMENT",
                    "WASTE",
                    "TRANSFER",
                    "RETURN",
                  ].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select> */}

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 w-full justify-start text-left font-normal border-border text-muted-foreground"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "From Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 w-full justify-start text-left font-normal border-border text-muted-foreground"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "To Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Data Table Box */}
        <Card className="border-none shadow-md border-t-4 border-t-blue-600 rounded-t-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-[#f8fafc]">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className="border-b border-border"
                    >
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className="text-left h-12 text-[11px] font-bold text-muted-foreground uppercase tracking-wider "
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody className="bg-white">
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-72 text-left"
                      >
                        <div className="flex flex-col items-start text-primary">
                          <Loader2 className="h-10 w-10 animate-spin mb-2" />
                          <span className="text-sm font-medium text-muted-foreground">
                            Processing Ledger Data...
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-72 text-left"
                      >
                        <div className="flex items-start flex-col text-left py-2">
                          <PackageX className="h-12 w-12 text-muted-foreground/40 mb-3" />
                          <p className="text-muted-foreground font-medium">
                            No stock movements found.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="hover:bg-primary-muted/30 border-b border-border/60 transition-colors"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="text-left">
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

            {/* AdminLTE style Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white border-t border-border/60 gap-4">
              <div className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-bold text-foreground">
                  {(page - 1) * limit + 1}
                </span>{" "}
                to{" "}
                <span className="font-bold text-foreground">
                  {Math.min(page * limit, total)}
                </span>{" "}
                of <span className="font-bold text-foreground">{total}</span>{" "}
                entries
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="h-8 border-border px-4 hover:bg-primary-muted/60 hover:text-primary"
                >
                  Previous
                </Button>
                <div className="flex items-center justify-center bg-primary text-white text-xs font-bold w-8 h-8 rounded shadow-inner">
                  {page}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * limit >= total || loading}
                  className="h-8 border-border px-4 hover:bg-primary-muted/60 hover:text-primary"
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

