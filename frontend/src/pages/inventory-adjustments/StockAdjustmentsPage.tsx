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
  CYCLE_COUNT: "bg-primary-muted/60 text-primary border-primary/25",
  DAMAGED: "bg-danger-muted/60 text-danger border-danger/25",
  EXPIRED: "bg-warning-muted/60 text-warning border-warning/25",
  THEFT: "bg-danger-muted/60 text-danger border-danger/25",
  RETURNED_TO_SUPPLIER: "bg-purple-50 text-purple-700 border-purple-200",
  FOUND: "bg-success-muted/60 text-success border-success/25",
  INITIAL_COUNT: "bg-primary-muted/60 text-primary border-primary/25",
  OTHER: "bg-muted/50 text-muted-foreground border-border",
};

const STATUS_CFG: Record<AdjustmentStatus, { label: string; icon: React.ReactNode; cls: string }> = {
  PENDING: { label: "Pending", icon: <Clock size={11} />, cls: "bg-warning-muted/60 text-warning border border-warning/25" },
  APPROVED: { label: "Approved", icon: <CheckCircle2 size={11} />, cls: "bg-success-muted/60 text-success border border-success/25" },
  REJECTED: { label: "Rejected", icon: <XCircle size={11} />, cls: "bg-danger-muted/60 text-danger border border-danger/25" },
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
      <span className={`inline-flex items-center gap-1 font-semibold text-muted-foreground bg-muted rounded-md border border-border ${base}`}>
        <Minus size={size === "md" ? 12 : 10} /> 0
      </span>
    );
  if (diff > 0)
    return (
      <span className={`inline-flex items-center gap-1 font-semibold text-success bg-success-muted/60 rounded-md border border-success/25 ${base}`}>
        <TrendingUp size={size === "md" ? 12 : 10} /> +{diff}
      </span>
    );
  return (
    <span className={`inline-flex items-center gap-1 font-semibold text-danger bg-danger-muted/60 rounded-md border border-danger/25 ${base}`}>
      <TrendingDown size={size === "md" ? 12 : 10} /> {diff}
    </span>
  );
}

