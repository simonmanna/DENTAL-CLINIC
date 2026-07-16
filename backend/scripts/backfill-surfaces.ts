// scripts/backfill-surfaces.ts
// ─────────────────────────────────────────────────────────────────────────────
// One-off backfill: re-normalize every stored ToothSurface[] against the
// tooth it belongs to. Fixes legacy rows saved before write-time O/I
// resolution existed (e.g. INCISAL persisted on a molar) and rewrites the
// arrays in canonical charting order (M, O/I, D, B, L).
//
// Dry-run by default — prints what WOULD change. Pass --apply to write.
//
//   npx ts-node scripts/backfill-surfaces.ts           # preview
//   npx ts-node scripts/backfill-surfaces.ts --apply   # write (BACKUP FIRST)
//
// Rows the script cannot resolve a tooth for (no toothNumber, or a
// multi-tooth row mixing anterior + posterior teeth) are skipped and counted.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import {
  normalizeSurfaces,
  isValidFdiTooth,
  getToothKind,
} from '../src/common/dental/dental-notation';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const sameArray = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// A tooth usable for bite resolution shared by ALL given teeth, or null when
// the set mixes anterior and posterior (remap would be ambiguous).
function resolveTooth(teeth: (number | null | undefined)[]): number | null {
  const valid = teeth.filter((t): t is number => t != null && isValidFdiTooth(t));
  if (valid.length === 0) return null;
  const bites = new Set(
    valid.map((t) => {
      const k = getToothKind(t);
      return k === 'incisor' || k === 'canine' ? 'I' : 'O';
    }),
  );
  return bites.size === 1 ? valid[0] : null;
}

interface Stats {
  scanned: number;
  changed: number;
  skippedNoTooth: number;
}

async function backfill(
  label: string,
  rows: { id: string; surfaces: string[]; teeth: (number | null | undefined)[] }[],
  update: (id: string, surfaces: string[]) => Promise<unknown>,
): Promise<Stats> {
  const stats: Stats = { scanned: rows.length, changed: 0, skippedNoTooth: 0 };
  for (const row of rows) {
    const tooth = resolveTooth(row.teeth);
    if (tooth === null) {
      stats.skippedNoTooth++;
      continue;
    }
    const normalized = normalizeSurfaces(row.surfaces, tooth);
    if (sameArray(row.surfaces, normalized)) continue;
    stats.changed++;
    console.log(
      `  ${label} ${row.id} (tooth ${tooth}): [${row.surfaces.join(', ')}] -> [${normalized.join(', ')}]`,
    );
    if (APPLY) await update(row.id, normalized);
  }
  return stats;
}

async function main() {
  console.log(APPLY ? '── APPLY mode — writing changes ──' : '── DRY RUN — pass --apply to write ──');
  const report: Record<string, Stats> = {};

  const chartEntries = await prisma.chartEntry.findMany({
    where: { surfaces: { isEmpty: false } },
    select: { id: true, surfaces: true, toothNumber: true },
  });
  report.ChartEntry = await backfill(
    'ChartEntry',
    chartEntries.map((r) => ({ id: r.id, surfaces: r.surfaces, teeth: [r.toothNumber] })),
    (id, surfaces) =>
      prisma.chartEntry.update({ where: { id }, data: { surfaces: surfaces as any } }),
  );

  const targets = await prisma.procedureTarget.findMany({
    where: { surfaces: { isEmpty: false } },
    select: { id: true, surfaces: true, toothNumber: true },
  });
  report.ProcedureTarget = await backfill(
    'ProcedureTarget',
    targets.map((r) => ({ id: r.id, surfaces: r.surfaces, teeth: [r.toothNumber] })),
    (id, surfaces) =>
      prisma.procedureTarget.update({ where: { id }, data: { surfaces: surfaces as any } }),
  );

  const conditions = await prisma.patientCondition.findMany({
    where: { surfaces: { isEmpty: false } },
    select: { id: true, surfaces: true, toothNumber: true },
  });
  report.PatientCondition = await backfill(
    'PatientCondition',
    conditions.map((r) => ({ id: r.id, surfaces: r.surfaces, teeth: [r.toothNumber] })),
    (id, surfaces) =>
      prisma.patientCondition.update({ where: { id }, data: { surfaces: surfaces as any } }),
  );

  // Sessions carry no tooth of their own — resolve via the parent procedure's
  // targets; skipped when those mix anterior and posterior teeth.
  const sessions = await prisma.procedureSession.findMany({
    where: { surfaces: { isEmpty: false } },
    select: {
      id: true,
      surfaces: true,
      treatmentProcedure: { select: { targets: { select: { toothNumber: true } } } },
    },
  });
  report.ProcedureSession = await backfill(
    'ProcedureSession',
    sessions.map((r) => ({
      id: r.id,
      surfaces: r.surfaces,
      teeth: (r.treatmentProcedure?.targets ?? []).map((t) => t.toothNumber),
    })),
    (id, surfaces) =>
      prisma.procedureSession.update({ where: { id }, data: { surfaces: surfaces as any } }),
  );

  const visitProcs = await prisma.visitProcedure.findMany({
    where: { surfaces: { isEmpty: false } },
    select: { id: true, surfaces: true, toothNumbers: true },
  });
  report.VisitProcedure = await backfill(
    'VisitProcedure',
    visitProcs.map((r) => ({ id: r.id, surfaces: r.surfaces, teeth: r.toothNumbers })),
    (id, surfaces) =>
      prisma.visitProcedure.update({ where: { id }, data: { surfaces: surfaces as any } }),
  );

  console.log('\n── Summary ──');
  for (const [model, s] of Object.entries(report)) {
    console.log(
      `${model}: ${s.scanned} scanned, ${s.changed} ${APPLY ? 'updated' : 'would change'}, ${s.skippedNoTooth} skipped (no/ambiguous tooth)`,
    );
  }
  if (!APPLY) console.log('\nDry run only. Re-run with --apply after a DB backup.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
