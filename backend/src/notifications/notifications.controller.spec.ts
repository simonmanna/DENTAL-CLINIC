import { NotificationsController } from './notifications.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('NotificationsController', () => {
  it('constructs with its injected service', () => {
    expect(new NotificationsController(createAutoMock())).toBeDefined();
  });
});
