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

const API_BASE = "http://localhost:3001/stock-logs";

const getAuthHeaders = () => {
  const token =
    localStorage.getItem("accessToken") || localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const api = {
  list: (params: Record<string, any> = {}): Promise<StockLogResponse> => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "" && v !== null)
        .map(([k, v]) => [k, String(v)]),
    ).toString();

    return fetch(`${API_BASE}?${qs}`, {
      headers: getAuthHeaders(),
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
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
  PURCHASE_RECEIPT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  USAGE: "bg-rose-50 text-rose-700 border-rose-200",
  ADJUSTMENT_IN: "bg-sky-50 text-sky-700 border-sky-200",
  ADJUSTMENT_OUT: "bg-orange-50 text-orange-700 border-orange-200",
  WASTE: "bg-red-50 text-red-700 border-red-200",
  TRANSFER_IN: "bg-blue-50 text-blue-700 border-blue-200",
  TRANSFER_OUT: "bg-indigo-50 text-indigo-700 border-indigo-200",
  SALE: "bg-purple-50 text-purple-700 border-purple-200",
  RETURN_IN: "bg-green-50 text-green-700 border-green-200",
  RETURN_TO_SUPPLIER: "bg-gray-50 text-gray-700 border-gray-200",
  OPENING_BALANCE: "bg-yellow-50 text-yellow-700 border-yellow-200",
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
        <span className="font-mono text-xs font-semibold text-sky-700 bg-sky-50 px-0.5 py-0.5 rounded border border-sky-100">
          {row.original.ledgerCode}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Date & Time",
      cell: ({ row }) => (
        <div className="text-slate-600 text-xs">
          <div className="font-medium text-slate-900">
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

        if (!item?.name) return <span className="text-slate-400 italic">N/A</span>;

        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                         <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="font-mono text-xs text-slate-500">{item.itemCode}</span>

              {/* <Badge
                variant="secondary"
                className="px-1 py-0 h-4 text-[9px] bg-slate-100 text-slate-600 border-none"
              >
                {log.itemType}
              </Badge>  */}
              <span className="text-slate-400">|</span>
              <span className="text-slate-500 uppercase font-medium">
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
        <span className="text-slate-700 font-medium">
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
          return <span className="text-slate-400 italic">—</span>;
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
              "bg-slate-50 text-slate-700 border-slate-200"
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
        <div className="text-left pl-2 font-mono font-bold text-slate-900">
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
            className={`font-bold text-left pl-2 ${change > 0 ? "text-left text-emerald-600" : change < 0 ? "text-left text-rose-600" : "text-left text-slate-400"}`}
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
        <div className="text-left font-mono font-bold text-slate-900 pl-2">
          {row.original.quantityAfter}
        </div>
      ),
    },
    {
      accessorKey: "unitCost",
      header: "Unit Cost",
      cell: ({ row }) => (
        <span className="text-slate-600 font-medium">
          {Number(row.original.unitCost).toLocaleString()}{" "}
          <small className="text-[10px] text-slate-400">UGX</small>
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
      <section className="bg-white border-b border-slate-200 px-1 py-1 mb-1">
        <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">
              Stock Ledger
            </h1>
            {/* <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
              <Home className="h-3.5 w-3.5" />
              <span>Dashboard</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-sky-600 font-medium">Stock Logs</span>
            </div> */}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              onClick={fetchLogs}
              disabled={loading}
              className="bg-white border-sky-200 text-sky-700 hover:bg-sky-50"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button className="bg-sky-600 hover:bg-sky-700 shadow-md">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </section>

      <div className="px-1 md:px-1 max-w-screen-2xl mx-auto space-y-6">
        {/* Filters Box */}
        <Card className="border-none shadow-sm border-t-4 border-t-sky-500 rounded-t-sm">
          <CardHeader className="py-1 px-1 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Search className="h-4 w-4" /> Search Filters
            </CardTitle>
            {(search || itemType || transactionType || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
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
                className="border-slate-200 focus-visible:ring-sky-500 h-9"
              />

              <Select
                value={itemType}
                onValueChange={(v: any) => {
                  setItemType(v === "ALL" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 border-slate-200 focus:ring-sky-500">
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
                <SelectTrigger className="h-9 border-slate-200">
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
                <SelectTrigger className="h-9 border-slate-200">
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
                    className="h-9 w-full justify-start text-left font-normal border-slate-200 text-slate-600"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-sky-500" />
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
                    className="h-9 w-full justify-start text-left font-normal border-slate-200 text-slate-600"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-sky-500" />
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
                      className="border-b border-slate-200"
                    >
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className="text-left h-12 text-[11px] font-bold text-slate-600 uppercase tracking-wider "
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
                        <div className="flex flex-col items-start text-sky-600">
                          <Loader2 className="h-10 w-10 animate-spin mb-2" />
                          <span className="text-sm font-medium text-slate-500">
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
                          <PackageX className="h-12 w-12 text-slate-200 mb-3" />
                          <p className="text-slate-500 font-medium">
                            No stock movements found.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="hover:bg-sky-50/30 border-b border-slate-100 transition-colors"
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
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white border-t border-slate-100 gap-4">
              <div className="text-sm text-slate-500">
                Showing{" "}
                <span className="font-bold text-slate-700">
                  {(page - 1) * limit + 1}
                </span>{" "}
                to{" "}
                <span className="font-bold text-slate-700">
                  {Math.min(page * limit, total)}
                </span>{" "}
                of <span className="font-bold text-slate-700">{total}</span>{" "}
                entries
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="h-8 border-slate-200 px-4 hover:bg-sky-50 hover:text-sky-700"
                >
                  Previous
                </Button>
                <div className="flex items-center justify-center bg-sky-600 text-white text-xs font-bold w-8 h-8 rounded shadow-inner">
                  {page}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * limit >= total || loading}
                  className="h-8 border-slate-200 px-4 hover:bg-sky-50 hover:text-sky-700"
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
