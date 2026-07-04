import { PaymentsService } from './payments.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

// PaymentsService coordinates payments, the expenses service (forwardRef) and
// document numbering. Deep payment flows are exercised via the billing/invoice
// integration; this unit suite verifies the service wires up.
describe('PaymentsService', () => {
  it('constructs with its injected dependencies', () => {
    const service = new PaymentsService(
      createPrismaMock() as any,
      createAutoMock(),
      createAutoMock(),
    );
    expect(service).toBeDefined();
  });
});
