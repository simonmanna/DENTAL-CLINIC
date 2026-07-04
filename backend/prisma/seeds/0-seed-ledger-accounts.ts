// Seed the double-entry Chart of Accounts (general ledger).
//
// Run: npx ts-node prisma/seeds/0-seed-ledger-accounts.ts
//
// Idempotent — upserts by stable `systemKey`, so re-running never duplicates and
// never clobbers a code/name an accountant has since edited. The
// GeneralLedgerService also ensures these at app startup, so running this seed
// is optional but handy for a fresh DB.

import { PrismaClient } from '@prisma/client';
import { CANONICAL_ACCOUNTS } from '../../src/general-ledger/gl-accounts';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding chart of accounts...');
  for (const a of CANONICAL_ACCOUNTS) {
    const row = await prisma.ledgerAccount.upsert({
      where: { systemKey: a.key },
      update: {}, // keep any edits an accountant made
      create: {
        systemKey: a.key,
        code: a.code,
        name: a.name,
        type: a.type,
        normalBalance: a.normalBalance,
        description: a.description ?? null,
        isSystem: true,
        isActive: true,
      },
    });
    console.log(`✅ ${row.code} ${row.name}`);
  }
  console.log('🏁 Chart of accounts ready.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
