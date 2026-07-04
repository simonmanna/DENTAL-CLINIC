import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Plus,
  Search,
  Filter,
  RefreshCw,
  TrendingDown,
  Clock,
  CheckCircle2,
  Package,
  ChevronLeft,
  ChevronRight,
  Eye,
  BadgeCheck,
  XCircle,
  MapPin,
  Calendar,
  FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
// import { wasteApi, locationsApi } from '../../types/waste.types';
import { wasteApi, locationsApi } from "@/lib/api/waste.api";
import type {
  WasteRecord,
  WasteStats,
  Location,
  WasteCategory,
} from "../../types/waste.types";
import { WASTE_CATEGORY_META } from "../../types/waste.types";
import { WasteDetailDrawer } from "./components/WasteDetailDrawer";

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  colorClass, // e.g., 'bg-sky-500', 'bg-orange-400'
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  colorClass: string;
}) {
  return (
    <div
      className={`${colorClass} rounded-lg px-6 py-2 text-white shadow-sm relative overflow-hidden flex items-center justify-between min-h-[60px]`}
    >
      <div className="relative z-10">
        <h3 className="text-3xl font-bold leading-none">{value}</h3>
        <p className="text-xs font-bold uppercase mt-2 opacity-90 tracking-wider">
          {label}
        </p>
      </div>
      <Icon
        className="w-12 h-12 absolute right-2 opacity-20"
        strokeWidth={1.5}
      />
    </div>
  );
}

