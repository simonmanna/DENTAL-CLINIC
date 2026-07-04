import { describe, it, expect } from "vitest";
import {
  resolvePresence,
  mergeChartEntries,
  isImplantEntry,
  isLiveConditionEntry,
  layerForEntry,
  toLocalISODate,
  RENDERABLE_PROC_STATUS,
  LAYER_PAINT_PRIORITY,
  layerPriority,
  highestPriorityEntry,
  restorationKind,
  pickRestoration,
  isBridgePonticEntry,
  type ChartEntry,
} from "./dentalChartLogic";

// Minimal ChartEntry factory — only the fields under test need to be set.
let seq = 0;
function entry(over: Partial<ChartEntry> = {}): ChartEntry {
  return {
    id: `e${seq++}`,
    toothNumbers: [11],
    surfaces: [],
    type: "CONDITION",
    status: "ACTIVE",
    label: "",
    date: "2026-01-01",
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolvePresence
// ─────────────────────────────────────────────────────────────────────────────

describe("resolvePresence", () => {
  it("defaults to PRESENT with all flags false for an empty tooth", () => {
    const ps = resolvePresence([]);
    expect(ps).toEqual({
      primary: "PRESENT",
      wasExtracted: false,
      wasCongenital: false,
      hasPlannedIntervention: false,
      hasCompletedIntervention: false,
      implantPlanned: false,
    });
  });

  it("ignores non-ACTIVE entries", () => {
    const ps = resolvePresence([
      entry({ type: "CONDITION", status: "VOIDED", chartPresenceEffect: "EXTRACTED" }),
      entry({ type: "PLANNED", status: "SUPERSEDED" }),
    ]);
    expect(ps.primary).toBe("PRESENT");
    expect(ps.wasExtracted).toBe(false);
    expect(ps.hasPlannedIntervention).toBe(false);
  });

  it("reads presence from chartPresenceEffect", () => {
    expect(resolvePresence([entry({ chartPresenceEffect: "EXTRACTED" })]).primary).toBe("EXTRACTED");
    expect(resolvePresence([entry({ chartPresenceEffect: "CONGENITAL" })]).primary).toBe("CONGENITAL");
    expect(resolvePresence([entry({ chartPresenceEffect: "UNERUPTED" })]).primary).toBe("UNERUPTED");
    expect(resolvePresence([entry({ chartPresenceEffect: "SUPERNUMERARY" })]).primary).toBe("SUPERNUMERARY");
  });

  it("treats chartPresenceEffect 'NONE' as no effect (falls back to PRESENT)", () => {
    expect(resolvePresence([entry({ chartPresenceEffect: "NONE" })]).primary).toBe("PRESENT");
  });

  it("falls back to the ICD-10 → presence map when chartPresenceEffect is absent", () => {
    expect(resolvePresence([entry({ code: "K08.1" })]).primary).toBe("EXTRACTED");
    expect(resolvePresence([entry({ code: "K00.0" })]).primary).toBe("CONGENITAL");
    expect(resolvePresence([entry({ code: "K01.1" })]).primary).toBe("UNERUPTED");
    expect(resolvePresence([entry({ code: "K00.1" })]).primary).toBe("SUPERNUMERARY");
  });

  it("only honours presence effects on CONDITION entries", () => {
    // A PLANNED row carrying an absence code must not mark the tooth extracted.
    const ps = resolvePresence([entry({ type: "PLANNED", code: "K08.1" })]);
    expect(ps.primary).toBe("PRESENT");
    expect(ps.wasExtracted).toBe(false);
  });

  it("ranks EXTRACTED above CONGENITAL when both are present, but keeps both flags", () => {
    const ps = resolvePresence([
      entry({ chartPresenceEffect: "EXTRACTED" }),
      entry({ chartPresenceEffect: "CONGENITAL" }),
    ]);
    expect(ps.primary).toBe("EXTRACTED");
    expect(ps.wasExtracted).toBe(true);
    expect(ps.wasCongenital).toBe(true);
  });

  it("lets an IMPLANT procedure beat any condition while preserving the wasExtracted flag", () => {
    const ps = resolvePresence([
      entry({ type: "CONDITION", chartPresenceEffect: "EXTRACTED" }),
      entry({ type: "COMPLETED", label: "Implant placement" }),
    ]);
    expect(ps.primary).toBe("IMPLANT");
    expect(ps.wasExtracted).toBe(true);
    expect(ps.implantPlanned).toBe(false); // a COMPLETED implant is placed
  });

  it("detects an implant on a congenitally-absent site", () => {
    const ps = resolvePresence([
      entry({ type: "CONDITION", chartPresenceEffect: "CONGENITAL" }),
      entry({ type: "PLANNED", code: "D6010", label: "Surgical placement" }),
    ]);
    expect(ps.primary).toBe("IMPLANT");
    expect(ps.wasCongenital).toBe(true);
    expect(ps.hasPlannedIntervention).toBe(true);
    expect(ps.implantPlanned).toBe(true); // PLANNED-only → dashed/ghosted
  });

  it("flags implantPlanned for a PLANNED implant but not once it is placed", () => {
    // PLANNED-only fixture → planned.
    expect(
      resolvePresence([entry({ type: "PLANNED", code: "D6010", label: "Implant" })]).implantPlanned,
    ).toBe(true);
    // EXISTING (prior placed) fixture → not planned.
    expect(
      resolvePresence([entry({ type: "EXISTING", label: "Implant" })]).implantPlanned,
    ).toBe(false);
    // Both planned and placed entries present → placed wins, not planned.
    const mixed = resolvePresence([
      entry({ type: "PLANNED", code: "D6010", label: "Implant" }),
      entry({ type: "COMPLETED", code: "D6010", label: "Implant" }),
    ]);
    expect(mixed.primary).toBe("IMPLANT");
    expect(mixed.implantPlanned).toBe(false);
  });

  it("sets hasPlanned / hasCompleted intervention flags independently of primary", () => {
    const ps = resolvePresence([
      entry({ type: "PLANNED", label: "Crown prep" }),
      entry({ type: "COMPLETED", label: "Filling" }),
    ]);
    expect(ps.primary).toBe("PRESENT");
    expect(ps.hasPlannedIntervention).toBe(true);
    expect(ps.hasCompletedIntervention).toBe(true);
  });

  // ── Clinical-status awareness (chart ↔ condition sync) ─────────────────────
  it("still honours an ACTIVE or MONITORED presence condition", () => {
    expect(
      resolvePresence([entry({ chartPresenceEffect: "EXTRACTED", conditionStatus: "ACTIVE" })]).primary,
    ).toBe("EXTRACTED");
    expect(
      resolvePresence([entry({ chartPresenceEffect: "UNERUPTED", conditionStatus: "MONITORED" })]).primary,
    ).toBe("UNERUPTED");
  });

  it("a RULED_OUT 'missing tooth' reverts the tooth to PRESENT", () => {
    const ps = resolvePresence([
      entry({ chartPresenceEffect: "EXTRACTED", conditionStatus: "RULED_OUT" }),
    ]);
    expect(ps.primary).toBe("PRESENT");
    expect(ps.wasExtracted).toBe(false);
  });

  it("a RESOLVED presence condition no longer drives presence", () => {
    expect(
      resolvePresence([entry({ chartPresenceEffect: "UNERUPTED", conditionStatus: "RESOLVED" })]).primary,
    ).toBe("PRESENT");
  });

  it("ignores a resolved absence but lets a placed implant still win", () => {
    // The extraction was resolved (site restored), and the implant is placed —
    // the tooth is an IMPLANT, and wasExtracted is no longer flagged.
    const ps = resolvePresence([
      entry({ type: "CONDITION", chartPresenceEffect: "EXTRACTED", conditionStatus: "RESOLVED" }),
      entry({ type: "COMPLETED", label: "Implant placement" }),
    ]);
    expect(ps.primary).toBe("IMPLANT");
    expect(ps.wasExtracted).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isLiveConditionEntry
// ─────────────────────────────────────────────────────────────────────────────

describe("isLiveConditionEntry", () => {
  it("treats ACTIVE / MONITORED / missing status as live", () => {
    expect(isLiveConditionEntry({ type: "CONDITION", conditionStatus: "ACTIVE" })).toBe(true);
    expect(isLiveConditionEntry({ type: "CONDITION", conditionStatus: "MONITORED" })).toBe(true);
    // Legacy rows with no clinical status default to live (never hidden).
    expect(isLiveConditionEntry({ type: "CONDITION" })).toBe(true);
  });

  it("treats RESOLVED / RULED_OUT conditions as not live", () => {
    expect(isLiveConditionEntry({ type: "CONDITION", conditionStatus: "RESOLVED" })).toBe(false);
    expect(isLiveConditionEntry({ type: "CONDITION", conditionStatus: "RULED_OUT" })).toBe(false);
  });

  it("treats non-condition entries as always live regardless of status", () => {
    // A procedure row never carries a clinical condition status; it must paint.
    expect(isLiveConditionEntry({ type: "PLANNED", conditionStatus: "RESOLVED" })).toBe(true);
    expect(isLiveConditionEntry({ type: "COMPLETED" })).toBe(true);
    expect(isLiveConditionEntry({ type: "EXISTING" })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RENDERABLE_PROC_STATUS — cancelled never paints, on-hold/referred stay visible
// ─────────────────────────────────────────────────────────────────────────────

describe("RENDERABLE_PROC_STATUS", () => {
  it("never renders a CANCELLED procedure (D-test E6)", () => {
    expect(RENDERABLE_PROC_STATUS.has("CANCELLED")).toBe(false);
  });

  it("renders active and non-terminal work (planned / in-progress / on-hold / referred)", () => {
    for (const s of ["PLANNED", "IN_PROGRESS", "COMPLETED", "ON_HOLD", "PENDING", "REFERRED"]) {
      expect(RENDERABLE_PROC_STATUS.has(s)).toBe(true);
    }
  });

  it("greys on-hold / pending / referred into the INACTIVE layer, never hiding them (E5)", () => {
    expect(layerForEntry({ type: "PLANNED", procedureStatus: "ON_HOLD" })).toBe("INACTIVE");
    expect(layerForEntry({ type: "PLANNED", procedureStatus: "REFERRED" })).toBe("INACTIVE");
    expect(layerForEntry({ type: "PLANNED", procedureStatus: "PENDING" })).toBe("INACTIVE");
    // IN_PROGRESS gets its own layer, never mislabeled COMPLETED.
    expect(layerForEntry({ type: "PLANNED", procedureStatus: "IN_PROGRESS" })).toBe("IN_PROGRESS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isImplantEntry
// ─────────────────────────────────────────────────────────────────────────────

describe("isImplantEntry", () => {
  it("matches the explicit catalog flag, ADA D-code set, and label regex", () => {
    expect(isImplantEntry({ isImplant: true, label: "anything" })).toBe(true);
    expect(isImplantEntry({ code: "D6010", label: "Surgical placement" })).toBe(true);
    expect(isImplantEntry({ code: "d6057", label: "" })).toBe(true); // case-insensitive
    expect(isImplantEntry({ label: "Endosteal IMPLANT body" })).toBe(true);
  });

  it("does not match unrelated procedures", () => {
    expect(isImplantEntry({ code: "D2740", label: "Porcelain crown" })).toBe(false);
    expect(isImplantEntry({ label: "Composite filling" })).toBe(false);
  });

  it("does not treat non-placement 'implant' labels as a placed fixture (M4)", () => {
    expect(isImplantEntry({ label: "Implant consultation" })).toBe(false);
    expect(isImplantEntry({ label: "implant evaluation" })).toBe(false);
    expect(isImplantEntry({ label: "Remove failed implant" })).toBe(false);
    expect(isImplantEntry({ label: "Implant maintenance / hygiene" })).toBe(false);
    // …but a real placement label still matches via the (narrowed) fallback.
    expect(isImplantEntry({ label: "Implant placement" })).toBe(true);
    // …and the reliable signals always win, even with a non-placement word.
    expect(isImplantEntry({ code: "D6010", label: "Implant consultation" })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeChartEntries
// ─────────────────────────────────────────────────────────────────────────────

describe("mergeChartEntries", () => {
  it("returns an empty array unchanged", () => {
    expect(mergeChartEntries([])).toEqual([]);
  });

  it("keeps entries with distinct tooth / type / label / code", () => {
    const rows = [
      entry({ toothNumbers: [11], type: "PLANNED", label: "Crown", code: "D2740" }),
      entry({ toothNumbers: [12], type: "PLANNED", label: "Crown", code: "D2740" }), // different tooth
      entry({ toothNumbers: [11], type: "COMPLETED", label: "Crown", code: "D2740" }), // different type
      entry({ toothNumbers: [11], type: "PLANNED", label: "Crown", code: "D2950" }), // different code
    ];
    expect(mergeChartEntries(rows)).toHaveLength(4);
  });

  it("merges a colliding pair, folding richer procedure metadata into the first row", () => {
    // Both rows are the SAME procedure (the persisted chart entry + its derived
    // twin), so both carry treatmentProcedureId; only the derived row adds the
    // plan id / price / etc. that must fold into the base.
    const bare = entry({
      id: "bare",
      toothNumbers: [11], type: "PLANNED", label: "Crown", code: "D2740",
      treatmentProcedureId: "tp1",
    });
    const rich = entry({
      id: "rich",
      toothNumbers: [11], type: "PLANNED", label: "Crown", code: "D2740",
      treatmentProcedureId: "tp1",
      treatmentPlanId: "plan1",
      procedureStatus: "PLANNED",
      totalPrice: 1200,
      currency: "UGX",
      isImplant: true,
    });

    const merged = mergeChartEntries([bare, rich]);
    expect(merged).toHaveLength(1);
    const m = merged[0];
    // Base row is preserved (id), but procedure metadata comes from the richer row.
    expect(m.id).toBe("bare");
    expect(m.treatmentProcedureId).toBe("tp1");
    expect(m.treatmentPlanId).toBe("plan1");
    expect(m.totalPrice).toBe(1200);
    expect(m.currency).toBe("UGX");
    expect(m.isImplant).toBe(true);
  });

  it("does not downgrade when the richer row comes first", () => {
    const rich = entry({
      id: "rich",
      toothNumbers: [11], type: "PLANNED", label: "Crown", code: "D2740",
      treatmentProcedureId: "tp1", treatmentPlanId: "plan1", totalPrice: 1200,
    });
    const bare = entry({
      id: "bare",
      toothNumbers: [11], type: "PLANNED", label: "Crown", code: "D2740",
      treatmentProcedureId: "tp1",
    });

    const merged = mergeChartEntries([rich, bare]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("rich");
    expect(merged[0].treatmentProcedureId).toBe("tp1");
    expect(merged[0].totalPrice).toBe(1200);
  });

  it("treats a missing code the same as an empty code in the dedup key", () => {
    const a = entry({ toothNumbers: [11], type: "CONDITION", label: "Caries" });
    const b = entry({ toothNumbers: [11], type: "CONDITION", label: "Caries", code: undefined });
    expect(mergeChartEntries([a, b])).toHaveLength(1);
  });

  it("keeps two same-code procedures with different surfaces distinct (B4)", () => {
    // An MO and a separate DO composite (both D2391) on one tooth are different
    // procedures and must not collapse into one, dropping a surface set.
    const mo = entry({
      toothNumbers: [16], type: "PLANNED", label: "Composite", code: "D2391",
      surfaces: ["M", "O"], treatmentProcedureId: "tpA",
    });
    const od = entry({
      toothNumbers: [16], type: "PLANNED", label: "Composite", code: "D2391",
      surfaces: ["D", "O"], treatmentProcedureId: "tpB",
    });
    expect(mergeChartEntries([mo, od])).toHaveLength(2);
  });

  it("still merges an api row and a derived row that share surfaces (order-insensitive)", () => {
    const apiRow = entry({
      id: "api", toothNumbers: [16], type: "PLANNED", label: "Composite", code: "D2391",
      surfaces: ["M", "O"], treatmentProcedureId: "tp1",
    });
    const derived = entry({
      id: "derived", toothNumbers: [16], type: "PLANNED", label: "Composite", code: "D2391",
      surfaces: ["O", "M"], // same set, different order
      treatmentProcedureId: "tp1", treatmentPlanId: "plan1", totalPrice: 900,
    });
    const merged = mergeChartEntries([apiRow, derived]);
    expect(merged).toHaveLength(1);
    expect(merged[0].treatmentPlanId).toBe("plan1");
    expect(merged[0].totalPrice).toBe(900);
  });

  it("collapses a procedure whose surfaces were edited (persisted entry stale) and shows the live surfaces", () => {
    // Repro of the duplicate-procedure bug: editing a procedure's surfaces from
    // the chart updates the procedure target (derived row) but NOT the persisted
    // chart entry, so the two snapshots disagree. They must still merge to ONE
    // row keyed by treatmentProcedureId, and the live (derived) surfaces win.
    const persisted = entry({
      id: "chartEntryCuid", toothNumbers: [16], type: "PLANNED", label: "Composite",
      code: "D2391", surfaces: ["M", "O"], // stale — pre-edit
      treatmentProcedureId: "tp1", treatmentPlanId: "plan1",
    });
    const derived = entry({
      id: "proc-tp1-t16", toothNumbers: [16], type: "PLANNED", label: "Composite",
      code: "D2391", surfaces: ["D", "O"], // edited — live target truth
      treatmentProcedureId: "tp1", treatmentPlanId: "plan1", totalPrice: 900,
    });
    const merged = mergeChartEntries([persisted, derived]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("chartEntryCuid");                 // base row preserved
    expect([...merged[0].surfaces].sort()).toEqual(["D", "O"]);  // edited surfaces win
  });

  it("keeps a superseded PLANNED history row separate from the live COMPLETED row of the same procedure", () => {
    // After a session completes, the tooth holds the old PLANNED chart entry
    // (now SUPERSEDED, kept for the ledger) plus the new ACTIVE COMPLETED entry
    // and its derived twin. Only the two live COMPLETED rows fold — the history
    // row must not be swallowed (that would erase it and could hide the work).
    const supersededPlanned = entry({
      id: "old", toothNumbers: [16], type: "PLANNED", status: "SUPERSEDED",
      label: "Composite", code: "D2391", surfaces: ["M", "O"],
      treatmentProcedureId: "tp1", treatmentPlanId: "plan1",
    });
    const activeCompleted = entry({
      id: "new", toothNumbers: [16], type: "COMPLETED", status: "ACTIVE",
      label: "Composite", code: "D2391", surfaces: ["M", "O"],
      treatmentProcedureId: "tp1", treatmentPlanId: "plan1",
    });
    const derived = entry({
      id: "proc-tp1-t16", toothNumbers: [16], type: "COMPLETED", status: "ACTIVE",
      label: "Composite", code: "D2391", surfaces: ["M", "O"],
      treatmentProcedureId: "tp1", treatmentPlanId: "plan1", totalPrice: 900,
    });
    const merged = mergeChartEntries([supersededPlanned, activeCompleted, derived]);
    expect(merged).toHaveLength(2);
    expect(merged.some((m) => m.status === "SUPERSEDED" && m.type === "PLANNED")).toBe(true);
    expect(merged.some((m) => m.status === "ACTIVE" && m.type === "COMPLETED")).toBe(true);
  });

  it("folds in metadata from the other row on a score tie — drops nothing (M3)", () => {
    // Neither row carries procedure ids (score 0 each), but each has a different
    // unique field. A tie must not discard the loser's field.
    const a = entry({
      id: "a", toothNumbers: [11], type: "PLANNED", label: "Crown", code: "D2740",
      totalPrice: 1200,
    });
    const b = entry({
      id: "b", toothNumbers: [11], type: "PLANNED", label: "Crown", code: "D2740",
      procedureStatus: "PLANNED", currency: "UGX",
    });
    const merged = mergeChartEntries([a, b]);
    expect(merged).toHaveLength(1);
    const m = merged[0];
    expect(m.id).toBe("a");                    // first row stays the base
    expect(m.totalPrice).toBe(1200);           // from a
    expect(m.procedureStatus).toBe("PLANNED"); // folded in from b
    expect(m.currency).toBe("UGX");            // folded in from b
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// layerForEntry
// ─────────────────────────────────────────────────────────────────────────────

describe("layerForEntry", () => {
  it("maps conditions and existing work straight through, ignoring any status", () => {
    expect(layerForEntry({ type: "CONDITION", procedureStatus: "IN_PROGRESS" })).toBe("CONDITION");
    expect(layerForEntry({ type: "EXISTING", procedureStatus: "ON_HOLD" })).toBe("EXISTING");
  });

  it("keeps PLANNED and COMPLETED in their own layers", () => {
    expect(layerForEntry({ type: "PLANNED", procedureStatus: "PLANNED" })).toBe("PLANNED");
    expect(layerForEntry({ type: "PLANNED", procedureStatus: undefined })).toBe("PLANNED");
    expect(layerForEntry({ type: "COMPLETED", procedureStatus: "COMPLETED" })).toBe("COMPLETED");
  });

  it("promotes IN_PROGRESS to its own layer instead of COMPLETED", () => {
    // The persisted entry is still type PLANNED while mid-treatment.
    expect(layerForEntry({ type: "PLANNED", procedureStatus: "IN_PROGRESS" })).toBe("IN_PROGRESS");
  });

  it("greys ON_HOLD / PENDING / REFERRED into the INACTIVE layer instead of hiding them", () => {
    expect(layerForEntry({ type: "PLANNED", procedureStatus: "ON_HOLD" })).toBe("INACTIVE");
    expect(layerForEntry({ type: "PLANNED", procedureStatus: "PENDING" })).toBe("INACTIVE");
    expect(layerForEntry({ type: "PLANNED", procedureStatus: "REFERRED" })).toBe("INACTIVE");
  });

  it("resolves the persisted + live rows of one IN_PROGRESS procedure to the same layer (dedup)", () => {
    // apiAsEntries keeps the persisted type (PLANNED); procAsEntries derives
    // type from status. Both must land on IN_PROGRESS so they merge to one row.
    const persisted = layerForEntry({ type: "PLANNED", procedureStatus: "IN_PROGRESS" });
    const live = layerForEntry({ type: "PLANNED", procedureStatus: "IN_PROGRESS" });
    expect(persisted).toBe(live);
    expect(persisted).toBe("IN_PROGRESS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toLocalISODate (H4 — evening records must not roll to the wrong day)
// ─────────────────────────────────────────────────────────────────────────────

describe("toLocalISODate", () => {
  it("formats an instant as YYYY-MM-DD in local time, round-trip stable", () => {
    // Build a local-time instant, serialise to a UTC ISO string, then format
    // back: the local calendar date must survive regardless of the test TZ.
    const local = new Date(2026, 0, 5, 22, 30); // 5 Jan 2026, 22:30 local
    expect(toLocalISODate(local.toISOString())).toBe("2026-01-05");
  });

  it("falls back to the raw date portion for an unparseable value", () => {
    expect(toLocalISODate("not-a-date")).toBe("not-a-date");
  });

  it("returns today's local date (YYYY-MM-DD) when given no argument", () => {
    expect(toLocalISODate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Paint precedence (#2 whole-tooth pick, #3 CONDITION never hidden)
// ─────────────────────────────────────────────────────────────────────────────

describe("layerPriority / LAYER_PAINT_PRIORITY", () => {
  it("ranks every layer, higher index = higher priority", () => {
    // Sanity: the list has no gaps and indexOf round-trips.
    LAYER_PAINT_PRIORITY.forEach((layer, i) => {
      expect(layerPriority(layer)).toBe(i);
    });
  });

  it("ranks CONDITION highest so an active diagnosis is never buried (#3)", () => {
    expect(layerPriority("CONDITION")).toBe(LAYER_PAINT_PRIORITY.length - 1);
    expect(layerPriority("CONDITION")).toBeGreaterThan(layerPriority("EXISTING"));
    expect(layerPriority("CONDITION")).toBeGreaterThan(layerPriority("COMPLETED"));
    expect(layerPriority("CONDITION")).toBeGreaterThan(layerPriority("IN_PROGRESS"));
  });

  it("ranks PLANNED above EXISTING so a planned replacement wins over the old work (#2)", () => {
    expect(layerPriority("PLANNED")).toBeGreaterThan(layerPriority("EXISTING"));
    expect(layerPriority("IN_PROGRESS")).toBeGreaterThan(layerPriority("EXISTING"));
  });

  it("ranks RESOLVED lowest, then INACTIVE, so parked/resolved work never overrides real findings", () => {
    // RESOLVED conditions paint first (greyed, under everything); INACTIVE
    // (on-hold/referred) sits just above. Both stay below the restorative
    // baseline so a live finding is never hidden.
    expect(layerPriority("RESOLVED")).toBe(0);
    expect(layerPriority("INACTIVE")).toBe(1);
    expect(layerPriority("INACTIVE")).toBeLessThan(layerPriority("EXISTING"));
    expect(layerPriority("RESOLVED")).toBeLessThan(layerPriority("INACTIVE"));
  });

  it("ranks an unknown layer -1 so a future un-prioritised layer fails safe (loses)", () => {
    // @ts-expect-error — deliberately passing a layer not in the precedence list
    expect(layerPriority("MYSTERY")).toBe(-1);
  });
});

describe("highestPriorityEntry (#2 whole-tooth restoration pick)", () => {
  it("returns null for no candidates", () => {
    expect(highestPriorityEntry([])).toBeNull();
  });

  it("picks the PLANNED replacement crown over the EXISTING crown (#2)", () => {
    // Order deliberately puts EXISTING first — `.find()` would have wrongly
    // returned it; precedence must still pick the PLANNED replacement.
    const existing = entry({ id: "existing", type: "EXISTING", label: "Crown", code: "D2740" });
    const planned = entry({ id: "planned", type: "PLANNED", label: "Crown", code: "D2740", procedureStatus: "PLANNED" });
    expect(highestPriorityEntry([existing, planned])?.id).toBe("planned");
    // ...and is order-insensitive.
    expect(highestPriorityEntry([planned, existing])?.id).toBe("planned");
  });

  it("picks an IN_PROGRESS crown over a PLANNED one", () => {
    const planned = entry({ id: "planned", type: "PLANNED", procedureStatus: "PLANNED" });
    const inProgress = entry({ id: "inprog", type: "PLANNED", procedureStatus: "IN_PROGRESS" });
    expect(highestPriorityEntry([planned, inProgress])?.id).toBe("inprog");
  });

  it("does not let an ON_HOLD (INACTIVE) entry beat an EXISTING restoration", () => {
    const existing = entry({ id: "existing", type: "EXISTING" });
    const onHold = entry({ id: "onhold", type: "PLANNED", procedureStatus: "ON_HOLD" });
    expect(highestPriorityEntry([existing, onHold])?.id).toBe("existing");
  });

  it("keeps the earliest candidate on a tie (stable)", () => {
    const first = entry({ id: "first", type: "EXISTING" });
    const second = entry({ id: "second", type: "EXISTING" });
    expect(highestPriorityEntry([first, second])?.id).toBe("first");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// restorationKind / pickRestoration / isBridgePonticEntry (M-1)
// ─────────────────────────────────────────────────────────────────────────────

describe("restorationKind", () => {
  it("classifies by CDT code range", () => {
    expect(restorationKind({ type: "COMPLETED", code: "D6240", label: "x" })).toBe("BRIDGE_PONTIC");
    expect(restorationKind({ type: "COMPLETED", code: "D6750", label: "x" })).toBe("BRIDGE_RETAINER");
    expect(restorationKind({ type: "COMPLETED", code: "D2961", label: "x" })).toBe("VENEER");
    expect(restorationKind({ type: "COMPLETED", code: "D1351", label: "x" })).toBe("SEALANT");
    expect(restorationKind({ type: "PLANNED", code: "D8080", label: "x" })).toBe("ORTHODONTIC");
    expect(restorationKind({ type: "COMPLETED", code: "D5213", label: "x" })).toBe("DENTURE");
    expect(restorationKind({ type: "COMPLETED", code: "D2740", label: "x" })).toBe("CROWN");
  });

  it("never classifies a CONDITION row", () => {
    expect(restorationKind({ type: "CONDITION", code: "D2740", label: "Crown" })).toBeNull();
  });

  it("returns null for fillings / endo / scaling (no glyph)", () => {
    expect(restorationKind({ type: "COMPLETED", code: "D2391", label: "Composite" })).toBeNull();
    expect(restorationKind({ type: "COMPLETED", code: "D3330", label: "Root canal" })).toBeNull();
    expect(restorationKind({ type: "COMPLETED", code: "D1110", label: "Scaling" })).toBeNull();
  });

  it("falls back to a narrowed label when there is no CDT code", () => {
    expect(restorationKind({ type: "COMPLETED", label: "Pontic 26" })).toBe("BRIDGE_PONTIC");
    expect(restorationKind({ type: "PLANNED", label: "PFM bridge abutment" })).toBe("BRIDGE_RETAINER");
    expect(restorationKind({ type: "COMPLETED", label: "Porcelain veneer" })).toBe("VENEER");
    expect(restorationKind({ type: "COMPLETED", label: "Fissure sealant" })).toBe("SEALANT");
    expect(restorationKind({ type: "PLANNED", label: "Orthodontic brackets" })).toBe("ORTHODONTIC");
    expect(restorationKind({ type: "COMPLETED", label: "Partial denture" })).toBe("DENTURE");
    expect(restorationKind({ type: "COMPLETED", label: "PFM crown" })).toBe("CROWN");
  });

  it("does not paint a glyph for a non-placement label (consult / removal / crown lengthening)", () => {
    expect(restorationKind({ type: "PLANNED", label: "Crown consultation" })).toBeNull();
    expect(restorationKind({ type: "PLANNED", label: "Remove bridge" })).toBeNull();
    expect(restorationKind({ type: "PLANNED", label: "Crown lengthening" })).toBeNull();
    expect(restorationKind({ type: "PLANNED", label: "Veneer evaluation" })).toBeNull();
  });

  it("prefers the code over an ambiguous label", () => {
    // Code says pontic; label says "bridge" (which alone → retainer). Code wins.
    expect(restorationKind({ type: "COMPLETED", code: "D6240", label: "bridge" })).toBe("BRIDGE_PONTIC");
  });
});

describe("pickRestoration", () => {
  it("returns null when no entry bears a glyph", () => {
    expect(pickRestoration([entry({ type: "COMPLETED", code: "D2391", label: "Composite" })])).toBeNull();
  });

  it("ranks a structural crown over a surface sealant on the same tooth", () => {
    const sealant = entry({ type: "COMPLETED", code: "D1351", label: "Sealant" });
    const crown = entry({ type: "COMPLETED", code: "D2740", label: "Crown" });
    expect(pickRestoration([sealant, crown])).toBe("CROWN");
    expect(pickRestoration([crown, sealant])).toBe("CROWN");
  });

  it("ranks a bridge retainer over a crown", () => {
    const crown = entry({ type: "COMPLETED", code: "D2740", label: "Crown" });
    const retainer = entry({ type: "COMPLETED", code: "D6750", label: "Retainer crown" });
    expect(pickRestoration([crown, retainer])).toBe("BRIDGE_RETAINER");
  });
});

describe("isBridgePonticEntry", () => {
  it("is true for a pontic, false otherwise", () => {
    expect(isBridgePonticEntry({ type: "COMPLETED", code: "D6240", label: "x" })).toBe(true);
    expect(isBridgePonticEntry({ type: "COMPLETED", code: "D2740", label: "Crown" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolvePresence — pontic & retained root (M-1)
// ─────────────────────────────────────────────────────────────────────────────

describe("resolvePresence — pontic & retained root", () => {
  it("renders a bridge pontic instead of the bare extraction X over an extracted site", () => {
    const extracted = entry({ type: "CONDITION", chartPresenceEffect: "EXTRACTED" });
    const pontic = entry({ type: "COMPLETED", code: "D6240", label: "Pontic" });
    const ps = resolvePresence([extracted, pontic]);
    expect(ps.primary).toBe("PONTIC");
    expect(ps.wasExtracted).toBe(true); // socket indicator still flagged
  });

  it("resolves a retained root from chartPresenceEffect, beating EXTRACTED", () => {
    expect(resolvePresence([entry({ chartPresenceEffect: "RETAINED_ROOT" })]).primary).toBe("RETAINED_ROOT");
  });

  it("resolves a retained root from the K08.3 ICD fallback", () => {
    expect(resolvePresence([entry({ code: "K08.3" })]).primary).toBe("RETAINED_ROOT");
  });

  it("still lets an implant outrank a pontic on the same site", () => {
    const pontic = entry({ type: "PLANNED", code: "D6240", label: "Pontic" });
    const implant = entry({ type: "COMPLETED", code: "D6010", label: "Implant" });
    expect(resolvePresence([pontic, implant]).primary).toBe("IMPLANT");
  });
});
