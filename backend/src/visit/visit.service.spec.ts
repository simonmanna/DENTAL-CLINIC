import { Prisma, UserRole, VisitStatus, AppointmentStatus } from '@prisma/client';
import { VisitsService, ActingUser } from './visit.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

const D = (v: string | number) => new Prisma.Decimal(v);

function build() {
  const prisma = createPrismaMock() as any;
  const docNum: any = { next: jest.fn().mockResolvedValue('VIS-26-0001') };
  const svc = new VisitsService(prisma, docNum);

  prisma.visit.update.mockImplementation(async ({ data }: any) => ({
    id: 'v1',
    status: VisitStatus.ARRIVED,
    totalCost: D(0),
    amountPaid: D(0),
    ...data,
  }));
  prisma.visit.create.mockImplementation(async ({ data }: any) => ({
    id: 'v1',
    ...data,
  }));

  return { svc, prisma, docNum };
}

const DENTIST: ActingUser = {
  id: 'u-dentist',
  role: UserRole.DENTIST,
  staffId: 'd1',
};
const OTHER_DENTIST: ActingUser = {
  id: 'u-other',
  role: UserRole.DENTIST,
  staffId: 'd2',
};
const NURSE: ActingUser = { id: 'u-nurse', role: UserRole.NURSE, staffId: 'n1' };
const ADMIN: ActingUser = { id: 'u-admin', role: UserRole.ADMIN, staffId: null };

const visitRow = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  visitCode: 'VIS-26-0001',
  patientId: 'p1',
  dentistId: 'd1',
  status: VisitStatus.IN_PROGRESS,
  totalCost: D(0),
  amountPaid: D(0),
  startedAt: null,
  subjective: null,
  objective: null,
  assessment: null,
  plan: null,
  chiefComplaint: null,
  historyOfPresentIllness: null,
  findings: null,
  recommendations: null,
  bloodPressure: null,
  pulseRate: null,
  temperature: null,
  weight: null,
  height: null,
  oxygenSat: null,
  appointmentId: 'apt-1',
  ...over,
});

const procedureRow = (over: Record<string, unknown> = {}) => ({
  id: 'proc-1',
  name: 'Composite filling',
  isActive: true,
  basePrice: D(150000),
  baseCost: D(40000),
  pricingModel: 'PER_TOOTH',
  priceRangeMin: null,
  priceRangeMax: null,
  currency: 'UGX',
  ...over,
});

