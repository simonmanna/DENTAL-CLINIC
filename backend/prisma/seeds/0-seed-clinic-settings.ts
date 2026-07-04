// prisma/seeds/seed-clinic-settings.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedClinicSettings() {
  console.log('🏥 Seeding clinic settings...')

  try {
    // Existing pharmacy location setting
    const pharmacySetting = await prisma.clinicSettings.upsert({
      where: { key: 'PHARMACY_LOCATION' },
      update: {
        value: 'loc_001',
        description: 'Default pharmacy location identifier for inventory and prescriptions',
      },
      create: {
        key: 'PHARMACY_LOCATION',
        value: 'loc_001',
        description: 'Default pharmacy location identifier for inventory and prescriptions',
      },
    })
    console.log(`  ✓ ${pharmacySetting.key} = ${pharmacySetting.value}`)

    // New exchange rate setting
    const exchangeRateSetting = await prisma.clinicSettings.upsert({
      where: { key: 'EXCHANGE_RATE' },
      update: {
        value: '3600',
        description: 'Exchange rate used for currency conversions',
      },
      create: {
        key: 'EXCHANGE_RATE',
        value: '3600',
        description: 'Exchange rate used for currency conversions',
      },
    })
    console.log(`  ✓ ${exchangeRateSetting.key} = ${exchangeRateSetting.value}`)

        // New exchange rate setting
    const clinicName = await prisma.clinicSettings.upsert({
      where: { key: 'CLINIC_NAME' },
      update: {
        value: 'Fshikta Dental Clinic',
        description: 'Clinic Name',
      },
      create: {
        key: 'CLINIC_NAME',
        value: 'Fshikta Dental Clinic',
        description: 'Clinic Name',
      },
    })
    console.log(`  ✓ ${exchangeRateSetting.key} = ${exchangeRateSetting.value}`)

    console.log('\n✅ Clinic settings seed complete.')
  } catch (error) {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Standalone execution
if (require.main === module) {
  seedClinicSettings()
}

export { seedClinicSettings }