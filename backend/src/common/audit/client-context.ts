// src/common/audit/client-context.ts
// ─────────────────────────────────────────────────────────────────────────────
// AUDIT-FORENSIC (Fix #4): single helper that extracts the IP + user-agent
// from any Express / Fastify request object and normalises them into the
// shape every audit helper now accepts. Centralised so:
//
//   1. Every controller resolves client context the same way (X-Forwarded-For
//      first hop → req.ip → "unknown"; User-Agent string with a length cap).
//   2. The audit-log writer never sees Express types directly — services stay
//      framework-agnostic.
//   3. Adding more context (device fingerprint, clinic session id) is a
//      one-file change.
//
// Designed to be called from inside a NestJS controller after @Request()
// injection. Safe to call with `null` (returns both fields as null).
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Resolve the originating IP and user-agent for audit logging.
 *
 * IP priority:
 *   1. `x-forwarded-for` header — first hop (trimmed). Trust the reverse
 *      proxy / load balancer set in front of the API.
 *   2. `x-real-ip` header — nginx convention.
 *   3. `req.ip` — Express resolves from socket address otherwise.
 *   4. `null` when no request object is supplied.
 *
 * User-Agent:
 *   - Truncated to 512 chars so an oversized header never bloats the audit
 *     row (the column is unbounded `String?` but every byte costs in JSONB).
 */
export function extractClientContext(req: any | null | undefined): ClientContext {
  if (!req) return { ipAddress: null, userAgent: null };

  const xff = req.headers?.['x-forwarded-for'];
  const forwarded =
    typeof xff === 'string'
      ? xff.split(',')[0]?.trim()
      : Array.isArray(xff) && xff.length
        ? String(xff[0]).trim()
        : null;

  const realIpHeader = req.headers?.['x-real-ip'];
  const realIp =
    typeof realIpHeader === 'string'
      ? realIpHeader.trim()
      : Array.isArray(realIpHeader) && realIpHeader.length
        ? String(realIpHeader[0]).trim()
        : null;

  const ipAddress =
    (forwarded && forwarded.length > 0 ? forwarded : null) ??
    (realIp && realIp.length > 0 ? realIp : null) ??
    (typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : null);

  const uaHeader = req.headers?.['user-agent'];
  let userAgent: string | null = null;
  if (typeof uaHeader === 'string' && uaHeader.length > 0) {
    userAgent = uaHeader.length > 512 ? uaHeader.slice(0, 512) : uaHeader;
  } else if (Array.isArray(uaHeader) && uaHeader.length) {
    userAgent = String(uaHeader[0]).slice(0, 512);
  }

  return { ipAddress, userAgent };
}