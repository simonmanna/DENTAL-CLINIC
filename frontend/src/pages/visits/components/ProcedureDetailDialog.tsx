// src/pages/visits/components/ProcedureDetailDialog.tsx
import React, { useState, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  X, Grid3X3, FileText, Layers, Package, CheckCircle,
  Edit3, Play, Clock, TrendingUp, Stethoscope, Loader2, Info
} from "lucide-react";
import { SessionEditDialog } from './SessionEditDialog';
import { SessionVoidDialog } from './SessionVoidDialog';
import { treatmentProceduresEditApi } from '../../../lib/api/treatment-procedures-edit';
// src/pages/visits/components/ProcedureDetailDialog.tsx
import { TxStatus } from "./TreatmentPlanTab";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES (Updated for new schema with ProcedureTarget)
// ══════════════════════════════════════════════════════════════════════════════

export type ToothSurface =
  | "FACIAL"
  | "LINGUAL"
  | "PALATAL"
  | "MESIAL"
  | "DISTAL"
  | "OCCLUSAL"
  | "INCISAL";

export type SessionType = 'SINGLE' | 'MULTI';
export type BillingType = 'PAY_FULL' | 'PAY_PARTIALLY';

export interface SurfaceDef {
  value: ToothSurface;
  label: string;
  short: string;
  desc: string;
  anteriorOnly?: boolean;
  posteriorOnly?: boolean;
}

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

// NEW: ProcedureTarget interface
export interface ProcedureTarget {
  id: string;
  toothNumber: number;
  surfaces: ToothSurface[];
  unitIndex?: number | null;
}

export interface ProcedureSession {
  id: string;
  sessionNumber: number;
  status: TxStatus;
  performedDate?: string | null;
  performedNotes?: string | null;
  sessionCost?: number;
  cost?: number;
  visitId?: string;
  ledgerStatus?: string;
  ledgerEntry?: any;
  sessionLabel?: string;
  targets?: ProcedureTarget[]; // Add targets to sessions

   edits?: any[];

}

