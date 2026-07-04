// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Database connected');

    // Apply SQL-only constraints that Prisma cannot express in schema.prisma.
    // These are idempotent (DROP IF EXISTS + CREATE) so repeated boots are
    // safe. They are NOT applied by `prisma db push` because Prisma only
    // manages constraints declared in schema.prisma; this hook is the
    // single source of truth.
    await this.applyBootSqlConstraints();
  }

  private async applyBootSqlConstraints(): Promise<void> {
    const sqlFiles = [
      // Partial unique index on active ConditionProcedureLink rows. Prevents a
      // single condition from being linked to the same procedure twice while
      // both links are ACTIVE — the lifecycle evaluation would otherwise see
      // the same procedure twice and become unreliable. See
      // prisma/sql/condition_procedure_links_active_unique.sql.
      'condition_procedure_links_active_unique.sql',
      // Last-line-of-defence CHECK constraints on invoice balance / amountPaid.
      // Service layer guards against overpayment (atomic UPDATE refuses to credit
      // past remaining balance) and voiding invoices with active receipts, but a
      // direct DB write or future bug could still push these negative. See
      // prisma/sql/2026-06-21_invoice_balance_nonneg.sql.
      '2026-06-21_invoice_balance_nonneg.sql',
    ];

    for (const file of sqlFiles) {
      try {
        const path = join(__dirname, '..', '..', 'prisma', 'sql', file);
        const sql = readFileSync(path, 'utf8');
        await this.$executeRawUnsafe(sql);
        this.logger.log(`✅ Applied boot constraint: ${file}`);
      } catch (err) {
        // Log but do not crash: an existing pre-fix dataset may already
        // contain duplicate active links, in which case the CREATE UNIQUE
        // INDEX will fail. The remediation is a one-time DBA script that
        // soft-deletes older duplicates before the next deploy.
        this.logger.warn(
          `⚠️  Could not apply boot constraint ${file}: ${(err as Error).message}`,
        );
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') return;
    const models = Reflect.ownKeys(this).filter(k => k[0] !== '_');
    return Promise.all(models.map(m => (this as any)[m]?.deleteMany?.()));
  }
}

// src/prisma/prisma.module.ts is separate — inline here:
