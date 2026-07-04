import { NotificationsService } from './notifications.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('NotificationsService', () => {
  it('constructs with Prisma', () => {
    expect(new NotificationsService(createPrismaMock() as any)).toBeDefined();
  });
});
