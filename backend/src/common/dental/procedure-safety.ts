// src/common/dental/procedure-safety.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure clinical-safety decision logic for planning a treatment procedure.
//
// Extracted from TreatmentPlansService.addProcedure so the rules are unit-tested
// without a database: the service performs the Prisma reads (which teeth are
// absent, which procedures are already active) and then delegates the *decision*
// to these pure functions. Mirrors the fail-closed pure-guard pattern in
// dental-validation.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Procedures that are LEGITIMATELY placed on a missing tooth — implants and
 * fixed partial dentures / bridges (ADA D6xxx), removable prosthodontics /
 * dentures (D5xxx), and space maintainers. These are exempt from the
 * absent-tooth block; everything else (filling, natural crown, RCT, scaling …)
 * cannot target a tooth that isn't there.
 */
export function isReplacementProcedure(p: {
  code?: string | null;
  name?: string | null;
}): boolean {
  const code = (p.code ?? '').toUpperCase();
  if (/^D5\d/.test(code) || /^D6\d/.test(code)) return true;
  return /implant|bridge|pontic|denture|prosth|space\s*maintain/i.test(
    p.name ?? '',
  );
}

/**
 * Procedures whose COMPLETION renders the tooth ABSENT (it is removed from the
 * mouth): simple + surgical extractions. Used to auto-record an acquired-loss
 * (K08.1) absence marker when such a procedure is completed, so the dual-source
 * tooth-presence guard then blocks later surface/restorative work on that site.
 *
 * Match is conservative: explicit extraction wording, or ADA simple/surgical
 * extraction code ranges (D7111/D7140 simple, D7210–D7251 surgical). Other
 * D72xx oral-surgery codes (biopsies, etc.) are intentionally NOT matched.
 */
export function isExtractionProcedure(p: {
  code?: string | null;
  name?: string | null;
}): boolean {
  const code = (p.code ?? '').toUpperCase().trim();
  if (/^D7(111|140)$/.test(code)) return true; // simple extraction
  if (/^D72(1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[01])$/.test(code)) return true; // surgical D7210–D7251
  return /\bextraction\b|\bextract\b|\bexodontia\b/i.test(p.name ?? '');
}

export type PresenceViolation =
  | { kind: 'SURFACE_ON_ABSENT'; tooth: number }
  | { kind: 'PROCEDURE_ON_ABSENT'; tooth: number };

/**
 * Decides whether a procedure may target the requested teeth given the set of
 * teeth currently recorded ABSENT (by a clinically-live EXTRACTED / CONGENITAL
 * condition). Returns the FIRST violation found, or null if the plan is allowed.
 *
 *   · Surface-level work on an absent tooth → never allowed (no crown surfaces).
 *   · Whole-tooth work on an absent tooth   → allowed only for a replacement
 *     procedure (implant / bridge / denture); blocked otherwise.
 *   · Work on a present tooth               → always allowed here.
 */
export function findToothPresenceViolation(args: {
  toothNumbers: number[];
  hasSurfaces: boolean;
  absentTeeth: ReadonlySet<number>;
  isReplacement: boolean;
}): PresenceViolation | null {
  const { toothNumbers, hasSurfaces, absentTeeth, isReplacement } = args;
  for (const t of toothNumbers) {
    if (!absentTeeth.has(t)) continue;
    if (hasSurfaces) return { kind: 'SURFACE_ON_ABSENT', tooth: t };
    if (!isReplacement) return { kind: 'PROCEDURE_ON_ABSENT', tooth: t };
  }
  return null;
}

export interface ExistingProcedureTarget {
  toothNumber: number | null;
  surfaces: string[];
}

/**
 * Detects an accidental duplicate of an already-active procedure (the caller
 * pre-filters `existing` to the same procedure on the same patient with a
 * non-terminal status). Returns:
 *   · the conflicting tooth number, or
 *   · -1 for a whole-mouth / arch duplicate (no specific tooth), or
 *   · null when there is no duplicate.
 *
 * Surface-specific work only collides when the surfaces overlap, so an MO and a
 * separate DO composite on the same tooth are NOT duplicates; two whole-tooth
 * procedures (e.g. two crowns) on the same tooth always are.
 */
export function findDuplicateProcedure(args: {
  toothNumbers: number[];
  surfaces: (string | null | undefined)[];
  existing: { targets: ExistingProcedureTarget[] }[];
}): number | null {
  const { toothNumbers, surfaces, existing } = args;
  if (existing.length === 0) return null;

  // Whole-mouth / arch procedure (no specific tooth): any active instance of
  // the same procedure is a duplicate.
  if (toothNumbers.length === 0) {
    const dup = existing.some(
      (e) =>
        e.targets.length === 0 || e.targets.every((t) => t.toothNumber == null),
    );
    return dup ? -1 : null;
  }

  const newSurfaces = new Set(
    (surfaces ?? []).filter(Boolean).map((s) => String(s).toUpperCase()),
  );
  for (const e of existing) {
    for (const tgt of e.targets) {
      if (tgt.toothNumber == null || !toothNumbers.includes(tgt.toothNumber))
        continue;
      const ex = new Set((tgt.surfaces ?? []).map((s) => String(s).toUpperCase()));
      // Whole-tooth on either side, or any overlapping surface, = duplicate.
      const wholeTooth = newSurfaces.size === 0 || ex.size === 0;
      const overlap = [...newSurfaces].some((s) => ex.has(s));
      if (wholeTooth || overlap) return tgt.toothNumber;
    }
  }
  return null;
}
