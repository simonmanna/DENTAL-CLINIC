import { ConfigService } from '@nestjs/config';
import { FileTokenService } from './file-token.service';

describe('FileTokenService', () => {
  const config = {
    get: (key: string) =>
      key === 'JWT_ACCESS_SECRET' ? 'test-secret-value-long-enough' : undefined,
  } as unknown as ConfigService;

  const service = new FileTokenService(config);

  it('verifies a token it minted', () => {
    const { token, expiresAt } = service.mint('user-1');
    expect(service.verify(token)).toBe('user-1');
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects a missing or malformed token', () => {
    expect(service.verify(undefined)).toBeNull();
    expect(service.verify('')).toBeNull();
    expect(service.verify('nonsense')).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const { token } = service.mint('user-1');
    const [payload, signature] = [
      token.slice(0, token.lastIndexOf('.')),
      token.slice(token.lastIndexOf('.') + 1),
    ];
    const forged = Buffer.from('user-2.99999999999').toString('base64url');
    expect(service.verify(`${forged}.${signature}`)).toBeNull();
    expect(service.verify(`${payload}.${signature.slice(0, -2)}xx`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const { token } = service.mint('user-1');
    const realNow = Date.now;
    Date.now = () => realNow() + (FileTokenService.TTL_SECONDS + 60) * 1000;
    try {
      expect(service.verify(token)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it('rejects a token signed with a different secret', () => {
    const other = new FileTokenService({
      get: () => 'a-completely-different-secret',
    } as unknown as ConfigService);
    expect(service.verify(other.mint('user-1').token)).toBeNull();
  });
});
