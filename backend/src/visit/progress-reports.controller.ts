// src/visits/progress-reports.controller.ts

import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  ProgressReportsService,
  CreateProgressReportDto,
  UpdateProgressReportDto,
} from './progress-reports.service';

@ApiTags('Progress Reports')
@ApiBearerAuth()
@Controller('visits')
export class ProgressReportsController {
  constructor(private readonly svc: ProgressReportsService) {}

  @Get(':visitId/progress-reports')
  @ApiOperation({ summary: 'List progress reports for a visit' })
  getVisitReports(@Param('visitId') visitId: string) {
    return this.svc.getVisitProgressReports(visitId);
  }

  @Get(':visitId/progress-reports/context')
  @ApiOperation({ summary: 'Form context — sessions & conditions selectable for this visit' })
  getFormContext(@Param('visitId') visitId: string) {
    return this.svc.getVisitFormContext(visitId);
  }

  @Post(':visitId/progress-reports')
  @ApiOperation({ summary: 'Create a progress report' })
  createReport(
    @Param('visitId') visitId: string,
    @Body() dto: CreateProgressReportDto,
  ) {
    return this.svc.createProgressReport(visitId, dto);
  }

  @Get('progress-reports/:reportId')
  @ApiOperation({ summary: 'Get a single progress report' })
  getOne(@Param('reportId') reportId: string) {
    return this.svc.getProgressReport(reportId);
  }

  @Patch('progress-reports/:reportId')
  @ApiOperation({ summary: 'Update a progress report' })
  updateReport(
    @Param('reportId') reportId: string,
    @Body() dto: UpdateProgressReportDto,
  ) {
    return this.svc.updateProgressReport(reportId, dto);
  }

  @Delete('progress-reports/:reportId')
  @ApiOperation({ summary: 'Delete a progress report' })
  deleteReport(@Param('reportId') reportId: string) {
    return this.svc.deleteProgressReport(reportId);
  }
}