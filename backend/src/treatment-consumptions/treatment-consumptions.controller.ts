import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { TreatmentConsumptionsService } from './treatment-consumptions.service';

@Controller('treatment-consumptions')
export class TreatmentConsumptionsController {
  constructor(private readonly service: TreatmentConsumptionsService) {}

  @Get()
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
  async getStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getStats({ from, to });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  async create(@Body() dto: {
    treatmentPlanId?: string;
    patientId?: string;
    itemType: string;
    itemId: string;
    itemName: string;
    quantity: number;
    unitCost: number;
    notes?: string;
    performedById?: string;
  }) {
    return this.service.create(dto);
  }
}