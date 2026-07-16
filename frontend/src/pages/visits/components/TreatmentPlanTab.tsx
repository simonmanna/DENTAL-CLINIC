// src/pages/visits/components/TreatmentPlanTab.tsx
import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  GripVertical,
  CheckCircle,
  Loader2,
  ClipboardList,
  Move,
  Eye,
  PlayCircle,
  Trash2,
  Check,
  Pencil,
} from "lucide-react";
import { SessionExecutionDialog } from "./SessionExecutionDialog";
import { ProcedureSessionManager } from "./ProcedureSessionManager";
import { ProcedureDetailDialog } from "./ProcedureDetailDialog";
import { toast } from "react-hot-toast";

import { treatmentPlansApi } from "../../../lib/api/treatment-plans";
import { newIdempotencyKey } from "../../../lib/api/conditions";
import { treatmentProceduresEditApi } from "../../../lib/api/treatment-procedures-edit";
import { ProcedureActionMenu } from "./ProcedureActionMenu";
import { EditProcedureDialog } from "./EditProcedureDialog";
import { DeleteProcedureDialog } from "./DeleteProcedureDialog";
import { CancelProcedureDialog } from "./CancelProcedureDialog";
import type { ProcedureDeleteEligibility } from "../../../lib/api/treatment-procedures-edit";
import { formatSurfaces, formatSurfacesLong } from "../../../lib/dental/notation";
import type { ToothSurface } from "../../../types/dental";
const txApi = treatmentPlansApi;

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Simplified Treatment Plan & Procedure statuses.
 * Only 5 values — PLANNED is the default.
 *
 * NOTE: Session-level statuses (PENDING, SKIPPED, VOIDED, etc.) live on
 * ProcedureSession and are intentionally separate from this enum.
 */
export type TxStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ON_HOLD"
  | "CANCELLED"
  | "REFERRED";

// Full 9-value canonical surface type — re-exported from the single source
// of truth so downstream imports of `ToothSurface` from this file keep working.
export type { ToothSurface } from "../../../types/dental";

export type SessionType = "SINGLE" | "MULTI";
export type BillingType = "PAY_FULL" | "PAY_PARTIALLY";

export interface InventoryInput {
  id: string;
  inventoryItemId: string;
  quantityUsed: number;
  unitCost: number;
  isOptional: boolean;
  performedNotes?: string;
  inventoryItem: {
    id: string;
    name: string;
    unit: string;
    unitCost: number;
    category: string;
  };
}

export interface ActualInput {
  inventoryItemId: string;
  name: string;
  unit: string;
  quantityUsed: number;
  unitCost: number;
}

export interface ProcedureTarget {
  id: string;
  toothNumber: number;
  surfaces: ToothSurface[];
  unitIndex?: number | null;
}

export interface ProcedureSession {
  id: string;
  sessionNumber: number;
  sessionLabel?: string;
  /** Session-level statuses are separate from TxStatus */
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED" ;
  performedDate?: string | null;
  performedNotes?: string | null;
  sessionPrice?: number;
  visitId?: string;
  visitGroup?: number;
  ledgerStatus?: string;
  ledgerEntry?: any;
  actualInputsUsed?: ActualInput[];
  surfaces?: ToothSurface[];
  cost?: number;
  completedDate?: string | null;
  targets?: ProcedureTarget[];
}

export interface TreatmentProcedure {
  id: string;
  sequence: number;
  visitGroup: number;
  procedureId: string;
  totalPrice?: number;
  currency?: string;
  status: TxStatus;
  performedNotes?: string;
  scheduledDate?: string;
  completedAt?: string;
  performedDate?: string;
  actualInputsUsed?: ActualInput[];
  sessionType?: SessionType;
  billingType?: BillingType;
  sessionCount?: number;
  paymentStatus?: "PAID" | "PARTIALLY_PAID" | "OPEN" | "INVOICED";
  originalCurrency?: string;
  originalPrice?: number;
  // Pricing snapshot (used by EditProcedureDialog's discount-% display)
  pricePerUnit?: number;
  quantity?: number;
  subtotalPrice?: number;
  discountAmount?: number;
  taxAmount?: number;
  // Linked invoice (locks pricing fields when POSTED/PAID)
  invoiceId?: string | null;
  invoiceStatus?: string | null;
  invoicePaymentStatus?: string | null;
  invoiceAmountPaid?: number;
  procedure: {
    id: string;
    code?: string;
    name: string;
    description?: string;
    basePrice: number;
    category: string | { id: string; name: string; color?: string };
    inputs?: InventoryInput[];
  };
  sessions?: ProcedureSession[];
  targets?: ProcedureTarget[];
}

export interface TreatmentPlan {
  id: string;
  planCode: string;
  title: string;
  status: TxStatus;
  priority: string;
  diagnosis?: string;
  estimatedCost: number;
  consentSigned: boolean;
  consentDate?: string;
  createdAt: string;
  dentist: { id: string; firstName: string; lastName: string };
  procedures: TreatmentProcedure[];
  summary: {
    totalProcedures: number;
    plannedCount: number;
    inProgressCount: number;
    completedCount: number;
    totalCost: number;
    completedCost: number;
    remainingCost: number;
    inputsCost: number;
    completionPercent: number;
  };
}

export interface ProcedureCatalogItem {
  id: string;
  code?: string;
  name: string;
  category: string;
  description?: string;
  basePrice: number;
  inputs: InventoryInput[];
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ══════════════════════════════════════════════════════════════════════════════

const UPPER_TEETH = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
];
const LOWER_TEETH = [
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
];

/**
 * STATUS_META — only the 5 allowed plan/procedure statuses.
 */
const STATUS_META: Record<
  TxStatus,
  { label: string; color: string; bg: string; border: string; dot: string; btnClass: string }
> = {
  PLANNED: {
    label: "Planned",
    color: "text-slate-600",
    bg: "bg-slate-50",
    border: "border-slate-200",
    dot: "bg-slate-400",
    btnClass: "bg-slate-600 hover:bg-slate-700",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    dot: "bg-blue-500",
    btnClass: "bg-blue-600 hover:bg-blue-700",
  },
  COMPLETED: {
    label: "Completed",
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    dot: "bg-green-500",
    btnClass: "bg-green-600 hover:bg-green-700",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    dot: "bg-red-400",
    btnClass: "bg-red-500 hover:bg-red-600",
  },
  ON_HOLD: {
    label: "On Hold",
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    dot: "bg-purple-500",
    btnClass: "bg-purple-600 hover:bg-purple-700",
  },
  REFERRED: {
    label: "Referred",
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    dot: "bg-purple-500",
    btnClass: "bg-purple-600 hover:bg-purple-700",
  },
};

function cn(...c: (string | boolean | undefined | null)[]) {
  return c.filter(Boolean).join(" ");
}

function fmt(n: number | string | undefined | null) {
  if (n == null || n === "") return "0";
  const num = Number(n);
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-US");
}

function getToothNumbersFromTargets(targets?: ProcedureTarget[]): number[] {
  if (!targets || targets.length === 0) return [];
  return targets.map((t) => t.toothNumber).sort((a, b) => a - b);
}

