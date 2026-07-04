// src/procedures/procedures.controller.ts
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import {
  CreateProcedureDto, UpdateProcedureDto, ProcedureQueryDto,
  AddVisitProcedureDto, UpdateVisitProcedureDto,
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
// @UseGuards(JwtAuthGuard, RolesGuard)
export class VisitProceduresController {
  constructor(private readonly proceduresService: ProceduresService) {}

  @Get('visit/:visitId')
  getForVisit(@Param('visitId') visitId: string) {
    return this.proceduresService.getVisitProcedures(visitId);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'DENTIST', 'NURSE')
  add(@Body() dto: AddVisitProcedureDto) {
    return this.proceduresService.addVisitProcedure(dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'DENTIST')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.proceduresService.removeVisitProcedure(id);
  }
}
