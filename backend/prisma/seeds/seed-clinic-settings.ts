// prisma/seed/clinic-settings.seed.ts
/**
 * Seeds ClinicSettings records
 * Stores key-value configuration for clinic operations
 */

import { prisma, logSuccess, logError } from './utils';

const CLINIC_SETTINGS = [
  {
    key: 'PHARMACY_LOCATION',
    value: 'cmoge1efa000ttu0e1j0u6w6d',
    description: 'Default pharmacy location ID for inventory dispensing and stock management',
  },
];

async function seedClinicSettings() {
  try {
    console.log('🔄 Seeding Clinic Settings...');

    for (const setting of CLINIC_SETTINGS) {
      const existing = await prisma.clinicSettings.findUnique({
        where: { key: setting.key }
      });

      if (existing) {
        console.log(`   ⏭️  Setting "${setting.key}" already exists, skipping...`);
        continue;
      }

      await prisma.clinicSettings.create({
        data: {
          ...setting,
        },
      });

      console.log(`   ✅ Created setting: ${setting.key}`);
    }

    const count = await prisma.clinicSettings.count();
    logSuccess('ClinicSettings', count);

  } catch (error: any) {
    logError('ClinicSettings', error);
    throw error;
  }
}

if (require.main === module) {
  seedClinicSettings()
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedClinicSettings };