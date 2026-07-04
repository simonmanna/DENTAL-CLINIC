"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Package,
  MapPin,
  ArrowRightLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { toast } from "sonner";

import type {
  StockTransfer,
  StockTransferStatus,
} from "@/types/stock-transfer";

import {
  listTransfers,
  completeTransfer,
  cancelTransfer,
  listLocations,
} from "../../services/stock-transfer.api";
import { STATUS_LABELS, STATUS_COLORS } from "@/types/stock-transfer";

const PER_PAGE = 20;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: StockTransferStatus }) {
  return (
    <Badge variant="outline" className={STATUS_COLORS[status]}>
      {status === "COMPLETED" && <CheckCircle2 className="h-3 w-3 mr-1" />}
      {status === "CANCELLED" && <XCircle className="h-3 w-3 mr-1" />}
      {status === "DRAFT" && <Clock className="h-3 w-3 mr-1" />}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export default function StockTransfersPage() {
  const navigate = useNavigate();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "" as StockTransferStatus | "",
    fromLocationId: "",
    toLocationId: "",
    search: "",
  });
  const [locations, setLocations] = useState<{ id: string; name: string }[]>(
    [],
  );

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTransfers({
        ...filters,
        page: meta.page,
        limit: PER_PAGE,
      });
      setTransfers(res.data);
      setMeta(res.meta);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to load transfers");
    } finally {
      setLoading(false);
    }
  }, [filters, meta.page]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  useEffect(() => {
    listLocations()
      .then(setLocations)
      .catch(() => {});
  }, []);

  async function handleComplete(id: string) {
    try {
      await completeTransfer(id);
      toast.success("Transfer completed successfully");
      fetchTransfers();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to complete transfer");
    }
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this transfer?")) return;
    try {
      await cancelTransfer(id);
      toast.success("Transfer cancelled");
      fetchTransfers();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to cancel transfer");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Stock Transfers
            </h1>
            <p className="text-xs text-slate-500">
              Move inventory between locations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTransfers}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            size="sm"
            className="bg-sky-600 hover:bg-sky-700"
            onClick={() => navigate("/stock-transfers/new")}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Transfer
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              Status
            </label>
            <Select
              value={filters.status || "ALL"}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  status: v === "ALL" ? "" : (v as StockTransferStatus),
                }))
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* <Select
              value={filters.status}
              onValueChange={(v) => setFilters((f) => ({ ...f, status: v as StockTransferStatus }))}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select> */}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              From Location
            </label>
            <Select
              value={filters.toLocationId || "ANY"}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  toLocationId: v === "ANY" ? "" : v,
                }))
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ANY">Any</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* <Select
              value={filters.fromLocationId || "ANY"}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  fromLocationId: v === "ANY" ? "" : v,
                }))
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ANY">Any</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select> */}
            {/* <Select
              value={filters.fromLocationId}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, fromLocationId: v }))
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select> */}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              To Location
            </label>
            <Select
              value={filters.toLocationId}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, toLocationId: v }))
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Any</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 flex-1 min-w-48">
            <label className="text-xs font-semibold text-slate-600">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Transfer code, notes..."
                className="pl-9"
                value={filters.search}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, search: e.target.value }))
                }
              />
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setFilters({
                status: "",
                fromLocationId: "",
                toLocationId: "",
                search: "",
              })
            }
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="p-6">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-14 bg-slate-100 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : transfers.length === 0 ? (
          <Card className="p-8 text-center">
            <Package className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-slate-700">No transfers found</p>
            <p className="text-sm text-slate-500 mt-1">
              Create your first transfer to get started
            </p>
          </Card>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Transfer</TableHead>
                  <TableHead>From → To</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => (
                  <TableRow
                    key={t.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => navigate(`/stock-transfers/${t.id}`)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-mono text-sm font-semibold text-slate-900">
                          {t.transferCode}
                        </p>
                        {t.notes && (
                          <p className="text-xs text-slate-500 truncate max-w-xs">
                            {t.notes}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-slate-700">
                          {t.fromLocation.name}
                        </span>
                        <ArrowRightLeft className="h-3 w-3 text-slate-400" />
                        <span className="text-slate-700">
                          {t.toLocation.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {fmtDate(t.transferDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {t._count?.items ?? t.items.length} items
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.status === "DRAFT" && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => handleComplete(t.id)}
                          >
                            Complete
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 text-xs"
                            onClick={() => handleCancel(t.id)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
            <p>
              Page {meta.page} of {meta.totalPages} ({meta.total} total)
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page === 1}
                onClick={() => setMeta((m) => ({ ...m, page: m.page - 1 }))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page === meta.totalPages}
                onClick={() => setMeta((m) => ({ ...m, page: m.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
