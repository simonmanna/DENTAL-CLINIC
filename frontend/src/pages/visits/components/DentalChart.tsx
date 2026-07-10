// src/pages/visits/components/DentalChart.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Production dental chart — v3
//
// CHANGES FROM v2:
//  · O(n) dedup via compound-key Map  (was O(n²) findIndex)
//  · staleTime: 30_000 on both queries — ends focus-event refetch cascade
//  · isImplant flag + ADA D-code set — robust implant detection (no label regex)
//  · resolvePresence() → PresenceState with compound flags:
//      wasExtracted  (implant placed in extracted socket)
//      wasCongenital (implant placed on congenitally absent site)
//      hasPlannedIntervention / hasCompletedIntervention
//  · Multi-state visual: IMPLANT on extracted socket shows socket brackets;
//    IMPLANT on congenital site shows ∅ badge; UNERUPTED+PLANNED shows dot
//  · Roots rendered as proper JSX (no dangerouslySetInnerHTML)
//  · DeleteConfirmModal replaces window.prompt()
//  · handleSurfaceClick: modifier-aware multi-select preserved
//  · procAsEntries: keyed by `proc-{id}-t{tooth}` — no collision across teeth
//  · Toolbar, ledger, and tooth SVG UI polished
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  Loader2,
  AlertCircle,
  RefreshCcw,
  ClipboardList,
  Trash2,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  chartEntriesApi,
  ENTRY_COLORS,
  type ChartEntry as APIChartEntry,
} from "../../../lib/api/chart-entries";
import {
  treatmentProceduresApi,
  type TreatmentProcedure,
} from "../../../lib/api/treatment-procedures";
import {
  conditionsApi,
  newIdempotencyKey,
  type CreatePatientConditionDto,
  type PatientConditionStatus,
} from "../../../lib/api/conditions";
import {
  AddConditionDialog,
  type AddConditionSubmitData,
} from "./AddConditionDialog";
import { AddTreatmentDialog } from "./AddTreatmentDialog";
import { ToothDetailDrawer } from "./ToothDetailDrawer";
import type { EditConditionSubmitData } from "./EditConditionDialog";
import { staffApi } from "../../../lib/api/staff-api";
import { toast } from "sonner";
import {
  ARCH,
  isValidFdi,
  toothKind,
  getQuadrant,
  toothName,
  uiToCanonical,
  canonicalToUi,
  type CanonicalSurface,
  type UiSurface,
} from "../../../lib/dental/notation";
import {
  resolvePresence,
  mergeChartEntries,
  layerForEntry,
  isLiveConditionEntry,
  toLocalISODate,
  isImplantEntry,
  IMPLANT_ADA_CODES,
  DERIVED_PROC_ID_PREFIX,
  RENDERABLE_PROC_STATUS,
  LAYER_PAINT_PRIORITY,
  highestPriorityEntry,
  pickRestoration,
  type ChartEntry,
  type EntryStatus,
  type Layer,
  type RestorationKind,
} from "./dentalChartLogic";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
//
// The data model (ChartEntry, presence types) and the pure resolution/dedup
// logic live in ./dentalChartLogic so they can be unit-tested without React.
// Re-exported here for backwards compatibility with existing imports.
// ─────────────────────────────────────────────────────────────────────────────

export type { ChartEntry } from "./dentalChartLogic";

// Layer, LAYER_FOR_TYPE and layerForEntry live in ./dentalChartLogic so the
// IN_PROGRESS / INACTIVE derivation is unit-tested without React.

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Hues are sourced from the shared ENTRY_COLORS map (lib/api/chart-entries.ts)
// so the chart and ToothActionPanel stay in lockstep. Only the short display
// labels are chart-local.
// IN_PROGRESS (orange) and INACTIVE (grey) are derived layers with no matching
// ENTRY_COLORS entry, so their hues are defined inline. IN_PROGRESS is amber's
// neighbour but distinct from CONDITION amber; INACTIVE is a muted slate that
// reads as "present but not active work" (on-hold / pending / referred).
const LAYER_COLOR: Record<
  Layer,
  { c: string; light: string; text: string; label: string }
> = {
  EXISTING: {
    c: ENTRY_COLORS.EXISTING.fill,
    light: ENTRY_COLORS.EXISTING.light,
    text: ENTRY_COLORS.EXISTING.text,
    label: "Existing",
  },
  PLANNED: {
    c: ENTRY_COLORS.PLANNED.fill,
    light: ENTRY_COLORS.PLANNED.light,
    text: ENTRY_COLORS.PLANNED.text,
    label: "Planned",
  },
  IN_PROGRESS: {
    c: "#ea580c",
    light: "#ffedd5",
    text: "#9a3412",
    label: "In Progress",
  },
  COMPLETED: {
    c: ENTRY_COLORS.COMPLETED.fill,
    light: ENTRY_COLORS.COMPLETED.light,
    text: ENTRY_COLORS.COMPLETED.text,
    label: "Completed",
  },
  INACTIVE: {
    c: "#94a3b8",
    light: "#f1f5f9",
    text: "#475569",
    label: "On-hold/Ref",
  },
  CONDITION: {
    c: ENTRY_COLORS.CONDITION.fill,
    light: ENTRY_COLORS.CONDITION.light,
    text: ENTRY_COLORS.CONDITION.text,
    label: "Conditions",
  },
  RESOLVED: {
    c: "#94a3b8",
    light: "#f1f5f9",
    text: "#475569",
    label: "Resolved",
  },
};

// Clinical-status badge styling for CONDITION rows in the split ledger. This is
// the PatientCondition lifecycle (ACTIVE → MONITORED → RESOLVED / RULED_OUT),
// deliberately separate from LAYER_COLOR (which colours the chart *layer*). A
// condition auto-resolves when its linked procedure completes
// (syncLinkedConditionsTx, backend), so the ledger must read "Resolved" here
// instead of the generic "Conditions" layer label.
const CONDITION_STATUS_META: Record<
  PatientConditionStatus,
  { label: string; light: string; text: string }
> = {
  ACTIVE: {
    label: "Active",
    light: ENTRY_COLORS.CONDITION.light,
    text: ENTRY_COLORS.CONDITION.text,
  },
  MONITORED: { label: "Monitored", light: "#dbeafe", text: "#1e40af" },
  IN_TREATMENT: { label: "In Treatment", light: "#fef3c7", text: "#92400e" },
  RESOLVED: { label: "Resolved", light: "#dcfce7", text: "#166534" },
  RULED_OUT: { label: "Ruled out", light: "#f1f5f9", text: "#475569" },
};

// ChartEntry, the presence types, IMPLANT_ADA_CODES, ICD_TO_PRESENCE,
// RENDERABLE_PROC_STATUS, isImplantEntry, resolvePresence, and the dedup
// merge (mergeChartEntries) now live in ./dentalChartLogic — imported above
// and unit-tested in dentalChartLogic.test.ts.

// Shared frozen empty list for teeth with no entries. Returning a fresh `[]`
// from getEntries would give memoized ToothSVG a new `entries` prop reference on
// every render, re-rendering all ~32 empty teeth on any state change (M2). One
// stable reference lets React.memo bail out for unchanged empty teeth.
const EMPTY_ENTRIES: ChartEntry[] = Object.freeze([]) as ChartEntry[];

// ─────────────────────────────────────────────────────────────────────────────
// DELETE CONFIRM MODAL
// ─────────────────────────────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  isOpen: boolean;
  entry: ChartEntry | null;
  resolveProvider: (id?: string) => string;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}

function DeleteConfirmModal({
  isOpen,
  entry,
  resolveProvider,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onCancel]);

  if (!isOpen || !entry) return null;

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: "28px 28px 24px",
          width: 440,
          maxWidth: "94vw",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "#fee2e2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trash2 size={18} color="#dc2626" />
            </span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                Delete condition
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
                Tooth {entry.toothNumbers.join(", ")} — {entry.label}
              </div>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94a3b8",
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Context */}
        <div
          style={{
            background: "#f8fafc",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12,
            color: "#475569",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {entry.code && (
              <span>
                <span style={{ color: "#94a3b8" }}>Code</span> {entry.code}
              </span>
            )}
            <span>
              <span style={{ color: "#94a3b8" }}>Diagnosed</span> {entry.date}
            </span>
            {entry.provider && (
              <span>
                <span style={{ color: "#94a3b8" }}>By</span>{" "}
                {resolveProvider(entry.provider)}
              </span>
            )}
          </div>
        </div>

        {/* Warning */}
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#fef3c7",
            border: "1px solid #fde68a",
          }}
        >
          <AlertCircle
            size={15}
            color="#d97706"
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          <p
            style={{
              fontSize: 12,
              color: "#92400e",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            This action is recorded in the clinical audit trail and cannot be
            undone. The record will be soft-deleted and visible in audit
            history.
          </p>
        </div>

        {/* Reason input */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
            Reason for deletion <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <input
            ref={inputRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && reason.trim()) handleConfirm();
            }}
            placeholder="e.g. Entered in error, wrong tooth charted"
            style={{
              padding: "9px 12px",
              borderRadius: 8,
              fontSize: 13,
              border: `1.5px solid ${reason.trim() ? "#e2e8f0" : "#fca5a5"}`,
              outline: "none",
              color: "#0f172a",
              transition: "border-color 0.15s",
            }}
          />
          {!reason.trim() && (
            <span style={{ fontSize: 11, color: "#ef4444" }}>
              A reason is required for the audit trail.
            </span>
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 4,
          }}
        >
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#374151",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !reason.trim()}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              background: reason.trim() ? "#dc2626" : "#fca5a5",
              color: "#fff",
              cursor: reason.trim() ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "background 0.15s",
            }}
          >
            {loading && (
              <Loader2
                size={13}
                style={{ animation: "spin 1s linear infinite" }}
              />
            )}
            Delete condition
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOTH SVG
// ─────────────────────────────────────────────────────────────────────────────

/** Root paths as JSX — replaces dangerouslySetInnerHTML. */
const ToothRoots = React.memo(function ToothRoots({
  kind,
  isUpper,
  cl,
  cx,
  cr,
  cb,
  ct,
}: {
  kind: string;
  isUpper: boolean;
  cl: number;
  cx: number;
  cr: number;
  cb: number;
  ct: number;
}) {
  const tip = isUpper ? 113 : 3; // H=116, tip near bottom (upper) or top (lower)
  const rT = isUpper ? cb - 3 : ct + 3;

  const rootPath = (rx: number, ry: number, rw: number) => {
    const m = rx + rw / 2;
    return `M${rx} ${ry}Q${rx - 1.5} ${(ry + tip) / 2} ${m} ${tip}Q${rx + rw + 1.5} ${(ry + tip) / 2} ${rx + rw} ${ry}Z`;
  };

  const paths: string[] =
    kind === "molar"
      ? [
          rootPath(cl + 3, rT, 8),
          rootPath(cx - 4, rT, 8),
          rootPath(cr - 11, rT, 8),
        ]
      : kind === "premolar"
        ? [rootPath(cx - 9, rT, 8), rootPath(cx + 1, rT, 7)]
        : [rootPath(cx - 5, rT, 10)];

  return (
    <>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="#ece0c8" stroke="#cbb389" strokeWidth={0.7} />
      ))}
    </>
  );
});

