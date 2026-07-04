// Atomic, per-tenant monotonic sequence generator.
//
// Why: count()+1 is racy and slow under concurrency, and it produces gaps when
// rows are deleted (which can never legally happen for sequenced documents).
// This service uses PostgreSQL's `UPDATE ... RETURNING` inside a transaction,
// which is atomic per row even under SERIALIZABLE isolation.
//
// Usage:
//   const num = await seq.formatted(tx, 'INVOICE', { prefix: 'INV', pad: 5 });
//   // → "INV00042"
//
// Always call inside the same transaction (`tx`) that creates the document,
// so a rollback unwinds the sequence too. (Yes: sequence numbers can be
// "skipped" if a tx rolls back. That's expected — gap-free under success,
// not gap-free under failure. For strict gap-free, use a post-commit
// reservation pattern; not required for this app.)

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaService;

const DEFAULT_TENANT = 'DEFAULT';

export interface FormatOptions {
  /** String prefix; e.g. "INV", "RCP". Falls back to the stored prefix. */
  prefix?: string;
  /** Zero-pad the numeric portion to this width. Default 5. */
  pad?: number;
  /** Optional separator between prefix and number. Default "" (no sep). */
  separator?: string;
  /** Optional tenant scope. Defaults to "DEFAULT" (single-tenant). */
  tenantId?: string;
}

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Increment and return the next raw integer for `key`. Atomic.
   * Use within a `$transaction` to tie the number to the document.
   */
  async next(tx: Tx, key: string, tenantId = DEFAULT_TENANT): Promise<bigint> {
    // Upsert-then-update pattern: ensure the row exists, then atomically bump.
    // Two queries inside one transaction; both row-level locked.
    const client = tx as Prisma.TransactionClient;

    // Lock-or-create. ON CONFLICT DO NOTHING is a no-op if it exists.
    await client.$executeRaw`
      INSERT INTO "number_sequences" ("id", "tenantId", "key", "currentValue", "updatedAt", "createdAt")
      VALUES (gen_random_uuid()::text, ${tenantId}, ${key}, 0, NOW(), NOW())
      ON CONFLICT ("tenantId", "key") DO NOTHING
    `;

    // Atomic increment.
    const rows = await client.$queryRaw<{ currentValue: bigint }[]>`
      UPDATE "number_sequences"
         SET "currentValue" = "currentValue" + 1,
             "updatedAt" = NOW()
       WHERE "tenantId" = ${tenantId} AND "key" = ${key}
      RETURNING "currentValue"
    `;

    if (!rows[0]) {
      throw new Error(
        `SequenceService: failed to increment sequence "${key}" for tenant "${tenantId}"`,
      );
    }
    return rows[0].currentValue;
  }

  /**
   * Formatted document number: `${prefix}${pad(n)}`.
   * Default pad = 5, default tenant = "DEFAULT".
   */
  async formatted(
    tx: Tx,
    key: string,
    opts: FormatOptions = {},
  ): Promise<string> {
    const { prefix, pad = 5, separator = '', tenantId = DEFAULT_TENANT } = opts;
    const n = await this.next(tx, key, tenantId);
    const finalPrefix = prefix ?? key;
    return `${finalPrefix}${separator}${String(n).padStart(pad, '0')}`;
  }

  /** For inspection / admin tooling. */
  async peek(key: string, tenantId = DEFAULT_TENANT): Promise<bigint> {
    const row = await this.prisma.numberSequence.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: { currentValue: true },
    });
    return row?.currentValue ?? 0n;
  }
}
