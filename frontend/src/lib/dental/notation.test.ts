import { describe, it, expect } from "vitest";
import {
  uiToCanonical,
  canonicalToUi,
  biteCode,
  isValidFdi,
  isPrimary,
  toothKind,
  getArchOf,
  getQuadrant,
  isToothAbsent,
  toothName,
} from "./notation";

// Representative teeth spanning every (arch × anterior/posterior) combination.
const UPPER_ANTERIOR = 11; // UR central incisor
const UPPER_CANINE = 13; // UR canine (still "anterior" for B → LABIAL)
const UPPER_POSTERIOR = 16; // UR 1st molar
const LOWER_ANTERIOR = 31; // LL central incisor
const LOWER_POSTERIOR = 36; // LL 1st molar

describe("uiToCanonical", () => {
  it("maps position-independent surfaces directly", () => {
    expect(uiToCanonical("M", UPPER_POSTERIOR)).toBe("MESIAL");
    expect(uiToCanonical("D", UPPER_POSTERIOR)).toBe("DISTAL");
    expect(uiToCanonical("O", UPPER_POSTERIOR)).toBe("OCCLUSAL");
    expect(uiToCanonical("I", UPPER_ANTERIOR)).toBe("INCISAL");
  });

  it("resolves B to BUCCAL on posteriors and LABIAL on anteriors", () => {
    expect(uiToCanonical("B", UPPER_POSTERIOR)).toBe("BUCCAL");
    expect(uiToCanonical("B", LOWER_POSTERIOR)).toBe("BUCCAL");
    expect(uiToCanonical("B", UPPER_ANTERIOR)).toBe("LABIAL");
    expect(uiToCanonical("B", UPPER_CANINE)).toBe("LABIAL");
    expect(uiToCanonical("B", LOWER_ANTERIOR)).toBe("LABIAL");
  });

  it("resolves L to PALATAL on the upper arch and LINGUAL on the lower arch", () => {
    expect(uiToCanonical("L", UPPER_ANTERIOR)).toBe("PALATAL");
    expect(uiToCanonical("L", UPPER_POSTERIOR)).toBe("PALATAL");
    expect(uiToCanonical("L", LOWER_ANTERIOR)).toBe("LINGUAL");
    expect(uiToCanonical("L", LOWER_POSTERIOR)).toBe("LINGUAL");
  });
});

describe("canonicalToUi", () => {
  it("collapses the 9-value canonical enum back to 6 UI codes", () => {
    expect(canonicalToUi("MESIAL")).toBe("M");
    expect(canonicalToUi("DISTAL")).toBe("D");
    expect(canonicalToUi("OCCLUSAL")).toBe("O");
    expect(canonicalToUi("INCISAL")).toBe("I");
    expect(canonicalToUi("BUCCAL")).toBe("B");
    expect(canonicalToUi("LABIAL")).toBe("B");
    expect(canonicalToUi("FACIAL")).toBe("B");
    expect(canonicalToUi("LINGUAL")).toBe("L");
    expect(canonicalToUi("PALATAL")).toBe("L");
  });

  it("falls back to O for unknown values", () => {
    expect(canonicalToUi("NONSENSE")).toBe("O");
    expect(canonicalToUi("")).toBe("O");
  });
});

describe("round-trip UI → canonical → UI", () => {
  // For M/D/O/I the round trip is lossless. For B/L it is lossless at the UI
  // layer (B↔BUCCAL/LABIAL, L↔LINGUAL/PALATAL both collapse back to B/L).
  const teeth = [UPPER_ANTERIOR, UPPER_POSTERIOR, LOWER_ANTERIOR, LOWER_POSTERIOR];
  for (const fdi of teeth) {
    for (const code of ["M", "D", "O", "B", "L"] as const) {
      it(`tooth ${fdi}: ${code} survives the round trip`, () => {
        expect(canonicalToUi(uiToCanonical(code, fdi))).toBe(code);
      });
    }
  }
});

describe("biteCode", () => {
  it("is I (incisal) for anteriors and O (occlusal) for posteriors", () => {
    expect(biteCode(UPPER_ANTERIOR)).toBe("I");
    expect(biteCode(UPPER_CANINE)).toBe("I");
    expect(biteCode(UPPER_POSTERIOR)).toBe("O");
    expect(biteCode(LOWER_POSTERIOR)).toBe("O");
  });
});