const ToothSVG = React.memo(function ToothSVG({
  fdi,
  isUpper,
  entries,
  selected,
  visibleLayers,
  onClick,
  onSurfaceClick,
}: {
  fdi: number;
  isUpper: boolean;
  entries: ChartEntry[];
  selected: boolean;
  visibleLayers: Record<Layer, boolean>;
  onClick: (n: number, mods: { ctrl: boolean; shift: boolean }) => void;
  onSurfaceClick: (
    n: number,
    s: UiSurface,
    mods: { ctrl: boolean; shift: boolean },
  ) => void;
}) {
  const k = toothKind(fdi);
  const ps = resolvePresence(entries);
  const { primary: presence } = ps;

  // ── Surface colour: dual channel (condition + treatment) ───────────────────
  // A surface can be true on two axes at once: an active CONDITION (caries) AND
  // treatment / baseline work (a planned filling, an existing restoration). A
  // single solid colour can only show the paint-priority winner, hiding the
  // other — the classic "condition covers the treatment" problem. So track TWO
  // channels per surface and render the overlap as a thick hatch (condition fill
  // + treatment stripes) instead of letting one bury the other.
  //
  //   condColor[z] — active, live CONDITION layer on surface z
  //   baseColor[z] — top NON-condition layer (treatment / existing / resolved),
  //                  resolved by LAYER_PAINT_PRIORITY exactly as before
  //
  // layerForEntry() still refines a procedure row by its live status, so
  // IN_PROGRESS paints orange and on-hold/referred paints grey within baseColor.
  const condColor: Record<string, string> = {};
  const baseColor: Record<string, string> = {};

  // Base channel — RESOLVED conditions first (muted grey baseline), then active
  // non-condition layers LOWEST → HIGHEST so the top treatment / existing layer
  // wins its surface. CONDITION is deliberately excluded here; it owns its own
  // channel so it hatches OVER the treatment rather than overwriting it.
  if (visibleLayers.RESOLVED) {
    entries
      .filter(
        (e) =>
          e.status === "RESOLVED" &&
          e.type === "CONDITION" &&
          e.surfaces.length,
      )
      .forEach((e) =>
        e.surfaces.forEach((s) => {
          baseColor[s] = LAYER_COLOR.RESOLVED.c;
        }),
      );
  }
  for (const layer of LAYER_PAINT_PRIORITY) {
    if (layer === "RESOLVED" || layer === "CONDITION") continue;
    if (!visibleLayers[layer]) continue;
    entries
      .filter(
        (e) =>
          e.status === "ACTIVE" &&
          isLiveConditionEntry(e) &&
          layerForEntry(e) === layer &&
          e.surfaces.length,
      )
      .forEach((e) =>
        e.surfaces.forEach((s) => {
          baseColor[s] = LAYER_COLOR[layer].c;
        }),
      );
  }

  // Condition channel — active, live CONDITION rows only.
  if (visibleLayers.CONDITION) {
    entries
      .filter(
        (e) =>
          e.status === "ACTIVE" &&
          isLiveConditionEntry(e) &&
          layerForEntry(e) === "CONDITION" &&
          e.surfaces.length,
      )
      .forEach((e) =>
        e.surfaces.forEach((s) => {
          condColor[s] = LAYER_COLOR.CONDITION.c;
        }),
      );
  }

  // Incisal (I) is the biting edge of anterior teeth — the SVG has a single
  // central biting polygon (the "O" zone), so an incisal finding shares it.
  // Mirror BOTH channels onto the central zone, else an incisal finding never
  // paints (B3). Remember the tooth-appropriate label (anterior "I" / "O").
  const isAnterior = k === "incisor" || k === "canine";
  const centralKey: UiSurface = isAnterior ? "I" : "O";
  if (condColor["I"] && !condColor["O"]) condColor["O"] = condColor["I"];
  if (baseColor["I"] && !baseColor["O"]) baseColor["O"] = baseColor["I"];

  // Per-surface dominant colour (condition wins, else the base layer) drives the
  // surface label + outline; surfBoth flags an overlap so the polygon renders a
  // hatch instead of a solid. surfColor keeps the label logic below unchanged —
  // it only asks "is this surface painted at all?".
  const SURF_ZONES = ["M", "D", "O", "B", "L"] as const;
  const surfColor: Record<string, string> = {};
  for (const z of SURF_ZONES) {
    const c = condColor[z] ?? baseColor[z];
    if (c) surfColor[z] = c;
  }
  const surfBoth = (z: string): boolean =>
    !!condColor[z] && !!baseColor[z] && condColor[z] !== baseColor[z];

  // A tooth can carry more than one whole-tooth restoration state at once — e.g.
  // an EXISTING crown plus a PLANNED replacement crown. `.find()` returned
  // whichever came first in the merged list, so the painted state was arbitrary
  // (#2). Pick by paint precedence instead, so the replacement (PLANNED) wins
  // over the crown it replaces (EXISTING) deterministically.
  const wholeToothEntry = highestPriorityEntry(
    entries.filter(
      (e) =>
        e.status === "ACTIVE" &&
        e.surfaces.length === 0 &&
        e.type !== "CONDITION" &&
        visibleLayers[layerForEntry(e)],
    ),
  );
  const crownLayer = wholeToothEntry ? layerForEntry(wholeToothEntry) : null;

  const hasRct = entries.some(
    (e) =>
      e.status === "ACTIVE" &&
      /root canal|rct|endodont/i.test(e.label) &&
      visibleLayers[layerForEntry(e)],
  );

  // M-1: the dominant restoration glyph (crown / veneer / bridge retainer /
  // denture / sealant / ortho) overlaid on a present tooth. Pre-filter to
  // active, layer-visible procedure rows; pickRestoration resolves precedence.
  // Bridge pontics are handled as a presence primary, not an overlay.
  const restoration = pickRestoration(
    entries.filter(
      (e) =>
        e.status === "ACTIVE" &&
        e.type !== "CONDITION" &&
        visibleLayers[layerForEntry(e)],
    ),
  );

  // ── Geometry ───────────────────────────────────────────────────────────────
  const W = 64,
    H = 116;
  const cx = W / 2;
  const CW = { molar: 50, premolar: 40, canine: 33, incisor: 29 }[k]!;
  const CH = { molar: 45, premolar: 50, canine: 52, incisor: 44 }[k]!;
  const cl = cx - CW / 2,
    cr = cx + CW / 2;
  const ct = isUpper ? 12 : H - 12 - CH;
  const cb = ct + CH;
  const cm = (ct + cb) / 2;
  const ins = 9;
  const oL = cl + ins,
    oR = cr - ins,
    oT = ct + ins,
    oB = cb - ins;

  // ── Crown path ─────────────────────────────────────────────────────────────
  let crown: string;
  if (k === "molar")
    crown = isUpper
      ? `M${cl + 4} ${ct + 6}Q${cl - 1} ${ct} ${cl + 6} ${ct - 3}Q${cx - 5} ${ct - 7} ${cx} ${ct - 3}Q${cx + 5} ${ct - 7} ${cr - 6} ${ct - 3}Q${cr + 1} ${ct} ${cr - 4} ${ct + 6}Q${cr + 3} ${cm} ${cr} ${cb - 4}Q${cr - 4} ${cb + 3} ${cx} ${cb + 3}Q${cl + 4} ${cb + 3} ${cl} ${cb - 4}Q${cl - 3} ${cm} ${cl + 4} ${ct + 6}Z`
      : `M${cl + 4} ${cb - 6}Q${cl - 1} ${cb} ${cl + 6} ${cb + 3}Q${cx - 5} ${cb + 7} ${cx} ${cb + 3}Q${cx + 5} ${cb + 7} ${cr - 6} ${cb + 3}Q${cr + 1} ${cb} ${cr - 4} ${cb - 6}Q${cr + 3} ${cm} ${cr} ${ct + 4}Q${cr - 4} ${ct - 3} ${cx} ${ct - 3}Q${cl + 4} ${ct - 3} ${cl} ${ct + 4}Q${cl - 3} ${cm} ${cl + 4} ${cb - 6}Z`;
  else if (k === "premolar")
    crown = isUpper
      ? `M${cl + 3} ${ct + 6}Q${cx} ${ct - 7} ${cr - 3} ${ct + 6}Q${cr + 2} ${cm} ${cr} ${cb - 4}Q${cr - 3} ${cb + 3} ${cx} ${cb + 4}Q${cl + 3} ${cb + 3} ${cl} ${cb - 4}Q${cl - 2} ${cm} ${cl + 3} ${ct + 6}Z`
      : `M${cl + 3} ${cb - 6}Q${cx} ${cb + 7} ${cr - 3} ${cb - 6}Q${cr + 2} ${cm} ${cr} ${ct + 4}Q${cr - 3} ${ct - 3} ${cx} ${ct - 4}Q${cl + 3} ${ct - 3} ${cl} ${ct + 4}Q${cl - 2} ${cm} ${cl + 3} ${cb - 6}Z`;
  else if (k === "canine")
    crown = isUpper
      ? `M${cl + 3} ${ct + 9}Q${cx} ${ct - 11} ${cr - 3} ${ct + 9}Q${cr + 2} ${cm} ${cr} ${cb - 4}Q${cr - 3} ${cb + 3} ${cx} ${cb + 4}Q${cl + 3} ${cb + 3} ${cl} ${cb - 4}Q${cl - 2} ${cm} ${cl + 3} ${ct + 9}Z`
      : `M${cl + 3} ${cb - 9}Q${cx} ${cb + 11} ${cr - 3} ${cb - 9}Q${cr + 2} ${cm} ${cr} ${ct + 4}Q${cr - 3} ${ct - 3} ${cx} ${ct - 4}Q${cl + 3} ${ct - 3} ${cl} ${ct + 4}Q${cl - 2} ${cm} ${cl + 3} ${cb - 9}Z`;
  else
    crown = isUpper
      ? `M${cl + 2} ${ct + 3}Q${cx} ${ct - 4} ${cr - 2} ${ct + 3}L${cr} ${cb - 4}Q${cr - 2} ${cb + 3} ${cx} ${cb + 3}Q${cl + 2} ${cb + 3} ${cl} ${cb - 4}Z`
      : `M${cl + 2} ${cb - 3}Q${cx} ${cb + 4} ${cr - 2} ${cb - 3}L${cr} ${ct + 4}Q${cr - 2} ${ct - 3} ${cx} ${ct - 3}Q${cl + 2} ${ct - 3} ${cl} ${ct + 4}Z`;

  const clipId = `cp-${fdi}`;
  const showRoots =
    presence === "PRESENT" ||
    presence === "UNERUPTED" ||
    presence === "SUPERNUMERARY" ||
    presence === "RETAINED_ROOT";

  // Surface polygon zones and label positions
  const Z: Record<string, string> = {
    O: `${oL},${oT} ${oR},${oT} ${oR},${oB} ${oL},${oB}`,
    B: isUpper
      ? `${cl},${ct} ${cr},${ct} ${oR},${oT} ${oL},${oT}`
      : `${cl},${cb} ${cr},${cb} ${oR},${oB} ${oL},${oB}`,
    L: isUpper
      ? `${cl},${cb} ${cr},${cb} ${oR},${oB} ${oL},${oB}`
      : `${cl},${ct} ${cr},${ct} ${oR},${oT} ${oL},${oT}`,
    M: `${cl},${ct} ${oL},${oT} ${oL},${oB} ${cl},${cb}`,
    D: `${cr},${ct} ${oR},${oT} ${oR},${oB} ${cr},${cb}`,
  };
  const LP: Record<string, [number, number]> = {
    O: [cx, (oT + oB) / 2],
    B: isUpper ? [cx, (ct + oT) / 2] : [cx, (cb + oB) / 2],
    L: isUpper ? [cx, (cb + oB) / 2] : [cx, (ct + oT) / 2],
    M: [(cl + oL) / 2, cm],
    D: [(cr + oR) / 2, cm],
  };

  // ── Shared surface overlay (used by PRESENT, SUPERNUMERARY branches) ───────
  const SurfaceOverlay = () => (
    <g clipPath={`url(#${clipId})`}>
      <defs>
        {SURF_ZONES.map((z) =>
          surfBoth(z) ? (
            // Thick diagonal hatch for a surface carrying BOTH an active
            // condition and treatment: solid condition fill (amber) with thick
            // treatment stripes coloured by the treatment's own status layer —
            // PLANNED red, COMPLETED blue, EXISTING green, etc (baseColor[z]).
            // A 5px stripe on an 8px tile reads as heavy bars over the condition
            // so neither layer is lost. Id keyed by fdi+zone — SVG ids global.
            <pattern
              key={`hx-${z}`}
              id={`hx-${fdi}-${z}`}
              width={8}
              height={8}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width={8} height={8} fill={condColor[z]} />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={8}
                stroke={baseColor[z]}
                strokeWidth={5}
              />
            </pattern>
          ) : null,
        )}
      </defs>
      {SURF_ZONES.map((z) => {
        const both = surfBoth(z);
        const col = surfColor[z];
        return (
          <polygon
            key={z}
            points={Z[z]}
            fill={both ? `url(#hx-${fdi}-${z})` : col || "transparent"}
            fillOpacity={col ? 0.9 : 0}
            stroke={both ? condColor[z] : col || "#c9b48f"}
            strokeWidth={col ? (both ? 0.9 : 0.6) : 0.4}
            strokeOpacity={col ? 1 : 0.38}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onSurfaceClick(fdi, (z === "O" ? centralKey : z) as UiSurface, {
                ctrl: e.metaKey || e.ctrlKey,
                shift: e.shiftKey,
              });
            }}
          />
        );
      })}
      {k === "molar" && (
        <>
          <line
            x1={cx}
            y1={oT + 2}
            x2={cx}
            y2={oB - 2}
            stroke="#b09666"
            strokeWidth={0.7}
            strokeOpacity={0.5}
          />
          <line
            x1={oL + 2}
            y1={cm}
            x2={oR - 2}
            y2={cm}
            stroke="#b09666"
            strokeWidth={0.7}
            strokeOpacity={0.5}
          />
        </>
      )}
      {k === "premolar" && (
        <line
          x1={cx}
          y1={oT + 1}
          x2={cx}
          y2={oB - 1}
          stroke="#b09666"
          strokeWidth={0.7}
          strokeOpacity={0.45}
        />
      )}
    </g>
  );

  // ── Restoration glyph overlay (M-1) ────────────────────────────────────────
  // Drawn on top of the crown for a PRESENT / SUPERNUMERARY tooth so prosthetic
  // and preventive work reads at a glance, not only in the ledger. Each kind has
  // a clinically-recognisable mark; geometry comes from the crown box above.
  const renderRestoration = (kind: RestorationKind): React.ReactNode => {
    const cervY = isUpper ? cb - 6 : ct + 6; // crown base (toward gum)
    switch (kind) {
      case "CROWN":
        // Full-coverage gold ring tracing the crown perimeter.
        return (
          <g style={{ pointerEvents: "none" }}>
            <path
              d={crown}
              fill="none"
              stroke="#d4af37"
              strokeWidth={2.4}
              strokeOpacity={0.95}
            />
            <circle cx={cr - 3} cy={cm} r={3.2} fill="#d4af37" />
          </g>
        );
      case "BRIDGE_RETAINER":
        // Abutment crown (gold ring) + proximal connector stubs to the pontic.
        return (
          <g style={{ pointerEvents: "none" }}>
            <line
              x1={cl - 5}
              y1={cm}
              x2={cl + 4}
              y2={cm}
              stroke="#b8860b"
              strokeWidth={3}
              strokeLinecap="round"
            />
            <line
              x1={cr - 4}
              y1={cm}
              x2={cr + 5}
              y2={cm}
              stroke="#b8860b"
              strokeWidth={3}
              strokeLinecap="round"
            />
            <path
              d={crown}
              fill="none"
              stroke="#d4af37"
              strokeWidth={2.4}
              strokeOpacity={0.95}
            />
          </g>
        );
      case "VENEER":
        // Facial laminate — a ceramic shield over the crown face.
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect
              x={cl + 5}
              y={cm - 8}
              width={cr - cl - 10}
              height={16}
              rx={3.5}
              fill="#f5d0fe"
              fillOpacity={0.55}
              stroke="#c026d3"
              strokeWidth={1.3}
            />
            <text
              x={cx}
              y={cm}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="8.5"
              fontWeight={800}
              fontFamily="ui-monospace,monospace"
              fill="#a21caf"
            >
              VNR
            </text>
          </g>
        );
      case "DENTURE":
        // Partial-denture clasp arms hugging the cervical third + tag.
        return (
          <g style={{ pointerEvents: "none" }}>
            <path
              d={`M${cl - 1} ${cm - 6} Q${cl - 5} ${cervY} ${cl + 5} ${cervY}`}
              fill="none"
              stroke="#64748b"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <path
              d={`M${cr + 1} ${cm - 6} Q${cr + 5} ${cervY} ${cr - 5} ${cervY}`}
              fill="none"
              stroke="#64748b"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <text
              x={cx}
              y={cm}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="8"
              fontWeight={800}
              fontFamily="ui-monospace,monospace"
              fill="#475569"
            >
              PD
            </text>
          </g>
        );
      case "SEALANT":
        // Occlusal sealant — stipple of teal dots across the biting surface.
        return (
          <g style={{ pointerEvents: "none" }}>
            {[-7, 0, 7].map((dx) => (
              <circle
                key={dx}
                cx={cx + dx}
                cy={(oT + oB) / 2}
                r={1.8}
                fill="#0d9488"
                fillOpacity={0.85}
              />
            ))}
          </g>
        );
      case "ORTHODONTIC":
        // Bracket on the facial + arch wire spanning across teeth (SVG overflow
        // is visible, so the wire visually links neighbours).
        return (
          <g style={{ pointerEvents: "none" }}>
            <line
              x1={-4}
              y1={cm}
              x2={W + 4}
              y2={cm}
              stroke="#475569"
              strokeWidth={1.5}
            />
            <rect
              x={cx - 5}
              y={cm - 5}
              width={10}
              height={10}
              rx={1.5}
              fill="#e2e8f0"
              stroke="#334155"
              strokeWidth={1.2}
            />
          </g>
        );
      default:
        return null;
    }
  };

  // ── Render body per presence ───────────────────────────────────────────────
  let bodyEl: React.ReactNode;

  if (presence === "EXTRACTED") {
    const xPad = 4;
    const ridgeY = isUpper ? cb + 1.5 : ct - 1.5;
    bodyEl = (
      <>
        <path
          d={crown}
          fill="#fef2f2"
          fillOpacity={0.55}
          stroke="#fca5a5"
          strokeWidth={1}
          strokeDasharray="3,2.5"
        />
        <line
          x1={cl + xPad}
          y1={ct + xPad}
          x2={cr - xPad}
          y2={cb - xPad}
          stroke="#dc2626"
          strokeWidth={3.2}
          strokeLinecap="round"
        />
        <line
          x1={cr - xPad}
          y1={ct + xPad}
          x2={cl + xPad}
          y2={cb - xPad}
          stroke="#dc2626"
          strokeWidth={3.2}
          strokeLinecap="round"
        />
        <line
          x1={cl + 2}
          y1={ridgeY}
          x2={cl + 9}
          y2={ridgeY}
          stroke="#b91c1c"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
        <line
          x1={cr - 9}
          y1={ridgeY}
          x2={cr - 2}
          y2={ridgeY}
          stroke="#b91c1c"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </>
    );
  } else if (presence === "PONTIC") {
    // Bridge pontic — a suspended artificial tooth. Connector bars reach the
    // adjacent abutments, the crown floats with a dashed (rootless) base, and
    // socket brackets show when the site was previously extracted (M-1).
    const cf = crownLayer ? LAYER_COLOR[crownLayer].light : "#f3e9cf";
    const cs = crownLayer ? LAYER_COLOR[crownLayer].c : "#b8860b";
    const baseY = isUpper ? cb : ct;
    const socketY = isUpper ? cb + 2 : ct - 2;
    bodyEl = (
      <>
        <line
          x1={cl - 5}
          y1={cm}
          x2={cl + 5}
          y2={cm}
          stroke="#b8860b"
          strokeWidth={3.2}
          strokeLinecap="round"
        />
        <line
          x1={cr - 5}
          y1={cm}
          x2={cr + 5}
          y2={cm}
          stroke="#b8860b"
          strokeWidth={3.2}
          strokeLinecap="round"
        />
        <path
          d={crown}
          fill={cf}
          stroke={cs}
          strokeWidth={crownLayer ? 2 : 1.6}
        />
        <defs>
          <clipPath id={clipId}>
            <path d={crown} />
          </clipPath>
        </defs>
        <SurfaceOverlay />
        <line
          x1={cl + 3}
          y1={baseY}
          x2={cr - 3}
          y2={baseY}
          stroke="#b45309"
          strokeWidth={1.3}
          strokeDasharray="2.5,2"
        />
        <text
          x={cx}
          y={cm}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="8.5"
          fontWeight={800}
          fontFamily="ui-monospace,monospace"
          fill="#7c2d12"
          style={{ pointerEvents: "none" }}
        >
          PON
        </text>
        {ps.wasExtracted && (
          <>
            <line
              x1={cl + 2}
              y1={socketY}
              x2={cl + 9}
              y2={socketY}
              stroke="#b91c1c"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeDasharray="2,1.5"
            />
            <line
              x1={cr - 9}
              y1={socketY}
              x2={cr - 2}
              y2={socketY}
              stroke="#b91c1c"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeDasharray="2,1.5"
            />
          </>
        )}
      </>
    );
  } else if (presence === "RETAINED_ROOT") {
    // Crown lost, root retained (K08.3). Roots are drawn by ToothRoots
    // (showRoots); the body is just a cervical stump cap — no crown (M-1).
    const stumpY = isUpper ? cb - 9 : ct - 2;
    bodyEl = (
      <>
        <rect
          x={cl + 4}
          y={stumpY}
          width={cr - cl - 8}
          height={11}
          rx={4}
          fill="#d8c3a0"
          stroke="#a98c5f"
          strokeWidth={1.3}
        />
        <text
          x={cx}
          y={stumpY + 5.5}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="8"
          fontWeight={800}
          fontFamily="ui-monospace,monospace"
          fill="#7c5e2e"
          style={{ pointerEvents: "none" }}
        >
          RR
        </text>
      </>
    );
  } else if (presence === "CONGENITAL") {
    const scale = 0.7;
    const ccx = cx,
      ccy = isUpper ? ct + CH / 2 : cb - CH / 2;
    bodyEl = (
      <>
        <g
          transform={`translate(${ccx} ${ccy}) scale(${scale}) translate(${-ccx} ${-ccy})`}
        >
          <path
            d={crown}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={1.1}
            strokeDasharray="2,2"
          />
        </g>
        <circle
          cx={cx}
          cy={cm}
          r={9}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1.5}
        />
        <line
          x1={cx - 7}
          y1={cm + 7}
          x2={cx + 7}
          y2={cm - 7}
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <text
          x={cx}
          y={isUpper ? cb + 8 : ct - 8}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="8.5"
          fontWeight={700}
          fontFamily="ui-monospace,monospace"
          fill="#94a3b8"
          letterSpacing="0.5"
        >
          CONG
        </text>
      </>
    );
  } else if (presence === "UNERUPTED") {
    const offset = isUpper ? 11 : -11;
    const gumY = isUpper ? ct - 4 : cb + 4;
    const gumH = 6;
    const stripes = Array.from({ length: 5 }).map((_, i) => {
      const x0 = cl + (i / 5) * (cr - cl);
      return (
        <line
          key={i}
          x1={x0}
          y1={gumY}
          x2={x0 + 5}
          y2={gumY - gumH * (isUpper ? 1 : -1)}
          stroke="#a78bfa"
          strokeOpacity={0.7}
          strokeWidth={1.1}
        />
      );
    });
    // Planned-intervention dot on UE badge
    const planDotColor = ps.hasPlannedIntervention ? "#dc2626" : "transparent";
    bodyEl = (
      <>
        <rect
          x={cl - 1}
          y={isUpper ? gumY - gumH : gumY}
          width={cr - cl + 2}
          height={gumH}
          fill="#ede9fe"
          fillOpacity={0.55}
          stroke="none"
        />
        {stripes}
        <g transform={`translate(0,${offset})`} opacity={0.6}>
          <path
            d={crown}
            fill="#f3e8ff"
            stroke="#8b5cf6"
            strokeWidth={1.1}
            strokeDasharray="3.5,2.5"
          />
        </g>
        <rect
          x={cx - 11}
          y={cm - 7}
          width={22}
          height={14}
          rx={3}
          fill="#7c3aed"
          fillOpacity={0.92}
        />
        <text
          x={cx}
          y={cm}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="9"
          fontWeight={800}
          fontFamily="ui-monospace,monospace"
          fill="#fff"
          letterSpacing="0.6"
        >
          UE
        </text>
        {/* Planned intervention indicator dot */}
        <circle cx={cx + 8} cy={cm - 8} r={3.5} fill={planDotColor} />
      </>
    );
  } else if (presence === "SUPERNUMERARY") {
    const cf = crownLayer ? LAYER_COLOR[crownLayer].light : "#faf3e3";
    const cs = crownLayer ? LAYER_COLOR[crownLayer].c : "#c4a06a";
    const extraScale = 0.55;
    const extraDx = CW * 0.62;
    const extraDy = isUpper ? 1 : -1;
    const exCx = cx + extraDx;
    const exCy = isUpper ? ct + CH / 2 + extraDy : cb - CH / 2 - extraDy;
    bodyEl = (
      <>
        <path
          d={crown}
          fill={cf}
          stroke={cs}
          strokeWidth={crownLayer ? 2 : 1.1}
        />
        <defs>
          <clipPath id={clipId}>
            <path d={crown} />
          </clipPath>
        </defs>
        <SurfaceOverlay />
        {restoration && renderRestoration(restoration)}
        <g
          transform={`translate(${exCx} ${exCy}) scale(${extraScale}) translate(${-cx} ${-(isUpper ? ct + CH / 2 : cb - CH / 2)})`}
          opacity={0.85}
        >
          <path
            d={crown}
            fill="#fdf2f8"
            stroke="#db2777"
            strokeWidth={1.4}
            strokeDasharray="3,2"
          />
        </g>
        <circle
          cx={cr - 2}
          cy={ct + 2}
          r={7}
          fill="#db2777"
          stroke="#fff"
          strokeWidth={1.5}
        />
        <text
          x={cr - 2}
          y={ct + 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="8"
          fontWeight={800}
          fontFamily="ui-monospace,monospace"
          fill="#fff"
        >
          +S
        </text>
      </>
    );
  } else if (presence === "IMPLANT") {
    // A PLANNED-only implant must not look identical to a placed (osseointegrated)
    // one. When planned we ghost the fixture: dashed crown + dashed fixture line,
    // lighter threads, muted "IMP", and a red planned dot — mirroring the
    // planned-intervention dot used on unerupted teeth.
    const planned = ps.implantPlanned;
    const fixtureCol = planned ? "#b8bdc2" : "#9aa0a6";
    const threadCol = planned ? "#b0b6bc" : "#7d848b";
    const crownFill = planned ? "#eef1f3" : "#dee1e4";
    const crownStroke = planned ? "#9aa0a6" : "#8b9197";
    const impFill = planned ? "#9aa0a6" : "#5f656b";
    const dash = planned ? "3,2" : undefined;
    const y0 = isUpper ? cb - 2 : ct + 2;
    const y1 = isUpper ? H - 5 : 5;
    const threads = Array.from({ length: 7 }).map((_, i) => {
      const yy = y0 + (y1 - y0) * (i / 7);
      return (
        <line
          key={i}
          x1={cx - 4}
          y1={yy}
          x2={cx + 4}
          y2={yy + (isUpper ? 2.5 : -2.5)}
          stroke={threadCol}
          strokeWidth={1.2}
          strokeDasharray={dash}
        />
      );
    });
    bodyEl = (
      <>
        {/* Socket brackets — shown when implant replaced an extracted tooth */}
        {ps.wasExtracted && (
          <>
            <line
              x1={cl + 2}
              y1={isUpper ? cb + 2 : ct - 2}
              x2={cl + 9}
              y2={isUpper ? cb + 2 : ct - 2}
              stroke="#b91c1c"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeDasharray="2,1.5"
            />
            <line
              x1={cr - 9}
              y1={isUpper ? cb + 2 : ct - 2}
              x2={cr - 2}
              y2={isUpper ? cb + 2 : ct - 2}
              stroke="#b91c1c"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeDasharray="2,1.5"
            />
          </>
        )}
        <line
          x1={cx}
          y1={y0}
          x2={cx}
          y2={y1}
          stroke={fixtureCol}
          strokeWidth={4.5}
          strokeDasharray={dash}
        />
        {threads}
        <path
          d={crown}
          fill={crownFill}
          stroke={crownStroke}
          strokeWidth={1.2}
          strokeDasharray={dash}
        />
        <text
          x={cx}
          y={cm}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="10"
          fontWeight={500}
          fontFamily="ui-monospace,monospace"
          fill={impFill}
        >
          IMP
        </text>
        {/* Planned-fixture indicator — distinguishes "implant planned" from "implant placed" */}
        {planned && <circle cx={cr - 3} cy={ct + 3} r={3.5} fill="#dc2626" />}
        {/* Congenital-absence badge — ∅ in top corner */}
        {ps.wasCongenital && (
          <>
            <circle
              cx={cl + 8}
              cy={ct + 8}
              r={6}
              fill="#e0f2fe"
              stroke="#38bdf8"
              strokeWidth={1}
            />
            <line
              x1={cl + 4}
              y1={ct + 12}
              x2={cl + 12}
              y2={ct + 4}
              stroke="#0284c7"
              strokeWidth={1.2}
              strokeLinecap="round"
            />
          </>
        )}
      </>
    );
  } else {
    // PRESENT — standard crown with surface overlays
    const cf = crownLayer ? LAYER_COLOR[crownLayer].light : "#faf3e3";
    const cs = crownLayer ? LAYER_COLOR[crownLayer].c : "#c4a06a";
    bodyEl = (
      <>
        <path
          d={crown}
          fill={cf}
          stroke={cs}
          strokeWidth={crownLayer ? 2 : 1.1}
        />
        <defs>
          <clipPath id={clipId}>
            <path d={crown} />
          </clipPath>
        </defs>
        <SurfaceOverlay />
        {(["M", "D", "O", "B", "L"] as const).map((z) => {
          if (!surfColor[z]) return null;
          const [lx, ly] = LP[z];
          return (
            <text
              key={z}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="12"
              fontWeight={500}
              fontFamily="ui-monospace,monospace"
              fill="#fff"
              style={{ pointerEvents: "none" }}
            >
              {z === "O" ? centralKey : z}
            </text>
          );
        })}
        <ellipse
          cx={cx - CW * 0.16}
          cy={isUpper ? ct + CH * 0.27 : ct + CH * 0.73}
          rx={CW * 0.18}
          ry={CH * 0.12}
          fill="#fff"
          fillOpacity={0.34}
        />
        {hasRct && visibleLayers.PLANNED && (
          <line
            x1={cx}
            y1={isUpper ? cb - 2 : ct + 2}
            x2={cx}
            y2={isUpper ? H - 4 : 4}
            stroke="#dc2626"
            strokeWidth={1.4}
            strokeDasharray="3,2"
          />
        )}
        {restoration && renderRestoration(restoration)}
      </>
    );
  }

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", overflow: "visible", cursor: "pointer" }}
      onClick={(e) =>
        onClick(fdi, { ctrl: e.metaKey || e.ctrlKey, shift: e.shiftKey })
      }
    >
      {selected && (
        <rect
          x={-3}
          y={-3}
          width={W + 6}
          height={H + 6}
          rx={7}
          fill="#dbeafe"
          fillOpacity={0.45}
          stroke="#2563eb"
          strokeWidth={2}
        />
      )}
      {showRoots && (
        <ToothRoots
          kind={k}
          isUpper={isUpper}
          cl={cl}
          cx={cx}
          cr={cr}
          cb={cb}
          ct={ct}
        />
      )}
      {presence !== "CONGENITAL" && (
        <ellipse
          cx={cx}
          cy={isUpper ? cb + 2 : ct - 2}
          rx={CW / 2 + 3}
          ry={4.5}
          fill={presence === "EXTRACTED" ? "#fde2e2" : "#f6dccb"}
          stroke={presence === "EXTRACTED" ? "#f5b5b5" : "#e6bfa6"}
          strokeWidth={0.6}
          opacity={presence === "EXTRACTED" ? 0.7 : 1}
        />
      )}
      {bodyEl}
    </svg>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SPLIT LEDGER
// ─────────────────────────────────────────────────────────────────────────────

function SplitLedger({
  entries,
  selectedTeeth,
  onRowClick,
}: {
  entries: ChartEntry[];
  selectedTeeth: number[];
  onRowClick: (teeth: number[]) => void;
}) {
  const [condFilter, setCondFilter] = useState<"ALL" | "ACTIVE" | "RESOLVED">("ACTIVE");
  const [procFilter, setProcFilter] = useState<
    "ALL" | "EXISTING" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "INACTIVE"
  >("ALL");

  const conditions = useMemo(
    () =>
      entries
        .filter((e) => e.type === "CONDITION")
        .filter((e) => {
          if (condFilter === "ALL") return true;
          if (condFilter === "ACTIVE")
            return e.status === "ACTIVE" && isLiveConditionEntry(e);
          if (condFilter === "RESOLVED") return e.status === "RESOLVED";
          return false;
        })
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    [entries, condFilter],
  );

  const procedures = useMemo(
    () =>
      entries
        .filter((e) => e.type !== "CONDITION")
        // Only live rows belong in the procedures ledger. The merged entry list
        // still carries SUPERSEDED / VOIDED rows (apiAsEntries maps them through
        // unfiltered), and every other consumer — ToothSVG, resolvePresence,
        // stats — filters to ACTIVE locally. Without this a re-treated / voided
        // procedure shows here as if it were still live work (B2).
        .filter((e) => e.status === "ACTIVE")
        .filter((e) => procFilter === "ALL" || layerForEntry(e) === procFilter)
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    [entries, procFilter],
  );

  const fmtMoney = (n?: number, cur?: string): string => {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const c = (cur ?? "UGX").toUpperCase();
    if (c === "USD")
      return `USD ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `UGX ${Math.round(Number(n)).toLocaleString("en-UG")}`;
  };

  const Pill = ({
    active,
    color,
    onClick: oc,
    label,
  }: {
    active: boolean;
    color: string;
    onClick: () => void;
    label: string;
  }) => (
    <button
      onClick={oc}
      style={{
        padding: "2px 10px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 600,
        cursor: "pointer",
        border: `1px solid ${active ? color : "#e2e8f0"}`,
        background: active ? color : "#fff",
        color: active ? "#fff" : "#64748b",
        transition: "all 0.12s",
      }}
    >
      {label}
    </button>
  );

  const renderCol = (
    title: string,
    icon: React.ReactNode,
    headerColor: string,
    items: ChartEntry[],
    filters: React.ReactNode,
    opts: { showPrice?: boolean } = {},
  ) => (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        borderRadius: 8,
        border: "1px solid #e2e8f0",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <span style={{ color: headerColor, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
          {title}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: "#64748b",
            fontWeight: 700,
            background: "#f1f5f9",
            padding: "1px 8px",
            borderRadius: 8,
          }}
        >
          {items.length}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 5,
          padding: "5px 11px",
          borderBottom: "1px solid #f1f5f9",
          flexWrap: "wrap",
        }}
      >
        {filters}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {items.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "22px 12px",
              color: "#94a3b8",
              fontSize: 11,
            }}
          >
            No entries
          </div>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}
          >
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {[
                  "Date",
                  "Th",
                  "Surf",
                  "Code / Name",
                  opts.showPrice ? "Price" : null,
                  "Status",
                ]
                  .filter(Boolean)
                  .map((h) => (
                    <th
                      key={h as string}
                      style={{
                        padding: "5px 8px",
                        textAlign: "left",
                        fontWeight: 700,
                        color: "#64748b",
                        fontSize: 9,
                        letterSpacing: ".04em",
                        borderBottom: "1px solid #e2e8f0",
                        whiteSpace: "nowrap",
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {items.map((entry, idx) => {
                const isSel = entry.toothNumbers.some((t) =>
                  selectedTeeth.includes(t),
                );
                const c = LAYER_COLOR[layerForEntry(entry)];
                return (
                  <tr
                    key={entry.id}
                    onClick={() => onRowClick(entry.toothNumbers)}
                    style={{
                      background: isSel
                        ? "#eff6ff"
                        : idx % 2 === 0
                          ? "#fff"
                          : "#fafafa",
                      cursor: "pointer",
                      borderBottom: "1px solid #f0f0f0",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSel) e.currentTarget.style.background = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSel)
                        e.currentTarget.style.background =
                          idx % 2 === 0 ? "#fff" : "#fafafa";
                    }}
                  >
                    <td
                      style={{
                        padding: "5px 8px",
                        color: "#64748b",
                        whiteSpace: "nowrap",
                        fontSize: 10,
                        fontFamily: "ui-monospace,monospace",
                      }}
                    >
                      {entry.date}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        color: "#1e293b",
                        fontWeight: 700,
                        fontFamily: "monospace",
                        fontSize: 10,
                      }}
                    >
                      {entry.toothNumbers.join(", ")}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        fontFamily: "monospace",
                        color: "#475569",
                        fontWeight: 600,
                        fontSize: 10,
                      }}
                    >
                      {entry.surfaces.length ? entry.surfaces.join("") : "—"}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        fontFamily: "monospace",
                        fontSize: 10,
                        maxWidth: 160,
                      }}
                    >
                      <span style={{ color: "#2563eb", fontWeight: 600 }}>
                        {entry.code || "—"}
                      </span>{" "}
                      <span style={{ color: "#475569" }}>
                        {entry.name || entry.label || "—"}
                      </span>
                    </td>
                    {opts.showPrice && (
                      <td
                        style={{
                          padding: "5px 8px",
                          fontFamily: "monospace",
                          color: "#0f172a",
                          fontWeight: 600,
                          fontSize: 10,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtMoney(entry.totalPrice, entry.currency)}
                      </td>
                    )}
                    <td style={{ padding: "5px 8px" }}>
                      {(() => {
                        // CONDITION rows show the clinical status (Active /
                        // Monitored / Resolved / Ruled out); procedure rows keep
                        // their live procedureStatus or layer label.
                        // For CONDITION entries, prefer conditionStatus; fall back
                        // to status (which is RESOLVED for resolved conditions).
                        const conditionClinicalStatus =
                          entry.type === "CONDITION"
                            ? (entry.conditionStatus ?? entry.status) as PatientConditionStatus
                            : null;
                        const cs =
                          conditionClinicalStatus
                            ? (CONDITION_STATUS_META[conditionClinicalStatus] ?? CONDITION_STATUS_META.ACTIVE)
                            : null;
                        const bg = cs ? cs.light : c.light;
                        const fg = cs ? cs.text : c.text;
                        const text = cs
                          ? cs.label
                          : entry.procedureStatus
                            ? entry.procedureStatus
                            : c.label;
                        return (
                          <span
                            style={{
                              padding: "1px 8px",
                              borderRadius: 10,
                              fontSize: 9,
                              fontWeight: 700,
                              background: bg,
                              color: fg,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {text}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return (
    <div
      style={{
        borderTop: "1px solid #e2e8f0",
        background: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
        height: 250,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "8px 10px",
          flex: 1,
          minHeight: 0,
        }}
      >
        {renderCol(
          "Conditions",
          <AlertCircle size={14} />,
          LAYER_COLOR.CONDITION.c,
          conditions,
          <>
            <Pill
              active={condFilter === "ACTIVE"}
              color={LAYER_COLOR.CONDITION.c}
              onClick={() => setCondFilter("ACTIVE")}
              label="Active"
            />
            <Pill
              active={condFilter === "RESOLVED"}
              color={LAYER_COLOR.RESOLVED.c}
              onClick={() => setCondFilter("RESOLVED")}
              label="Resolved"
            />
            <Pill
              active={condFilter === "ALL"}
              color="#64748b"
              onClick={() => setCondFilter("ALL")}
              label="All"
            />
          </>,
        )}
        {renderCol(
          "Procedures",
          <ClipboardList size={14} />,
          LAYER_COLOR.PLANNED.c,
          procedures,
          <>
            {(
              [
                "ALL",
                "EXISTING",
                "PLANNED",
                "IN_PROGRESS",
                "COMPLETED",
                "INACTIVE",
              ] as const
            ).map((f) => (
              <Pill
                key={f}
                active={procFilter === f}
                color={f === "ALL" ? "#64748b" : LAYER_COLOR[f].c}
                onClick={() => setProcFilter(f)}
                label={f === "ALL" ? "All" : LAYER_COLOR[f].label}
              />
            ))}
          </>,
          { showPrice: true },
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESENCE LEGEND (tooth-state key strip)
// ─────────────────────────────────────────────────────────────────────────────

const PRESENCE_LEGEND: Array<{
  key: string;
  label: string;
  swatch: React.ReactNode;
}> = [
  {
    key: "EXTRACTED",
    label: "Extracted",
    swatch: (
      <svg width={18} height={18} viewBox="0 0 18 18">
        <rect
          x={1.5}
          y={1.5}
          width={15}
          height={15}
          rx={3}
          fill="#fef2f2"
          stroke="#fca5a5"
          strokeDasharray="2,1.5"
        />
        <line
          x1={4}
          y1={4}
          x2={14}
          y2={14}
          stroke="#dc2626"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        <line
          x1={14}
          y1={4}
          x2={4}
          y2={14}
          stroke="#dc2626"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    key: "CONGENITAL",
    label: "Congenital",
    swatch: (
      <svg width={18} height={18} viewBox="0 0 18 18">
        <circle
          cx={9}
          cy={9}
          r={6}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1.5}
        />
        <line
          x1={4}
          y1={14}
          x2={14}
          y2={4}
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    key: "UNERUPTED",
    label: "Unerupted",
    swatch: (
      <svg width={22} height={18} viewBox="0 0 22 18">
        <rect x={2} y={2} width={18} height={3.5} fill="#ede9fe" />
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={i}
            x1={2 + i * 3.5}
            y1={5.5}
            x2={5 + i * 3.5}
            y2={2}
            stroke="#a78bfa"
            strokeWidth={1}
          />
        ))}
        <rect
          x={3}
          y={6.5}
          width={16}
          height={9}
          rx={2}
          fill="#f3e8ff"
          stroke="#8b5cf6"
          strokeDasharray="2,1.5"
          opacity={0.7}
        />
        <rect x={5.5} y={9.5} width={11} height={4} rx={1} fill="#7c3aed" />
      </svg>
    ),
  },
  {
    key: "IMPLANT",
    label: "Implant",
    swatch: (
      <svg width={18} height={18} viewBox="0 0 18 18">
        <rect
          x={4}
          y={2}
          width={10}
          height={6}
          rx={1.5}
          fill="#dee1e4"
          stroke="#8b9197"
        />
        <line x1={9} y1={8} x2={9} y2={16} stroke="#9aa0a6" strokeWidth={3} />
        {[10, 12, 14].map((y, i) => (
          <line
            key={i}
            x1={6}
            y1={y}
            x2={12}
            y2={y + 1}
            stroke="#7d848b"
            strokeWidth={1}
          />
        ))}
      </svg>
    ),
  },
  {
    key: "IMPLANT_PLANNED",
    label: "Implant (planned)",
    swatch: (
      <svg width={18} height={18} viewBox="0 0 18 18">
        <rect
          x={4}
          y={2}
          width={10}
          height={6}
          rx={1.5}
          fill="#eef1f3"
          stroke="#9aa0a6"
          strokeDasharray="2,1.5"
        />
        <line
          x1={9}
          y1={8}
          x2={9}
          y2={16}
          stroke="#b8bdc2"
          strokeWidth={3}
          strokeDasharray="2,1.5"
        />
        <circle cx={15} cy={3} r={2.6} fill="#dc2626" />
      </svg>
    ),
  },
  {
    key: "IMPLANT_EXTR",
    label: "Implant (was extracted)",
    swatch: (
      <svg width={22} height={18} viewBox="0 0 22 18">
        <rect
          x={5}
          y={2}
          width={10}
          height={6}
          rx={1.5}
          fill="#dee1e4"
          stroke="#8b9197"
        />
        <line x1={10} y1={8} x2={10} y2={15} stroke="#9aa0a6" strokeWidth={3} />
        {[10, 12].map((y, i) => (
          <line
            key={i}
            x1={7}
            y1={y}
            x2={13}
            y2={y + 1}
            stroke="#7d848b"
            strokeWidth={1}
          />
        ))}
        <line
          x1={2}
          y1={17}
          x2={6}
          y2={17}
          stroke="#b91c1c"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeDasharray="1.5,1"
        />
        <line
          x1={14}
          y1={17}
          x2={18}
          y2={17}
          stroke="#b91c1c"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeDasharray="1.5,1"
        />
      </svg>
    ),
  },
  {
    key: "SUPERNUMERARY",
    label: "Supernumerary",
    swatch: (
      <svg width={22} height={18} viewBox="0 0 22 18">
        <rect
          x={2}
          y={3}
          width={10}
          height={12}
          rx={2}
          fill="#faf3e3"
          stroke="#c4a06a"
        />
        <rect
          x={11}
          y={6}
          width={7}
          height={9}
          rx={1.5}
          fill="#fdf2f8"
          stroke="#db2777"
          strokeDasharray="2,1.5"
        />
        <circle
          cx={17.5}
          cy={3.5}
          r={3}
          fill="#db2777"
          stroke="#fff"
          strokeWidth={1}
        />
      </svg>
    ),
  },
  {
    key: "RETAINED_ROOT",
    label: "Retained root",
    swatch: (
      <svg width={18} height={18} viewBox="0 0 18 18">
        <rect x={4} y={2} width={10} height={5} rx={2} fill="#d8c3a0" stroke="#a98c5f" />
        <path
          d="M6 7 Q5 13 9 16 Q13 13 12 7 Z"
          fill="#ece0c8"
          stroke="#cbb389"
          strokeWidth={0.8}
        />
      </svg>
    ),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// RESTORATION LEGEND (prosthetic / preventive glyph key — M-1)
// ─────────────────────────────────────────────────────────────────────────────

const RESTORATION_LEGEND: Array<{
  key: string;
  label: string;
  swatch: React.ReactNode;
}> = [
  {
    key: "CROWN",
    label: "Crown",
    swatch: (
      <svg width={18} height={18} viewBox="0 0 18 18">
        <rect x={2.5} y={2.5} width={13} height={13} rx={3} fill="#fdf6e3" />
        <rect
          x={2.5}
          y={2.5}
          width={13}
          height={13}
          rx={3}
          fill="none"
          stroke="#d4af37"
          strokeWidth={2.2}
        />
      </svg>
    ),
  },
  {
    key: "BRIDGE",
    label: "Bridge (pontic)",
    swatch: (
      <svg width={26} height={18} viewBox="0 0 26 18">
        <line x1={1} y1={9} x2={6} y2={9} stroke="#b8860b" strokeWidth={2.6} strokeLinecap="round" />
        <line x1={20} y1={9} x2={25} y2={9} stroke="#b8860b" strokeWidth={2.6} strokeLinecap="round" />
        <rect x={7} y={3} width={12} height={12} rx={3} fill="#f3e9cf" stroke="#b8860b" strokeWidth={1.4} />
        <line x1={8} y1={15} x2={18} y2={15} stroke="#b45309" strokeWidth={1.1} strokeDasharray="2,1.5" />
      </svg>
    ),
  },
  {
    key: "VENEER",
    label: "Veneer",
    swatch: (
      <svg width={18} height={18} viewBox="0 0 18 18">
        <rect x={2.5} y={2.5} width={13} height={13} rx={3} fill="#faf3e3" stroke="#c4a06a" strokeWidth={0.8} />
        <rect x={4.5} y={5} width={9} height={8} rx={2} fill="#f5d0fe" fillOpacity={0.6} stroke="#c026d3" strokeWidth={1.2} />
      </svg>
    ),
  },
  {
    key: "DENTURE",
    label: "Denture / partial",
    swatch: (
      <svg width={18} height={18} viewBox="0 0 18 18">
        <rect x={3} y={3} width={12} height={12} rx={3} fill="#faf3e3" stroke="#c4a06a" strokeWidth={0.8} />
        <path d="M3 7 Q1 13 6 13" fill="none" stroke="#64748b" strokeWidth={1.5} strokeLinecap="round" />
        <path d="M15 7 Q17 13 12 13" fill="none" stroke="#64748b" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "SEALANT",
    label: "Sealant",
    swatch: (
      <svg width={18} height={18} viewBox="0 0 18 18">
        <rect x={3} y={3} width={12} height={12} rx={3} fill="#faf3e3" stroke="#c4a06a" strokeWidth={0.8} />
        {[5, 9, 13].map((cx) => (
          <circle key={cx} cx={cx} cy={9} r={1.6} fill="#0d9488" />
        ))}
      </svg>
    ),
  },
  {
    key: "ORTHODONTIC",
    label: "Orthodontic",
    swatch: (
      <svg width={18} height={18} viewBox="0 0 18 18">
        <line x1={1} y1={9} x2={17} y2={9} stroke="#475569" strokeWidth={1.4} />
        <rect x={6} y={6} width={6} height={6} rx={1.2} fill="#e2e8f0" stroke="#334155" strokeWidth={1.1} />
      </svg>
    ),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ERROR BOUNDARY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render-error boundary around the chart. A throw in any tooth (e.g. a
 * malformed entry that crashes ToothSVG) is caught here and shown as a
 * recoverable fallback, instead of unmounting the entire visit page.
 *
 *  · "Reload chart" remounts the subtree via a bumped key — re-runs the data
 *    queries and resets local chart state, without a full page navigation.
 *  · "Reload page" is the hard fallback if the soft remount keeps throwing.
 *
 * Error boundaries must be class components — there is no hook equivalent.
 */
class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; resetKey: number }
> {
  state = { hasError: false, error: null as Error | null, resetKey: 0 };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface for observability without taking down the page.
    console.error("[DentalChart] render error:", error, info?.componentStack);
  }

  handleReloadChart = () => {
    this.setState((s) => ({
      hasError: false,
      error: null,
      resetKey: s.resetKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            height: 420,
            gap: 12,
            padding: 24,
            background: "#f1f5f9",
            textAlign: "center",
          }}
        >
          <AlertCircle size={30} color="#dc2626" />
          <span style={{ color: "#dc2626", fontSize: 15, fontWeight: 600 }}>
            The dental chart hit an unexpected error
          </span>
          <span
            style={{
              color: "#64748b",
              fontSize: 12,
              maxWidth: 420,
              lineHeight: 1.5,
            }}
          >
            The rest of the visit is unaffected. Reload just the chart, or
            refresh the page if the problem persists.
          </span>
          {this.state.error?.message && (
            <code
              title={this.state.error.message}
              style={{
                fontSize: 11,
                color: "#94a3b8",
                fontFamily: "ui-monospace,monospace",
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: "4px 10px",
                maxWidth: 460,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {this.state.error.message}
            </code>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              onClick={this.handleReloadChart}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <RefreshCcw size={14} /> Reload chart
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid #e2e8f0",
                background: "#fff",
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    // Keyed fragment: bumping resetKey remounts the whole chart subtree.
    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export interface DentalChartProps {
  /** Required for a real chart. Omitting it is only valid when `demo` is true. */
  patientId?: string;
  visitId?: string;
  dentistId?: string;
  readOnly?: boolean;
  hasActivePlan?: boolean;
  /**
   * Explicit demo/sandbox mode: all edits stay in local state and nothing is
   * persisted. Must be opted into deliberately — a real patientId with no
   * visitId is NOT demo (it's a chart-only view that still persists).
   */
  demo?: boolean;
}

function DentalChartInner({
  patientId,
  visitId,
  dentistId,
  readOnly = false,
  hasActivePlan = false,
  demo = false,
}: DentalChartProps) {
  const qc = useQueryClient();
  // Demo mode is ONLY the explicit prop. Previously this was inferred from
  // patientId === "demo" with "demo" defaults, so <DentalChart patientId={realId} />
  // (no visitId) silently became a non-persisting demo chart — a data-loss trap.
  const isDemo = demo === true;
  const missingPatient = !isDemo && !patientId;

  // ── UI state ───────────────────────────────────────────────────────────────
  const [internalEntries, setInternalEntries] = useState<ChartEntry[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [dentition, setDentition] = useState<"permanent" | "primary">(
    "permanent",
  );
  const [drawerTooth, setDrawerTooth] = useState<number | null>(null);
  const [showCond, setShowCond] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<ChartEntry | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<Record<Layer, boolean>>({
    EXISTING: true,
    PLANNED: true,
    IN_PROGRESS: true,
    COMPLETED: true,
    INACTIVE: true,
    CONDITION: true,
    RESOLVED: true,
  });

  // ── Staff / provider resolution ────────────────────────────────────────────
  const { data: dentists = [] } = useQuery({
    queryKey: ["dentists"],
    queryFn: staffApi.getDentists,
    staleTime: 60_000,
  });
  const dentistMap = useMemo(() => {
    const m = new Map<string, any>();
    (dentists as any[]).forEach((d) => m.set(d.id, d));
    return m;
  }, [dentists]);
  const resolveProvider = useCallback(
    (id?: string | null) => {
      if (!id) return "—";
      const d = dentistMap.get(id);
      return d ? `Dr. ${d.firstName} ${d.lastName}` : id;
    },
    [dentistMap],
  );
  const currentDentistName = useMemo(() => {
    const d = dentistId ? dentistMap.get(dentistId) : null;
    return d ? `Dr.  ${d.firstName} ${d.lastName}` : "Dr. —";
  }, [dentistId, dentistMap]);

  // ── Remote data queries ────────────────────────────────────────────────────
  const {
    data: apiEntries = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["chart-entries", patientId, visitId],
    queryFn: () => chartEntriesApi.getPatientEntries(patientId!, visitId),
    enabled: !isDemo && !!patientId,
    staleTime: 30_000, // ← stops focus-event cascade
  });

  const {
    data: txProcs = [],
    error: procError,
    refetch: refetchProcs,
  } = useQuery({
    queryKey: ["treatment-procedures", patientId],
    queryFn: () => treatmentProceduresApi.getPatientProcedures(patientId!),
    enabled: !isDemo && !!patientId,
    staleTime: 30_000,
  });

  // ── Chart-entries API → ChartEntry ────────────────────────────────────────
  const apiAsEntries = useMemo<ChartEntry[]>(() => {
    return (apiEntries as APIChartEntry[])
      .map((e): ChartEntry | null => {
        const t = e.toothNumber || 0;
        if (!t || !isValidFdi(t)) return null;
        const prov =
          (e as any).provider?.id ??
          (e as any).patientCondition?.provider?.id ??
          (typeof (e as any).providerId === "string"
            ? (e as any).providerId
            : undefined);
        const tp = (e as any).treatmentProcedure;
        // Drop entries whose linked procedure is cancelled / terminal so a
        // cancelled treatment never paints the tooth. CONDITION and EXISTING
        // entries carry no linked procedure (tp undefined) and are unaffected.
        if (tp?.status && !RENDERABLE_PROC_STATUS.has(tp.status)) return null;
        const presenceEffect =
          ((e as any).condition?.chartPresenceEffect as
            | ChartEntry["chartPresenceEffect"]
            | undefined) ??
          ((e as any).patientCondition?.condition?.chartPresenceEffect as
            | ChartEntry["chartPresenceEffect"]
            | undefined);

        // isImplant: prefer catalog flag, then ADA code, then label
        const procIsImplant: boolean =
          tp?.procedure?.isImplant === true ||
          (tp?.procedure?.code &&
            IMPLANT_ADA_CODES.has(String(tp.procedure.code).toUpperCase())) ||
          false;

        return {
          id: e.id,
          toothNumbers: [t],
          surfaces: (e.surfaces || []).map((s) => canonicalToUi(s as string)),
          type: e.type as ChartEntry["type"],
          status: e.status as EntryStatus,
          label: e.label,
          code: e.conditionCode || e.procedureCode,
          notes: e.notes,
          date: toLocalISODate(e.createdAt),
          provider: prov,
          patientConditionId:
            (e as any).patientConditionId ?? (e as any).patientCondition?.id,
          conditionId:
            (e as any).conditionId ?? (e as any).patientCondition?.conditionId,
          severity: ((e as any).patientCondition?.severity ?? "") as any,
          conditionStatus: ((e as any).patientCondition?.status ??
            "ACTIVE") as PatientConditionStatus,
          chartPresenceEffect: presenceEffect,
          treatmentProcedureId: (e as any).treatmentProcedureId ?? tp?.id,
          treatmentPlanId: tp?.treatmentPlanId,
          procedureStatus: tp?.status,
          totalPrice:
            tp?.totalPrice != null ? Number(tp.totalPrice) : undefined,
          currency: tp?.currency,
          isImplant: procIsImplant,
          sessionsCount: (tp as any)?.sessions?.length ?? 0,
          version: (e as any).version,
        };
      })
      .filter((e): e is ChartEntry => e !== null);
  }, [apiEntries]);

  // ── TreatmentProcedures → ChartEntry, one row per tooth target ────────────
  const procAsEntries = useMemo<ChartEntry[]>(() => {
    return (txProcs as TreatmentProcedure[]).flatMap((p): ChartEntry[] => {
      // Never paint the chart for a cancelled / terminal procedure. The API
      // already filters these out, but the chart must not rely on that —
      // otherwise a CANCELLED status falls through to the PLANNED branch below
      // and incorrectly renders the tooth red as active planned work.
      if (!RENDERABLE_PROC_STATUS.has(p.status)) return [];
      const targets = (p.targets ?? []).filter(
        (t) => !!t?.toothNumber && isValidFdi(t.toothNumber),
      );
      if (targets.length === 0) return [];
      // Only a COMPLETED procedure is type COMPLETED. IN_PROGRESS / ON_HOLD /
      // PENDING / REFERRED stay type PLANNED (matching the persisted chart entry,
      // which is not superseded to COMPLETED until a session completes) and are
      // refined to their own visual layer by layerForEntry via procedureStatus.
      // This also keeps this derived row's type identical to the persisted row's,
      // so the two merge into one instead of a duplicate PLANNED + COMPLETED pair.
      const type: ChartEntry["type"] =
        p.status === "COMPLETED" ? "COMPLETED" : "PLANNED";
      const date = toLocalISODate(p.createdAt);

      // isImplant from catalog flag, then ADA code, then a NARROWED label match
      // (isImplantEntry excludes "consultation"/"evaluation"/"removal" etc. so a
      // planned implant consult doesn't render the tooth as a placed fixture, M4).
      const implantFlag: boolean = isImplantEntry({
        isImplant: (p as any).procedure?.isImplant === true,
        code: p.procedure?.code,
        label: p.procedure?.name ?? "",
      });

      return targets.map((tgt) => ({
        id: `${DERIVED_PROC_ID_PREFIX}${p.id}-t${tgt.toothNumber}`,
        toothNumbers: [tgt.toothNumber],
        surfaces: (tgt.surfaces || []).map((s) => canonicalToUi(s as string)),
        type,
        status: "ACTIVE",
        label: p.procedure?.name || "Procedure",
        code: p.procedure?.code,
        notes: p.notes,
        date,
        provider: p.providerId || undefined,
        treatmentProcedureId: p.id,
        treatmentPlanId: p.treatmentPlanId,
        procedureStatus: p.status,
        totalPrice: p.totalPrice,
        currency: p.currency,
        isImplant: implantFlag,
        sessionsCount: (p as any)?.sessions?.length ?? 0,
      }));
    });
  }, [txProcs]);

  // ── O(n) dedup: prefer the row with richer procedure metadata ─────────────
  const entries = useMemo<ChartEntry[]>(() => {
    if (isDemo) return internalEntries;
    return mergeChartEntries([...apiAsEntries, ...procAsEntries]);
  }, [isDemo, internalEntries, apiAsEntries, procAsEntries]);

  // ── Per-tooth entry index ──────────────────────────────────────────────────
  const toothMap = useMemo(() => {
    const m = new Map<number, ChartEntry[]>();
    entries.forEach((e) =>
      e.toothNumbers.forEach((t) => {
        const a = m.get(t) ?? [];
        a.push(e);
        m.set(t, a);
      }),
    );
    return m;
  }, [entries]);

  const getEntries = useCallback(
    (n: number) => toothMap.get(n) ?? EMPTY_ENTRIES,
    [toothMap],
  );

  // ── Ordered tooth list (for shift-click range selection) ──────────────────
  const orderedTeeth = useMemo<number[]>(() => {
    const rws = dentition === "permanent" ? ARCH.permanent : ARCH.primary;
    return [...rws.upper, ...rws.lower];
  }, [dentition]);

  // ── Selection handlers ─────────────────────────────────────────────────────
  const handleToothClick = useCallback(
    (n: number, mods: { ctrl: boolean; shift: boolean }) => {
      if (mods.shift) {
        const start = anchor ?? n;
        const i = orderedTeeth.indexOf(start),
          j = orderedTeeth.indexOf(n);
        if (i === -1 || j === -1) {
          setSelected([n]);
          setAnchor(n);
          return;
        }
        const [lo, hi] = i <= j ? [i, j] : [j, i];
        setSelected(orderedTeeth.slice(lo, hi + 1));
        return;
      }
      if (mods.ctrl) {
        setSelected((prev) =>
          prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
        );
        setAnchor(n);
        return;
      }
      setSelected([n]);
      setAnchor(n);
    },
    [anchor, orderedTeeth],
  );

  /**
   * Surface click:
   *  · Modifier held → delegate to tooth-click (multi-select).
   *  · Plain click   → exclusive single-tooth select + open drawer.
   */
  const handleSurfaceClick = useCallback(
    (n: number, _s: UiSurface, mods: { ctrl: boolean; shift: boolean }) => {
      if (mods.ctrl || mods.shift) {
        handleToothClick(n, mods);
        return;
      }
      setSelected([n]);
      setAnchor(n);
      setDrawerTooth(n);
    },
    [handleToothClick],
  );

  const selectQuadrant = (q: number) => {
    const all = [
      ...ARCH.permanent.upper,
      ...ARCH.permanent.lower,
      ...ARCH.primary.upper,
      ...ARCH.primary.lower,
    ];
    const teeth = all.filter((t) => getQuadrant(t) === q);
    setSelected(teeth);
    setAnchor(teeth[0] ?? null);
  };
  const selectArch = (a: "U" | "L") => {
    const rws = dentition === "permanent" ? ARCH.permanent : ARCH.primary;
    const teeth = a === "U" ? rws.upper : rws.lower;
    setSelected(teeth);
    setAnchor(teeth[0] ?? null);
  };

  // ── Surface → canonical ───────────────────────────────────────────────────
  const toCanonical = useCallback(
    (ui: string[], fdi: number): CanonicalSurface[] =>
      ui.map((s) => uiToCanonical(s as UiSurface, fdi)).filter(Boolean),
    [],
  );

  // ── Add condition ─────────────────────────────────────────────────────────
  // IMPORTANT: this handler must THROW on any failure. AddConditionDialog only
  // closes / toasts success when onSubmit resolves; if we swallowed errors and
  // returned normally, a failed save (network, validation, FK error) would look
  // successful and the dialog would close with nothing recorded — silent
  // clinical data loss (B1). Errors propagate to the dialog, which surfaces them
  // and keeps itself open. The dialog also owns the success toast, so we no
  // longer toast here (it previously double-toasted). This mirrors the
  // throw-on-failure contract handleEditCondition already follows.
  const handleAddCondition = useCallback(
    async (data: AddConditionSubmitData) => {
      if (isDemo) {
        setInternalEntries((prev) => [
          ...prev,
          {
            id: `e${Date.now()}`,
            toothNumbers: data.toothNumbers,
            surfaces: data.surfaces as UiSurface[],
            type: "CONDITION",
            status: "ACTIVE",
            label: data.label,
            code: data.code,
            notes: data.notes,
            date: data.diagnosedAt ?? toLocalISODate(),
            provider: resolveProvider(data.diagnosedBy) || currentDentistName,
            conditionStatus: data.status as PatientConditionStatus,
          },
        ]);
        return;
      }
      if (!data.conditionId) throw new Error("Condition ID is required");
      const teeth = data.toothNumbers;
      if (!teeth.length) throw new Error("Select at least one tooth");
      const condEntries: CreatePatientConditionDto[] = teeth.map((fdi) => ({
        patientId,
        visitId,
        conditionId: data.conditionId!,
        toothNumber: fdi,
        surfaces: toCanonical(data.surfaces, fdi),
        severity: data.severity as any,
        notes: data.notes,
        diagnosedBy: data.diagnosedBy ?? dentistId,
        providerId: data.diagnosedBy ?? dentistId,
        diagnosedAt: data.diagnosedAt,
        status: data.status,
      }));
      const chartEntries = teeth.map((fdi) => ({
        patientId,
        visitId,
        toothNumber: fdi,
        surfaces: toCanonical(data.surfaces, fdi),
        label: data.label,
        conditionCode: data.code,
        conditionId: data.conditionId,
        notes: data.notes,
        providerId: data.diagnosedBy ?? dentistId,
        diagnosedAt: data.diagnosedAt,
      }));
      // Any rejection here propagates to the dialog (no catch) — fail loud.
      // I1: generate a fresh Idempotency-Key per submit. If the user
      // double-clicks Save, the second click sends the same key and the
      // server replays the original 201 instead of creating a duplicate
      // PatientCondition + ChartEntry.
      await conditionsApi.createPatientConditionsBatch(
        { entries: condEntries, chartEntries },
        newIdempotencyKey(),
      );
      qc.invalidateQueries({ queryKey: ["chart-entries", patientId, visitId] });
      qc.invalidateQueries({ queryKey: ["patient-conditions", patientId] });
    },
    [
      isDemo,
      patientId,
      visitId,
      dentistId,
      qc,
      resolveProvider,
      currentDentistName,
      toCanonical,
    ],
  );

  // ── Edit condition ────────────────────────────────────────────────────────
  const handleEditCondition = useCallback(
    async (data: EditConditionSubmitData) => {
      if (isDemo) {
        setInternalEntries((prev) =>
          prev.map((e) =>
            e.id !== data.chartEntryId
              ? e
              : {
                  ...e,
                  label: data.label,
                  code: data.code,
                  surfaces: data.surfaces as UiSurface[],
                  notes: data.notes,
                  date: data.diagnosedAt ?? e.date,
                  provider:
                    data.providerId ??
                    data.diagnosedBy ??
                    e.provider ??
                    currentDentistName,
                  conditionStatus: data.status as PatientConditionStatus,
                },
          ),
        );
        toast.success("Condition updated in demo chart");
        return;
      }
      try {
        const teeth = data.toothNumbers;
        const prov = data.providerId ?? data.diagnosedBy ?? dentistId;
        if (data.patientConditionId) {
          const fdi0 = teeth[0];
          const canonical0 = toCanonical(data.surfaces, fdi0);
          const chartEntries = teeth.map((fdi) => ({
            patientId,
            visitId,
            toothNumber: fdi,
            surfaces: toCanonical(data.surfaces, fdi),
            label: data.label,
            conditionCode: data.code,
            conditionId: data.conditionId,
            notes: data.notes,
            providerId: prov,
          }));
          // OL-1: pull the current PC.version from the patient-conditions
          // cache so the server's optimistic-lock check has a token. If the
          // cache is empty (e.g. entry opened before any PC fetch), fall back
          // to legacy last-write-wins by omitting expectedVersion.
          const pcRows =
            (qc.getQueryData(['patient-conditions', patientId]) as any[]) ?? [];
          const currentPc = pcRows.find(
            (r: any) => r?.id === data.patientConditionId,
          );
          const expectedVersion =
            typeof currentPc?.version === 'number' ? currentPc.version : undefined;

          // I1: generate a fresh Idempotency-Key per submit. Double-click
          // retry → server replays the original 200, no duplicate
          // supersede pass / no duplicate ChartEntry rows.
          await conditionsApi.updatePatientConditionWithChartEntries(
            {
              patientConditionId: data.patientConditionId,
              update: {
                conditionId: data.conditionId,
                toothNumber: fdi0,
                surfaces: canonical0,
                severity: data.severity as any,
                notes: data.notes,
                diagnosedBy: prov,
                providerId: prov,
                diagnosedAt: data.diagnosedAt ?? undefined,
                status: data.status,
                editReason: data.editReason,
                expectedVersion,
              },
              chartEntries,
            },
            newIdempotencyKey(),
          );
        } else {
          // Fallback for a bare CONDITION chart entry not linked to a
          // PatientCondition (legacy / migrated data). There is no single
          // atomic endpoint for this shape, so order the writes fail-safe:
          // create the replacement entries FIRST and only supersede the
          // original once they have all succeeded. A mid-flight failure then
          // leaves the original ACTIVE (a recoverable duplicate at worst)
          // instead of deleting the entry with no replacement.
          await Promise.all(
            teeth.map((fdi) =>
              chartEntriesApi.createChartEntry({
                patientId,
                visitId,
                toothNumber: fdi,
                surfaces: toCanonical(data.surfaces, fdi),
                type: "CONDITION",
                label: data.label,
                conditionCode: data.code,
                conditionId: data.conditionId,
                notes: data.notes,
                providerId: prov,
              }),
            ),
          );
          await chartEntriesApi.supersedeEntry(data.chartEntryId);
        }
        await Promise.all([
          qc.invalidateQueries({
            queryKey: ["chart-entries", patientId, visitId],
          }),
          qc.invalidateQueries({ queryKey: ["patient-conditions", patientId] }),
        ]);
        toast.success("Condition updated");
      } catch (e: any) {
        // OL-1: surface 409s distinctly — the user must re-fetch, re-merge,
        // and re-submit. Don't close the dialog (mirrors the delete-failure
        // branch below — H1).
        const status = e?.response?.status;
        if (status === 409) {
          const currentVersion = e?.response?.data?.currentVersion;
          toast.error(
            currentVersion != null
              ? `This condition was modified by another user (version ${currentVersion}). Reload and try again.`
              : "This condition was modified by another user. Reload and try again.",
          );
          // Force the chart queries to re-fetch so the form re-binds to the
          // server's current version on next open.
          qc.invalidateQueries({ queryKey: ["patient-conditions", patientId] });
          qc.invalidateQueries({ queryKey: ["chart-entries", patientId, visitId] });
          throw e;
        }
        toast.error(e?.response?.data?.message || "Failed to update condition");
        throw e;
      }
    },
    [
      isDemo,
      patientId,
      visitId,
      dentistId,
      qc,
      currentDentistName,
      toCanonical,
    ],
  );

  // ── Delete condition — uses modal, not window.prompt ──────────────────────
  const handleDeleteConditionClick = useCallback(
    async (entry: ChartEntry) => {
      if (isDemo) {
        setInternalEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id ? { ...e, status: "VOIDED" as const } : e,
          ),
        );
        toast.success("Condition removed (demo)");
        return;
      }
      if (!entry.patientConditionId) {
        toast.error("This chart entry isn't linked to a patient condition.");
        return;
      }
      setDeleteEntry(entry);
    },
    [isDemo],
  );

  const handleDeleteConfirm = useCallback(
    async (reason: string) => {
      if (!deleteEntry?.patientConditionId) return;
      try {
        await conditionsApi.deletePatientCondition(
          deleteEntry.patientConditionId,
          { reason },
        );
        await Promise.all([
          qc.invalidateQueries({
            queryKey: ["chart-entries", patientId, visitId],
          }),
          qc.invalidateQueries({ queryKey: ["patient-conditions", patientId] }),
        ]);
        toast.success("Condition deleted");
        setDeleteEntry(null);
      } catch (e: any) {
        // Don't close the modal — surface the failure so the clinician knows the
        // record was NOT deleted (H1). DeleteConfirmModal resets its own loading
        // state in finally, so the Delete button becomes clickable again.
        toast.error(e?.response?.data?.message || "Failed to delete condition");
      }
    },
    [deleteEntry, patientId, visitId, qc],
  );

  // ── Stats for layer badge counts ──────────────────────────────────────────
  // Counted by derived layer (layerForEntry), so IN_PROGRESS and on-hold/referred
  // work tally under their own badges instead of inflating COMPLETED / PLANNED.
  const stats = useMemo<Record<Layer, number>>(() => {
    const counts: Record<Layer, number> = {
      CONDITION: 0,
      EXISTING: 0,
      PLANNED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      INACTIVE: 0,
      RESOLVED: 0,
    };
    for (const e of entries) {
      // Resolved conditions have status=RESOLVED, others have status=ACTIVE
      if (e.status === "ACTIVE") {
        if (!isLiveConditionEntry(e)) continue;
        counts[layerForEntry(e)]++;
      } else if (e.status === "RESOLVED" && e.type === "CONDITION") {
        counts.RESOLVED++;
      }
    }
    return counts;
  }, [entries]);

  // ── Arch renderer ─────────────────────────────────────────────────────────
  const rws = dentition === "permanent" ? ARCH.permanent : ARCH.primary;

  const renderArch = (teeth: number[], isUpper: boolean) => (
    <div style={{ textAlign: "left" }}>
      {" "}
      {/* ← add this */}
      <div style={{ display: "flex", justifyContent: "flex-start", gap: 10 }}>
        {teeth.map((t) => (
          <div key={t} style={{ width: 54, flexShrink: 0 }}>
            <ToothSVG
              fdi={t}
              isUpper={isUpper}
              entries={getEntries(t)}
              selected={selected.includes(t)}
              visibleLayers={visibleLayers}
              onClick={handleToothClick}
              onSurfaceClick={handleSurfaceClick}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          gap: 13,
          margin: "4px 0",
        }}
      >
        {/* <div style={{ display: "flex", justifyContent: "center", gap: 10, margin: "4px 0" }}> */}
        {teeth.map((t) => (
          <span
            key={t}
            style={{
              width: 52,
              textAlign: "center",
              fontSize: 11,
              fontFamily: "monospace",
              color: selected.includes(t) ? "#2563eb" : "#94a3b8",
              fontWeight: selected.includes(t) ? 700 : 400,
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );

  // ── Button styles ─────────────────────────────────────────────────────────
  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: "5px 13px",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    borderRadius: 6,
    border: `1px solid ${active ? "#2563eb" : "#e2e8f0"}`,
    background: active ? "#eff6ff" : "#fff",
    color: active ? "#1d4ed8" : "#64748b",
    cursor: "pointer",
    transition: "all 0.12s",
  });

  const actionBtn = (
    label: string,
    borderColor: string,
    bg: string,
    color: string,
    onClick: () => void,
    size: "sm" | "md" = "md",
  ) => (
    <button
      onClick={onClick}
      style={{
        padding: size === "sm" ? "3px 11px" : "5px 14px",
        fontSize: size === "sm" ? 11 : 12,
        fontWeight: 600,
        borderRadius: 6,
        border: `1px solid ${borderColor}`,
        background: bg,
        color,
        cursor: "pointer",
        transition: "opacity 0.12s",
      }}
    >
      {label}
    </button>
  );

  // ── Guard: a real (non-demo) chart needs a patient ─────────────────────────
  // Surfaces a clear error instead of silently rendering an empty, non-persisting
  // chart when patientId wasn't supplied.
  if (missingPatient)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: 420,
          gap: 12,
        }}
      >
        <AlertCircle size={28} color="#dc2626" />
        <span style={{ color: "#dc2626", fontSize: 14 }}>
          No patient selected — cannot load the dental chart.
        </span>
        <span style={{ color: "#94a3b8", fontSize: 12 }}>
          Pass a <code>patientId</code>, or render with <code>demo</code> for a
          sandbox chart.
        </span>
      </div>
    );

  // ── Loading / error states ─────────────────────────────────────────────────
  if (isLoading && !isDemo)
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: 420,
          gap: 10,
        }}
      >
        <Loader2
          size={26}
          style={{ animation: "spin 1s linear infinite", color: "#2563eb" }}
        />
        <span style={{ color: "#64748b", fontSize: 14 }}>
          Loading dental chart…
        </span>
      </div>
    );

  if (error && !isDemo)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: 420,
          gap: 12,
        }}
      >
        <AlertCircle size={28} color="#dc2626" />
        <span style={{ color: "#dc2626", fontSize: 14 }}>
          Failed to load dental chart
        </span>
        <button
          onClick={() => refetch()}
          style={{
            padding: "7px 16px",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: "6px 10px",
        width: "100%", // ← expand to parent width
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          padding: "6px 14px",
          background: "#fff",
          borderBottom: "1px solid #e2e8f0",
          minHeight: 48,
        }}
      >
        {!readOnly && (
          <div style={{ display: "flex", gap: 7 }}>
            {actionBtn("+ Condition", "#fca5a5", "#fff5f5", "#b91c1c", () => {
              if (!selected.length)
                setSelected([dentition === "permanent" ? 11 : 51]);
              setShowCond(true);
            })}
            {actionBtn("+ Procedure", "#93c5fd", "#eff6ff", "#1d4ed8", () => {
              if (!selected.length)
                setSelected([dentition === "permanent" ? 11 : 51]);
              setShowTx(true);
            })}
          </div>
        )}
        {isDemo && (
          <button
            onClick={() => {
              setInternalEntries([]);
              toast.success("Demo chart cleared");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#64748b",
              cursor: "pointer",
            }}
          >
            <RefreshCcw size={13} /> Reset
          </button>
        )}

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 22,
            background: "#e2e8f0",
            margin: "0 4px",
          }}
        />

        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#94a3b8",
            letterSpacing: ".05em",
          }}
        >
          LAYERS
        </span>
        {(
          [
            "EXISTING",
            "PLANNED",
            "IN_PROGRESS",
            "COMPLETED",
            "INACTIVE",
            "CONDITION",
            "RESOLVED",
          ] as Layer[]
        ).map((l) => {
          const on = visibleLayers[l],
            lc = LAYER_COLOR[l];
          return (
            <button
              key={l}
              onClick={() => setVisibleLayers((p) => ({ ...p, [l]: !p[l] }))}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 12px",
                fontSize: 11,
                fontWeight: on ? 600 : 400,
                borderRadius: 6,
                border: `1.5px solid ${on ? lc.c : "#e2e8f0"}`,
                background: on ? lc.light : "#fff",
                color: on ? lc.text : "#94a3b8",
                opacity: on ? 1 : 0.55,
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: lc.c,
                }}
              />
              {lc.label}
              <span
                style={{ fontSize: 10, fontFamily: "monospace", opacity: 0.75 }}
              >
                {stats[l]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Dentition / arch / selection bar ── */}
      <div style={{ display: "flex", justifyContent: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 12, color: "#64748b" }}>Dentition</span>
        <button
          onClick={() => {
            setDentition("permanent");
            setSelected([]);
            setAnchor(null);
          }}
          style={segBtn(dentition === "permanent")}
        >
          Permanent
        </button>
        <button
          onClick={() => {
            setDentition("primary");
            setSelected([]);
            setAnchor(null);
          }}
          style={segBtn(dentition === "primary")}
        >
          Primary
        </button>

        <span
          style={{
            width: 1,
            height: 18,
            background: "#e2e8f0",
            margin: "0 2px",
          }}
        />

        {dentition === "permanent" &&
          [1, 2, 3, 4].map((q) => (
            <button
              key={q}
              onClick={() => selectQuadrant(q)}
              style={segBtn(false)}
            >
              Q{q}
            </button>
          ))}
        <button onClick={() => selectArch("U")} style={segBtn(false)}>
          Upper
        </button>
        <button onClick={() => selectArch("L")} style={segBtn(false)}>
          Lower
        </button>

        {selected.length > 0 && (
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12,
            }}
          >
            <span style={{ color: "#2563eb", fontWeight: 600 }}>
              {selected.length === 1
                ? `${selected[0]} — ${toothName(selected[0])}`
                : `${selected.length} teeth`}
            </span>
            {selected.length === 1 && (
              <button
                onClick={() => setDrawerTooth(selected[0])}
                style={{
                  padding: "3px 9px",
                  fontSize: 11,
                  borderRadius: 5,
                  border: "1px solid #bfdbfe",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  cursor: "pointer",
                }}
              >
                Details
              </button>
            )}
            {!readOnly && (
              <>
                {actionBtn(
                  "+ Cond.",
                  "#fca5a5",
                  "#fff5f5",
                  "#b91c1c",
                  () => setShowCond(true),
                  "sm",
                )}
                {actionBtn(
                  "+ Proc.",
                  "#93c5fd",
                  "#eff6ff",
                  "#1d4ed8",
                  () => setShowTx(true),
                  "sm",
                )}
              </>
            )}
            <button
              onClick={() => {
                setSelected([]);
                setAnchor(null);
              }}
              style={{
                padding: "3px 9px",
                fontSize: 11,
                borderRadius: 5,
                border: "1px solid #e2e8f0",
                background: "#fff",
                color: "#64748b",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </span>
        )}
      </div>

      {/* ── Chart canvas ── */}
      <div style={{ padding: 8, overflowX: "auto" }}>
        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: "6px 10px",
            width: "fit-content",
            minWidth: "100%",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between", // ← was "flex-start"
              padding: "6px 10px 0",
              fontSize: 10,
              fontWeight: 700,
              color: "#94a3b8",
              letterSpacing: ".07em",
              width: "70%",
            }}
          >
            <span>UPPER RIGHT</span>
            <span style={{ color: "#818cf8" }}>MAXILLA</span>
            <span>UPPER LEFT</span>
          </div>

          {renderArch(rws.upper, true)}

          <div
            style={{ display: "flex", alignItems: "center", margin: "4px 3px" }}
          >
            <div style={{ flex: 1, borderTop: "1.5px dashed #e2e8f0" }} />
            <span
              style={{
                margin: "0 14px",
                padding: "3px 14px",
                background: "#f8fafc",
                borderRadius: 5,
                fontSize: 10,
                color: "#94a3b8",
                fontWeight: 700,
                letterSpacing: ".06em",
              }}
            >
              OCCLUSAL PLANE
            </span>
            <div style={{ flex: 1, borderTop: "1.5px dashed #e2e8f0" }} />
          </div>

          {renderArch(rws.lower, false)}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between", // ← was "flex-start"
              padding: "6px 10px 0",
              fontSize: 10,
              fontWeight: 700,
              color: "#94a3b8",
              letterSpacing: ".07em",
              width: "70%",
            }}
          >
            <span>LOWER RIGHT</span>
            <span style={{ color: "#818cf8" }}>MANDIBLE</span>
            <span>LOWER LEFT</span>
          </div>
        </div>

        {/* Presence legend */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            padding: "8px 14px",
            marginTop: 6,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            fontSize: 11,
            color: "#475569",
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#94a3b8",
              letterSpacing: ".07em",
            }}
          >
            TOOTH STATE
          </span>
          {PRESENCE_LEGEND.map((item) => (
            <span
              key={item.key}
              style={{ display: "flex", alignItems: "center", gap: 5 }}
              title={item.label}
            >
              {item.swatch}
              <span style={{ fontWeight: 500 }}>{item.label}</span>
            </span>
          ))}
          <div style={{ width: 1, height: 20, background: "#e2e8f0" }} />
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#94a3b8",
              letterSpacing: ".07em",
            }}
          >
            RESTORATIONS
          </span>
          {RESTORATION_LEGEND.map((item) => (
            <span
              key={item.key}
              style={{ display: "flex", alignItems: "center", gap: 5 }}
              title={item.label}
            >
              {item.swatch}
              <span style={{ fontWeight: 500 }}>{item.label}</span>
            </span>
          ))}
          <div style={{ width: 1, height: 20, background: "#e2e8f0" }} />
          <span
            style={{ display: "flex", alignItems: "center", gap: 5 }}
            title="Both an active condition and treatment on the same surface"
          >
            <svg width={18} height={18} viewBox="0 0 18 18">
              <defs>
                <pattern
                  id="legend-hatch"
                  width={8}
                  height={8}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width={8} height={8} fill={LAYER_COLOR.CONDITION.c} />
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={8}
                    stroke={LAYER_COLOR.PLANNED.c}
                    strokeWidth={5}
                  />
                </pattern>
              </defs>
              <rect
                x={1.5}
                y={1.5}
                width={15}
                height={15}
                rx={3}
                fill="url(#legend-hatch)"
                stroke={LAYER_COLOR.CONDITION.c}
                strokeWidth={0.8}
              />
            </svg>
            <span style={{ fontWeight: 500 }}>Condition + treatment</span>
          </span>
        </div>
      </div>

      {/* ── Treatment-procedures load failure (non-blocking) ── */}
      {/* The chart-entries query succeeded (we're past its error guard), but the
          treatment-procedures query failed — without this, every planned /
          in-progress / completed procedure silently vanishes while the chart
          looks fine (H2). Surface it with a retry instead of hiding the gap. */}
      {procError && !isDemo && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            margin: "0 8px 8px",
            padding: "8px 14px",
            borderRadius: 8,
            background: "#fef3c7",
            border: "1px solid #fde68a",
          }}
        >
          <AlertCircle size={15} color="#d97706" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "#92400e" }}>
            Couldn't load treatment procedures — planned, in-progress and
            completed work may be missing from the chart and ledger below.
          </span>
          <button
            onClick={() => refetchProcs()}
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              border: "1px solid #d97706",
              background: "#fff",
              color: "#b45309",
              cursor: "pointer",
            }}
          >
            <RefreshCcw size={13} /> Retry
          </button>
        </div>
      )}

      {/* ── Split ledger ── */}
      <SplitLedger
        entries={entries}
        selectedTeeth={selected}
        onRowClick={(teeth) => {
          setSelected(teeth);
          setAnchor(teeth[0] ?? null);
        }}
      />

      {/* ── Dialogs & drawers ── */}
      <ToothDetailDrawer
        toothNumber={drawerTooth}
        entries={entries}
        onClose={() => setDrawerTooth(null)}
        defaultDentistId={dentistId}
        patientId={patientId}
        visitId={visitId}
        onEditConditionSubmit={handleEditCondition}
        onDeleteConditionClick={handleDeleteConditionClick}
        resolveProvider={resolveProvider}
      />

      {showCond && (
        <AddConditionDialog
          isOpen={showCond}
          onClose={() => setShowCond(false)}
          selectedTeeth={selected}
          defaultDentistId={dentistId}
          onSubmit={handleAddCondition}
        />
      )}

      {showTx && (
        <AddTreatmentDialog
          isOpen={showTx}
          onClose={() => setShowTx(false)}
          selectedTeeth={selected}
          patientId={patientId}
          visitId={visitId}
          dentistId={dentistId}
          hasActivePlan={hasActivePlan}
          onSuccess={() => {
            if (!isDemo) {
              qc.invalidateQueries({
                queryKey: ["chart-entries", patientId, visitId],
              });
              qc.invalidateQueries({
                queryKey: ["treatment-procedures", patientId],
              });
            }
          }}
        />
      )}

      <DeleteConfirmModal
        isOpen={deleteEntry !== null}
        entry={deleteEntry}
        resolveProvider={resolveProvider}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteEntry(null)}
      />

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/**
 * Public entry point — wraps the chart in {@link ChartErrorBoundary} so a
 * single malformed entry that throws inside ToothSVG can never take down the
 * surrounding visit page. The fallback offers a "Reload chart" recovery.
 */
export function DentalChart(props: DentalChartProps) {
  return (
    <ChartErrorBoundary>
      <DentalChartInner {...props} />
    </ChartErrorBoundary>
  );
}

export default DentalChart;
