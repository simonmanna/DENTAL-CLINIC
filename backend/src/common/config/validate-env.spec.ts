import { validateEnv } from './validate-env';

const baseEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://postgres:hunter2@localhost:5432/dentaldb2',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
});

describe('validateEnv — CLINIC_TIMEZONE', () => {
  it('accepts an absent timezone (the default applies)', () => {
    expect(() => validateEnv(baseEnv())).not.toThrow();
  });

  it('accepts a known IANA zone', () => {
    expect(() =>
      validateEnv({ ...baseEnv(), CLINIC_TIMEZONE: 'Africa/Kampala' }),
    ).not.toThrow();
  });

  it('refuses to start on a mistyped zone', () => {
    // A typo used to fall back to the default silently, which shifts every
    // date filter in the scheduling module by the offset difference.
    expect(() =>
      validateEnv({ ...baseEnv(), CLINIC_TIMEZONE: 'Africa/Kampalla' }),
    ).toThrow(/not a known IANA timezone/);
  });
});