describe("fdi helpers", () => {
  it("validates permanent and primary FDI numbers, rejects junk", () => {
    expect(isValidFdi(11)).toBe(true);
    expect(isValidFdi(48)).toBe(true);
    expect(isValidFdi(51)).toBe(true); // primary
    expect(isValidFdi(0)).toBe(false);
    expect(isValidFdi(19)).toBe(false); // not a real FDI quadrant slot
    expect(isValidFdi(99)).toBe(false);
    expect(isValidFdi(11.5)).toBe(false);
  });

  it("derives quadrant, arch, primary flag and kind", () => {
    expect(getQuadrant(16)).toBe(1);
    expect(getQuadrant(36)).toBe(3);
    expect(getArchOf(16)).toBe("UPPER");
    expect(getArchOf(36)).toBe("LOWER");
    expect(getArchOf(55)).toBe("UPPER"); // primary upper-right
    expect(isPrimary(55)).toBe(true);
    expect(isPrimary(16)).toBe(false);
    expect(toothKind(11)).toBe("incisor");
    expect(toothKind(13)).toBe("canine");
    expect(toothKind(14)).toBe("premolar");
    expect(toothKind(16)).toBe("molar");
  });
});

describe("isToothAbsent", () => {
  const base = { status: "ACTIVE", type: "CONDITION" };
  it("is true for an active K08.1 (acquired) or K00.0 (congenital) condition", () => {
    expect(isToothAbsent([{ ...base, code: "K08.1" }])).toBe(true);
    expect(isToothAbsent([{ ...base, code: "K00.0" }])).toBe(true);
  });
  it("is false for non-absence codes, non-conditions, or inactive rows", () => {
    expect(isToothAbsent([{ ...base, code: "K02.9" }])).toBe(false);
    expect(isToothAbsent([{ status: "ACTIVE", type: "PLANNED", code: "K08.1" }])).toBe(false);
    expect(isToothAbsent([{ status: "SUPERSEDED", type: "CONDITION", code: "K08.1" }])).toBe(false);
    expect(isToothAbsent([])).toBe(false);
  });
});

// ── Regression: the ToothDetailDrawer previously held a Universal-keyed
//    TOOTH_NAMES map (1→UR 8, 2→UR 7, …, 18→LL 2nd molar, …) that mislabelled
//    every FDI tooth the user clicked. The drawer now imports `toothName`
//    from THIS module, so the only way to regress is to change the names
//    table here. Lock the canonical FDI → label mapping so any drift
//    surfaces in tests before it surfaces at the chair-side.
//
//    The expected labels must match `NAMES` in ./notation.ts verbatim.
//    If you change either side, change both — and re-check every place
//    these labels render (tooth header, chart tooltip, ledger rows).
describe("toothName (FDI canonical — regression for drawer mislabeling bug)", () => {
  it("UR quadrant (1×): 18..11 read upper-right, posterior→anterior", () => {
    expect(toothName(18)).toBe("UR 3rd Molar");
    expect(toothName(17)).toBe("UR 2nd Molar");
    expect(toothName(16)).toBe("UR 1st Molar");
    expect(toothName(15)).toBe("UR 2nd PM");
    expect(toothName(14)).toBe("UR 1st PM");
    expect(toothName(13)).toBe("UR Canine");
    expect(toothName(12)).toBe("UR Lateral Incisor");
    expect(toothName(11)).toBe("UR Central Incisor");
  });

  it("UL quadrant (2×): 21..28 read upper-left, anterior→posterior", () => {
    expect(toothName(21)).toBe("UL Central Incisor");
    expect(toothName(23)).toBe("UL Canine");
    expect(toothName(26)).toBe("UL 1st Molar");
    expect(toothName(28)).toBe("UL 3rd Molar");
  });

  it("LL quadrant (3×): 31..38 read lower-left, anterior→posterior", () => {
    expect(toothName(31)).toBe("LL Central Incisor");
    expect(toothName(33)).toBe("LL Canine");
    expect(toothName(36)).toBe("LL 1st Molar");
    expect(toothName(38)).toBe("LL 3rd Molar");
  });

  it("LR quadrant (4×): 41..48 read lower-right, anterior→posterior", () => {
    expect(toothName(41)).toBe("LR Central Incisor");
    expect(toothName(43)).toBe("LR Canine");
    expect(toothName(46)).toBe("LR 1st Molar");
    expect(toothName(48)).toBe("LR 3rd Molar");
  });

  it("primary dentition (5×/6×/7×/8×) reads as Primary …", () => {
    expect(toothName(51)).toBe("UR Primary Central");
    expect(toothName(55)).toBe("UR Primary 2nd Molar");
    expect(toothName(75)).toBe("LL Primary 2nd Molar");
  });

  it("returns a graceful fallback for out-of-range FDI numbers", () => {
    expect(toothName(99)).toBe("Tooth 99");
    expect(toothName(0)).toBe("Tooth 0");
  });

  it("matches every key in the canonical FDI set (drift guard)", () => {
    // Walk every tooth the chart can render and confirm it resolves to a
    // non-fallback label. If anyone adds a tooth to FDI_PERMANENT/FDI_PRIMARY
    // without adding a row to NAMES, this test fails immediately.
    const all = [
      18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
      48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
      55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
      85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
    ];
    for (const fdi of all) {
      const label = toothName(fdi);
      expect(label, `toothName(${fdi}) should not be the generic fallback`).not.toBe(`Tooth ${fdi}`);
    }
  });
});