function StatCard({ label, value, icon, color, sub, loading }: {
  label: string; value: number | string; icon: React.ReactNode; color: string; sub?: string; loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-border px-5 py-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={`p-3 rounded-xl ${color} shrink-0`}>{icon}</div>
      <div className="min-w-0">
        {loading ? (
          <div className="h-7 w-16 bg-muted rounded animate-pulse mb-1" />
        ) : (
          <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        )}
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-danger-muted/60 border border-danger/25 rounded-xl px-4 py-3 text-sm text-danger">
      <AlertTriangle size={16} className="shrink-0" />
      <span className="flex-1 font-medium">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1.5 text-xs font-semibold text-danger hover:text-danger underline underline-offset-2">
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
      <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* ── Header ── */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground">New Stock Adjustment</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {step === 1 && "Select where the count is happening"}
              {step === 2 && "Why are you adjusting stock?"}
              {step === 3 && "Enter the physical count for each item"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors">
            <X size={20} className="text-muted-foreground/70" />
          </button>
        </div>

        {/* ── Progress bar ── */}
        <div className="px-6 py-3 border-b border-border/60 flex items-center gap-0 shrink-0">
          {["Location", "Reason", "Count Items"].map((label, i) => {
            const stepNum = i + 1;
            const isActive = step === stepNum;
            const isDone = step > stepNum;
            return (
              <Fragment key={label}>
                {i > 0 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded-full transition-colors ${isDone ? "bg-primary" : "bg-muted"}`} />
                )}
                <button
                  onClick={() => isDone && setStep(stepNum)}
                  disabled={!isDone}
                  className="flex items-center gap-2 shrink-0 disabled:cursor-default"
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isActive ? "bg-primary text-white ring-4 ring-primary/20" :
                      isDone ? "bg-primary text-white" :
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? <Check size={14} /> : stepNum}
                  </div>
                  <span className={`text-sm font-medium ${isActive ? "text-primary" : isDone ? "text-primary" : "text-muted-foreground/70"}`}>
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
                    <div key={n} className="h-20 bg-muted rounded-xl animate-pulse" />
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
                          ? "border-primary/60 bg-primary-muted/60 shadow-sm"
                          : "border-border hover:border-primary/30 hover:bg-primary-muted/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          locationId === loc.id ? "bg-primary-muted" : "bg-muted group-hover:bg-primary-muted"
                        }`}>
                          <Building2 size={18} className={locationId === loc.id ? "text-primary" : "text-muted-foreground group-hover:text-primary"} />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{loc.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{loc.type.replace(/_/g, " ")}</p>
                        </div>
                      </div>
                      {locationId === loc.id && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-primary font-medium">
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
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 rounded-xl border border-border text-sm">
                <Building2 size={14} className="text-muted-foreground/70" />
                <span className="text-muted-foreground">Location:</span>
                <span className="font-semibold text-foreground">{selectedLocation?.name}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {REASONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => { setReason(r.value); setStep(3); }}
                    className={`text-left p-4 rounded-xl border-2 transition-all group ${
                      reason === r.value
                        ? "border-primary/60 bg-primary-muted/60 shadow-sm"
                        : "border-border hover:border-primary/30 hover:bg-primary-muted/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{r.icon}</span>
                      <div>
                        <p className="font-semibold text-foreground">{r.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Additional Notes <span className="text-muted-foreground/70 font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any extra details about this adjustment..."
                  className="w-full px-4 py-3 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60 resize-none"
                />
              </div>
            </div>
          )}

          {/* ════ STEP 3: Count Items ════ */}
          {step === 3 && (
            <div className="flex flex-col h-full">
              {/* Context bar */}
              <div className="px-6 py-3 bg-muted/50 border-b border-border flex items-center justify-between flex-wrap gap-2 shrink-0">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Building2 size={13} className="text-muted-foreground/70" />
                    <strong>{selectedLocation?.name}</strong>
                  </span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {reasonMeta(reason as StockAdjustmentReason).icon}{" "}
                    <strong>{reasonMeta(reason as StockAdjustmentReason).label}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={addAllItems}
                    disabled={stockLoading || locationStock.length === 0}
                    className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary-muted/60 font-semibold transition-colors disabled:opacity-40"
                  >
                    Add all items ({locationStock.length})
                  </button>
                  <button
                    onClick={() => setShowItemPicker(true)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary font-semibold transition-colors shadow-sm"
                  >
                    <Plus size={13} /> Add Item
                  </button>
                </div>
              </div>

              {/* Summary strip */}
              {validRows.length > 0 && (
                <div className="px-6 py-3 bg-primary-muted/80 border-b border-primary/20 flex items-center gap-6 text-sm shrink-0">
                  <div>
                    <span className="text-primary">Items:</span>{" "}
                    <strong className="text-foreground">{validRows.length}</strong>
                  </div>
                  <div>
                    <span className="text-primary">Changed:</span>{" "}
                    <strong className={changedRows.length > 0 ? "text-warning" : "text-foreground"}>{changedRows.length}</strong>
                  </div>
                  <div>
                    <span className="text-primary">Net:</span>{" "}
                    <strong className={netDiff >= 0 ? "text-success" : "text-danger"}>
                      {netDiff >= 0 ? "+" : ""}{netDiff}
                    </strong>
                  </div>
                  <div>
                    <span className="text-primary">Value:</span>{" "}
                    <strong className="text-foreground">{fmtCurrency(netValue)}</strong>
                  </div>
                </div>
              )}

              {/* Items list */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {stockLoading ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground/70">
                    <Loader2 size={24} className="animate-spin mr-3" />
                    Loading stock data...
                  </div>
                ) : rows.length === 0 ? (
                  <div className="text-center py-16">
                    <Boxes size={48} className="mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-lg font-semibold text-muted-foreground">No items added yet</p>
                    <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm mx-auto">
                      Click "Add all items" to load every item at this location, or use "Add Item" to pick individually.
                    </p>
                    <div className="flex items-center justify-center gap-3 mt-5">
                      <button onClick={addAllItems} disabled={locationStock.length === 0}
                        className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary disabled:opacity-40 transition-colors">
                        Add All Items ({locationStock.length})
                      </button>
                      <button onClick={() => setShowItemPicker(true)}
                        className="px-4 py-2 rounded-lg border border-input text-foreground text-sm font-semibold hover:bg-muted/50 transition-colors">
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
                                ? "border-success/25 bg-success-muted/30"
                                : "border-danger/25 bg-danger-muted/30"
                              : "border-border bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            {/* Item info */}
                            <div className={`p-2 rounded-lg shrink-0 ${
                              row.item?.type === "DRUG" ? "bg-primary-muted" : "bg-warning-muted"
                            }`}>
                              {row.item?.type === "DRUG" ? (
                                <Pill size={16} className="text-primary" />
                              ) : (
                                <Package size={16} className="text-warning" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {row.item?.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {row.item?.unit}
                                {row.item?.code ? ` · ${row.item.code}` : ""}
                                {row.item?.category ? ` · ${row.item.category}` : ""}
                              </p>
                            </div>

                            {/* System qty */}
                            <div className="text-center shrink-0 w-20">
                              <p className="text-xs text-muted-foreground/70 uppercase font-medium">System</p>
                              <p className="text-lg font-bold text-muted-foreground tabular-nums">{sysQty}</p>
                            </div>

                            {/* Arrow */}
                            <ArrowRight size={16} className="text-muted-foreground/50 shrink-0" />

                            {/* Actual input */}
                            <div className="shrink-0 w-24">
                              <p className="text-xs text-muted-foreground/70 uppercase font-medium text-center">Actual</p>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={row.actualQty}
                                onChange={(e) => updateRow(row._key, { actualQty: e.target.value })}
                                className={`w-full px-3 py-1.5 rounded-lg border text-center font-bold text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/60 ${
                                  hasChange
                                    ? diff > 0 ? "border-success/30 text-success bg-white" : "border-danger/30 text-danger bg-white"
                                    : "border-input text-foreground"
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
                              className="p-1.5 hover:bg-danger-muted rounded-lg transition-colors shrink-0"
                              title="Remove item"
                            >
                              <Trash2 size={14} className="text-muted-foreground/70 hover:text-danger" />
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
                  <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-border overflow-hidden">
                    <div className="p-4 border-b border-border">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
                        <input
                          type="text"
                          autoFocus
                          placeholder="Search items by name, code, or category..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                        />
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {filteredStock.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground/70">
                          {searchQuery ? "No matching items found" : "All items have been added"}
                        </div>
                      ) : (
                        filteredStock.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => addItem(item)}
                            className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-primary-muted/60 transition-colors border-b border-border/60 last:border-0"
                          >
                            <div className={`p-1.5 rounded-lg shrink-0 ${item.type === "DRUG" ? "bg-primary-muted" : "bg-warning-muted"}`}>
                              {item.type === "DRUG" ? <Pill size={14} className="text-primary" /> : <Package size={14} className="text-warning" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Stock: {item.currentStock} {item.unit}
                                {item.category ? ` · ${item.category}` : ""}
                              </p>
                            </div>
                            <Plus size={16} className="text-primary shrink-0" />
                          </button>
                        ))
                      )}
                    </div>
                    <div className="p-3 border-t border-border bg-muted/50">
                      <button
                        onClick={() => setShowItemPicker(false)}
                        className="w-full py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
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
        <div className="px-6 py-4 border-t border-border flex items-center justify-between shrink-0 bg-muted/80">
          <button
            onClick={() => {
              if (step === 1) onClose();
              else setStep((s) => (s - 1) as any);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft size={14} />
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step < 3 ? (
            <button
              disabled={(step === 1 && !locationId) || (step === 2 && !reason)}
              onClick={() => setStep((s) => (s + 1) as any)}
              className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              Continue <ArrowRight size={14} />
            </button>
          ) : (
            <button
              disabled={validRows.length === 0 || submitting}
              onClick={handleSubmit}
              className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
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
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg shadow-2xl flex flex-col h-full border-l border-border">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-md border border-border text-muted-foreground font-bold">
                  {adjustment.adjustmentCode}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${sc.cls}`}>
                  {sc.icon} {sc.label}
                </span>
              </div>
              <h3 className="text-lg font-bold text-foreground">
                {r.icon} {r.label}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                <MapPin size={11} /> {adjustment.location.name}
                <span className="text-muted-foreground/50">·</span>
                <CalendarDays size={11} /> {fmtDate(adjustment.createdAt)}
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors">
              <X size={16} className="text-muted-foreground" />
            </button>
          </div>
          {adjustment.notes && (
            <div className="mt-3 bg-warning-muted/60 border border-warning/25 rounded-xl px-3 py-2 text-xs text-warning flex items-start gap-2">
              <FileText size={14} className="shrink-0 mt-0.5 text-warning" />
              {adjustment.notes}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="px-6 py-4 grid grid-cols-3 gap-3 border-b border-border shrink-0">
          <div className="bg-muted/50 rounded-xl p-3 text-center border border-border">
            <p className="text-xl font-bold text-foreground">{adjustment.items.length}</p>
            <p className="text-xs font-medium text-muted-foreground mt-0.5">Items</p>
          </div>
          <div className={`rounded-xl p-3 text-center border ${diff >= 0 ? "bg-success-muted/60 border-success/25" : "bg-danger-muted/60 border-danger/25"}`}>
            <p className={`text-xl font-bold ${diff >= 0 ? "text-success" : "text-danger"}`}>
              {diff >= 0 ? "+" : ""}{diff}
            </p>
            <p className={`text-xs font-medium mt-0.5 ${diff >= 0 ? "text-success" : "text-danger"}`}>Net Change</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center border border-border">
            <p className="text-lg font-bold text-foreground">{fmtCurrency(val)}</p>
            <p className="text-xs font-medium text-muted-foreground mt-0.5">Value</p>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <h4 className="text-xs font-bold text-muted-foreground/70 uppercase tracking-wider mb-3">
            Items ({adjustment.items.length})
          </h4>
          <div className="space-y-2">
            {adjustment.items.map((item, idx) => (
              <div key={item.id ?? idx}
                className="bg-white border border-border rounded-xl p-3.5 flex items-center gap-3 hover:border-primary/30 transition-colors shadow-sm">
                <div className={`p-2 rounded-lg shrink-0 ${item.itemType === "DRUG" ? "bg-primary-muted" : "bg-warning-muted"}`}>
                  {item.itemType === "DRUG" ? <Pill size={14} className="text-primary" /> : <Package size={14} className="text-warning" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{item.itemName}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>System: <strong className="text-foreground">{item.quantitySystem}</strong></span>
                    <ArrowRight size={10} className="text-muted-foreground/50" />
                    <span>Actual: <strong className="text-foreground">{item.quantityActual}</strong></span>
                    <span className="text-muted-foreground/50">·</span>
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
          <div className="px-6 py-5 border-t border-border shrink-0 space-y-3">
            <textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes for approval / rejection..."
              className="w-full px-3 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 resize-none"
            />
            {actionError && <ErrorBanner message={actionError} />}
            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={acting !== null}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-danger/25 text-danger hover:bg-danger-muted/60 font-bold text-sm transition-colors disabled:opacity-40"
              >
                {acting === "reject" ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={acting !== null}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-success text-white hover:bg-success font-bold text-sm transition-colors disabled:opacity-40 shadow-sm"
              >
                {acting === "approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Approve & Apply
              </button>
            </div>
          </div>
        ) : adjustment.approvalNotes ? (
          <div className="px-6 py-4 border-t border-border shrink-0 bg-muted/50">
            <p className="text-xs font-bold text-muted-foreground/70 uppercase mb-1.5">Review Notes</p>
            <p className="text-sm text-muted-foreground">{adjustment.approvalNotes}</p>
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
    <div className="min-h-screen bg-muted">
      {/* Top bar */}
      <div className="bg-white border-b border-border px-2 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary-muted rounded-xl">
            <ClipboardList size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Stock Adjustments</h1>
            <p className="text-xs text-muted-foreground">Reconcile physical counts with system quantities</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchList(); fetchStats(); }}
            className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground border border-transparent hover:border-border"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary transition-colors shadow-sm"
          >
            <Plus size={16} /> New Adjustment
          </button>
        </div>
      </div>

      <div className="px-2 py-1  space-y-2">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Pending Review" value={stats?.pending ?? 0} icon={<Clock size={18} className="text-warning" />} color="bg-warning-muted" sub="Awaiting approval" loading={statsLoading} />
          <StatCard label="Approved" value={stats?.approved ?? 0} icon={<CheckCircle2 size={18} className="text-success" />} color="bg-success-muted" sub="Stock updated" loading={statsLoading} />
          <StatCard label="Rejected" value={stats?.rejected ?? 0} icon={<XCircle size={18} className="text-danger" />} color="bg-danger-muted" sub="Not applied" loading={statsLoading} />
          <StatCard label="This Month" value={stats?.thisMonth ?? 0} icon={<BarChart3 size={18} className="text-primary" />} color="bg-primary-muted" sub="Total adjustments" loading={statsLoading} />
        </div>

        {/* Search + filters */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
            <input
              type="text"
              placeholder="Search by code, location, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded-md">
                <X size={12} className="text-muted-foreground/70" />
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
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white text-muted-foreground border-input hover:bg-muted/50"
                }`}
              >
                {s === "ALL" ? `All${meta.total > 0 ? ` (${meta.total})` : ""}` : STATUS_CFG[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-5 py-3 bg-muted/50 border-b border-border grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
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
            <div className="divide-y divide-border/60">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-5 py-4 grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 items-center">
                  <div className="space-y-1.5">
                    <div className="h-4 w-28 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-40 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                  <div className="h-6 w-24 bg-muted rounded-lg animate-pulse" />
                  <div className="h-5 w-12 bg-muted rounded animate-pulse" />
                  <div className="h-6 w-20 bg-muted rounded-full animate-pulse" />
                  <div className="h-3 w-16 bg-muted rounded animate-pulse ml-auto" />
                </div>
              ))}
            </div>
          )}

          {!listLoading && !listError && adjustments.length === 0 && (
            <div className="text-center py-20 text-muted-foreground/70">
              <ClipboardList size={48} className="mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-bold text-muted-foreground">No adjustments found</p>
              <p className="text-sm mt-1">
                {debouncedSearch || statusFilter !== "ALL"
                  ? "Try clearing your filters"
                  : "Create your first adjustment with the button above"}
              </p>
            </div>
          )}

          {!listLoading && !listError && adjustments.length > 0 && (
            <div className="divide-y divide-border/60">
              {adjustments.map((adj) => {
                const sc = STATUS_CFG[adj.status];
                const r = reasonMeta(adj.reason);
                const diff = totalDiff(adj.items);
                const itemCount = adj._count?.items ?? adj.items.length;

                return (
                  <div
                    key={adj.id}
                    onClick={() => setSelectedAdj(adj)}
                    className="px-5 py-4 grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 items-center hover:bg-primary-muted/50 cursor-pointer transition-colors group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Hash size={13} className="text-muted-foreground/70 shrink-0" />
                        <span className="font-mono text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                          {adj.adjustmentCode}
                        </span>
                        {adj.status === "PENDING" && (
                          <span className="w-2 h-2 bg-warning/80 rounded-full animate-pulse" />
                        )}
                      </div>
                      {adj.notes && (
                        <p className="text-xs text-muted-foreground/70 truncate mt-1 max-w-xs pl-5">{adj.notes}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 size={13} className="text-muted-foreground/70 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{adj.location.name}</p>
                        <p className="text-xs text-muted-foreground">{adj.location.type}</p>
                      </div>
                    </div>

                    <div>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border ${REASON_BADGE_CLASS[adj.reason]}`}>
                        {r.icon} {r.label}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-foreground">{itemCount}</p>
                      <div className="mt-1"><DiffBadge diff={diff} /></div>
                    </div>

                    <div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${sc.cls}`}>
                        {sc.icon} {sc.label}
                      </span>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-semibold text-muted-foreground">{timeAgo(adj.createdAt)}</p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{fmtDate(adj.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!listLoading && meta.totalPages > 1 && (
            <div className="px-5 py-4 border-t border-border flex items-center justify-between bg-muted/50">
              <p className="text-sm text-muted-foreground font-medium">
                {Math.min((meta.page - 1) * meta.limit + 1, meta.total)}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={meta.page === 1}
                  className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-input disabled:opacity-30 transition-all"
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
                      <span key={`e-${idx}`} className="px-1 text-muted-foreground/70 text-sm">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={`w-8 h-8 rounded-xl text-sm font-bold transition-all border ${
                          meta.page === p
                            ? "bg-primary text-white border-primary shadow-sm"
                            : "bg-white hover:bg-muted/50 text-muted-foreground border-input"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  disabled={meta.page === meta.totalPages}
                  className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-input disabled:opacity-30 transition-all"
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