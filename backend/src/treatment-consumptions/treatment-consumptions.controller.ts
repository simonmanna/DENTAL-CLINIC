import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TreatmentConsumptionsService } from './treatment-consumptions.service';
import { CreateTreatmentConsumptionDto } from './dto/create-treatment-consumption.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const READ_ROLES = [
  UserRole.DENTIST,
  UserRole.NURSE,
  UserRole.ADMIN,
  UserRole.PHARMACIST,
];
const WRITE_ROLES = [UserRole.DENTIST, UserRole.NURSE, UserRole.ADMIN];

@Controller('treatment-consumptions')
export class TreatmentConsumptionsController {
  constructor(private readonly service: TreatmentConsumptionsService) {}

  @Get()
  @Roles(...READ_ROLES)
  async getAll(
    @Query('treatmentPlanId') treatmentPlanId?: string,
    @Query('patientId') patientId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
  ) {
    return this.service.getAll({ treatmentPlanId, patientId, from, to, page });
  }

  @Get('stats')
  @Roles(...READ_ROLES)
  async getStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getStats({ from, to });
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  async getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  async create(
    @Body() dto: CreateTreatmentConsumptionDto,
    @CurrentUser('id') currentUserId: string | undefined,
  ) {
    return this.service.create(dto, currentUserId);
  }
}
