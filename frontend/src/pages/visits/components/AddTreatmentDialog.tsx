// src/pages/visits/components/AddTreatmentDialog.tsx
// ─────────────────────────────────────────────────────────────────────────────
// REFACTORED: Condensed right sidebar — Visit Sessions + Pricing in 2-col row,
// smaller controls, tighter spacing, no scroll needed in typical use.
// Font sizes increased for improved readability.
// ─────────────────────────────────────────────────────────────────────────────

import {
  estimateProcedureCost,
  deriveQuantity,
} from "../../../utils/procedurePricing";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Plus,
  Search,
  Loader2,
  ClipboardList,
  AlertCircle,
  History,
  FileText,
  Stethoscope,
  CalendarDays,
  Repeat,
  CreditCard,
  Wallet,
  Banknote,
  ChevronRight,
  Sparkles,
  Minus,
  Hash,
  Tag,
  Pencil,
  DollarSign,
  Receipt,
  RotateCcw,
  PlusCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { treatmentPlansApi } from "../../../lib/api/treatment-plans";
import { chartEntriesApi } from "../../../lib/api/chart-entries";
import { staffApi } from "../../../lib/api/staff-api";
import type {
  AddProcedurePayload,
  ProcedureCatalogItem,
  PricingUnit,
} from "../../../types/treatment-plans";
import api from "@/lib/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { CompactSurfacePicker } from "./SurfacePicker";
import {
  uiToCanonical,
  type UiSurface,
  type CanonicalSurface,
} from "../../../lib/dental/notation";

// ── Type Definitions ────────────────────────────────────────────────────────
type Currency = "USD" | "UGX";

const DEFAULT_EXCHANGE_RATE = 3600;

const getCategoryString = (
  cat: string | { id: string; name: string; color?: string } | undefined,
): string | undefined => {
  if (typeof cat === "string") return cat;
  if (cat && typeof cat === "object" && "id" in cat) return cat.id;
  return undefined;
};

function fmtUGX(n: number | undefined | null): string {
  return `UGX ${Math.round(n ?? 0).toLocaleString()}`;
}

// ── Interface Definitions ───────────────────────────────────────────────────
interface ExistingProcedureItem {
  id: string;
  name: string;
  code: string;
  category?: string;
  defaultSurfaces?: string[];
}

interface AddTreatmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTeeth: number[];
  patientId: string;
  visitId: string;
  dentistId?: string;
  hasActivePlan: boolean;
  onSuccess: () => void;
}

function toCanonicalSurfaces(
  uiSurfaces: UiSurface[],
  fdi: number,
): CanonicalSurface[] {
  return uiSurfaces.map((s) => uiToCanonical(s, fdi));
}

// ── Shared compact label style ───────────────────────────────────────────────
const S = {
  label: {
    fontSize: 12, // increased from 10
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.4px",
    marginBottom: 4,
    display: "block",
  } as React.CSSProperties,
  sectionHeader: {
    fontSize: 13, // increased from 11
    fontWeight: 700,
    color: "#0369a1",
    margin: 0,
    letterSpacing: "0.3px",
  } as React.CSSProperties,
  sectionSub: {
    fontSize: 12, // increased from 9
    color: "#305d71",
    margin: "1px 0 0",
    fontWeight: 600,
  } as React.CSSProperties,
  iconBox: (active = false): React.CSSProperties => ({
    width: 24,
    height: 24,
    borderRadius: 6,
    background: active ? "#0369a1" : "#e0f2fe",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  }),
  pill: (active: boolean): React.CSSProperties => ({
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px", // slightly more padding
    borderRadius: 7,
    border: `1.5px solid ${active ? "#0369a1" : "#bae6fd"}`,
    background: active ? "#0369a1" : "#fff",
    color: active ? "#fff" : "#0369a1",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.12s ease",
    boxShadow: active ? "0 3px 8px rgba(3,105,161,0.22)" : "0 1px 2px rgba(3,105,161,0.06)",
  }),
};

// ── Main Component ──────────────────────────────────────────────────────────
export function AddTreatmentDialog({
  isOpen,
  onClose,
  selectedTeeth,
  patientId,
  visitId,
  dentistId,
  hasActivePlan,
  onSuccess,
}: AddTreatmentDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"new" | "existing">("new");

  // ════════════════ NEW TREATMENT STATE ════════════════
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [procSearch, setProcSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedProc, setSelectedProc] = useState<ProcedureCatalogItem | null>(null);
  const [surfaces, setSurfaces] = useState<UiSurface[]>([]);
  const [quantityOverride, setQuantityOverride] = useState<number | null>(null);
  const [priceOverride, setPriceOverride] = useState<number | null>(null);

  const { data: liveRateData } = useQuery({
    queryKey: ["exchange-rate", "USD", "UGX"],
    queryFn: () =>
      api
        .get("/billing/currencies/rate", { params: { from: "USD", to: "UGX" } })
        .then((r) => r.data as { rate: number }),
    enabled: isOpen,
    staleTime: 60 * 60 * 1000,
  });
  const exchangeRate =
    typeof liveRateData?.rate === "number" && liveRateData.rate > 0
      ? liveRateData.rate
      : DEFAULT_EXCHANGE_RATE;

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [sessionType, setSessionType] = useState<"SINGLE" | "MULTI">("SINGLE");
  const [sessionCount, setSessionCount] = useState(2);
  const [billingType, setBillingType] = useState<"PAY_FULL" | "PAY_PARTIALLY">("PAY_FULL");
  const [partialAmount, setPartialAmount] = useState<number | null>(null);
  const [partialAmountCurrency, setPartialAmountCurrency] = useState<Currency>("UGX");
  const [linkedConditionIds, setLinkedConditionIds] = useState<string[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(dentistId ?? "");

  // ════════════════ PRICING ════════════════
  const pricingUnit: PricingUnit = (selectedProc?.pricingModel ?? "FIXED") as PricingUnit;
  const currency = (selectedProc?.currency ?? "UGX") as Currency;
  const isUSD = currency === "USD";
  const basePrice = selectedProc?.basePrice ?? 0;
  const autoQty = selectedProc ? deriveQuantity(pricingUnit, selectedTeeth) : 1;
  const quantity = quantityOverride ?? autoQty;
  const pricingModel = (selectedProc?.pricingModel ?? "FIXED") as PricingUnit;
  const pricing = selectedProc
    ? estimateProcedureCost(basePrice, pricingModel, currency, quantity, exchangeRate)
    : null;

  const finalPrice = useMemo(() => {
    if (priceOverride !== null) return priceOverride;
    if (!pricing) return 0;
    return pricing.totalPrice ?? 0;
  }, [priceOverride, pricing]);

  const fmtPrice = (n: number | undefined | null): string => {
    if (n == null) return currency === "USD" ? "USD 0" : "UGX 0";
    const num = Number(n);
    if (isNaN(num)) return currency === "USD" ? "USD 0" : "UGX 0";
    return currency === "USD"
      ? `USD ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `UGX ${Math.round(num).toLocaleString()}`;
  };

  const perSessionPrice =
    sessionType === "MULTI" && sessionCount > 0
      ? Math.ceil(finalPrice / sessionCount)
      : finalPrice;
  const needsTeeth = ["PER_TOOTH", "PER_ARCH"].includes(pricingUnit);

  const depositInProcCurrency = useMemo((): number | null => {
    if (partialAmount == null || partialAmount <= 0) return null;
    if (partialAmountCurrency === currency) return partialAmount;
    if (partialAmountCurrency === "USD" && currency === "UGX")
      return Math.round(partialAmount * exchangeRate);
    if (partialAmountCurrency === "UGX" && currency === "USD")
      return partialAmount / exchangeRate;
    return partialAmount;
  }, [partialAmount, partialAmountCurrency, currency, exchangeRate]);

  const maxDepositInDepositCurrency = useMemo((): number => {
    if (partialAmountCurrency === currency) return finalPrice;
    if (partialAmountCurrency === "USD" && currency === "UGX")
      return finalPrice / exchangeRate;
    if (partialAmountCurrency === "UGX" && currency === "USD")
      return finalPrice * exchangeRate;
    return finalPrice;
  }, [partialAmountCurrency, currency, finalPrice, exchangeRate]);

  const fmtDepositCur = (n: number) =>
    partialAmountCurrency === "USD"
      ? `USD ${n.toFixed(2)}`
      : `UGX ${Math.round(n).toLocaleString()}`;

  useEffect(() => {
    if (dentistId) setSelectedProviderId(dentistId);
  }, [dentistId]);

  useEffect(() => {
    setPartialAmountCurrency(currency);
    setPartialAmount(null);
  }, [currency]);

  // ════════════════ EXISTING TAB STATE ════════════════
  const [existingProcSearch, setExistingProcSearch] = useState("");
  const [existingSelectedCategory, setExistingSelectedCategory] = useState("");
  const [selectedExistingProc, setSelectedExistingProc] = useState<ExistingProcedureItem | null>(null);
  const [existingSurfaces, setExistingSurfaces] = useState<UiSurface[]>([]);
  const [existingNotes, setExistingNotes] = useState("");
  const [submittingExisting, setSubmittingExisting] = useState(false);
  const [isEditingPrice, setIsEditingPrice] = useState(false);

  // ════════════════ QUERIES ════════════════
  const { data: dentists = [] } = useQuery({
    queryKey: ["dentists"],
    queryFn: staffApi.getDentists,
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data: fullCatalog = [], isLoading: fullCatalogLoading } = useQuery<ProcedureCatalogItem[]>({
    queryKey: ["full-procedure-catalog"],
    queryFn: () => api.get("/treatment-plans/catalog/search").then((res) => res.data),
    enabled: isOpen && activeTab === "existing",
  });

  const filteredFullCatalog = useMemo(() => {
    let filtered = fullCatalog;
    if (existingProcSearch.trim()) {
      const s = existingProcSearch.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(s) || p.code?.toLowerCase().includes(s),
      );
    }
    if (existingSelectedCategory) {
      filtered = filtered.filter((p) => p.category === existingSelectedCategory);
    }
    return filtered;
  }, [fullCatalog, existingProcSearch, existingSelectedCategory]);

  const {
    data: plans = [],
    isLoading: plansLoading,
    refetch: refetchPlans,
  } = useQuery({
    queryKey: ["tx-plans", patientId],
    queryFn: () => treatmentPlansApi.getPatientPlans(patientId),
    enabled: !!patientId && isOpen && activeTab === "new",
  });

  const { data: catalog = [], isLoading: catalogLoading } = useQuery<ProcedureCatalogItem[]>({
    queryKey: ["procedure-catalog", procSearch, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (procSearch) params.set("q", procSearch);
      if (selectedCategory) params.set("category", selectedCategory);
      const response = await api.get(`/treatment-plans/catalog/search?${params.toString()}`);
      return response.data;
    },
    enabled: isOpen && activeTab === "new",
  });

  const { data: patientConditions = [] } = useQuery({
    queryKey: ["patient-conditions-for-teeth", patientId, selectedTeeth],
    queryFn: () => treatmentPlansApi.getPatientConditionsForTeeth(patientId, selectedTeeth),
    enabled:
      isOpen &&
      activeTab === "new" &&
      !!patientId &&
      patientId !== "demo" &&
      selectedTeeth.length > 0,
  });

  const { data: categories = [] } = useQuery<{ category: string; count: number }[]>({
    queryKey: ["procedure-categories"],
    queryFn: () => api.get("/treatment-plans/catalog/categories").then((res) => res.data),
    enabled: isOpen,
  });

  // ════════════════ MUTATIONS ════════════════
  const createPlanMut = useMutation({
    mutationFn: () => {
      const payload: any = { patientId, title: newPlanTitle };
      const providerId = selectedProviderId?.trim() || dentistId?.trim();
      if (providerId && providerId !== "undefined") {
        payload.dentistId = providerId;
      }
      return treatmentPlansApi.createPlan(payload);
    },
    onSuccess: (plan: any) => {
      setSelectedPlanId(plan.id);
      setShowCreatePlan(false);
      setNewPlanTitle("");
      queryClient.invalidateQueries({ queryKey: ["tx-plans", patientId] });
      refetchPlans();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to create plan. Please try again.";
      setApiError(msg);
    },
  });

  const addProcedureMut = useMutation({
    mutationFn: async ({
      payload,
      idempotencyKey,
    }: {
      payload: AddProcedurePayload;
      idempotencyKey: string;
    }) => {
      if (!selectedPlanId && !hasActivePlan) throw new Error("No plan selected");
      let planId = selectedPlanId;
      if (!planId && hasActivePlan) {
        const plans = await treatmentPlansApi.getPatientPlans(patientId);
        const active = plans.find(
          (p: any) => p.status === "PLANNED" || p.status === "IN_PROGRESS",
        );
        planId = active?.id || null;
      }
      if (!planId) throw new Error("No plan selected");
      return treatmentPlansApi.addProcedure(planId, payload, idempotencyKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tx-plan", selectedPlanId] });
      queryClient.invalidateQueries({ queryKey: ["tx-plans", patientId] });
      queryClient.invalidateQueries({ queryKey: ["chart-entries", patientId, visitId] });
      onSuccess();
      resetNewForm();
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to add procedure. Please try again.";
      setApiError(msg);
    },
  });

  const addExistingProcedureMut = useMutation({
    mutationFn: async (data: {
      toothNumbers: number[];
      surfaces: CanonicalSurface[];
      procedureId: string;
      procedureName: string;
      procedureCode: string;
      notes?: string;
    }) => {
      const promises = data.toothNumbers.map((toothNumber) =>
        chartEntriesApi.addExistingProcedure({
          type: "EXISTING",
          patientId,
          visitId,
          toothNumber,
          surfaces: data.surfaces,
          procedureId: data.procedureId,
          procedureName: data.procedureName,
          procedureCode: data.procedureCode,
          notes: data.notes,
          providerId: selectedProviderId || undefined,
        }),
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chart-entries", patientId, visitId] });
      queryClient.invalidateQueries({ queryKey: ["tx-plans", patientId] });
      onSuccess();
      resetExistingForm();
      onClose();
    },
    onError: (err: any) => {
      console.error("Error adding existing procedure:", err);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to add existing procedure. Please try again.";
      setApiError(msg);
    },
  });

  // ════════════════ RESET ════════════════
  const resetNewForm = () => {
    setProcSearch(""); setSelectedCategory(""); setSelectedProc(null);
    setSurfaces([]); setQuantityOverride(null); setPriceOverride(null);
    setIsEditingPrice(false); setNotes(""); setSessionType("SINGLE");
    setSessionCount(2); setBillingType("PAY_FULL"); setPartialAmount(null);
    setPartialAmountCurrency("UGX"); setSubmitting(false); setSelectedPlanId(null);
    setShowCreatePlan(false); setNewPlanTitle(""); setLinkedConditionIds([]);
    setSelectedProviderId(dentistId ?? "");
    setApiError(null);
  };

  const resetExistingForm = () => {
    setExistingProcSearch(""); setExistingSelectedCategory("");
    setSelectedExistingProc(null); setExistingSurfaces([]);
    setExistingNotes(""); setSubmittingExisting(false);
  };

  // ════════════════ HANDLERS ════════════════
  const handleAddNewProcedure = async () => {
    if (!selectedProc) {
      setApiError("Please select a procedure first");
      return;
    }
    if (!hasActivePlan && !selectedPlanId) {
      setApiError("Please select or create a treatment plan first");
      return;
    }
    setSubmitting(true);
    setApiError(null);
    try {
      const refTooth = selectedTeeth[0] ?? 11;
      const canonicalSurfaces = toCanonicalSurfaces(surfaces, refTooth);
      const payload: AddProcedurePayload = {
        procedureId: selectedProc.id,
        toothNumbers: selectedTeeth,
        surfaces: canonicalSurfaces,
        totalPrice: priceOverride ?? finalPrice ?? 0,
        currency: selectedProc.currency as Currency,
        pricePerUnit: pricing?.pricePerUnit,
        quantity: pricing?.quantity,
        subtotalPrice: pricing?.subtotalPrice,
        discountAmount: pricing?.discountAmount ?? 0,
        subtotalCost: pricing?.subtotalCost,
        costPerUnit: pricing?.costPerUnit,
        ...(isUSD && {
          exchangeRate,
          baseAmount: pricing?.baseAmount ?? finalPrice * exchangeRate,
        }),
        visitGroup: 1,
        sequence: 0,
        sessionType,
        billingType,
        sessionCount: sessionType === "MULTI" ? sessionCount : 1,
        providerId: selectedProviderId || undefined,
        linkedConditionIds: linkedConditionIds.length > 0 ? linkedConditionIds : undefined,
        visitId,
        notes: notes || undefined,
        isPriceOverridden: priceOverride !== null,
        // Payment Type + deposit are INDEPENDENT of session count.
        //   • billingType is always sent (PAY_FULL | PAY_PARTIALLY).
        //   • initialPaymentAmount / initialPaymentCurrency are only sent
        //     when PAY_PARTIALLY is selected AND the user entered a deposit
        //     > 0. For PAY_FULL we send nothing — the full price is billed
        //     at completion by the existing invoice pipeline.
        initialPaymentAmount:
          billingType === "PAY_PARTIALLY" && partialAmount != null && partialAmount > 0
            ? partialAmount
            : undefined,
        initialPaymentCurrency:
          billingType === "PAY_PARTIALLY" && partialAmount != null && partialAmount > 0
            ? partialAmountCurrency
            : undefined,
      };
      // Generate the Idempotency-Key once per submission attempt. If the
      // network blips and TanStack retries the mutation, the same key is
      // reused and the backend replays the original response instead of
      // creating a duplicate TreatmentProcedure row.
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await addProcedureMut.mutateAsync({ payload, idempotencyKey });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to add procedure. Please try again.";
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddExistingProcedure = async () => {
    if (!selectedExistingProc) {
      setApiError("Please select a procedure first");
      return;
    }
    if (selectedTeeth.length === 0) {
      setApiError("Please select at least one tooth");
      return;
    }
    setSubmittingExisting(true);
    setApiError(null);
    try {
      const refTooth = selectedTeeth[0] ?? 11;
      const canonicalSurfaces = toCanonicalSurfaces(existingSurfaces, refTooth);
      await addExistingProcedureMut.mutateAsync({
        toothNumbers: selectedTeeth,
        surfaces: canonicalSurfaces,
        procedureId: selectedExistingProc.id,
        procedureName: selectedExistingProc.name,
        procedureCode: selectedExistingProc.code,
        notes: existingNotes || undefined,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to add existing procedure. Please try again.";
      setApiError(msg);
    } finally {
      setSubmittingExisting(false);
    }
  };

  // ════════════════ DERIVED ════════════════
  const toothLabel =
    selectedTeeth.length === 1
      ? `Tooth ${selectedTeeth[0]}`
      : selectedTeeth.length > 0
        ? `${selectedTeeth.length} teeth`
        : "No teeth selected";

  if (!isOpen) return null;

  // ════════════════ STYLES ════════════════
  const inp: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    fontSize: 13, // increased from 11
    border: "1px solid #e5e7eb",
    borderRadius: 5,
    outline: "none",
    background: "#fff",
    color: "#1e293b",
    boxSizing: "border-box",
  };

  const leftColumnStyle: React.CSSProperties = {
    width: 480, // slightly wider for larger font
    minWidth: 480,
    borderRight: "1px solid #e2e8f0",
    paddingRight: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const rightColumnStyle: React.CSSProperties = {
    flex: 1,
    paddingLeft: 2,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflowY: "auto",
    paddingRight: 2,
  };

  const scrollableListStyle: React.CSSProperties = {
    overflowY: "auto",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    minHeight: 0,
  };

  // Compact card wrapper
  const card = (bg: string, border: string): React.CSSProperties => ({
    background: bg,
    borderRadius: 8,
    border: `1px solid ${border}`,
    padding: "10px 12px", // slightly more padding
  });

  // ════════════════ RENDER ════════════════
  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
      role="dialog" aria-modal="true" aria-labelledby="dialog-title"
    >
      <div
        style={{
          width: 1240, // slightly wider
          maxWidth: "100vw", height: "88vh",
          backgroundColor: "#fff", borderRadius: 12,
          boxShadow: "0 10px 15px -5px rgba(0,0,0,0.1)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{ background: "linear-gradient(135deg,#0369a1,#0284c7)", color: "#fff", padding: "8px 18px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h3 id="dialog-title" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              Add Treatment Procedure
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, opacity: 0.85, background: "rgba(255,255,255,0.15)", padding: "2px 8px", borderRadius: 4 }}>
                {toothLabel}
              </span>
            </h3>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 4, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Close dialog">
              <X size={18} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 1 }} role="tablist">
            {[
              { key: "new" as const, label: "New Treatment", Icon: Plus },
              { key: "existing" as const, label: "Existing Procedures", Icon: History },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                role="tab"
                aria-selected={activeTab === key}
                style={{
                  padding: "6px 14px",
                  background: activeTab === key ? "rgba(255,255,255,0.2)" : "transparent",
                  border: "none", borderRadius: 5, color: "#fff",
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                <Icon size={14} />{label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Inline error banner (replaces alert()) ── */}
        {apiError && (
          <div style={{ padding: "8px 18px 0", flexShrink: 0 }}>
            <Alert variant="destructive" data-testid="add-procedure-error">
              <AlertTitle>Unable to add procedure</AlertTitle>
              <AlertDescription>{apiError}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* ── Body ── */}
        <div style={{ flex: 1, overflow: "hidden", padding: "14px 18px" }}>
          <div style={{ display: "flex", gap: 14, height: "100%" }}>

            {/* ──────── LEFT: Procedure list ──────── */}
            <div style={leftColumnStyle}>
              <div>
                <label style={S.label}>{activeTab === "new" ? "Search Procedure" : "Search Existing"}</label>
                <div style={{ position: "relative" }}>
                  <Search size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#2d333e", pointerEvents: "none" }} />
                  <input
                    value={activeTab === "new" ? procSearch : existingProcSearch}
                    onChange={(e) => {
                      if (activeTab === "new") { setProcSearch(e.target.value); setSelectedProc(null); }
                      else { setExistingProcSearch(e.target.value); setSelectedExistingProc(null); }
                    }}
                    placeholder="Type to search procedures..."
                    style={{ ...inp, paddingLeft: 28, borderRadius: 7, fontSize: 14 }}
                  />
                </div>
              </div>

              {categories.length > 0 && (
                <select
                  value={activeTab === "new" ? selectedCategory : existingSelectedCategory}
                  onChange={(e) => {
                    if (activeTab === "new") setSelectedCategory(e.target.value);
                    else { setExistingSelectedCategory(e.target.value); setSelectedExistingProc(null); }
                  }}
                  style={{ ...inp, cursor: "pointer", borderRadius: 7, fontSize: 12 }}
                >
                  <option value="">All Categories</option>
                  {categories.map((cat: any) => (
                    <option key={cat.id || cat.category} value={cat.id || cat.category}>
                      {cat.name || cat.category}
                    </option>
                  ))}
                </select>
              )}

              <div style={{ ...scrollableListStyle }}>
                {activeTab === "new" ? (
                  catalogLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
                      <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "#3b82f6" }} />
                    </div>
                  ) : catalog.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px", color: "#9ca3af" }}>
                      <AlertCircle size={30} style={{ marginBottom: 6, opacity: 0.5 }} />
                      <p style={{ fontSize: 12 }}>No procedures found</p>
                    </div>
                  ) : (
                    catalog.map((proc: ProcedureCatalogItem) => {
                      const displayPrice = Number(proc.basePrice ?? 0);
                      const pm = proc.pricingModel || "FIXED";
                      const isSelected = selectedProc?.id === proc.id;
                      return (
                        <button
                          key={proc.id} type="button"
                          onClick={() => { setSelectedProc(proc); setProcSearch(proc.name); }}
                          style={{
                            width: "100%", textAlign: "left", padding: "8px 10px",
                            borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                            background: isSelected ? "#eff6ff" : "transparent", border: "none",
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "#eff6ff"; }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 14, fontWeight: 500, color: "#1e293b", margin: 0 }}>{proc.name}</p>
                              {proc.code && (
                                <span style={{ fontSize: 11, fontFamily: "monospace", color: "#2563eb", background: "#eff6ff", padding: "1px 5px", borderRadius: 3, display: "inline-block", marginTop: 2 }}>
                                  {proc.code}
                                </span>
                              )}
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 6 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: 0 }}>
                                {proc.currency === "USD" ? "USD " : "UGX "}{displayPrice.toLocaleString("en-US")}
                              </p>
                              {pm !== "FIXED" && (
                                <p style={{ fontSize: 11, color: "#3b82f6", margin: 0 }}>
                                  {pm === "PER_TOOTH" ? "/tooth" : pm === "PER_ARCH" ? "/arch" : pm === "PER_BRACKET" ? "/bracket" : "/unit"}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )
                ) : fullCatalogLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
                    <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "#059669" }} />
                  </div>
                ) : filteredFullCatalog.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px", color: "#9ca3af" }}>
                    <AlertCircle size={30} style={{ marginBottom: 6, opacity: 0.5 }} />
                    <p style={{ fontSize: 12 }}>No procedures found</p>
                  </div>
                ) : (
                  filteredFullCatalog.map((proc: ProcedureCatalogItem) => (
                    <button
                      key={proc.id} type="button"
                      onClick={() => {
                        setSelectedExistingProc({ id: proc.id, name: proc.name, code: proc.code || "", category: getCategoryString(proc.category) });
                        setExistingProcSearch(proc.name);
                      }}
                      style={{
                        width: "100%", textAlign: "left", padding: "8px 10px",
                        borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                        background: selectedExistingProc?.id === proc.id ? "#f0fdf4" : "transparent",
                        border: "none",
                      }}
                      onMouseEnter={(e) => { if (selectedExistingProc?.id !== proc.id) e.currentTarget.style.backgroundColor = "#f0fdf4"; }}
                      onMouseLeave={(e) => { if (selectedExistingProc?.id !== proc.id) e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 500, color: "#1e293b", margin: 0 }}>{proc.name}</p>
                      {proc.code && (
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#059669", background: "#d1fae5", padding: "1px 5px", borderRadius: 3, display: "inline-block", marginTop: 2 }}>
                          {proc.code}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* ──────── RIGHT: Details ──────── */}
            <div style={rightColumnStyle}>
              {activeTab === "new" && (
                <>
                  {/* ── Provider + Plan row ── */}
                  <div style={{ display: "flex", gap: 8 }}>
                    {/* Provider */}
                    <div style={{ ...card("#f0f9ff", "#bae6fd"), flex: 1, minWidth: 0 }}>
                      <label style={{ ...S.label, color: "#0369a1", marginBottom: 4 }}>
                        <Stethoscope size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                        Provider
                      </label>
                      <div style={{ position: "relative" }}>
                        <Stethoscope size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
                        <select
                          value={selectedProviderId}
                          onChange={(e) => setSelectedProviderId(e.target.value)}
                          style={{ ...inp, paddingLeft: 24, cursor: "pointer", fontSize: 12 }}
                        >
                          <option value="">— No provider —</option>
                          {(dentists as any[]).map((d) => (
                            <option key={d.id} value={d.id}>
                              Dr. {d.firstName} {d.lastName}{d.specialization ? ` — ${d.specialization}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Plan (only if no active plan) */}
                    {!hasActivePlan && (
                      <div style={{ ...card("#fffbeb", "#fcd34d"), flex: 1, minWidth: 0 }}>
                        <label style={{ ...S.label, color: "#92400e", marginBottom: 4 }}>Treatment Plan</label>
                        {plansLoading ? (
                          <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
                            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                          </div>
                        ) : (
                          <>
                            <select
                              value={selectedPlanId || ""}
                              onChange={(e) => setSelectedPlanId(e.target.value || null)}
                              style={{ ...inp, border: "1px solid #fcd34d", cursor: "pointer", fontSize: 12 }}
                            >
                              <option value="">-- Select plan --</option>
                              {plans.map((plan: any) => (
                                <option key={plan.id} value={plan.id}>
                                  {plan.title} ({plan.status?.toLowerCase() || "planned"})
                                </option>
                              ))}
                            </select>
                            {!showCreatePlan && (
                              <button
                                onClick={() => setShowCreatePlan(true)}
                                style={{ marginTop: 5, fontSize: 12, color: "#d97706", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
                              >
                                <PlusCircle size={13} /> New plan
                              </button>
                            )}
                          </>
                        )}
                        {showCreatePlan && (
                          <div style={{ marginTop: 5 }}>
                            <input
                              type="text" placeholder="Plan name..." value={newPlanTitle}
                              onChange={(e) => setNewPlanTitle(e.target.value)}
                              style={{ ...inp, border: "1px solid #fcd34d", marginBottom: 4, fontSize: 12 }}
                              autoFocus
                            />
                            {(!newPlanTitle.trim() || !selectedProviderId.trim()) && (
                              <p style={{ fontSize: 10, color: "#dc2626", margin: "0 0 4px 0", display: "flex", alignItems: "center", gap: 3 }}>
                                <AlertCircle size={10} />
                                {!newPlanTitle.trim() && !selectedProviderId.trim() ? "Name & provider required" : !newPlanTitle.trim() ? "Plan name required" : "Select provider first"}
                              </p>
                            )}
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => createPlanMut.mutate()}
                                disabled={!newPlanTitle.trim() || !selectedProviderId.trim() || createPlanMut.isPending}
                                style={{ flex: 1, padding: "5px 8px", background: "#d97706", color: "#fff", border: "none", borderRadius: 5, fontSize: 11, cursor: "pointer", opacity: (!newPlanTitle.trim() || !selectedProviderId.trim() || createPlanMut.isPending) ? 0.7 : 1 }}
                              >
                                {createPlanMut.isPending ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : "Create"}
                              </button>
                              <button
                                onClick={() => setShowCreatePlan(false)}
                                style={{ flex: 1, padding: "5px 8px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 5, fontSize: 11, cursor: "pointer" }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Teeth + Surfaces ── */}
                  {selectedProc && selectedTeeth.length > 0 && (
                    <div style={{ ...card("#f8fafc", "#e2e8f0") }}>
                      {/* Tooth chips */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <label style={{ ...S.label, marginBottom: 0, flexShrink: 0 }}>
                          Teeth
                        </label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {selectedTeeth.sort((a, b) => a - b).map((t) => (
                            <span
                              key={t}
                              style={{
                                padding: "2px 8px",
                                background: "#dbeafe",
                                color: "#1d4ed8",
                                fontSize: 13,
                                fontWeight: 600,
                                borderRadius: 4,
                                border: "1px solid #bfdbfe",
                                letterSpacing: "0.2px",
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Divider */}
                      <div style={{ borderTop: "1px solid #e2e8f0", marginBottom: 8 }} />
                      <label style={S.label}>Surfaces <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, color: "#94a3b8" }}>(Optional)</span></label>
                      <CompactSurfacePicker value={surfaces} onChange={setSurfaces} teeth={selectedTeeth} />
                    </div>
                  )}

                  {/* ── Condition links ── */}
                  {selectedProc && patientConditions.length > 0 && (
                    <div style={{ ...card("#f8fafc", "#e2e8f0") }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <label style={S.label}>
                          Link Condition
                          <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 400, color: "#94a3b8", background: "#f1f5f9", padding: "1px 6px", borderRadius: 8 }}>Optional</span>
                        </label>
                        {linkedConditionIds.length > 0 && (
                          <button onClick={() => setLinkedConditionIds([])} style={{ fontSize: 10, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}>Clear all</button>
                        )}
                      </div>
                      <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden", maxHeight: 120, overflowY: "auto" }}>
                        {patientConditions.map((pc: any) => {
                          const isLinked = linkedConditionIds.includes(pc.id);
                          return (
                            <button
                              key={pc.id} type="button"
                              onClick={() => setLinkedConditionIds((prev) => isLinked ? prev.filter((id) => id !== pc.id) : [...prev, pc.id])}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid #f3f4f6", background: isLinked ? "#fef2f2" : "#fff", border: "none", cursor: "pointer", textAlign: "left" }}
                            >
                              <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${isLinked ? "#dc2626" : "#d1d5db"}`, background: isLinked ? "#dc2626" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {isLinked && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: "#1e293b" }}>{pc.condition?.name ?? "Unknown"}</div>
                                <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                                  {pc.toothNumber && <span style={{ fontSize: 10, background: "#dbeafe", color: "#1d4ed8", padding: "0 5px", borderRadius: 3 }}>Tooth {pc.toothNumber}</span>}
                                  {pc.condition?.icd10Code && <span style={{ fontSize: 10, fontFamily: "monospace", color: "#94a3b8" }}>{pc.condition.icd10Code}</span>}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ══════════════════════════════════════════════════════════
                      CONDENSED: Visit Sessions + Pricing — side by side 2-col
                  ══════════════════════════════════════════════════════════ */}
                  {selectedProc && (
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>

                      {/* ── LEFT COLUMN: Sessions (top) + Payment (bottom) ── */}
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>

                        {/* ── Card 1: Visit Sessions (Single / Multi) ── */}
                        <div style={{ background: "linear-gradient(135deg,#f0f9ff,#e0f2fe)", borderRadius: 8, border: "1px solid #bae6fd", padding: "18px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <div style={S.iconBox(true)}><Sparkles size={13} color="#fff" /></div>
                            <div>
                              <p style={S.sectionHeader}>Sessions <span style={S.sectionSub}>(Treatment visits scheduled?)</span></p>
                            </div>
                          </div>

                          {/* Single / Multi toggle — independent of payment */}
                          <div style={{ display: "flex", gap: 6 }}>
                            {[
                              { key: "SINGLE" as const, label: "Single", Icon: CalendarDays },
                              { key: "MULTI" as const, label: "Multi",  Icon: Repeat },
                            ].map((opt) => {
                              const isActive = sessionType === opt.key;
                              return (
                                <button
                                  key={opt.key} type="button"
                                  onClick={() => setSessionType(opt.key)}
                                  style={S.pill(isActive)}
                                  onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = "#f0f9ff"; e.currentTarget.style.borderColor = "#7dd3fc"; } }}
                                  onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#bae6fd"; } }}
                                >
                                  <opt.Icon size={14} color={isActive ? "#fff" : "#0369a1"} />
                                  <span style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</span>
                                  {isActive && <svg style={{ marginLeft: "auto" }} width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke={isActive ? "#fff" : "#0369a1"} strokeWidth="1.5" strokeLinecap="round" /></svg>}
                                </button>
                              );
                            })}

                            {/* Visit count stepper — only when MULTI */}
                            {sessionType === "MULTI" && (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                                <button
                                  type="button"
                                  onClick={() => setSessionCount(Math.max(2, sessionCount - 1))}
                                  style={{ width: 24, height: 24, borderRadius: 5, border: "1px solid #bae6fd", background: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#0369a1" }}
                                >
                                  <Minus size={12} />
                                </button>
                                <input
                                  type="number"
                                  min={2}
                                  max={20}
                                  value={sessionCount}
                                  onChange={(e) => setSessionCount(Math.min(20, Math.max(2, parseInt(e.target.value) || 2)))}
                                  style={{ width: 42, textAlign: "center", padding: "3px 4px", fontSize: 13, fontWeight: 700, borderRadius: 5, border: "1.5px solid #0369a1", outline: "none", color: "#0369a1", background: "#fff" }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setSessionCount(Math.min(20, sessionCount + 1))}
                                  style={{ width: 24, height: 24, borderRadius: 5, border: "1px solid #bae6fd", background: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#0369a1" }}
                                >
                                  <Plus size={12} />
                                </button>
                                <span style={{ fontSize: 11, color: "#64748b", marginLeft: 4 }}>visits</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Card 2: Payment Type — independent of session count ── */}
                        <div style={{ background: "linear-gradient(135deg,#fff7ed,#fef3c7)", borderRadius: 8, border: "1px solid #fcd34d", padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <div style={{ width: 24, height: 24, borderRadius: 6, background: "#d97706", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Banknote size={13} color="#fff" />
                            </div>
                            <div>
                              <p style={{ ...S.sectionHeader, color: "#92400e" }}>Payment Type</p>
                              {/* <p style={{ fontSize: 9, color: "#b45309", margin: 0, fontWeight: 600 }}>
                                Always saved with the procedure
                              </p> */}
                            </div>
                          </div>

                          {/* Pay Full / Pay Partially — always visible */}
                          <div style={{ display: "flex", gap: 5, marginBottom: billingType === "PAY_PARTIALLY" ? 8 : 0 }}>
                            {[
                              { key: "PAY_FULL" as const, label: "Pay in Full", Icon: Banknote },
                              { key: "PAY_PARTIALLY" as const, label: "Pay Partially", Icon: Wallet },
                            ].map((opt) => {
                              const isActive = billingType === opt.key;
                              return (
                                <button
                                  key={opt.key} type="button"
                                  onClick={() => { setBillingType(opt.key); if (opt.key === "PAY_PARTIALLY") setPartialAmount(null); }}
                                  style={{ ...S.pill(isActive), flex: 1, padding: "6px 8px" }}
                                  onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = "#fff7ed"; e.currentTarget.style.borderColor = "#fcd34d"; } }}
                                  onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#fcd34d"; } }}
                                >
                                  <opt.Icon size={13} color={isActive ? "#fff" : "#d97706"} />
                                  <span style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Partial deposit — visible whenever Pay Partially is picked,
                              regardless of SINGLE vs MULTI sessions. */}
                          {billingType === "PAY_PARTIALLY" && (
                            <div style={{ background: "#fff", borderRadius: 6, border: "1px solid #fde68a", padding: "8px 10px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                                <CreditCard size={12} color="#d97706" />
                                <label style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>Amount To Pay Now</label>
                              </div>
                              <div style={{ position: "relative" }}>
                                <input
                                  type="number"
                                  min={1}
                                  max={maxDepositInDepositCurrency}
                                  step={partialAmountCurrency === "USD" ? 0.01 : 1}
                                  value={partialAmount ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setPartialAmount(
                                      val === "" ? null :
                                      Math.min(parseFloat(val) || 0, maxDepositInDepositCurrency),
                                    );
                                  }}
                                  placeholder={`Max ${fmtDepositCur(maxDepositInDepositCurrency)}`}
                                  style={{ width: "100%", padding: "6px 72px 6px 10px", fontSize: 12, fontWeight: 700, borderRadius: 5, border: "1.5px solid #fcd34d", outline: "none", boxSizing: "border-box", background: "#fff", color: "#92400e" }}
                                />
                                <div style={{ position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)", display: "flex", borderRadius: 5, overflow: "hidden", border: "1px solid #fcd34d" }}>
                                  {(["UGX", "USD"] as Currency[]).map((cur) => (
                                    <button
                                      key={cur} type="button"
                                      onClick={() => { setPartialAmountCurrency(cur); setPartialAmount(null); }}
                                      style={{
                                        padding: "4px 7px", fontSize: 12, fontWeight: 700,
                                        background: partialAmountCurrency === cur ? "#d97706" : "#fff",
                                        color: partialAmountCurrency === cur ? "#fff" : "#d97706",
                                        border: "none",
                                        borderRight: cur === "UGX" ? "1px solid #fcd34d" : "none",
                                        cursor: "pointer",
                                      }}
                                    >
                                      {cur}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {partialAmount != null && partialAmount > 0 && partialAmountCurrency !== currency && depositInProcCurrency != null && (
                                <div style={{ fontSize: 10, color: "#92400e", background: "#fef3c7", borderRadius: 4, padding: "3px 8px", marginTop: 4 }}>
                                  ≈ <strong>{fmtPrice(depositInProcCurrency)}</strong>{' '}
                                  <span style={{ color: "#a16207" }}>
                                    (@ {exchangeRate.toLocaleString()} {partialAmountCurrency === "USD" ? "UGX/USD" : "USD/UGX"})
                                  </span>
                                </div>
                              )}
                              {depositInProcCurrency != null && depositInProcCurrency > 0 && depositInProcCurrency < finalPrice && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, padding: "5px 8px", background: "#fff", borderRadius: 5, border: "1px solid #fde68a" }}>
                                  <ChevronRight size={11} color="#d97706" />
                                  <p style={{ fontSize: 10, color: "#92400e", margin: 0, fontWeight: 600 }}>
                                    Balance: <span style={{ color: "#b45309", fontWeight: 700 }}>{fmtPrice(finalPrice - depositInProcCurrency)}</span>
                                  </p>
                                </div>
                              )}
                              {depositInProcCurrency != null && depositInProcCurrency >= finalPrice && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, padding: "5px 8px", background: "#fff", borderRadius: 5, border: "1px solid #86efac" }}>
                                  <Sparkles size={11} color="#16a34a" />
                                  <p style={{ fontSize: 10, color: "#166534", margin: 0, fontWeight: 600 }}>Covers full — consider switching to "Pay in Full"</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── RIGHT HALF: Pricing ── */}
                      {pricing && (
                        <div style={{ flex: 1, background: "linear-gradient(135deg,#f0f9ff,#e0f2fe)", borderRadius: 8, border: "1.5px solid #bae6fd", padding: "10px 5px", boxShadow: "0 2px 6px rgba(3,105,161,0.07)" }}>
                          {/* Header */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <div style={S.iconBox(true)}><Receipt size={13} color="#fff" /></div>
                            <div>
                              <p style={S.sectionHeader}>Price Total                              
                      <span style={S.sectionSub}> ({pricing.breakdown})</span>
                      </p>
                               
                            </div>
                          </div>

                          {/* Price display */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderRadius: 7, padding: "2px 12px", border: "1px solid #e0f2fe", marginBottom: isEditingPrice ? 10 : 0 }}>
                            <div>
                              <p style={{ marginRight: "6px", fontSize: 11, fontWeight: 600, color: "#64748b", margin: "0 0 1px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                                {priceOverride !== null ? "Custom" : "Original"}: 
                              </p>
                              <span style={{ fontSize: 18, fontWeight: 800, color: priceOverride !== null ? "#b45309" : "#0369a1", letterSpacing: "-0.5px" }}>
                                 {fmtPrice(finalPrice)}
                              </span>
                              {isUSD && pricing.totalPrice && (
                                <span style={{ marginLeft: 5, fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
                                  ≈ {fmtUGX(finalPrice * exchangeRate)}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditingPrice) { setPriceOverride(null); setIsEditingPrice(false); }
                                else { setPriceOverride(finalPrice); setIsEditingPrice(true); }
                              }}
                              style={{
                                display: "flex", alignItems: "center", gap: 4, padding: "6px 10px",
                                borderRadius: 6, border: `1.5px solid ${isEditingPrice ? "#fecaca" : "#fecaca"}`,
                                background: isEditingPrice ? "#f9d963" : "#f9d963",
                                color: isEditingPrice ? "#dc2626" : "#dc2626",
                                fontSize: 13, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap",
                              }}
                            >
                              {isEditingPrice ? <><RotateCcw size={12} /> Reset</> : <><Pencil size={12} /> Edit</>}
                            </button>
                          </div>

                          {/* Override input */}
                          {isEditingPrice && (
                            <div style={{ background: "#fff", borderRadius: 7, border: "1.5px solid #bae6fd", padding: "10px 12px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                <Tag size={12} color="#0369a1" />
                                <label style={{ fontSize: 12, fontWeight: 700, color: "#0369a1" }}>Custom Price</label>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#0369a1", background: "#e0f2fe", padding: "1px 6px", borderRadius: 8, marginLeft: "auto" }}>{currency}</span>
                              </div>
                              <input
                                type="number" min={0} step={currency === "USD" ? 0.01 : 1000}
                                value={priceOverride ?? ""}
                                onChange={(e) => setPriceOverride(e.target.value === "" ? null : parseFloat(e.target.value))}
                                placeholder="Enter custom amount…"
                                autoFocus
                                style={{ width: "100%", padding: "8px 12px", fontSize: 14, fontWeight: 700, borderRadius: 6, border: "2px solid #7dd3fc", outline: "none", boxSizing: "border-box", background: "#fff", color: "#0369a1" }}
                              />
                              <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 6, padding: "2px 10px", background: "#f0f9ff", borderRadius: 5, border: "1px solid #e0f2fe" }}>
                                <AlertCircle size={12} color="#0ea5e9" />
                                <p style={{ fontSize: 12, color: "#0369a1", margin: 0, fontWeight: 700 }}>
                                  Original: <strong>{fmtPrice(pricing.totalPrice ?? 0)}</strong>
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Notes ── */}
                  {selectedProc && (
                    <div>
                      <label style={S.label}>Notes <span style={{ fontWeight: 400, textTransform: "none", color: "#94a3b8" }}>(Optional)</span></label>
                      <textarea
                        rows={2} value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any additional notes…"
                        style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 7, border: "1px solid #e2e8f0", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                      />
                    </div>
                  )}
                </>
              )}

              {/* ──────── EXISTING TAB ──────── */}
              {activeTab === "existing" && (
                <>
                  <div style={card("#f0fdf4", "#bbf7d0")}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#166534", marginBottom: 2 }}>Add Existing Procedure</p>
                    <p style={{ fontSize: 11, color: "#15803d", margin: 0 }}>Appears on the chart without affecting the treatment plan.</p>
                  </div>

                  {selectedExistingProc && (
                    <>
                      <div style={card("#f0fdf4", "#bbf7d0")}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: "#166534", margin: 0 }}>{selectedExistingProc.name}</p>
                            {selectedExistingProc.code && (
                              <p style={{ fontSize: 11, fontFamily: "monospace", color: "#059669", marginTop: 2, marginBottom: 0 }}>{selectedExistingProc.code}</p>
                            )}
                          </div>
                          <button
                            onClick={() => { setSelectedExistingProc(null); setExistingProcSearch(""); setExistingSurfaces([]); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#6ee7b7", padding: 3 }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>

                      <div style={card("#f8fafc", "#e2e8f0")}>
                        <p style={{ ...S.label, marginBottom: 5 }}>Selected Teeth</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {selectedTeeth.sort((a, b) => a - b).map((t) => (
                            <span key={t} style={{ padding: "2px 7px", background: "#dbeafe", color: "#1d4ed8", fontSize: 11, borderRadius: 4 }}>{t}</span>
                          ))}
                        </div>
                        {selectedTeeth.length === 0 && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 4, margin: 0 }}>⚠️ No teeth selected.</p>}
                      </div>

                      <div style={card("#f8fafc", "#e2e8f0")}>
                        <label style={S.label}>Surfaces <span style={{ fontWeight: 400, textTransform: "none", color: "#94a3b8" }}>(Optional)</span></label>
                        <CompactSurfacePicker value={existingSurfaces} onChange={setExistingSurfaces} teeth={selectedTeeth} />
                      </div>

                      <div>
                        <label style={S.label}>Notes <span style={{ fontWeight: 400, textTransform: "none", color: "#94a3b8" }}>(Optional)</span></label>
                        <textarea
                          rows={2} value={existingNotes}
                          onChange={(e) => setExistingNotes(e.target.value)}
                          placeholder="Additional notes..."
                          style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 7, border: "1px solid #e2e8f0", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid #e2e8f0", background: "#fff", flexShrink: 0, display: "flex", justifyContent: "center",  }}>
          {activeTab === "new" && selectedProc && (
            <button
              onClick={handleAddNewProcedure}
              disabled={(!hasActivePlan && !selectedPlanId) || submitting || (needsTeeth && selectedTeeth.length === 0)}
              style={{
                width: "40%", padding: "8px",
                background: (!hasActivePlan && !selectedPlanId) || submitting ? "#93c5fd" : "#3b82f6",
                color: "#fff", border: "none", borderRadius: 7, fontSize: 14, fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                opacity: (!hasActivePlan && !selectedPlanId) || submitting ? 0.7 : 1,
              }}
            >
              {submitting ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <ClipboardList size={15} />}
              {submitting ? "Adding…" : `Add to Plan — ${fmtPrice(finalPrice)}`}
            </button>
          )}
          {activeTab === "existing" && selectedExistingProc && (
            <button
              onClick={handleAddExistingProcedure}
              disabled={submittingExisting || selectedTeeth.length === 0}
              style={{
                width: "100%", padding: "10px",
                background: submittingExisting || selectedTeeth.length === 0 ? "#a7f3d0" : "#059669",
                color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600,
                cursor: submittingExisting ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                opacity: submittingExisting || selectedTeeth.length === 0 ? 0.7 : 1,
              }}
            >
              {submittingExisting ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <FileText size={15} />}
              {submittingExisting ? "Adding…" : `Add as Existing (${selectedTeeth.length} tooth${selectedTeeth.length !== 1 ? "s" : ""})`}
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}