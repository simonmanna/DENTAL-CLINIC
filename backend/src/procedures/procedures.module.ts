// src/procedures/procedures.module.ts
import { Module } from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import {
  ProceduresController,
  VisitProceduresController,
} from './procedures.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingModule } from '../billing/billing.module';
import { ProcedureCategoriesController } from './procedure-categories.controller';
import { ProcedureCategoriesService } from './procedure-categories.service';

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [
    ProceduresController,
    VisitProceduresController,
    ProcedureCategoriesController,
  ],
  providers: [ProceduresService, ProcedureCategoriesService],
  exports: [ProceduresService, ProcedureCategoriesService],
})
export class ProceduresModule {}
