import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ── Admin user ─────────────────────────────────────────────
  const adminEmail = 'admin@clinic.com';
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const hashed = await bcrypt.hash('admin123', 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashed,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    console.log('  ✓ Admin user created (admin@clinic.com / admin123)');
  } else {
    console.log('  ✓ Admin user already exists');
  }

  // ── Clinic settings (exchange rates) ────────────────────────
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
        description: `Exchange rate ${from} to ${to}`,
      },
    });
  }
  console.log(`  ✓ ${exchangeRates.length} exchange rates seeded`);

  // ── Billing services ────────────────────────────────────────
  const billingServices = [
    { serviceCode: 'SVC-CONSULT-01', name: 'General Consultation', type: 'SERVICE' as const, category: 'CONSULTATION' as const, price: 50000, isFavorite: true, sortOrder: 1 },
    { serviceCode: 'SVC-CONSULT-02', name: 'Emergency Consultation', type: 'SERVICE' as const, category: 'CONSULTATION' as const, price: 75000, sortOrder: 2 },
    { serviceCode: 'SVC-CONSULT-03', name: 'Specialist Consultation', type: 'SERVICE' as const, category: 'CONSULTATION' as const, price: 100000, sortOrder: 3 },
    { serviceCode: 'SVC-PROC-01', name: 'Tooth Extraction', type: 'PROCEDURE' as const, category: 'PROCEDURE' as const, price: 80000, sortOrder: 4 },
    { serviceCode: 'SVC-PROC-02', name: 'Root Canal Treatment', type: 'PROCEDURE' as const, category: 'PROCEDURE' as const, price: 350000, sortOrder: 5 },
    { serviceCode: 'SVC-PROC-03', name: 'Dental Filling', type: 'PROCEDURE' as const, category: 'PROCEDURE' as const, price: 120000, sortOrder: 6 },
    { serviceCode: 'SVC-PROC-04', name: 'Teeth Cleaning', type: 'PROCEDURE' as const, category: 'PROCEDURE' as const, price: 60000, sortOrder: 7 },
    { serviceCode: 'SVC-PROC-05', name: 'Dental Crown', type: 'PROCEDURE' as const, category: 'PROCEDURE' as const, price: 500000, sortOrder: 8 },
    { serviceCode: 'SVC-DIAG-01', name: 'X-Ray (Single)', type: 'SERVICE' as const, category: 'DIAGNOSTIC' as const, price: 30000, sortOrder: 9 },
    { serviceCode: 'SVC-DIAG-02', name: 'Panoramic X-Ray', type: 'SERVICE' as const, category: 'DIAGNOSTIC' as const, price: 80000, sortOrder: 10 },
  ];

  for (const svc of billingServices) {
    const key = svc.serviceCode;
    await prisma.billingService.upsert({
      where: { serviceCode: key },
      update: { price: svc.price, isActive: true },
      create: {
        ...svc,
        description: null,
        currency: 'UGX',
        defaultTaxAmount: 0,
        isActive: true,
        isFavorite: svc.isFavorite ?? false,
        priceRangeMin: null,
        priceRangeMax: null,
        notes: null,
      },
    });
  }
  console.log(`  ✓ ${billingServices.length} billing services seeded`);

  // ── Default location ───────────────────────────────────────
  const defaultLocation = await prisma.location.findFirst({ where: { isDefault: true } });
  if (!defaultLocation) {
    await prisma.location.create({
      data: {
        name: 'Main Clinic',
        type: 'MAIN_CLINIC',
        isDefault: true,
        isActive: true,
      },
    });
    console.log('  ✓ Default location created');
  }

  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());