function CategoryBadge({ category }: { category: WasteCategory }) {
  const meta = WASTE_CATEGORY_META[category];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${meta.bg} ${meta.color}`}
    >
      <span>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ approved }: { approved: boolean }) {
  if (approved) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" />
        Approved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="w-3 h-3" />
      Pending
    </span>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function WasteRecordsPage() {
  const navigate = useNavigate();

  const [records, setRecords] = useState<WasteRecord[]>([]);
  const [stats, setStats] = useState<WasteStats | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterLocation, setFilterLocation] = useState("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Detail drawer
  const [selectedRecord, setSelectedRecord] = useState<WasteRecord | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Approve/Reject dialogs
  const [approveDialog, setApproveDialog] = useState<{
    open: boolean;
    record: WasteRecord | null;
  }>({ open: false, record: null });
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    record: WasteRecord | null;
  }>({ open: false, record: null });
  const [approveNotes, setApproveNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // ─── Load data ──────────────────────────────────────────────────────────────
  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const result = await wasteApi.list({
        search: search || undefined,
        category: filterCategory !== "ALL" ? filterCategory : undefined,
        status: filterStatus !== "ALL" ? filterStatus : undefined,
        locationId: filterLocation !== "ALL" ? filterLocation : undefined,
        page,
        limit: 15,
      });
      setRecords(result.data);
      setTotalPages(result.meta.totalPages);
      setTotal(result.meta.total);
    } catch {
      toast.error("Failed to load waste records");
    } finally {
      setLoading(false);
    }
  }, [search, filterCategory, filterStatus, filterLocation, page]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await wasteApi.stats(
        filterLocation !== "ALL" ? filterLocation : undefined,
      );
      setStats(s);
    } catch {
      /* silent */
    } finally {
      setStatsLoading(false);
    }
  }, [filterLocation]);

  useEffect(() => {
    locationsApi.list().then(setLocations).catch(console.error);
  }, []);

  useEffect(() => {
    const t = setTimeout(loadRecords, 300);
    return () => clearTimeout(t);
  }, [loadRecords]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ─── Actions ────────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!approveDialog.record) return;
    setActionLoading(true);
    try {
      await wasteApi.approve(approveDialog.record.id, approveNotes);
      toast.success("Waste record approved. Stock has been deducted.");
      setApproveDialog({ open: false, record: null });
      setApproveNotes("");
      loadRecords();
      loadStats();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve record");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectDialog.record || !rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    setActionLoading(true);
    try {
      await wasteApi.reject(rejectDialog.record.id, rejectReason);
      toast.success("Waste record rejected");
      setRejectDialog({ open: false, record: null });
      setRejectReason("");
      loadRecords();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to reject record");
    } finally {
      setActionLoading(false);
    }
  };

  const handleView = async (record: WasteRecord) => {
    try {
      const full = await wasteApi.get(record.id);
      setSelectedRecord(full);
      setDrawerOpen(true);
    } catch {
      toast.error("Failed to load record details");
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-sky-100 rounded-lg">
              <Package className="w-5 h-5 text-sky-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              Waste Manager
            </h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadRecords();
                loadStats();
              }}
              className="gap-2 text-slate-600"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              SYNC
            </Button>
            <Button
              onClick={() => navigate("/waste-records/new")}
              className="bg-[#0087be] hover:bg-[#0076a5] text-white gap-2 shadow-sm font-semibold uppercase text-xs"
            >
              <Plus className="w-4 h-4" strokeWidth={3} />
              Add Record
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 py-1 space-y-1">
        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Records"
            value={statsLoading ? "..." : (stats?.totalRecords ?? 0)}
            icon={Package}
            colorClass="bg-sky-500"
          />
          <StatCard
            label="Pending Review"
            value={statsLoading ? "..." : (stats?.pendingApproval ?? 0)}
            icon={AlertTriangle}
            colorClass="bg-orange-400"
          />
          <StatCard
            label="Monthly Loss"
            value={
              statsLoading
                ? "..."
                : formatCurrency(stats?.monthlyLossValue ?? 0)
            }
            icon={TrendingDown}
            colorClass="bg-red-500"
          />
          <StatCard
            label="Total Value"
            value={
              statsLoading ? "..." : formatCurrency(stats?.totalLossValue ?? 0)
            }
            icon={CheckCircle2}
            colorClass="bg-emerald-500"
          />
        </div>

        {/* ── Filters Bar ── */}
        <div className="flex flex-col md:flex-row gap-1 bg-white p-1 rounded-lg border border-gray-100 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-slate-50 border-none focus-visible:ring-1"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full md:w-[200px] bg-slate-50 border-none">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {/* Mapping categories... */}
            </SelectContent>
          </Select>
          <div className="flex gap-1 bg-slate-50 p-1 rounded-md">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8 px-2 font-bold text-slate-500"
            >
              <AlertTriangle className="w-3 h-3 mr-1" /> Low
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8 px-2 font-bold text-slate-500"
            >
              <TrendingDown className="w-3 h-3 mr-1" /> Out
            </Button>
          </div>
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-1 py-0.5 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">
              {loading
                ? "Loading..."
                : `${total} record${total !== 1 ? "s" : ""} found`}
            </p>
          </div>

          {loading ? (
            <div className="py-24 flex flex-col items-center gap-3 text-gray-400">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <p className="text-sm">Loading records…</p>
            </div>
          ) : records.length === 0 ? (
            <div className="py-24 flex flex-col items-center gap-3 text-gray-400">
              <FileWarning className="w-12 h-12 text-gray-200" />
              <p className="text-base font-medium text-gray-500">
                No waste records found
              </p>
              <p className="text-sm">
                Adjust your filters or{" "}
                <button
                  onClick={() => navigate("/inventory/waste/new")}
                  className="text-red-600 underline underline-offset-2"
                >
                  record a new waste entry
                </button>
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-gray-100 bg-slate-50/50">
                        <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[11px]">
                          Code
                        </th>
                        <th className="px-4 py-4 font-bold text-slate-500 uppercase text-[11px]">
                          Location
                        </th>
                        <th className="px-4 py-4 font-bold text-slate-500 uppercase text-[11px]">
                          Category
                        </th>
                        <th className="px-4 py-4 font-bold text-slate-500 uppercase text-[11px] text-right">
                          Value
                        </th>
                        <th className="px-4 py-4 font-bold text-slate-500 uppercase text-[11px]">
                          Status
                        </th>
                        <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[11px] text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {records.map((record) => (
                        <tr
                          key={record.id}
                          className="hover:bg-slate-50/50 group transition-colors"
                        >
                          <td className="px-6 py-4 font-bold text-sky-700">
                            {record.wasteCode}
                          </td>
                          <td className="px-4 py-4 text-slate-600 font-medium">
                            {record.location.name}
                          </td>
                          <td className="px-4 py-4">
                            <Badge
                              variant="outline"
                              className="font-normal bg-slate-50 text-slate-500 border-slate-200"
                            >
                              {record.category}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-slate-700">
                            {formatCurrency(record.totalValue)}
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge approved={!!record.approvedById} />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="icon"
                                onClick={() => handleView(record)}
                                className="h-7 w-8 bg-sky-500 hover:bg-sky-600 text-white"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {!record.approvedById && (
                                <Button
                                  size="icon"
                                  onClick={() =>
                                    setApproveDialog({ open: true, record })
                                  }
                                  className="h-7 w-8 bg-emerald-500 hover:bg-emerald-600 text-white"
                                >
                                  <BadgeCheck className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Pagination ──────────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Approve Dialog ────────────────────────────────────────────────────── */}
      <Dialog
        open={approveDialog.open}
        onOpenChange={(o) =>
          !actionLoading && setApproveDialog({ open: o, record: null })
        }
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-emerald-600" />
              Approve Waste Record
            </DialogTitle>
            <DialogDescription>
              Approving{" "}
              <strong className="font-mono">
                {approveDialog.record?.wasteCode}
              </strong>{" "}
              will permanently deduct{" "}
              <strong>{approveDialog.record?.items.length} item(s)</strong> from
              stock and record them as losses in the stock log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {approveDialog.record && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-1.5">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                  Items to be deducted
                </p>
                {approveDialog.record.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-amber-800">{item.itemName}</span>
                    <span className="font-medium text-amber-900">
                      -{item.quantity} {item.unit}
                    </span>
                  </div>
                ))}
                <div className="border-t border-amber-200 pt-1.5 flex justify-between text-sm font-semibold">
                  <span className="text-amber-800">Total Value</span>
                  <span className="text-amber-900">
                    {formatCurrency(approveDialog.record.totalValue)}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">
                Approval Notes (optional)
              </Label>
              <Textarea
                placeholder="Add any approval notes..."
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                className="rounded-xl resize-none"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setApproveDialog({ open: false, record: null })}
              disabled={actionLoading}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={actionLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2"
            >
              {actionLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <BadgeCheck className="w-4 h-4" />
              )}
              Approve & Deduct Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Dialog ─────────────────────────────────────────────────────── */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={(o) =>
          !actionLoading && setRejectDialog({ open: o, record: null })
        }
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              Reject Waste Record
            </DialogTitle>
            <DialogDescription>
              Rejecting this record will prevent stock deduction. No stock log
              entry will be created.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700">
              Rejection Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="Explain why this record is being rejected..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="rounded-xl resize-none"
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectDialog({ open: false, record: null })}
              disabled={actionLoading}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={actionLoading || !rejectReason.trim()}
              variant="destructive"
              className="rounded-xl gap-2"
            >
              {actionLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Reject Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail Drawer ─────────────────────────────────────────────────────── */}
      <WasteDetailDrawer
        record={selectedRecord}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onApprove={(record) => {
          setDrawerOpen(false);
          setApproveDialog({ open: true, record });
        }}
        onReject={(record) => {
          setDrawerOpen(false);
          setRejectDialog({ open: true, record });
        }}
      />
    </div>
  );
}
