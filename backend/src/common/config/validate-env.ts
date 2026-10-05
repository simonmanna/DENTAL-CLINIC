/**
 * Fail-fast validation of the environment the server needs.
 *
 * Several settings have development-friendly fallbacks (a localhost CORS origin,
 * for instance). Those are convenient locally and dangerous in production, so in
 * production the server refuses to start unless every one is set explicitly.
 */
const REQUIRED_ALWAYS = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const REQUIRED_IN_PRODUCTION = ['CORS_ORIGIN'];

const PLACEHOLDERS = ['change-me', 'changeme', 'your-secret', 'YOUR_DB_PASSWORD'];

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const isProduction = env.NODE_ENV === 'production';
  const required = isProduction
    ? [...REQUIRED_ALWAYS, ...REQUIRED_IN_PRODUCTION]
    : REQUIRED_ALWAYS;

  const problems: string[] = [];

  for (const key of required) {
    const value = env[key];
    if (!value || !value.trim()) {
      problems.push(`${key} is not set`);
      continue;
    }
    if (PLACEHOLDERS.some((p) => value.toLowerCase().includes(p.toLowerCase()))) {
      problems.push(`${key} still contains an example placeholder value`);
    }
  }

  if (isProduction) {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      const value = env[key];
      if (value && value.length < 32) {
        problems.push(`${key} is shorter than 32 characters`);
      }
    }
    if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
    }
    if (env.CORS_ORIGIN && env.CORS_ORIGIN.includes('localhost')) {
      problems.push('CORS_ORIGIN points at localhost');
    }
  }

  if (problems.length) {
    throw new Error(
      `Invalid environment (NODE_ENV=${env.NODE_ENV ?? 'unset'}):\n` +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\nSee backend/.env.example.',
    );
  }
}

/**
 * The origins the API accepts browser requests from. Comma-separated so a clinic
 * can serve the SPA from more than one hostname; only outside production does it
 * fall back to the Vite dev server.
 */
export function corsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (configured.length) return configured;
  return ['http://localhost:5173'];
}
