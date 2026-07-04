// src/appointments/appointments.service.ts  (UPDATED — event emission added)
//
// Changes from your original:
//  1. Inject EventEmitter2
//  2. Helper method emitAppointmentEvent()
//  3. Each status-changing method calls emitAppointmentEvent() after the DB write
//
// Search for "// 🔔 NOTIFICATION" to find every change.

import { IsEnum, IsIn } from 'class-validator';

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter'; // 🔔 NOTIFICATION
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, AppointmentType, Prisma } from '@prisma/client';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import {
  IsString,
  IsOptional,
  IsISO8601,
  IsInt,
  Min,
  IsNotEmpty,
} from 'class-validator';
import {
  NotificationEvents,
  AppointmentEventPayload,
} from '../notifications/notification.constants'; // 🔔 NOTIFICATION

// ─── DTOs (unchanged) ─────────────────────────────────────────────────────────

export class CreateAppointmentDto {
  @IsString() @IsNotEmpty() patientId: string;
  @IsString() @IsNotEmpty() dentistId: string;
  @IsOptional() @IsString() type?: string;
  @IsISO8601() @IsNotEmpty() scheduledAt: string;
  @IsOptional() @IsInt() @Min(5) duration?: number;
  @IsOptional() @IsString() chiefComplaint?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() isWalkIn?: boolean;
  @IsOptional() @IsString() actorId?: string; // 🔔 who is creating this
  @IsOptional()
  @IsIn(Object.values(AppointmentStatus)) // ← Pass actual values array
  status?: AppointmentStatus;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsString() dentistId?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsISO8601() scheduledAt?: string;
  @IsOptional() @IsInt() @Min(5) duration?: number;
  @IsOptional() @IsString() chiefComplaint?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() internalNotes?: string;
  @IsOptional() status?: AppointmentStatus;
  @IsOptional() @IsString() cancelledReason?: string;
  @IsOptional() @IsISO8601() followUpDate?: string;
  @IsOptional() @IsString() actorId?: string; // 🔔
}

export class RescheduleDto {
  @IsISO8601() @IsNotEmpty() newScheduledAt: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() actorId?: string; // 🔔
}

export class AppointmentQueryDto {
  patientId?: string;
  search?: string;
  dentistId?: string;
  status?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  page?: string;
  limit?: string;
  view?: 'day' | 'week';
}

