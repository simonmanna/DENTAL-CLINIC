import {
  Controller,
  Get,
  Query,
  Param,
  Res,
  StreamableFile,
  Header,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { VisitReportQueryDto, ExportReportDto } from './dto/report.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ReportAuditInterceptor, renderCsv } from '../reports-common';

export enum ReportPeriod {
  TODAY = 'today',
  THIS_WEEK = 'this_week',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_YEAR = 'this_year',
  CUSTOM = 'custom',
}

export enum ReportType {
  SUMMARY = 'summary',
  FINANCIAL = 'financial',
  CLINICAL = 'clinical',
  PATIENT = 'patient',
  DENTIST = 'dentist',
  PROCEDURE = 'procedure',
PATIENT_VISITS = 'patient_visits',
}

@ApiTags('Reports')
@ApiBearerAuth()
@UseInterceptors(ReportAuditInterceptor)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly svc: ReportsService,
  ) {}

  @Get()
@Roles(
    UserRole.RECEPTIONIST,
    UserRole.DENTIST,
    UserRole.NURSE,
    UserRole.ADMIN,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
@ApiOperation({ summary: 'Get reports by type and period' })
async getReports(
  @Query('type') type?: ReportType,
  @Query('period') period?: ReportPeriod,
  @Query('startDate') startDate?: string,
  @Query('endDate') endDate?: string,
) {
  return this.svc.getVisitReports({
    type: type || ReportType.SUMMARY,
    period: period || ReportPeriod.THIS_MONTH,
    startDate,
    endDate,
  });
}
  // ═════════════════════════════════════════════════════════════════════════════
  // LEGACY DASHBOARD & ANALYTICS REPORTS
  // ═════════════════════════════════════════════════════════════════════════════

  // In your reports.controller.ts, find the method that has these lines (around line 226)
// and replace it with:

async getDashboardReport(type: ReportType = ReportType.SUMMARY) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  const reportPromises = [
    this.svc.getVisitReports({
      type,
      period: ReportPeriod.CUSTOM,
      startDate: today.toISOString(),
      endDate: tomorrow.toISOString(),
    }),
    this.svc.getVisitReports({
      type,
      period: ReportPeriod.CUSTOM,
      startDate: monthStart.toISOString(),
      endDate: monthEnd.toISOString(),
    }),
  ];
  
  const [todayReport, thisMonthReport] = await Promise.all(reportPromises);
  
  // Handle different report types
  let todaySummary, thisMonthSummary;
  
  if (type === ReportType.SUMMARY) {
    todaySummary = (todayReport as any).summary;
    thisMonthSummary = (thisMonthReport as any).summary;
  } else if (type === ReportType.FINANCIAL) {
    todaySummary = (todayReport as any).summary;
    thisMonthSummary = (thisMonthReport as any).summary;
  } else {
    todaySummary = todayReport;
    thisMonthSummary = thisMonthReport;
  }
  
  return {
    today: todaySummary,
    thisMonth: thisMonthSummary,
    activeVisits: await this.svc.getActiveVisitsCount(),
  };
}
// async getDashboardData() {
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);
//   const tomorrow = new Date(today);
//   tomorrow.setDate(today.getDate() + 1);
  
//   const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
//   const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
//   const [todayReport, thisMonthReport, recentVisitsReport] = await Promise.all([
//     this.svc.getSummaryReport(today, tomorrow),
//     this.svc.getSummaryReport(monthStart, monthEnd),
//     this.svc.getVisitReports({
//       type: ReportType.DETAILED,
//       period: ReportPeriod.CUSTOM,
//       startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
//       endDate: new Date().toISOString(),
//       limit: 10,
//     }),
//   ]);
  
//   return {
//     today: todayReport.summary,
//     thisMonth: thisMonthReport.summary,
//     activeVisits: await this.svc.getActiveVisitsCount(),
//     recentVisits: (recentVisitsReport as any).data || [],
//   };
// }

