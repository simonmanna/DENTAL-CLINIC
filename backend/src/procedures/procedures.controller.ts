// src/procedures/procedures.controller.ts
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import { VisitsService, RemoveVisitProcedureDto } from '../visit/visit.service';
import type { ActingUser } from '../visit/visit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateProcedureDto, UpdateProcedureDto, ProcedureQueryDto,
  AddVisitProcedureDto,
} from './dto/procedure.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('procedures')
@UseGuards(JwtAuthGuard)
// @UseGuards(JwtAuthGuard, RolesGuard)
export class ProceduresController {
  constructor(private readonly proceduresService: ProceduresService) {}

  // ─── Procedure Catalog ────────────────────────────────────────────────────

  @Get()
  findAll(@Query() query: ProcedureQueryDto) {
    return this.proceduresService.findAllProcedures(query);
  }

  @Get('categories')
  getCategories() {
    return this.proceduresService.getProcedureCategories();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.proceduresService.findOneProcedure(id);
  }

  @Get(':id/cost-breakdown')
  getCostBreakdown(@Param('id') id: string) {
    return this.proceduresService.getProcedureCostBreakdown(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'DENTIST')
  create(@Body() dto: CreateProcedureDto) {
    return this.proceduresService.createProcedure(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'DENTIST')
  update(@Param('id') id: string, @Body() dto: UpdateProcedureDto) {
    return this.proceduresService.updateProcedure(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.proceduresService.deleteProcedure(id);
  }
}

// ─── Visit Procedures (separate route group) ──────────────────────────────

@Controller('visit-procedures')
@UseGuards(JwtAuthGuard)
// Legacy route group, kept for API compatibility. Writes delegate to the one
// hardened implementation in VisitsService (catalogue pricing, visit guard,
// stock movement, invoice line, soft delete, audit).
export class VisitProceduresController {
  constructor(
    private readonly proceduresService: ProceduresService,
    private readonly visits: VisitsService,
  ) {}

  @Get('visit/:visitId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'DENTIST', 'NURSE', 'RECEPTIONIST')
  getForVisit(@Param('visitId') visitId: string) {
    return this.proceduresService.getVisitProcedures(visitId);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'DENTIST', 'NURSE')
  add(@Body() dto: AddVisitProcedureDto, @CurrentUser() user: ActingUser) {
    const { visitId, cost, overrideReason, inventoryUsages, ...rest } = dto;
    return this.visits.addProcedure(
      visitId,
      {
        ...rest,
        // A cost is honoured only as an explicit, reasoned override (the
        // service enforces role + reason); client unit costs are ignored —
        // stock is valued at the batch it is drawn from.
        ...(cost != null
          ? { cost, isPriceOverridden: !!overrideReason, overrideReason }
          : {}),
        inventoryUsages: inventoryUsages?.map((u) => ({
          inventoryItemId: u.inventoryItemId,
          locationId: u.locationId,
          quantityUsed: u.quantityUsed,
          batchNumber: u.batchNumber,
          notes: u.notes,
        })),
      },
      user,
    );
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'DENTIST')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('id') id: string,
    @Body() dto: RemoveVisitProcedureDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.visits.removeProcedure(id, dto, user);
  }
}
