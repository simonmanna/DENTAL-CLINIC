// Seed the default expense categories (Dental Supplies, Rent, Utilities, ...).
//
// Run: npx ts-node prisma/seeds/0-seed-expense-categories.ts
//
// Idempotent — keyed by `slug`; existing rows are never changed, so re-running
// never duplicates and never undoes a rename / re-map the clinic made. Each
// category is pre-linked to its canonical ledger account when that account
// exists (seed 0-seed-ledger-accounts.ts first, or let the app create it).
// ExpenseCategoriesService also ensures these at app startup, so this seed is
// optional but handy for a fresh or restored DB.

import { PrismaClient } from '@prisma/client';
import { DEFAULT_EXPENSE_CATEGORIES } from '../../src/expense-categories/default-categories';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding expense categories...');
  let created = 0;
  for (let i = 0; i < DEFAULT_EXPENSE_CATEGORIES.length; i++) {
    const def = DEFAULT_EXPENSE_CATEGORIES[i];
    const existing = await prisma.expenseCategory.findFirst({
      where: { OR: [{ slug: def.slug }, { name: def.name }] },
      select: { id: true },
    });
    if (existing) {
      console.log(`⏭️  ${def.name} (exists)`);
      continue;
    }

    const ledgerAccountId = def.glKey
      ? (
          await prisma.ledgerAccount.findUnique({
            where: { systemKey: def.glKey },
            select: { id: true },
          })
        )?.id ?? null
      : null;

    await prisma.expenseCategory.create({
      data: {
        slug: def.slug,
        name: def.name,
        icon: def.icon ?? null,
        sortOrder: i,
        isSystem: true,
        isActive: true,
        ledgerAccountId,
      },
    });
    created++;
    console.log(`✅ ${def.name}${ledgerAccountId ? '' : ' (no ledger link)'}`);
  }
  console.log(`🏁 Expense categories ready (${created} created).`);
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
