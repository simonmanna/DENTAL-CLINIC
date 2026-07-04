// clinical-report.module.ts
import { Module } from '@nestjs/common';
import { ClinicalReportsController } from './clinical-report.controller';
import { ClinicalReportsService } from './clinical-report.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicalReportsController],
  providers: [ClinicalReportsService],
  exports: [ClinicalReportsService],
})
export class ClinicalReportsModule {}