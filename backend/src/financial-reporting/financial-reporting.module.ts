import { Module } from '@nestjs/common';
import { FinancialReportingController } from './financial-reporting.controller';
import { FinancialReportingService } from './financial-reporting.service';
import { PrismaModule } from '../prisma/prisma.module';
 
@Module({
  imports: [PrismaModule],
  controllers: [FinancialReportingController],
  providers: [FinancialReportingService],
  exports: [FinancialReportingService],
})
export class FinancialReportingModule {}
