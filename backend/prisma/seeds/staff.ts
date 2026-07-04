/**
 * Seeds Staff records with dependent User accounts
 */
import { Prisma, UserRole } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { 
  prisma, 
  ugandanPhones, 
  ugandanEmail, 
  logSuccess, 
  logError 
} from './utils';

// Helper function to fix the "randomDate is not defined" error
const randomDate = (start: Date, end: Date) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const STAFF_COUNT = 15;

const roles: UserRole[] = [
  'DENTIST', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 
  'LAB_TECHNICIAN', 'ADMIN', 'SUPER_ADMIN'
];

const specializations = [
  'General Dentistry', 'Orthodontics', 'Oral Surgery', 'Pediatric Dentistry',
  'Endodontics', 'Periodontics', 'Prosthodontics', 'Dental Hygiene',
  'Radiology', 'Pharmacy', 'Laboratory Sciences', 'Practice Management'
];

async function seedStaff() {
  try {
    console.log('🧹 Cleaning existing Staff data...');
    // Delete in order: Schedules (child) -> Staff (child/parent) -> Users (parent)
    // This prevents Foreign Key constraint errors during cleanup
    await prisma.staffSchedule.deleteMany({});
    await prisma.staff.deleteMany({});
    
    console.log('🔄 Seeding Staff...');

    for (let i = 0; i < STAFF_COUNT; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const role = faker.helpers.arrayElement(roles);
      const email = ugandanEmail(firstName, lastName);
      
      // 1. Create or Update User
      const user = await prisma.user.upsert({
        where: { email },
        update: { role },
        create: {
          email,
          password: '$2b$10$defaultHashedPassword123', 
          role,
          isActive: true,
          lastLoginAt: faker.date.past(),
        },
      });

      // 2. Create or Update Staff
      // We capture the returned 'staff' object to get the correct ID for the schedule
      const staff = await prisma.staff.upsert({
        where: { userId: user.id },
        update: {
          staffCode: `STF-${String(i + 1).padStart(4, '0')}`, // Ensures fresh codes
        },
        create: {
          userId: user.id,
          staffCode: `STF-${String(i + 1).padStart(4, '0')}`,
          firstName,
          lastName,
          phone: ugandanPhones(),
          avatar: faker.image.avatar(),
          specialization: faker.helpers.arrayElement(specializations),
          licenseNumber: `UG-DENT-${faker.string.alphanumeric(8).toUpperCase()}`,
          qualification: faker.helpers.arrayElement(['BDS', 'MDS', 'Diploma', 'Certificate', 'BSc Nursing']),
          bio: faker.person.bio(),
          isAvailable: true,
          joiningDate: randomDate(new Date(2020, 0, 1), new Date()),
        },
      });

      // 3. Create basic schedule (Mon-Fri)
      if (role !== 'SUPER_ADMIN' && faker.datatype.boolean(0.8)) {
        const workingDays = [1, 2, 3, 4, 5]; 
        for (const day of workingDays) {
          if (faker.datatype.boolean(0.9)) {
            await prisma.staffSchedule.create({
              data: {
                staffId: staff.id, // ✅ FIXED: Using staff.id instead of user.id
                dayOfWeek: day,
                startTime: '08:00',
                endTime: '17:00',
                isWorking: true,
              },
            });
          }
        }
      }
    }

    const count = await prisma.staff.count();
    logSuccess('Staff', count);
    
  } catch (error: any) {
    logError('Staff', error);
    throw error;
  }
}

// Execution logic
if (require.main === module) {
  seedStaff()
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedStaff };