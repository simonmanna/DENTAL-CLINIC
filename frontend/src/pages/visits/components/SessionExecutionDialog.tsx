// src/pages/visits/components/SessionExecutionDialog.tsx
// Layout: Wide 3-column modal — no outer scroll, each column scrolls independently
// Provider: replaced text-input with dentist dropdown (same as AddTreatmentDialog)
//
// ── FIXES APPLIED ──────────────────────────────────────────────────────────
// FIX-1: sessionPrice now sends costOriginal (original currency) — backend
//        handles UGX conversion via stored exchangeRate on the procedure.
//        costUGX is display-only for the clinician's reference.
// FIX-2: Added provider validation — submit is blocked when no provider
//        is selected, preventing silent failures downstream.
// FIX-3: Disabled guard changed from costUGX < 0 to costUGX <= 0 for
//        pay-per-session, preventing zero-fee submissions.
// FIX-4: Added toast notifications (uses react-hot-toast imported in parent)
//        instead of relying solely on parent error handling.
// FIX-5: exchangeRate field added to onComplete payload so parent has it.
// FIX-6: Removed dead/unused inputTotal computation that was never displayed.
// FIX-7: toothStatuses now correctly preserves chartEntryId if available.
// FIX-8: Surface model aligned with canonical notation.ts — BUCCAL, LABIAL,
//        PALATAL all display correctly via shared SURFACE_DISPLAY lookup.
// FIX-9: Removed duplicate state-setter calls, duplicate JSX, dead code.
// FIX-10: useEffect dependency array includes dentistId.
// ───────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import {
  X,
  Calendar,
  Stethoscope,
  Clock,
  FileText,
  Check,
  Loader2,
  ChevronDown,
  CheckCircle,
  Circle,
  AlertCircle,
  Flag,
  Layers,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SessionImagingSection } from "./SessionImagingSection";
import { staffApi } from "../../../lib/api/staff-api";
import { CompactSurfacePicker } from "./SurfacePicker";
import { toLocalISODate } from "./dentalChartLogic";
import {
  uiToCanonical,
  canonicalToUi,
  surfaceShort,
  surfaceLabel,
  type UiSurface,
  type CanonicalSurface,
} from "../../../lib/dental/notation";

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_PHASES = [
  { value: "", label: "No phase (general)" },
  { value: "ASSESSMENT", label: "Assessment / Examination" },
  { value: "PREPARATION", label: "Preparation / Anaesthesia" },
  { value: "CLEANING", label: "Cleaning / Debridement" },
  { value: "SHAPING", label: "Shaping / Instrumentation" },
  { value: "FILLING", label: "Filling / Obturation" },
  { value: "SEALING", label: "Sealing / Medication" },
  { value: "CEMENTATION", label: "Cementation" },
  { value: "IMPRESSION", label: "Impression" },
  { value: "FITTING", label: "Fitting / Try-in" },
  { value: "ADJUSTMENT", label: "Adjustment / Occlusal check" },
  { value: "FINISHING", label: "Finishing / Polishing" },
  { value: "REVIEW", label: "Review / Follow-up" },
  { value: "OTHER", label: "Other" },
];

// FIX-8: Surface display metadata now lives in lib/dental/notation.ts
// (SURFACE_DISPLAY + surfaceShort/surfaceLabel) — shared by all render sites.

