// src/pages/visits/components/ProgressTab.tsx

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Loader2, X, Check, ChevronDown, ChevronUp,
  Trash2, Edit3, AlertTriangle, BarChart2, TrendingUp,
  TrendingDown, Minus, Calendar, User, FileText, Stethoscope,
  Hash, Save, ClipboardList, Circle, CheckCircle2, XCircle,
  Target, Layers, Link2, Activity, AlertCircle, Unlink,
  Microscope, Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── API ─────────────────────────────────────────────────────────────────────
// const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001";

async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

const progressApi = {
  getVisitReports : (visitId: string) => apiFetch(`/visits/${visitId}/progress-reports`),
  getFormContext  : (visitId: string) => apiFetch(`/visits/${visitId}/progress-reports/context`),
  create : (visitId: string, data: any) =>
    apiFetch(`/visits/${visitId}/progress-reports`, { method: "POST", body: JSON.stringify(data) }),
  update : (reportId: string, data: any) =>
    apiFetch(`/visits/progress-reports/${reportId}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete : (reportId: string) =>
    apiFetch(`/visits/progress-reports/${reportId}`, { method: "DELETE" }),
};

// ─── Types ────────────────────────────────────────────────────────────────────
type ComplaintStatus = "IMPROVED" | "SAME" | "WORSE";
type Outcome         = "GOOD" | "FAIR" | "POOR";

interface SessionTarget { toothNumber?: number; surfaces?: string[] }

interface LinkedSession {
  id: string;
  procedureSessionId: string;
  procedureSession: {
    id: string;
    sessionNumber: number;
    sessionLabel?: string;
    status: string;
    visitGroup: number;
    targets: SessionTarget[];
    treatmentProcedure: { procedure: { id: string; name: string; code?: string } };
  };
}

interface LinkedCondition {
  id: string;
  patientConditionId: string;
  patientCondition: {
    id: string;
    toothNumber?: number;
    status: string;
    severity?: string;
    condition: { id: string; name: string; category: string; icd10Code?: string };
  };
}

interface ProgressReport {
  id: string;
  reportCode: string;
  visitId: string;
  patientId: string;
  complaint?: string;
  complaintStatus?: ComplaintStatus;
  treatmentStatus?: string;
  outcome?: Outcome;
  toothNumber?: number;
  procedureName?: string;
  findings?: string;
  notes?: string;
  nextPlan?: string;
  createdAt: string;
  updatedAt: string;
  dentist?: { id: string; firstName: string; lastName: string };
  procedureLinks: LinkedSession[];
  conditionLinks: LinkedCondition[];
}

interface VisitContext {
  procedureSessions: Array<{
    id: string;
    sessionNumber: number;
    sessionLabel?: string;
    status: string;
    visitGroup: number;
    targets: SessionTarget[];
    treatmentProcedure: { procedure: { name: string; code?: string } };
  }>;
  patientConditions: Array<{
    id: string;
    toothNumber?: number;
    status: string;
    severity?: string;
    diagnosedAt: string;
    condition: { name: string; category: string; icd10Code?: string };
  }>;
}

interface FormData {
  complaint: string;
  complaintStatus: ComplaintStatus | "";
  treatmentStatus: string;
  outcome: Outcome | "";
  toothNumber: string;
  procedureName: string;
  findings: string;
  notes: string;
  nextPlan: string;
  procedureSessionIds: string[];
  patientConditionIds: string[];
}

const EMPTY_FORM: FormData = {
  complaint: "", complaintStatus: "", treatmentStatus: "",
  outcome: "", toothNumber: "", procedureName: "",
  findings: "", notes: "", nextPlan: "",
  procedureSessionIds: [], patientConditionIds: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SESSION_STATUS_COLORS: Record<string, string> = {
  PENDING    : "bg-slate-100 text-slate-600 border-slate-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  COMPLETED  : "bg-emerald-50 text-emerald-700 border-emerald-200",
  SKIPPED    : "bg-amber-50 text-amber-700 border-amber-200",
  CANCELLED  : "bg-red-50 text-red-600 border-red-200",
};

const CONDITION_STATUS_COLORS: Record<string, string> = {
  ACTIVE    : "bg-red-50 text-red-700 border-red-200",
  MONITORED : "bg-amber-50 text-amber-700 border-amber-200",
  RESOLVED  : "bg-emerald-50 text-emerald-700 border-emerald-200",
  RULED_OUT : "bg-slate-100 text-slate-500 border-slate-200",
};

const SEVERITY_COLORS: Record<string, string> = {
  MILD    : "text-emerald-600",
  MODERATE: "text-amber-600",
  SEVERE  : "text-red-600",
};

function sessionTeeth(targets: SessionTarget[]): string {
  const nums = targets.map((t) => t.toothNumber).filter(Boolean);
  if (!nums.length) return "";
  return nums.length === 1 ? `Tooth ${nums[0]}` : `Teeth ${nums.join(", ")}`;
}

// ─── Status / Outcome toggles ─────────────────────────────────────────────────
function StatusToggle({ value, onChange }: { value: ComplaintStatus | ""; onChange: (v: ComplaintStatus) => void }) {
  const opts = [
    { value: "IMPROVED" as ComplaintStatus, label: "Improved", Icon: TrendingUp,  active: "border-emerald-500 bg-emerald-50 text-emerald-700", base: "border-slate-200 text-slate-500 hover:border-emerald-300" },
    { value: "SAME"     as ComplaintStatus, label: "Same",     Icon: Minus,       active: "border-amber-500 bg-amber-50 text-amber-700",   base: "border-slate-200 text-slate-500 hover:border-amber-300" },
    { value: "WORSE"    as ComplaintStatus, label: "Worse",    Icon: TrendingDown, active: "border-red-500 bg-red-50 text-red-700",         base: "border-slate-200 text-slate-500 hover:border-red-300" },
  ];
  return (
    <div className="flex gap-1.5">
      {opts.map(({ value: v, label, Icon, active, base }) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${value === v ? active : base}`}>
          <Icon className="w-3.5 h-3.5" />{label}
        </button>
      ))}
    </div>
  );
}

