import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FinancialReportingService } from './financial-reporting.service';
import { FinancialReportQueryDto } from './dto/financial-report-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ReportAuditInterceptor } from '../reports-common';

@ApiTags('Financial Reports')
@ApiBearerAuth()
@UseInterceptors(ReportAuditInterceptor)
@Controller('financial-reporting')
export class FinancialReportingController {
  constructor(private readonly service: FinancialReportingService) {}

  /**
   * All financial reports are gated to MANAGER+ — financial data is
   * sensitive and must not be exposed to dental/clinical staff or
   * receptionists. SUPER_ADMIN bypass applies.
   */
  @Get('invoices')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DENTIST, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Invoice register + KPIs (revenue, collection rate, by doctor)' })
  getInvoicesReport(@Query() query: FinancialReportQueryDto) {
    return this.service.getInvoicesReport(query);
  }

  @Get('receipts')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DENTIST, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Receipt register with payment method breakdown' })
  getReceiptsReport(@Query() query: FinancialReportQueryDto) {
    return this.service.getReceiptsReport(query);
  }

  @Get('payments')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DENTIST, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Payment register with reconciliation status' })
  getPaymentsReport(@Query() query: FinancialReportQueryDto) {
    return this.service.getPaymentsReport(query);
  }

  @Get('expenses')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DENTIST, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Expense report grouped by category' })
  getExpensesReport(@Query() query: FinancialReportQueryDto) {
    return this.service.getExpensesReport(query);
  }
}