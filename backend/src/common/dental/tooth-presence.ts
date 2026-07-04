// src/common/dental/tooth-presence.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the "is this tooth present / restorable?" rule.
//
// Absence is DATA-DRIVEN: a tooth counts as absent when a clinically-live
// (ACTIVE / MONITORED, not soft-deleted) PatientCondition on it maps to an
// absence effect — either the catalog condition's `chartPresenceEffect`
// (EXTRACTED / CONGENITAL) OR the legacy ICD-10 codes (K08.1 acquired loss /
// K00.0 congenital absence). Honouring `chartPresenceEffect` means a clinic's
// custom extraction condition (different code) is still respected, instead of
// relying on hard-coded ICD strings.
//
// Call `assertToothPresence` at EVERY write boundary that records surface-level
// work (conditions, restorative procedures) so a caries "MOD" can never land on
// a tooth already charted as extracted. It throws BadRequestException so NestJS
// returns a clean 400.
// ─────────────────────────────────────────────────────────────────────────────

import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Accepts either the root PrismaService or a `$transaction` client. */
type ToothPresenceDb = Prisma.TransactionClient;

/**
 * Returns the subset of the supplied FDI teeth that are recorded ABSENT.
 *
 * Detection is DUAL-SOURCE so it is correct no matter which path recorded the
 * absence (the two clinical models can drift):
 *   1. PatientCondition — the diagnosis record (batch "Add Condition" dialog,
 *      single create). ACTIVE / MONITORED, not soft-deleted.
 *   2. ChartEntry       — the chart marking (quick-action ADD_CONDITION creates
 *      one of these with NO PatientCondition). type CONDITION, status ACTIVE.
 * In both, absence is matched by the catalog `chartPresenceEffect`
 * (EXTRACTED / CONGENITAL) OR the legacy ICD codes (K08.1 / K00.0).
 *
 * Empty input → empty set (no query issued). Results are tolerant of an
 * undefined mock return (`?? []`) so unit tests need not stub both queries.
 */
export async function findAbsentTeeth(
  db: ToothPresenceDb,
  patientId: string,
  toothNumbers: (number | null | undefined)[],
): Promise<Set<number>> {
  const teeth = [
    ...new Set(
      toothNumbers.filter((n): n is number => typeof n === 'number'),
    ),
  ];
  if (teeth.length === 0) return new Set<number>();

  const [condRows, chartRows] = await Promise.all([
    db.patientCondition.findMany({
      where: {
        patientId,
        toothNumber: { in: teeth },
        deletedAt: null,
        status: { in: ['ACTIVE', 'MONITORED'] },
        condition: {
          OR: [
            { chartPresenceEffect: { in: ['EXTRACTED', 'CONGENITAL'] } },
            { icd10Code: { in: ['K08.1', 'K00.0'] } }, // acquired loss / congenital
          ],
        },
      },
      select: { toothNumber: true },
    }),
    db.chartEntry.findMany({
      where: {
        patientId,
        toothNumber: { in: teeth },
        type: 'CONDITION',
        status: 'ACTIVE',
        OR: [
          { conditionCode: { in: ['K08.1', 'K00.0'] } },
          { condition: { chartPresenceEffect: { in: ['EXTRACTED', 'CONGENITAL'] } } },
        ],
      },
      select: { toothNumber: true },
    }),
  ]);

  const absent = new Set<number>();
  for (const r of [...(condRows ?? []), ...(chartRows ?? [])]) {
    if (r?.toothNumber != null) absent.add(r.toothNumber);
  }
  return absent;
}

/**
 * Guards surface-level work against an absent tooth.
 *
 *  · No surfaces supplied → no-op. A non-surface finding (e.g. pain, sensitivity)
 *    may legitimately be recorded against an absent / phantom site, and recording
 *    the absence itself (extraction/congenital conditions carry no surfaces) must
 *    never be blocked.
 *  · Any surface-bearing entry whose tooth is recorded absent → BadRequestException.
 *
 * Safe to call with the root client or a transaction client.
 */
export async function assertToothPresence(
  db: ToothPresenceDb,
  params: {
    patientId: string;
    toothNumbers: (number | null | undefined)[];
    surfaces?: (string | null | undefined)[] | null;
  },
): Promise<void> {
  const hasSurfaces = (params.surfaces?.filter(Boolean).length ?? 0) > 0;
  if (!hasSurfaces) return;

  const absent = await findAbsentTeeth(db, params.patientId, params.toothNumbers);
  if (absent.size === 0) return;

  for (const t of params.toothNumbers) {
    if (typeof t === 'number' && absent.has(t)) {
      throw new BadRequestException(
        `Tooth ${t} is recorded as absent — surface-level work cannot be recorded ` +
          `on a missing tooth. Restore the site first (implant / bridge / denture), ` +
          `or resolve the absence if it was recorded in error.`,
      );
    }
  }
}
