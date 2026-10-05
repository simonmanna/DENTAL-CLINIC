// src/pages/visits/components/ProcedureSessionManager.tsx

import React, { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  Calendar,
  FileText,
  Pencil,
  Trash2,
} from "lucide-react";
import type {
  ProcedureSession,
  SessionStatus,
  LedgerStatus,
} from "./../../../types/treatmentPlan";
import { api } from "@/lib/api/client";

function cn(...c: (string | boolean | undefined | null)[]) {
  return c.filter(Boolean).join(" ");
}

const SESSION_STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; dot: string }
> = {
  PENDING: {
    label: "Pending",
    color: "text-muted-foreground",
    bg: "bg-muted",
    dot: "bg-muted-foreground/70",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "text-primary",
    bg: "bg-primary-muted",
    dot: "bg-primary",
  },
  COMPLETED: {
    label: "Completed",
    color: "text-success",
    bg: "bg-success-muted",
    dot: "bg-success",
  },
  SKIPPED: {
    label: "Skipped",
    color: "text-warning",
    bg: "bg-warning-muted",
    dot: "bg-warning",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "text-danger",
    bg: "bg-danger-muted",
    dot: "bg-danger",
  },
};

const LEDGER_META: Record<
  LedgerStatus,
  { label: string; color: string; bg: string }
> = {
  PENDING: {
    label: "In Ledger",
    color: "text-primary",
    bg: "bg-primary-muted/60 border-primary/25",
  },
  INVOICED: {
    label: "Invoiced",
    color: "text-success",
    bg: "bg-success-muted/60 border-success/25",
  },
  VOID: {
    label: "Void",
    color: "text-danger",
    bg: "bg-danger-muted/60 border-danger/25",
  },
};

interface Props {
  planId: string;
  procedureId: string;
  procedureName: string;
  sessionType: string;
  billingType: string;
  readOnly: boolean;
  visitId: string;
  initialSessions: ProcedureSession[];
  onSessionUpdate?: () => void;
  onSessionEdit?: (session: ProcedureSession) => void;
  onSessionVoid?: (session: ProcedureSession) => void;
}

