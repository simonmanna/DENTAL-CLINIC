// src/treatment-plans/treatment-plans-edit.module.ts
// Register the edit service + controller.
// Import this module into your AppModule (or merge into existing TreatmentPlansModule).

import { Module } from '@nestjs/common';
import { TreatmentPlansEditController } from './treatment-plans-edit.controller';
import { TreatmentPlansEditService } from './treatment-plans-edit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TreatmentPlansModule } from './treatment-plans.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, TreatmentPlansModule, BillingModule],
  controllers: [TreatmentPlansEditController],
  providers: [TreatmentPlansEditService],
  exports: [TreatmentPlansEditService], // expose so TreatmentPlansModule can inject it too
})
export class TreatmentPlansEditModule {}

// ─── HOW TO USE ───────────────────────────────────────────────────────────────
//
// Option A — add to AppModule imports array:
//   import { TreatmentPlansEditModule } from './treatment-plans/treatment-plans-edit.module';
//   @Module({ imports: [..., TreatmentPlansEditModule] })
//
// Option B — merge into existing TreatmentPlansModule:
//   Add TreatmentPlansEditController to controllers[],
//   Add TreatmentPlansEditService    to providers[],
//   No separate module file needed.
//
// ─── ROUTE SUMMARY ───────────────────────────────────────────────────────────
//
//  GET  /treatment-plans/:planId/procedures/:procedureId/delete-eligibility
//  PATCH /treatment-plans/:planId/procedures/:procedureId/edit
//  POST  /treatment-plans/:planId/procedures/:procedureId/cancel
//  DELETE /treatment-plans/:planId/procedures/:procedureId
