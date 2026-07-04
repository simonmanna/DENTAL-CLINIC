// src/appointments/appointments.controller.ts  (UPDATED)
//
// Changes: each mutation endpoint now passes req.user.id as actorId
// so the notification system knows WHO triggered the event.

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  Delete,
} from '@nestjs/common';
import {
  AppointmentsService,
  CreateAppointmentDto,
  UpdateAppointmentDto,
  RescheduleDto,
} from './appointments.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Book a new appointment' })
  create(@Body() dto: CreateAppointmentDto, @Req() req: any) {
    dto.actorId = req.user?.id;
    return this.svc.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List appointments with filters and pagination' })
  @ApiQuery({ name: 'date', required: false, example: '2024-01-15' })
  @ApiQuery({ name: 'dentistId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'patientId', required: false })
  findAll(@Query() query: any) {
    return this.svc.findAll(query);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Get calendar view grouped by dentist' })
  @ApiQuery({ name: 'date', required: false, example: '2024-01-15' })
  @ApiQuery({ name: 'dentistId', required: false })
  @ApiQuery({ name: 'view', required: false, enum: ['day', 'week'] })
  getCalendar(@Query() query: any) {
    return this.svc.getCalendarView(query);
  }

  @Get('stats/today')
  @ApiOperation({ summary: "Get today's appointment statistics" })
  getTodayStats() {
    return this.svc.getTodayStats();
  }

  @Get('slots')
  @ApiOperation({ summary: 'Get available time slots for a dentist' })
  @ApiQuery({ name: 'dentistId', required: true })
  @ApiQuery({ name: 'date', required: true, example: '2024-01-15' })
  @ApiQuery({ name: 'duration', required: false, example: 30 })
  getAvailableSlots(
    @Query('dentistId') dentistId: string,
    @Query('date') date: string,
    @Query('duration') duration?: string,
  ) {
    return this.svc.getAvailableSlots(
      dentistId,
      date,
      duration ? parseInt(duration) : 30,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment details by ID' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update appointment details' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
    @Req() req: any,
  ) {
    dto.actorId = req.user?.id;
    return this.svc.update(id, dto);
  }

  @Post(':id/arrive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark patient as arrived' })
  arrive(@Param('id') id: string, @Req() req: any) {
    return this.svc.checkIn(id, req.user?.id);
  }

  @Post(':id/check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark patient as arrived (alias)' })
  checkIn(@Param('id') id: string, @Req() req: any) {
    return this.svc.checkIn(id, req.user?.id);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a scheduled appointment' })
  confirm(@Param('id') id: string, @Req() req: any) {
    return this.svc.confirm(id, req.user?.id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an appointment with a reason' })
  cancel(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.svc.cancel(id, reason, req.user?.id);
  }

  @Post(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reschedule an appointment to a new date/time' })
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleDto,
    @Req() req: any,
  ) {
    dto.actorId = req.user?.id;
    return this.svc.reschedule(id, dto);
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark appointment as no-show' })
  markNoShow(@Param('id') id: string, @Req() req: any) {
    return this.svc.markNoShow(id, req.user?.id);
  }

  @Post(':id/draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set appointment to draft' })
  draft(@Param('id') id: string, @Req() req: any) {
    return this.svc.draft(id, req.user?.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an appointment (only if no visit exists)' })
  remove(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}