function getSurfacesFromTargets(targets?: ProcedureTarget[]): ToothSurface[] {
  if (!targets || targets.length === 0) return [];
  const seen = new Set<ToothSurface>();
  return targets.flatMap(t => t.surfaces || []).filter(s => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// UI COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

const Button = ({
  children,
  variant = "primary",
  size = "md",
  className = "",
  startIcon,
  ...props
}: any) => {
  const baseStyles =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary:
      "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md hover:shadow-lg hover:from-blue-700 hover:to-blue-800 focus:ring-blue-500 border border-transparent",
    secondary:
      "bg-white text-slate-700 border border-slate-300 shadow-sm hover:bg-slate-50 hover:border-slate-400 focus:ring-slate-400",
    success:
      "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md hover:shadow-lg hover:from-emerald-600 hover:to-emerald-700 focus:ring-emerald-500",
    danger:
      "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-md hover:shadow-lg hover:from-red-600 hover:to-red-700 focus:ring-red-500",
    outline:
      "bg-transparent border-2 border-blue-500 text-blue-600 hover:bg-blue-50 focus:ring-blue-500",
    ghost:
      "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800",
  };
  const sizes: Record<string, string> = {
    xs: "px-2 py-1 text-xs",
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {startIcon && <span className="w-4 h-4">{startIcon}</span>}
      {children}
    </button>
  );
};

const Card = ({ children, className = "", elevation = 1 }: any) => {
  const shadows = ["", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"];
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 ${shadows[elevation]} ${className}`}
    >
      {children}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// STATUS BADGE — matches the 5-status TxStatus
// ══════════════════════════════════════════════════════════════════════════════

function StatusBadge({ status }: { status: TxStatus }) {
  const styles: Record<TxStatus, string> = {
    PLANNED: "bg-slate-100 text-slate-700 border-slate-200",
    IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    CANCELLED: "bg-red-50 text-red-700 border-red-200",
    ON_HOLD: "bg-purple-50 text-purple-700 border-purple-200",
    REFERRED: "bg-purple-50 text-purple-700 border-purple-200",
  };

  const dots: Record<TxStatus, string> = {
    PLANNED: "bg-slate-400",
    IN_PROGRESS: "bg-blue-500",
    COMPLETED: "bg-emerald-500",
    CANCELLED: "bg-red-500",
    ON_HOLD: "bg-purple-500",
    REFERRED: "bg-purple-500",
  };

  const labels: Record<TxStatus, string> = {
    PLANNED: "Planned",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    REFERRED: "Referred",
    ON_HOLD: "On Hold"
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}
    >
      <span className={`w-2 h-2 rounded-full ${dots[status]}`} />
      {labels[status]}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PLAN STATUS CONTROL
//
// Plan status is auto-derived from the procedures (PLANNED → IN_PROGRESS →
// COMPLETED) by the backend. The control here surfaces the current value and
// lets an admin apply a sticky override (ON_HOLD / REFERRED / CANCELLED) or
// clear the override via "Resume Auto" (which sends an auto status to the
// backend, triggering a recalc from the procedures).
// ══════════════════════════════════════════════════════════════════════════════

const AUTO_STATUSES: TxStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED"];
const OVERRIDE_STATUSES: TxStatus[] = ["ON_HOLD", "REFERRED", "CANCELLED"];

function PlanStatusControl({
  status,
  onChange,
  readOnly,
  saving,
}: {
  status: TxStatus;
  onChange: (next: TxStatus) => void;
  readOnly?: boolean;
  saving?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAuto = AUTO_STATUSES.includes(status);

  return (
    <div className="relative inline-flex items-center gap-2">
      <StatusBadge status={status} />
      <span
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wide",
          isAuto ? "text-slate-400" : "text-amber-600",
        )}
        title={
          isAuto
            ? "Auto-derived from procedure statuses"
            : "Admin override — preserved across procedure changes"
        }
      >
        {isAuto ? "Auto" : "Override"}
      </span>

      {!readOnly && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={saving}
            className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-40"
            title="Change status"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-40 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                  Manual Override
                </div>
                {OVERRIDE_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      if (s !== status) onChange(s);
                      setMenuOpen(false);
                    }}
                    disabled={s === status}
                    className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        STATUS_META[s].dot,
                      )}
                    />
                    {STATUS_META[s].label}
                  </button>
                ))}
                {!isAuto && (
                  <>
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        // Backend treats any auto status as "resume auto"
                        // (clears the override and recalculates from procedures).
                        onChange("PLANNED");
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 font-medium flex items-center gap-2"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Resume Auto
                    </button>
                  </>
                )}
                <div className="border-t border-slate-100 my-1" />
                <div className="px-3 py-1.5 text-[10px] text-slate-400 leading-tight">
                  Planned / In Progress / Completed are derived from procedures
                  and update automatically.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DIALOG COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function MoveVisitDialog({ open, onClose, count, maxVisitGroup, onMove }: any) {
  const [target, setTarget] = useState(1);
  useEffect(() => {
    if (open) setTarget(1);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h3 className="font-semibold text-slate-800">
          Move {count} Procedure{count !== 1 ? "s" : ""}
        </h3>
        <div className="flex flex-wrap gap-2 my-4">
          {Array.from({ length: maxVisitGroup + 1 }, (_, i) => i + 1).map(
            (v) => (
              <button
                key={v}
                onClick={() => setTarget(v)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium ${target === v ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600"}`}
              >
                {v <= maxVisitGroup ? `Visit ${v}` : `New Visit ${v}`}
              </button>
            ),
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onMove(target);
              onClose();
            }}
          >
            Move
          </Button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DRAG & DROP TYPES
// ══════════════════════════════════════════════════════════════════════════════

interface DragItem {
  procId: string;
  index: number;
  visitGroup: number;
  procedure: TreatmentProcedure;
}

interface ProcedureRowProps {
  proc: TreatmentProcedure;
  index: number;
  visitGroup: number;
  checked: boolean;
  onCheck: () => void;
  onStatusClick: () => void;
  readOnly: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  dropPosition: "before" | "after" | null;
  activePlanId?: string;
  visitId?: string;
  onDragStart: (item: DragItem) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, procId: string, index: number) => void;
  onExecuteClick?: () => void;
  onDrop: (
    e: React.DragEvent,
    targetId: string,
    targetIndex: number,
    targetVisitGroup: number,
  ) => void;
  onEditClick?: () => void;
  onCancelClick?: () => void;
  onDeleteClick?: (eligibility: ProcedureDeleteEligibility) => void;
  onSessionEdit?: (proc: TreatmentProcedure, session: any) => void;
  onSessionVoid?: (proc: TreatmentProcedure, session: any) => void;
}

