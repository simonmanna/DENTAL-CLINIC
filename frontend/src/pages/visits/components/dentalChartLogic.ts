// src/pages/visits/components/dentalChartLogic.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure, dependency-free dental-chart logic — NO React, NO API client.
//
// These functions and types were extracted from DentalChart.tsx so they can be
// unit-tested in isolation (see dentalChartLogic.test.ts) without dragging in
// the React / react-query / axios module graph. All imports here are
// `import type`, so this module has zero runtime dependencies.
// ─────────────────────────────────────────────────────────────────────────────

import type { UiSurface } from "../../../lib/dental/notation";
import type { PatientConditionStatus } from "../../../lib/api/conditions";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

// RESOLVED is a chart-row state a CONDITION row enters once its treating
// procedure completes: it stops painting the odontogram (see
// isLiveConditionEntry) but is still delivered by the backend so it shows in
// the SplitLedger condition history.
export type EntryStatus = "ACTIVE" | "SUPERSEDED" | "VOIDED" | "RESOLVED";

export type ToothPresence =
  | "PRESENT"
  | "EXTRACTED"
  | "CONGENITAL"
  | "UNERUPTED"
  | "SUPERNUMERARY"
  | "IMPLANT"
  // Bridge pontic — an artificial tooth suspended in an (usually extracted)
  // space by the adjacent abutments. Rendered as a floating crown with
  // connector bars, NOT a bare extraction X (M-1).
  | "PONTIC"
  // Retained root — the crown is lost but the root remains in the socket
  // (K08.3). Rendered as roots + a stump, no crown (M-1).
  | "RETAINED_ROOT";

export type ChartPresenceEffect =
  | "NONE"
  | "EXTRACTED"
  | "CONGENITAL"
  | "UNERUPTED"
  | "SUPERNUMERARY"
  // Crown lost, root retained in situ. Drives the RETAINED_ROOT presence so a
  // root stump is never mis-charted as a whole present tooth (M-1).
  | "RETAINED_ROOT";

/**
 * Compound presence result — primary is what drives the visual; the flags
 * let the renderer add contextual overlays (e.g. socket brackets on an
 * implant that replaced an extracted tooth).
 */
export interface PresenceState {
  primary: ToothPresence;
  /** Implant placed in a previously-extracted socket. */
  wasExtracted: boolean;
  /** Implant placed on a congenitally-absent site (no prior tooth). */
  wasCongenital: boolean;
  /** At least one PLANNED procedure exists for this tooth. */
  hasPlannedIntervention: boolean;
  /** At least one COMPLETED procedure exists for this tooth. */
  hasCompletedIntervention: boolean;
  /**
   * The winning IMPLANT is planned-only — there is no COMPLETED/EXISTING
   * implant on this tooth yet. Drives dashed/ghosted implant rendering so a
   * planned fixture is never drawn identically to an osseointegrated one.
   */
  implantPlanned: boolean;
}