// ─── SERVICE ──────────────────────────────────────────────────────────────────

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private docNum: DocumentNumberService,
    private eventEmitter: EventEmitter2, // 🔔 NOTIFICATION
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // 🔔 NOTIFICATION HELPER
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build the payload and emit a domain event.
   * The NotificationEventHandler listens and persists + pushes via WS.
   */
  private async emitAppointmentEvent(
    eventName: string,
    appointment: any, // The full appointment with includes
    extra?: {
      previousStatus?: string;
      reason?: string;
      actorId?: string;
    },
  ) {
    try {
      const payload: AppointmentEventPayload = {
        appointmentId: appointment.id,
        appointmentCode: appointment.appointmentCode,
        patientId: appointment.patientId ?? appointment.patient?.id,
        patientName: appointment.patient
          ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
          : 'Unknown Patient',
        dentistId: appointment.dentistId ?? appointment.dentist?.id,
        dentistName: appointment.dentist
          ? `Dr. ${appointment.dentist.firstName} ${appointment.dentist.lastName}`
          : 'Unknown Dentist',
        previousStatus: extra?.previousStatus,
        newStatus: appointment.status,
        scheduledAt:
          appointment.scheduledAt?.toISOString?.() ?? appointment.scheduledAt,
        reason: extra?.reason,
        actorId: extra?.actorId,
      };

      this.eventEmitter.emit(eventName, payload);
    } catch (err) {
      // Never let notification failures break appointment flow
      console.error('Failed to emit appointment event:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRUD (with notification emission)
  // ═══════════════════════════════════════════════════════════════════════

  async create(dto: CreateAppointmentDto) {
    console.log(dto.status);
    if (!dto.dentistId) throw new BadRequestException('dentistId is required');
    if (!dto.scheduledAt)
      throw new BadRequestException('scheduledAt is required');

    const scheduledAt = new Date(dto.scheduledAt);
    if (isNaN(scheduledAt.getTime())) {
      throw new BadRequestException(
        'Invalid scheduledAt date format. Expected ISO 8601 string.',
      );
    }

    const duration = dto.duration || 30;
    // Availability check stays outside the tx (read-only + external concern).
    await this.checkDentistAvailability(dto.dentistId, scheduledAt, duration);

    // P-07: generate APT-YY-NNNN atomically inside the same tx that creates
    // the appointment row, so concurrent creates cannot collide on the unique
    // appointmentCode. The counter row-locks on (prefix='APT', year) inside
    // generate_document_number() — same pattern patients/visits/invoices use.
    const appointment = await this.prisma.$transaction(async (tx) => {
      const code = await this.docNum.next('APT', tx);
      return tx.appointment.create({
        data: {
          appointmentCode: code,
          patientId: dto.patientId,
          dentistId: dto.dentistId,
          type:
            (dto.type?.toUpperCase() as AppointmentType) ||
            AppointmentType.CONSULTATION,
          scheduledAt,
          duration,
          chiefComplaint: dto.chiefComplaint,
          notes: dto.notes,
          isWalkIn: dto.isWalkIn || false,
          status: dto.status || AppointmentStatus.SCHEDULED,
        },
        include: this.appointmentIncludes(),
      });
    });

    // 🔔 NOTIFICATION
    await this.emitAppointmentEvent(
      NotificationEvents.APPOINTMENT_CREATED,
      appointment,
      { actorId: dto.actorId },
    );

    return appointment;
  }

  async update(id: string, dto: UpdateAppointmentDto) {
    const apt = await this.prisma.appointment.findUnique({
      where: { id },
      include: { visit: true },
    });
    if (!apt) throw new NotFoundException('Appointment not found');

    if (dto.status === 'CANCELLED' && apt.visit) {
      if (!['COMPLETED', 'CANCELLED'].includes(apt.visit.status)) {
        throw new BadRequestException(
          'Cannot cancel appointment with active visit',
        );
      }
    }

    const previousStatus = apt.status;
    const updateData: Prisma.AppointmentUpdateInput = {};
    if (dto.dentistId) updateData.dentist = { connect: { id: dto.dentistId } };
    if (dto.type) updateData.type = dto.type as AppointmentType;
    if (dto.scheduledAt) updateData.scheduledAt = new Date(dto.scheduledAt);
    if (dto.duration !== undefined) updateData.duration = dto.duration;
    if (dto.chiefComplaint !== undefined)
      updateData.chiefComplaint = dto.chiefComplaint;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.internalNotes !== undefined)
      updateData.internalNotes = dto.internalNotes;
    if (dto.status) updateData.status = dto.status;
    if (dto.cancelledReason) updateData.cancelledReason = dto.cancelledReason;
    if (dto.followUpDate) updateData.followUpDate = new Date(dto.followUpDate);

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: updateData,
      include: this.appointmentIncludes(),
    });

    // 🔔 NOTIFICATION — emit if status changed
    if (dto.status && dto.status !== previousStatus) {
      const eventMap: Record<string, string> = {
        SCHEDULED: NotificationEvents.APPOINTMENT_CREATED,
        CONFIRMED: NotificationEvents.APPOINTMENT_CONFIRMED,
        ARRIVED: NotificationEvents.APPOINTMENT_ARRIVED,
        IN_PROGRESS: NotificationEvents.APPOINTMENT_IN_PROGRESS,
        COMPLETED: NotificationEvents.APPOINTMENT_COMPLETED,
        CANCELLED: NotificationEvents.APPOINTMENT_CANCELLED,
        NO_SHOW: NotificationEvents.APPOINTMENT_NO_SHOW,
        RESCHEDULED: NotificationEvents.APPOINTMENT_RESCHEDULED,
        DRAFT: NotificationEvents.APPOINTMENT_DRAFTED,
      };
      const event = eventMap[dto.status];
      if (event) {
        await this.emitAppointmentEvent(event, updated, {
          previousStatus,
          reason: dto.cancelledReason,
          actorId: dto.actorId,
        });
      }
    }

    return updated;
  }

  async reschedule(id: string, dto: RescheduleDto) {
    const apt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!apt) throw new NotFoundException('Appointment not found');
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(apt.status)) {
      throw new BadRequestException(
        'Cannot reschedule completed/cancelled appointments',
      );
    }
    if (!dto.newScheduledAt)
      throw new BadRequestException('newScheduledAt is required');

    const newDate = new Date(dto.newScheduledAt);
    if (isNaN(newDate.getTime()))
      throw new BadRequestException('Invalid newScheduledAt date format');

    await this.checkDentistAvailability(
      apt.dentistId,
      newDate,
      apt.duration,
      id,
    );

    const previousStatus = apt.status;
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        scheduledAt: newDate,
        status: AppointmentStatus.RESCHEDULED,
        internalNotes:
          `${apt.internalNotes || ''}\nRescheduled on ${new Date().toLocaleDateString()}: ${dto.reason || 'No reason given'}`.trim(),
      },
      include: this.appointmentIncludes(),
    });

    // 🔔 NOTIFICATION
    await this.emitAppointmentEvent(
      NotificationEvents.APPOINTMENT_RESCHEDULED,
      updated,
      { previousStatus, reason: dto.reason, actorId: dto.actorId },
    );

    return updated;
  }

  async cancel(id: string, reason: string, actorId?: string) {
    const apt = await this.prisma.appointment.findUnique({
      where: { id },
      include: { visit: true },
    });
    if (!apt) throw new NotFoundException('Appointment not found');
    if (apt.visit?.status === 'IN_PROGRESS') {
      throw new BadRequestException(
        'Cannot cancel appointment with visit in progress',
      );
    }

    const previousStatus = apt.status;
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CANCELLED, cancelledReason: reason },
      include: this.appointmentIncludes(),
    });

    // 🔔 NOTIFICATION
    await this.emitAppointmentEvent(
      NotificationEvents.APPOINTMENT_CANCELLED,
      updated,
      { previousStatus, reason, actorId },
    );

    return updated;
  }

  async checkIn(id: string, actorId?: string) {
    const apt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!apt) throw new NotFoundException('Appointment not found');
    if (
      !['SCHEDULED', 'CONFIRMED', 'RESCHEDULED', 'DRAFT'].includes(apt.status)
    ) {
      throw new BadRequestException(
        `Cannot check in appointment with status: ${apt.status}`,
      );
    }

    const previousStatus = apt.status;
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.ARRIVED, actualStartAt: new Date() },
      include: this.appointmentIncludes(),
    });

    // 🔔 NOTIFICATION
    await this.emitAppointmentEvent(
      NotificationEvents.APPOINTMENT_ARRIVED,
      updated,
      { previousStatus, actorId },
    );

    return updated;
  }

  async draft(id: string, actorId?: string) {
    const apt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!apt) throw new NotFoundException('Appointment not found');
    if (!['SCHEDULED', 'CONFIRMED', 'DRAFT'].includes(apt.status)) {
      throw new BadRequestException(
        `Cannot draft appointment with status: ${apt.status}`,
      );
    }

    const previousStatus = apt.status;
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.DRAFT },
      include: this.appointmentIncludes(),
    });

    // 🔔 NOTIFICATION
    await this.emitAppointmentEvent(
      NotificationEvents.APPOINTMENT_DRAFTED,
      updated,
      { previousStatus, actorId },
    );

    return updated;
  }

  async confirm(id: string, actorId?: string) {
    const apt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!apt) throw new NotFoundException('Appointment not found');
    if (!['SCHEDULED', 'DRAFT'].includes(apt.status)) {
      throw new BadRequestException(
        `Cannot confirm appointment with status: ${apt.status}`,
      );
    }

    const previousStatus = apt.status;
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CONFIRMED },
      include: this.appointmentIncludes(),
    });

    // 🔔 NOTIFICATION
    await this.emitAppointmentEvent(
      NotificationEvents.APPOINTMENT_CONFIRMED,
      updated,
      { previousStatus, actorId },
    );

    return updated;
  }

  async markNoShow(id: string, actorId?: string) {
    const apt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!apt) throw new NotFoundException('Appointment not found');

    const previousStatus = apt.status;
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.NO_SHOW },
      include: this.appointmentIncludes(),
    });

    // 🔔 NOTIFICATION
    await this.emitAppointmentEvent(
      NotificationEvents.APPOINTMENT_NO_SHOW,
      updated,
      { previousStatus, actorId },
    );

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // QUERY METHODS (unchanged from your original)
  // ═══════════════════════════════════════════════════════════════════════

  async findAll(query: AppointmentQueryDto) {
    const { patientId, search, dentistId, status, date, startDate, endDate } =
      query;
    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.min(100, parseInt(query.limit as string, 10) || 20);
    const skip = (page - 1) * limit;

    const where: Prisma.AppointmentWhereInput = {
      ...(dentistId && { dentistId }),
      ...(patientId && { patientId }),
      ...(status && { status: status as AppointmentStatus }),
      ...(date && {
        scheduledAt: {
          gte: new Date(`${date}T00:00:00.000Z`),
          lt: new Date(`${date}T23:59:59.999Z`),
        },
      }),
      ...(startDate &&
        endDate && {
          scheduledAt: { gte: new Date(startDate), lte: new Date(endDate) },
        }),
      ...(search && {
        OR: [
          { appointmentCode: { contains: search, mode: 'insensitive' } },
          { patient: { firstName: { contains: search, mode: 'insensitive' } } },
          { patient: { lastName: { contains: search, mode: 'insensitive' } } },
          {
            patient: { patientCode: { contains: search, mode: 'insensitive' } },
          },
          { patient: { phone: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [total, appointments] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
        include: this.appointmentIncludes(),
      }),
    ]);

    return {
      data: appointments,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCalendarView(query: {
    date?: string;
    dentistId?: string;
    view?: string;
  }) {
    const targetDate = query.date ? new Date(query.date) : new Date();
    const view = query.view || 'day';
    let startDate: Date, endDate: Date;

    if (view === 'week') {
      const dayOfWeek = targetDate.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      startDate = new Date(targetDate);
      startDate.setDate(targetDate.getDate() + diff);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date(targetDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);
    }

    const where: Prisma.AppointmentWhereInput = {
      scheduledAt: { gte: startDate, lte: endDate },
      ...(query.dentistId &&
        query.dentistId !== 'all' && { dentistId: query.dentistId }),
    };

    const appointments = await this.prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: this.appointmentIncludes(),
    });

    const dentists = await this.prisma.staff.findMany({
      where: {
        isAvailable: true,
        ...(query.dentistId &&
          query.dentistId !== 'all' && { id: query.dentistId }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialization: true,
        avatar: true,
        schedules: {
          where: { dayOfWeek: targetDate.getDay(), isWorking: true },
        },
      },
    });

    const grouped: Record<string, any[]> = {};
    for (const dentist of dentists) {
      grouped[dentist.id] = appointments.filter(
        (a) => a.dentistId === dentist.id,
      );
    }

    return {
      date: targetDate.toISOString(),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      view,
      dentists,
      appointments,
      grouped,
      total: appointments.length,
    };
  }

  async getTodayStats() {
    const today = new Date();
    const start = new Date(today.setHours(0, 0, 0, 0));
    const end = new Date(today.setHours(23, 59, 59, 999));
    const where: Prisma.AppointmentWhereInput = {
      scheduledAt: { gte: start, lte: end },
    };

    const [
      total,
      scheduled,
      arrived,
      inProgress,
      completed,
      cancelled,
      noShow,
    ] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.count({
        where: { ...where, status: 'SCHEDULED' },
      }),
      this.prisma.appointment.count({ where: { ...where, status: 'ARRIVED' } }),
      this.prisma.appointment.count({
        where: { ...where, status: 'IN_PROGRESS' },
      }),
      this.prisma.appointment.count({
        where: { ...where, status: 'COMPLETED' },
      }),
      this.prisma.appointment.count({
        where: { ...where, status: 'CANCELLED' },
      }),
      this.prisma.appointment.count({ where: { ...where, status: 'NO_SHOW' } }),
    ]);

    return {
      total,
      scheduled,
      arrived,
      inProgress,
      completed,
      cancelled,
      noShow,
    };
  }

  async getAvailableSlots(dentistId: string, date: string, duration = 30) {
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    const schedule = await this.prisma.staffSchedule.findFirst({
      where: { staffId: dentistId, dayOfWeek, isWorking: true },
    });
    if (!schedule) return { available: false, slots: [] };

    const [startHour, startMin] = schedule.startTime.split(':').map(Number);
    const [endHour, endMin] = schedule.endTime.split(':').map(Number);

    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        dentistId,
        scheduledAt: {
          gte: new Date(`${date}T00:00:00`),
          lt: new Date(`${date}T23:59:59`),
        },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: { scheduledAt: true, duration: true },
    });

    const slots: { time: string; available: boolean }[] = [];
    const workStart = startHour * 60 + startMin;
    const workEnd = endHour * 60 + endMin;

    for (
      let minutes = workStart;
      minutes + duration <= workEnd;
      minutes += 30
    ) {
      const hour = Math.floor(minutes / 60);
      const min = minutes % 60;
      const slotTime = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      const slotDate = new Date(`${date}T${slotTime}:00`);
      const slotEnd = new Date(slotDate.getTime() + duration * 60000);

      const conflict = existingAppointments.some((apt) => {
        const aptStart = new Date(apt.scheduledAt);
        const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000);
        return slotDate < aptEnd && slotEnd > aptStart;
      });

      slots.push({ time: slotTime, available: !conflict });
    }

    return { available: true, schedule, slots };
  }

  async findOne(id: string) {
    const apt = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { include: { insurances: true } },
        dentist: { include: { schedules: true } },
        visit: {
          include: {
            procedures: { include: { procedure: true } },
            prescriptions: { include: { items: { include: { drug: true } } } },
            invoices: true,
          },
        },
        emrRecord: true,
        imagingRecords: true,
        labOrders: true,
      },
    });
    if (!apt) throw new NotFoundException('Appointment not found');
    return apt;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS (unchanged)
  // ═══════════════════════════════════════════════════════════════════════

  private async checkDentistAvailability(
    dentistId: string,
    start: Date,
    duration: number,
    excludeId?: string,
  ) {
    const end = new Date(start.getTime() + duration * 60000);
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        ...(excludeId && { id: { not: excludeId } }),
        dentistId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        AND: [
          { scheduledAt: { lt: end } },
          { OR: [{ scheduledAt: { gte: start } }] },
        ],
      },
    });
    if (conflict) {
      throw new BadRequestException(
        'Dentist has a conflicting appointment at this time',
      );
    }
  }

  private appointmentIncludes() {
    return {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          patientCode: true,
          phone: true,
          avatar: true,
          dateOfBirth: true,
        },
      },
      dentist: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialization: true,
          avatar: true,
        },
      },
      visit: {
        select: { id: true, status: true, totalCost: true, amountPaid: true },
      },
    };
  }

  // Add this method inside AppointmentsService class

  async delete(id: string) {
    const apt = await this.prisma.appointment.findUnique({
      where: { id },
      include: { visit: true },
    });

    if (!apt) throw new NotFoundException('Appointment not found');

    if (apt.visit) {
      throw new BadRequestException(
        'Cannot delete an appointment that has an associated visit. Cancel it instead.',
      );
    }

    if (
      ![
        'SCHEDULED',
        'CONFIRMED',
        'CANCELLED',
        'NO_SHOW',
        'DRAFT',
        'RESCHEDULED',
      ].includes(apt.status)
    ) {
      throw new BadRequestException(
        `Cannot delete an appointment with status: ${apt.status}`,
      );
    }

    await this.prisma.appointment.delete({ where: { id } });

    return { message: 'Appointment deleted successfully', id };
  }
}
