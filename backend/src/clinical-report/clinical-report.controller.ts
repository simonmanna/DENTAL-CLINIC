import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ClinicalReportsService } from './clinical-report.service';
import { ClinicalReportQueryDto } from './dto/clinical-report.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import {
  ReportAuditInterceptor,
  renderCsv,
  streamExcel,
  streamPdf,
  defaultFilename,
  resolvePagination,
} from '../reports-common';

@ApiTags('Clinical Reports')
@ApiBearerAuth()
@UseInterceptors(ReportAuditInterceptor)
@Controller('clinical-reports')
export class ClinicalReportsController {
  constructor(private readonly clinicalReportsService: ClinicalReportsService) {}

  // ─── Read endpoints ─────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.DENTIST, UserRole.ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Generate a clinical report (8 report types via ?type= param)',
  })
  async getReport(@Query() query: ClinicalReportQueryDto) {
    try {
      return await this.clinicalReportsService.getClinicalReport(query);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to generate clinical report',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── CSV export ─────────────────────────────────────────────────────
  // Note: streamCsv caps at 5000 rows automatically. Reports with > 5000
  // rows should be narrowed via filters or paginated before export.

  @Get('export/csv')
  @Roles(UserRole.ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Export the active report as CSV (max 5000 rows)' })
  async exportCsv(
    @Query() query: ClinicalReportQueryDto,
    @Res() res: Response,
  ) {
    try {
      const report: any = await this.clinicalReportsService.getClinicalReport(query);
      const columns = this.csvColumnsForReport(report);
      const rows = Array.isArray(report.data) ? report.data : [report];
      const csv = renderCsv(rows, columns);
      const filename = defaultFilename(
        String(report.type || 'clinical-report'),
        { startDate: new Date(), endDate: new Date() },
        'csv',
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      return res.send(csv);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to export CSV',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Excel export ──────────────────────────────────────────────────

  @Get('export/excel')
  @Roles(UserRole.ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Export the active report as Excel (.xlsx)' })
  async exportExcel(
    @Query() query: ClinicalReportQueryDto,
    @Res() res: Response,
  ) {
    try {
      const report: any = await this.clinicalReportsService.getClinicalReport(query);
      const columns = this.excelColumnsForReport(report);
      const rows = Array.isArray(report.data) ? report.data : [report];
      await streamExcel(res, rows, columns, {
        filename: defaultFilename(
          String(report.type || 'clinical-report'),
          { startDate: new Date(), endDate: new Date() },
          'xlsx',
        ),
        title: `Clinical Report — ${report.type || 'unknown'}`,
        periodLabel: `${report.period?.startDate || ''} → ${report.period?.endDate || ''}`,
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to export Excel',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── PDF export ────────────────────────────────────────────────────

  @Get('export/pdf')
  @Roles(UserRole.ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Export the active report as PDF' })
  async exportPdf(
    @Query() query: ClinicalReportQueryDto,
    @Res() res: Response,
  ) {
    try {
      const report: any = await this.clinicalReportsService.getClinicalReport(query);
      const columns = this.pdfColumnsForReport(report);
      const rows = Array.isArray(report.data) ? report.data : [report];
      streamPdf(res, rows, columns, {
        filename: defaultFilename(
          String(report.type || 'clinical-report'),
          { startDate: new Date(), endDate: new Date() },
          'pdf',
        ),
        title: `Clinical Report — ${report.type || 'unknown'}`,
        periodLabel: `${report.period?.startDate || ''} → ${report.period?.endDate || ''}`,
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to export PDF',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Helper endpoints ──────────────────────────────────────────────

  @Get('staff')
  @Roles(
    UserRole.DENTIST,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
    UserRole.ADMIN,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List clinical staff (dentists, hygienists, nurses)' })
  async getStaff() {
    try {
      // Fetch staff with clinical roles
      const staff = await this.clinicalReportsService.getStaff();
      return { data: staff, success: true };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch staff',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('patients')
  @Roles(
    UserRole.RECEPTIONIST,
    UserRole.DENTIST,
    UserRole.NURSE,
    UserRole.ADMIN,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Search and list patients (paginated)' })
  async getPatients(
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    try {
      const patients = await this.clinicalReportsService.getPatients(
        search,
        Math.max(1, parseInt(page, 10) || 1),
        Math.min(500, Math.max(1, parseInt(limit, 10) || 50)),
      );
      return { data: patients, success: true };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch patients',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Export column helpers ─────────────────────────────────────────
  // These produce a generic column set when the report type isn't matched.
  // Each helper returns columns that make sense for the specific report shape.

  private csvColumnsForReport(report: any): Array<{ header: string; get: (row: any) => any }> {
    const rows = Array.isArray(report.data) ? report.data : [report];
    const sample = rows[0] || {};
    return Object.keys(sample).map((k) => ({
      header: k,
      get: (row: any) => row?.[k] ?? '',
    }));
  }

  private excelColumnsForReport(report: any): Array<{
    header: string;
    width?: number;
    get: (row: any) => any;
  }> {
    return this.csvColumnsForReport(report).map((c) => ({ ...c, width: 18 }));
  }

  private pdfColumnsForReport(report: any): Array<{
    header: string;
    width: number;
    get: (row: any) => any;
  }> {
    const cols = this.csvColumnsForReport(report);
    if (cols.length === 0) return [];
    const pageWidthPt = 523; // A4 portrait, 36pt margins
    const w = Math.floor(pageWidthPt / Math.min(cols.length, 8));
    return cols.map((c) => ({ header: c.header, width: w, get: c.get }));
  }
}