// prisma/seeds/patients.seed.ts
/**
 * Seeds Patient records with realistic dental health data
 * Fully independent - no external dependencies required
 */

import { Gender } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { prisma, ugandanPhones, ugandanEmail, ugandanAddresses, randomDate, logSuccess, logError } from './utils';

const PATIENT_COUNT = 10;

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const commonAllergies = ['Penicillin', 'Latex', 'Ibuprofen', 'Local Anesthetic', 'None'];
const medicalConditions = ['Hypertension', 'Diabetes', 'Asthma', 'None', 'Heart Condition'];
const occupations = ['Teacher', 'Driver', 'Student', 'Business Owner', 'Civil Servant', 'Farmer', 'Nurse', 'Unemployed'];
const commonMedications = ['Paracetamol', 'Amoxicillin', 'Ibuprofen', 'Metronidazole', 'Aspirin', 'Clindamycin', 'Diazepam']; // ← safe replacement

async function seedPatients() {
  try {
    console.log('🔄 Seeding Patients...');

    // 1️⃣ PRE-GENERATE family groups that WILL be used
    const potentialFamilyGroups: { id: string; name: string }[] = [];
    const numFamilyGroups = Math.floor(PATIENT_COUNT * 0.15); // ~15% of patients in families
    
    for (let i = 0; i < numFamilyGroups; i++) {
      potentialFamilyGroups.push({
        id: faker.string.uuid(),
        name: `Family ${faker.person.lastName()}`,
      });
    }

    // 2️⃣ Create FamilyGroups in DB first
    for (const fg of potentialFamilyGroups) {
      await prisma.familyGroup.create({
        data: { id: fg.id, name: fg.name },
      });
    }

    const existingFamilyGroupIds = potentialFamilyGroups.map(fg => fg.id);

    // 3️⃣ Now generate patients, referencing ONLY existing familyGroupId values
    const patients: any[] = [];

    for (let i = 0; i < PATIENT_COUNT; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const gender = faker.helpers.arrayElement(Object.values(Gender));
      const dob = randomDate(new Date(1950, 0, 1), new Date(2020, 11, 31));

      // Only assign familyGroupId if we have pre-created groups available
      const useFamily = faker.datatype.boolean(0.15) && existingFamilyGroupIds.length > 0;
      const assignedFamilyGroupId = useFamily 
        ? faker.helpers.arrayElement(existingFamilyGroupIds) 
        : null;

      patients.push({
        patientCode: `PAT-${String(i + 1).padStart(6, '0')}`,
        firstName,
        lastName,
        dateOfBirth: dob,
        gender,
        phone: ugandanPhones(),
        alternatePhone: faker.datatype.boolean(0.4) ? ugandanPhones() : null,
        email: faker.datatype.boolean(0.7) ? ugandanEmail(firstName, lastName) : null,
        address: ugandanAddresses(),
        city: faker.helpers.arrayElement(['Kampala', 'Entebbe', 'Wakiso', 'Mukono', 'Jinja']),
        country: 'Uganda',
        occupation: faker.helpers.arrayElement(occupations),
        previousCardNumber: faker.datatype.boolean(0.2) ? `OLD-${faker.string.numeric(8)}` : null,
        avatar: faker.image.avatar(),
        isActive: true,
        registeredAt: randomDate(new Date(2022, 0, 1), new Date()),

        // Medical fields
        bloodGroup: faker.helpers.arrayElement(bloodGroups),
        allergies: [faker.helpers.arrayElement(commonAllergies)].filter((a) => a !== 'None'),
        medicalConditions: [faker.helpers.arrayElement(medicalConditions)].filter((c) => c !== 'None'),
        currentMedications: faker.datatype.boolean(0.3)
          ? [faker.helpers.arrayElement(commonMedications)]
          : [],

        // Emergency contact
        emergencyContactName: faker.person.fullName(),
        emergencyContactPhone: ugandanPhones(),
        emergencyContactRelation: faker.helpers.arrayElement(['Spouse', 'Parent', 'Sibling', 'Child', 'Friend']),

        // ✅ Family grouping - now references EXISTING FamilyGroup IDs
        familyGroupId: assignedFamilyGroupId,
        familyRole: assignedFamilyGroupId 
          ? faker.helpers.arrayElement(['Primary', 'Spouse', 'Child', 'Parent']) 
          : null,
      });
    }

    // 4️⃣ Bulk insert patients (FK constraint now satisfied ✅)
    await prisma.patient.createMany({
      data: patients,
      skipDuplicates: true,
    });

    const count = await prisma.patient.count();
    logSuccess('Patient', count);
  } catch (error: any) {
    logError('Patient', error);
    throw error;
  }
}
if (require.main === module) {
  seedPatients()
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedPatients };