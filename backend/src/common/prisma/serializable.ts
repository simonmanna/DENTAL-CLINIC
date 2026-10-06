// src/common/prisma/serializable.ts
// ─────────────────────────────────────────────────────────────────────────────
// Serializable transactions can be aborted by PostgreSQL when they race
// (Prisma P2034, "write conflict or deadlock"). That is not an error in the
// request — the right response is to run the transaction again. Wrap the
// whole `$transaction(...)` call so each attempt starts from scratch.
// ─────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client';

export function isSerializationFailure(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034'
  );
}

export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isSerializationFailure(e) || attempt >= attempts) throw e;
      // Small jittered back-off so two retrying requests do not collide again.
      await new Promise((r) =>
        setTimeout(r, 40 * attempt + Math.random() * 60),
      );
    }
  }
}