@Get('dashboard')
  @Roles(
    UserRole.RECEPTIONIST,
    UserRole.DENTIST,
    UserRole.NURSE,
    UserRole.ADMIN,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  getDashboard() {
    return this.svc.getDashboardSummary();
  }

  @Get('revenue')
  @Roles(UserRole.ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getRevenue(
    @Query('startDate') s: string,
    @Query('endDate') e: string,
    @Query('groupBy') g: any,
  ) {
    return this.svc.getRevenueReport(s, e, g);
  }

  @Get('appointments')
  @Roles(
    UserRole.RECEPTIONIST,
    UserRole.DENTIST,
    UserRole.NURSE,
    UserRole.ADMIN,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  getAppointments(
    @Query('startDate') s: string,
    @Query('endDate') e: string,
  ) {
    return this.svc.getAppointmentReport(s, e);
  }

  @Get('procedures')
  @Roles(
    UserRole.DENTIST,
    UserRole.ADMIN,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  getProcedures(
    @Query('startDate') s: string,
    @Query('endDate') e: string,
  ) {
    return this.svc.getProcedureReport(s, e);
  }

  @Get('retention')
  @Roles(UserRole.ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getRetention() {
    return this.svc.getPatientRetentionReport();
  }

  @Get('dentist-performance')
  @Roles(
    UserRole.DENTIST,
    UserRole.ADMIN,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  getDentistPerformance(
    @Query('startDate') s: string,
    @Query('endDate') e: string,
  ) {
    return this.svc.getDentistPerformance(s, e);
  }

  @Get('inventory')
  @Roles(UserRole.ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getInventory() {
    return this.svc.getInventoryReport();
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // VISIT REPORTS (merged from VisitsController)
  // ═════════════════════════════════════════════════════════════════════════════

  @Get('visits')
    @Roles(
      UserRole.DENTIST,
      UserRole.NURSE,
      UserRole.RECEPTIONIST,
      UserRole.ADMIN,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    )
    @ApiOperation({ summary: 'Get visit reports with various filters' })
    async getVisitReports(@Query() query: VisitReportQueryDto) {
      return this.svc.getVisitReports(query);
    }

    @Get('visits/summary')
    @Roles(
      UserRole.DENTIST,
      UserRole.NURSE,
      UserRole.RECEPTIONIST,
      UserRole.ADMIN,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    )
    @ApiOperation({ summary: 'Get visit summary report' })
    async getVisitSummaryReport(
      @Query('period') period?: ReportPeriod,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
    ) {
      return this.svc.getVisitReports({
        type: ReportType.SUMMARY,
        period: period || ReportPeriod.THIS_MONTH,
        startDate,
        endDate,
      });
    }

    @Get('visits/financial')
    @Roles(UserRole.ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Get visit financial report' })
    async getVisitFinancialReport(
      @Query('period') period?: ReportPeriod,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
    ) {
      return this.svc.getVisitReports({
        type: ReportType.FINANCIAL,
        period: period || ReportPeriod.THIS_MONTH,
        startDate,
        endDate,
      });
    }

    @Get('visits/clinical')
    @Roles(
      UserRole.DENTIST,
      UserRole.NURSE,
      UserRole.ADMIN,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    )
    @ApiOperation({ summary: 'Get visit clinical report' })
    async getVisitClinicalReport(
      @Query('period') period?: ReportPeriod,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
    ) {
      return this.svc.getVisitReports({
        type: ReportType.CLINICAL,
        period: period || ReportPeriod.THIS_MONTH,
        startDate,
        endDate,
      });
    }

    @Get('visits/patient/:patientId')
    @Roles(
      UserRole.DENTIST,
      UserRole.NURSE,
      UserRole.RECEPTIONIST,
      UserRole.ADMIN,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    )
    @ApiOperation({ summary: 'Get patient-specific visit report' })
    async getVisitPatientReport(
      @Param('patientId') patientId: string,
      @Query('period') period?: ReportPeriod,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
    ) {
      return this.svc.getVisitReports({
        type: ReportType.PATIENT,
        period: period || ReportPeriod.THIS_MONTH,
        startDate,
        endDate,
        patientId,
      });
    }

    @Get('visits/dentist/:dentistId')
    @Roles(
      UserRole.DENTIST,
      UserRole.ADMIN,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    )
    @ApiOperation({ summary: 'Get dentist-specific visit report' })
    async getVisitDentistReport(
      @Param('dentistId') dentistId: string,
      @Query('period') period?: ReportPeriod,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
    ) {
      return this.svc.getVisitReports({
        type: ReportType.DENTIST,
        period: period || ReportPeriod.THIS_MONTH,
        startDate,
        endDate,
        dentistId,
      });
    }

    @Get('visits/procedures')
    @Roles(
      UserRole.DENTIST,
      UserRole.ADMIN,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    )
    @ApiOperation({ summary: 'Get visit procedure performance report' })
    async getVisitProcedureReport(
      @Query('period') period?: ReportPeriod,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
    ) {
      return this.svc.getVisitReports({
        type: ReportType.PROCEDURE,
        period: period || ReportPeriod.THIS_MONTH,
        startDate,
        endDate,
      });
    }

    @Get('visits/export/csv')
    @Roles(UserRole.ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Export visit report to CSV' })
    @Header('Content-Type', 'text/csv')
    async exportVisitsToCSV(
      @Query() query: ExportReportDto,
      @Res({ passthrough: true }) res: Response,
    ) {
      const csv = await this.svc.exportReportToCSV(query);
      const filename = `visit_report_${query.type}_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return new StreamableFile(Buffer.from(csv));
    }

  @Get('visits/dashboard-stats')
  @Roles(
    UserRole.ADMIN,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Get dashboard statistics for manager view' })
async getVisitDashboardStats() {
  const [todayReport, thisMonthReport] = await Promise.all([
    this.svc.getVisitReports({
      type: ReportType.SUMMARY,
      period: ReportPeriod.TODAY,
    }),
    this.svc.getVisitReports({
      type: ReportType.SUMMARY,
      period: ReportPeriod.THIS_MONTH,
    }),
  ]);

  // Extract summary from the response objects
  const todaySummary = (todayReport as any).summary;
  const thisMonthSummary = (thisMonthReport as any).summary;

  return {
    today: todaySummary,
    thisMonth: thisMonthSummary,
    activeVisits: await this.svc.getActiveVisitsCount(), // Fixed method name
    recentVisits: (await this.svc.getAllVisits({ limit: 10 })).data,
  };
}

@Get('visits/patient-visits')
@Roles(
  UserRole.DENTIST,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
)
async getPatientVisitReports(@Query() query: VisitReportQueryDto) {
  if (query.type === ReportType.PATIENT_VISITS) {
    return this.svc.getPatientVisitsReport(query);
  }
  return this.svc.getVisitReports(query);
}

// ═════════════════════════════════════════════════════════════════════════════
// NEW REPORTS (Phase 3)
// ═════════════════════════════════════════════════════════════════════════════

@Get('recall')
@Roles(
  UserRole.RECEPTIONIST,
  UserRole.DENTIST,
  UserRole.NURSE,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
)
@ApiOperation({
  summary: 'Recall list — patients overdue for hygiene/recall (default 6 months)',
})
async getRecallList(
  @Query('intervalMonths') intervalMonths?: string,
  @Query('limit') limit?: string,
) {
  const months = Math.min(
    24,
    Math.max(1, parseInt(intervalMonths || '6', 10) || 6),
  );
  const safeLimit = Math.min(
    1000,
    Math.max(1, parseInt(limit || '200', 10) || 200),
  );
  return this.svc.getRecallList(months, safeLimit);
}

@Get('ar-aging')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiOperation({
  summary: 'A/R aging report — outstanding invoices grouped by age bucket',
})
async getArAging(@Query('asOf') asOf?: string) {
  const refDate = asOf ? new Date(asOf) : undefined;
  return this.svc.getArAgingReport(refDate);
}

@Get('kpi')
@Roles(
  UserRole.DENTIST,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
)
@ApiOperation({
  summary: 'KPI dashboard — today, this-week, this-month snapshots',
})
async getKpiDashboard() {
  return this.svc.getKpiDashboard();
}

@Get('treatment-plan-conversion')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiOperation({
  summary: 'Treatment plan conversion funnel — offered → accepted → completed',
})
async getTreatmentPlanConversion(
  @Query('startDate') startDate?: string,
  @Query('endDate') endDate?: string,
) {
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = startDate
    ? new Date(startDate)
    : new Date(new Date().setMonth(new Date().getMonth() - 3));
  return this.svc.getTreatmentPlanConversion(start, end);
}

@Get('hygienist-productivity')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiOperation({ summary: 'Hygienist productivity — visits + sessions per hygienist' })
async getHygienistProductivity(
  @Query('startDate') startDate?: string,
  @Query('endDate') endDate?: string,
) {
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = startDate
    ? new Date(startDate)
    : new Date(new Date().setDate(new Date().getDate() - 30));
  return this.svc.getHygienistProductivity(
    start.toISOString(),
    end.toISOString(),
  );
}

// ─── Phase 3 exports ──────────────────────────────────────────────────

@Get('recall/export/csv')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiOperation({ summary: 'Recall list as CSV (max 5000 rows)' })
async exportRecallCsv(
  @Query('intervalMonths') intervalMonths: string | undefined,
  @Query('limit') limit: string | undefined,
  @Res({ passthrough: true }) res: Response,
) {
  const months = Math.min(24, Math.max(1, parseInt(intervalMonths || '6', 10) || 6));
  const safeLimit = Math.min(5000, Math.max(1, parseInt(limit || '5000', 10) || 5000));
  const report = await this.svc.getRecallList(months, safeLimit);
  const columns = [
    { header: 'Patient Code', get: (r: any) => r.patientCode },
    { header: 'Patient Name', get: (r: any) => r.patientName },
    { header: 'Phone', get: (r: any) => r.phone ?? '' },
    { header: 'Last Visit', get: (r: any) => r.lastVisitDate?.toISOString?.()?.slice(0, 10) ?? '' },
    { header: 'Last Visit Type', get: (r: any) => r.lastVisitType ?? '' },
    { header: 'Days Since', get: (r: any) => r.daysSinceLastVisit ?? '' },
  ];
  const csv = renderCsv(report.data, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="recall-list-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  return res.send(csv);
}

@Get('ar-aging/export/csv')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiOperation({ summary: 'A/R aging as CSV' })
async exportArAgingCsv(@Res({ passthrough: true }) res: Response) {
  const report = await this.svc.getArAgingReport();
  const allRows = [
    ...report.buckets.current,
    ...report.buckets.days31to60,
    ...report.buckets.days61to90,
    ...report.buckets.over90,
  ];
  const columns = [
    { header: 'Invoice #', get: (r: any) => r.invoiceNumber },
    { header: 'Patient', get: (r: any) => r.patientName },
    { header: 'Phone', get: (r: any) => r.phone ?? '' },
    { header: 'Issued', get: (r: any) => r.issuedAt?.toISOString?.()?.slice(0, 10) ?? '' },
    { header: 'Due', get: (r: any) => r.dueDate?.toISOString?.()?.slice(0, 10) ?? '' },
    { header: 'Age Days', get: (r: any) => r.ageDays },
    { header: 'Balance', get: (r: any) => r.balance },
    { header: 'Currency', get: (r: any) => r.currency },
  ];
  const csv = renderCsv(allRows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="ar-aging-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  return res.send(csv);
}

}