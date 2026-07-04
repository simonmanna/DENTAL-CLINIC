import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TreatmentPlansService } from './treatment-plans.service';

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
 * The same endpoint is also exposed to admins as
 *   POST /treatment-plans/:id/procedures/reconcile-invoices
 * for on-demand recovery.
 */
@Injectable()
export class ReconcileInvoiceDriftCron {
  private readonly logger = new Logger(ReconcileInvoiceDriftCron.name);

  constructor(private readonly plans: TreatmentPlansService) {}

  @Cron('*/15 * * * *')
  async run() {
    try {
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
    } catch (err) {
      this.logger.error(`[invoice-drift] cron error: ${err}`);
    }
  }
}
