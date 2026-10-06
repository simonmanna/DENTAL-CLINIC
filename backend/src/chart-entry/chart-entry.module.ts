// src/treatment-plans/chart-entry.module.ts
// ─────────────────────────────────────────────────────────────────────────────
// Wire this into your existing TreatmentPlansModule, or as a standalone module.
// ─────────────────────────────────────────────────────────────────────────────

import { Module } from '@nestjs/common';
import { ChartEntryController } from './chart-entry.controller';
import { ChartEntryService } from './chart-entry.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TreatmentPlansModule } from '../treatment-plans/treatment-plans.module';

@Module({
  // Quick actions delegate to TreatmentPlansService (no cycle: the plans
  // module does not import this one).
  imports: [PrismaModule, TreatmentPlansModule],
  controllers: [ChartEntryController],
  providers: [ChartEntryService],
  exports: [ChartEntryService],  // export so TreatmentPlansModule can inject it
})
export class ChartEntryModule {}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION: Add to your existing TreatmentPlansModule
// ─────────────────────────────────────────────────────────────────────────────
//
// import { ChartEntryService } from './chart-entry.service';
// import { ChartEntryController } from './chart-entry.controller';
//
// @Module({
//   controllers: [TreatmentPlansController, ChartEntryController],
//   providers: [TreatmentPlansService, ChartEntryService],
// })
// export class TreatmentPlansModule {}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION: Add to app.module.ts imports array
// ─────────────────────────────────────────────────────────────────────────────
//
// import { ChartEntryModule } from './treatment-plans/chart-entry.module';
//
// @Module({
//   imports: [
//     ...existing,
//     ChartEntryModule,
//   ],
// })
// export class AppModule {}
