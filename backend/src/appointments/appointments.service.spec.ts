import { AppointmentStatus } from '@prisma/client';
import { AppointmentsService } from './appointments.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

function build() {
  const prisma = createPrismaMock() as any;
  const docNum: any = { next: jest.fn().mockResolvedValue('APT-26-0001') };
  const events = createAutoMock();
  const svc = new AppointmentsService(prisma, docNum, events);

  // Default: nothing already on the dentist's calendar.
  prisma.appointment.findMany.mockResolvedValue([]);
  prisma.appointment.create.mockImplementation(async ({ data }: any) => ({
    ...data,
    id: `apt-${data.appointmentCode}`,
  }));
  prisma.appointment.update.mockImplementation(async ({ data }: any) => ({
    id: 'apt-1',
    appointmentCode: 'APT-26-0001',
    scheduledAt: new Date('2026-03-15T09:00:00.000Z'),
    duration: 30,
    dentistId: 'd1',
    patientId: 'p1',
    ...data,
  }));

  return { svc, prisma, docNum, events };
}

const baseDto = () => ({
  patientId: 'p1',
  dentistId: 'd1',
  scheduledAt: '2026-03-15T10:30:00.000Z',
});

/** Row shape `assertNoOverlap` selects. */
const existing = (startIso: string, duration: number, code = 'APT-26-0099') => ({
  id: 'apt-existing',
  appointmentCode: code,
  scheduledAt: new Date(startIso),
  duration,
});

