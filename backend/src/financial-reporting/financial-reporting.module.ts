import { Module } from '@nestjs/common';
import { FinancialReportingController } from './financial-reporting.controller';
import { FinancialReportingService } from './financial-reporting.service';
import { NetReportService } from './net-report.service';
import { PrismaModule } from '../prisma/prisma.module';
 
@Module({
  imports: [PrismaModule],
  controllers: [FinancialReportingController],
  providers: [FinancialReportingService, NetReportService],
  exports: [FinancialReportingService],
})
export class FinancialReportingModule {}