describe('VisitsService', () => {
  it('constructs with Prisma + DocumentNumber', () => {
    expect(build().svc).toBeDefined();
  });

  // ── createVisit ────────────────────────────────────────────────────────────

  describe('createVisit', () => {
    const arrivedAppointment = (over: Record<string, unknown> = {}) => ({
      id: 'apt-1',
      patientId: 'p1',
      dentistId: 'd1',
      status: AppointmentStatus.ARRIVED,
      visit: null,
      ...over,
    });

    it('opens the visit as ARRIVED so the examination can be started', async () => {
      // The old code wrote IN_PROGRESS here, which made ARRIVED unreachable
      // and left startExamination permanently returning 400.
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(arrivedAppointment());
      prisma.staff.findUnique.mockResolvedValue({ id: 'd1' });

      await svc.createVisit({ appointmentId: 'apt-1' } as any, DENTIST);

      expect(prisma.visit.create.mock.calls[0][0].data.status).toBe(
        VisitStatus.ARRIVED,
      );
    });

    it('moves the appointment to IN_PROGRESS in the same transaction', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(arrivedAppointment());
      prisma.staff.findUnique.mockResolvedValue({ id: 'd1' });

      await svc.createVisit({ appointmentId: 'apt-1' } as any, DENTIST);

      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'apt-1' },
        data: { status: AppointmentStatus.IN_PROGRESS },
      });
    });

    it('falls back to the appointment dentist when none is supplied', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(arrivedAppointment());
      prisma.staff.findUnique.mockResolvedValue({ id: 'd1' });

      await svc.createVisit({ appointmentId: 'apt-1' } as any, DENTIST);
      expect(prisma.visit.create.mock.calls[0][0].data.dentistId).toBe('d1');
    });

    it('honours an explicit dentist taking over the chair', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(arrivedAppointment());
      prisma.staff.findUnique.mockResolvedValue({ id: 'd9' });

      await svc.createVisit(
        { appointmentId: 'apt-1', dentistId: 'd9' } as any,
        ADMIN,
      );
      expect(prisma.visit.create.mock.calls[0][0].data.dentistId).toBe('d9');
    });

    it('refuses when the patient is not checked in', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(
        arrivedAppointment({ status: AppointmentStatus.SCHEDULED }),
      );

      await expect(
        svc.createVisit({ appointmentId: 'apt-1' } as any, DENTIST),
      ).rejects.toThrow(/checked in first/);
    });

    it('refuses a second visit on one appointment', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(
        arrivedAppointment({ visit: { id: 'v-old' } }),
      );

      await expect(
        svc.createVisit({ appointmentId: 'apt-1' } as any, DENTIST),
      ).rejects.toThrow(/already exists/);
    });

    it('404s on an unknown appointment', async () => {
      const { svc, prisma } = build();
      prisma.appointment.findUnique.mockResolvedValue(null);
      await expect(
        svc.createVisit({ appointmentId: 'nope' } as any, DENTIST),
      ).rejects.toThrow(/Appointment not found/);
    });
  });

  // ── startExamination ───────────────────────────────────────────────────────

  describe('startExamination', () => {
    it('moves an ARRIVED visit into IN_PROGRESS', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.ARRIVED }),
      );

      await svc.startExamination('v1', DENTIST);
      const data = prisma.visit.update.mock.calls[0][0].data;
      expect(data.status).toBe(VisitStatus.IN_PROGRESS);
      expect(data.startedAt).toBeInstanceOf(Date);
    });

    it('is idempotent for a double-clicked button', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.IN_PROGRESS }),
      );

      await svc.startExamination('v1', DENTIST);
      expect(prisma.visit.update).not.toHaveBeenCalled();
    });

    it('refuses on a completed visit', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.COMPLETED }),
      );
      await expect(svc.startExamination('v1', DENTIST)).rejects.toThrow(
        /terminal status/,
      );
    });

    it('404s rather than surfacing a Prisma error', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(null);
      await expect(svc.startExamination('nope', DENTIST)).rejects.toThrow(
        /Visit not found/,
      );
    });
  });

  // ── clinical notes ─────────────────────────────────────────────────────────

  describe('updateSOAP', () => {
    it('writes to an open visit and audits only the changed fields', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ subjective: 'same', objective: null }),
      );
      prisma.visit.update.mockResolvedValue({ id: 'v1' });

      await svc.updateSOAP(
        'v1',
        { subjective: 'same', objective: 'swelling 36' } as any,
        DENTIST,
      );

      const audit = prisma.auditLog.create.mock.calls[0][0].data;
      expect(audit.action).toBe('UPDATE_SOAP');
      expect(audit.newData).toEqual({ objective: 'swelling 36' });
    });

    it('404s on a missing visit instead of a raw P2025', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(null);
      await expect(
        svc.updateSOAP('nope', { plan: 'x' } as any, DENTIST),
      ).rejects.toThrow(/Visit not found/);
    });

    it('refuses a silent edit of a completed record', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.COMPLETED }),
      );

      await expect(
        svc.updateSOAP('v1', { plan: 'rewritten' } as any, DENTIST),
      ).rejects.toThrow(/amendmentReason/);
    });

    it('allows the treating dentist to amend with a reason, audited as such', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.COMPLETED, plan: 'original' }),
      );
      prisma.visit.update.mockResolvedValue({ id: 'v1' });

      await svc.updateSOAP(
        'v1',
        { plan: 'corrected', amendmentReason: 'typo in tooth number' } as any,
        DENTIST,
      );

      const audit = prisma.auditLog.create.mock.calls[0][0].data;
      expect(audit.action).toBe('AMEND_SOAP');
      expect(audit.oldData).toEqual({ plan: 'original' });
      expect(audit.reason).toBe('typo in tooth number');
    });

    it('blocks another dentist from amending someone else’s closed record', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.COMPLETED }),
      );

      await expect(
        svc.updateSOAP(
          'v1',
          { plan: 'x', amendmentReason: 'because' } as any,
          OTHER_DENTIST,
        ),
      ).rejects.toThrow(/treating dentist or an administrator/);
    });

    it('lets an administrator amend any closed record', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.COMPLETED }),
      );
      prisma.visit.update.mockResolvedValue({ id: 'v1' });

      await expect(
        svc.updateSOAP(
          'v1',
          { plan: 'x', amendmentReason: 'records correction' } as any,
          ADMIN,
        ),
      ).resolves.toBeDefined();
    });

    it('never writes to a cancelled visit', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.CANCELLED }),
      );

      await expect(
        svc.updateSOAP(
          'v1',
          { plan: 'x', amendmentReason: 'anything' } as any,
          ADMIN,
        ),
      ).rejects.toThrow(/cancelled visit/);
    });

    it('rejects an empty payload', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(visitRow());
      await expect(svc.updateSOAP('v1', {} as any, DENTIST)).rejects.toThrow(
        /No clinical note fields/,
      );
    });
  });

  describe('updateVitals', () => {
    it('records vitals on an open visit', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(visitRow());
      prisma.visit.update.mockResolvedValue({ id: 'v1' });

      await svc.updateVitals('v1', { pulseRate: 72 } as any, NURSE);
      expect(prisma.visit.update.mock.calls[0][0].data).toEqual({
        pulseRate: 72,
      });
    });

    it('refuses to rewrite vitals on a completed visit without a reason', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.COMPLETED }),
      );
      await expect(
        svc.updateVitals('v1', { pulseRate: 72 } as any, DENTIST),
      ).rejects.toThrow(/amendmentReason/);
    });
  });

  // ── addProcedure ───────────────────────────────────────────────────────────

  describe('addProcedure', () => {
    beforeEach(() => undefined);

    function setup(over: Record<string, unknown> = {}) {
      const ctx = build();
      ctx.prisma.visit.findUnique.mockResolvedValue(visitRow(over));
      ctx.prisma.procedure.findUnique.mockResolvedValue(procedureRow());
      ctx.prisma.clinicSettings.findUnique.mockResolvedValue(null);
      ctx.prisma.visitProcedure.create.mockImplementation(
        async ({ data }: any) => ({ id: 'vp1', ...data }),
      );
      ctx.prisma.visit.update.mockResolvedValue({
        totalCost: D(300000),
        amountPaid: D(0),
      });
      return ctx;
    }

    it('prices from the catalogue and ignores no client figure at all', async () => {
      // PER_TOOTH at 150,000 × 2 teeth = 300,000.
      const { svc, prisma } = setup();
      await svc.addProcedure(
        'v1',
        { procedureId: 'proc-1', toothNumbers: [36, 37] } as any,
        DENTIST,
      );

      const data = prisma.visitProcedure.create.mock.calls[0][0].data;
      expect(data.cost.toString()).toBe('300000');
      expect(data.unitPrice.toString()).toBe('150000');
    });

    it('rejects a client cost that disagrees with the catalogue', async () => {
      // The forgeable shape: any authenticated caller used to bill a crown at
      // zero by sending cost: 0.
      const { svc } = setup();
      await expect(
        svc.addProcedure(
          'v1',
          { procedureId: 'proc-1', toothNumbers: [36], cost: 0 } as any,
          DENTIST,
        ),
      ).rejects.toThrow(/does not match the catalogue price/);
    });

    it('accepts a matching client cost', async () => {
      const { svc } = setup();
      await expect(
        svc.addProcedure(
          'v1',
          { procedureId: 'proc-1', toothNumbers: [36], cost: 150000 } as any,
          DENTIST,
        ),
      ).resolves.toBeDefined();
    });

    it('allows a privileged override with a reason and records both figures', async () => {
      const { svc, prisma } = setup();
      await svc.addProcedure(
        'v1',
        {
          procedureId: 'proc-1',
          toothNumbers: [36],
          cost: 100000,
          isPriceOverridden: true,
          overrideReason: 'staff discount',
        } as any,
        DENTIST,
      );

      const data = prisma.visitProcedure.create.mock.calls[0][0].data;
      expect(data.cost.toString()).toBe('100000');
      const audit = prisma.auditLog.create.mock.calls[0][0].data;
      expect(audit.action).toBe('ADD_PROCEDURE_OVERRIDE');
      expect(audit.newData).toMatchObject({
        cataloguePrice: '150000.00',
        chargedCost: '100000.00',
      });
      expect(audit.reason).toBe('staff discount');
    });

    it('refuses an override from a role that may not discount', async () => {
      const { svc } = setup();
      await expect(
        svc.addProcedure(
          'v1',
          {
            procedureId: 'proc-1',
            toothNumbers: [36],
            cost: 0,
            isPriceOverridden: true,
            overrideReason: 'free',
          } as any,
          NURSE,
        ),
      ).rejects.toThrow(/may not override a procedure price/);
    });

    it('refuses an override without a reason', async () => {
      const { svc } = setup();
      await expect(
        svc.addProcedure(
          'v1',
          {
            procedureId: 'proc-1',
            toothNumbers: [36],
            cost: 1,
            isPriceOverridden: true,
          } as any,
          ADMIN,
        ),
      ).rejects.toThrow(/overrideReason is required/);
    });

    it('increments the visit total in the same transaction as the insert', async () => {
      const { svc, prisma } = setup();
      await svc.addProcedure(
        'v1',
        { procedureId: 'proc-1', toothNumbers: [36, 37] } as any,
        DENTIST,
      );

      const increment = prisma.visit.update.mock.calls[0][0].data.totalCost;
      expect(increment.increment.toString()).toBe('300000');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('refuses a withdrawn procedure', async () => {
      const { svc, prisma } = setup();
      prisma.procedure.findUnique.mockResolvedValue(
        procedureRow({ isActive: false }),
      );
      await expect(
        svc.addProcedure('v1', { procedureId: 'proc-1' } as any, DENTIST),
      ).rejects.toThrow(/no longer active/);
    });

    it('404s on an unknown procedure', async () => {
      const { svc, prisma } = setup();
      prisma.procedure.findUnique.mockResolvedValue(null);
      await expect(
        svc.addProcedure('v1', { procedureId: 'ghost' } as any, DENTIST),
      ).rejects.toThrow(/Procedure not found/);
    });

    it('refuses to chart onto a completed visit', async () => {
      const { svc } = setup({ status: VisitStatus.COMPLETED });
      await expect(
        svc.addProcedure('v1', { procedureId: 'proc-1' } as any, DENTIST),
      ).rejects.toThrow(/completed visit/);
    });
  });

  // ── prescriptions ──────────────────────────────────────────────────────────

  describe('writePrescription', () => {
    const item = {
      drugId: 'drug-1',
      dosage: '500mg',
      frequency: 'TDS',
      duration: '5 days',
      quantity: 15,
    };

    it('writes a prescription for active drugs', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(visitRow());
      prisma.drug.findMany.mockResolvedValue([
        { id: 'drug-1', name: 'Amoxicillin', isActive: true },
      ]);
      prisma.prescription.create.mockResolvedValue({ id: 'rx1' });

      await expect(
        svc.writePrescription('v1', { items: [item] } as any, DENTIST),
      ).resolves.toBeDefined();
    });

    it('refuses an unknown drug id', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(visitRow());
      prisma.drug.findMany.mockResolvedValue([]);

      await expect(
        svc.writePrescription('v1', { items: [item] } as any, DENTIST),
      ).rejects.toThrow(/Unknown drug id/);
    });

    it('refuses a withdrawn drug', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(visitRow());
      prisma.drug.findMany.mockResolvedValue([
        { id: 'drug-1', name: 'Withdrawn syrup', isActive: false },
      ]);

      await expect(
        svc.writePrescription('v1', { items: [item] } as any, DENTIST),
      ).rejects.toThrow(/no longer active/);
    });

    it('refuses an empty prescription', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(visitRow());
      await expect(
        svc.writePrescription('v1', { items: [] } as any, DENTIST),
      ).rejects.toThrow(/At least one medication/);
    });

    it('refuses to prescribe against a cancelled visit', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.CANCELLED }),
      );
      await expect(
        svc.writePrescription('v1', { items: [item] } as any, DENTIST),
      ).rejects.toThrow(/cancelled visit/);
    });
  });

  // ── completion & cancellation ──────────────────────────────────────────────

  describe('completeVisit', () => {
    it('recomputes the total from the procedure lines and derives the balance status', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ totalCost: D(999), amountPaid: D(100000) }),
      );
      prisma.visitProcedure.findMany.mockResolvedValue([
        { cost: D(150000) },
        { cost: D(50000) },
      ]);
      prisma.visit.update.mockResolvedValue({ id: 'v1' });

      await svc.completeVisit('v1', {} as any, DENTIST);

      const data = prisma.visit.update.mock.calls[0][0].data;
      expect(data.totalCost.toString()).toBe('200000');
      expect(data.paymentStatus).toBe('PARTIALLY_PAID');
      expect(data.status).toBe(VisitStatus.COMPLETED);
    });

    it('marks the appointment completed', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(visitRow());
      prisma.visitProcedure.findMany.mockResolvedValue([]);
      prisma.visit.update.mockResolvedValue({ id: 'v1' });

      await svc.completeVisit('v1', {} as any, DENTIST);
      expect(prisma.appointment.update.mock.calls[0][0].data.status).toBe(
        AppointmentStatus.COMPLETED,
      );
    });

    it('refuses to complete a visit that never started', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.ARRIVED }),
      );
      await expect(
        svc.completeVisit('v1', {} as any, DENTIST),
      ).rejects.toThrow(/Cannot move visit from ARRIVED to COMPLETED/);
    });
  });

  describe('cancelVisit', () => {
    it('cancels an open visit with no billable work and releases the chair', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue({
        ...visitRow(),
        appointment: { id: 'apt-1', status: AppointmentStatus.IN_PROGRESS },
        _count: { procedures: 0, prescriptions: 0 },
      });
      prisma.visit.update.mockResolvedValue({ id: 'v1' });

      await svc.cancelVisit('v1', 'patient left', DENTIST);

      expect(prisma.visit.update.mock.calls[0][0].data.status).toBe(
        VisitStatus.CANCELLED,
      );
      expect(prisma.appointment.update.mock.calls[0][0].data.status).toBe(
        AppointmentStatus.CANCELLED,
      );
    });

    it('refuses to cancel a visit that already has procedures', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue({
        ...visitRow(),
        appointment: { id: 'apt-1', status: AppointmentStatus.IN_PROGRESS },
        _count: { procedures: 2, prescriptions: 0 },
      });

      await expect(
        svc.cancelVisit('v1', 'changed mind', DENTIST),
      ).rejects.toThrow(/credit the invoice instead/);
    });

    it('requires a reason', async () => {
      const { svc } = build();
      await expect(svc.cancelVisit('v1', '  ', DENTIST)).rejects.toThrow(
        /reason is required/,
      );
    });
  });

  // ── dashboard ──────────────────────────────────────────────────────────────

  describe('getVisitDashboard', () => {
    it('reports the stored money columns rather than hardcoded zeros', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue({
        ...visitRow({
          totalCost: D(200000),
          amountPaid: D(50000),
          paymentStatus: 'PARTIALLY_PAID',
        }),
        procedures: [{ cost: D(150000) }, { cost: D(50000) }],
        prescriptions: [],
      });
      prisma.visit.findMany.mockResolvedValue([]);

      const res: any = await svc.getVisitDashboard('v1');
      expect(res.financials).toMatchObject({
        totalCost: '200000.00',
        amountPaid: '50000.00',
        balance: '150000.00',
        paymentStatus: 'PARTIALLY_PAID',
        totalsInSync: true,
      });
    });

    it('flags a visit whose total has drifted from its procedure lines', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue({
        ...visitRow({ totalCost: D(10), amountPaid: D(0) }),
        procedures: [{ cost: D(150000) }],
        prescriptions: [],
      });
      prisma.visit.findMany.mockResolvedValue([]);

      const res: any = await svc.getVisitDashboard('v1');
      expect(res.financials.totalsInSync).toBe(false);
    });

    it('404s on a missing visit', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(null);
      await expect(svc.getVisitDashboard('nope')).rejects.toThrow(
        /Visit not found/,
      );
    });
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('getAllVisits', () => {
    it('filters by the clinic-local day', async () => {
      process.env.CLINIC_TIMEZONE = 'Africa/Kampala';
      const { svc, prisma } = build();
      prisma.visit.findMany.mockResolvedValue([]);
      prisma.visit.count.mockResolvedValue(0);

      await svc.getAllVisits({ date: '2026-03-15' });
      const where = prisma.visit.findMany.mock.calls[0][0].where;
      expect(where.checkedInAt.gte.toISOString()).toBe(
        '2026-03-14T21:00:00.000Z',
      );
      expect(where.checkedInAt.lt.toISOString()).toBe(
        '2026-03-15T21:00:00.000Z',
      );
      delete process.env.CLINIC_TIMEZONE;
    });

    it('rejects an unknown status rather than returning an empty page', async () => {
      const { svc } = build();
      await expect(svc.getAllVisits({ status: 'BANANA' })).rejects.toThrow(
        /Unknown visit status/,
      );
    });

    it('falls back to a safe sort column', async () => {
      const { svc, prisma } = build();
      prisma.visit.findMany.mockResolvedValue([]);
      prisma.visit.count.mockResolvedValue(0);

      await svc.getAllVisits({ sortBy: 'patient.ssn; DROP TABLE visits' });
      expect(prisma.visit.findMany.mock.calls[0][0].orderBy).toEqual({
        checkedInAt: 'desc',
      });
    });

    it('caps page size', async () => {
      const { svc, prisma } = build();
      prisma.visit.findMany.mockResolvedValue([]);
      prisma.visit.count.mockResolvedValue(0);

      const res = await svc.getAllVisits({ limit: 10_000 });
      expect(res.meta.limit).toBe(100);
    });
  });
});
