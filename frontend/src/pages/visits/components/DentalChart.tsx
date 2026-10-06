// Patient odontogram: anatomical facial views, interactive surfaces and clinical ledger.
// Patient IDs and canonical surfaces remain FDI regardless of display notation.

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
  Eye,
  Plus,
  MousePointer2,
  ZoomIn,
  ZoomOut,
  Layers,
  ChevronDown,
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
import {
  EditConditionDialog,
  type EditConditionInitialData,
  type EditConditionSubmitData,
} from "./EditConditionDialog";
import {
  EditProcedureDialog,
  type EditProcedureInitialData,
} from "./EditProcedureDialog";
import { staffApi } from "../../../lib/api/staff-api";
import { toast } from "sonner";
import {
  ARCH,
  isValidFdi,
  toothKind,
  getQuadrant,
  toothName,
  uiToCanonical,
  canonicalToUiForTooth,
  sortUiSurfaces,
  surfaceLabel,
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
  DERIVED_PROC_ID_PREFIX,
  RENDERABLE_PROC_STATUS,
  LAYER_PAINT_PRIORITY,
  highestPriorityEntry,
  pickRestoration,
  restorationKind,
  groupLedgerProcedureRows,
  hiddenDentitionCount,
  allEntriesPrimary,
  type ChartEntry,
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
import { ToothAnatomy } from "./ToothAnatomy";
import { occlusalGeometry, OCC_VIEW } from "./occlusalGeometry";
import { displayToothNumber, type ToothNumbering } from "./dentalChartDisplay";
import { toChartEntry } from "./chartEntryMapping";
import "./DentalChart.css";

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

const ToothSVG = React.memo(function ToothSVG({
  fdi,
  isUpper,
  entries,
  selected,
  visibleLayers,
  onClick,
  onSurfaceClick,
  selectedSurfaces,
}: {
  fdi: number;
  isUpper: boolean;
  entries: ChartEntry[];
  selected: boolean;
  selectedSurfaces: UiSurface[];
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
  // Anatomical occlusal outline (see occlusalGeometry). The five clickable
  // zones follow the crown: a central occlusal table / incisal edge plus four
  // wedges cut from the ring between that table and the outline. Mesial faces
  // the midline and buccal faces the facial row, per quadrant.
  const g = occlusalGeometry(fdi, isUpper);
  const W = OCC_VIEW;
  const cx = W / 2,
    cm = W / 2;
  const { l: cl, r: cr, t: ct, b: cb } = g.box;
  const crown = g.outline;
  const buccalY = isUpper ? ct : cb;
  const svgId = React.useId().replace(/:/g, "");
  const zoneKey = (z: (typeof SURF_ZONES)[number]) =>
    (z === "O" ? centralKey : z) as UiSurface;

  // Full-coverage work paints the whole crown in its status colour (planned
  // red, completed blue, existing green …) so the occlusal and facial rows agree.
  const restorationEntry = restoration
    ? highestPriorityEntry(
        entries.filter(
          (e) =>
            e.status === "ACTIVE" &&
            e.type !== "CONDITION" &&
            visibleLayers[layerForEntry(e)] &&
            restorationKind(e) === restoration,
        ),
      )
    : null;
  const restColor = restorationEntry
    ? LAYER_COLOR[layerForEntry(restorationEntry)]
    : crownLayer
      ? LAYER_COLOR[crownLayer]
      : null;
  const fullCoverage =
    restoration === "CROWN" || restoration === "BRIDGE_RETAINER";

  const defs = (
    <defs>
      <radialGradient id={`enamel-${svgId}`} cx="42%" cy="38%" r="72%">
        <stop stopColor="#fffffb" />
        <stop offset=".6" stopColor="#f1f1e6" />
        <stop offset="1" stopColor="#cdd3c5" />
      </radialGradient>
      <radialGradient id={`table-${svgId}`} r="60%">
        <stop stopColor="#d6d1b9" stopOpacity=".8" />
        <stop offset="1" stopColor="#ebe8d8" stopOpacity="0" />
      </radialGradient>
      {restColor && (
        <linearGradient id={`rest-${svgId}`} x1="0" x2="1" y1="0" y2="1">
          <stop stopColor={restColor.light} />
          <stop offset=".45" stopColor={restColor.c} stopOpacity=".78" />
          <stop offset="1" stopColor={restColor.c} />
        </linearGradient>
      )}
      <clipPath id={`crown-${svgId}`}>
        <path d={crown} />
      </clipPath>
      {(["B", "L", "M", "D"] as const).map((z) => (
        <clipPath key={z} id={`sec-${svgId}-${z}`}>
          <polygon points={g.sectors[z]} />
        </clipPath>
      ))}
      {SURF_ZONES.map((z) =>
        surfBoth(z) ? (
          // Thick diagonal hatch for a surface carrying BOTH an active
          // condition and treatment: condition fill with treatment stripes in
          // the treatment's own status colour, so neither layer is lost.
          <pattern
            key={`hx-${z}`}
            id={`hx-${svgId}-${z}`}
            width={7}
            height={7}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={7} height={7} fill={condColor[z]} />
            <line x1={0} y1={0} x2={0} y2={7} stroke={baseColor[z]} strokeWidth={4.5} />
          </pattern>
        ) : null,
      )}
    </defs>
  );

  // Crown body: enamel (or restoration) fill, occlusal-table shading, fissures.
  const anatomy = (fill: string, stroke: string, restored = false) => (
    <g pointerEvents="none">
      <path d={crown} fill={fill} stroke={stroke} strokeWidth={1} />
      {!restored && <path d={g.table} fill={`url(#table-${svgId})`} />}
      <path
        d={g.grooves}
        fill="none"
        stroke={restored ? "#ffffff" : "#a3977a"}
        strokeOpacity={restored ? 0.5 : 0.65}
        strokeWidth={0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <ellipse
        cx={cl + (cr - cl) * 0.34}
        cy={ct + (cb - ct) * 0.3}
        rx={(cr - cl) * 0.16}
        ry={(cb - ct) * 0.1}
        fill="#fff"
        fillOpacity={0.4}
        clipPath={`url(#crown-${svgId})`}
      />
    </g>
  );

  // Five clickable surface zones, painted per channel, plus labels/guides.
  const overlay = (outlineStroke: string, outlineWidth = 1) => (
    <>
      {SURF_ZONES.map((z) => {
        const both = surfBoth(z);
        const col = surfColor[z];
        const key = zoneKey(z);
        const zone = (
          <path
            d={z === "O" ? g.table : `${g.outline}${g.table}`}
            fillRule="evenodd"
            fill={both ? `url(#hx-${svgId}-${z})` : col || "transparent"}
            fillOpacity={col ? 0.9 : 0}
            stroke={col ? "#ffffff" : "none"}
            strokeWidth={col ? 0.8 : 0}
            strokeOpacity={0.75}
            className="dc-surface"
            data-painted={col ? "" : undefined}
            role="button"
            tabIndex={0}
            aria-label={`Tooth ${fdi}, ${surfaceLabel(uiToCanonical(key, fdi))}`}
            aria-pressed={selected && selectedSurfaces.includes(key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onSurfaceClick(fdi, key, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSurfaceClick(fdi, key, { ctrl: e.metaKey || e.ctrlKey, shift: e.shiftKey });
            }}
          />
        );
        return z === "O" ? (
          <React.Fragment key={z}>{zone}</React.Fragment>
        ) : (
          <g key={z} clipPath={`url(#sec-${svgId}-${z})`}>
            {zone}
          </g>
        );
      })}
      <path className="dc-zone-guides" d={g.guides} pointerEvents="none" />
      <path d={crown} fill="none" stroke={outlineStroke} strokeWidth={outlineWidth} pointerEvents="none" />
      {SURF_ZONES.map((z) => {
        if (!surfColor[z]) return null;
        const [lx, ly] = g.labels[z];
        return (
          <text
            key={z}
            x={lx}
            y={ly}
            className="dc-surface-label"
            textAnchor="middle"
            dominantBaseline="central"
            pointerEvents="none"
          >
            {zoneKey(z)}
          </text>
        );
      })}
    </>
  );

  // ── Restoration glyph overlay (M-1) ────────────────────────────────────────
  // Crowns are conveyed by the crown fill itself; the remaining kinds get a
  // clinically recognisable occlusal mark.
  const renderRestoration = (kind: RestorationKind): React.ReactNode => {
    const tone = restColor?.c ?? "#64748b";
    switch (kind) {
      case "BRIDGE_RETAINER":
        return (
          <path
            d={`M${cl - 7} ${cm}H${cl + 2}M${cr - 2} ${cm}H${cr + 7}`}
            stroke={tone}
            strokeWidth={3}
            strokeLinecap="round"
            pointerEvents="none"
          />
        );
      case "VENEER":
        // Facial laminate — shown on the buccal/labial band only.
        return (
          <g clipPath={`url(#sec-${svgId}-B)`} pointerEvents="none">
            <path
              d={`${crown}${g.table}`}
              fillRule="evenodd"
              fill="#f3e8ff"
              fillOpacity={0.8}
              stroke="#a855f7"
              strokeWidth={1.3}
            />
          </g>
        );
      case "DENTURE":
        return (
          <g pointerEvents="none" fill="none" stroke="#64748b" strokeWidth={1.6} strokeLinecap="round">
            <path d={`M${cl - 2} ${cm}Q${cl - 2} ${buccalY} ${cx - 5} ${buccalY}`} />
            <path d={`M${cr + 2} ${cm}Q${cr + 2} ${buccalY} ${cx + 5} ${buccalY}`} />
            <text x={cx} y={cm} className="dc-occlusal-tag" fill="#475569" stroke="none">
              PD
            </text>
          </g>
        );
      case "SEALANT":
        // Sealant fills the fissures, so trace them in teal.
        return (
          <path
            d={g.grooves}
            fill="none"
            stroke="#0d9488"
            strokeOpacity={0.85}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        );
      case "ORTHODONTIC": {
        const wireY = buccalY + (isUpper ? 5 : -5);
        return (
          <g pointerEvents="none">
            <line x1={-2} y1={wireY} x2={W + 2} y2={wireY} stroke="#475569" strokeWidth={1.4} />
            <rect x={cx - 5} y={wireY - 4} width={10} height={8} rx={1.5} fill="#e2e8f0" stroke="#334155" strokeWidth={1.1} />
          </g>
        );
      }
      default:
        return null;
    }
  };

  // ── Render body per presence ───────────────────────────────────────────────
  let bodyEl: React.ReactNode;

  if (presence === "EXTRACTED") {
    bodyEl = (
      <>
        <path
          d={crown}
          fill="#fef2f2"
          fillOpacity={0.5}
          stroke="#f2a7a7"
          strokeWidth={1}
          strokeDasharray="3 2.5"
        />
        <path
          d={`M${cl + 6} ${ct + 4}L${cr - 6} ${cb - 4}M${cr - 6} ${ct + 4}L${cl + 6} ${cb - 4}`}
          stroke="#dc2626"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </>
    );
  } else if (presence === "PONTIC") {
    // Bridge pontic — a suspended artificial tooth joined to its abutments.
    const tone = restColor?.c ?? "#b8860b";
    bodyEl = (
      <>
        <path
          d={`M${cl - 7} ${cm}H${cl + 2}M${cr - 2} ${cm}H${cr + 7}`}
          stroke={tone}
          strokeWidth={3.2}
          strokeLinecap="round"
        />
        {anatomy(restColor ? `url(#rest-${svgId})` : "#f3e9cf", tone, true)}
        {overlay(tone, 1.4)}
      </>
    );
  } else if (presence === "RETAINED_ROOT") {
    // Crown lost, root retained (K08.3): the root face with its canal.
    bodyEl = (
      <>
        <path d={crown} fill="none" stroke="#d6c7ab" strokeWidth={1} strokeDasharray="2.5 2" />
        <ellipse
          cx={cx}
          cy={cm}
          rx={(cr - cl) * 0.3}
          ry={(cb - ct) * 0.3}
          fill="#d8c3a0"
          stroke="#a98c5f"
          strokeWidth={1.2}
        />
        <circle cx={cx} cy={cm} r={2} fill="#8a6a3c" />
      </>
    );
  } else if (presence === "CONGENITAL") {
    bodyEl = (
      <>
        <path
          d={crown}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={1.1}
          strokeDasharray="2 2"
          transform={`translate(${cx} ${cm}) scale(.75) translate(${-cx} ${-cm})`}
        />
        <circle cx={cx} cy={cm} r={9} fill="none" stroke="#94a3b8" strokeWidth={1.5} />
        <line x1={cx - 7} y1={cm + 7} x2={cx + 7} y2={cm - 7} stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" />
      </>
    );
  } else if (presence === "UNERUPTED") {
    bodyEl = (
      <>
        <path d={crown} fill="#f5f3ff" stroke="#8b5cf6" strokeWidth={1.1} strokeDasharray="3.5 2.5" />
        <rect x={cx - 10} y={cm - 6.5} width={20} height={13} rx={3} fill="#7c3aed" fillOpacity={0.92} />
        <text x={cx} y={cm} className="dc-occlusal-tag" fill="#fff">
          UE
        </text>
        {ps.hasPlannedIntervention && <circle cx={cr - 3} cy={ct + 3} r={3.5} fill="#dc2626" />}
      </>
    );
  } else if (presence === "SUPERNUMERARY") {
    const fill = crownLayer ? LAYER_COLOR[crownLayer].light : `url(#enamel-${svgId})`;
    const stroke = crownLayer ? LAYER_COLOR[crownLayer].c : "#b5bcae";
    bodyEl = (
      <>
        {anatomy(fill, stroke)}
        {overlay(stroke)}
        {restoration && renderRestoration(restoration)}
        <g
          transform={`translate(${cr - 3} ${isUpper ? cb - 3 : ct + 3}) scale(.34) translate(${-cx} ${-cm})`}
          pointerEvents="none"
        >
          <path d={crown} fill="#fdf2f8" stroke="#db2777" strokeWidth={3.5} strokeDasharray="7 5" />
        </g>
        <circle cx={cr - 2} cy={ct + 2} r={6} fill="#db2777" stroke="#fff" strokeWidth={1.4} />
        <text x={cr - 2} y={ct + 2} className="dc-occlusal-tag dc-occlusal-tag--small" fill="#fff">
          +S
        </text>
      </>
    );
  } else if (presence === "IMPLANT") {
    // Occlusal view of an implant crown: screw-access channel over the
    // fixture. A PLANNED-only implant is ghosted and dashed, with the red
    // planned dot used for unerupted teeth, so it never reads as placed.
    const planned = ps.implantPlanned;
    const dash = planned ? "3 2" : undefined;
    bodyEl = (
      <g pointerEvents="none">
        <path
          d={crown}
          fill={planned ? "#f1f3f5" : "#dde1e5"}
          stroke={planned ? "#a3a9af" : "#7d848b"}
          strokeWidth={1.1}
          strokeDasharray={dash}
        />
        <circle cx={cx} cy={cm} r={7} fill={planned ? "none" : "#c3cad1"} stroke="#6b7280" strokeWidth={1.1} strokeDasharray={dash} />
        <path
          d={`M${cx + 3.4} ${cm}L${cx + 1.7} ${cm + 2.95}L${cx - 1.7} ${cm + 2.95}L${cx - 3.4} ${cm}L${cx - 1.7} ${cm - 2.95}L${cx + 1.7} ${cm - 2.95}Z`}
          fill={planned ? "#a3a9af" : "#4b5563"}
        />
        {planned && <circle cx={cr - 3} cy={ct + 3} r={3.5} fill="#dc2626" />}
      </g>
    );
  } else {
    // PRESENT — anatomical crown with clickable surfaces.
    const fill =
      fullCoverage && restColor
        ? `url(#rest-${svgId})`
        : crownLayer
          ? LAYER_COLOR[crownLayer].light
          : `url(#enamel-${svgId})`;
    const stroke =
      fullCoverage && restColor
        ? restColor.c
        : crownLayer
          ? LAYER_COLOR[crownLayer].c
          : "#b5bcae";
    bodyEl = (
      <>
        {anatomy(fill, stroke, fullCoverage && !!restColor)}
        {overlay(stroke, fullCoverage || crownLayer ? 1.4 : 1)}
        {restoration && renderRestoration(restoration)}
      </>
    );
  }

  return (
    <svg
      className="dc-occlusal"
      viewBox={`0 0 ${W} ${W}`}
      role="group"
      aria-label={`Tooth ${fdi} biting surfaces`}
      onClick={(e) =>
        onClick(fdi, { ctrl: e.metaKey || e.ctrlKey, shift: e.shiftKey })
      }
    >
      {defs}
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
  onViewCondition,
  onViewProcedure,
}: {
  entries: ChartEntry[];
  selectedTeeth: number[];
  onRowClick: (teeth: number[]) => void;
  onViewCondition?: (entry: ChartEntry) => void;
  onViewProcedure?: (entry: ChartEntry) => void;
}) {
  const [condFilter, setCondFilter] = useState<"ALL" | "ACTIVE" | "RESOLVED">("ALL");
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
          if (condFilter === "RESOLVED") return e.conditionStatus === "RESOLVED" || e.conditionStatus === "RULED_OUT";
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
  const procedureRows = useMemo(
    () => groupLedgerProcedureRows(procedures),
    [procedures],
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
                  "FDI tooth",
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
                      {entry.toothNumbers.length
                        ? entry.toothNumbers.join(", ")
                        : "Whole mouth"}
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
                      {entry.surfaces.length
                        ? sortUiSurfaces(entry.surfaces).join("")
                        : "—"}
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
                    {entry.type === "CONDITION" && onViewCondition && (
                      <td style={{ padding: "5px 4px", width: 30 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewCondition(entry);
                          }}
                          title="View condition details"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#64748b",
                            padding: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    )}
                    {entry.type !== "CONDITION" && onViewProcedure && (
                      <td style={{ padding: "5px 4px", width: 30 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewProcedure(entry);
                          }}
                          title="View procedure details"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#64748b",
                            padding: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    )}
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
        className="dc-ledger-columns"
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
              active={condFilter === "ALL"}
              color="#64748b"
              onClick={() => setCondFilter("ALL")}
              label="All"
            />
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
          </>,
        )}
        {renderCol(
          "Procedures",
          <ClipboardList size={14} />,
          LAYER_COLOR.PLANNED.c,
          // One row per procedure and layer (teeth joined, price once).
          procedureRows,
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
    label: "Crown (status colour)",
    swatch: (
      <svg width={30} height={18} viewBox="0 0 30 18">
        <rect x={1.5} y={2.5} width={12} height={13} rx={3.5} fill={LAYER_COLOR.COMPLETED.c} fillOpacity={0.85} stroke={LAYER_COLOR.COMPLETED.c} />
        <rect x={16.5} y={2.5} width={12} height={13} rx={3.5} fill={LAYER_COLOR.PLANNED.c} fillOpacity={0.85} stroke={LAYER_COLOR.PLANNED.c} />
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
        <path d="M5 10 L9 8.5 L13 10 M9 8.5 V5" fill="none" stroke="#0d9488" strokeWidth={2} strokeLinecap="round" />
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
  const [selectedSurfaces, setSelectedSurfaces] = useState<UiSurface[]>([]);
  const [numbering, setNumbering] = useState<ToothNumbering>("FDI");
  const [zoom, setZoom] = useState(100);
  const [ledgerSelectionOnly, setLedgerSelectionOnly] = useState(false);
  const [ledgerThisVisitOnly, setLedgerThisVisitOnly] = useState(false);
  const [dentition, setDentition] = useState<"permanent" | "primary">(
    "permanent",
  );
  // Set once the user picks a dentition, so the automatic switch below never
  // overrides a deliberate choice.
  const dentitionChosenRef = useRef(false);
  const [drawerTooth, setDrawerTooth] = useState<number | null>(null);
  const [viewingCondition, setViewingCondition] = useState<ChartEntry | null>(null);
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
    // The chart is the patient's mouth, not this visit's notes: load the FULL
    // history in every visit. Filtering by visitId hid every earlier
    // diagnosis, prior restoration and missing tooth at the next visit. The
    // ledger can still narrow to "This visit" (entries carry their visitId).
    queryKey: ["chart-entries", patientId],
    queryFn: () => chartEntriesApi.getPatientEntries(patientId!),
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

  // ── Chart-entries API → ChartEntry (pure mapper, unit-tested) ─────────────
  const apiAsEntries = useMemo<ChartEntry[]>(
    () =>
      (apiEntries as APIChartEntry[])
        .map((e) => toChartEntry(e as any))
        .filter((e): e is ChartEntry => e !== null),
    [apiEntries],
  );

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
        surfaces: (tgt.surfaces || []).map((s) =>
          canonicalToUiForTooth(s as string, tgt.toothNumber),
        ),
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

  // A child's chart (every live finding on primary teeth) opens on the
  // primary dentition — unless the user already chose one.
  useEffect(() => {
    if (dentitionChosenRef.current) return;
    if (dentition === "permanent" && allEntriesPrimary(entries)) {
      setDentition("primary");
    }
  }, [entries, dentition]);

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
      setSelectedSurfaces([]);
      setDrawerTooth(null);
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

  // Surface selection is local until the clinician submits the charting dialog.
  const handleSurfaceClick = useCallback(
    (n: number, surface: UiSurface, mods: { ctrl: boolean; shift: boolean }) => {
      if (mods.ctrl || mods.shift) {
        handleToothClick(n, mods);
        return;
      }
      setSelectedSurfaces(prev => selected.length === 1 && selected[0] === n
        ? (prev.includes(surface) ? prev.filter(s => s !== surface) : sortUiSurfaces([...prev, surface]))
        : [surface]);
      setSelected([n]);
      setAnchor(n);
      setDrawerTooth(null);
    },
    [handleToothClick, selected],
  );

  const clearSelection = () => {
    setSelected([]);
    setSelectedSurfaces([]);
    setAnchor(null);
    setDrawerTooth(null);
  };

  const selectQuadrant = (q: number) => {
    setSelectedSurfaces([]);
    setDrawerTooth(null);
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
    setSelectedSurfaces([]);
    setDrawerTooth(null);
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
      qc.invalidateQueries({ queryKey: ["chart-entries", patientId] });
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
            queryKey: ["chart-entries", patientId],
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
          qc.invalidateQueries({ queryKey: ["chart-entries", patientId] });
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

  // ── View condition detail (eye button in SplitLedger) ──────────────────────
  const conditionViewData = useMemo<EditConditionInitialData | null>(() => {
    if (!viewingCondition) return null;
    const rawProvider = viewingCondition.provider as unknown;
    const provId =
      rawProvider && typeof rawProvider === "object"
        ? (rawProvider as { id?: string }).id ?? ""
        : typeof rawProvider === "string"
          ? rawProvider
          : "";
    return {
      chartEntryId: viewingCondition.id,
      patientConditionId: viewingCondition.patientConditionId,
      toothNumbers: viewingCondition.toothNumbers,
      surfaces: viewingCondition.surfaces,
      label: viewingCondition.label,
      code: viewingCondition.code ?? "",
      notes: viewingCondition.notes,
      conditionId: viewingCondition.conditionId,
      diagnosedAt: viewingCondition.diagnosedAt ?? viewingCondition.date,
      diagnosedBy: provId,
      providerId: provId,
      severity: viewingCondition.severity ?? "",
      status: viewingCondition.conditionStatus ?? "ACTIVE",
    };
  }, [viewingCondition]);

  const handleViewConditionSubmit = useCallback(
    async (data: EditConditionSubmitData) => {
      await handleEditCondition(data);
      setViewingCondition(null);
    },
    [handleEditCondition],
  );

  // ── View procedure detail (eye button in SplitLedger) ─────────────────────
  const [viewingProcedure, setViewingProcedure] = useState<ChartEntry | null>(null);

  const procedureViewData = useMemo<EditProcedureInitialData | null>(() => {
    if (!viewingProcedure) return null;
    const tpId = viewingProcedure.treatmentProcedureId;
    const tPlanId = viewingProcedure.treatmentPlanId;
    if (!tpId || !tPlanId) return null;
    const refTooth = viewingProcedure.toothNumbers[0] ?? 11;
    return {
      treatmentProcedureId: tpId,
      treatmentPlanId: tPlanId,
      procedureName: viewingProcedure.label,
      procedureCode: (viewingProcedure as any).procedureCode ?? viewingProcedure.code,
      toothNumbers: viewingProcedure.toothNumbers,
      surfaces: viewingProcedure.surfaces.map((s) => uiToCanonical(s, refTooth)),
      notes: viewingProcedure.notes,
      totalPrice: viewingProcedure.totalPrice ?? 0,
      currency: viewingProcedure.currency ?? "UGX",
      sessionType: (viewingProcedure as any).sessionType ?? "SINGLE",
      sessionCount: (viewingProcedure as any).sessionCount ?? 1,
      billingType: (viewingProcedure as any).billingType ?? "PAY_FULL",
      providerId: (viewingProcedure as any).providerId ?? "",
      status: viewingProcedure.procedureStatus ?? viewingProcedure.type,
      sessionsCount: viewingProcedure.sessionsCount ?? 0,
    };
  }, [viewingProcedure]);

  const handleViewProcedureSuccess = useCallback(() => {
    if (patientId) {
      qc.invalidateQueries({ queryKey: ["chart-entries", patientId] });
      qc.invalidateQueries({ queryKey: ["treatment-procedures", patientId] });
      qc.invalidateQueries({ queryKey: ["tx-plans", patientId] });
    }
    setViewingProcedure(null);
  }, [patientId, qc]);

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
            queryKey: ["chart-entries", patientId],
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
      if (e.type === "CONDITION") {
        const cs = e.conditionStatus;
        if (cs === "RESOLVED" || cs === "RULED_OUT") {
          counts.RESOLVED++;
          continue;
        }
      }
      if (e.status === "ACTIVE") {
        if (!isLiveConditionEntry(e)) continue;
        counts[layerForEntry(e)]++;
      }
    }
    return counts;
  }, [entries]);

  const rws = dentition === "permanent" ? ARCH.permanent : ARCH.primary;
  const selectedEntries = entries.filter(e => e.toothNumbers.some(t => selected.includes(t)));
  const currentTooth = selected.length === 1 ? selected[0] : null;
  const currentPresence = currentTooth ? resolvePresence(getEntries(currentTooth)) : null;
  const presenceLabel = currentPresence ? ({
    PRESENT: "Present", EXTRACTED: "Missing / extracted", CONGENITAL: "Congenitally absent",
    UNERUPTED: "Unerupted / impacted", SUPERNUMERARY: "Supernumerary",
    IMPLANT: currentPresence.implantPlanned ? "Implant planned" : "Implant present",
    PONTIC: "Bridge pontic", RETAINED_ROOT: "Retained root",
  })[currentPresence.primary] : "";

  const renderArch = (teeth: number[], isUpper: boolean) => (
    <div className={`dc-arch ${isUpper ? "dc-arch--upper" : "dc-arch--lower"}`}
      style={{ "--tooth-count": teeth.length } as React.CSSProperties}>
      {teeth.map((t, index) => (
        <div key={t} className={`dc-tooth ${selected.includes(t) ? "is-selected" : ""} ${index === teeth.length / 2 ? "dc-midline" : ""}`}>
          <button type="button" className="dc-tooth-face" aria-pressed={selected.includes(t)}
            aria-label={`Select tooth ${displayToothNumber(t, numbering)}, ${toothName(t)}, FDI ${t}`}
            title={`${toothName(t)} · FDI ${t}\n${getEntries(t).filter(e => e.status === "ACTIVE").map(e => e.label).join("\n") || "No recorded findings"}`}
            onClick={e => handleToothClick(t, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
            onKeyDown={e => {
              const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (step) {
                e.preventDefault();
                const buttons = Array.from(e.currentTarget.closest(".dc-arch")!.querySelectorAll<HTMLButtonElement>(".dc-tooth-face"));
                buttons[(index + step + teeth.length) % teeth.length]?.focus();
              }
            }}>
            <ToothAnatomy fdi={t} isUpper={isUpper} entries={getEntries(t)} visibleLayers={visibleLayers} colors={LAYER_COLOR} />
          </button>
          <ToothSVG fdi={t} isUpper={isUpper} entries={getEntries(t)} selected={selected.includes(t)}
            selectedSurfaces={selectedSurfaces} visibleLayers={visibleLayers}
            onClick={handleToothClick} onSurfaceClick={handleSurfaceClick} />
          <button type="button" className="dc-tooth-number" aria-pressed={selected.includes(t)}
            aria-label={`Select tooth ${displayToothNumber(t, numbering)}`}
            onClick={e => handleToothClick(t, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}>
            {displayToothNumber(t, numbering)}
            <span className="dc-entry-dots" aria-hidden="true">
              {[...new Set(getEntries(t).filter(e => e.status === "ACTIVE" && isLiveConditionEntry(e)).map(layerForEntry))]
                .filter(l => visibleLayers[l]).map(l => <i key={l} style={{ background: LAYER_COLOR[l].c }} />)}
            </span>
          </button>
        </div>
      ))}
    </div>
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
    <div className="dental-chart">
      <header className="dc-header">
        <div className="dc-heading">
          <span className="dc-heading-icon"><ClipboardList size={21} aria-hidden="true" /></span>
          <div><h2>Clinical chart</h2><p>Odontogram <span>·</span> {dentition === "permanent" ? "Permanent dentition · 32 teeth" : "Primary dentition · 20 teeth"}</p></div>
        </div>
        <div className="dc-header-actions">
          {isDemo && <span className="dc-demo-badge">Demo · not saved</span>}
          {readOnly && <span className="dc-demo-badge">Read only</span>}
          <button className="dc-button" aria-label={isDemo ? "Reset demo chart" : "Refresh dental chart"} onClick={() => {
            if (isDemo) { setInternalEntries([]); clearSelection(); }
            else { refetch(); refetchProcs(); }
          }}><RefreshCcw size={14} aria-hidden="true" /><span>{isDemo ? "Reset" : "Refresh"}</span></button>
          {!readOnly && <>
            <button className="dc-button" disabled={!selected.length} onClick={() => setShowCond(true)}>
              <Plus size={15} aria-hidden="true" /> Add condition
            </button>
            <button className="dc-button dc-button--primary" disabled={isDemo}
              title={isDemo ? "Procedures require a patient record" : !selected.length ? "No tooth selected — plan a whole-mouth procedure (cleaning, full-mouth X-ray…)" : undefined}
              onClick={() => setShowTx(true)}>
              <Plus size={15} aria-hidden="true" /> {selected.length ? "Add procedure" : "Whole-mouth procedure"}
            </button>
          </>}
        </div>
      </header>

      <div className="dc-toolbar">
        <div className="dc-segmented" role="group" aria-label="Dentition">
          {(["permanent", "primary"] as const).map(d => {
            // Live findings recorded on the dentition that is not on screen.
            const hidden = d !== dentition ? hiddenDentitionCount(entries, dentition) : 0;
            return <button key={d} aria-pressed={dentition === d}
              title={hidden ? `${hidden} active finding(s) on ${d} teeth` : undefined}
              onClick={() => { dentitionChosenRef.current = true; setDentition(d); clearSelection(); }}>
              {d === "permanent" ? "Permanent" : "Primary"}
              {hidden > 0 && <span className="dc-count-badge" style={{ marginLeft: 6, padding: "0 6px", borderRadius: 8, background: "#f59e0b", color: "#fff", fontSize: 10, fontWeight: 700 }}>{hidden}</span>}
            </button>;
          })}
        </div>
        <label className="dc-numbering">Numbering
          <select value={numbering} onChange={e => setNumbering(e.target.value as ToothNumbering)}>
            <option value="FDI">FDI</option><option value="Universal">Universal</option>
          </select>
        </label>
        <span className="dc-toolbar-divider" />
        <div className="dc-quadrants" role="group" aria-label="Select a quadrant">
          {(dentition === "permanent" ? [1, 2, 4, 3] : [5, 6, 8, 7]).map((q, i) =>
            <button key={q} className="dc-button dc-button--small" title={`Select ${["upper right", "upper left", "lower right", "lower left"][i]} quadrant`}
              onClick={() => selectQuadrant(q)}>{["UR", "UL", "LR", "LL"][i]}</button>)}
        </div>
        <button className="dc-button dc-button--small" onClick={() => selectArch("U")}>Upper</button>
        <button className="dc-button dc-button--small" onClick={() => selectArch("L")}>Lower</button>
        <div className="dc-zoom" role="group" aria-label="Chart zoom">
          <button aria-label="Zoom out" disabled={zoom === 100} onClick={() => setZoom(z => Math.max(100, z - 25))}><ZoomOut size={15} /></button>
          <output aria-live="polite">{zoom}%</output>
          <button aria-label="Zoom in" disabled={zoom === 150} onClick={() => setZoom(z => Math.min(150, z + 25))}><ZoomIn size={15} /></button>
        </div>
      </div>

      <div className="dc-layers" role="group" aria-label="Visible chart layers">
        <span className="dc-label"><Layers size={13} aria-hidden="true" /> Layers</span>
        {(Object.keys(LAYER_COLOR) as Layer[]).map(l => (
          <button key={l} className={`dc-layer ${visibleLayers[l] ? "" : "is-hidden"}`}
            aria-pressed={visibleLayers[l]} onClick={() => setVisibleLayers(p => ({ ...p, [l]: !p[l] }))}>
            <i style={{ background: LAYER_COLOR[l].c }} aria-hidden="true" />
            {LAYER_COLOR[l].label}<span>{stats[l]}</span>
          </button>
        ))}
      </div>

      <div className="dc-workspace">
        <section className="dc-canvas-panel" aria-label="Dental odontogram">
          <div className="dc-canvas-topline"><span>Patient’s right</span><span>FACIAL / OCCLUSAL VIEW</span><span>Patient’s left</span></div>
          <div className="dc-canvas-scroll" tabIndex={0} role="region" aria-label="Scrollable tooth chart">
            <div className="dc-canvas" style={{ minWidth: `${(dentition === "permanent" ? 760 : 540) * zoom / 100}px`, width: `${zoom}%` }}>
              <div className="dc-arch-caption"><span>UR <small>Upper right</small></span><span>MAXILLA</span><span><small>Upper left</small> UL</span></div>
              {renderArch(rws.upper, true)}
              <div className="dc-occlusal-plane"><span>OCCLUSAL PLANE</span></div>
              {renderArch(rws.lower, false)}
              <div className="dc-arch-caption"><span>LR <small>Lower right</small></span><span>MANDIBLE</span><span><small>Lower left</small> LL</span></div>
            </div>
          </div>
          <div className="dc-chart-hint"><MousePointer2 size={13} aria-hidden="true" /><span>Click a tooth or surface · Ctrl / ⌘ to select multiple · Shift for a range</span></div>
        </section>

        <aside className="dc-inspector" aria-label="Selection details">
          <div className="dc-inspector-top"><span className="dc-label">SELECTION</span>{selected.length > 0 && <button className="dc-text-button" onClick={clearSelection}>Clear</button>}</div>
          {selected.length ? <>
            <div className="dc-selection-title">
              <span className="dc-selection-number">{currentTooth ? displayToothNumber(currentTooth, numbering) : selected.length}</span>
              <div><h3>{currentTooth ? toothName(currentTooth).replace(/^(UR|UL|LR|LL) /, "") : "Teeth selected"}</h3>
                <p>{currentTooth ? `${numbering} ${displayToothNumber(currentTooth, numbering)} · ${presenceLabel}` : selected.map(t => displayToothNumber(t, numbering)).join(", ")}</p></div>
            </div>
            {currentTooth && <>
              <span className="dc-label">SURFACES</span>
              <div className="dc-surface-buttons" role="group" aria-label="Selected tooth surfaces">
                {(["M", toothKind(currentTooth) === "incisor" || toothKind(currentTooth) === "canine" ? "I" : "O", "D", "B", "L"] as UiSurface[]).map(surface =>
                  <button key={surface} aria-pressed={selectedSurfaces.includes(surface)}
                    title={surfaceLabel(uiToCanonical(surface, currentTooth))}
                    onClick={() => handleSurfaceClick(currentTooth, surface, { ctrl: false, shift: false })}>{surface}</button>)}
              </div>
              <p className="dc-surface-summary" aria-live="polite">{selectedSurfaces.length ? selectedSurfaces.map(s => surfaceLabel(uiToCanonical(s, currentTooth))).join(" · ") : "Whole tooth selected"}</p>
            </>}
            <div className="dc-inspector-records">
              <span className="dc-label">RECORDED FINDINGS</span>
              {selectedEntries.filter(e => e.status === "ACTIVE" && isLiveConditionEntry(e)).length === 0
                ? <p className="dc-muted">No active findings recorded.</p>
                : selectedEntries.filter(e => e.status === "ACTIVE" && isLiveConditionEntry(e)).slice(0, 4).map(e =>
                  <div className="dc-finding" key={e.id}><i style={{ background: LAYER_COLOR[layerForEntry(e)].c }} />
                    <div><strong>{e.label}</strong><span>{LAYER_COLOR[layerForEntry(e)].label}{e.surfaces.length ? ` · ${sortUiSurfaces(e.surfaces).join("")}` : ""}</span></div></div>)}
            </div>
            {currentTooth && !readOnly && <button className="dc-button dc-details-button" onClick={() => setDrawerTooth(currentTooth)}><Eye size={14} /> View tooth history</button>}
          </> : <div className="dc-empty-selection">
            <span><MousePointer2 size={24} aria-hidden="true" /></span>
            <h3>Select a tooth</h3>
            <p>{readOnly ? "Choose a tooth to review its recorded findings." : "Choose a tooth to review findings, select surfaces, or chart treatment."}</p>
            {!readOnly && <div className="dc-empty-tip">Use the quadrant controls to chart several teeth together.</div>}
          </div>}
          <div className="dc-inspector-footer"><span className="dc-status-dot" />{numbering} notation · Patient-facing view</div>
        </aside>
      </div>

      <div className="dc-reference">
        <details>
          <summary>Chart symbols <ChevronDown size={13} aria-hidden="true" /></summary>
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
        </details>
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

      <div className="dc-ledger-heading">
        <div><h3>Clinical record</h3><span>Conditions and procedures</span></div>
        <div className="dc-ledger-filters">
          {visitId && <label><input type="checkbox" checked={ledgerThisVisitOnly} onChange={e => setLedgerThisVisitOnly(e.target.checked)} /> This visit only</label>}
          <label><input type="checkbox" checked={ledgerSelectionOnly} onChange={e => setLedgerSelectionOnly(e.target.checked)} /> Selected teeth only</label>
        </div>
      </div>
      <SplitLedger
        entries={(ledgerSelectionOnly ? selectedEntries : entries).filter(
          (e) => !ledgerThisVisitOnly || !visitId || e.visitId === visitId,
        )}
        selectedTeeth={selected}
        onRowClick={(teeth) => {
          setSelected(teeth);
          setAnchor(teeth[0] ?? null);
          setSelectedSurfaces([]);
          setDrawerTooth(null);
        }}
        onViewCondition={readOnly ? undefined : setViewingCondition}
        onViewProcedure={readOnly ? undefined : setViewingProcedure}
      />

      {/* ── Dialogs & drawers ── */}
      {/* The drawer carries edit / cancel / delete actions, so a read-only chart
          never mounts it (or any dialog below). */}
      {!readOnly && <>
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
          initialSurfaces={selectedSurfaces}
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
          initialSurfaces={selectedSurfaces}
          onSuccess={() => {
            if (!isDemo) {
              qc.invalidateQueries({
                queryKey: ["chart-entries", patientId],
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

      {conditionViewData && (
        <EditConditionDialog
          isOpen
          onClose={() => setViewingCondition(null)}
          initialData={conditionViewData}
          defaultDentistId={dentistId}
          onSubmit={handleViewConditionSubmit}
        />
      )}

      {procedureViewData && patientId && (
        <EditProcedureDialog
          isOpen
          onClose={() => setViewingProcedure(null)}
          initialData={procedureViewData}
          patientId={patientId}
          visitId={visitId}
          dentistId={dentistId}
          onSuccess={handleViewProcedureSuccess}
        />
      )}
      </>}

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
