import { PrismaClient, AccountType, AccountCurrency } from '@prisma/client';

const prisma = new PrismaClient();
// test-enum.ts
// import { ChartPresenceEffect } from '@prisma/client';
// console.log('✅ ChartPresenceEffect loaded:', ChartPresenceEffect);

const DEFAULT_ACCOUNTS = [
  { name: 'Main Cash (UGX)',        type: AccountType.CASH,         currency: AccountCurrency.UGX, isDefault: true,  accountCode: 'CASH-001' },
  { name: 'MTN Mobile Money (UGX)', type: AccountType.MOBILE_MONEY, currency: AccountCurrency.UGX, isDefault: false, accountCode: 'MM-MTN-01' },
  { name: 'Airtel Money (UGX)',     type: AccountType.MOBILE_MONEY, currency: AccountCurrency.UGX, isDefault: false, accountCode: 'MM-ARTL-01' },
  { name: 'Stanbic Bank (UGX)',     type: AccountType.BANK,         currency: AccountCurrency.UGX, isDefault: true,  accountCode: 'BNK-STN-UGX' },
  { name: 'Stanbic Bank (USD)',     type: AccountType.BANK,         currency: AccountCurrency.USD, isDefault: false, accountCode: 'BNK-STN-USD' },
];

async function main() {
  console.log('🌱 Starting account seeding...');

  for (const account of DEFAULT_ACCOUNTS) {
    // We use upsert so that running the seed multiple times doesn't cause errors
    const entry = await prisma.account.upsert({
      where: { accountCode: account.accountCode },
      update: {}, // Don't change existing records
      create: {
        ...account,
        currentBalance: 0,
        isActive: true,
      },
    });
    console.log(`✅ ${entry.name} verified/created.`);
  }

  console.log('🏁 Seeding finished.');
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