// src/appointments/appointments.service.ts
//
// Booking, rescheduling and the status lifecycle for appointments.
//
// Three things in here are load-bearing and easy to break again:
//
//  1. OVERLAP DETECTION (`assertNoOverlap`). An appointment occupies
//     [scheduledAt, scheduledAt + duration). The old check asked Prisma for
//     rows whose *start* fell inside the new window, which silently allowed a
//     long appointment that started earlier to be double-booked over. SQL
//     cannot express `start + duration > x` through the Prisma query API, so
//     the candidate rows are narrowed by an indexed range and the interval
//     comparison is done in JS — the same way `getAvailableSlots` already did.
//
//  2. SERIALISATION. The check ran outside the transaction that inserted the
//     row, so two receptionists booking the same slot could both pass it. Both
//     now happen inside one transaction that first takes a per-dentist
//     advisory lock, which makes concurrent bookings for one dentist queue up.
//
//  3. STATUS TRANSITIONS. Every status change — including the generic
//     `PATCH /appointments/:id` — goes through `assertTransition`. See
//     ./appointment-status.ts.
//
// Day/week windows come from `common/time/clinic-day` so that the list, the
// calendar, the slot grid and today's stats all agree on where a day starts.

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, AppointmentType, Prisma } from '@prisma/client';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import {
  IsString,
  IsOptional,
  IsISO8601,
  IsInt,
  IsBoolean,
  Min,
  Max,
  IsNotEmpty,
  IsIn,
  MaxLength,
} from 'class-validator';
import {
  NotificationEvents,
  AppointmentEventPayload,
} from '../notifications/notification.constants';
import {
  dayRange,
  weekRange,
  clinicDayOfWeek,
  clinicLocalTimeToInstant,
} from '../common/time/clinic-day';
import { assertTransition } from './appointment-status';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

/** Statuses a client may ask for at creation time. The rest are reached by
 *  moving through the lifecycle, never by asserting them up front. */
const CREATABLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.DRAFT,
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];

export class CreateAppointmentDto {
  @IsString() @IsNotEmpty() patientId: string;
  @IsString() @IsNotEmpty() dentistId: string;
  @IsOptional() @IsString() type?: string;
  @IsISO8601() @IsNotEmpty() scheduledAt: string;
  @IsOptional() @IsInt() @Min(5) @Max(480) duration?: number;
  @IsOptional() @IsString() @MaxLength(2000) chiefComplaint?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsBoolean() isWalkIn?: boolean;
  /** Set by the controller from the JWT — never trusted from the body. */
  actorId?: string;
  @IsOptional()
  @IsIn(CREATABLE_STATUSES)
  status?: AppointmentStatus;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsString() dentistId?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsISO8601() scheduledAt?: string;
  @IsOptional() @IsInt() @Min(5) @Max(480) duration?: number;
  @IsOptional() @IsString() @MaxLength(2000) chiefComplaint?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsString() @MaxLength(5000) internalNotes?: string;
  @IsOptional()
  @IsIn(Object.values(AppointmentStatus))
  status?: AppointmentStatus;
  @IsOptional() @IsString() @MaxLength(1000) cancelledReason?: string;
  @IsOptional() @IsISO8601() followUpDate?: string;
  actorId?: string;
}

export class RescheduleDto {
  @IsISO8601() @IsNotEmpty() newScheduledAt: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  actorId?: string;
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
  sortBy?: string;
  sortDir?: string;
}

/** Sortable list columns. Anything else falls back to `scheduledAt`. */
const APPOINTMENT_SORTS: Record<
  string,
  (dir: Prisma.SortOrder) => Prisma.AppointmentOrderByWithRelationInput[]
