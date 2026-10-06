// src/visits/progress-reports.controller.ts
//
// Progress reports are clinical notes: front-desk, pharmacy and lab roles may
// not read or change them (this controller previously carried no @Roles at
// all, so any authenticated user could edit or delete a clinical record).
// SUPER_ADMIN / ADMIN pass every gate in RolesGuard.

import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
// `import type`: only used in decorated signatures as an interface.
import type { VisitWriteActor } from './visit-guard';
import {
  ProgressReportsService,
  CreateProgressReportDto,
  UpdateProgressReportDto,
  DeleteProgressReportDto,
} from './progress-reports.service';

const CLINICAL_READ = [UserRole.DENTIST, UserRole.NURSE, UserRole.ADMIN];
const CLINICAL_WRITE = [UserRole.DENTIST, UserRole.NURSE];
const CLINICAL_DELETE = [UserRole.DENTIST, UserRole.ADMIN];

@ApiTags('Progress Reports')
@ApiBearerAuth()
@Controller('visits')
export class ProgressReportsController {
  constructor(private readonly svc: ProgressReportsService) {}

  @Get(':visitId/progress-reports')
  @Roles(...CLINICAL_READ)
  @ApiOperation({ summary: 'List progress reports for a visit' })
  getVisitReports(@Param('visitId') visitId: string) {
    return this.svc.getVisitProgressReports(visitId);
  }

  @Get(':visitId/progress-reports/context')
  @Roles(...CLINICAL_READ)
  @ApiOperation({ summary: 'Form context — sessions & conditions selectable for this visit' })
  getFormContext(@Param('visitId') visitId: string) {
    return this.svc.getVisitFormContext(visitId);
  }

  @Post(':visitId/progress-reports')
  @Roles(...CLINICAL_WRITE)
  @ApiOperation({ summary: 'Create a progress report' })
  createReport(
    @Param('visitId') visitId: string,
    @Body() dto: CreateProgressReportDto,
    @CurrentUser() user: VisitWriteActor,
  ) {
    return this.svc.createProgressReport(visitId, dto, user);
  }

  @Get('progress-reports/:reportId')
  @Roles(...CLINICAL_READ)
  @ApiOperation({ summary: 'Get a single progress report' })
  getOne(@Param('reportId') reportId: string) {
    return this.svc.getProgressReport(reportId);
  }

  @Patch('progress-reports/:reportId')
  @Roles(...CLINICAL_WRITE)
  @ApiOperation({ summary: 'Update a progress report' })
  updateReport(
    @Param('reportId') reportId: string,
    @Body() dto: UpdateProgressReportDto,
    @CurrentUser() user: VisitWriteActor,
  ) {
    return this.svc.updateProgressReport(reportId, dto, user);
  }

  @Delete('progress-reports/:reportId')
  @Roles(...CLINICAL_DELETE)
  @ApiOperation({ summary: 'Soft-delete a progress report (reason required)' })
  deleteReport(
    @Param('reportId') reportId: string,
    @Body() dto: DeleteProgressReportDto,
    @CurrentUser() user: VisitWriteActor,
  ) {
    return this.svc.deleteProgressReport(reportId, dto.reason, user);
  }
}
