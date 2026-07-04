// prisma/seed/walk-in-patient.seed.ts
/**
 * Seeds a generic Walk-In patient for empty patient ID references
 * Creates a reusable walk-in patient record for ad-hoc pharmacy sales, quick visits, etc.
 */

import { Gender } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { prisma, ugandanPhones, ugandanEmail, ugandanAddresses, logSuccess, logError } from './utils';

const WALK_IN_PATIENT_CODE = 'WALK-IN';
const WALK_IN_PATIENT = 'Walk-In Patient';

async function seedWalkInPatient() {
  try {
    console.log('🔄 Seeding Walk-In Patient...');

    // Check if walk-in patient already exists
    const existing = await prisma.patient.findFirst({
      where: {
        OR: [
          { patientCode: WALK_IN_PATIENT_CODE },
          { firstName: WALK_IN_PATIENT }
        ]
      }
    });

    if (existing) {
      console.log(`   ℹ️  Walk-In patient already exists (ID: ${existing.id})`);
      logSuccess('Walk-In Patient', 1);
      return existing.id;
    }

    // Create generic walk-in patient
    const walkInPatient = await prisma.patient.create({
      data: {
        patientCode: WALK_IN_PATIENT_CODE,
        firstName: WALK_IN_PATIENT,
        lastName: 'N/A',
        dateOfBirth: null,
        gender: null,
        phone: ugandanPhones(),
        alternatePhone: null,
        email: ugandanEmail('walkin', 'patient'),
        address: ugandanAddresses(),
        city: 'Kampala',
        country: 'Uganda',
        occupation: null,
        previousCardNumber: null,
        avatar: null,
        isActive: true,
        registeredAt: new Date(),
        bloodGroup: null,
        allergies: [],
        medicalConditions: [],
        currentMedications: [],
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyContactRelation: null,
        familyGroupId: null,
        familyRole: null,
      },
    });

    console.log(`   ✅ Created Walk-In patient (ID: ${walkInPatient.id})`);
    logSuccess('Walk-In Patient', 1);
    
    return walkInPatient.id;
    
  } catch (error: any) {
    logError('Walk-In Patient', error);
    throw error;
  }
}

if (require.main === module) {
  seedWalkInPatient()
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedWalkInPatient, WALK_IN_PATIENT_CODE, WALK_IN_PATIENT };