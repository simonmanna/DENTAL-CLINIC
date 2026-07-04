import { AppController } from './app.controller';

describe('AppController', () => {
  it('getHello delegates to the service', () => {
    const appService = { getHello: jest.fn().mockReturnValue('Hello World!') };
    const controller = new AppController(appService as any);
    expect(controller.getHello()).toBe('Hello World!');
    expect(appService.getHello).toHaveBeenCalled();
  });
});
