// src/audit-log/audit-log.controller.ts
// Read-only access to the global audit log. Writes happen inside the modules
// that own each entity (never here).
//
// Restricted to ADMIN+ — the audit log contains the full before/after JSON
// snapshots of every state change including financial and PII-bearing records.
// Per the audit-trail access-control policy, only SUPER_ADMIN, ADMIN, and
// DENTIST (clinical actions only) may read this. SUPER_ADMIN bypasses every
// gate; DENTIST is permitted so they can review changes to their own charts.
// (Cashier/Receptionist/Nurse have no business reading the audit log.)
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditLogService, AuditLogFilters } from './audit-log.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Audit Log')
@ApiBearerAuth()
@Controller('audit-log')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DENTIST)
export class AuditLogController {
  constructor(private readonly svc: AuditLogService) {}

  @Get()
  @ApiOperation({
    summary: 'List audit log rows (paginated, filterable, sortable)',
  })
  list(
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('userId') userId?: string,
    @Query('recordId') recordId?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: AuditLogFilters['sortBy'],
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.svc.list({
      module,
      action,
      entityType,
      userId,
      recordId,
      search,
      dateFrom,
      dateTo,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      sortBy,
      sortDir,
    });
  }

  @Get('facets')
  @ApiOperation({
    summary:
      'Distinct modules / actions / entityTypes / users — for filter dropdowns',
  })
  facets() {
    return this.svc.facets();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single audit log row (full JSON snapshots)' })
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }
}
