import { Prisma } from '@prisma/client';
import { withSerializableRetry, isSerializationFailure } from './serializable';

const p2034 = () =>
  new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });

describe('withSerializableRetry', () => {
  it('retries a serialization failure and returns the later result', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(p2034())
      .mockResolvedValueOnce('ok');
    await expect(withSerializableRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt budget', async () => {
    const fn = jest.fn().mockRejectedValue(p2034());
    await expect(withSerializableRetry(fn, 2)).rejects.toMatchObject({
      code: 'P2034',
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry other errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(withSerializableRetry(fn)).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recognises only P2034', () => {
    expect(isSerializationFailure(p2034())).toBe(true);
    expect(isSerializationFailure(new Error('x'))).toBe(false);
  });
});
