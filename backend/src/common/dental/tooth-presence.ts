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
// Advisory only: absence never blocks a write. Treatment planning uses it to
// return a soft warning, so a stale or wrong "missing" marker never stops the
// dentist from charting or planning.
// ─────────────────────────────────────────────────────────────────────────────

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
        AND: [
          {
            OR: [
              { conditionCode: { in: ['K08.1', 'K00.0'] } },
              { condition: { chartPresenceEffect: { in: ['EXTRACTED', 'CONGENITAL'] } } },
            ],
          },
          // A row whose diagnosis was resolved / ruled out (or that predates
          // conditionStatus) must not keep the tooth "absent".
          {
            OR: [
              { conditionStatus: null },
              { conditionStatus: { in: ['ACTIVE', 'MONITORED', 'IN_TREATMENT'] } },
            ],
          },
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
