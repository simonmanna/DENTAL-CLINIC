import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmrService, CreateEMRDto, CreateLabOrderDto } from './emr.service';

@ApiTags('EMR')
@ApiBearerAuth()
@Controller('emr')
export class EmrController {
  constructor(private svc: EmrService) {}
  @Post() create(@Body() dto: CreateEMRDto) { return this.svc.create(dto); }
  @Get('patient/:patientId') findByPatient(@Param('patientId') id: string, @Query('page') p: number, @Query('limit') l: number) { return this.svc.findByPatient(id, p, l); }
  @Get('patient/:patientId/timeline') getTimeline(@Param('patientId') id: string) { return this.svc.getPatientTimeline(id); }
  @Get(':id') findOne(@Param('id') id: string) { return this.svc.findOne(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: Partial<CreateEMRDto>) { return this.svc.update(id, dto); }
  @Post(':id/attachments') addAttachment(@Param('id') id: string, @Body() file: any) { return this.svc.addAttachment(id, file); }
  @Post('lab-orders') createLabOrder(@Body() dto: CreateLabOrderDto) { return this.svc.createLabOrder(dto); }
  @Get('lab-orders/list') getLabOrders(@Query('patientId') pid?: string, @Query('status') status?: string) { return this.svc.getLabOrders(pid, status); }
  @Patch('lab-orders/:id') updateLabOrder(@Param('id') id: string, @Body() data: any) { return this.svc.updateLabOrder(id, data); }
}
