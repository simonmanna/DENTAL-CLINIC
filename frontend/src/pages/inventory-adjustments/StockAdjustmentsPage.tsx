"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  Fragment,
} from "react";
import {
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  Pill,
  Trash2,
  MapPin,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  X,
  Check,
  Loader2,
  ClipboardList,
  BarChart3,
  Building2,
  RefreshCw,
  AlertTriangle,
  CalendarDays,
  FileText,
  Hash,
  Boxes,
  ArrowRight,
  ArrowLeft,
  CircleDot,
  Minus,
  Info,
  AlertCircle,
  ChevronDown,
} from "lucide-react";

import type {
  StockAdjustment,
  AdjustmentStats,
  StockItem,
  StockAdjustmentReason,
  AdjustmentStatus,
} from "../../types/stock-adjustment";

import {
  listAdjustments,
  getAdjustmentStats,
  createAdjustment,
  approveAdjustment,
  rejectAdjustment,
  getLocationStock,
  searchItems,
  listLocations,
} from "../../services/adjustments.api";
import { toast } from "sonner";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const REASONS: { value: StockAdjustmentReason; label: string; description: string; icon: string }[] = [
  { value: "CYCLE_COUNT", label: "Cycle Count", description: "Regular physical count reconciliation", icon: "🔄" },
  { value: "DAMAGED", label: "Damaged", description: "Items damaged beyond use", icon: "💥" },
  { value: "EXPIRED", label: "Expired", description: "Past expiry date items", icon: "⏰" },
  { value: "THEFT", label: "Theft / Loss", description: "Missing or stolen items", icon: "🚨" },
  { value: "RETURNED_TO_SUPPLIER", label: "Returned", description: "Sent back to supplier", icon: "↩️" },
  { value: "FOUND", label: "Found / Surplus", description: "Extra stock discovered", icon: "✅" },
  { value: "INITIAL_COUNT", label: "Initial Count", description: "First-time stock setup", icon: "📋" },
  { value: "OTHER", label: "Other", description: "Miscellaneous reason", icon: "📝" },
];

const REASON_BADGE_CLASS: Record<StockAdjustmentReason, string> = {
  CYCLE_COUNT: "bg-sky-50 text-sky-700 border-sky-200",
  DAMAGED: "bg-red-50 text-red-700 border-red-200",
  EXPIRED: "bg-orange-50 text-orange-700 border-orange-200",
  THEFT: "bg-red-50 text-red-800 border-red-200",
  RETURNED_TO_SUPPLIER: "bg-purple-50 text-purple-700 border-purple-200",
  FOUND: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INITIAL_COUNT: "bg-teal-50 text-teal-700 border-teal-200",
  OTHER: "bg-slate-50 text-slate-600 border-slate-200",
};

