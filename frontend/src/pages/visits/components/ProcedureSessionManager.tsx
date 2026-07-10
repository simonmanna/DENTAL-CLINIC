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
} from "lucide-react";
import type {
  ProcedureSession,
  SessionStatus,
  LedgerStatus,
} from "./../../../types/treatmentPlan";
import { api } from "@/lib/api/client";

// FIXED: Handle undefined/null values safely
function fmtUGX(n: number | undefined | null) {
  return `UGX ${Math.round(n ?? 0).toLocaleString()}`;
}
function cn(...c: (string | boolean | undefined | null)[]) {
  return c.filter(Boolean).join(" ");
}

const SESSION_STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; dot: string }
> = {
  PENDING: {
    label: "Pending",
    color: "text-slate-600",
    bg: "bg-slate-100",
    dot: "bg-slate-400",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "text-blue-700",
    bg: "bg-blue-100",
    dot: "bg-blue-500",
  },
  COMPLETED: {
    label: "Completed",
    color: "text-green-700",
    bg: "bg-green-100",
    dot: "bg-green-500",
  },
  SKIPPED: {
    label: "Skipped",
    color: "text-amber-700",
    bg: "bg-amber-100",
    dot: "bg-amber-500",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "text-red-600",
    bg: "bg-red-100",
    dot: "bg-red-500",
  },
};

const LEDGER_META: Record<
  LedgerStatus,
  { label: string; color: string; bg: string }
> = {
  PENDING: {
    label: "In Ledger",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
  },
  INVOICED: {
    label: "Invoiced",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
  },
  VOID: {
    label: "Void",
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
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

  // FIXED: Safe calculation with null coalescing
  const totalCost = sessions.reduce((s, x) => s + (x.sessionPrice ?? 0), 0);

  const doneCount = sessions.filter((s) => s.status === "COMPLETED").length;
  const inLedger = sessions.filter(
    (s) => s.ledgerStatus === "PENDING" || s.ledgerStatus === "INVOICED",
  ).length;

  return (
    <div className="mt-1">
      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
          {sessionType === "MULTI" ? `${sessions.length} Sessions` : "Session"}
        </span>
        <span className="text-[10px] text-slate-400">
          {doneCount}/{sessions.length} done
        </span>
        {billingType === "PAY_PARTIALLY" && (
          <span className="text-[10px] text-blue-600 font-medium">
            billed per visit
          </span>
        )}
        <span className="text-[10px] text-slate-400">
          {inLedger}/{sessions.length} in ledger
        </span>
        <span className="text-[10px] font-semibold text-slate-700 ml-auto">
          {fmtUGX(totalCost)}
        </span>
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
                  ? "border-green-200 bg-green-50/40"
                  : "border-slate-200 bg-white",
              )}
            >
              {/* Row header */}
              <div className="flex items-center gap-2 px-3 py-2">
                {/* Session number bubble */}
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                    session.status === "COMPLETED"
                      ? "bg-green-500 text-white"
                      : "bg-slate-200 text-slate-600",
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
                  <p className="text-xs font-medium text-slate-700 truncate">
                    {session.sessionLabel ?? `Session ${session.sessionNumber}`}
                  </p>
                  {session.performedDate && (
                    <p className="text-[10px] text-slate-400 flex items-center gap-0.5 mt-0.5">
                      <Calendar className="w-2.5 h-2.5" />
                      {new Date(session.performedDate).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <span className="text-xs font-semibold text-slate-700 shrink-0">
                  {fmtUGX(session.sessionPrice ?? 0)}
                </span>
                {/* Cost - FIXED: Use sessionCost with fallback to cost */}
                {/* <span className="text-xs font-semibold text-slate-700 shrink-0">
                  {fmtUGX(session.sessionCost ?? 0)}
                </span> */}
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
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                        title="Record session details"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Expand notes */}
                    {session.performedNotes && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : session.id)
                        }
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
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
                <div className="px-3 pb-3 pt-1 border-t border-slate-100 bg-slate-50/60 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 block mb-1">
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
                        className="w-full text-xs rounded border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {/* COMPLETED is deliberately absent — completion goes
                            through Execute Session so chart entries stay in
                            sync with the session status. */}
                        <option value="PENDING">Pending</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="SKIPPED">Skipped</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">
                        To complete this session, use Execute Session.
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 block mb-1">
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
                        className="w-full text-xs rounded border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-1">
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
                      className="w-full text-xs rounded border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                      className="w-full text-xs rounded border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    /> */}
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-1">
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
                      className="w-full text-xs rounded border border-slate-200 px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex-1 py-1.5 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(session.id)}
                      disabled={isSaving}
                      className="flex-1 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
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
                <div className="px-3 pb-2 pt-1 border-t border-slate-100">
                  <p className="text-[11px] text-slate-500 italic">
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
