import { AppointmentsService } from './appointments.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

describe('AppointmentsService', () => {
  it('constructs with Prisma + DocumentNumber + event emitter', () => {
    const docNum = { next: jest.fn().mockResolvedValue('APT-26-0001') };
    expect(
      new AppointmentsService(
        createPrismaMock() as any,
        docNum as any,
        createAutoMock(),
      ),
    ).toBeDefined();
  });

  // P-07: two concurrent create() calls must yield distinct appointmentCodes
  // (no P2002 collision). The docNum counter row-locks on (prefix, year) so
  // the second tx waits then receives the next number.
  it('P-07: generate appointment codes atomically inside the create tx', async () => {
    const prisma = createPrismaMock() as any;
    // Appointment lookup for availability check returns no conflict.
    prisma.appointment.findFirst.mockResolvedValue(null);
    const docNum: any = { next: jest.fn() };
    // Simulate the row-locking counter: two tx observe two distinct codes.
    docNum.next
      .mockResolvedValueOnce('APT-26-0042')
      .mockResolvedValueOnce('APT-26-0043');

    const svc = new AppointmentsService(
      prisma,
      docNum,
      createAutoMock(),
    );

    // Inside the tx, `tx.appointment.create` should return the persisted row.
    // The prisma mock proxies tx → same client, so we wire create() to echo
    // the code it received back into the result.
    prisma.appointment.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      id: `apt-${data.appointmentCode}`,
    }));

    const dto: any = {
      dentistId: 'd1',
      patientId: 'p1',
      scheduledAt: new Date().toISOString(),
    };

    // Run two concurrent creates; both should succeed with distinct codes.
    const [a, b] = await Promise.all([svc.create(dto), svc.create(dto)]);
    expect(a.appointmentCode).toBe('APT-26-0042');
    expect(b.appointmentCode).toBe('APT-26-0043');
    expect(a.appointmentCode).not.toBe(b.appointmentCode);
    expect(docNum.next).toHaveBeenCalledTimes(2);
    expect(docNum.next).toHaveBeenCalledWith('APT', expect.anything());
  });
});
