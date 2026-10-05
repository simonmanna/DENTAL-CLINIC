// src/appointments/appointments.controller.ts
//
// Authorisation note: every mutation is gated with `@Roles(...)`. Before this,
// the controller carried no role metadata at all, so any authenticated
// principal — PHARMACIST, LAB_TECHNICIAN — could book, cancel or delete.
// Reads stay authenticated-only: pharmacy and lab screens legitimately show
// the appointment a prescription or sample belongs to.
//
// `actorId` is always taken from the verified JWT (`req.user.id`), never from
// the request body, so the audit trail cannot be forged by the caller.

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
import { UserRole } from '@prisma/client';
import {
  AppointmentsService,
  CreateAppointmentDto,
  UpdateAppointmentDto,
  RescheduleDto,
} from './appointments.service';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';

/** Front-desk scheduling duties. ADMIN/SUPER_ADMIN bypass @Roles by design. */
const CAN_SCHEDULE = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.RECEPTIONIST,
  UserRole.DENTIST,
  UserRole.NURSE,
];

/** Destroying a scheduling record is an administrative act. */
const CAN_DELETE_APPOINTMENT = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

@ApiTags('Appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}

  @Post()
  @Roles(...CAN_SCHEDULE)
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
  @ApiOperation({
    summary: "Get a day's appointment statistics (default: today)",
  })
  @ApiQuery({ name: 'date', required: false, example: '2024-01-15' })
  getTodayStats(@Query('date') date?: string) {
    return this.svc.getTodayStats(date);
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
    const parsed = duration ? parseInt(duration, 10) : 30;
    return this.svc.getAvailableSlots(
      dentistId,
      date,
      Number.isFinite(parsed) && parsed > 0 ? parsed : 30,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment details by ID' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @Roles(...CAN_SCHEDULE)
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
  @Roles(...CAN_SCHEDULE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark patient as arrived' })
  arrive(@Param('id') id: string, @Req() req: any) {
    return this.svc.checkIn(id, req.user?.id);
  }

  @Post(':id/check-in')
  @Roles(...CAN_SCHEDULE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark patient as arrived (alias)' })
  checkIn(@Param('id') id: string, @Req() req: any) {
    return this.svc.checkIn(id, req.user?.id);
  }

  @Post(':id/confirm')
  @Roles(...CAN_SCHEDULE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a scheduled appointment' })
  confirm(@Param('id') id: string, @Req() req: any) {
    return this.svc.confirm(id, req.user?.id);
  }

  @Post(':id/cancel')
  @Roles(...CAN_SCHEDULE)
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
  @Roles(...CAN_SCHEDULE)
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
  @Roles(...CAN_SCHEDULE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark appointment as no-show' })
  markNoShow(@Param('id') id: string, @Req() req: any) {
    return this.svc.markNoShow(id, req.user?.id);
  }

  @Post(':id/draft')
  @Roles(...CAN_SCHEDULE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set appointment to draft' })
  draft(@Param('id') id: string, @Req() req: any) {
    return this.svc.draft(id, req.user?.id);
  }

  @Delete(':id')
  @Roles(...CAN_DELETE_APPOINTMENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an appointment (only if no visit exists)' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.delete(id, req.user?.id);
  }
}