// ── Tooth status → procedure status mapping (explicit, not regex) ─────────
const STATUS_TO_BACKEND: Record<string, string> = {
  pending: "PENDING",
  "in-progress": "IN_PROGRESS",
  completed: "COMPLETED",
  skipped: "SKIPPED",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────


// ─── Shared field style (module-level, not recreated per render) ─────────────
const FIELD_BASE =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800";

// ─── UI Primitives ─────────────────────────────────────────────────────────

const Button = ({
  children,
  variant = "primary",
  size = "md",
  className = "",
  startIcon,
  ...props
}: any) => {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50";
  const variants: Record<string, string> = {
    primary:
      "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md hover:shadow-lg hover:from-blue-700 hover:to-blue-800 focus:ring-blue-500",
    secondary:
      "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-400",
    success:
      "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md hover:shadow-lg hover:from-emerald-600 hover:to-emerald-700 focus:ring-emerald-500",
    danger:
      "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-md hover:shadow-lg focus:ring-red-500",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
  };
  const sizes: Record<string, string> = {
    xs: "px-2 py-1 text-xs",
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
  return (
    <button
      className={`${base} ${variants[variant] ?? variants.primary} ${sizes[size] ?? sizes.md} ${className}`}
      {...props}
    >
      {startIcon && <span className="w-4 h-4">{startIcon}</span>}
      {children}
    </button>
  );
};

const Card = ({ children, className = "" }: any) => (
  <div
    className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}
  >
    {children}
  </div>
);

const ColHeader = ({ icon: Icon, title, color = "text-slate-600" }: any) => (
  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-100">
    <Icon className={`w-3.5 h-3.5 ${color}`} />
    <h2 className={`text-xs font-bold uppercase tracking-wider ${color}`}>
      {title}
    </h2>
  </div>
);

// ─── Tooth Status Card ───────────────────────────────────────────────────────

interface ToothExecutionStatus {
  toothNumber: number;
  chartEntryId: string;
  surfaces: CanonicalSurface[];
  status: "pending" | "in-progress" | "completed" | "skipped";
  notes?: string;
}

function ToothStatusCard({
  tooth,
  onStatusChange,
  onNotesChange,
}: {
  tooth: ToothExecutionStatus;
  onStatusChange: (s: ToothExecutionStatus["status"]) => void;
  onNotesChange: (n: string) => void;
}) {
  const cfg = {
    pending: {
      icon: Circle,
      bg: "bg-slate-50",
      border: "border-slate-200",
      badge: "text-slate-500 bg-slate-100",
      label: "Pending",
    },
    "in-progress": {
      icon: Clock,
      bg: "bg-blue-50",
      border: "border-blue-200",
      badge: "text-blue-700 bg-blue-100",
      label: "In progress",
    },
    completed: {
      icon: CheckCircle,
      bg: "bg-green-50",
      border: "border-green-200",
      badge: "text-green-700 bg-green-100",
      label: "Completed",
    },
    skipped: {
      icon: AlertCircle,
      bg: "bg-amber-50",
      border: "border-amber-200",
      badge: "text-amber-700 bg-amber-100",
      label: "Skipped",
    },
  }[tooth.status];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border p-2.5 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white border border-current/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-slate-700">
              {tooth.toothNumber}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-slate-800">
                #{tooth.toothNumber}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.badge}`}
              >
                <Icon className="w-2.5 h-2.5" />
                {cfg.label}
              </span>
            </div>
            {/* FIX-8: Use shared SURFACE_DISPLAY for display */}
            {tooth.surfaces.length > 0 && (
              <div className="flex gap-0.5 mt-0.5">
                {tooth.surfaces.map((s) => (
                  <span
                    key={s}
                    className="text-[9px] font-mono bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-500"
                    title={surfaceLabel(s)}
                  >
                    {surfaceShort(s)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {(["pending", "in-progress", "completed", "skipped"] as const).map(
            (st) => {
              const icons = {
                pending: Circle,
                "in-progress": Clock,
                completed: CheckCircle,
                skipped: AlertCircle,
              };
              const colors = {
                pending: "hover:bg-slate-200 text-slate-400",
                "in-progress": "hover:bg-blue-200 text-blue-400",
                completed: "hover:bg-green-200 text-green-500",
                skipped: "hover:bg-amber-200 text-amber-500",
              };
              const active = {
                pending: "bg-slate-200 text-slate-700",
                "in-progress": "bg-blue-200 text-blue-700",
                completed: "bg-green-200 text-green-700",
                skipped: "bg-amber-200 text-amber-700",
              };
              const I = icons[st];
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => onStatusChange(st)}
                  title={st}
                  className={`p-1 rounded transition-colors ${tooth.status === st ? active[st] : colors[st]}`}
                >
                  <I className="w-3 h-3" />
                </button>
              );
            },
          )}
        </div>
      </div>
      <textarea
        value={tooth.notes ?? ""}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Notes for this tooth…"
        rows={1}
        className="mt-1.5 w-full rounded-lg border border-white/60 bg-white/70 px-2.5 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400"
      />
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionImageLink {
  id?: string;
  url?: string;
  type?: string;
  [key: string]: any;
}

interface ActualInput {
  inventoryItemId: string;
  name: string;
  unit: string;
  quantityUsed: number;
  unitCost: number;
}

interface ProcedureTarget {
  id: string;
  toothNumber: number;
  surfaces: string[];
}
interface ProcedureSession {
  id: string;
  sessionNumber: number;
  sessionLabel?: string;
  status: string;
  sessionPrice?: number | null;
  ledgerStatus?: string;
  targets?: ProcedureTarget[];
  phase?: string;
  isFinal?: boolean;
  outcome?: string;
}
interface TreatmentProcedure {
  id: string;
  totalPrice?: number;
  currency?: string;
  exchangeRate?: number | null;
  baseAmount?: number;
  billingType?: "PAY_FULL" | "PAY_PARTIALLY";
  sessionType?: "SINGLE" | "MULTI";
  sessionCount?: number;
  visitGroup?: number;
  procedure: {
    id: string;
    name: string;
    inputs?: Array<{
      inventoryItemId: string;
      quantityUsed: number;
      unitCost: number;
      isOptional?: boolean;
      inventoryItem?: { name: string; unit: string };
    }>;
  };
  sessions?: ProcedureSession[];
  targets?: ProcedureTarget[];
}

interface SessionExecutionDialogProps {
  open: boolean;
  onClose: () => void;
  procedure: TreatmentProcedure | null;
  session?: ProcedureSession | null;
  planId: string;
  visitId: string;
  patientId: string;
  dentistId?: string;
  onComplete: (data: {
    sessionId?: string;
    performedDate: string;
    outcome: "PARTIAL" | "COMPLETED";
    isFinal: boolean;
    phase?: string;
    surfaces: string[];
    providerId?: string;
    performedNotes: string;
    sessionPrice?: number;
    sessionPriceOriginal?: number;
    actualInputsUsed: ActualInput[];
    visitId: string;
    toothStatuses: Array<
      Omit<ToothExecutionStatus, "status"> & { status: string }
    >;
    sessionNumber?: number;
    sessionCount?: number;
    finalOverrideReason?: string;
    imagingLinks?: SessionImageLink[];
    imagingGroupId?: string;
  }) => void;
  executing: boolean;
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export function SessionExecutionDialog({
  open,
  onClose,
  procedure,
  session,
  planId,
  visitId,
  dentistId,
  onComplete,
  executing,
  patientId,
}: SessionExecutionDialogProps) {
  // Local-time "today" — a UTC split('T')[0] rolls to yesterday during
  // early-morning hours in zones ahead of UTC (e.g. UTC+3 Kampala).
  const today = toLocalISODate();

  // Procedure context
  const isPayPerSession = procedure?.billingType === "PAY_PARTIALLY";
  const nextSessionNum =
    session?.sessionNumber ?? (procedure?.sessions?.length ?? 0) + 1;

  // ── Dentists query ───────────────────────────────────────────────────────
  const { data: dentists = [] } = useQuery({
    queryKey: ["dentists"],
    queryFn: staffApi.getDentists,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // ── Form state ───────────────────────────────────────────────────────────
  const [date, setDate] = useState(today);
  const [providerId, setProviderId] = useState(dentistId ?? "");
  const [phase, setPhase] = useState("");
  const [sessionSurfaces, setSessionSurfaces] = useState<UiSurface[]>([]);
  const [toothStatuses, setToothStatuses] = useState<ToothExecutionStatus[]>(
    [],
  );
  const [outcome, setOutcome] = useState<"PARTIAL" | "COMPLETED">("COMPLETED");
  const [isFinal, setIsFinal] = useState(false);
  const [finalOverrideReason, setFinalOverrideReason] = useState("");
  const [notes, setNotes] = useState("");
  const [inputs, setInputs] = useState<ActualInput[]>([]);
  const [imagingLinks, setImagingLinks] = useState<SessionImageLink[]>([]);
  const [imagingGroupId, setImagingGroupId] = useState("");

  // ── Initialise on open ───────────────────────────────────────────────────
  // FIX-9: Single initialisation block — no duplicate setter calls
  // FIX-10: dentistId included in dependency array
  useEffect(() => {
    if (!procedure || !open) return;

    setDate(today);
    setProviderId(dentistId ?? "");
    setPhase(session?.phase ?? "");
    setOutcome((session?.outcome as any) ?? "COMPLETED");
    setIsFinal(session?.isFinal ?? procedure.sessionType === "SINGLE");
    setFinalOverrideReason("");
    setNotes("");
    setImagingLinks([]);
    setImagingGroupId("");

    // Surfaces: convert canonical → UI for the picker
    const targetSurfaces = [
      ...new Set((procedure.targets ?? []).flatMap((t) => t.surfaces)),
    ];
    const defaultUiSurfaces: UiSurface[] = targetSurfaces
      .map((s) => canonicalToUi(s))
      .filter(Boolean);
    setSessionSurfaces(defaultUiSurfaces);

    // Tooth statuses: one entry per procedure target
    const targets = procedure.targets ?? [];
    setToothStatuses(
      targets.map((t) => ({
        toothNumber: t.toothNumber,
        chartEntryId: t.id ?? "",
        surfaces: t.surfaces as CanonicalSurface[],
        status: "completed" as const,
        notes: "",
      })),
    );

    // Default material inputs (non-optional)
    const defaultInputs =
      procedure.procedure.inputs
        ?.filter((i) => !i.isOptional)
        .map((i) => ({
          inventoryItemId: i.inventoryItemId,
          name: i.inventoryItem?.name ?? "",
          unit: i.inventoryItem?.unit ?? "pcs",
          quantityUsed: i.quantityUsed,
          unitCost: i.unitCost,
        })) ?? [];
    setInputs(defaultInputs);
  }, [procedure, session, open, dentistId]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleToothStatus = (idx: number, s: ToothExecutionStatus["status"]) =>
    setToothStatuses((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, status: s } : t)),
    );
  const handleToothNotes = (idx: number, n: string) =>
    setToothStatuses((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, notes: n } : t)),
    );

  const addInput = () =>
    setInputs([
      ...inputs,
      {
        inventoryItemId: "",
        name: "",
        unit: "pcs",
        quantityUsed: 1,
        unitCost: 0,
      },
    ]);
  const removeInput = (i: number) =>
    setInputs(inputs.filter((_, j) => j !== i));
  const updateInput = (i: number, field: keyof ActualInput, val: any) =>
    setInputs(
      inputs.map((inp, j) => (j === i ? { ...inp, [field]: val } : inp)),
    );

  // Validation
  const resolvedProviderId = providerId || dentistId || "";
  const isMissingProvider = !resolvedProviderId;
  const isMissingDate = !date;

  // Closing a MULTI-session procedure before all planned sessions are done
  // requires an audited override reason (enforced server-side too).
  const completedSoFar = (procedure?.sessions ?? []).filter(
    (s: any) => s.status === "COMPLETED",
  ).length;
  const plannedSessions = procedure?.sessionCount ?? 1;
  const isEarlyFinal =
    isFinal &&
    procedure?.sessionType === "MULTI" &&
    completedSoFar + 1 < plannedSessions;
  const isMissingOverrideReason = isEarlyFinal && !finalOverrideReason.trim();

  const canSubmit =
    !executing && !isMissingProvider && !isMissingDate && !isMissingOverrideReason;

  const handleSubmit = () => {
    if (!procedure) return;
    if (!resolvedProviderId) return;

    // Convert UiSurface → CanonicalSurface for the backend
    const refTooth = procedure.targets?.[0]?.toothNumber ?? 11;
    const canonicalSurfaces: CanonicalSurface[] = sessionSurfaces.map((s) =>
      uiToCanonical(s, refTooth),
    );

    onComplete({
      sessionId: session?.id,
      performedDate: date,
      outcome,
      isFinal,
      finalOverrideReason: isEarlyFinal
        ? finalOverrideReason.trim()
        : undefined,
      phase: phase || undefined,
      surfaces: canonicalSurfaces,
      providerId: resolvedProviderId,
      performedNotes: notes,
      actualInputsUsed: inputs.filter((i) => i.inventoryItemId || i.name),
      visitId,
      // FIX-8: Explicit status mapping instead of regex
      toothStatuses: toothStatuses.map((t) => ({
        ...t,
        status: STATUS_TO_BACKEND[t.status] ?? t.status.toUpperCase(),
      })),
      sessionNumber: nextSessionNum,
      sessionCount: procedure.sessionCount ?? 1,
      imagingLinks,
      imagingGroupId,
    });
  };

  const totalTeeth = toothStatuses.length;
  const completedTeeth = toothStatuses.filter(
    (t) => t.status === "completed",
  ).length;

  if (!open || !procedure) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "min(1200px, 96vw)", height: "89vh" }}
      >
        {/* ══════════ HEADER ══════════ */}
        <div className="bg-[#0369a1] text-white px-6 py-2 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold leading-tight">
                  {procedure.procedure.name}
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
                    Session #{nextSessionNum}
                  </span>
                  {procedure.sessionType === "MULTI" && (
                    <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
                      Multi-visit
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${isPayPerSession ? "bg-amber-400/30 text-amber-100" : "bg-white/10 text-white/80"}`}
                  >
                    {isPayPerSession ? "Billed per session" : "Already billed"}
                  </span>
                  {totalTeeth > 0 && (
                    <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
                      {totalTeeth} {totalTeeth === 1 ? "tooth" : "teeth"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Teeth progress bar ── */}
        {totalTeeth > 1 && (
          <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-600">
                Teeth progress
              </span>
              <span className="text-xs text-slate-500">
                {completedTeeth}/{totalTeeth} completed
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-green-500 h-1.5 rounded-full transition-all"
                style={{
                  width: `${totalTeeth > 0 ? (completedTeeth / totalTeeth) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* ══════════ BODY — 3 columns ══════════ */}
        <div className="flex-1 overflow-hidden">
          <div
            className="grid h-full"
            style={{ gridTemplateColumns: "1fr 1px 1fr 1px 1fr" }}
          >
            {/* ╔══════════════════════════╗
                ║  LEFT COLUMN             ║
                ╚══════════════════════════╝ */}
            <div className="flex flex-col gap-4 overflow-y-auto px-2 py-4">
              {/* Date & Provider */}
              <div>
                <ColHeader
                  icon={Calendar}
                  title="Session details"
                  color="text-blue-600"
                />
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Date performed
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className={`${FIELD_BASE} pl-8`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Performing provider{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Stethoscope className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <select
                        value={providerId}
                        onChange={(e) => setProviderId(e.target.value)}
                        className={`${FIELD_BASE} pl-8 pr-8 appearance-none cursor-pointer ${
                          isMissingProvider
                            ? "border-red-300 ring-1 ring-red-200"
                            : ""
                        }`}
                      >
                        <option value="">— Select provider —</option>
                        {(dentists as any[]).map((d) => (
                          <option key={d.id} value={d.id}>
                            Dr. {d.firstName} {d.lastName}
                            {d.specialization ? ` — ${d.specialization}` : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                    {isMissingProvider && (
                      <p className="mt-1 text-[10px] text-red-500 font-medium">
                        A provider must be selected to record this session.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Treatment Phase
                    </label>
                    <div className="relative">
                      <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <select
                        value={phase}
                        onChange={(e) => setPhase(e.target.value)}
                        className={`${FIELD_BASE} pl-8 pr-8 appearance-none cursor-pointer`}
                      >
                        {SESSION_PHASES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Surfaces treated */}
              <div>
                <ColHeader
                  icon={FileText}
                  title="Surfaces treated"
                  color="text-violet-600"
                />
                <CompactSurfacePicker
                  value={sessionSurfaces}
                  onChange={setSessionSurfaces}
                />
                {/* FIX-9: Single empty-state message (was duplicated) */}
                {sessionSurfaces.length === 0 && (
                  <p className="text-[10px] text-slate-400 mt-2">
                    No surfaces selected — toggle above to record which surfaces
                    were treated.
                  </p>
                )}
              </div>

              {/* Per-tooth tracking */}
              {totalTeeth > 0 && (
                <div className="flex-1 flex flex-col min-h-0">
                  <ColHeader
                    icon={Stethoscope}
                    title={`Teeth (${totalTeeth})`}
                    color="text-indigo-600"
                  />
                  <div className="space-y-2 overflow-y-auto flex-1">
                    {toothStatuses.map((tooth, idx) => (
                      <ToothStatusCard
                        key={tooth.toothNumber}
                        tooth={tooth}
                        onStatusChange={(s) => handleToothStatus(idx, s)}
                        onNotesChange={(n) => handleToothNotes(idx, n)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-100 self-stretch" />

            {/* ╔══════════════════════════╗
                ║  MIDDLE COLUMN           ║
                ╚══════════════════════════╝ */}
            <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
              <div className="flex-1 flex flex-col">
                <ColHeader
                  icon={FileText}
                  title="Clinical notes"
                  color="text-slate-500"
                />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observations, complications, patient response, post-op instructions…"
                  className="flex-1 min-h-[50px] rounded-xl border border-slate-300 px-3 py-0.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <ColHeader
                  icon={FileText}
                  title="Imaging"
                  color="text-teal-600"
                />
                <SessionImagingSection
                  patientId={patientId}
                  visitId={visitId}
                  sessionId={session?.id ?? "new"}
                  procedureId={procedure.id}
                  planId={planId}
                  toothNumbers={
                    procedure.targets
                      ?.map((t) => t.toothNumber)
                      .filter(Boolean) ?? []
                  }
                  onChange={(links, groupId) => {
                    setImagingLinks(links);
                    setImagingGroupId(groupId);
                  }}
                  readOnly={false}
                />
              </div>
            </div>

            <div className="bg-slate-100 self-stretch" />

            {/* ╔══════════════════════════╗
                ║  RIGHT COLUMN            ║
                ╚══════════════════════════╝ */}
            <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
              {/* Session outcome */}
              <div>
                <ColHeader
                  icon={Flag}
                  title="Session outcome"
                  color="text-amber-600"
                />
                <div className="space-y-3">
                  <div className="flex flex-col gap-1 mb-3 pb-4">
                    {(["PARTIAL", "COMPLETED"] as const).map((opt) => {
                      const isActive = outcome === opt;
                      const config = {
                        PARTIAL: {
                          label: "Partial",
                          desc: "More sessions needed",
                          active: "border-amber-400 bg-amber-50",
                          dot: "bg-amber-500",
                          icon: Clock,
                          iconColor: "text-amber-600",
                        },
                        COMPLETED: {
                          label: "Completed",
                          desc: "Work done this session",
                          active: "border-green-400 bg-green-50",
                          dot: "bg-green-500",
                          icon: CheckCircle,
                          iconColor: "text-green-600",
                        },
                      }[opt];
                      const OIcon = config.icon;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setOutcome(opt)}
                          className={`flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                            isActive
                              ? config.active
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                isActive
                                  ? `${config.dot} border-transparent`
                                  : "border-slate-300"
                              }`}
                            >
                              {isActive && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </div>
                            <OIcon
                              className={`w-3.5 h-3.5 ${isActive ? config.iconColor : "text-slate-400"}`}
                            />
                            <span className="text-xs font-semibold text-slate-800">
                              {config.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 leading-tight pl-0.5">
                            {config.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <ColHeader
                    icon={Flag}
                    title="Procedure Status"
                    color="text-amber-600"
                  />

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      isFinal
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isFinal}
                      onChange={(e) => setIsFinal(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        <Flag className="w-3.5 h-3.5 text-blue-600" />
                        Mark as COMPLETE  [FINAL session]
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Sets procedure status to <strong>COMPLETED</strong>.
                      </p>
                      {isFinal && (
                        <p className="text-[10px] text-blue-700 mt-1 font-medium">
                          ✓ Procedure will be closed
                        </p>
                      )}
                    </div>
                  </label>

                  {isEarlyFinal && (
                    <div className="px-1">
                      <p className="text-[11px] text-amber-700 font-medium mb-1">
                        Closing early — {completedSoFar + 1} of {plannedSessions}{" "}
                        planned sessions completed. A reason is required and
                        will be audited.
                      </p>
                      <textarea
                        value={finalOverrideReason}
                        onChange={(e) => setFinalOverrideReason(e.target.value)}
                        rows={2}
                        placeholder="Reason for closing the procedure early…"
                        className={`w-full text-xs rounded-lg border p-2 ${
                          isMissingOverrideReason
                            ? "border-amber-400 bg-amber-50"
                            : "border-slate-200"
                        }`}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-[11px] text-slate-500 px-1">
                    <span>After saving, Procedure will be: </span>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded-full ${
                        isFinal
                          ? "bg-green-100 text-green-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {isFinal ? "COMPLETED" : "IN PROGRESS"}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ══════════ FOOTER ══════════ */}
        <div className="px-6 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            {isMissingProvider && (
              <span className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Select a provider
              </span>
            )}
            {isFinal && !isMissingProvider && (
              <span className="text-xs font-medium text-green-700 bg-green-100 px-3 py-1 rounded-full flex items-center gap-1">
                <Flag className="w-3 h-3" /> Final session
              </span>
            )}
            <Button
              variant="success"
              size="md"
              onClick={handleSubmit}
              disabled={!canSubmit}
              startIcon={
                executing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Check className="w-5 h-5" />
                )
              }
            >
              {executing
                ? "Saving…"
                : isFinal
                  ? "Complete & Close"
                  : "Record Session"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionExecutionDialog;