export function ProcedureSessionManager({
  planId,
  procedureId,
  procedureName,
  sessionType,
  billingType,
  readOnly,
  initialSessions,
  onSessionUpdate,
  onSessionEdit,
  onSessionVoid,
  visitId,
}: Props) {
  const qc = useQueryClient();
  const [sessions, setSessions] = useState<ProcedureSession[]>(initialSessions);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProcedureSession>>({});

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["tx-plan", planId] });
    qc.invalidateQueries({ queryKey: ["tx-plans"] });
    onSessionUpdate?.();
  }, [planId, qc, onSessionUpdate]);

  // ── Update session (status, notes, date) ──────────────────────────────────
  const updateMut = useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: string; data: any }) =>
      api.patch(
        `/treatment-plans/${planId}/procedures/${procedureId}/sessions/${sessionId}`,
        data,
      ).then(r => r.data),
    onSuccess: (updated) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
      );
      setEditingId(null);
      invalidate();
    },
  });

  const startEdit = (s: ProcedureSession) => {
    setEditingId(s.id);
    setExpandedId(s.id);
    setEditForm({
      status: s.status,
      performedDate: s.performedDate ?? undefined,
      performedNotes: s.performedNotes ?? undefined,
      sessionCost: s.sessionCost,
    });
  };

  const saveEdit = (sessionId: string) => {
    const payload: any = {};
    if (editForm.status !== undefined) payload.status = editForm.status;
    if (editForm.performedDate !== undefined)
      payload.performedDate = editForm.performedDate;
    if (editForm.performedNotes !== undefined)
      payload.performedNotes = editForm.performedNotes;
    if (editForm.sessionPrice !== undefined)
      payload.sessionPrice = editForm.sessionPrice;
    // if (editForm.sessionCost !== undefined)
    //   payload.sessionCost = editForm.sessionCost;
    updateMut.mutate({ sessionId, data: payload });
  };

  const doneCount = sessions.filter((s) => s.status === "COMPLETED").length;
  return (
    <div className="mt-1">
      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
          {sessionType === "MULTI" ? `${sessions.length} Sessions` : "Session"}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {doneCount}/{sessions.length} done
        </span>
        {billingType === "PAY_PARTIALLY" && (
          <span className="text-[10px] text-primary font-medium">
            billed per visit
          </span>
        )}
      </div>

      {/* Session rows */}
      <div className="space-y-1.5">
        {sessions.map((session, idx) => {
          const sm =
            SESSION_STATUS_META[session.status] ?? SESSION_STATUS_META.PENDING;
          const isExpanded = expandedId === session.id;
          const isEditing = editingId === session.id;
          const inLedger =
            !!session.ledgerStatus && session.ledgerStatus !== "VOID";
          const lm = session.ledgerStatus
            ? LEDGER_META[session.ledgerStatus]
            : null;
          // Terminal sessions are immutable through this quick-edit form —
          // corrections go through the audited edit-session flow.
          const isTerminal =
            session.status === "COMPLETED" ||
            session.status === "SKIPPED" ||
            session.status === "CANCELLED" ||
            session.status === "VOIDED";
          const isSaving =
            updateMut.isPending &&
            updateMut.variables?.sessionId === session.id;

          return (
            <div
              key={session.id}
              className={cn(
                "rounded-lg border transition-all overflow-hidden",
                session.status === "COMPLETED"
                  ? "border-success/25 bg-success-muted/40"
                  : "border-border bg-white",
              )}
            >
              {/* Row header */}
              <div className="flex items-center gap-2 px-3 py-2">
                {/* Session number bubble */}
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                    session.status === "COMPLETED"
                      ? "bg-success text-white"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {session.status === "COMPLETED" ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    session.sessionNumber
                  )}
                </div>
                {/* Label */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {session.sessionLabel ?? `Session ${session.sessionNumber}`}
                  </p>
                  {session.performedDate && (
                    <p className="text-[10px] text-muted-foreground/70 flex items-center gap-0.5 mt-0.5">
                      <Calendar className="w-2.5 h-2.5" />
                      {new Date(session.performedDate).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Status badge */}
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0",
                    sm.bg,
                    sm.color,
                  )}
                >
                  {sm.label}
                </span>
                {/* Ledger badge */}
                {lm && (
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0",
                      lm.bg,
                      lm.color,
                    )}
                  >
                    {lm.label}
                  </span>
                )}
                 {/* Actions */}
                 {!readOnly && (
                   <div className="flex items-center gap-1 shrink-0">
                     {/* Edit / record session — terminal sessions are corrected
                         through the audited edit-session flow instead */}
                     {!isTerminal && (
                       <button
                         type="button"
                         onClick={() =>
                           isEditing ? setEditingId(null) : startEdit(session)
                         }
                         className="p-1.5 rounded hover:bg-muted text-muted-foreground/70 hover:text-muted-foreground"
                         title="Record session details"
                       >
                         <FileText className="w-3.5 h-3.5" />
                       </button>
                     )}

                     {/* Edit session (external — e.g. from ProcedureDetailDialog) */}
                     {onSessionEdit && (
                       <button
                         type="button"
                         onClick={() => onSessionEdit(session)}
                         className="p-1.5 rounded hover:bg-primary-muted/60 text-muted-foreground/70 hover:text-primary transition-colors"
                         title="Edit session"
                       >
                         <Pencil className="w-3.5 h-3.5" />
                       </button>
                     )}

                     {/* Delete / void session */}
                     {onSessionVoid && session.status !== 'CANCELLED' && (
                       <button
                         type="button"
                         onClick={() => onSessionVoid(session)}
                         className="p-1.5 rounded hover:bg-danger-muted/60 text-muted-foreground/70 hover:text-danger transition-colors"
                         title="Delete session"
                       >
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                     )}

                     {/* Expand notes */}
                     {session.performedNotes && (
                       <button
                         type="button"
                         onClick={() =>
                           setExpandedId(isExpanded ? null : session.id)
                         }
                         className="p-1.5 rounded hover:bg-muted text-muted-foreground/70"
                       >
                         {isExpanded ? (
                           <ChevronUp className="w-3.5 h-3.5" />
                         ) : (
                           <ChevronDown className="w-3.5 h-3.5" />
                         )}
                       </button>
                     )}
                   </div>
                 )}
              </div>

              {/* Edit form */}
              {isEditing && (
                <div className="px-3 pb-3 pt-1 border-t border-border/60 bg-muted/60 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                        Status
                      </label>
                      <select
                        value={editForm.status ?? session.status}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            status: e.target.value as SessionStatus,
                          }))
                        }
                        className="w-full text-xs rounded border border-border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/60"
                      >
                        {/* COMPLETED is deliberately absent — completion goes
                            through Execute Session so chart entries stay in
                            sync with the session status. */}
                        <option value="PENDING">Pending</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="SKIPPED">Skipped</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        To complete this session, use Execute Session.
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                        Date performed
                      </label>
                      <input
                        type="date"
                        value={
                          editForm.performedDate
                            ? editForm.performedDate.split("T")[0]
                            : ""
                        }
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            performedDate: e.target.value,
                          }))
                        }
                        max={new Date().toISOString().split("T")[0]}
                        className="w-full text-xs rounded border border-border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/60"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                      Session cost (UGX)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={editForm.sessionPrice ?? session.sessionPrice ?? 0}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          sessionPrice: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full text-xs rounded border border-border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/60"
                    />
                    {/* <input
                      type="number"
                      min={0}
                      step={1000}
                      value={editForm.sessionCost ?? session.sessionCost ?? 0}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          sessionCost: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full text-xs rounded border border-border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/60"
                    /> */}
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                      Clinical notes
                    </label>
                    <textarea
                      rows={2}
                      value={
                        editForm.performedNotes ?? session.performedNotes ?? ""
                      }
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          performedNotes: e.target.value,
                        }))
                      }
                      placeholder="Notes for this session…"
                      className="w-full text-xs rounded border border-border px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/60"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex-1 py-1.5 rounded border border-border text-xs text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(session.id)}
                      disabled={isSaving}
                      className="flex-1 py-1.5 rounded bg-primary text-white text-xs font-medium hover:bg-primary disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      {isSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {/* Expanded notes (read-only) */}
              {isExpanded && !isEditing && session.performedNotes && (
                <div className="px-3 pb-2 pt-1 border-t border-border/60">
                  <p className="text-[11px] text-muted-foreground italic">
                    {session.performedNotes}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
