// src/treatment-plans/treatment-plans.module.ts
import { Module } from '@nestjs/common';
import { TreatmentPlansController } from './treatment-plans.controller';
import { TreatmentPlansService } from './treatment-plans.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingModule } from '../billing/billing.module';
import { ConditionsModule } from '../conditions/conditions.module';
import { ReconcileInvoiceDriftCron } from './reconcile-invoice-drift.cron';
@Module({
  imports: [PrismaModule, BillingModule, ConditionsModule],
  controllers: [TreatmentPlansController],
  providers: [TreatmentPlansService, ReconcileInvoiceDriftCron],
  exports: [TreatmentPlansService],
})
export class TreatmentPlansModule {}