const STATUS_CFG: Record<AdjustmentStatus, { label: string; icon: React.ReactNode; cls: string }> = {
  PENDING: { label: "Pending", icon: <Clock size={11} />, cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  APPROVED: { label: "Approved", icon: <CheckCircle2 size={11} />, cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  REJECTED: { label: "Rejected", icon: <XCircle size={11} />, cls: "bg-red-50 text-red-700 border border-red-200" },
};

const PER_PAGE = 20;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  if (v >= 1_000_000) return `UGX ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `UGX ${(v / 1_000).toFixed(0)}k`;
  return `UGX ${v.toLocaleString()}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return fmtDate(iso);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function reasonMeta(v: StockAdjustmentReason) {
  return REASONS.find((r) => r.value === v) ?? { label: v, icon: "📝", description: "" };
}

function totalDiff(items: StockAdjustment["items"]) {
  return items.reduce((s, i) => s + i.quantityDifference, 0);
}

function totalValue(items: StockAdjustment["items"]) {
  return items.reduce((s, i) => s + Math.abs(i.quantityDifference) * i.unitCost, 0);
}

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────

function DiffBadge({ diff, size = "sm" }: { diff: number; size?: "sm" | "md" }) {
  const base = size === "md" ? "text-sm px-3 py-1.5" : "text-xs px-2 py-0.5";
  if (diff === 0)
    return (
      <span className={`inline-flex items-center gap-1 font-semibold text-slate-500 bg-slate-100 rounded-md border border-slate-200 ${base}`}>
        <Minus size={size === "md" ? 12 : 10} /> 0
      </span>
    );
  if (diff > 0)
    return (
      <span className={`inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200 ${base}`}>
        <TrendingUp size={size === "md" ? 12 : 10} /> +{diff}
      </span>
    );
  return (
    <span className={`inline-flex items-center gap-1 font-semibold text-red-700 bg-red-50 rounded-md border border-red-200 ${base}`}>
      <TrendingDown size={size === "md" ? 12 : 10} /> {diff}
    </span>
  );
}

function StatCard({ label, value, icon, color, sub, loading }: {
  label: string; value: number | string; icon: React.ReactNode; color: string; sub?: string; loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={`p-3 rounded-xl ${color} shrink-0`}>{icon}</div>
      <div className="min-w-0">
        {loading ? (
          <div className="h-7 w-16 bg-slate-100 rounded animate-pulse mb-1" />
        ) : (
          <p className="text-2xl font-bold text-slate-800 tabular-nums">{value}</p>
        )}
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
      <AlertTriangle size={16} className="shrink-0" />
      <span className="flex-1 font-medium">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-800 underline underline-offset-2">
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
}

// ─── NEW ADJUSTMENT MODAL (COMPLETE REDESIGN) ─────────────────────────────────

interface CountRow {
  _key: string;
  item: StockItem | null;
  actualQty: string;
  notes: string;
}

function NewAdjustmentModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (adj: StockAdjustment) => void;
}) {
  // ── Wizard state ──
  const [step, setStep] = useState(1); // 1=location, 2=reason, 3=count
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState<StockAdjustmentReason | "">("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<CountRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ── Data loading ──
  const [locations, setLocations] = useState<{ id: string; name: string; type: string; isActive: boolean }[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [locationStock, setLocationStock] = useState<StockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);

  // ── Item search (step 3) ──
  const [searchQuery, setSearchQuery] = useState("");
  const [showItemPicker, setShowItemPicker] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep(1);
      setLocationId("");
      setReason("");
      setNotes("");
      setRows([]);
      setSubmitError("");
      setLocationStock([]);
      setSearchQuery("");
      setShowItemPicker(false);
    }
  }, [open]);

  // Load locations
  useEffect(() => {
    if (!open) return;
    setLocLoading(true);
    listLocations()
      .then((data) => setLocations(data.filter((l) => l.isActive)))
      .catch(() => toast.error("Failed to load locations"))
      .finally(() => setLocLoading(false));
  }, [open]);

  // Load stock when entering step 3
  useEffect(() => {
    if (step !== 3 || !locationId) return;
    setStockLoading(true);
    getLocationStock(locationId)
      .then((res) => {
        const items = [...(res.inventoryItems ?? []), ...(res.drugs ?? [])].map((item) => ({
          ...item,
          batchTracking: (item as any).batchTracking ?? false,
        }));
        setLocationStock(items);
      })
      .catch(() => setLocationStock([]))
      .finally(() => setStockLoading(false));
  }, [step, locationId]);

  // ── Row management ──
  const addedItemIds = useMemo(() => new Set(rows.map((r) => r.item?.id).filter(Boolean)), [rows]);

  function addItem(item: StockItem) {
    if (addedItemIds.has(item.id)) {
      toast.info(`${item.name} is already in the list`);
      return;
    }
    setRows((prev) => [
      ...prev,
      { _key: crypto.randomUUID(), item, actualQty: String(item.currentStock), notes: "" },
    ]);
    setShowItemPicker(false);
    setSearchQuery("");
  }

  function addAllItems() {
    const toAdd = locationStock.filter((i) => !addedItemIds.has(i.id));
    if (toAdd.length === 0) {
      toast.info("All items are already added");
      return;
    }
    const newRows = toAdd.map((item) => ({
      _key: crypto.randomUUID(),
      item,
      actualQty: String(item.currentStock),
      notes: "",
    }));
    setRows((prev) => [...prev, ...newRows]);
    toast.success(`Added ${newRows.length} items`);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r._key !== key));
  }

  function updateRow(key: string, patch: Partial<CountRow>) {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  }

  // ── Computed values ──
  const validRows = rows.filter((r) => r.item && r.actualQty !== "");
  const changedRows = validRows.filter((r) => {
    const actual = parseFloat(r.actualQty) || 0;
    return actual !== (r.item?.currentStock ?? 0);
  });

  const netDiff = validRows.reduce((s, r) => {
    const actual = parseFloat(r.actualQty) || 0;
    return s + (actual - (r.item?.currentStock ?? 0));
  }, 0);

  const netValue = validRows.reduce((s, r) => {
    const actual = parseFloat(r.actualQty) || 0;
    return s + Math.abs(actual - (r.item?.currentStock ?? 0)) * (r.item?.unitCost ?? 0);
  }, 0);

  // ── Filtered search results ──
  const filteredStock = useMemo(() => {
    if (!searchQuery.trim()) return locationStock.filter((i) => !addedItemIds.has(i.id)).slice(0, 15);
    const q = searchQuery.toLowerCase();
    return locationStock
      .filter(
        (i) =>
          !addedItemIds.has(i.id) &&
          (i.name.toLowerCase().includes(q) ||
            i.code?.toLowerCase().includes(q) ||
            i.category?.toLowerCase().includes(q))
      )
      .slice(0, 15);
  }, [searchQuery, locationStock, addedItemIds]);

  // ── Submit ──
  async function handleSubmit() {
    if (!locationId || !reason || validRows.length === 0) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const created = await createAdjustment({
        locationId,
        reason: reason as StockAdjustmentReason,
        notes: notes || undefined,
        items: validRows.map((r) => ({
          itemType: r.item!.type,
          inventoryItemId: r.item!.type === "INVENTORY" ? r.item!.id : undefined,
          drugId: r.item!.type === "DRUG" ? r.item!.id : undefined,
          itemName: r.item!.name,
          unit: r.item!.unit,
          quantitySystem: r.item!.currentStock,
          quantityActual: parseFloat(r.actualQty) || 0,
          unitCost: r.item!.unitCost,
          notes: r.notes || undefined,
        })),
      });
      toast.success("Adjustment created successfully");
      onCreated(created);
      onClose();
    } catch (e: any) {
      setSubmitError(e.message ?? "Failed to create adjustment");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedLocation = locations.find((l) => l.id === locationId);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* ── Header ── */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800">New Stock Adjustment</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {step === 1 && "Select where the count is happening"}
              {step === 2 && "Why are you adjusting stock?"}
              {step === 3 && "Enter the physical count for each item"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* ── Progress bar ── */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-0 shrink-0">
          {["Location", "Reason", "Count Items"].map((label, i) => {
            const stepNum = i + 1;
            const isActive = step === stepNum;
            const isDone = step > stepNum;
            return (
              <Fragment key={label}>
                {i > 0 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded-full transition-colors ${isDone ? "bg-sky-500" : "bg-slate-200"}`} />
                )}
                <button
                  onClick={() => isDone && setStep(stepNum)}
                  disabled={!isDone}
                  className="flex items-center gap-2 shrink-0 disabled:cursor-default"
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isActive ? "bg-sky-600 text-white ring-4 ring-sky-100" :
                      isDone ? "bg-sky-500 text-white" :
                      "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {isDone ? <Check size={14} /> : stepNum}
                  </div>
                  <span className={`text-sm font-medium ${isActive ? "text-sky-700" : isDone ? "text-sky-600" : "text-slate-400"}`}>
                    {label}
                  </span>
                </button>
              </Fragment>
            );
          })}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {/* ════ STEP 1: Location ════ */}
          {step === 1 && (
            <div className="p-6">
              {locLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {locations.map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() => { setLocationId(loc.id); setStep(2); }}
                      className={`text-left p-4 rounded-xl border-2 transition-all group ${
                        locationId === loc.id
                          ? "border-sky-500 bg-sky-50 shadow-sm"
                          : "border-slate-200 hover:border-sky-300 hover:bg-sky-50/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          locationId === loc.id ? "bg-sky-200" : "bg-slate-100 group-hover:bg-sky-100"
                        }`}>
                          <Building2 size={18} className={locationId === loc.id ? "text-sky-700" : "text-slate-500 group-hover:text-sky-600"} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{loc.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{loc.type.replace(/_/g, " ")}</p>
                        </div>
                      </div>
                      {locationId === loc.id && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-sky-600 font-medium">
                          <CheckCircle2 size={12} /> Selected
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════ STEP 2: Reason ════ */}
          {step === 2 && (
            <div className="p-6 space-y-5">
              {/* Context banner */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm">
                <Building2 size={14} className="text-slate-400" />
                <span className="text-slate-500">Location:</span>
                <span className="font-semibold text-slate-800">{selectedLocation?.name}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {REASONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => { setReason(r.value); setStep(3); }}
                    className={`text-left p-4 rounded-xl border-2 transition-all group ${
                      reason === r.value
                        ? "border-sky-500 bg-sky-50 shadow-sm"
                        : "border-slate-200 hover:border-sky-300 hover:bg-sky-50/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{r.icon}</span>
                      <div>
                        <p className="font-semibold text-slate-800">{r.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Additional Notes <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any extra details about this adjustment..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none"
                />
              </div>
            </div>
          )}

          {/* ════ STEP 3: Count Items ════ */}
          {step === 3 && (
            <div className="flex flex-col h-full">
              {/* Context bar */}
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 shrink-0">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Building2 size={13} className="text-slate-400" />
                    <strong>{selectedLocation?.name}</strong>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    {reasonMeta(reason as StockAdjustmentReason).icon}{" "}
                    <strong>{reasonMeta(reason as StockAdjustmentReason).label}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={addAllItems}
                    disabled={stockLoading || locationStock.length === 0}
                    className="text-xs px-3 py-1.5 rounded-lg border border-sky-300 text-sky-700 hover:bg-sky-50 font-semibold transition-colors disabled:opacity-40"
                  >
                    Add all items ({locationStock.length})
                  </button>
                  <button
                    onClick={() => setShowItemPicker(true)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 font-semibold transition-colors shadow-sm"
                  >
                    <Plus size={13} /> Add Item
                  </button>
                </div>
              </div>

              {/* Summary strip */}
              {validRows.length > 0 && (
                <div className="px-6 py-3 bg-sky-50/80 border-b border-sky-100 flex items-center gap-6 text-sm shrink-0">
                  <div>
                    <span className="text-sky-600">Items:</span>{" "}
                    <strong className="text-slate-800">{validRows.length}</strong>
                  </div>
                  <div>
                    <span className="text-sky-600">Changed:</span>{" "}
                    <strong className={changedRows.length > 0 ? "text-amber-600" : "text-slate-800"}>{changedRows.length}</strong>
                  </div>
                  <div>
                    <span className="text-sky-600">Net:</span>{" "}
                    <strong className={netDiff >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {netDiff >= 0 ? "+" : ""}{netDiff}
                    </strong>
                  </div>
                  <div>
                    <span className="text-sky-600">Value:</span>{" "}
                    <strong className="text-slate-800">{fmtCurrency(netValue)}</strong>
                  </div>
                </div>
              )}

              {/* Items list */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {stockLoading ? (
                  <div className="flex items-center justify-center py-16 text-slate-400">
                    <Loader2 size={24} className="animate-spin mr-3" />
                    Loading stock data...
                  </div>
                ) : rows.length === 0 ? (
                  <div className="text-center py-16">
                    <Boxes size={48} className="mx-auto mb-4 text-slate-300" />
                    <p className="text-lg font-semibold text-slate-500">No items added yet</p>
                    <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
                      Click "Add all items" to load every item at this location, or use "Add Item" to pick individually.
                    </p>
                    <div className="flex items-center justify-center gap-3 mt-5">
                      <button onClick={addAllItems} disabled={locationStock.length === 0}
                        className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-40 transition-colors">
                        Add All Items ({locationStock.length})
                      </button>
                      <button onClick={() => setShowItemPicker(true)}
                        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors">
                        Pick Items
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {rows.map((row) => {
                      const actual = parseFloat(row.actualQty) || 0;
                      const sysQty = row.item?.currentStock ?? 0;
                      const diff = row.item ? actual - sysQty : 0;
                      const hasChange = diff !== 0;

                      return (
                        <div
                          key={row._key}
                          className={`rounded-xl border p-4 transition-colors ${
                            hasChange
                              ? diff > 0
                                ? "border-emerald-200 bg-emerald-50/30"
                                : "border-red-200 bg-red-50/30"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            {/* Item info */}
                            <div className={`p-2 rounded-lg shrink-0 ${
                              row.item?.type === "DRUG" ? "bg-blue-100" : "bg-orange-100"
                            }`}>
                              {row.item?.type === "DRUG" ? (
                                <Pill size={16} className="text-blue-600" />
                              ) : (
                                <Package size={16} className="text-orange-600" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">
                                {row.item?.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {row.item?.unit}
                                {row.item?.code ? ` · ${row.item.code}` : ""}
                                {row.item?.category ? ` · ${row.item.category}` : ""}
                              </p>
                            </div>

                            {/* System qty */}
                            <div className="text-center shrink-0 w-20">
                              <p className="text-xs text-slate-400 uppercase font-medium">System</p>
                              <p className="text-lg font-bold text-slate-600 tabular-nums">{sysQty}</p>
                            </div>

                            {/* Arrow */}
                            <ArrowRight size={16} className="text-slate-300 shrink-0" />

                            {/* Actual input */}
                            <div className="shrink-0 w-24">
                              <p className="text-xs text-slate-400 uppercase font-medium text-center">Actual</p>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={row.actualQty}
                                onChange={(e) => updateRow(row._key, { actualQty: e.target.value })}
                                className={`w-full px-3 py-1.5 rounded-lg border text-center font-bold text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                                  hasChange
                                    ? diff > 0 ? "border-emerald-300 text-emerald-700 bg-white" : "border-red-300 text-red-700 bg-white"
                                    : "border-slate-300 text-slate-800"
                                }`}
                              />
                            </div>

                            {/* Diff badge */}
                            <div className="shrink-0 w-16 flex justify-center">
                              <DiffBadge diff={diff} />
                            </div>

                            {/* Remove */}
                            <button
                              onClick={() => removeRow(row._key)}
                              className="p-1.5 hover:bg-red-100 rounded-lg transition-colors shrink-0"
                              title="Remove item"
                            >
                              <Trash2 size={14} className="text-slate-400 hover:text-red-500" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {submitError && (
                <div className="px-6 pb-3">
                  <ErrorBanner message={submitError} />
                </div>
              )}

              {/* ── Item picker dropdown ── */}
              {showItemPicker && (
                <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh]">
                  <div className="absolute inset-0 bg-black/30" onClick={() => setShowItemPicker(false)} />
                  <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          autoFocus
                          placeholder="Search items by name, code, or category..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {filteredStock.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-slate-400">
                          {searchQuery ? "No matching items found" : "All items have been added"}
                        </div>
                      ) : (
                        filteredStock.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => addItem(item)}
                            className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-sky-50 transition-colors border-b border-slate-100 last:border-0"
                          >
                            <div className={`p-1.5 rounded-lg shrink-0 ${item.type === "DRUG" ? "bg-blue-100" : "bg-orange-100"}`}>
                              {item.type === "DRUG" ? <Pill size={14} className="text-blue-600" /> : <Package size={14} className="text-orange-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                              <p className="text-xs text-slate-500">
                                Stock: {item.currentStock} {item.unit}
                                {item.category ? ` · ${item.category}` : ""}
                              </p>
                            </div>
                            <Plus size={16} className="text-sky-500 shrink-0" />
                          </button>
                        ))
                      )}
                    </div>
                    <div className="p-3 border-t border-slate-200 bg-slate-50">
                      <button
                        onClick={() => setShowItemPicker(false)}
                        className="w-full py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/80">
          <button
            onClick={() => {
              if (step === 1) onClose();
              else setStep((s) => (s - 1) as any);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={14} />
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step < 3 ? (
            <button
              disabled={(step === 1 && !locationId) || (step === 2 && !reason)}
              onClick={() => setStep((s) => (s + 1) as any)}
              className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              Continue <ArrowRight size={14} />
            </button>
          ) : (
            <button
              disabled={validRows.length === 0 || submitting}
              onClick={handleSubmit}
              className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Check size={14} /> Submit Adjustment ({validRows.length} items)
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DETAIL DRAWER ────────────────────────────────────────────────────────────

function DetailDrawer({
  adjustment,
  onClose,
  onApproved,
  onRejected,
}: {
  adjustment: StockAdjustment;
  onClose: () => void;
  onApproved: (updated: StockAdjustment) => void;
  onRejected: (updated: StockAdjustment) => void;
}) {
  const [actionNotes, setActionNotes] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState("");

  const diff = totalDiff(adjustment.items);
  const val = totalValue(adjustment.items);
  const r = reasonMeta(adjustment.reason);
  const sc = STATUS_CFG[adjustment.status];

  async function handleApprove() {
    setActing("approve");
    setActionError("");
    try {
      const updated = await approveAdjustment(adjustment.id, actionNotes || undefined);
      toast.success("Adjustment approved and stock updated");
      onApproved(updated);
    } catch (e: any) {
      setActionError(e.message ?? "Failed to approve");
    } finally {
      setActing(null);
    }
  }

  async function handleReject() {
    setActing("reject");
    setActionError("");
    try {
      const updated = await rejectAdjustment(adjustment.id, actionNotes || undefined);
      toast.info("Adjustment rejected");
      onRejected(updated);
    } catch (e: any) {
      setActionError(e.message ?? "Failed to reject");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg shadow-2xl flex flex-col h-full border-l border-slate-200">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-200 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 text-slate-600 font-bold">
                  {adjustment.adjustmentCode}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${sc.cls}`}>
                  {sc.icon} {sc.label}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                {r.icon} {r.label}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500">
                <MapPin size={11} /> {adjustment.location.name}
                <span className="text-slate-300">·</span>
                <CalendarDays size={11} /> {fmtDate(adjustment.createdAt)}
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <X size={16} className="text-slate-500" />
            </button>
          </div>
          {adjustment.notes && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
              <FileText size={14} className="shrink-0 mt-0.5 text-amber-600" />
              {adjustment.notes}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="px-6 py-4 grid grid-cols-3 gap-3 border-b border-slate-200 shrink-0">
          <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
            <p className="text-xl font-bold text-slate-800">{adjustment.items.length}</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Items</p>
          </div>
          <div className={`rounded-xl p-3 text-center border ${diff >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
            <p className={`text-xl font-bold ${diff >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {diff >= 0 ? "+" : ""}{diff}
            </p>
            <p className={`text-xs font-medium mt-0.5 ${diff >= 0 ? "text-emerald-600" : "text-red-600"}`}>Net Change</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
            <p className="text-lg font-bold text-slate-800">{fmtCurrency(val)}</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Value</p>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Items ({adjustment.items.length})
          </h4>
          <div className="space-y-2">
            {adjustment.items.map((item, idx) => (
              <div key={item.id ?? idx}
                className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center gap-3 hover:border-sky-300 transition-colors shadow-sm">
                <div className={`p-2 rounded-lg shrink-0 ${item.itemType === "DRUG" ? "bg-blue-100" : "bg-orange-100"}`}>
                  {item.itemType === "DRUG" ? <Pill size={14} className="text-blue-600" /> : <Package size={14} className="text-orange-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{item.itemName}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>System: <strong className="text-slate-700">{item.quantitySystem}</strong></span>
                    <ArrowRight size={10} className="text-slate-300" />
                    <span>Actual: <strong className="text-slate-700">{item.quantityActual}</strong></span>
                    <span className="text-slate-300">·</span>
                    <span>{item.unit}</span>
                  </div>
                </div>
                <DiffBadge diff={item.quantityDifference} />
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        {adjustment.status === "PENDING" ? (
          <div className="px-6 py-5 border-t border-slate-200 shrink-0 space-y-3">
            <textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes for approval / rejection..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
            />
            {actionError && <ErrorBanner message={actionError} />}
            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={acting !== null}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 font-bold text-sm transition-colors disabled:opacity-40"
              >
                {acting === "reject" ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={acting !== null}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-sm transition-colors disabled:opacity-40 shadow-sm"
              >
                {acting === "approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Approve & Apply
              </button>
            </div>
          </div>
        ) : adjustment.approvalNotes ? (
          <div className="px-6 py-4 border-t border-slate-200 shrink-0 bg-slate-50">
            <p className="text-xs font-bold text-slate-400 uppercase mb-1.5">Review Notes</p>
            <p className="text-sm text-slate-600">{adjustment.approvalNotes}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function StockAdjustmentsPage() {
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: PER_PAGE, totalPages: 1 });
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [stats, setStats] = useState<AdjustmentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdjustmentStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [selectedAdj, setSelectedAdj] = useState<StockAdjustment | null>(null);

  // Debounced search
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const res = await listAdjustments({
        page,
        limit: PER_PAGE,
        search: debouncedSearch || undefined,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
      });
      setAdjustments(Array.isArray(res?.data) ? res.data : []);
      setMeta(res?.meta ?? { total: 0, page: 1, limit: PER_PAGE, totalPages: 1 });
    } catch (e: any) {
      setListError(e.message ?? "Failed to load adjustments");
      setAdjustments([]);
    } finally {
      setListLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await getAdjustmentStats());
    } catch {
      // silent
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  function handleCreated(adj: StockAdjustment) {
    setAdjustments((prev) => [adj, ...prev]);
    setMeta((m) => ({ ...m, total: m.total + 1 }));
    fetchStats();
  }

  function handleApproved(updated: StockAdjustment) {
    setAdjustments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setSelectedAdj(updated);
    fetchStats();
  }

  function handleRejected(updated: StockAdjustment) {
    setAdjustments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setSelectedAdj(updated);
    fetchStats();
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-2 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-100 rounded-xl">
            <ClipboardList size={20} className="text-sky-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Stock Adjustments</h1>
            <p className="text-xs text-slate-500">Reconcile physical counts with system quantities</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchList(); fetchStats(); }}
            className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-500 border border-transparent hover:border-slate-200"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 transition-colors shadow-sm"
          >
            <Plus size={16} /> New Adjustment
          </button>
        </div>
      </div>

      <div className="px-2 py-1  space-y-2">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Pending Review" value={stats?.pending ?? 0} icon={<Clock size={18} className="text-amber-600" />} color="bg-amber-100" sub="Awaiting approval" loading={statsLoading} />
          <StatCard label="Approved" value={stats?.approved ?? 0} icon={<CheckCircle2 size={18} className="text-emerald-600" />} color="bg-emerald-100" sub="Stock updated" loading={statsLoading} />
          <StatCard label="Rejected" value={stats?.rejected ?? 0} icon={<XCircle size={18} className="text-red-500" />} color="bg-red-100" sub="Not applied" loading={statsLoading} />
          <StatCard label="This Month" value={stats?.thisMonth ?? 0} icon={<BarChart3 size={18} className="text-sky-600" />} color="bg-sky-100" sub="Total adjustments" loading={statsLoading} />
        </div>

        {/* Search + filters */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by code, location, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-md">
                <X size={12} className="text-slate-400" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                  statusFilter === s
                    ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {s === "ALL" ? `All${meta.total > 0 ? ` (${meta.total})` : ""}` : STATUS_CFG[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Adjustment</span>
            <span>Location</span>
            <span>Reason</span>
            <span>Items / Diff</span>
            <span>Status</span>
            <span className="text-right">Date</span>
          </div>

          {listError && (
            <div className="p-6"><ErrorBanner message={listError} onRetry={fetchList} /></div>
          )}

          {listLoading && !listError && (
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-5 py-4 grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 items-center">
                  <div className="space-y-1.5">
                    <div className="h-4 w-28 bg-slate-100 rounded animate-pulse" />
                    <div className="h-3 w-40 bg-slate-100 rounded animate-pulse" />
                  </div>
                  <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
                  <div className="h-6 w-24 bg-slate-100 rounded-lg animate-pulse" />
                  <div className="h-5 w-12 bg-slate-100 rounded animate-pulse" />
                  <div className="h-6 w-20 bg-slate-100 rounded-full animate-pulse" />
                  <div className="h-3 w-16 bg-slate-100 rounded animate-pulse ml-auto" />
                </div>
              ))}
            </div>
          )}

          {!listLoading && !listError && adjustments.length === 0 && (
            <div className="text-center py-20 text-slate-400">
              <ClipboardList size={48} className="mx-auto mb-3 text-slate-300" />
              <p className="font-bold text-slate-500">No adjustments found</p>
              <p className="text-sm mt-1">
                {debouncedSearch || statusFilter !== "ALL"
                  ? "Try clearing your filters"
                  : "Create your first adjustment with the button above"}
              </p>
            </div>
          )}

          {!listLoading && !listError && adjustments.length > 0 && (
            <div className="divide-y divide-slate-100">
              {adjustments.map((adj) => {
                const sc = STATUS_CFG[adj.status];
                const r = reasonMeta(adj.reason);
                const diff = totalDiff(adj.items);
                const itemCount = adj._count?.items ?? adj.items.length;

                return (
                  <div
                    key={adj.id}
                    onClick={() => setSelectedAdj(adj)}
                    className="px-5 py-4 grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 items-center hover:bg-sky-50/50 cursor-pointer transition-colors group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Hash size={13} className="text-slate-400 shrink-0" />
                        <span className="font-mono text-sm font-bold text-slate-800 group-hover:text-sky-700 transition-colors">
                          {adj.adjustmentCode}
                        </span>
                        {adj.status === "PENDING" && (
                          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                        )}
                      </div>
                      {adj.notes && (
                        <p className="text-xs text-slate-400 truncate mt-1 max-w-xs pl-5">{adj.notes}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 size={13} className="text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{adj.location.name}</p>
                        <p className="text-xs text-slate-500">{adj.location.type}</p>
                      </div>
                    </div>

                    <div>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border ${REASON_BADGE_CLASS[adj.reason]}`}>
                        {r.icon} {r.label}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-slate-800">{itemCount}</p>
                      <div className="mt-1"><DiffBadge diff={diff} /></div>
                    </div>

                    <div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${sc.cls}`}>
                        {sc.icon} {sc.label}
                      </span>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-500">{timeAgo(adj.createdAt)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDate(adj.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!listLoading && meta.totalPages > 1 && (
            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <p className="text-sm text-slate-500 font-medium">
                {Math.min((meta.page - 1) * meta.limit + 1, meta.total)}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={meta.page === 1}
                  className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-slate-300 disabled:opacity-30 transition-all"
                >
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: meta.totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === meta.totalPages || Math.abs(p - meta.page) <= 1)
                  .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === "…" ? (
                      <span key={`e-${idx}`} className="px-1 text-slate-400 text-sm">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={`w-8 h-8 rounded-xl text-sm font-bold transition-all border ${
                          meta.page === p
                            ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                            : "bg-white hover:bg-slate-50 text-slate-600 border-slate-300"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  disabled={meta.page === meta.totalPages}
                  className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-slate-300 disabled:opacity-30 transition-all"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <NewAdjustmentModal open={showModal} onClose={() => setShowModal(false)} onCreated={handleCreated} />
      {selectedAdj && (
        <DetailDrawer
          adjustment={selectedAdj}
          onClose={() => setSelectedAdj(null)}
          onApproved={handleApproved}
          onRejected={handleRejected}
        />
      )}
    </div>
  );
}