describe('AppointmentsService', () => {
  it('constructs with Prisma + DocumentNumber + event emitter', () => {
    const { svc } = build();
    expect(svc).toBeDefined();
  });

  // ── Overlap detection ──────────────────────────────────────────────────────

  describe('double-booking', () => {
    it('rejects a slot an earlier long appointment runs into', async () => {
      // The regression this exists for: an existing 10:00 appointment lasting
      // 90 minutes covers 10:00–11:30, so 10:30 is taken. The old query asked
      // only for rows STARTING inside the new window, so this booking passed.
      const { svc, prisma } = build();
      prisma.appointment.findMany.mockResolvedValue([
        existing('2026-03-15T10:00:00.000Z', 90),
      ]);

      await expect(svc.create(baseDto() as any)).rejects.toThrow(
        /already booked/i,
      );
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('rejects a new long appointment that swallows a later one', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findMany.mockResolvedValue([
        existing('2026-03-15T11:00:00.000Z', 30),
      ]);

      await expect(
        svc.create({ ...baseDto(), duration: 120 } as any),
      ).rejects.toThrow(/already booked/i);
    });

    it('allows back-to-back slots that merely touch', async () => {
      // 10:00–10:30 then 10:30–11:00 is a full clinic day, not a conflict.
      const { svc, prisma } = build();
      prisma.appointment.findMany.mockResolvedValue([
        existing('2026-03-15T10:00:00.000Z', 30),
      ]);

      const created = await svc.create(baseDto() as any);
      expect(created.appointmentCode).toBe('APT-26-0001');
    });

    it('ignores cancelled and no-show rows when hunting conflicts', async () => {
      const { svc, prisma } = build();
      await svc.create(baseDto() as any);

      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where.status.notIn).toEqual(
        expect.arrayContaining([
          AppointmentStatus.CANCELLED,
          AppointmentStatus.NO_SHOW,
        ]),
      );
    });

    it('narrows candidates to the dentist and a bounded lookback', async () => {
      const { svc, prisma } = build();
      await svc.create(baseDto() as any);

      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where.dentistId).toBe('d1');
      // 8h before the 10:30 start — the @Max(480) duration ceiling.
      expect(where.scheduledAt.gte.toISOString()).toBe(
        '2026-03-15T02:30:00.000Z',
      );
      expect(where.scheduledAt.lt.toISOString()).toBe(
        '2026-03-15T11:00:00.000Z',
      );
    });

    it('takes a per-dentist advisory lock before checking', async () => {
      // Without this the check and the insert are not serialised and two
      // concurrent bookings both pass.
      const { svc, prisma } = build();
      await svc.create(baseDto() as any);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('P-07: issues appointment codes atomically inside the create tx', async () => {
      const { svc, prisma, docNum } = build();
      docNum.next
        .mockResolvedValueOnce('APT-26-0042')
        .mockResolvedValueOnce('APT-26-0043');

      const [a, b] = await Promise.all([
        svc.create(baseDto() as any),
        svc.create(baseDto() as any),
      ]);

      expect(a.appointmentCode).toBe('APT-26-0042');
      expect(b.appointmentCode).toBe('APT-26-0043');
      expect(docNum.next).toHaveBeenCalledWith('APT', expect.anything());
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('refuses to be created straight into a mid-lifecycle status', async () => {
      const { svc } = build();
      await expect(
        svc.create({ ...baseDto(), status: AppointmentStatus.COMPLETED } as any),
      ).rejects.toThrow(/Cannot create an appointment directly as COMPLETED/);
    });

    it('rejects an unparseable scheduledAt', async () => {
      const { svc } = build();
      await expect(
        svc.create({ ...baseDto(), scheduledAt: 'tomorrow-ish' } as any),
      ).rejects.toThrow(/Invalid scheduledAt/);
    });

    it('writes an audit row for the booking', async () => {
      const { svc, prisma } = build();
      await svc.create({ ...baseDto(), actorId: 'u1' } as any);

      const audit = prisma.auditLog.create.mock.calls[0][0].data;
      expect(audit).toMatchObject({
        action: 'CREATE',
        module: 'APPOINTMENTS',
        entityType: 'Appointment',
        userId: 'u1',
      });
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    const stored = (over: Record<string, unknown> = {}) => ({
      id: 'apt-1',
      appointmentCode: 'APT-26-0001',
      patientId: 'p1',
      dentistId: 'd1',
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: new Date('2026-03-15T09:00:00.000Z'),
      duration: 30,
      internalNotes: null,
      visit: null,
      ...over,
    });

    it('re-checks availability when PATCH moves the slot', async () => {
      // The other half of the double-booking hole: PATCH skipped the check
      // entirely, so any conflict could be reached by editing instead of
      // booking.
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(stored());
      prisma.appointment.findMany.mockResolvedValue([
        existing('2026-03-15T10:00:00.000Z', 90),
      ]);

      await expect(
        svc.update('apt-1', { scheduledAt: '2026-03-15T10:30:00.000Z' } as any),
      ).rejects.toThrow(/already booked/i);
    });

    it('re-checks availability when PATCH moves the dentist', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(stored());
      prisma.appointment.findMany.mockResolvedValue([
        existing('2026-03-15T09:00:00.000Z', 30),
      ]);

      await expect(
        svc.update('apt-1', { dentistId: 'd2' } as any),
      ).rejects.toThrow(/already booked/i);
      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where.dentistId).toBe('d2');
    });

    it('skips the availability check when only notes change', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(stored());

      await svc.update('apt-1', { notes: 'brings translator' } as any);
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    });

    it('refuses an illegal status transition', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(
        stored({ status: AppointmentStatus.COMPLETED }),
      );

      await expect(
        svc.update('apt-1', { status: AppointmentStatus.SCHEDULED } as any),
      ).rejects.toThrow(/terminal status/);
    });

    it('requires a reason to cancel through PATCH', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(stored());

      await expect(
        svc.update('apt-1', { status: AppointmentStatus.CANCELLED } as any),
      ).rejects.toThrow(/cancelledReason is required/);
    });

    it('refuses to cancel over an open visit', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(
        stored({ status: AppointmentStatus.IN_PROGRESS, visit: { status: 'IN_PROGRESS' } }),
      );

      await expect(
        svc.update('apt-1', {
          status: AppointmentStatus.CANCELLED,
          cancelledReason: 'patient left',
        } as any),
      ).rejects.toThrow(/active visit/);
    });

    it('404s on a missing appointment', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(null);
      await expect(svc.update('nope', { notes: 'x' } as any)).rejects.toThrow(
        /not found/i,
      );
    });
  });

  // ── single-status endpoints ────────────────────────────────────────────────

  describe('status endpoints', () => {
    it('refuses to mark a completed appointment as no-show', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        status: AppointmentStatus.COMPLETED,
      });

      await expect(svc.markNoShow('apt-1', 'u1')).rejects.toThrow(
        /terminal status/,
      );
    });

    it('checks a scheduled patient in and stamps actualStartAt', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        status: AppointmentStatus.SCHEDULED,
      });

      await svc.checkIn('apt-1', 'u1');
      const data = prisma.appointment.update.mock.calls[0][0].data;
      expect(data.status).toBe(AppointmentStatus.ARRIVED);
      expect(data.actualStartAt).toBeInstanceOf(Date);
    });

    it('refuses to check in an appointment already in progress', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        status: AppointmentStatus.IN_PROGRESS,
      });

      await expect(svc.checkIn('apt-1', 'u1')).rejects.toThrow(
        /Cannot move appointment from IN_PROGRESS to ARRIVED/,
      );
    });

    it('requires a cancellation reason', async () => {
      const { svc } = build();
      await expect(svc.cancel('apt-1', '   ', 'u1')).rejects.toThrow(
        /reason is required/,
      );
    });

    it('rebooks a no-show through reschedule', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        status: AppointmentStatus.NO_SHOW,
        dentistId: 'd1',
        duration: 30,
        scheduledAt: new Date('2026-03-10T09:00:00.000Z'),
        internalNotes: null,
      });

      await svc.reschedule('apt-1', {
        newScheduledAt: '2026-03-20T09:00:00.000Z',
      } as any);
      expect(prisma.appointment.update).toHaveBeenCalled();
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('snapshots the row into the audit trail before destroying it', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        appointmentCode: 'APT-26-0001',
        patientId: 'p1',
        dentistId: 'd1',
        scheduledAt: new Date('2026-03-15T09:00:00.000Z'),
        duration: 30,
        status: AppointmentStatus.SCHEDULED,
        chiefComplaint: 'toothache',
        visit: null,
      });

      await svc.delete('apt-1', 'u1');

      const audit = prisma.auditLog.create.mock.calls[0][0].data;
      expect(audit.action).toBe('DELETE');
      expect(audit.oldData).toMatchObject({ appointmentCode: 'APT-26-0001' });
      expect(prisma.appointment.delete).toHaveBeenCalledWith({
        where: { id: 'apt-1' },
      });
    });

    it('refuses to delete an appointment that has a visit', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        status: AppointmentStatus.COMPLETED,
        visit: { id: 'v1' },
      });

      await expect(svc.delete('apt-1', 'u1')).rejects.toThrow(
        /Cancel it instead/,
      );
      expect(prisma.appointment.delete).not.toHaveBeenCalled();
    });
  });

  // ── queries ────────────────────────────────────────────────────────────────

  describe('queries', () => {
    it('filters the list by the clinic-local day, not UTC midnight', async () => {
      process.env.CLINIC_TIMEZONE = 'Africa/Kampala';
      const { svc, prisma } = build();
      prisma.appointment.count.mockResolvedValue(0);
      prisma.appointment.findMany.mockResolvedValue([]);

      await svc.findAll({ date: '2026-03-15' } as any);

      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where.scheduledAt.gte.toISOString()).toBe(
        '2026-03-14T21:00:00.000Z',
      );
      // Half-open: `lt`, so 23:59:59.999 local is never dropped.
      expect(where.scheduledAt.lt.toISOString()).toBe(
        '2026-03-15T21:00:00.000Z',
      );
      delete process.env.CLINIC_TIMEZONE;
    });

    it('caps page size', async () => {
      const { svc, prisma } = build();
      prisma.appointment.count.mockResolvedValue(0);
      prisma.appointment.findMany.mockResolvedValue([]);

      const res = await svc.findAll({ limit: '5000' } as any);
      expect(res.meta.limit).toBe(100);
    });

    it('summarises a day with one grouped query', async () => {
      const { svc, prisma } = build();
      prisma.appointment.groupBy.mockResolvedValue([
        { status: AppointmentStatus.SCHEDULED, _count: { _all: 3 } },
        { status: AppointmentStatus.COMPLETED, _count: { _all: 2 } },
      ]);

      const stats = await svc.getTodayStats('2026-03-15');
      expect(stats).toMatchObject({ total: 5, scheduled: 3, completed: 2, noShow: 0 });
      expect(prisma.appointment.count).not.toHaveBeenCalled();
    });

    it('returns no slots when the dentist does not work that day', async () => {
      const { svc, prisma } = build();
      prisma.staffSchedule.findFirst.mockResolvedValue(null);

      await expect(
        svc.getAvailableSlots('d1', '2026-03-15'),
      ).resolves.toEqual({ available: false, slots: [] });
    });

    it('marks a slot unavailable when an existing appointment overlaps it', async () => {
      process.env.CLINIC_TIMEZONE = 'Africa/Kampala';
      const { svc, prisma } = build();
      prisma.staffSchedule.findFirst.mockResolvedValue({
        startTime: '09:00',
        endTime: '11:00',
      });
      // 09:30 local for 60 min → covers 09:30, 10:00 and 10:30 starts.
      prisma.appointment.findMany.mockResolvedValue([
        existing('2026-03-15T06:30:00.000Z', 60),
      ]);

      const res: any = await svc.getAvailableSlots('d1', '2026-03-15', 30);
      const byTime = Object.fromEntries(
        res.slots.map((s: any) => [s.time, s.available]),
      );
      expect(byTime['09:00']).toBe(true);
      expect(byTime['09:30']).toBe(false);
      expect(byTime['10:00']).toBe(false);
      expect(byTime['10:30']).toBe(true);
      delete process.env.CLINIC_TIMEZONE;
    });
  });
});