> = {
  scheduledAt: (dir) => [{ scheduledAt: dir }],
  createdAt: (dir) => [{ createdAt: dir }],
  status: (dir) => [{ status: dir }, { scheduledAt: 'asc' }],
  type: (dir) => [{ type: dir }, { scheduledAt: 'asc' }],
  patient: (dir) => [
    { patient: { lastName: dir } },
    { patient: { firstName: dir } },
  ],
  dentist: (dir) => [{ dentist: { lastName: dir } }, { scheduledAt: 'asc' }],
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Advisory-lock namespace. Arbitrary but must stay stable and unique. */
const BOOKING_LOCK_CLASS = 4201;

/** Longest appointment we look back for when hunting overlaps. Mirrors the
 *  `@Max(480)` on `duration`: nothing can start more than 8h before a window
 *  and still reach into it. */
const MAX_APPOINTMENT_MINUTES = 480;

/** Statuses that no longer hold a slot. Kept identical to the exclusion in
 *  `getAvailableSlots` — if the two drift, the UI offers slots that booking
 *  then rejects (or worse, the reverse). */
const SLOT_RELEASING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

// ─── SERVICE ──────────────────────────────────────────────────────────────────

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private prisma: PrismaService,
    private docNum: DocumentNumberService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // NOTIFICATION + AUDIT HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build the payload and emit a domain event. The NotificationEventHandler
   * listens and persists + pushes via WS. Deliberately swallows its own
   * failures: a notification problem must not roll back a booking.
   */
  private emitAppointmentEvent(
    eventName: string,
    appointment: any,
    extra?: { previousStatus?: string; reason?: string; actorId?: string },
  ): void {
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
      this.logger.error(`Failed to emit ${eventName}`, err as Error);
    }
  }

  /**
   * Append-only audit row. Scheduling is a contested record in a clinic ("I
   * never cancelled that") so every status change, reschedule and delete lands
   * in `audit_logs` with the actor from the JWT.
   */
  private async writeAudit(
    client: Prisma.TransactionClient | PrismaService,
    entry: {
      action: string;
      recordId: string;
      actorId?: string;
      oldData?: Record<string, unknown>;
      newData?: Record<string, unknown>;
      reason?: string;
    },
  ): Promise<void> {
    try {
      await client.auditLog.create({
        data: {
          userId: entry.actorId ?? null,
          action: entry.action,
          module: 'APPOINTMENTS',
          entityType: 'Appointment',
          recordId: entry.recordId,
          oldData: (entry.oldData ?? undefined) as Prisma.InputJsonValue,
          newData: (entry.newData ?? undefined) as Prisma.InputJsonValue,
          reason: entry.reason,
        },
      });
    } catch (err) {
      // An audit write must never be the reason a clinical action fails, but a
      // silent miss is worth a loud log line.
      this.logger.error(
        `Audit write failed for appointment ${entry.recordId} (${entry.action})`,
        err as Error,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AVAILABILITY
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Serialise bookings for one dentist for the rest of the transaction.
   * Without this, two concurrent creates both read "no conflict" and both
   * insert. Lock is released on commit/rollback — no cleanup path to forget.
   */
  private async lockDentistBookings(
    tx: Prisma.TransactionClient,
    dentistId: string,
  ): Promise<void> {
    // Prisma binds JS numbers as bigint; the two-key overload is (int4, int4).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOKING_LOCK_CLASS}::int, hashtext(${dentistId}::text))`;
  }

  /**
   * Reject a booking whose [start, start+duration) interval overlaps one the
   * dentist already holds.
   *
   * Candidates are narrowed with an indexed range — any appointment reaching
   * into the window must start within MAX_APPOINTMENT_MINUTES before it — and
   * the actual interval test is done here, because the end instant is not a
   * stored column.
   */
  private async assertNoOverlap(
    client: Prisma.TransactionClient | PrismaService,
    dentistId: string,
    start: Date,
    duration: number,
    excludeId?: string,
  ): Promise<void> {
    const end = new Date(start.getTime() + duration * 60_000);
    const lookbackFrom = new Date(
      start.getTime() - MAX_APPOINTMENT_MINUTES * 60_000,
    );

    const candidates = await client.appointment.findMany({
      where: {
        dentistId,
        ...(excludeId && { id: { not: excludeId } }),
        status: { notIn: SLOT_RELEASING_STATUSES },
        scheduledAt: { gte: lookbackFrom, lt: end },
      },
      select: {
        id: true,
        appointmentCode: true,
        scheduledAt: true,
        duration: true,
      },
    });

    const clash = candidates.find((apt) => {
      const aptStart = new Date(apt.scheduledAt);
      const aptEnd = new Date(aptStart.getTime() + apt.duration * 60_000);
      // Half-open intervals: back-to-back slots (10:00-10:30, 10:30-11:00)
      // do not collide.
      return aptStart < end && aptEnd > start;
    });

    if (clash) {
      throw new BadRequestException(
        `Dentist is already booked: ${clash.appointmentCode} runs ` +
          `${new Date(clash.scheduledAt).toISOString()} for ${clash.duration} min, ` +
          `which overlaps this slot.`,
      );
    }
  }

  private parseInstant(value: string, field: string): Date {
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) {
      throw new BadRequestException(
        `Invalid ${field}. Expected an ISO 8601 date-time string.`,
      );
    }
    return parsed;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async create(dto: CreateAppointmentDto) {
    if (!dto.dentistId) throw new BadRequestException('dentistId is required');
    if (!dto.patientId) throw new BadRequestException('patientId is required');
    if (!dto.scheduledAt)
      throw new BadRequestException('scheduledAt is required');

    const scheduledAt = this.parseInstant(dto.scheduledAt, 'scheduledAt');
    const duration = dto.duration || 30;

    if (dto.status && !CREATABLE_STATUSES.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot create an appointment directly as ${dto.status}. ` +
          `Allowed: ${CREATABLE_STATUSES.join(', ')}.`,
      );
    }

    // Lock → check → insert, all in one transaction. P-07: the APT-YY-NNNN
    // counter row-locks on (prefix, year) inside the same tx, so concurrent
    // creates cannot collide on appointmentCode either.
    const appointment = await this.prisma.$transaction(async (tx) => {
      await this.lockDentistBookings(tx, dto.dentistId);
      await this.assertNoOverlap(tx, dto.dentistId, scheduledAt, duration);

      const code = await this.docNum.next('APT', tx);
      const created = await tx.appointment.create({
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

      await this.writeAudit(tx, {
        action: 'CREATE',
        recordId: created.id,
        actorId: dto.actorId,
        newData: {
          appointmentCode: created.appointmentCode,
          patientId: created.patientId,
          dentistId: created.dentistId,
          scheduledAt: scheduledAt.toISOString(),
          duration,
          status: created.status,
        },
      });

      return created;
    });

    this.emitAppointmentEvent(
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

    // Status moves through the same table as the dedicated endpoints.
    if (dto.status) assertTransition(apt.status, dto.status);

    if (dto.status === AppointmentStatus.CANCELLED && apt.visit) {
      if (!['COMPLETED', 'CANCELLED'].includes(apt.visit.status)) {
        throw new BadRequestException(
          'Cannot cancel appointment with active visit',
        );
      }
    }

    // A cancellation without a stated reason is unauditable six months later.
    if (
      dto.status === AppointmentStatus.CANCELLED &&
      !dto.cancelledReason?.trim()
    ) {
      throw new BadRequestException(
        'cancelledReason is required when cancelling an appointment',
      );
    }

    const previousStatus = apt.status;
    const nextDentistId = dto.dentistId ?? apt.dentistId;
    const nextDuration = dto.duration ?? apt.duration;
    const nextScheduledAt = dto.scheduledAt
      ? this.parseInstant(dto.scheduledAt, 'scheduledAt')
      : apt.scheduledAt;

    // Moving the slot, the dentist or the length through PATCH used to skip
    // the conflict check entirely — the simplest route to a double booking.
    const slotChanged =
      nextDentistId !== apt.dentistId ||
      nextDuration !== apt.duration ||
      nextScheduledAt.getTime() !== apt.scheduledAt.getTime();

    const updateData: Prisma.AppointmentUpdateInput = {};
    if (dto.dentistId) updateData.dentist = { connect: { id: dto.dentistId } };
    if (dto.type) updateData.type = dto.type as AppointmentType;
    if (dto.scheduledAt) updateData.scheduledAt = nextScheduledAt;
    if (dto.duration !== undefined) updateData.duration = dto.duration;
    if (dto.chiefComplaint !== undefined)
      updateData.chiefComplaint = dto.chiefComplaint;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.internalNotes !== undefined)
      updateData.internalNotes = dto.internalNotes;
    if (dto.status) updateData.status = dto.status;
    if (dto.cancelledReason) updateData.cancelledReason = dto.cancelledReason;
    if (dto.followUpDate)
      updateData.followUpDate = this.parseInstant(
        dto.followUpDate,
        'followUpDate',
      );

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        slotChanged &&
        !SLOT_RELEASING_STATUSES.includes(dto.status ?? apt.status)
      ) {
        await this.lockDentistBookings(tx, nextDentistId);
        await this.assertNoOverlap(
          tx,
          nextDentistId,
          nextScheduledAt,
          nextDuration,
          id,
        );
      }

      const row = await tx.appointment.update({
        where: { id },
        data: updateData,
        include: this.appointmentIncludes(),
      });

      await this.writeAudit(tx, {
        action:
          dto.status && dto.status !== previousStatus
            ? 'STATUS_CHANGE'
            : 'UPDATE',
        recordId: id,
        actorId: dto.actorId,
        oldData: {
          status: previousStatus,
          dentistId: apt.dentistId,
          scheduledAt: apt.scheduledAt.toISOString(),
          duration: apt.duration,
        },
        newData: {
          status: row.status,
          dentistId: row.dentistId,
          scheduledAt: row.scheduledAt.toISOString(),
          duration: row.duration,
        },
        reason: dto.cancelledReason,
      });

      return row;
    });

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
        this.emitAppointmentEvent(event, updated, {
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
    if (!dto.newScheduledAt)
      throw new BadRequestException('newScheduledAt is required');

    assertTransition(apt.status, AppointmentStatus.RESCHEDULED);

    const newDate = this.parseInstant(dto.newScheduledAt, 'newScheduledAt');
    const previousStatus = apt.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockDentistBookings(tx, apt.dentistId);
      await this.assertNoOverlap(tx, apt.dentistId, newDate, apt.duration, id);

      const row = await tx.appointment.update({
        where: { id },
        data: {
          scheduledAt: newDate,
          status: AppointmentStatus.RESCHEDULED,
          internalNotes:
            `${apt.internalNotes || ''}\nRescheduled on ${new Date().toISOString()}: ${dto.reason || 'No reason given'}`.trim(),
        },
        include: this.appointmentIncludes(),
      });

      await this.writeAudit(tx, {
        action: 'RESCHEDULE',
        recordId: id,
        actorId: dto.actorId,
        oldData: {
          status: previousStatus,
          scheduledAt: apt.scheduledAt.toISOString(),
        },
        newData: {
          status: row.status,
          scheduledAt: newDate.toISOString(),
        },
        reason: dto.reason,
      });

      return row;
    });

    this.emitAppointmentEvent(
      NotificationEvents.APPOINTMENT_RESCHEDULED,
      updated,
      { previousStatus, reason: dto.reason, actorId: dto.actorId },
    );

    return updated;
  }

  async cancel(id: string, reason: string, actorId?: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A cancellation reason is required');
    }

    const apt = await this.prisma.appointment.findUnique({
      where: { id },
      include: { visit: true },
    });
    if (!apt) throw new NotFoundException('Appointment not found');

    assertTransition(apt.status, AppointmentStatus.CANCELLED);

    if (apt.visit && !['COMPLETED', 'CANCELLED'].includes(apt.visit.status)) {
      throw new BadRequestException(
        'Cannot cancel an appointment whose visit is still open — cancel or complete the visit first',
      );
    }

    const previousStatus = apt.status;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.CANCELLED, cancelledReason: reason },
        include: this.appointmentIncludes(),
      });
      await this.writeAudit(tx, {
        action: 'CANCEL',
        recordId: id,
        actorId,
        oldData: { status: previousStatus },
        newData: { status: row.status },
        reason,
      });
      return row;
    });

    this.emitAppointmentEvent(
      NotificationEvents.APPOINTMENT_CANCELLED,
      updated,
      { previousStatus, reason, actorId },
    );

    return updated;
  }

  async checkIn(id: string, actorId?: string) {
    return this.simpleTransition(id, AppointmentStatus.ARRIVED, {
      action: 'CHECK_IN',
      event: NotificationEvents.APPOINTMENT_ARRIVED,
      actorId,
      extraData: { actualStartAt: new Date() },
    });
  }

  async draft(id: string, actorId?: string) {
    return this.simpleTransition(id, AppointmentStatus.DRAFT, {
      action: 'DRAFT',
      event: NotificationEvents.APPOINTMENT_DRAFTED,
      actorId,
    });
  }

  async confirm(id: string, actorId?: string) {
    return this.simpleTransition(id, AppointmentStatus.CONFIRMED, {
      action: 'CONFIRM',
      event: NotificationEvents.APPOINTMENT_CONFIRMED,
      actorId,
    });
  }

  async markNoShow(id: string, actorId?: string) {
    // Previously unguarded: a COMPLETED appointment could be flipped to
    // NO_SHOW, which then contradicted its own visit record.
    return this.simpleTransition(id, AppointmentStatus.NO_SHOW, {
      action: 'NO_SHOW',
      event: NotificationEvents.APPOINTMENT_NO_SHOW,
      actorId,
    });
  }

  /** Shared body of the single-status endpoints: guard → write → audit → emit. */
  private async simpleTransition(
    id: string,
    target: AppointmentStatus,
    opts: {
      action: string;
      event: string;
      actorId?: string;
      extraData?: Prisma.AppointmentUpdateInput;
    },
  ) {
    const apt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!apt) throw new NotFoundException('Appointment not found');

    assertTransition(apt.status, target);
    const previousStatus = apt.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.update({
        where: { id },
        data: { status: target, ...(opts.extraData ?? {}) },
        include: this.appointmentIncludes(),
      });
      await this.writeAudit(tx, {
        action: opts.action,
        recordId: id,
        actorId: opts.actorId,
        oldData: { status: previousStatus },
        newData: { status: row.status },
      });
      return row;
    });

    this.emitAppointmentEvent(opts.event, updated, {
      previousStatus,
      actorId: opts.actorId,
    });

    return updated;
  }

  async delete(id: string, actorId?: string) {
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

    // The row is about to stop existing, so the audit entry carries a snapshot
    // of it — otherwise a deletion leaves no trace of what was deleted.
    await this.prisma.$transaction(async (tx) => {
      await this.writeAudit(tx, {
        action: 'DELETE',
        recordId: id,
        actorId,
        oldData: {
          appointmentCode: apt.appointmentCode,
          patientId: apt.patientId,
          dentistId: apt.dentistId,
          scheduledAt: apt.scheduledAt.toISOString(),
          duration: apt.duration,
          status: apt.status,
          chiefComplaint: apt.chiefComplaint,
        },
      });
      await tx.appointment.delete({ where: { id } });
    });

    return { message: 'Appointment deleted successfully', id };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════════════

  async findAll(query: AppointmentQueryDto) {
    const { patientId, search, dentistId, status, date, startDate, endDate } =
      query;
    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(query.limit as string, 10) || 20),
    );
    const skip = (page - 1) * limit;
    const sortDir: Prisma.SortOrder = query.sortDir === 'desc' ? 'desc' : 'asc';
    const orderBy = (
      APPOINTMENT_SORTS[query.sortBy ?? ''] ?? APPOINTMENT_SORTS.scheduledAt
    )(sortDir);

    const where: Prisma.AppointmentWhereInput = {
      ...(dentistId && { dentistId }),
      ...(patientId && { patientId }),
      ...(status && { status: status as AppointmentStatus }),
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

    // Clinic-local windows. `date` wins over an explicit range if both arrive,
    // and the bounds are half-open so 23:59:59.999 rows are never dropped.
    if (date) {
      const { start, end } = dayRange(date);
      where.scheduledAt = { gte: start, lt: end };
    } else if (startDate || endDate) {
      const bounds: Prisma.DateTimeFilter = {};
      if (startDate) bounds.gte = dayRange(startDate).start;
      if (endDate) bounds.lt = dayRange(endDate).end;
      where.scheduledAt = bounds;
    }

    const [total, appointments] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy,
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
    const view = query.view === 'week' ? 'week' : 'day';
    const { start, end } =
      view === 'week' ? weekRange(query.date) : dayRange(query.date);
    const dayOfWeek = clinicDayOfWeek(query.date);

    const where: Prisma.AppointmentWhereInput = {
      scheduledAt: { gte: start, lt: end },
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
          where: { dayOfWeek, isWorking: true },
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
      date: start.toISOString(),
      startDate: start.toISOString(),
      // Kept inclusive in the response so existing UI labels still read
      // "…–Sunday" rather than "…–next Monday".
      endDate: new Date(end.getTime() - 1).toISOString(),
      view,
      dentists,
      appointments,
      grouped,
      total: appointments.length,
    };
  }

  async getTodayStats(date?: string) {
    const { start, end } = dayRange(date);
    const where: Prisma.AppointmentWhereInput = {
      scheduledAt: { gte: start, lt: end },
    };

    // One grouped query instead of seven counts.
    const rows = await this.prisma.appointment.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });

    const countFor = (status: AppointmentStatus) =>
      rows.find((r) => r.status === status)?._count?._all ?? 0;

    return {
      total: rows.reduce((sum, r) => sum + (r._count?._all ?? 0), 0),
      scheduled: countFor(AppointmentStatus.SCHEDULED),
      confirmed: countFor(AppointmentStatus.CONFIRMED),
      arrived: countFor(AppointmentStatus.ARRIVED),
      inProgress: countFor(AppointmentStatus.IN_PROGRESS),
      completed: countFor(AppointmentStatus.COMPLETED),
      cancelled: countFor(AppointmentStatus.CANCELLED),
      noShow: countFor(AppointmentStatus.NO_SHOW),
      draft: countFor(AppointmentStatus.DRAFT),
      rescheduled: countFor(AppointmentStatus.RESCHEDULED),
    };
  }

  async getAvailableSlots(dentistId: string, date: string, duration = 30) {
    if (!dentistId) throw new BadRequestException('dentistId is required');
    if (!date) throw new BadRequestException('date is required');

    const { start: dayStart, end: dayEnd } = dayRange(date);
    const dayOfWeek = clinicDayOfWeek(date);

    const schedule = await this.prisma.staffSchedule.findFirst({
      where: { staffId: dentistId, dayOfWeek, isWorking: true },
    });
    if (!schedule) return { available: false, slots: [] };

    const [startHour, startMin] = schedule.startTime.split(':').map(Number);
    const [endHour, endMin] = schedule.endTime.split(':').map(Number);
    if ([startHour, startMin, endHour, endMin].some((n) => isNaN(n))) {
      throw new BadRequestException(
        `Staff schedule has an unreadable time range (${schedule.startTime}–${schedule.endTime})`,
      );
    }

    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        dentistId,
        scheduledAt: { gte: dayStart, lt: dayEnd },
        status: { notIn: SLOT_RELEASING_STATUSES },
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
      const slotDate = clinicLocalTimeToInstant(date, hour, min);
      const slotEnd = new Date(slotDate.getTime() + duration * 60_000);

      const conflict = existingAppointments.some((apt) => {
        const aptStart = new Date(apt.scheduledAt);
        const aptEnd = new Date(aptStart.getTime() + apt.duration * 60_000);
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
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════════════

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
          previousCardNumber: true,
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
}