function ProcedureRow({
  proc,
  index,
  visitGroup,
  checked,
  onCheck,
  onStatusClick,
  readOnly,
  isDragging,
  isDragOver,
  dropPosition,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  activePlanId,
  onExecuteClick,
  visitId,
  onEditClick,
  onCancelClick,
  onDeleteClick,
  onSessionEdit,
  onSessionVoid,
}: ProcedureRowProps) {
  const [expanded, setExpanded] = useState(false);
  const toothNumbers = getToothNumbersFromTargets(proc.targets);
  const surfaces = getSurfacesFromTargets(proc.targets);
  const abbrev = formatSurfaces(surfaces);
  const rowRef = useRef<HTMLTableRowElement>(null);

  const handleDragStart = (e: React.DragEvent) => {
    const dragItem: DragItem = {
      procId: proc.id,
      index,
      visitGroup,
      procedure: proc,
    };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/json", JSON.stringify(dragItem));
    if (rowRef.current) {
      const rect = rowRef.current.getBoundingClientRect();
      e.dataTransfer.setDragImage(rowRef.current, e.clientX - rect.left, 20);
    }
    onDragStart(dragItem);
  };

  return (
    <>
      <tr
        ref={rowRef}
        draggable={!readOnly}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOver(e, proc.id, index);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDrop(e, proc.id, index, visitGroup);
        }}
        className={cn(
          "group border-b border-slate-50 transition-all text-sm relative",
          isDragging && "opacity-50 bg-blue-50 ring-blue-400",
          !isDragging && "hover:bg-slate-50/80",
          isDragOver && !isDragging && "bg-blue-50/30",
          // Status-based styling — cancelled procedures are visually muted
          // (gray + strike-through) per spec ("shown with strike-through or
          // gray color"). They remain in history for audit.
          proc.status === "COMPLETED" && "opacity-100",
          proc.status === "CANCELLED" && "opacity-40 line-through decoration-slate-400",
          proc.status === "REFERRED" && "opacity-50",
        )}
      >
        {isDragOver && dropPosition === "before" && (
          <td
            colSpan={8}
            className="absolute -top-[2px] left-0 right-0 h-[3px] bg-blue-500 z-20 pointer-events-none"
          />
        )}
        {isDragOver && dropPosition === "after" && (
          <td
            colSpan={8}
            className="absolute -bottom-[2px] left-0 right-0 h-[3px] bg-blue-500 z-20 pointer-events-none"
          />
        )}

        <td className="pl-1 pr-0 py-1.5 w-10 relative">
          <div className="flex items-center gap-0">
            {!readOnly && (
              <div
                className={cn(
                  "cursor-grab active:cursor-grabbing p-1 rounded transition-colors",
                  isDragging
                    ? "text-blue-600 bg-blue-100"
                    : "text-slate-300 hover:text-slate-500 hover:bg-slate-100",
                )}
              >
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            <input
              type="checkbox"
              checked={checked}
              onChange={onCheck}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </div>
        </td>
        <td className="px-1 py-1.5">
          <span className="font-medium text-slate-800">
            {proc.procedure.name}
          </span>
          {proc.performedNotes && (
            <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[200px]">
              {proc.performedNotes}
            </p>
          )}
          {proc.performedDate && (
            <p className="text-[11px] mt-0.5 flex items-center gap-1 text-green-600">
              <CheckCircle className="w-3 h-3" />
              {new Date(proc.performedDate).toLocaleDateString()}
            </p>
          )}
        </td>
        <td className="px-1 py-1.5 text-xs">
          {proc.procedure.code ? (
            <span className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              {proc.procedure.code}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-1 py-1.5 text-xs text-slate-600 font-mono">
          {toothNumbers.length > 0 ? (
            toothNumbers.join(", ")
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-1 py-1.5 text-xs">
          {abbrev ? (
            <span
              className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded tracking-wider"
              title={formatSurfacesLong(surfaces)}
            >
              {abbrev}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-1 py-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
          {proc.currency ?? "UGX"} {fmt(proc.totalPrice ?? 0)}
        </td>
        <td className="px-0 py-1.5">
          <StatusBadge status={proc.status} />
        </td>
        <td className="px-1 py-1.5">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
              title={expanded ? "Collapse sessions" : "Show sessions"}
            >
              {expanded ? <ChevronUp className="w-4 h-4" strokeWidth={3.5} /> : <ChevronDown className="w-4 h-4" strokeWidth={3.5} />}
            </button>
            <button
              type="button"
              onClick={onExecuteClick}
              className="p-1 rounded bg-sky-50 text-sky-600 hover:bg-sky-100 transition-colors"
              title="Execute Procedure"
              disabled={
                proc.status === "COMPLETED" ||
                proc.status === "CANCELLED" ||
                proc.status === "REFERRED"
              }
            >
              <PlayCircle className="w-4 h-4" strokeWidth={3.5} />
            </button>
            <button
              type="button"
              onClick={onStatusClick}
              className="p-1 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
              title="View Details"
            >
              <Eye className="w-4 h-4" strokeWidth={3.5}  />
            </button>
            {activePlanId && onEditClick && onCancelClick && onDeleteClick && (
              <ProcedureActionMenu
                treatmentPlanId={activePlanId}
                procedureId={proc.id}
                procedureName={proc.procedure.name}
                procedureStatus={proc.status}
                onEdit={onEditClick}
                onCancel={onCancelClick}
                onDelete={onDeleteClick}
              />
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/80">
          <td colSpan={8} className="px-4 py-3">
            {proc.sessionType && proc.sessions && (
              <div className="mt-1 border-t pt-3 border-slate-100">
                <ProcedureSessionManager
                  planId={activePlanId!}
                  procedureId={proc.id}
                  procedureName={proc.procedure.name}
                  sessionType={proc.sessionType}
                  billingType={proc.billingType ?? "PAY_FULL"}
                  readOnly={readOnly}
                  visitId={visitId}
                  onSessionEdit={onSessionEdit ? (session) => onSessionEdit(proc, session) : undefined}
                  onSessionVoid={onSessionVoid ? (session) => onSessionVoid(proc, session) : undefined}
                  initialSessions={proc.sessions.map((s: any) => ({
                    id: s.id,
                    sessionNumber: s.sessionNumber,
                    sessionLabel: s.sessionLabel || `Session ${s.sessionNumber}`,
                    visitGroup: s.visitGroup ?? proc.visitGroup ?? 1,
                    status: s.status,
                    performedDate: s.performedDate || null,
                    performedNotes: s.performedNotes || null,
                    sessionPrice: s.sessionPrice ?? 0,
                    sessionCost: s.sessionPrice ?? s.sessionCost ?? 0,
                    actualInputsUsed: s.actualInputsUsed || [],
                    completedDate: s.performedDate || null,
                    surfaces: s.targets?.[0]?.surfaces ?? [],
                    targets: s.targets ?? [],
                    ledgerStatus: s.ledgerStatus || "PENDING",
                    ledgerEntry: s.ledgerEntry || null,
                    isFinal: s.isFinal ?? false,
                    phase: s.phase ?? null,
                  }))}
                />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

interface VisitGroupSectionProps {
  visitGroup: number;
  procedures: TreatmentProcedure[];
  selectedIds: Set<string>;
  onCheck: (id: string) => void;
  onStatusClick: (p: TreatmentProcedure) => void;
  onExecuteClick?: (p: TreatmentProcedure) => void;
  onReorder: (
    updates: { id: string; sequence: number; visitGroup: number }[],
  ) => void;
  readOnly: boolean;
  allProcedures: TreatmentProcedure[];
  dragState: { draggingItem: DragItem | null; hoverVisitGroup: number | null };
  setDragState: React.Dispatch<
    React.SetStateAction<{
      draggingItem: DragItem | null;
      hoverVisitGroup: number | null;
    }>
  >;
  activePlanId?: string;
  visitId?: string;
  onEditProc?: (proc: TreatmentProcedure) => void;
  onCancelProc?: (proc: TreatmentProcedure) => void;
  onDeleteProc?: (proc: TreatmentProcedure, eligibility: ProcedureDeleteEligibility) => void;
  onSessionEdit?: (proc: TreatmentProcedure, session: any) => void;
  onSessionVoid?: (proc: TreatmentProcedure, session: any) => void;
}

function VisitGroupSection({
  visitGroup,
  procedures,
  selectedIds,
  onCheck,
  onStatusClick,
  onReorder,
  readOnly,
  allProcedures,
  dragState,
  setDragState,
  activePlanId,
  onExecuteClick,
  visitId,
  onEditProc,
  onCancelProc,
  onDeleteProc,
  onSessionEdit,
  onSessionVoid,
}: VisitGroupSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [localDragOver, setLocalDragOver] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);

  const total = procedures.reduce((s, p) => {
    const price = p.totalPrice ?? 0;
    const numericPrice =
      typeof price === "string" ? parseFloat(price) : Number(price);
    return s + (isNaN(numericPrice) ? 0 : numericPrice);
  }, 0);
  const done = procedures.filter((p) => p.status === "COMPLETED").length;
  const pct =
    procedures.length > 0 ? Math.round((done / procedures.length) * 100) : 0;
  const isHoveringGroup = dragState.hoverVisitGroup === visitGroup;
  const isDraggingFromElsewhere =
    dragState.draggingItem && dragState.draggingItem.visitGroup !== visitGroup;

  const handleGroupDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState((prev) => ({ ...prev, hoverVisitGroup: null }));
    const data = e.dataTransfer.getData("application/json");
    if (!data) return;
    try {
      const item: DragItem = JSON.parse(data);
      if (item.visitGroup !== visitGroup) {
        const newSequence =
          procedures.length > 0
            ? Math.max(...procedures.map((p) => p.sequence)) + 1
            : visitGroup * 100;
        onReorder([{ id: item.procId, sequence: newSequence, visitGroup }]);
      }
    } catch (err) {
      console.error("Group drop error:", err);
    }
  };

  const handleRowDragStart = (item: DragItem) =>
    setDragState({ draggingItem: item, hoverVisitGroup: null });
  const handleRowDragEnd = () => {
    setDragState({ draggingItem: null, hoverVisitGroup: null });
    setLocalDragOver(null);
  };
  const handleRowDragOver = (
    e: React.DragEvent,
    procId: string,
    _index: number,
  ) => {
    if (!dragState.draggingItem) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const position: "before" | "after" =
      e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setLocalDragOver({ id: procId, position });
  };

  const handleRowDrop = (
    e: React.DragEvent,
    targetId: string,
    _targetIndex: number,
    targetVisitGroup: number,
  ) => {
    e.stopPropagation();
    const savedDragOver = localDragOver;
    setLocalDragOver(null);
    if (!dragState.draggingItem) return;
    const {
      procId: sourceId,
      visitGroup: sourceVisitGroup,
      procedure: sourceProc,
    } = dragState.draggingItem;
    if (sourceId === targetId) {
      setDragState({ draggingItem: null, hoverVisitGroup: null });
      return;
    }
    const updates: { id: string; sequence: number; visitGroup: number }[] = [];
    if (sourceVisitGroup === targetVisitGroup) {
      const visitProcs = [...procedures].sort(
        (a, b) => a.sequence - b.sequence,
      );
      const sourceIdx = visitProcs.findIndex((p) => p.id === sourceId);
      const targetIdx = visitProcs.findIndex((p) => p.id === targetId);
      const [moved] = visitProcs.splice(sourceIdx, 1);
      const insertIdx =
        savedDragOver?.position === "after" ? targetIdx + 1 : targetIdx;
      visitProcs.splice(
        insertIdx > sourceIdx ? insertIdx - 1 : insertIdx,
        0,
        moved,
      );
      visitProcs.forEach((p, idx) =>
        updates.push({
          id: p.id,
          sequence: targetVisitGroup * 100 + idx,
          visitGroup: targetVisitGroup,
        }),
      );
    } else {
      const position = savedDragOver?.position || "before";
      const targetVisitProcs = allProcedures
        .filter((p) => p.visitGroup === targetVisitGroup && p.id !== sourceId)
        .sort((a, b) => a.sequence - b.sequence);
      const targetIdx = targetVisitProcs.findIndex((p) => p.id === targetId);
      const insertIdx = position === "after" ? targetIdx + 1 : targetIdx;
      targetVisitProcs.splice(insertIdx, 0, sourceProc);
      targetVisitProcs.forEach((p, idx) =>
        updates.push({
          id: p.id,
          sequence: targetVisitGroup * 100 + idx,
          visitGroup: targetVisitGroup,
        }),
      );
    }
    onReorder(updates);
    setDragState({ draggingItem: null, hoverVisitGroup: null });
  };

  if (procedures.length === 0 && !isHoveringGroup) return null;

  return (
    <div
      className={cn(
        "transition-all duration-200 rounded-lg",
        isHoveringGroup &&
          isDraggingFromElsewhere &&
          "bg-blue-50 ring-2 ring-blue-400 mx-2",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (
          dragState.draggingItem &&
          dragState.draggingItem.visitGroup !== visitGroup
        )
          setDragState((prev) => ({ ...prev, hoverVisitGroup: visitGroup }));
      }}
      onDragLeave={() =>
        setDragState((prev) => ({ ...prev, hoverVisitGroup: null }))
      }
      onDrop={handleGroupDrop}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-2.5 transition-colors rounded-t-lg",
          isHoveringGroup && isDraggingFromElsewhere
            ? "bg-blue-100"
            : "bg-slate-50 hover:bg-slate-100",
          "border-y border-slate-200",
        )}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-700">
            Visit {visitGroup} — {fmt(total)}
          </span>
          <span className="text-xs text-slate-400">
            {done}/{procedures.length} done
          </span>
          {procedures.length > 0 && (
            <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="bg-white rounded-b-lg">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                <th className="pl-4 pr-2 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      procedures.length > 0 &&
                      procedures.every((p) => selectedIds.has(p.id))
                    }
                    onChange={() => {
                      const allSelected = procedures.every((p) =>
                        selectedIds.has(p.id),
                      );
                      if (allSelected) procedures.forEach((p) => onCheck(p.id));
                      else
                        procedures.forEach((p) => {
                          if (!selectedIds.has(p.id)) onCheck(p.id);
                        });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-3 py-3 text-left">Description</th>
                <th className="px-3 py-3 text-left">Code</th>
                <th className="px-3 py-3 text-left">Tooth(s)</th>
                <th className="px-3 py-3 text-left">Surf.</th>
                <th className="px-3 py-3 text-left">Fee</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="relative">
              {procedures.map((proc, idx) => (
                <ProcedureRow
                  key={proc.id}
                  proc={proc}
                  index={idx}
                  visitGroup={visitGroup}
                  checked={selectedIds.has(proc.id)}
                  onCheck={() => onCheck(proc.id)}
                  onStatusClick={() => onStatusClick(proc)}
  readOnly={readOnly}
                  isDragging={dragState.draggingItem?.procId === proc.id}
                  isDragOver={localDragOver?.id === proc.id}
                  onExecuteClick={() => onExecuteClick?.(proc)}
                  dropPosition={
                    localDragOver?.id === proc.id
                      ? localDragOver.position
                      : null
                  }
                  onDragStart={handleRowDragStart}
                  onDragEnd={handleRowDragEnd}
                  onDragOver={handleRowDragOver}
                  onDrop={handleRowDrop}
                  activePlanId={activePlanId}
                  visitId={visitId}
                  onEditClick={onEditProc ? () => onEditProc(proc) : undefined}
                  onCancelClick={onCancelProc ? () => onCancelProc(proc) : undefined}
                  onDeleteClick={onDeleteProc ? (elig) => onDeleteProc(proc, elig) : undefined}
                  onSessionEdit={onSessionEdit ? (session) => onSessionEdit(proc, session) : undefined}
                  onSessionVoid={onSessionVoid ? (session) => onSessionVoid(proc, session) : undefined}
                />
              ))}
              <tr
                className={cn(
                  "h-10 transition-colors border-t border-dashed border-slate-200",
                  isHoveringGroup && isDraggingFromElsewhere && "bg-blue-100",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragState.draggingItem)
                    setDragState((prev) => ({
                      ...prev,
                      hoverVisitGroup: visitGroup,
                    }));
                }}
                onDrop={handleGroupDrop}
              >
                <td
                  colSpan={8}
                  className="text-center text-xs text-slate-400 py-2"
                >
                  {isHoveringGroup && isDraggingFromElsewhere
                    ? "Drop to add to this visit"
                    : ""}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {!expanded && isHoveringGroup && isDraggingFromElsewhere && (
        <div className="px-5 py-3 text-center text-sm text-blue-600 font-medium bg-blue-50 rounded-b-lg">
          Drop to expand and add to Visit {visitGroup}
        </div>
      )}
    </div>
  );
}

function PlanSidebarItem({
  plan,
  active,
  onClick,
}: {
  plan: TreatmentPlan;
  active: boolean;
  onClick: () => void;
}) {
  const m = STATUS_META[plan.status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-3 py-2.5 text-left rounded-lg mx-1 transition-all",
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "hover:bg-slate-100 text-slate-700",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            m?.dot ?? "bg-slate-400",
          )}
        />
        <span className="truncate text-sm font-medium">{plan.title}</span>
      </div>
      <span
        className={cn(
          "text-[11px] tabular-nums shrink-0 ml-2",
          active ? "text-blue-100" : "text-slate-400",
        )}
      >
        {plan.summary?.completionPercent ?? 0}%
      </span>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export interface TreatmentPlanTabProps {
  planId?: string;
  patientId: string;
  visitId: string;
  dentistId?: string;
  readOnly?: boolean;
  onRefresh?: () => void;
}

export const TreatmentPlanTab: React.FC<TreatmentPlanTabProps> = ({
  planId,
  patientId,
  visitId,
  dentistId,
  readOnly = false,
  onRefresh,
}) => {
  const queryClient = useQueryClient();
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [detailDialogProc, setDetailDialogProc] =
    useState<TreatmentProcedure | null>(null);
  const [pendingSessionEdit, setPendingSessionEdit] =
    useState<ProcedureSession | null>(null);
  const [pendingSessionVoid, setPendingSessionVoid] =
    useState<ProcedureSession | null>(null);
  const [showSessionExecution, setShowSessionExecution] = useState(false);
  const [selectedProcedureForSession, setSelectedProcedureForSession] =
    useState<TreatmentProcedure | null>(null);
  const [editDialogProc, setEditDialogProc] = useState<TreatmentProcedure | null>(null);
  const [deleteDialogState, setDeleteDialogState] = useState<{
    proc: TreatmentProcedure;
    eligibility: ProcedureDeleteEligibility;
  } | null>(null);
  const [cancelDialogProc, setCancelDialogProc] = useState<TreatmentProcedure | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false);

  const { data: plansData = [], isLoading: plansLoading } = useQuery({
    queryKey: ["tx-plans", patientId],
    queryFn: () => txApi.getPatientPlans(patientId),
  });
  const plans = (plansData as TreatmentPlan[]) ?? [];

  const [dragState, setDragState] = useState<{
    draggingItem: DragItem | null;
    hoverVisitGroup: number | null;
  }>({ draggingItem: null, hoverVisitGroup: null });

  const handleOpenProcedureDetail = useCallback((proc: TreatmentProcedure) => {
    setDetailDialogProc(proc);
    setPendingSessionEdit(null);
    setPendingSessionVoid(null);
  }, []);

  const handleSessionRowEdit = useCallback((proc: TreatmentProcedure, session: any) => {
    setPendingSessionEdit(session);
    setDetailDialogProc(proc);
  }, []);

  const handleSessionRowVoid = useCallback((proc: TreatmentProcedure, session: any) => {
    setPendingSessionVoid(session);
    setDetailDialogProc(proc);
  }, []);

  const { data: _activePlanRaw, isLoading: planLoading } = useQuery({
    queryKey: ["tx-plan", activePlanId],
    queryFn: () => txApi.getPlan(activePlanId!),
    enabled: !!activePlanId,
    staleTime: 5_000,
  });
  const activePlan = _activePlanRaw as TreatmentPlan | undefined;

  useEffect(() => {
    if (plans.length > 0 && !activePlanId) setActivePlanId(plans[0].id);
  }, [plans, activePlanId]);

  useEffect(() => {
    setTitleDraft("");
    setEditingTitle(false);
    setSelectedIds(new Set());
  }, [activePlanId]);

  const inv = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["tx-plan", activePlanId] });
    queryClient.invalidateQueries({ queryKey: ["tx-plans", patientId] });
  }, [queryClient, activePlanId, patientId]);

  const createPlanMut = useMutation({
    mutationFn: () => {
      const payload: any = { patientId, title: newPlanTitle };
      if (dentistId) payload.dentistId = dentistId;
      return txApi.createPlan(payload);
    },
    onSuccess: (p: any) => {
      inv();
      setActivePlanId(p.id);
      setShowCreatePlan(false);
      setNewPlanTitle("");
    },
    onError: (error) => {
      console.error("CREATE PLAN FAILED:", error);
      toast.error(`Failed to create plan: ${error.message}`);
    },
  });

  const addProcMut = useMutation({
    mutationFn: (d: any) => txApi.addProcedure(activePlanId!, d),
    onSuccess: () => {
      toast.success("Procedure added");
      inv();
      setShowAddModal(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to add procedure: ${error?.response?.data?.message ?? error?.message ?? "Unknown error"}`);
    },
  });

  const updateProcMut = useMutation({
    mutationFn: ({ procId, data }: { procId: string; data: any }) =>
      treatmentProceduresEditApi.updateProcedure(activePlanId!, procId, data),
    onSuccess: () => {
      toast.success("Procedure updated");
      inv();
    },
    onError: (error: any) => {
      toast.error(`Failed to update procedure: ${error?.response?.data?.message ?? error?.message ?? "Unknown error"}`);
    },
  });

  const removeProcMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => txApi.removeProcedure(activePlanId!, id, reason),
    onSuccess: () => {
      toast.success("Procedure removed");
      inv();
    },
    onError: (error: any) => {
      toast.error(`Failed to remove procedure: ${error?.response?.data?.message ?? error?.message ?? "Unknown error"}`);
    },
  });

  // Route through the dedicated cancel endpoint so the backend can run the
  // full reversal pipeline (chart entries superseded, pending ledger voided,
  // pending sessions → CANCELLED, audit row written with action=CANCEL +
  // the supplied reason). Going through plain updateProcedure would skip all
  // of that.
  const cancelProcMut = useMutation({
    mutationFn: ({ procId, reason }: { procId: string; reason: string }) =>
      treatmentProceduresEditApi.cancelProcedure(activePlanId!, procId, { reason }),
    onSuccess: () => {
      toast.success("Procedure cancelled");
      inv();
      setCancelDialogProc(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to cancel procedure: ${error?.response?.data?.message ?? error?.message ?? "Unknown error"}`);
    },
  });

  const reorderProcMut = useMutation({
    mutationFn: (
      updates: { id: string; sequence: number; visitGroup: number }[],
    ) => txApi.reorderProcedures(activePlanId!, updates),
    onSuccess: () => {
      inv();
      setSelectedIds(new Set());
      setShowMoveDialog(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to reorder: ${error?.message ?? "Unknown error"}`);
    },
  });

  const updatePlanMut = useMutation({
    mutationFn: (d: any) => txApi.updatePlan(activePlanId!, d),
    onSuccess: () => {
      toast.success("Plan updated");
      inv();
    },
    onError: (error: any) => {
      toast.error(`Failed to update plan: ${error?.message ?? "Unknown error"}`);
    },
  });

  const deletePlanMut = useMutation({
    mutationFn: () => txApi.deletePlan(activePlanId!),
    onSuccess: () => {
      toast.success("Treatment plan deleted");
      // Drop the active selection — the next plan (if any) will take over
      setActivePlanId(null);
      inv();
    },
    onError: (error: any) => {
      toast.error(
        `Failed to delete plan: ${error?.response?.data?.message ?? error?.message ?? "Unknown error"}`,
      );
    },
  });

  const executeSessionMut = useMutation({
    mutationFn: ({
      planId,
      procedureId,
      data,
      sessionId,
      idempotencyKey,
    }: {
      planId: string;
      procedureId: string;
      sessionId?: string;
      visitId: string;
      status: string;
      data: any;
      idempotencyKey?: string;
    }) =>
      // No sessionId → atomic create-and-execute on the backend (one tx), so a
      // failed execute can't leave an orphan PENDING session behind. The
      // idempotency key makes a double-submit replay the first response
      // instead of creating a duplicate session.
      sessionId
        ? txApi.executeSession(planId, procedureId, sessionId, data, idempotencyKey)
        : txApi.createAndExecuteSession(planId, procedureId, data, idempotencyKey),
    onSuccess: () => {
      toast.success("Session recorded successfully");
      inv();
      queryClient.invalidateQueries({ queryKey: ["chart-entries", patientId, visitId], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ["treatment-procedures", patientId], refetchType: 'all' });
    },
    onError: (error: any) => {
      console.error("Session execution failed:", error);
      toast.error(
        `Failed to record session: ${error?.response?.data?.message ?? error?.message ?? "Unknown error"}`,
      );
    },
  });

  const handleContinueTreatment = useCallback(() => {
    if (detailDialogProc) {
      setSelectedProcedureForSession(detailDialogProc);
      setShowSessionExecution(true);
      setDetailDialogProc(null);
    }
  }, [detailDialogProc]);

  const handleSessionComplete = useCallback(
    async (sessionData: any) => {
      if (!selectedProcedureForSession || !activePlanId) {
        toast.error("No procedure or plan selected.");
        return;
      }

      const resolvedDentistId = sessionData.providerId || dentistId;
      if (!resolvedDentistId) {
        toast.error(
          "No provider selected. Please select a performing provider in the session dialog.",
        );
        return;
      }

      try {
        // When the session doesn't exist yet we DON'T pre-create it. The
        // backend create-and-execute path makes session creation + execution a
        // single atomic transaction, so a failed execute can't leak an orphan
        // PENDING session and retries can't accumulate empty ones.
        const sessionId = sessionData.sessionId;
        const sessionLabel = sessionData.phase
          ? `Session ${(selectedProcedureForSession.sessions?.length || 0) + 1} – ${sessionData.phase}`
          : `Session ${(selectedProcedureForSession.sessions?.length || 0) + 1}`;

        await executeSessionMut.mutateAsync({
          planId: activePlanId,
          procedureId: selectedProcedureForSession.id,
          sessionId,
          visitId,
          status: sessionData.isFinal ? "COMPLETED" : "IN_PROGRESS",
          idempotencyKey: newIdempotencyKey(),
          data: {
            // Only consumed by the backend when creating the session (no sessionId).
            sessionLabel,
            visitGroup: selectedProcedureForSession.visitGroup || 1,
            performedDate: sessionData.performedDate,
            performedNotes: sessionData.performedNotes,
            actualInputsUsed: sessionData.actualInputsUsed,
            outcome: sessionData.outcome,
            isFinal: sessionData.isFinal,
            finalOverrideReason: sessionData.finalOverrideReason,
            phase: sessionData.phase,
            surfaces: sessionData.surfaces,
            providerId: resolvedDentistId,
            dentistId: resolvedDentistId,
            visitId,
            toothStatuses: sessionData.toothStatuses ?? [],
            imagingLinks: sessionData.imagingLinks,
            imagingGroupId: sessionData.imagingGroupId,
          },
        });

        setShowSessionExecution(false);
        setSelectedProcedureForSession(null);
      } catch (error: any) {
        console.error("Session execution failed:", error);
      }
    },
    [
      selectedProcedureForSession,
      activePlanId,
      dentistId,
      visitId,
      executeSessionMut,
      inv,
    ],
  );

  const handleDirectExecution = useCallback((proc: TreatmentProcedure) => {
    setSelectedProcedureForSession(proc);
    setShowSessionExecution(true);
  }, []);

  const handleEditProc = useCallback((proc: TreatmentProcedure) => {
    setEditDialogProc(proc);
  }, []);

  const handleCancelProc = useCallback((proc: TreatmentProcedure) => {
    setCancelDialogProc(proc);
  }, []);

  const handleDeleteProc = useCallback(
    (proc: TreatmentProcedure, eligibility: ProcedureDeleteEligibility) => {
      setDeleteDialogState({ proc, eligibility });
    },
    [],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const procedureGroups = useMemo(() => {
    if (!activePlan?.procedures) return [];
    const groups = new Map<number, TreatmentProcedure[]>();
    const sorted = [...activePlan.procedures].sort(
      (a, b) => a.sequence - b.sequence,
    );
    sorted.forEach((p) => {
      const vg = p.visitGroup ?? 1;
      if (!groups.has(vg)) groups.set(vg, []);
      groups.get(vg)!.push({ ...p, visitGroup: vg });
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([visitGroup, procedures]) => ({ visitGroup, procedures }));
  }, [activePlan]);

  const maxVG =
    procedureGroups.length > 0
      ? Math.max(...procedureGroups.map((g) => g.visitGroup))
      : 1;

  const toothStatuses = useMemo(() => {
    const m: Record<number, string> = {};
    activePlan?.procedures.forEach((p) => {
      if (p.targets) {
        p.targets.forEach((target) => {
          if (!m[target.toothNumber])
            m[target.toothNumber] =
              p.status === "COMPLETED" ? "FILLED" : "WATCH";
        });
      }
    });
    return m;
  }, [activePlan]);

  /**
   * Sidebar groups — now matching the 5-status system:
   *   Active   = PLANNED + IN_PROGRESS
   *   Referred = REFERRED
   *   Completed = COMPLETED
   *   Cancelled = CANCELLED
   */
  const planGroups = useMemo(() => {
    const g: Record<string, TreatmentPlan[]> = {
      Active: [],
      Referred: [],
      Completed: [],
      Cancelled: [],
    };
    plans.forEach((p) => {
      if (p.status === "COMPLETED") g["Completed"].push(p);
      else if (p.status === "CANCELLED") g["Cancelled"].push(p);
      else if (p.status === "REFERRED") g["Referred"].push(p);
      else g["Active"].push(p); // PLANNED + IN_PROGRESS
    });
    return g;
  }, [plans]);

  const summary = activePlan?.summary;

  const handleBatchMove = (targetVisitGroup: number) => {
    const selectedProcs =
      activePlan?.procedures.filter((p) => selectedIds.has(p.id)) ?? [];
    if (selectedProcs.length === 0) return;
    const targetVisitProcs =
      activePlan?.procedures.filter(
        (p) => p.visitGroup === targetVisitGroup && !selectedIds.has(p.id),
      ) ?? [];
    const baseSequence = targetVisitGroup * 100 + targetVisitProcs.length;
    const updates = selectedProcs.map((p, idx) => ({
      id: p.id,
      sequence: baseSequence + idx,
      visitGroup: targetVisitGroup,
    }));
    reorderProcMut.mutate(updates);
  };

  return (
    <div className="w-full flex h-[calc(100vh-295px)] min-h-[580px] rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/50 shadow-lg">
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200">
          {!showCreatePlan ? (
            <Button
              variant="outline"
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 border-white/30 text-white hover:bg-white/20"
              onClick={() => !readOnly && setShowCreatePlan(true)}
              disabled={readOnly}
              startIcon={<Plus className="w-4 h-4" />}
            >
              New Treatment Plan
            </Button>
          ) : (
            <div className="space-y-2">
              <input
                autoFocus
                type="text"
                placeholder="Treatment plan title..."
                value={newPlanTitle}
                onChange={(e) => setNewPlanTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPlanTitle.trim())
                    createPlanMut.mutate();
                  if (e.key === "Escape") {
                    setShowCreatePlan(false);
                    setNewPlanTitle("");
                  }
                }}
                className="w-full text-sm rounded-lg border border-blue/30 bg-blue/10 text-black placeholder-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-white/50"
              />
              <div className="flex gap-2">
                <Button
                  variant="success"
                  size="sm"
                  className="flex-1"
                  onClick={() => createPlanMut.mutate()}
                  disabled={!newPlanTitle.trim() || createPlanMut.isPending}
                >
                  {createPlanMut.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Create"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/20"
                  onClick={() => {
                    setShowCreatePlan(false);
                    setNewPlanTitle("");
                  }}
                >
                  ✕
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-2 space-y-2">
          {plansLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          ) : (
            Object.entries(planGroups).map(([gName, gPlans]) => (
              <div key={gName}>
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    {gName}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {gPlans.length}
                  </span>
                </div>
                {gPlans.map((plan) => (
                  <PlanSidebarItem
                    key={plan.id}
                    plan={plan}
                    active={activePlanId === plan.id}
                    onClick={() => setActivePlanId(plan.id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
        {activePlan ? (
          <>
            <div className="px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  {editingTitle && !readOnly ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="text"
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const trimmed = titleDraft.trim();
                            if (trimmed && trimmed !== activePlan.title) {
                              updatePlanMut.mutate({ title: trimmed });
                            }
                            setEditingTitle(false);
                          } else if (e.key === "Escape") {
                            setEditingTitle(false);
                          }
                        }}
                        onBlur={() => {
                          const trimmed = titleDraft.trim();
                          if (trimmed && trimmed !== activePlan.title) {
                            updatePlanMut.mutate({ title: trimmed });
                          }
                          setEditingTitle(false);
                        }}
                        className="text-xl font-semibold text-slate-800 bg-white border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[280px]"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const trimmed = titleDraft.trim();
                          if (trimmed && trimmed !== activePlan.title) {
                            updatePlanMut.mutate({ title: trimmed });
                          }
                          setEditingTitle(false);
                        }}
                        className="p-1.5 rounded text-green-600 hover:bg-green-50"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setEditingTitle(false)}
                        className="p-1.5 rounded text-slate-500 hover:bg-slate-100"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 group">
                      <h2 className="text-xl font-semibold text-slate-800">
                        {activePlan.title}
                      </h2>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            setTitleDraft(activePlan.title);
                            setEditingTitle(true);
                          }}
                          className="p-1.5 rounded text-slate-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 hover:bg-blue-50 transition-opacity"
                          title="Rename treatment plan"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <PlanStatusControl
                      status={activePlan.status}
                      readOnly={readOnly}
                      saving={updatePlanMut.isPending}
                      onChange={(next) =>
                        updatePlanMut.mutate({ status: next })
                      }
                    />
                    <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded">
                      {activePlan.planCode}
                    </span>
                    {!readOnly &&
                      (() => {
                        const canDelete =
                          (activePlan.procedures?.length ?? 0) === 0;
                        return (
                          <button
                            type="button"
                            onClick={() => canDelete && setConfirmDeletePlan(true)}
                            disabled={!canDelete || deletePlanMut.isPending}
                            className={cn(
                              "p-1.5 rounded transition-colors",
                              canDelete
                                ? "text-red-500 hover:bg-red-50"
                                : "text-slate-300 cursor-not-allowed",
                            )}
                            title={
                              canDelete
                                ? "Delete treatment plan"
                                : "Remove or cancel all procedures before deleting"
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        );
                      })()}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
                {(summary?.completedCost ?? 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Completed</span>
                    <span className="font-semibold text-green-600">
                      {fmt(summary!.completedCost)}
                    </span>
                  </div>
                )}
                {(summary?.remainingCost ?? 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Remaining</span>
                    <span className="font-semibold text-blue-600">
                      {fmt(summary!.remainingCost)}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  {selectedIds.size > 0 && (
                    <>
                      <span className="text-xs text-slate-500">
                        {selectedIds.size} selected
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowMoveDialog(true)}
                        startIcon={<Move className="w-3.5 h-3.5" />}
                      >
                        Move
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedIds(new Set())}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {planLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : procedureGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400" />
              ) : (
                procedureGroups.map(({ visitGroup, procedures }) => (
                  <VisitGroupSection
                    key={visitGroup}
                    visitGroup={visitGroup}
                    procedures={procedures}
                    selectedIds={selectedIds}
                    onCheck={toggleSelect}
                    onStatusClick={setDetailDialogProc}

                    onReorder={(updates) => reorderProcMut.mutate(updates)}
                    readOnly={readOnly}
                    allProcedures={activePlan?.procedures ?? []}
                    dragState={dragState}
                    setDragState={setDragState}
                    activePlanId={activePlanId || undefined}
                    onExecuteClick={handleDirectExecution}
                    visitId={visitId}
                     onEditProc={handleEditProc}
                     onCancelProc={handleCancelProc}
                     onDeleteProc={handleDeleteProc}
                     onSessionEdit={handleSessionRowEdit}
                     onSessionVoid={handleSessionRowVoid}
                   />
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            {plansLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            ) : (
              <>
                <ClipboardList className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-base text-slate-500 font-medium">
                  No treatment plan selected
                </p>
                {!readOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setShowCreatePlan(true)}
                  >
                    + Create a new case
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <ProcedureDetailDialog
        open={!!detailDialogProc}
        proc={detailDialogProc}
        onClose={() => {
          setDetailDialogProc(null);
          setPendingSessionEdit(null);
          setPendingSessionVoid(null);
        }}
        onContinueTreatment={handleContinueTreatment}
        activePlanId={activePlanId || undefined}
        readOnly={readOnly}
        onRefresh={() =>
          queryClient.invalidateQueries({ queryKey: ["tx-plan", activePlanId] })
        }
        pendingEditTarget={pendingSessionEdit}
        pendingVoidTarget={pendingSessionVoid}
        onPendingSessionActionsApplied={() => {
          setPendingSessionEdit(null);
          setPendingSessionVoid(null);
        }}
      />

      <SessionExecutionDialog
        open={showSessionExecution}
        onClose={() => setShowSessionExecution(false)}
        procedure={selectedProcedureForSession as any}
        planId={activePlanId || ""}
        visitId={visitId}
        patientId={patientId}
        dentistId={dentistId}
        onComplete={handleSessionComplete}
        executing={executeSessionMut.isPending}
        {...({} as any)}
      />
      <MoveVisitDialog
        open={showMoveDialog}
        onClose={() => setShowMoveDialog(false)}
        count={selectedIds.size}
        maxVisitGroup={maxVG}
        onMove={handleBatchMove}
      />

      {/* ── Edit Procedure ─────────────────────────────────────────────── */}
      {editDialogProc && activePlanId && (
        <EditProcedureDialog
          isOpen={!!editDialogProc}
          onClose={() => setEditDialogProc(null)}
          initialData={{
            treatmentProcedureId: editDialogProc.id,
            treatmentPlanId: activePlanId,
            procedureName: editDialogProc.procedure.name,
            procedureCode: editDialogProc.procedure.code,
            toothNumbers: getToothNumbersFromTargets(editDialogProc.targets),
            surfaces: getSurfacesFromTargets(editDialogProc.targets),
            notes: editDialogProc.performedNotes,
            scheduledDate: (editDialogProc as any).scheduledDate
              ? new Date((editDialogProc as any).scheduledDate).toISOString()
              : undefined,
            totalPrice: editDialogProc.totalPrice ?? 0,
            currency: editDialogProc.currency ?? "UGX",
            // Pricing snapshot for the discount-% display
            pricePerUnit: editDialogProc.pricePerUnit != null ? Number(editDialogProc.pricePerUnit) : undefined,
            quantity: editDialogProc.quantity ?? 1,
            subtotalPrice: editDialogProc.subtotalPrice != null ? Number(editDialogProc.subtotalPrice) : undefined,
            discountAmount: editDialogProc.discountAmount != null ? Number(editDialogProc.discountAmount) : 0,
            taxAmount: editDialogProc.taxAmount != null ? Number(editDialogProc.taxAmount) : 0,
            basePrice: (editDialogProc as any).procedure?.basePrice != null
              ? Number((editDialogProc as any).procedure.basePrice)
              : undefined,
            sessionType: editDialogProc.sessionType ?? "SINGLE",
            sessionCount: editDialogProc.sessionCount ?? 1,
            billingType: editDialogProc.billingType ?? "PAY_FULL",
            // Linked invoice (locks pricing fields when POSTED/PAID)
            invoiceId: (editDialogProc as any).invoiceId ?? null,
            invoiceStatus: (editDialogProc as any).invoiceStatus ?? null,
            invoicePaymentStatus: (editDialogProc as any).invoicePaymentStatus ?? null,
            invoiceAmountPaid: (editDialogProc as any).invoiceAmountPaid ?? 0,
            status: editDialogProc.status,
            paymentStatus: editDialogProc.paymentStatus,
            sessionsCount: editDialogProc.sessions?.length ?? 0,
            sequence: editDialogProc.sequence,
            visitGroup: editDialogProc.visitGroup,
          }}
          patientId={patientId}
          visitId={visitId}
          dentistId={dentistId}
          onSuccess={() => {
            inv();
            setEditDialogProc(null);
          }}
        />
      )}

      {/* ── Delete Procedure ───────────────────────────────────────────── */}
      {deleteDialogState && (
        <DeleteProcedureDialog
          isOpen={!!deleteDialogState}
          onClose={() => setDeleteDialogState(null)}
          procedureName={deleteDialogState.proc.procedure.name}
          canDelete={deleteDialogState.eligibility.canDelete}
          canCancel={deleteDialogState.eligibility.canCancel}
          reason={deleteDialogState.eligibility.reason}
          sessionsCount={deleteDialogState.eligibility.sessionsCount}
          status={deleteDialogState.eligibility.status}
          paymentStatus={deleteDialogState.eligibility.paymentStatus}
          invoiceStatus={deleteDialogState.eligibility.invoiceStatus ?? null}
          invoiceAmountPaid={deleteDialogState.eligibility.invoiceAmountPaid ?? 0}
          onConfirmDelete={async (reason: string) => {
            await removeProcMut.mutateAsync({ id: deleteDialogState.proc.id, reason });
            setDeleteDialogState(null);
          }}
          onGoToCancel={() => {
            const proc = deleteDialogState.proc;
            setDeleteDialogState(null);
            setCancelDialogProc(proc);
          }}
        />
      )}

      {/* ── Cancel Procedure ───────────────────────────────────────────── */}
      {cancelDialogProc && (
        <CancelProcedureDialog
          isOpen={!!cancelDialogProc}
          onClose={() => setCancelDialogProc(null)}
          procedureName={cancelDialogProc.procedure.name}
          status={cancelDialogProc.status}
          sessionsCount={cancelDialogProc.sessions?.length ?? 0}
          paymentStatus={cancelDialogProc.paymentStatus}
          hasInvoice={!!(cancelDialogProc as any).invoiceId}
          onConfirm={async (reason) => {
            await cancelProcMut.mutateAsync({
              procId: cancelDialogProc.id,
              reason,
            });
          }}
        />
      )}

      {/* ── Delete Plan confirmation ───────────────────────────────────── */}
      {confirmDeletePlan && activePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              Delete treatment plan?
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              This will permanently delete{" "}
              <span className="font-semibold">{activePlan.title}</span>{" "}
              <span className="font-mono text-xs text-slate-400">
                ({activePlan.planCode})
              </span>
              . This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmDeletePlan(false)}
                disabled={deletePlanMut.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await deletePlanMut.mutateAsync();
                  setConfirmDeletePlan(false);
                }}
                disabled={deletePlanMut.isPending}
              >
                {deletePlanMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Delete"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};