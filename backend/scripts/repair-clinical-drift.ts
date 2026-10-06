// scripts/repair-clinical-drift.ts
// ─────────────────────────────────────────────────────────────────────────────
// One-off repair of clinical / billing drift left by defects fixed in the
// clinical hardening (2026-10-06). Run BEFORE go-live, after a backup.
//
//   npx ts-node -r tsconfig-paths/register scripts/repair-clinical-drift.ts          # dry run
//   npx ts-node -r tsconfig-paths/register scripts/repair-clinical-drift.ts --apply  # write
//
// Every change writes an audit_logs row (module DATA_REPAIR). Steps:
//   1. CONDITION chart rows out of step with their PatientCondition (rows
//      greyed out by another tooth's resolution, ruled-out diagnoses still
//      painting, deleted diagnoses still live) → status / conditionStatus
//      resynced; rows of deleted diagnoses voided.
//   2. Restored procedures whose only invoice line is VOID (never re-billed)
//      → billing reinstated (or billed afresh).
//   3. COMPLETED procedures that still have ACTIVE PLANNED chart markers
//      (status set COMPLETED through the edit endpoint) → markers superseded,
//      COMPLETED markers written, linked diagnoses re-evaluated. Extractions
//      are listed for a clinician to confirm the absence marker.
//   4. "Tooth absent" markers produced by an extraction session that was
//      later voided → voided.
//   5. More than one ACTIVE invoice line for one procedure → reported; the
//      extra lines on DRAFT invoices are voided (POSTED ones need a credit
//      note — listed only).
// ─────────────────────────────────────────────────────────────────────────────
import { NestFactory } from '@nestjs/core';
import {
  ChartEntryStatus,
  InvoiceStatus,
  PatientConditionStatus,
  Prisma,
  TreatmentStatus,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InvoiceLifecycleService } from '../src/billing/invoice-lifecycle.service';
import { TreatmentPlansService } from '../src/treatment-plans/treatment-plans.service';
import { chartStatusForCondition } from '../src/conditions/conditions.service';

const APPLY = process.argv.includes('--apply');
const REASON = 'Clinical drift repair (2026-10-06)';

type Counter = Record<string, number>;
const counts: Counter = {};
const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

async function audit(
  db: Prisma.TransactionClient,
  entityType: string,
  recordId: string,
  oldData: unknown,
  newData: unknown,
) {
  await db.auditLog.create({
    data: {
      action: 'REPAIR',
      module: 'DATA_REPAIR',
      entityType,
      recordId,
      oldData: oldData as Prisma.InputJsonValue,
      newData: newData as Prisma.InputJsonValue,
      reason: REASON,
    },
  });
}

// ── 1 ────────────────────────────────────────────────────────────────────────
async function resyncConditionRows(prisma: PrismaService) {
  const rows = await prisma.chartEntry.findMany({
    where: {
      type: 'CONDITION',
      status: { in: [ChartEntryStatus.ACTIVE, ChartEntryStatus.RESOLVED] },
      patientConditionId: { not: null },
    },
    select: {
      id: true,
      status: true,
      conditionStatus: true,
      patientCondition: { select: { status: true, deletedAt: true } },
    },
  });
  for (const r of rows) {
    const pc = r.patientCondition;
    if (!pc) continue;
    const want = pc.deletedAt
      ? { status: ChartEntryStatus.VOIDED, conditionStatus: r.conditionStatus }
      : {
          status: chartStatusForCondition(pc.status),
          conditionStatus: pc.status as PatientConditionStatus,
        };
    if (want.status === r.status && want.conditionStatus === r.conditionStatus) continue;
    bump('1. condition chart rows resynced');
    console.log(
      `  [1] chart ${r.id}: ${r.status}/${r.conditionStatus} → ${want.status}/${want.conditionStatus}`,
    );
    if (!APPLY) continue;
    await prisma.$transaction(async (tx) => {
      await tx.chartEntry.update({ where: { id: r.id }, data: want });
      await audit(tx, 'ChartEntry', r.id, { status: r.status, conditionStatus: r.conditionStatus }, want);
    });
  }
}

// ── 2 ────────────────────────────────────────────────────────────────────────
async function rebillRestoredProcedures(
  prisma: PrismaService,
  lifecycle: InvoiceLifecycleService,
  plans: TreatmentPlansService,
) {
  const tps = await prisma.treatmentProcedure.findMany({
    where: {
      deletedAt: null,
      status: { notIn: [TreatmentStatus.CANCELLED, TreatmentStatus.DELETED] },
      invoiceItems: {
        some: { status: 'VOID', invoice: { status: { not: InvoiceStatus.VOID } } },
        none: { status: 'ACTIVE', invoice: { status: { not: InvoiceStatus.VOID } } },
      },
    },
    select: { id: true, status: true },
  });
  for (const tp of tps) {
    bump('2. restored procedures re-billed');
    console.log(`  [2] procedure ${tp.id} (${tp.status}) has only VOID invoice lines`);
    if (!APPLY) continue;
    const res = await prisma.$transaction(async (tx) => {
      const r = await lifecycle.reinstateProcedureBillingTx(tx, tp.id, null);
      await audit(tx, 'TreatmentProcedure', tp.id, { billing: 'VOID only' }, r);
      return r;
    });
    if (res.needsNewItem) await plans.billProcedureSafe(tp.id);
  }
}

// ── 3 ────────────────────────────────────────────────────────────────────────
async function completeChartForCompletedProcedures(
  prisma: PrismaService,
  plans: TreatmentPlansService,
) {
  const tps = await prisma.treatmentProcedure.findMany({
    where: {
      deletedAt: null,
      status: TreatmentStatus.COMPLETED,
      chartEntries: { some: { type: 'PLANNED', status: 'ACTIVE' } },
    },
    include: {
      procedure: { select: { name: true, code: true } },
      treatmentPlan: { select: { patientId: true } },
      chartEntries: { where: { status: 'ACTIVE' } },
    },
  });
  for (const tp of tps) {
    const planned = tp.chartEntries.filter((c) => c.type === 'PLANNED');
    const isExtraction = /extract/i.test(tp.procedure.name ?? '');
    bump('3. completed procedures with live PLANNED markers');
    console.log(
      `  [3] procedure ${tp.id} "${tp.procedure.name}" COMPLETED with ${planned.length} PLANNED marker(s)` +
        (isExtraction ? ' — EXTRACTION: confirm the tooth-absent marker manually' : ''),
    );
    if (!APPLY) continue;
    await prisma.$transaction(async (tx) => {
      for (const p of planned) {
        await tx.chartEntry.update({
          where: { id: p.id },
          data: { status: 'SUPERSEDED', notes: `${p.notes ?? ''}\n[${REASON}]`.trim() },
        });
        const hasCompleted = tp.chartEntries.some(
          (c) => c.type === 'COMPLETED' && c.toothNumber === p.toothNumber,
        );
        if (!hasCompleted) {
          await tx.chartEntry.create({
            data: {
              patientId: tp.treatmentPlan.patientId,
              visitId: p.visitId,
              toothNumber: p.toothNumber,
              surfaces: p.surfaces,
              type: 'COMPLETED',
              status: 'ACTIVE',
              label: tp.procedure.name,
              procedureCode: tp.procedure.code,
              treatmentProcedureId: tp.id,
              providerId: p.providerId,
              notes: `Completed (${REASON}).`,
            },
          });
        }
      }
      await plans.syncConditionsForProcedureTx(tx, tp.id, null);
      await audit(tx, 'TreatmentProcedure', tp.id, { plannedMarkers: planned.map((p) => p.id) }, { superseded: planned.length });
    });
  }
}

// ── 4 ────────────────────────────────────────────────────────────────────────
async function voidOrphanedAbsenceMarkers(prisma: PrismaService) {
  const markers = await prisma.chartEntry.findMany({
    where: {
      type: 'CONDITION',
      status: 'ACTIVE',
      conditionCode: 'K08.1',
      procedureSession: { OR: [{ deletedAt: { not: null } }, { status: 'VOIDED' }] },
    },
    select: { id: true, toothNumber: true, procedureSessionId: true },
  });
  for (const m of markers) {
    bump('4. absence markers of voided extractions');
    console.log(`  [4] marker ${m.id} tooth ${m.toothNumber} (session ${m.procedureSessionId} voided)`);
    if (!APPLY) continue;
    await prisma.$transaction(async (tx) => {
      await tx.chartEntry.update({
        where: { id: m.id },
        data: { status: 'VOIDED', notes: `[VOIDED] ${REASON}: extraction session was voided.` },
      });
      await audit(tx, 'ChartEntry', m.id, { status: 'ACTIVE' }, { status: 'VOIDED' });
    });
  }
  const unlinked = await prisma.chartEntry.count({
    where: {
      type: 'CONDITION',
      status: 'ACTIVE',
      conditionCode: 'K08.1',
      procedureSessionId: null,
      notes: 'Auto-recorded on completion of extraction procedure.',
    },
  });
  if (unlinked) {
    console.log(
      `  [4] ${unlinked} older auto-recorded absence marker(s) carry no session link — review manually.`,
    );
  }
}

// ── 5 ────────────────────────────────────────────────────────────────────────
async function dedupeActiveInvoiceItems(
  prisma: PrismaService,
  lifecycle: InvoiceLifecycleService,
) {
  const dups = await prisma.$queryRaw<Array<{ tp: string; n: bigint }>>`
    SELECT "treatmentProcedureId" AS tp, COUNT(*) AS n
    FROM "invoice_items"
    WHERE status = 'ACTIVE' AND "treatmentProcedureId" IS NOT NULL
    GROUP BY "treatmentProcedureId" HAVING COUNT(*) > 1`;
  for (const d of dups) {
    const items = await prisma.invoiceItem.findMany({
      where: { treatmentProcedureId: d.tp, status: 'ACTIVE' },
      include: { invoice: { select: { id: true, status: true, invoiceNumber: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const [, ...extra] = items;
    bump('5. procedures with duplicate active lines');
    for (const it of extra) {
      const posted = it.invoice.status === InvoiceStatus.POSTED;
      console.log(
        `  [5] procedure ${d.tp}: extra line ${it.id} on ${it.invoice.invoiceNumber} (${it.invoice.status})` +
          (posted ? ' — POSTED: issue a credit note' : ''),
      );
      if (!APPLY || posted || it.invoice.status !== InvoiceStatus.DRAFT) continue;
      await prisma.$transaction(async (tx) => {
        await tx.invoiceItem.update({ where: { id: it.id }, data: { status: 'VOID' } });
        await lifecycle.recalcInvoiceTx(tx, it.invoice.id);
        await audit(tx, 'InvoiceItem', it.id, { status: 'ACTIVE' }, { status: 'VOID', duplicateOf: items[0].id });
      });
    }
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const lifecycle = app.get(InvoiceLifecycleService);
    const plans = app.get(TreatmentPlansService);
    console.log(APPLY ? '── APPLYING repairs ──' : '── DRY RUN (pass --apply to write) ──');
    await resyncConditionRows(prisma);
    await rebillRestoredProcedures(prisma, lifecycle, plans);
    await completeChartForCompletedProcedures(prisma, plans);
    await voidOrphanedAbsenceMarkers(prisma);
    await dedupeActiveInvoiceItems(prisma, lifecycle);
    console.log('\nSummary:');
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
    if (Object.keys(counts).length === 0) console.log('  nothing to repair');
    if (!APPLY) console.log('\n(dry run — nothing written)');
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
