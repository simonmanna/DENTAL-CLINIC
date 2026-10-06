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
  // Lifecycle transitions are conditional updates.
  prisma.visit.updateMany.mockResolvedValue({ count: 1 });

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
      const call = prisma.visit.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'v1', status: VisitStatus.ARRIVED });
      expect(call.data.status).toBe(VisitStatus.IN_PROGRESS);
      expect(call.data.startedAt).toBeInstanceOf(Date);
    });

    it('409s when a concurrent request already moved the visit', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ status: VisitStatus.ARRIVED }),
      );
      prisma.visit.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.startExamination('v1', DENTIST)).rejects.toThrow(
        /changed by another request/,
      );
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

    it('bills the line on the visit invoice in the same transaction as the insert', async () => {
      const ctx = setup();
      const lifecycle = {
        addVisitProcedureItemTx: jest.fn().mockResolvedValue({
          invoiceId: 'inv1',
          invoiceNumber: 'INV-1',
          invoiceStatus: 'DRAFT',
        }),
      };
      const svc = new VisitsService(ctx.prisma, ctx.docNum, lifecycle as any);
      const res: any = await svc.addProcedure(
        'v1',
        { procedureId: 'proc-1', toothNumbers: [36, 37] } as any,
        DENTIST,
      );

      const args = lifecycle.addVisitProcedureItemTx.mock.calls[0][1];
      expect(args).toMatchObject({
        visitId: 'v1',
        visitProcedureId: 'vp1',
        procedureId: 'proc-1',
      });
      expect(args.total.toString()).toBe('300000');
      expect(res.billing.invoiceId).toBe('inv1');
      // The visit's legacy total column is no longer written.
      expect(ctx.prisma.visit.update).not.toHaveBeenCalled();
    });

    it('rejects an invalid FDI tooth', async () => {
      const { svc } = setup();
      await expect(
        svc.addProcedure(
          'v1',
          { procedureId: 'proc-1', toothNumbers: [19] } as any,
          DENTIST,
        ),
      ).rejects.toThrow(/Invalid tooth number/);
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
      ).rejects.toThrow(/reason/i);
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
    it('closes the visit atomically without rewriting its money columns', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(
        visitRow({ totalCost: D(999), amountPaid: D(100000) }),
      );
      prisma.procedureSession.count.mockResolvedValue(1);
      prisma.invoice.count.mockResolvedValue(2);

      const res: any = await svc.completeVisit('v1', {} as any, DENTIST);

      const call = prisma.visit.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'v1', status: VisitStatus.IN_PROGRESS });
      expect(call.data.status).toBe(VisitStatus.COMPLETED);
      expect(call.data.totalCost).toBeUndefined();
      expect(call.data.paymentStatus).toBeUndefined();
      expect(res.warnings).toEqual({ openSessions: 1, draftInvoices: 2 });
    });

    it('marks the appointment completed', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue(visitRow());

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
      });

      await svc.cancelVisit('v1', 'patient left', DENTIST);

      expect(prisma.visit.updateMany.mock.calls[0][0].data.status).toBe(
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
      });
      prisma.visitProcedure.count.mockResolvedValue(2);

      await expect(
        svc.cancelVisit('v1', 'changed mind', DENTIST),
      ).rejects.toThrow(/already holds records [(]2 procedures[)]/);
    });

    it('refuses to cancel a visit with executed sessions or an invoice', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue({
        ...visitRow(),
        appointment: { id: 'apt-1', status: AppointmentStatus.IN_PROGRESS },
      });
      prisma.procedureSession.count.mockResolvedValue(1);
      prisma.invoice.count.mockResolvedValue(1);

      await expect(
        svc.cancelVisit('v1', 'changed mind', DENTIST),
      ).rejects.toThrow(/1 sessions, 1 invoices/);
      expect(prisma.visit.updateMany).not.toHaveBeenCalled();
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
    it('reports money from the visit invoices, not the legacy columns', async () => {
      const { svc, prisma } = build();
      prisma.visit.findUnique.mockResolvedValue({
        ...visitRow({ totalCost: D(0), amountPaid: D(0) }),
        procedures: [{ cost: D(150000) }, { cost: D(50000) }],
        prescriptions: [],
      });
      prisma.visit.findMany.mockResolvedValue([]);
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          status: 'POSTED',
          currency: 'UGX',
          total: D(200000),
          amountPaid: D(50000),
          baseTotal: D(200000),
          baseAmountPaid: D(50000),
        },
      ]);

      const res: any = await svc.getVisitDashboard('v1');
      expect(res.financials).toMatchObject({
        proceduresTotal: '200000.00',
        totalCost: '200000.00',
        amountPaid: '50000.00',
        balance: '150000.00',
        refundDue: '0.00',
        paymentStatus: 'PARTIALLY_PAID',
      });
      expect(prisma.invoice.findMany.mock.calls[0][0].where).toMatchObject({
        visitId: 'v1',
        status: { not: 'VOID' },
      });
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

