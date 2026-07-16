// src/prisma/prisma.service.spec.ts
// ─────────────────────────────────────────────────────────────────────────────
// Smoke-tests for the SQL-only constraint(s) that PrismaService applies on
// boot. We cannot exercise the real onModuleInit without a Postgres instance
// (this spec runs in the unit-test sandbox), so we instead verify:
//   1. The SQL file exists at the expected path relative to the project root.
//   2. It is idempotent (CREATE IF NOT EXISTS — no drop/recreate churn).
//   3. It declares the partial predicate exactly as documented in
//      prisma/schema.prisma (Filter "deletedAt" IS NULL on the
//      condition_procedure_links table).
//
// Together these pin the contract that PrismaService.onModuleInit relies on
// at runtime. A broken SQL file fails this spec loudly, before it ever
// reaches production.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('boot SQL constraints', () => {
  const sqlPath = join(
    __dirname, '..', '..', 'prisma', 'sql',
    'condition_procedure_links_active_unique.sql',
  );

  it('the partial-unique SQL file exists', () => {
    expect(existsSync(sqlPath)).toBe(true);
  });

  it('is idempotent via CREATE ... IF NOT EXISTS', () => {
    const sql = readFileSync(sqlPath, 'utf8');
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+condition_procedure_links_active_unique/i,
    );
  });

  it('creates a UNIQUE INDEX on the link table', () => {
    const sql = readFileSync(sqlPath, 'utf8');
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?condition_procedure_links_active_unique\s+ON\s+condition_procedure_links/i,
    );
  });

  it('covers exactly (patientConditionId, treatmentProcedureId)', () => {
    const sql = readFileSync(sqlPath, 'utf8');
    expect(sql).toContain('"patientConditionId"');
    expect(sql).toContain('"treatmentProcedureId"');
  });

  it('uses a partial predicate that only constrains ACTIVE links', () => {
    const sql = readFileSync(sqlPath, 'utf8');
    // Partial unique index — only rows with deletedAt IS NULL are constrained.
    // Soft-deleted rows can be re-created with the same (pcId, tpId) pair.
    expect(sql).toMatch(/WHERE\s+"deletedAt"\s+IS\s+NULL/i);
  });
});