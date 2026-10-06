import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TreatmentPlansService } from './treatment-plans.service';
import { PrismaService } from '../prisma/prisma.service';

/** Advisory-lock key for this job (any stable 64-bit number). */
const DRIFT_LOCK_KEY = 7_301_006_120_000;

/**
 * Periodic safety net for the billing-drift window between
 *   (a) treatment_procedure committed
 *   (b) draft invoice_item created (post-commit, async)
 *
 * The post-commit step is fire-and-forget: a transient failure leaves a
 * non-cancelled TreatmentProcedure with zero linked InvoiceItems. Without
 * this cron, that flag is invisible until a cashier notices the missing
 * line at checkout — silent lost revenue.
 *
 * This job runs every 15 minutes, calls reconcileMissingInvoiceItems(),
 * and surfaces the result in the application log:
 *   • scanned:  how many procedures had no invoice item
 *   • repaired: how many were recovered this run
 *   • stillFailing: ids the auto-repair could not fix (logged at ERROR)
 *
 * Since addProcedure bills inside its own transaction this is a pure safety
 * net. Every app instance schedules it, so the run is guarded by a
 * transaction-scoped Postgres advisory lock: one instance sweeps, the others
 * skip (two concurrent sweeps could otherwise race to bill the same line).
 *
 * The same endpoint is also exposed to admins as
 *   POST /treatment-plans/:id/procedures/reconcile-invoices
 * for on-demand recovery.
 */
@Injectable()
export class ReconcileInvoiceDriftCron {
  private readonly logger = new Logger(ReconcileInvoiceDriftCron.name);

  constructor(
    private readonly plans: TreatmentPlansService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('*/15 * * * *')
  async run() {
    try {
      // The lock lives as long as this transaction; the sweep itself runs on
      // other pooled connections.
      await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
            SELECT pg_try_advisory_xact_lock(${DRIFT_LOCK_KEY}::bigint) AS locked`;
          if (!rows?.[0]?.locked) return;
          await this.sweep();
        },
        { maxWait: 5000, timeout: 10 * 60 * 1000 },
      );
    } catch (err) {
      this.logger.error(`[invoice-drift] cron error: ${err}`);
    }
  }

  private async sweep() {
    {
      const result = await this.plans.reconcileMissingInvoiceItems();
      if (result.scanned > 0 || result.repaired > 0) {
        this.logger.log(
          `[invoice-drift] scanned=${result.scanned} ` +
            `repaired=${result.repaired} ` +
            `stillFailing=${result.stillFailing.length}`,
        );
      }
      if (result.stillFailing.length > 0) {
        this.logger.error(
          `[invoice-drift] still failing after retry: ${result.stillFailing.join(', ')}`,
        );
      }
    }
  }
}
