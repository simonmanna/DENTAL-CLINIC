// src/billing/utils/unique-code.ts
//
// Helper for sequential codes that may collide under concurrent inserts.
//
// We generate sequential numbers via `count() + 1` which is racy: two
// concurrent calls can compute the same code and one will fail on the
// unique constraint. This helper retries up to N times, recomputing the
// code on each attempt, before giving up.
//
// Usage:
//   const receipt = await withUniqueCodeRetry(
//     () => this.generateReceiptNumber(tx),
//     (receiptNumber) => tx.receipt.create({ data: { receiptNumber, ... } }),
//   );

import { Prisma } from '@prisma/client';

/** Prisma's error code for "unique constraint failed". */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Retry an insert when the generated code collides with an existing row.
 *
 * @param generate  Async function that returns a candidate code.
 * @param insert    Async function that performs the insert with the given code.
 * @param maxAttempts How many times to try before giving up. Default 5.
 */
export async function withUniqueCodeRetry<T>(
  generate: () => Promise<string>,
  insert: (code: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = await generate();
    try {
      return await insert(code);
    } catch (err) {
      lastError = err;
      if (!isUniqueViolation(err) || attempt === maxAttempts) {
        throw err;
      }
      // Otherwise loop: regenerate and try again.
    }
  }
  // Unreachable, but TypeScript needs it.
  throw lastError;
}

function isUniqueViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === UNIQUE_VIOLATION;
  }
  // Some Prisma versions throw plain Error objects with `code` attached.
  const code = (err as { code?: unknown })?.code;
  return code === UNIQUE_VIOLATION;
}
