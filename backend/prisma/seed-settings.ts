// prisma/seed.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed exchange rates
  const exchangeRates = [
    { from: 'USD', to: 'UGX', rate: 3700 },
    { from: 'EUR', to: 'UGX', rate: 4020 },
    { from: 'GBP', to: 'UGX', rate: 4680 },
    { from: 'USD', to: 'EUR', rate: 0.92 },
    { from: 'USD', to: 'GBP', rate: 0.79 },
    { from: 'EUR', to: 'USD', rate: 1.09 },
    { from: 'EUR', to: 'GBP', rate: 0.86 },
    { from: 'GBP', to: 'USD', rate: 1.27 },
    { from: 'GBP', to: 'EUR', rate: 1.16 },
  ];

  for (const { from, to, rate } of exchangeRates) {
    const key = `exchange_rate_${from}_${to}`;
    await prisma.clinicSettings.upsert({
      where: { key },
      update: { value: rate.toString() },
      create: {
        key,
        value: rate.toString(),
        description: `Exchange rate ${from} to ${to} (seed)`,
      },
    });
  }

  console.log('Seed data inserted successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
