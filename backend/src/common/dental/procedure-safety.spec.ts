// Pure unit tests for the clinical-safety decision logic behind
// TreatmentPlansService.addProcedure. No DB / NestJS — these lock in the
// allow/deny rules for the absent-tooth and duplicate-procedure guards
// (test-plan cases D2–D7).

import {
  isReplacementProcedure,
  findToothPresenceViolation,
  findDuplicateProcedure,
} from './procedure-safety';

describe('isReplacementProcedure', () => {
  it('treats implant / fixed-prosth ADA codes (D6xxx) as replacements', () => {
    expect(isReplacementProcedure({ code: 'D6010', name: 'Surgical placement' })).toBe(true);
    expect(isReplacementProcedure({ code: 'd6058', name: '' })).toBe(true); // case-insensitive
    expect(isReplacementProcedure({ code: 'D6240', name: 'Pontic' })).toBe(true);
  });

  it('treats removable-prosth ADA codes (D5xxx) as replacements', () => {
    expect(isReplacementProcedure({ code: 'D5110', name: 'Complete denture' })).toBe(true);
  });

  it('falls back to a name match when there is no code', () => {
    expect(isReplacementProcedure({ name: 'Implant placement' })).toBe(true);
    expect(isReplacementProcedure({ name: 'Porcelain-fused bridge' })).toBe(true);
    expect(isReplacementProcedure({ name: 'Removable partial denture' })).toBe(true);
    expect(isReplacementProcedure({ name: 'Space maintainer' })).toBe(true);
    expect(isReplacementProcedure({ name: 'Fixed prosthesis' })).toBe(true);
  });

  it('does NOT treat ordinary restorative/endodontic work as a replacement', () => {
    expect(isReplacementProcedure({ code: 'D2740', name: 'Porcelain crown' })).toBe(false);
    expect(isReplacementProcedure({ code: 'D2150', name: 'Amalgam filling' })).toBe(false);
    expect(isReplacementProcedure({ name: 'Composite filling' })).toBe(false);
    expect(isReplacementProcedure({ name: 'Root canal therapy' })).toBe(false);
    expect(isReplacementProcedure({})).toBe(false);
  });
});

describe('findToothPresenceViolation', () => {
  const absent = new Set([36]);

  it('allows work on a present tooth', () => {
    expect(
      findToothPresenceViolation({
        toothNumbers: [11],
        hasSurfaces: true,
        absentTeeth: absent,
        isReplacement: false,
      }),
    ).toBeNull();
  });

  it('blocks SURFACE work on an absent tooth (D3) — even for a replacement', () => {
    expect(
      findToothPresenceViolation({
        toothNumbers: [36],
        hasSurfaces: true,
        absentTeeth: absent,
        isReplacement: false,
      }),
    ).toEqual({ kind: 'SURFACE_ON_ABSENT', tooth: 36 });

    // A pontic site still has no crown surfaces — surface work is never valid.
    expect(
      findToothPresenceViolation({
        toothNumbers: [36],
        hasSurfaces: true,
        absentTeeth: absent,
        isReplacement: true,
      }),
    ).toEqual({ kind: 'SURFACE_ON_ABSENT', tooth: 36 });
  });

  it('blocks a whole-tooth NON-replacement procedure on an absent tooth (D2)', () => {
    expect(
      findToothPresenceViolation({
        toothNumbers: [36],
        hasSurfaces: false,
        absentTeeth: absent,
        isReplacement: false,
      }),
    ).toEqual({ kind: 'PROCEDURE_ON_ABSENT', tooth: 36 });
  });

  it('ALLOWS a whole-tooth replacement procedure on an absent tooth (D4)', () => {
    expect(
      findToothPresenceViolation({
        toothNumbers: [36],
        hasSurfaces: false,
        absentTeeth: absent,
        isReplacement: true,
      }),
    ).toBeNull();
  });

  it('returns the first violating tooth in a mixed selection', () => {
    expect(
      findToothPresenceViolation({
        toothNumbers: [11, 36],
        hasSurfaces: false,
        absentTeeth: absent,
        isReplacement: false,
      }),
    ).toEqual({ kind: 'PROCEDURE_ON_ABSENT', tooth: 36 });
  });

  it('is a no-op when nothing is absent or no teeth are targeted', () => {
    expect(
      findToothPresenceViolation({
        toothNumbers: [11, 21],
        hasSurfaces: true,
        absentTeeth: absent,
        isReplacement: false,
      }),
    ).toBeNull();
    expect(
      findToothPresenceViolation({
        toothNumbers: [],
        hasSurfaces: false,
        absentTeeth: absent,
        isReplacement: false,
      }),
    ).toBeNull();
  });
});

describe('findDuplicateProcedure', () => {
  it('returns null when there is no existing active procedure', () => {
    expect(
      findDuplicateProcedure({ toothNumbers: [26], surfaces: [], existing: [] }),
    ).toBeNull();
  });

  it('flags a whole-tooth duplicate on the same tooth (D6)', () => {
    expect(
      findDuplicateProcedure({
        toothNumbers: [26],
        surfaces: [],
        existing: [{ targets: [{ toothNumber: 26, surfaces: [] }] }],
      }),
    ).toBe(26);
  });

  it('allows the same procedure on a DIFFERENT surface of one tooth (D7)', () => {
    expect(
      findDuplicateProcedure({
        toothNumbers: [16],
        surfaces: ['DISTAL', 'OCCLUSAL'],
        existing: [{ targets: [{ toothNumber: 16, surfaces: ['MESIAL', 'OCCLUSAL'] }] }],
      }),
    ).toBe(16); // OCCLUSAL overlaps → duplicate

    expect(
      findDuplicateProcedure({
        toothNumbers: [16],
        surfaces: ['DISTAL'],
        existing: [{ targets: [{ toothNumber: 16, surfaces: ['MESIAL'] }] }],
      }),
    ).toBeNull(); // no surface overlap → distinct work
  });

  it('treats a whole-tooth procedure on either side as a collision', () => {
    // New whole-tooth vs existing surface-specific → collision.
    expect(
      findDuplicateProcedure({
        toothNumbers: [16],
        surfaces: [],
        existing: [{ targets: [{ toothNumber: 16, surfaces: ['MESIAL'] }] }],
      }),
    ).toBe(16);
    // New surface-specific vs existing whole-tooth → collision.
    expect(
      findDuplicateProcedure({
        toothNumbers: [16],
        surfaces: ['MESIAL'],
        existing: [{ targets: [{ toothNumber: 16, surfaces: [] }] }],
      }),
    ).toBe(16);
  });

  it('does not collide across different teeth', () => {
    expect(
      findDuplicateProcedure({
        toothNumbers: [26],
        surfaces: [],
        existing: [{ targets: [{ toothNumber: 36, surfaces: [] }] }],
      }),
    ).toBeNull();
  });

  it('flags a whole-mouth duplicate as -1', () => {
    expect(
      findDuplicateProcedure({
        toothNumbers: [],
        surfaces: [],
        existing: [{ targets: [] }],
      }),
    ).toBe(-1);
    // Whole-mouth new vs existing that targets specific teeth → not a duplicate.
    expect(
      findDuplicateProcedure({
        toothNumbers: [],
        surfaces: [],
        existing: [{ targets: [{ toothNumber: 11, surfaces: [] }] }],
      }),
    ).toBeNull();
  });
});