export interface ChartEntry {
  id: string;
  toothNumbers: number[];
  surfaces: UiSurface[];
  type: "CONDITION" | "EXISTING" | "PLANNED" | "COMPLETED";
  status: EntryStatus;
  label: string;
  code?: string;
  name?: string;
  notes?: string;
  date: string;
  provider?: string;
  patientConditionId?: string;
  conditionId?: string;
  diagnosedAt?: string;
  diagnosedBy?: string;
  severity?: "" | "MILD" | "MODERATE" | "SEVERE";
  conditionStatus?: PatientConditionStatus;
  chartPresenceEffect?: ChartPresenceEffect;
  treatmentProcedureId?: string;
  treatmentPlanId?: string;
  procedureStatus?: string;
  totalPrice?: number;
  currency?: string;
  /** M-2 optimistic-lock token from the persisted ChartEntry row. */
  version?: number;
  /**
   * TRUE when this entry represents an osseointegrated implant body.
   * Populated from the procedure catalog's `isImplant` flag, or derived
   * from the ADA D-code set below. Replaces the fragile /implant/i label
   * regex that would miss codes like D6010 with a generic label.
   */
  isImplant?: boolean;
  sessionsCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ADA procedure codes that represent osseointegrated implant bodies.
 * Checked before the label regex so a procedure coded as D6010 with a
 * generic label ("Surgical placement") still resolves as IMPLANT.
 */
export const IMPLANT_ADA_CODES = new Set([
  "D6010","D6011","D6012","D6013","D6040","D6050","D6051","D6052",
  "D6053","D6054","D6055","D6056","D6057","D6058","D6059","D6060",
  "D6061","D6062","D6065","D6066","D6067","D6068","D6069","D6070",
  "D6071","D6072","D6073","D6074","D6075","D6076","D6077","D6078",
  "D6079","D6080","D6081","D6082","D6083","D6084","D6085","D6086",
  "D6087","D6088","D6090","D6091","D6092","D6093","D6094","D6095",
  "D6096","D6097","D6098","D6099",
]);

/** ICD-10 fallback for legacy entries that pre-date chartPresenceEffect. */
export const ICD_TO_PRESENCE: Record<string, ToothPresence> = {
  "K08.1": "EXTRACTED",
  "K00.0": "CONGENITAL",
  "K01.0": "UNERUPTED",
  "K01.1": "UNERUPTED",
  "K00.1": "SUPERNUMERARY",
  "K08.3": "RETAINED_ROOT",
};

/**
 * Treatment-procedure statuses that may paint the chart. CANCELLED is the only
 * status that must NEVER render — without this guard it would fall through to
 * the PLANNED branch and paint the tooth red as if it were active planned work.
 *
 * ON_HOLD / PENDING / REFERRED are intentionally renderable: hiding on-hold or
 * referred treatment from the chart silently drops clinically-relevant work, so
 * those render in the greyed INACTIVE layer (see {@link layerForEntry}) rather
 * than vanishing. IN_PROGRESS renders in its own layer, never as COMPLETED.
 */
export const RENDERABLE_PROC_STATUS = new Set([
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "ON_HOLD",
  "PENDING",
  "REFERRED",
]);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Labels that contain "implant" but do NOT represent placing an osseointegrated
 * fixture — a consult, evaluation, referral, removal, or maintenance visit must
 * not paint the tooth as implanted. The catalog `isImplant` flag and the ADA
 * D-code set remain the reliable signals; this only narrows the label fallback.
 */
const NON_PLACEMENT_IMPLANT_LABEL =
  /consult|evaluat|assess|review|\bexam|referr|remov|fail|maintenance|hygiene|clean/i;

export function isImplantEntry(e: Pick<ChartEntry, "isImplant" | "code" | "label">): boolean {
  if (e.isImplant) return true;
  if (e.code && IMPLANT_ADA_CODES.has(e.code.toUpperCase())) return true;
  // Label fallback — last resort for catalogs with neither the flag nor a
  // D-code. Narrowed so "Implant consultation" / "implant evaluation" / "remove
  // implant" are not mistaken for a placed fixture (M4).
  if (/implant/i.test(e.label) && !NON_PLACEMENT_IMPLANT_LABEL.test(e.label)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESTORATIONS — distinct prosthetic / restorative glyphs (M-1)
//
// Prosthetics are PROCEDURES, not conditions, so — like implants — they are
// classified from the CDT/ADA procedure code first, with a narrowed label
// fallback. Each kind drives its own odontogram glyph (bridge pontic, crown,
// veneer, denture, sealant, ortho) so prosthetic work is no longer collapsed
// into a generic whole-tooth colour that only the ledger label distinguished.
// ─────────────────────────────────────────────────────────────────────────────

export type RestorationKind =
  | "CROWN"
  | "VENEER"
  | "BRIDGE_PONTIC"
  | "BRIDGE_RETAINER"
  | "DENTURE"
  | "SEALANT"
  | "ORTHODONTIC";

/** Parse a `D####` CDT/ADA code to its numeric body, else null. */
function cdtCodeNum(code?: string): number | null {
  if (!code) return null;
  const m = /^d(\d{4})$/i.exec(code.trim());
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Labels that mention a restoration word but do NOT mean the restoration is
 * placed on the tooth — a consult, removal, repair-only quote, impression, or
 * the perio "crown lengthening" surgery must never paint a crown/bridge glyph.
 * Mirrors {@link NON_PLACEMENT_IMPLANT_LABEL}.
 */
const NON_PLACEMENT_RESTORATION_LABEL =
  /consult|evaluat|assess|\bexam|review|\bremov|lengthen|impression|recement|re-cement/i;

/**
 * Classify a procedure-linked entry into a restoration kind for glyph
 * rendering. CONDITION rows and plain fillings / endo / scaling return null
 * (they keep the standard surface-colour rendering). Code wins; the label is a
 * narrowed last resort so catalogs without CDT codes still classify.
 */
export function restorationKind(
  e: Pick<ChartEntry, "type" | "code" | "label">,
): RestorationKind | null {
  if (e.type === "CONDITION") return null;
  const n = cdtCodeNum(e.code);
  if (n != null) {
    if (n >= 6205 && n <= 6253) return "BRIDGE_PONTIC"; // pontics
    if ((n >= 6545 && n <= 6634) || (n >= 6710 && n <= 6794))
      return "BRIDGE_RETAINER"; // FPD retainer crowns / inlays-onlays
    if (n >= 2960 && n <= 2962) return "VENEER"; // labial veneers
    if (n >= 1351 && n <= 1353) return "SEALANT"; // sealant / preventive resin
    if (n >= 8010 && n <= 8999) return "ORTHODONTIC"; // orthodontics
    if (n >= 5110 && n <= 5899) return "DENTURE"; // complete / partial dentures
    if (n >= 2510 && n <= 2799) return "CROWN"; // inlays / onlays / single crowns
  }
  const label = e.label ?? "";
  if (NON_PLACEMENT_RESTORATION_LABEL.test(label)) return null;
  if (/pontic/i.test(label)) return "BRIDGE_PONTIC";
  if (/\bbridge\b|\bfpd\b|abutment|retainer crown/i.test(label))
    return "BRIDGE_RETAINER";
  if (/veneer|laminate/i.test(label)) return "VENEER";
  if (/sealant|fissure seal/i.test(label)) return "SEALANT";
  if (/orthodont|bracket|\bbraces\b|aligner/i.test(label)) return "ORTHODONTIC";
  if (/denture|prosthesis|\bpartial\b/i.test(label)) return "DENTURE";
  if (/\bcrown\b|\bcap\b|\bonlay\b|\binlay\b|\bpfm\b/i.test(label)) return "CROWN";
  return null;
}

export function isBridgePonticEntry(
  e: Pick<ChartEntry, "type" | "code" | "label">,
): boolean {
  return restorationKind(e) === "BRIDGE_PONTIC";
}

/**
 * Overlay precedence when a tooth carries more than one restoration kind. The
 * structural states (bridge retainer / crown) outrank surface treatments, so a
 * crowned abutment that also once had a sealant shows as a crown. BRIDGE_PONTIC
 * is intentionally absent — it is resolved as a tooth-PRESENCE primary
 * (resolvePresence), not an overlay on a present tooth.
 */
const RESTORATION_OVERLAY_PRIORITY: readonly RestorationKind[] = [
  "SEALANT",
  "ORTHODONTIC",
  "DENTURE",
  "VENEER",
  "CROWN",
  "BRIDGE_RETAINER",
];

/**
 * Pick the single restoration glyph to overlay on a PRESENT tooth from a set of
 * candidate entries. The caller pre-filters (ACTIVE, layer-visible); this only
 * resolves precedence. Returns null when no entry is a glyph-bearing
 * restoration. Mirrors {@link highestPriorityEntry}.
 */
export function pickRestoration(entries: ChartEntry[]): RestorationKind | null {
  let best: RestorationKind | null = null;
  let bestRank = -1;
  for (const e of entries) {
    const k = restorationKind(e);
    if (!k) continue;
    const rank = RESTORATION_OVERLAY_PRIORITY.indexOf(k);
    if (rank > bestRank) {
      best = k;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * A CONDITION entry should paint on the live odontogram — and drive tooth
 * presence — only while its underlying PatientCondition is clinically live:
 * status ACTIVE or MONITORED. Once it is RESOLVED (treated / healed) or
 * RULED_OUT (mis-diagnosis), the finding is history that belongs in the tooth
 * timeline, not as an active mark on the chart, so the tooth colour must revert.
 *
 * This is deliberately distinct from {@link ChartEntry.status} (ACTIVE /
 * SUPERSEDED / VOIDED), which is the *chart-row* lifecycle. A resolved
 * condition's chart row stays ACTIVE in the DB (resolution does not supersede
 * it), so without consulting `conditionStatus` the chart never reflected the
 * clinical change — that was the sync gap this closes.
 *
 * Non-condition entries (procedures, existing work) and legacy condition rows
 * that carry no `conditionStatus` default to live, so this never hides
 * procedure work or records that predate clinical-status tracking.
 */
export function isLiveConditionEntry(
  e: Pick<ChartEntry, "type" | "conditionStatus">,
): boolean {
  if (e.type !== "CONDITION") return true;
  const s = e.conditionStatus;
  return s == null || s === "ACTIVE" || s === "MONITORED" || s === "IN_TREATMENT";
}

/**
 * Format an ISO timestamp as `YYYY-MM-DD` in the VIEWER's local timezone (the
 * clinic terminal's zone) rather than UTC. A raw `iso.split("T")[0]` takes the
 * UTC date, which shifts evening records to the wrong day in any non-UTC zone —
 * e.g. a 21:00 record in Kampala (UTC+3) would show, and sort, as the next day.
 * That is a real accuracy problem for a clinical / billing record (H4).
 */
export function toLocalISODate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return iso ? iso.split("T")[0] : "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Derives the compound presence state for a tooth slot from its active
 * chart entries. Resolution priority (highest wins for `primary`):
 *
 *   1. IMPLANT procedure (COMPLETED | EXISTING | PLANNED)
 *   2. PONTIC procedure (bridge unit suspended in the space)
 *   3. RETAINED_ROOT condition (crown lost, root in situ — K08.3)
 *   4. EXTRACTED condition (acquired tooth loss)
 *   5. CONGENITAL condition (never developed)
 *   6. UNERUPTED condition (K01.x)
 *   7. SUPERNUMERARY condition (K00.1)
 *   8. PRESENT (default)
 *
 * Compound flags are set independently of the primary so the renderer can
 * show overlays — e.g. socket brackets on an implant that replaced an
 * extracted tooth, or a ∅ badge on an implant on a congenitally absent site.
 */
export function resolvePresence(entries: ChartEntry[]): PresenceState {
  const active = entries.filter((e) => e.status === "ACTIVE");

  const state: PresenceState = {
    primary: "PRESENT",
    wasExtracted: false,
    wasCongenital: false,
    hasPlannedIntervention: false,
    hasCompletedIntervention: false,
    implantPlanned: false,
  };

  // Collect all condition effects present on this tooth. A RESOLVED / RULED_OUT
  // condition no longer drives presence — a ruled-out "missing tooth" reverts to
  // PRESENT, a resolved "unerupted" stops greying the tooth, etc.
  const effects = new Set<string>();
  for (const e of active) {
    if (e.type !== "CONDITION") continue;
    if (!isLiveConditionEntry(e)) continue;
    const eff = e.chartPresenceEffect;
    if (eff && eff !== "NONE") {
      effects.add(eff);
    } else if (e.code) {
      const mapped = ICD_TO_PRESENCE[e.code];
      if (mapped) effects.add(mapped);
    }
  }

  // Compound flags — set regardless of what wins primary
  state.wasExtracted  = effects.has("EXTRACTED");
  state.wasCongenital = effects.has("CONGENITAL");
  state.hasPlannedIntervention   = active.some((e) => e.type === "PLANNED");
  state.hasCompletedIntervention = active.some((e) => e.type === "COMPLETED");

  // 1 — IMPLANT (beats all conditions). Split placed vs planned so a planned
  // fixture renders dashed/ghosted instead of identical to an osseointegrated
  // one. An IN_PROGRESS or ON_HOLD implant carries type PLANNED (its persisted
  // chart entry is not superseded to COMPLETED until a session completes), so
  // it correctly counts as planned — not placed — here.
  const hasPlacedImplant = active.some(
    (e) => (e.type === "COMPLETED" || e.type === "EXISTING") && isImplantEntry(e),
  );
  const hasPlannedImplant = active.some(
    (e) => e.type === "PLANNED" && isImplantEntry(e),
  );
  if (hasPlacedImplant || hasPlannedImplant) {
    state.primary = "IMPLANT";
    state.implantPlanned = hasPlannedImplant && !hasPlacedImplant;
    return state;
  }

  // 1b — Bridge pontic. An artificial tooth suspended in the space by the
  // adjacent abutments — render the suspended unit, never a bare extraction X.
  // Beats the EXTRACTED condition that virtually always co-exists on the same
  // site (the pontic literally fills that extracted gap), so the bridge is no
  // longer invisible under the X (M-1).
  const hasPontic = active.some(
    (e) => e.type !== "CONDITION" && isBridgePonticEntry(e),
  );
  if (hasPontic) {
    state.primary = "PONTIC";
    return state;
  }

  // 1c — Retained root (K08.3 / RETAINED_ROOT effect): crown lost, root remains.
  // Beats EXTRACTED so a charted root stump is never drawn as a clean socket.
  if (effects.has("RETAINED_ROOT")) {
    state.primary = "RETAINED_ROOT";
    return state;
  }

  // 2–5 — Condition-driven presence
  if (effects.has("EXTRACTED"))    { state.primary = "EXTRACTED";    return state; }
  if (effects.has("CONGENITAL"))   { state.primary = "CONGENITAL";   return state; }
  if (effects.has("UNERUPTED"))    { state.primary = "UNERUPTED";    return state; }
  if (effects.has("SUPERNUMERARY")){ state.primary = "SUPERNUMERARY"; return state; }

  return state; // PRESENT
}

/**
 * Stable id prefix for treatment-procedure-derived chart rows (built in
 * DentalChart.tsx from each procedure's live `targets`). mergeChartEntries uses
 * it to tell the derived row apart from the persisted chart-entry row so the
 * derived row's surfaces — the freshly-edited source of truth — win on a merge.
 */
export const DERIVED_PROC_ID_PREFIX = "proc-";

/**
 * Dedup the combined chart-entry rows (chart-entries API + treatment-procedure
 * derived rows). The two rows for ONE procedure must always collapse to a
 * single row, even right after an edit: the `/edit` endpoint updates the
 * procedure's targets (→ the derived row's surfaces) but NOT the persisted
 * chart entry (→ its surfaces stay stale), so the two snapshots disagree until
 * the next chart sync. Keying procedure-linked rows by treatmentProcedureId +
 * tooth (NOT surfaces) makes them merge regardless of that drift — without it
 * an edited surface set spawns a phantom duplicate procedure on the chart and
 * in the tooth sidebar while the plan still shows one.
 *
 * Two genuinely different procedures on one tooth stay distinct because they
 * carry different treatmentProcedureIds (B4) — e.g. an MO and a separate DO
 * composite, each its own TreatmentProcedure. Rows with no procedure link
 * (CONDITION / EXISTING / legacy unlinked) keep the surface-aware key so
 * distinct findings on one tooth never collapse.
 *
 * `type` and `status` stay in the procedure key on purpose: a tooth can hold a
 * SUPERSEDED PLANNED history row AND the live ACTIVE COMPLETED row of the SAME
 * procedure after a session completes — only the two live (same type + status)
 * rows are the duplicate to fold; the historical row must survive for the
 * ledger. The derived row is always ACTIVE, so it pairs only with the active
 * persisted row.
 *
 * On a merge the existing (first) row stays the structural base so its id is
 * preserved, but the procedure-derived row supplies the surfaces (live target
 * truth) and richer procedure metadata is folded field-by-field with ?? so a
 * tie never discards a price / status / id only one row carried (M3). O(n).
 */
export function mergeChartEntries(rows: ChartEntry[]): ChartEntry[] {
  const map = new Map<string, ChartEntry>();
  for (const e of rows) {
    const surfaceSig = [...e.surfaces].sort().join("");
    const key = e.treatmentProcedureId
      ? `tp:${e.treatmentProcedureId}-${e.toothNumbers[0]}-${e.type}-${e.status}`
      : `${e.toothNumbers[0]}-${e.type}-${e.label}-${e.code ?? ""}-${surfaceSig}`;
    const existing = map.get(key);
    if (!existing) { map.set(key, e); continue; }

    // The treatment-procedure-derived row (id prefixed DERIVED_PROC_ID_PREFIX)
    // is read straight from the procedure's targets, so it holds the live
    // tooth/surface set; prefer its surfaces so a just-edited surface set shows
    // on the chart instead of the persisted entry's stale snapshot.
    const derived = e.id.startsWith(DERIVED_PROC_ID_PREFIX)
      ? e
      : existing.id.startsWith(DERIVED_PROC_ID_PREFIX)
        ? existing
        : null;

    const score   = (e.treatmentProcedureId ? 1 : 0) + (e.treatmentPlanId ? 1 : 0);
    const exScore = (existing.treatmentProcedureId ? 1 : 0) + (existing.treatmentPlanId ? 1 : 0);
    // The higher-score row supplies procedure metadata first, but we ALWAYS
    // fold field-by-field with ?? so a tie (score === exScore) never discards a
    // price / status / id that only the other row carried (M3). The existing
    // (first) row stays the structural base so its id is preserved.
    const richer = score > exScore ? e : existing;
    const other  = richer === e ? existing : e;
    map.set(key, {
      ...existing,
      ...richer,
      // The existing (first) row stays the structural base so its id is stable
      // regardless of which row scored richer — `...richer` would otherwise
      // swap in the derived "proc-…" id when scores differ, making the merged
      // row's id (React key / row identity) non-deterministic.
      id: existing.id,
      surfaces:             derived ? derived.surfaces : existing.surfaces,
      treatmentProcedureId: richer.treatmentProcedureId ?? other.treatmentProcedureId,
      treatmentPlanId:      richer.treatmentPlanId      ?? other.treatmentPlanId,
      procedureStatus:      richer.procedureStatus      ?? other.procedureStatus,
      totalPrice:           richer.totalPrice           ?? other.totalPrice,
      currency:             richer.currency             ?? other.currency,
      isImplant:            (richer.isImplant || other.isImplant) ?? false,
      conditionStatus:      richer.conditionStatus ?? existing.conditionStatus,
    });
  }
  return [...map.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL LAYERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The chart's visual layers. CONDITION / EXISTING / PLANNED / COMPLETED map
 * 1:1 to {@link ChartEntry.type}. IN_PROGRESS and INACTIVE are *derived* layers
 * (see {@link layerForEntry}) — there is no such `ChartEntry.type`; they are
 * computed from the live treatment-procedure status so the chart shows
 * in-progress work and on-hold / referred work distinctly instead of
 * mislabeling the former as completed or hiding the latter.
 */
export type Layer =
  | "CONDITION"
  | "EXISTING"
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "INACTIVE"
  | "RESOLVED";

export const LAYER_FOR_TYPE: Record<ChartEntry["type"], Layer> = {
  CONDITION: "CONDITION",
  EXISTING: "EXISTING",
  PLANNED: "PLANNED",
  COMPLETED: "COMPLETED",
};

/** Treatment-procedure statuses that render in the greyed INACTIVE layer. */
const INACTIVE_PROC_STATUS = new Set(["ON_HOLD", "PENDING", "REFERRED"]);

/**
 * Resolve an entry's visual layer, refining a procedure-linked row by its LIVE
 * status. A {@link ChartEntry.type} is a snapshot: a multi-session procedure
 * stays persisted as PLANNED while mid-treatment, and an on-hold / referred
 * procedure also stays PLANNED. Deriving the layer from `procedureStatus` here
 * means:
 *   · IN_PROGRESS work paints in its own layer — never as COMPLETED.
 *   · ON_HOLD / PENDING / REFERRED work paints greyed — never hidden.
 *   · the persisted row (apiAsEntries) and the live-status row (procAsEntries)
 *     for one procedure resolve to the SAME layer, so they merge to one entry
 *     instead of showing a duplicate red-PLANNED + blue-COMPLETED pair.
 * Conditions and existing-work rows carry no procedure status and map straight
 * through.
 */
export function layerForEntry(
  e: Pick<ChartEntry, "type" | "procedureStatus" | "conditionStatus">,
): Layer {
  if (e.type === "CONDITION") {
    if (e.conditionStatus === "RESOLVED" || e.conditionStatus === "RULED_OUT") {
      return "RESOLVED";
    }
    return "CONDITION";
  }
  if (e.type === "EXISTING") return LAYER_FOR_TYPE[e.type];
  const s = e.procedureStatus;
  if (s === "IN_PROGRESS") return "IN_PROGRESS";
  if (s && INACTIVE_PROC_STATUS.has(s)) return "INACTIVE";
  return LAYER_FOR_TYPE[e.type]; // PLANNED → PLANNED, COMPLETED → COMPLETED
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINT PRECEDENCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paint precedence for layers that compete for the SAME pixel — a tooth surface
 * carrying more than one finding, or a whole-tooth restoration that exists in
 * more than one state. Ordered LOWEST → HIGHEST priority; the layer later in
 * this list wins.
 *
 * The ordering encodes "show what needs attention / what is current, not the
 * historical baseline":
 *
 *   CONDITION    — an active, unresolved diagnosis. HIGHEST: a live finding
 *                  (e.g. recurrent caries on an existing filling) must never be
 *                  hidden under older restorative work. Hiding a diagnosis is
 *                  the one failure mode with real clinical cost (#3). RESOLVED
 *                  conditions paint in the RESOLVED layer (lowest priority) so
 *                  they appear greyed underneath active findings.
 *   IN_PROGRESS  — treatment happening now.
 *   PLANNED      — scheduled future work. Beats EXISTING so a planned crown
 *                  replacement surfaces over the existing crown it replaces (#2).
 *   COMPLETED    — work finished this episode.
 *   EXISTING     — historical restorative baseline.
 *   INACTIVE     — on-hold / pending / referred work that is parked; must not
 *                  override the real diagnosis or restoration on the tooth.
 *
 * Replaces the two ad-hoc orderings that previously lived in DentalChart.tsx
 * (a local surface PRIORITY array that let EXISTING bury CONDITION, and a bare
 * `.find()` for whole-tooth entries that had no ordering at all).
 */
export const LAYER_PAINT_PRIORITY: readonly Layer[] = [
  "RESOLVED",
  "INACTIVE",
  "EXISTING",
  "COMPLETED",
  "PLANNED",
  "IN_PROGRESS",
  "CONDITION",
] as const;

/**
 * Numeric rank of a layer in {@link LAYER_PAINT_PRIORITY}; higher wins. An
 * unknown layer ranks -1 (loses to every known layer) so a future layer added
 * without updating the precedence list fails safe rather than silently winning.
 */
export function layerPriority(layer: Layer): number {
  return LAYER_PAINT_PRIORITY.indexOf(layer);
}

/**
 * From a set of candidate entries, return the one whose visual layer has the
 * highest paint priority. Used to pick the single whole-tooth restoration
 * colour when a tooth carries more than one whole-tooth entry — e.g. an EXISTING
 * crown AND a PLANNED replacement crown. A bare `.find()` returned whichever
 * happened to come first in the merged list, so the displayed state was
 * effectively arbitrary (#2). Ties keep the earliest candidate (stable). The
 * caller is responsible for pre-filtering (ACTIVE, whole-tooth, layer-visible);
 * this only resolves the precedence. Returns null for an empty list.
 */
export function highestPriorityEntry(candidates: ChartEntry[]): ChartEntry | null {
  let best: ChartEntry | null = null;
  let bestRank = -Infinity;
  for (const e of candidates) {
    const rank = layerPriority(layerForEntry(e));
    if (rank > bestRank) {
      best = e;
      bestRank = rank;
    }
  }
  return best;
}