export interface TreatmentProcedure {
  id: string;
  sequence: number;
  visitGroup: number;
  procedureId: string;
  // REMOVED: toothNumbers and surfaces - now using targets
  cost?: number;
  totalPrice?: number;
  subtotalPrice?: number;
  pricePerUnit?: number;
  quantity?: number;
  currency?: string;
  discountAmount?: number;
  taxAmount?: number;
  status: TxStatus;
  performedNotes?: string;
  scheduledDate?: string;
  completedAt?: string;
  performedDate?: string;
  actualInputsUsed?: ActualInput[];
  sessionType?: SessionType;
  billingType?: BillingType;
  sessionCount?: number;
  paymentStatus?: 'PAID' | 'PARTIALLY_PAID' | 'OPEN' | 'INVOICED';
  originalCurrency?: string;
  originalPrice?: number;
  procedure: {
    id: string;
    code?: string;
    name: string;
    category: string | { name: string };
    description?: string;
    defaultCost?: number;
    unitPrice?: number;
    basePrice?: number;
    inputs?: InventoryInput[];
  };
  sessions?: ProcedureSession[];
  targets?: ProcedureTarget[]; // Add targets to procedure
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ══════════════════════════════════════════════════════════════════════════════

const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const ALL_SURFACES: SurfaceDef[] = [
  { value: "FACIAL", label: "Facial", short: "F", desc: "Buccal/Labial — outer surface" },
  { value: "LINGUAL", label: "Lingual", short: "L", desc: "Tongue-side — lower jaw" },
  { value: "PALATAL", label: "Palatal", short: "P", desc: "Palate-side — upper jaw" },
  { value: "MESIAL", label: "Mesial", short: "M", desc: "Towards midline" },
  { value: "DISTAL", label: "Distal", short: "D", desc: "Away from midline" },
  { value: "OCCLUSAL", label: "Occlusal", short: "O", desc: "Biting surface — posteriors", posteriorOnly: true },
  { value: "INCISAL", label: "Incisal", short: "I", desc: "Cutting edge — anteriors", anteriorOnly: true },
];

const STATUS_META: Record<TxStatus, { label: string; color: string; bg: string; border: string; dot: string; btnClass: string }> = {
  PLANNED: { label: "Planned", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", dot: "bg-slate-400", btnClass: "bg-slate-600 hover:bg-slate-700" },
  IN_PROGRESS: { label: "In Progress", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-500", btnClass: "bg-blue-600 hover:bg-blue-700" },
  COMPLETED: { label: "Completed", color: "text-green-700", bg: "bg-green-50", border: "border-green-200", dot: "bg-green-500", btnClass: "bg-green-600 hover:bg-green-700" },
  ON_HOLD: { label: "On Hold", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500", btnClass: "bg-amber-500 hover:bg-amber-600" },
  CANCELLED: { label: "Cancelled", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-400", btnClass: "bg-red-500 hover:bg-red-600" },
  REFERRED: { label: "On Hold", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500", btnClass: "bg-amber-500 hover:bg-amber-600" },
};

function cn(...c: (string | boolean | undefined | null)[]) {
  return c.filter(Boolean).join(" ");
}

function fmt(n: number | string | undefined | null) {
  if (n == null || n === "") return "0";
  const num = Number(n);
  if (isNaN(num)) return "0";
  return num.toLocaleString('en-US');
}

// Helper to get cost safely
function getCost(proc: TreatmentProcedure): number {
  return proc.totalPrice ?? proc.cost ?? 0;
}

// Helper to get currency safely
function getCurrency(proc: TreatmentProcedure): string {
  return proc.currency ?? proc.originalCurrency ?? 'UGX';
}

// Helper to get category name safely
function getCategoryName(category: string | { name: string } | undefined): string {
  if (!category) return 'Uncategorized';
  if (typeof category === 'string') return category;
  return category.name ?? 'Uncategorized';
}

// Helper to get tooth numbers from targets
function getToothNumbersFromTargets(targets?: ProcedureTarget[]): number[] {
  if (!targets || targets.length === 0) return [];
  return targets.map(t => t.toothNumber).sort((a, b) => a - b);
}

// Helper to get surfaces from targets (assuming all targets have same surfaces)
function getSurfacesFromTargets(targets?: ProcedureTarget[]): ToothSurface[] {
  if (!targets || targets.length === 0) return [];
  return targets[0]?.surfaces || [];
}

function isAnteriorTooth(n: number): boolean {
  const p = n % 10;
  return p >= 1 && p <= 3;
}

function isPosteriorTooth(n: number): boolean {
  const p = n % 10;
  return p >= 4 && p <= 8;
}

function isUpperTooth(n: number): boolean {
  return n >= 11 && n <= 28;
}

function getContextualSurfaces(teeth: number[]): SurfaceDef[] {
  if (teeth.length === 0) return ALL_SURFACES;
  const hasAnt = teeth.some(isAnteriorTooth);
  const hasPost = teeth.some(isPosteriorTooth);
  const hasUpper = teeth.some(isUpperTooth);
  const hasLower = teeth.some((n) => !isUpperTooth(n));
  return ALL_SURFACES.filter((s) => {
    if (s.value === "OCCLUSAL" && !hasPost) return false;
    if (s.value === "INCISAL" && !hasAnt) return false;
    if (s.value === "PALATAL" && !hasUpper) return false;
    if (s.value === "LINGUAL" && !hasLower) return false;
    return true;
  });
}

function surfaceAbbrev(surfaces: ToothSurface[]): string {
  const order: ToothSurface[] = ["FACIAL", "LINGUAL", "PALATAL", "MESIAL", "DISTAL", "OCCLUSAL", "INCISAL"];
  return order
    .filter((s) => surfaces.includes(s))
    .map((s) => ALL_SURFACES.find((x) => x.value === s)?.short ?? s[0])
    .join("");
}

// ══════════════════════════════════════════════════════════════════════════════
// API
// ══════════════════════════════════════════════════════════════════════════════

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:3001";

async function apiFetch(path: string, opts?: RequestInit): Promise<any> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("access_token") : "";
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Add to your txApi object (around line ~180)
const txApi = {
  updateSession: (planId: string, procId: string, sessionId: string, data: any) =>
    apiFetch(`/treatment-plans/${planId}/procedures/${procId}/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),
    editSession: (planId: string, procId: string, sessionId: string, data: any) =>
    apiFetch(`/treatment-plans/${planId}/procedures/${procId}/sessions/${sessionId}/edit`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),
  // Soft-delete a session and reverse every side effect created at execution
  // time. Kept under the legacy `voidSession` name so all existing call sites
  // keep working, but now hits the new REST DELETE endpoint.
  voidSession: (planId: string, procId: string, sessionId: string, data: { reason: string }) =>
    apiFetch(`/treatment-plans/${planId}/procedures/${procId}/sessions/${sessionId}`, {
      method: "DELETE",
      body: JSON.stringify(data)
    }),
  deleteSession: (planId: string, procId: string, sessionId: string, data: { reason: string }) =>
    apiFetch(`/treatment-plans/${planId}/procedures/${procId}/sessions/${sessionId}`, {
      method: "DELETE",
      body: JSON.stringify(data)
    }),
};


function StatusBadge({ status }: { status: TxStatus }) {
  const styles: Record<TxStatus, string> = {
    PLANNED: "bg-slate-100 text-slate-700 border-slate-200",
    IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ON_HOLD: "bg-amber-50 text-amber-700 border-amber-200",
    CANCELLED: "bg-red-50 text-red-700 border-red-200",
    REFERRED: "bg-red-50 text-red-700 border-red-200",
  };

  const labels: Record<TxStatus, string> = {
    PLANNED: "Planned",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    ON_HOLD: "On Hold",
    CANCELLED: "Cancelled",
    REFERRED: "Referred",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}>
      <span className={`w-2 h-2 rounded-full ${status === 'COMPLETED' ? 'bg-emerald-500' : status === 'IN_PROGRESS' ? 'bg-blue-500' : status === 'ON_HOLD' ? 'bg-amber-500' : status === 'CANCELLED' ? 'bg-red-500' : 'bg-slate-400'}`} />
      {labels[status]}
    </span>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export interface ProcedureDetailDialogProps {
  open: boolean;
  proc: TreatmentProcedure | null;
  onClose: () => void;
  onContinueTreatment: () => void;
  activePlanId?: string;
  readOnly?: boolean;
  onRefresh?: () => void;
  onProcedureUpdate?: (updatedProc: TreatmentProcedure) => void;
}

export function ProcedureDetailDialog({
  open,
  proc: initialProc,
  onClose,
  onContinueTreatment,
  activePlanId,
  readOnly,
  onRefresh,
  onProcedureUpdate
}: ProcedureDetailDialogProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'sessions' | 'materials' | 'chart'>('overview');
  const [proc, setProc] = useState<TreatmentProcedure | null>(initialProc);
  const [editMode, setEditMode] = useState(false);

  // Get teeth and surfaces from targets
  const currentTeeth = getToothNumbersFromTargets(proc?.targets);
  const currentSurfaces = getSurfacesFromTargets(proc?.targets);

  const [editedTeeth, setEditedTeeth] = useState<number[]>(currentTeeth);
  const [editedSurfaces, setEditedSurfaces] = useState<ToothSurface[]>(currentSurfaces);
  const [savingChart, setSavingChart] = useState(false);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [sessionFormData, setSessionFormData] = useState<any>({});
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingChart, setUpdatingChart] = useState(false);




  // ══════════════════════════════════════════════════════════════════════════════
  // SESSION EDIT/VOID MUTATIONS
  // ══════════════════════════════════════════════════════════════════════════════

  const [editTarget, setEditTarget] = useState<ProcedureSession | null>(null);
  const [voidTarget, setVoidTarget] = useState<ProcedureSession | null>(null);

    const editMut = useMutation({
    // Accept the full extended payload from SessionEditDialog (surfaces,
    // notes, phase, reason + the newly editable date / provider / outcome /
    // isFinal / per-tooth statuses) and pass it straight through to the
    // backend's PATCH .../sessions/:id/edit endpoint.
    mutationFn: (data: {
      surfaces?: string[];
      notes?: string;
      phase?: string;
      reason: string;
      performedDate?: string;
      providerId?: string;
      outcome?: 'PARTIAL' | 'COMPLETED';
      isFinal?: boolean;
      toothStatuses?: Array<{
        toothNumber: number;
        surfaces?: string[];
        status: string;
        notes?: string;
      }>;
    }) =>
      txApi.editSession(activePlanId!, proc!.id, editTarget!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tx-plan', activePlanId] });
      setEditTarget(null);
      if (onRefresh) onRefresh();
    },
  });

  const voidMut = useMutation({
    mutationFn: (reason: string) =>
      txApi.voidSession(activePlanId!, proc!.id, voidTarget!.id, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tx-plan', activePlanId] });
      setVoidTarget(null);
      if (onRefresh) onRefresh();
    },
  });

  useEffect(() => {
    setProc(initialProc);
    if (initialProc) {
      const teeth = getToothNumbersFromTargets(initialProc.targets);
      const surfaces = getSurfacesFromTargets(initialProc.targets);
      setEditedTeeth(teeth);
      setEditedSurfaces(surfaces);
      setActiveTab('overview');
      setEditingSession(null);
      setEditMode(false);
    }
  }, [initialProc]);

  if (!open || !proc) return null;

  const totalCost = getCost(proc);
  const currency = getCurrency(proc);
  const completedSessions = proc.sessions?.filter(s => s.status === 'COMPLETED').length || 0;
  const totalSessions = proc.sessions?.length || 0;
  const nextSessionNumber = totalSessions + 1;
  const isMultiSession = proc.sessionType === 'MULTI';
  const abbrev = surfaceAbbrev(currentSurfaces);

  const spentSoFar = proc.sessions?.reduce((total, session) => {
    if (session.status === 'COMPLETED') {
      return total + (session.sessionCost ?? session.cost ?? 0);
    }
    return total;
  }, 0) || 0;

  const handleSaveChart = async () => {
    if (!activePlanId || !proc) return;
    setSavingChart(true);
    try {
      // Update the procedure with new tooth numbers and surfaces
      // The backend expects these to update the ProcedureTarget entries
      await treatmentProceduresEditApi.updateProcedure(activePlanId, proc.id, {
        toothNumbers: editedTeeth,
        surfaces: editedSurfaces,
      });

      // Update local state with new targets
      const updatedProc = {
        ...proc,
        targets: editedTeeth.map((tooth, idx) => ({
          id: proc.targets?.find(t => t.toothNumber === tooth)?.id || `temp-${idx}`,
          toothNumber: tooth,
          surfaces: editedSurfaces,
          unitIndex: null
        }))
      };
      setProc(updatedProc);
      if (onProcedureUpdate) onProcedureUpdate(updatedProc);
      if (onRefresh) onRefresh();
      qc.invalidateQueries({ queryKey: ["tx-plan", activePlanId] });
      setEditMode(false);
    } catch (err) {
      console.error('Failed to update dental chart:', err);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSavingChart(false);
    }
  };

  const handleStatusUpdate = async (newStatus: TxStatus) => {
    if (!activePlanId || !proc || newStatus === proc.status) return;
    setUpdatingStatus(true);
    try {
      await treatmentProceduresEditApi.updateProcedure(activePlanId, proc.id, { status: newStatus });
      const updatedProc = { ...proc, status: newStatus };
      setProc(updatedProc);
      if (onProcedureUpdate) onProcedureUpdate(updatedProc);
      if (onRefresh) onRefresh();
      qc.invalidateQueries({ queryKey: ["tx-plan", activePlanId] });
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Failed to update status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const startEditSession = (session: ProcedureSession) => {
    setEditingSession(session.id);
    setSessionFormData({
      status: session.status,
      performedDate: session.performedDate ? new Date(session.performedDate).toISOString().split('T')[0] : '',
      performedNotes: session.performedNotes || '',
      sessionCost: session.sessionCost ?? session.cost ?? 0
    });
  };

  const saveSessionChanges = async (sessionId: string) => {
    if (!activePlanId || !proc) return;
    try {
      await txApi.updateSession(activePlanId, proc.id, sessionId, {
        status: sessionFormData.status,
        performedDate: sessionFormData.performedDate || undefined,
        performedNotes: sessionFormData.performedNotes,
        sessionCost: Number(sessionFormData.sessionCost)
      });
      const updatedSessions = proc.sessions?.map(s =>
        s.id === sessionId ? { ...s, ...sessionFormData, status: sessionFormData.status } : s
      ) || [];
      const updatedProc = { ...proc, sessions: updatedSessions };
      setProc(updatedProc);
      if (onProcedureUpdate) onProcedureUpdate(updatedProc);
      if (onRefresh) onRefresh();
      qc.invalidateQueries({ queryKey: ["tx-plan", activePlanId] });
      setEditingSession(null);
    } catch (err) {
      console.error('Failed to update session:', err);
      alert('Failed to save session changes.');
    }
  };

  const cancelSessionEdit = () => {
    setEditingSession(null);
    setSessionFormData({});
  };

  // Helper to get session surfaces from session targets
  const getSessionSurfaces = (session: ProcedureSession): ToothSurface[] => {
    if (session.targets && session.targets.length > 0) {
      return session.targets[0]?.surfaces || [];
    }
    return [];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0369a1] text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Stethoscope className="w-6 h-6 text-white-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold">{proc.procedure.name}</h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-slate-300">
                <span className="flex items-center gap-1">
                  <Grid3X3 className="w-3 h-3" />
                  {getCategoryName(proc.procedure.category)}
                </span>
                {proc.procedure.code && (
                  <>
                    <span className="text-slate-500">|</span>
                    <span className="font-mono text-blue-300">{proc.procedure.code}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right mr-4">
              <p className="text-2xl font-bold text-white">{currency} {fmt(totalCost)}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Total Cost</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 py-3 bg-slate-50 border-b border-slate-200">
          {[
            { id: 'overview', label: 'Overview', icon: FileText },
            // { id: 'chart', label: 'Dental Chart', icon: Grid3X3 },
            { id: 'sessions', label: `Treatment Sessions (${totalSessions})`, icon: Layers },
            // { id: 'materials', label: 'Procedure Inputs', icon: Package },
          ].map((tab: any) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setEditingSession(null); }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-6">
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Treatment Details</h3>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                          <span className="text-sm text-slate-500">Procedure Status</span>
                          {!readOnly ? (
                            <div className="flex items-center gap-2">
                              <StatusBadge status={proc.status} />
                              {/* <select
                                value={proc.status}
                                onChange={(e) => handleStatusUpdate(e.target.value as TxStatus)}
                                disabled={updatingStatus}
                                className="text-sm rounded-lg border border-slate-300 px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="PLANNED">Planned</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="ON_HOLD">On Hold</option>
                                <option value="CANCELLED">Cancelled</option>
                              </select> */}
                              {updatingStatus && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                            </div>
                          ) : (
                            <StatusBadge status={proc.status} />
                          )}
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                          <span className="text-sm text-slate-500">Session Type</span>
                          <span className="text-sm font-medium text-slate-800">
                            {isMultiSession ? `Multi-Session (${proc.sessionCount} planned)` : 'Single Session'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                          <span className="text-sm text-slate-500">Billing Type</span>
                          <span className="text-sm font-medium text-slate-800">
                            {proc.billingType === 'PAY_PARTIALLY' ? 'Pay Per Visit' : 'Full Upfront'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                          <span className="text-sm text-slate-500">Payment Status</span>
                          <span className={cn(
                            "text-xs font-medium px-2.5 py-0.5 rounded-full border",
                            proc.paymentStatus === 'PAID' ? "bg-green-100 text-green-700 border-green-200" :
                              proc.paymentStatus === 'PARTIALLY_PAID' ? "bg-amber-100 text-amber-700 border-amber-200" :
                                "bg-slate-100 text-slate-700 border-slate-200"
                          )}>
                            {proc.paymentStatus || 'OPEN'}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                          <span className="text-sm text-slate-500">Procedure Visit Group</span>
                          <span className="text-sm font-medium text-slate-800">Visit {proc.visitGroup}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                          <span className="text-sm text-slate-500">Teeth</span>
                          <span className="text-sm font-mono font-medium text-slate-800">
                            {currentTeeth.length > 0 ? currentTeeth.join(', ') : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                          <span className="text-sm text-slate-500">Surfaces</span>
                          <span className="text-sm font-mono font-medium text-slate-800">
                            {abbrev || '—'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                          <span className="text-sm text-slate-500">Estimated Price</span>
                          <span className="text-sm font-mono font-bold text-slate-800">
                            {fmt(totalCost)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                          <span className="text-sm text-slate-500">Spent So Far</span>
                          <span className="text-sm font-mono font-bold text-emerald-600">
                            {fmt(spentSoFar)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {proc.performedNotes && (
                  <div className="bg-white rounded-lg shadow-sm border-l-4 border-l-amber-400 overflow-hidden">
                    <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-semibold text-amber-800">Clinical Notes</h3>
                    </div>
                    <div className="p-4">
                      <p className="text-slate-700 text-sm leading-relaxed">{proc.performedNotes}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Quick Stats</h3>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Treatment Sessions</span>
                      <span className="text-lg font-bold text-slate-800">{completedSessions}/{totalSessions}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-slate-500">Next Session</span>
                        <span className="text-lg font-bold text-blue-600">#{nextSessionNumber}</span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Estimated</span>
                        <span className="text-sm font-mono font-medium text-slate-700">{fmt(totalCost)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Spent</span>
                        <span className="text-sm font-mono font-medium text-emerald-600">{fmt(spentSoFar)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                        <span className="text-xs text-slate-500">Remaining</span>
                        <span className="text-sm font-mono font-bold text-blue-600">{fmt(Math.max(0, totalCost - spentSoFar))}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {!readOnly && proc.status !== 'CANCELLED' && proc.status !== 'COMPLETED' && (
                  <button
                    onClick={onContinueTreatment}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-medium rounded-lg shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-emerald-700 transition-all"
                  >
                    <Play className="w-5 h-5" />
                    Continue Treatment
                  </button>
                )}
              </div>
            </div>
          )}


          {activeTab === 'sessions' && (
            <div className="space-y-4">
              {proc.sessions && proc.sessions.length > 0 ? (
                <div className="grid gap-4">
                  {proc.sessions.map((session: ProcedureSession) => {
                    const isEditing = editingSession === session.id;

                    return (
                      <div
                        key={session.id}
                        className={cn(
                          "bg-white rounded-lg shadow-sm border overflow-hidden",
                          session.status === 'COMPLETED' ? "border-l-4 border-l-green-500" : "border-l-4 border-l-blue-500"
                        )}
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                                session.status === 'COMPLETED' ? "bg-green-100" : "bg-blue-100"
                              )}>
                                {session.status === 'COMPLETED' ?
                                  <CheckCircle className="w-6 h-6 text-green-600" /> :
                                  <span className="text-xl font-bold text-blue-600">{session.sessionNumber}</span>
                                }
                              </div>

                              <div className="flex-1">
                                {isEditing ? (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-3">
                                      <div>
                                        <label className="text-xs font-medium text-slate-500">Status</label>
                                        <select
                                          value={sessionFormData.status}
                                          onChange={(e) => setSessionFormData({ ...sessionFormData, status: e.target.value })}
                                          className="w-full mt-1 text-sm rounded-lg border border-slate-300 px-3 py-2"
                                        >
                                          <option value="PENDING">Pending</option>
                                          <option value="IN_PROGRESS">In Progress</option>
                                          <option value="COMPLETED">Completed</option>
                                          <option value="ON_HOLD">On Hold</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-xs font-medium text-slate-500">Date</label>
                                        <input
                                          type="date"
                                          value={sessionFormData.performedDate}
                                          onChange={(e) => setSessionFormData({ ...sessionFormData, performedDate: e.target.value })}
                                          className="w-full mt-1 text-sm rounded-lg border border-slate-300 px-3 py-2"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs font-medium text-slate-500">Price (UGX)</label>
                                        <input
                                          type="number"
                                          value={sessionFormData.sessionCost}
                                          onChange={(e) => setSessionFormData({ ...sessionFormData, sessionCost: e.target.value })}
                                          className="w-full mt-1 text-sm rounded-lg border border-slate-300 px-3 py-2"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-xs font-medium text-slate-500">Notes</label>
                                      <textarea
                                        value={sessionFormData.performedNotes}
                                        onChange={(e) => setSessionFormData({ ...sessionFormData, performedNotes: e.target.value })}
                                        rows={2}
                                        className="w-full mt-1 text-sm rounded-lg border border-slate-300 px-3 py-2 resize-none"
                                        placeholder="Enter session notes..."
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => saveSessionChanges(session.id)}
                                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                                      >
                                        Save Changes
                                      </button>
                                      <button
                                        onClick={cancelSessionEdit}
                                        className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-3">
                                      <p className="font-semibold text-slate-800">{session.sessionLabel || `Session ${session.sessionNumber}`}</p>
                                      <span className={cn(
                                        "text-xs px-2 py-0.5 rounded-full font-medium",
                                        session.status === 'COMPLETED' ? "bg-green-100 text-green-700" :
                                          session.status === 'IN_PROGRESS' ? "bg-blue-100 text-blue-700" :
                                              "bg-slate-100 text-slate-600"
                                      )}>
                                        {session.status.replace('_', ' ')}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1">
                                      {session.performedDate && (
                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                          <Clock className="w-3 h-3" />
                                          {new Date(session.performedDate).toLocaleDateString()}
                                        </span>
                                      )}
                                      <span className="text-xs text-slate-400">|</span>
                                      <span className="text-xs text-slate-500">{fmt(session.sessionCost ?? session.cost ?? 0)}</span>
                                      <span className="text-xs text-slate-400">|</span>
                                      <span className={cn(
                                        "text-xs font-medium",
                                        session.ledgerStatus === 'INVOICED' ? "text-purple-600" :
                                          session.ledgerStatus === 'PAID' ? "text-green-600" :
                                            "text-amber-600"
                                      )}>
                                        {session.ledgerStatus || 'PENDING'} In Ledger
                                      </span>
                                    </div>
                                    {session.performedNotes && (
                                      <p className="mt-2 text-sm text-slate-600 bg-slate-50 p-2 rounded">{session.performedNotes}</p>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Replace the existing {!isEditing && !readOnly && (...)} block with: */}
                            {!isEditing && !readOnly && session.status !== 'CANCELLED' && (
                              <div className="flex items-center gap-1 ml-4">
                                {/* Audit badge */}
                                {session.edits?.length > 0 && (
                                  <span
                                    className="text-[10px] text-slate-400 flex items-center gap-0.5 mr-1"
                                    title={`Edited ${session.edits.length} time(s)`}
                                  >
                                    <Edit3 className="w-3 h-3" /> Edited
                                  </span>
                                )}

                                <button
                                  onClick={() => setEditTarget(session)}
                                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Edit session (audited)"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setVoidTarget(session)}
                                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete session (reverses all side effects)"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}

                            {/* Show deleted/voided badge for cancelled sessions */}
                            {session.status === 'CANCELLED' && (
                              <span className="text-[10px] font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-200 ml-4">
                                Deleted
                              </span>
                            )}

                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
                  <Layers className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">No sessions recorded yet</p>
                  <p className="text-sm text-slate-400 mt-1">Click "Continue Treatment" to add the first session</p>
                </div>
              )}

              {!readOnly && proc.status !== 'CANCELLED' && proc.status !== 'COMPLETED' && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={onContinueTreatment}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-medium rounded-lg shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-emerald-700 transition-all"
                  >
                    <Play className="w-5 h-5" />
                    Continue Treatment — Session #{nextSessionNumber}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'materials' && (
            <div className="grid grid-cols-2 gap-4">
              {proc.procedure.inputs?.length > 0 ? (
                proc.procedure.inputs.map((input, idx) => (
                  <div key={idx} className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Package className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{input.inventoryItem.name}</p>
                        <p className="text-xs text-slate-500">{input.inventoryItem.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-slate-700">× {input.quantityUsed}</p>
                      <p className="text-xs text-slate-500">{input.inventoryItem.unit}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-2 text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No default materials for this procedure</p>
                </div>
              )}
            </div>
          )}
        </div>




        {/* ══════════════════════════════════════════════════════════════════════════════
    SESSION EDIT/VOID DIALOGS - Render once outside the session map
    ══════════════════════════════════════════════════════════════════════════════ */}
        <SessionEditDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          session={editTarget}
          procedureName={proc?.procedure.name || ''}
          planId={activePlanId || ''}
          procedureId={proc?.id || ''}
          onSave={async (data) => {
            await editMut.mutateAsync(data);
          }}
          saving={editMut.isPending}
        />

        <SessionVoidDialog
          open={!!voidTarget}
          onClose={() => setVoidTarget(null)}
          session={voidTarget}
          procedureName={proc?.procedure.name || ''}
          onVoid={async (reason) => {
            await voidMut.mutateAsync(reason);
          }}
          voiding={voidMut.isPending}
        />

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


export default ProcedureDetailDialog;