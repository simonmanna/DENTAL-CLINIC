// src/visit/visit.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VisitsService } from './visit.service';
import { VisitsController } from './visit.controller';
import { ProgressReportsController } from './progress-reports.controller';
import { ProgressReportsService } from './progress-reports.service';

@Module({
  imports: [PrismaModule],
  controllers: [VisitsController, ProgressReportsController],
  providers: [VisitsService, ProgressReportsService],
  exports: [VisitsService, ProgressReportsService],
})
export class VisitModule {}
