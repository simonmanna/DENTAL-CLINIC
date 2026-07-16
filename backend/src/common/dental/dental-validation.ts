// src/common/dental/dental-validation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Call these at EVERY write boundary that persists a tooth number or surfaces.
// They throw BadRequestException so NestJS turns them into clean 400s.
// ─────────────────────────────────────────────────────────────────────────────

import { BadRequestException } from '@nestjs/common';
import {
  isValidFdiTooth,
  normalizeSurfaces,
  getDentition,
  type CanonicalSurface,
} from './dental-notation';

/**
 * Validates a tooth number is a legal FDI code. Returns it untouched so you
 * can inline: `data.toothNumber = assertFdiTooth(dto.toothNumber)`.
 * Pass `optional: true` to allow null/undefined (arch/mouth-level entries).
 */
export function assertFdiTooth(
  tooth: number | null | undefined,
  opts: { optional?: boolean } = {},
): number | null {
  if (tooth === null || tooth === undefined) {
    if (opts.optional) return null;
    throw new BadRequestException('toothNumber is required');
  }
  if (!isValidFdiTooth(tooth)) {
    throw new BadRequestException(
      `Invalid tooth number "${tooth}". Must be a valid FDI code ` +
        `(11-18, 21-28, 31-38, 41-48 permanent; 51-55, 61-65, 71-75, 81-85 primary).`,
    );
  }
  return tooth;
}

/**
 * Normalizes + validates surfaces against the canonical enum for a given tooth.
 * Anything unrecognized is rejected (fail-closed) so we never silently store
 * a wrong surface on a clinical record.
 */
export function assertSurfaces(
  raw: (string | null | undefined)[] | null | undefined,
  fdi: number | null | undefined,
): CanonicalSurface[] {
  if (!raw || raw.length === 0) return [];
  if (fdi === null || fdi === undefined || !isValidFdiTooth(fdi)) {
    throw new BadRequestException(
      'Cannot record surfaces without a valid tooth number',
    );
  }
  // Detect rejects per value, not by comparing lengths: normalization may
  // legitimately collapse two provided values into one (e.g. OCCLUSAL+INCISAL
  // both fold onto the tooth's bite surface), which is not an error.
  const provided = raw.filter(Boolean) as string[];
  const bad = [...new Set(provided)].filter(
    (p) => normalizeSurfaces([p], fdi).length === 0,
  );
  if (bad.length > 0) {
    throw new BadRequestException(
      `Unrecognized tooth surface(s): ${bad.join(', ')}`,
    );
  }
  return normalizeSurfaces(raw, fdi);
}

/**
 * Guards a "missing tooth" semantic: a tooth flagged absent/extracted should
 * not also receive a surface-bearing restorative condition in the same active
 * set. Caller passes the already-active entries for the tooth.
 */
export function assertToothIsRestorable(
  fdi: number,
  activeEntries: { type: string; conditionCode?: string | null }[],
): void {
  const isAbsent = activeEntries.some(
    (e) =>
      e.type === 'CONDITION' &&
      (e.conditionCode === 'K08.1' || // acquired loss
        e.conditionCode === 'K00.0'), // congenital absence
  );
  if (isAbsent) {
    throw new BadRequestException(
      `Tooth ${fdi} is recorded as absent. Restore the tooth ` +
        `(implant/bridge pontic) before adding surface-level work.`,
    );
  }
}

export { getDentition };