function OutcomeToggle({ value, onChange }: { value: Outcome | ""; onChange: (v: Outcome) => void }) {
  const opts = [
    { value: "GOOD" as Outcome, label: "Good", Icon: CheckCircle2, active: "border-emerald-500 bg-emerald-50 text-emerald-700", base: "border-slate-200 text-slate-500 hover:border-emerald-200" },
    { value: "FAIR" as Outcome, label: "Fair", Icon: Circle,       active: "border-blue-500 bg-blue-50 text-blue-700",          base: "border-slate-200 text-slate-500 hover:border-blue-200" },
    { value: "POOR" as Outcome, label: "Poor", Icon: XCircle,      active: "border-red-500 bg-red-50 text-red-700",             base: "border-slate-200 text-slate-500 hover:border-red-200" },
  ];
  return (
    <div className="flex gap-1.5">
      {opts.map(({ value: v, label, Icon, active, base }) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${value === v ? active : base}`}>
          <Icon className="w-3.5 h-3.5" />{label}
        </button>
      ))}
    </div>
  );
}

// ─── Clinical Links Picker ────────────────────────────────────────────────────
function ClinicalLinksPicker({
  visitId,
  selectedSessionIds,
  selectedConditionIds,
  onToggleSession,
  onToggleCondition,
}: {
  visitId: string;
  selectedSessionIds: string[];
  selectedConditionIds: string[];
  onToggleSession: (id: string) => void;
  onToggleCondition: (id: string) => void;
}) {
  const [open, setOpen] = useState(selectedSessionIds.length > 0 || selectedConditionIds.length > 0);
  const totalSelected = selectedSessionIds.length + selectedConditionIds.length;

  const { data: ctx, isLoading } = useQuery<VisitContext>({
    queryKey: ["visit-context", visitId],
    queryFn:  () => progressApi.getFormContext(visitId),
    enabled:  !!visitId && open,
    staleTime: 30_000,
  });

  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden">
      {/* Toggle header */}
      <button type="button" onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2">
          <div className={cn("w-6 h-6 rounded-md flex items-center justify-center",
            totalSelected > 0 ? "bg-indigo-100" : "bg-slate-100")}>
            <Link2 className={cn("w-3 h-3", totalSelected > 0 ? "text-indigo-600" : "text-slate-400")} />
          </div>
          <span className="text-xs font-semibold text-slate-700">Clinical Links</span>
          {totalSelected > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
              {totalSelected} linked
            </span>
          )}
          <span className="text-[10px] text-slate-400">optional — link sessions & conditions</span>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-3 space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-slate-400 py-3 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading clinical context…</span>
            </div>
          )}

          {/* ── Procedure Sessions ── */}
          {ctx && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Procedure Sessions
                </span>
                <span className="text-xs text-slate-400">({ctx.procedureSessions.length} in this visit)</span>
              </div>

              {ctx.procedureSessions.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  No procedure sessions are linked to this visit yet.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {ctx.procedureSessions.map((s) => {
                    const selected = selectedSessionIds.includes(s.id);
                    const teeth    = sessionTeeth(s.targets);
                    const label    = s.sessionLabel ?? `${s.treatmentProcedure.procedure.name} — Session ${s.sessionNumber}`;
                    return (
                      <button key={s.id} type="button" onClick={() => onToggleSession(s.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all",
                          selected
                            ? "border-blue-500 bg-blue-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40",
                        )}>
                        <div className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all",
                          selected ? "border-blue-500 bg-blue-500" : "border-slate-300")}>
                          {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800 truncate">{label}</span>
                            {teeth && (
                              <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-md font-mono shrink-0">
                                {teeth}
                              </span>
                            )}
                          </div>
                          {s.treatmentProcedure.procedure.code && (
                            <span className="text-xs text-slate-400">{s.treatmentProcedure.procedure.code}</span>
                          )}
                        </div>
                        <span className={cn("text-xs font-semibold border px-2 py-0.5 rounded-lg shrink-0",
                          SESSION_STATUS_COLORS[s.status] ?? "bg-slate-100 text-slate-500")}>
                          {s.status.replace("_", " ")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Patient Conditions ── */}
          {ctx && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Microscope className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Patient Conditions
                </span>
                <span className="text-xs text-slate-400">({ctx.patientConditions.length} on record)</span>
              </div>

              {ctx.patientConditions.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  No conditions recorded for this patient.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {ctx.patientConditions.map((c) => {
                    const selected = selectedConditionIds.includes(c.id);
                    return (
                      <button key={c.id} type="button" onClick={() => onToggleCondition(c.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all",
                          selected
                            ? "border-purple-500 bg-purple-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-purple-200 hover:bg-purple-50/40",
                        )}>
                        <div className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all",
                          selected ? "border-purple-500 bg-purple-500" : "border-slate-300")}>
                          {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800">{c.condition.name}</span>
                            {c.toothNumber && (
                              <span className="text-xs font-mono bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md shrink-0">
                                T{c.toothNumber}
                              </span>
                            )}
                            {c.condition.icd10Code && (
                              <span className="text-xs text-slate-400 shrink-0">{c.condition.icd10Code}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-slate-400 capitalize">{c.condition.category.replace("_", " ")}</span>
                            {c.severity && (
                              <span className={cn("text-xs font-semibold", SEVERITY_COLORS[c.severity] ?? "text-slate-500")}>
                                · {c.severity}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={cn("text-xs font-semibold border px-2 py-0.5 rounded-lg shrink-0",
                          CONDITION_STATUS_COLORS[c.status] ?? "bg-slate-100 text-slate-500")}>
                          {c.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Progress Report Form ─────────────────────────────────────────────────────
function ProgressReportForm({
  visitId,
  initialData,
  onSave,
  onCancel,
  loading,
}: {
  visitId: string;
  initialData?: Partial<FormData>;
  onSave: (data: FormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM, ...(initialData ?? {}) });
  const set = (field: keyof FormData, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const toggleSession = (id: string) =>
    set("procedureSessionIds",
      form.procedureSessionIds.includes(id)
        ? form.procedureSessionIds.filter((x) => x !== id)
        : [...form.procedureSessionIds, id]);

  const toggleCondition = (id: string) =>
    set("patientConditionIds",
      form.patientConditionIds.includes(id)
        ? form.patientConditionIds.filter((x) => x !== id)
        : [...form.patientConditionIds, id]);

  const hasAnyField = Object.entries(form).some(([k, v]) =>
    k !== "procedureSessionIds" && k !== "patientConditionIds"
      ? v !== ""
      : (v as string[]).length > 0
  );

  const input = "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all text-slate-800 placeholder:text-slate-300 hover:border-slate-300";
  const lbl   = "block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide";

  return (
    <div className="bg-white rounded-xl border-2 border-blue-200 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">Add Progress Report</h3>
            <p className="text-[10px] text-blue-200">All fields optional — fill what's clinically relevant</p>
          </div>
        </div>
        <button onClick={onCancel} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Row 1 — Complaint + Complaint Status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Complaint</label>
            <input type="text" placeholder="e.g. Toothache, sensitivity…"
              value={form.complaint} onChange={(e) => set("complaint", e.target.value)} className={input} />
          </div>
          <div>
            <label className={lbl}>Complaint Status</label>
            <StatusToggle value={form.complaintStatus} onChange={(v) => set("complaintStatus", v)} />
          </div>
        </div>

        {/* Row 2 — Treatment Status + Outcome */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Treatment Status</label>
            <select value={form.treatmentStatus} onChange={(e) => set("treatmentStatus", e.target.value)}
              className={`${input} bg-white`}>
              <option value="">— Select —</option>
              {["In Progress","Completed","On Hold","Monitoring","Referred"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Outcome</label>
            <OutcomeToggle value={form.outcome} onChange={(v) => set("outcome", v)} />
          </div>
        </div>

        {/* Row 3 — Tooth + Procedure */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Tooth <span className="text-slate-400 normal-case font-normal">(FDI)</span></label>
            <div className="relative">
              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input type="number" min={11} max={48} placeholder="e.g. 36, 21…"
                value={form.toothNumber} onChange={(e) => set("toothNumber", e.target.value)}
                className={`${input} pl-8`} />
            </div>
          </div>
          <div>
            <label className={lbl}>Procedure</label>
            <div className="relative">
              <Stethoscope className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input type="text" placeholder="e.g. RCT, Filling, Extraction…"
                value={form.procedureName} onChange={(e) => set("procedureName", e.target.value)}
                className={`${input} pl-8`} />
            </div>
          </div>
        </div>

        {/* Row 4 — Findings (left) + Clinical Links (right) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Findings</label>
            <textarea rows={3} placeholder="Clinical observations, symptoms, radiographic findings…"
              value={form.findings} onChange={(e) => set("findings", e.target.value)}
              className={`${input} resize-none`} />
          </div>
          <div>
            <label className={lbl}>Clinical Links <span className="text-slate-400 normal-case font-normal">(optional)</span></label>
            <ClinicalLinksPicker
              visitId={visitId}
              selectedSessionIds={form.procedureSessionIds}
              selectedConditionIds={form.patientConditionIds}
              onToggleSession={toggleSession}
              onToggleCondition={toggleCondition}
            />
          </div>
        </div>

        {/* Row 5 — Session Notes (left) + Next Visit Plan (right) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Session Notes</label>
            <textarea rows={3} placeholder="What was done, materials used, patient response…"
              value={form.notes} onChange={(e) => set("notes", e.target.value)}
              className={`${input} resize-none`} />
          </div>
          <div>
            <label className={lbl}>Next Visit Plan</label>
            <textarea rows={3} placeholder="Plan for next appointment, pending steps, patient instructions…"
              value={form.nextPlan} onChange={(e) => set("nextPlan", e.target.value)}
              className={`${input} resize-none`} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <button onClick={() => onSave(form)} disabled={loading || !hasAnyField}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Report
          </button>
          <button onClick={onCancel} disabled={loading}
            className="px-4 py-2 rounded-lg border-2 border-slate-200 text-sm text-slate-600 font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          {!hasAnyField && (
            <span className="text-xs text-slate-400 italic ml-auto">Fill at least one field to save</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Progress Report Card ─────────────────────────────────────────────────────
function ProgressReportCard({
  report, onEdit, onDelete, readOnly,
}: {
  report: ProgressReport;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded]       = useState(true);
  const [confirmDelete, setConfirm]   = useState(false);

  const csMap = {
    IMPROVED: { label: "Improved", Icon: TrendingUp,   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    SAME    : { label: "Same",     Icon: Minus,         cls: "bg-amber-50 text-amber-700 border-amber-200" },
    WORSE   : { label: "Worse",    Icon: TrendingDown,  cls: "bg-red-50 text-red-600 border-red-200" },
  };
  const outMap = {
    GOOD: { label: "Good", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    FAIR: { label: "Fair", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    POOR: { label: "Poor", cls: "bg-red-50 text-red-600 border-red-200" },
  };

  const cs      = report.complaintStatus ? csMap[report.complaintStatus] : null;
  const oc      = report.outcome ? outMap[report.outcome] : null;
  const hasBody = !!(report.findings || report.notes || report.nextPlan ||
    report.procedureLinks.length || report.conditionLinks.length);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Card Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <ClipboardList className="w-4 h-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            {/* Badges row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-mono font-bold text-slate-700">{report.reportCode}</span>
              {report.toothNumber && (
                <span className="text-xs font-mono bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-lg">
                  T{report.toothNumber}
                </span>
              )}
              {report.procedureName && (
                <span className="text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-lg">
                  {report.procedureName}
                </span>
              )}
              {cs && (
                <span className={`inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded-lg ${cs.cls}`}>
                  <cs.Icon className="w-3 h-3" />{cs.label}
                </span>
              )}
              {oc && (
                <span className={`text-xs font-semibold border px-2 py-0.5 rounded-lg ${oc.cls}`}>
                  {oc.label}
                </span>
              )}
              {report.treatmentStatus && (
                <span className="text-xs text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg">
                  {report.treatmentStatus}
                </span>
              )}
              {/* Linked count pills */}
              {report.procedureLinks.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-lg">
                  <Activity className="w-3 h-3" />
                  {report.procedureLinks.length} session{report.procedureLinks.length !== 1 ? "s" : ""}
                </span>
              )}
              {report.conditionLinks.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5 rounded-lg">
                  <Microscope className="w-3 h-3" />
                  {report.conditionLinks.length} condition{report.conditionLinks.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500">
                {new Date(report.createdAt).toLocaleDateString("en-UG", {
                  day: "numeric", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
              {report.dentist && (
                <>
                  <span className="text-slate-300">·</span>
                  <User className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-500">
                    Dr. {report.dentist.firstName} {report.dentist.lastName}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!readOnly && (
            confirmDelete ? (
              <div className="flex items-center gap-1">
                <button onClick={onDelete}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700">
                  <Check className="w-3 h-3" /> Confirm
                </button>
                <button onClick={() => setConfirm(false)}
                  className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button onClick={onEdit} title="Edit"
                  className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirm(true)} title="Delete"
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )
          )}
          {hasBody && (
            <button onClick={() => setExpanded((p) => !p)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Complaint text */}
      {report.complaint && (
        <div className="px-4 pt-3 pb-0 flex items-start gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5 w-20 shrink-0 pt-0.5">Complaint</span>
          <p className="text-sm text-slate-700 font-medium">{report.complaint}</p>
        </div>
      )}

      {/* Expandable body */}
      {expanded && hasBody && (
        <div className="px-4 py-3 space-y-3">
          {report.findings && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5 w-20 shrink-0">Findings</span>
              <p className="text-sm text-slate-600 leading-relaxed">{report.findings}</p>
            </div>
          )}
          {report.notes && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5 w-20 shrink-0">Notes</span>
              <p className="text-sm text-slate-600 leading-relaxed">{report.notes}</p>
            </div>
          )}
          {report.nextPlan && (
            <div className="flex items-start gap-2 bg-blue-50 rounded-xl px-3 py-2.5 border border-blue-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mt-0.5 w-20 shrink-0">Next Plan</span>
              <p className="text-sm text-blue-700 leading-relaxed font-medium">{report.nextPlan}</p>
            </div>
          )}

          {/* Linked Sessions */}
          {report.procedureLinks.length > 0 && (
            <div className="pt-1">
              <div className="flex items-center gap-1.5 mb-2">
                <Activity className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Linked Sessions</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {report.procedureLinks.map((l) => {
                  const s     = l.procedureSession;
                  const teeth = sessionTeeth(s.targets);
                  const label = s.sessionLabel ?? `${s.treatmentProcedure.procedure.name} – S${s.sessionNumber}`;
                  return (
                    <div key={l.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs">
                      <Activity className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span className="font-semibold text-indigo-800">{label}</span>
                      {teeth && <span className="font-mono text-indigo-500">· {teeth}</span>}
                      <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold border",
                        SESSION_STATUS_COLORS[s.status] ?? "bg-slate-100 text-slate-500")}>
                        {s.status.replace("_"," ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Linked Conditions */}
          {report.conditionLinks.length > 0 && (
            <div className="pt-1">
              <div className="flex items-center gap-1.5 mb-2">
                <Microscope className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Linked Conditions</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {report.conditionLinks.map((l) => {
                  const c = l.patientCondition;
                  return (
                    <div key={l.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-xs">
                      <Tag className="w-3 h-3 text-purple-500 shrink-0" />
                      <span className="font-semibold text-purple-800">{c.condition.name}</span>
                      {c.toothNumber && <span className="font-mono text-purple-500">T{c.toothNumber}</span>}
                      {c.condition.icd10Code && <span className="text-purple-400">{c.condition.icd10Code}</span>}
                      <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold border",
                        CONDITION_STATUS_COLORS[c.status] ?? "bg-slate-100 text-slate-500")}>
                        {c.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Progress Reports Section ─────────────────────────────────────────────────
function ProgressReportsSection({
  visitId,
  readOnly = false,
}: {
  visitId: string;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm]         = useState(false);
  const [editingReport, setEditing]     = useState<ProgressReport | null>(null);

  const { data: reports = [], isLoading, error } = useQuery<ProgressReport[]>({
    queryKey: ["progress-reports", visitId],
    queryFn:  () => progressApi.getVisitReports(visitId),
    enabled:  !!visitId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["progress-reports", visitId] });

  const toPayload = (f: FormData) => ({
    complaint:           f.complaint       || undefined,
    complaintStatus:     f.complaintStatus || undefined,
    treatmentStatus:     f.treatmentStatus || undefined,
    outcome:             f.outcome         || undefined,
    toothNumber:         f.toothNumber ? parseInt(f.toothNumber) : undefined,
    procedureName:       f.procedureName   || undefined,
    findings:            f.findings        || undefined,
    notes:               f.notes           || undefined,
    nextPlan:            f.nextPlan        || undefined,
    procedureSessionIds: f.procedureSessionIds,
    patientConditionIds: f.patientConditionIds,
  });

  const toFormData = (r: ProgressReport): Partial<FormData> => ({
    complaint:           r.complaint       ?? "",
    complaintStatus:     r.complaintStatus ?? "",
    treatmentStatus:     r.treatmentStatus ?? "",
    outcome:             r.outcome         ?? "",
    toothNumber:         r.toothNumber?.toString() ?? "",
    procedureName:       r.procedureName   ?? "",
    findings:            r.findings        ?? "",
    notes:               r.notes           ?? "",
    nextPlan:            r.nextPlan        ?? "",
    procedureSessionIds: r.procedureLinks.map((l) => l.procedureSessionId),
    patientConditionIds: r.conditionLinks.map((l) => l.patientConditionId),
  });

  const createMut = useMutation({
    mutationFn: (data: FormData) => progressApi.create(visitId, toPayload(data)),
    onSuccess:  () => { invalidate(); setShowForm(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormData }) =>
      progressApi.update(id, toPayload(data)),
    onSuccess: () => { invalidate(); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => progressApi.delete(id),
    onSuccess:  invalidate,
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">Progress Reports</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {reports.length} note{reports.length !== 1 ? "s" : ""} for this visit
          </p>
        </div>
        {!readOnly && !showForm && !editingReport && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> New Report
          </button>
        )}
      </div>

      {/* New form */}
      {showForm && !readOnly && (
        <ProgressReportForm visitId={visitId} onSave={(d) => createMut.mutate(d)}
          onCancel={() => setShowForm(false)} loading={createMut.isPending} />
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm">Loading progress reports…</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Failed to load progress reports. Please refresh.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && reports.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mb-3 shadow-sm">
            <BarChart2 className="w-7 h-7 text-slate-300" />
          </div>
          <p className="text-base font-semibold text-slate-600">No progress reports yet</p>
          <p className="text-sm text-slate-400 mt-1">
            {readOnly
              ? "No reports were recorded for this visit."
              : "Click 'New Report' to add the first clinical update."}
          </p>
          {!readOnly && (
            <button onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">
              <Plus className="w-4 h-4" /> Add First Report
            </button>
          )}
        </div>
      )}

      {/* Reports list */}
      {!isLoading && reports.length > 0 && (
        <div className="space-y-3">
          {reports.map((r) =>
            editingReport?.id === r.id ? (
              <ProgressReportForm key={r.id} visitId={visitId} initialData={toFormData(r)}
                onSave={(d) => updateMut.mutate({ id: r.id, data: d })}
                onCancel={() => setEditing(null)} loading={updateMut.isPending} />
            ) : (
              <ProgressReportCard key={r.id} report={r} readOnly={readOnly}
                onEdit={() => { setShowForm(false); setEditing(r); }}
                onDelete={() => deleteMut.mutate(r.id)} />
            )
          )}
        </div>
      )}

      {readOnly && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          This visit is completed — reports are read-only.
        </div>
      )}
    </div>
  );
}

// ─── Treatment Plan Card ──────────────────────────────────────────────────────
function TreatmentPlanCard({ plan }: { plan: any }) {
  const pct = plan.summary?.completionPercent || 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-slate-800">{plan.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {plan.planCode} · Dr. {plan.dentist?.firstName} {plan.dentist?.lastName}
          </p>
        </div>
        <span className={cn("px-3 py-1 rounded-full text-xs font-semibold border",
          plan.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
          plan.status === "IN_PROGRESS" ? "bg-blue-50 text-blue-700 border-blue-200" :
          plan.status === "CANCELLED" ? "bg-red-50 text-red-600 border-red-200" :
          "bg-slate-100 text-slate-600 border-slate-200")}>
          {plan.status}
        </span>
      </div>
      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>Completion</span>
          <span className="font-bold">{pct}%</span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total",      value: plan.summary?.totalCost     || 0, cls: "text-slate-700" },
          { label: "Completed",  value: plan.summary?.completedCost || 0, cls: "text-emerald-600" },
          { label: "Remaining",  value: plan.summary?.remainingCost || 0, cls: "text-blue-600" },
          { label: "Input Cost", value: plan.summary?.inputsCost    || 0, cls: "text-red-500" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="text-center bg-slate-50 rounded-xl py-3 px-2">
            <div className={cn("text-sm font-bold", cls)}>UGX {value.toLocaleString()}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreatmentPlansSection({ patientId }: { patientId: string }) {
  const { data: plans = [], isLoading, error } = useQuery({
    queryKey: ["treatment-plans", patientId],
    queryFn:  () => apiFetch(`/treatment-plans/patient/${patientId}`),
    enabled:  !!patientId,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );
  if (error) return (
    <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
      <AlertTriangle className="w-4 h-4 shrink-0" /> Failed to load treatment plans.
    </div>
  );
  if (plans.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
      <Target className="w-8 h-8 mb-2 text-slate-300" />
      <p className="text-sm font-medium text-slate-600">No treatment plans</p>
      <p className="text-xs text-slate-400 mt-1">Plans will appear here once created.</p>
    </div>
  );
  return (
    <div className="space-y-4">
      {plans.map((p: any) => <TreatmentPlanCard key={p.id} plan={p} />)}
    </div>
  );
}

// ─── Main ProgressTab ─────────────────────────────────────────────────────────
export function ProgressTab({
  visitId, patientId, readOnly = false,
}: {
  visitId: string;
  patientId: string;
  readOnly?: boolean;
}) {
  const [section, setSection] = useState<"reports" | "plans" | "both">("reports");

  const tabs = [
    { key: "reports" as const, label: "Progress Reports", Icon: ClipboardList },
    { key: "plans"   as const, label: "Treatment Plans",  Icon: Target },
    { key: "both"    as const, label: "Combined View",    Icon: Layers },
  ];

  return (
    <div className="space-y-5">
      {/* Section tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {tabs.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setSection(key)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all",
                section === key
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      {(section === "reports" || section === "both") && (
        <ProgressReportsSection visitId={visitId} readOnly={readOnly} />
      )}

      {section === "both" && <div className="border-t border-slate-200" />}

      {(section === "plans" || section === "both") && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Treatment Plans</h3>
          </div>
          <TreatmentPlansSection patientId={patientId} />
        </div>
      )}
    </div>
  );
}