describe('VisitsService.removeProcedure', () => {
  function setup() {
    const prisma = createPrismaMock() as any;
    const docNum: any = { next: jest.fn() };
    const lifecycle = {
      reverseVisitProcedureBillingTx: jest.fn().mockResolvedValue({
        invoiceId: 'inv1',
        invoiceStatus: 'POSTED',
        glAdjusted: true,
        refundDue: '0.00',
      }),
    };
    const stock = { reverseDocument: jest.fn().mockResolvedValue({ reversed: 2 }) };
    const svc = new VisitsService(prisma, docNum, lifecycle as any, stock as any);
    prisma.visitProcedure.findUnique.mockResolvedValue({
      id: 'vp1',
      visitId: 'v1',
      cost: new Prisma.Decimal(300000),
      deletedAt: null,
      procedure: { name: 'Composite' },
    });
    prisma.visit.findUnique.mockResolvedValue({
      id: 'v1',
      patientId: 'p1',
      dentistId: 'd1',
      status: VisitStatus.IN_PROGRESS,
    });
    prisma.visitProcedure.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryLedger.count.mockResolvedValue(2);
    return { prisma, svc, lifecycle, stock };
  }

  it('soft-deletes, returns stock and reverses the invoice line', async () => {
    const { prisma, svc, lifecycle, stock } = setup();
    const res: any = await svc.removeProcedure('vp1', { reason: 'wrong tooth' }, DENTIST);

    const upd = prisma.visitProcedure.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'vp1', deletedAt: null });
    expect(upd.data.deletedReason).toBe('wrong tooth');
    expect(prisma.visitProcedure.delete).not.toHaveBeenCalled();
    expect(stock.reverseDocument.mock.calls[0][1]).toMatchObject({
      referenceType: 'VISIT_PROCEDURE',
      referenceId: 'vp1',
    });
    expect(lifecycle.reverseVisitProcedureBillingTx).toHaveBeenCalledWith(
      expect.anything(),
      'vp1',
      'wrong tooth',
      'u-dentist',
    );
    expect(res).toMatchObject({ success: true, stockReversed: 2 });
  });

  it('404s on an already-removed procedure', async () => {
    const { prisma, svc } = setup();
    prisma.visitProcedure.findUnique.mockResolvedValue({ id: 'vp1', deletedAt: new Date() });
    await expect(
      svc.removeProcedure('vp1', { reason: 'x' }, DENTIST),
    ).rejects.toThrow(/not found/);
  });

  it('refuses on a cancelled visit', async () => {
    const { prisma, svc } = setup();
    prisma.visit.findUnique.mockResolvedValue({
      id: 'v1', patientId: 'p1', dentistId: 'd1', status: VisitStatus.CANCELLED,
    });
    await expect(
      svc.removeProcedure('vp1', { reason: 'x' }, DENTIST),
    ).rejects.toThrow(/cancelled visit/);
  });
});
