// prisma/seed/staff.seed.ts
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Helper to generate a unique email: firstname + random 3 digits + @fshiktadental.com
function generateEmail(firstName: string): string {
  const randomDigits = Math.floor(100 + Math.random() * 900);
  return `${firstName.toLowerCase()}${randomDigits}@fshiktadental.com`;
}

// Helper to generate password: FirstName + "123!"
function generatePassword(firstName: string): string {
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() + '123!';
}

// Define all staff members with required details
const staffList = [
  {
    firstName: 'Biniam',
    lastName: '',                // No last name given
    role: UserRole.ADMIN,
    specialization: 'Practice Management',
    // Email and password will be generated
  },
  {
    firstName: 'Habtom',
    lastName: 'Bahta',
    role: UserRole.DENTIST,
    specialization: 'General Dentistry',
  },
  {
    firstName: 'Saron',
    lastName: 'Bereket',
    role: UserRole.DENTIST,
    specialization: 'General Dentistry',
  },
  {
    firstName: 'Roys',
    lastName: '',                // No last name given
    role: UserRole.DENTIST,
    specialization: 'General Dentistry',
  },
  {
    firstName: 'Michael',
    lastName: '',                // No last name given
    role: UserRole.LAB_TECHNICIAN,
    specialization: 'Dental Laboratory Technology',
  },
  {
    firstName: 'Mikal',
    lastName: 'Solomon',
    role: UserRole.RECEPTIONIST,
    specialization: 'Front Desk',
  },
  {
    firstName: 'Diana',
    lastName: '',                // No last name given
    role: UserRole.RECEPTIONIST,
    specialization: 'Front Desk',
  },
  {
    // Super admin – fixed credentials
    firstName: 'Super',
    lastName: 'Admin',
    role: UserRole.SUPER_ADMIN,
    specialization: 'System Administration',
    email: 'admin@dental.com',            // Exact as requested
    password: 'Admin123!',                // Exact as requested
    isPredefined: true,                  // flag to skip generation
  },
];

async function seedStaff() {
  console.log('🌱 Seeding Users & Staff...');

  for (const member of staffList) {
    let email: string;
    let plainPassword: string;

    if ((member as any).isPredefined) {
      // Use exact credentials for the super admin
      email = (member as any).email;
      plainPassword = (member as any).password;
    } else {
      email = generateEmail(member.firstName);
      plainPassword = generatePassword(member.firstName);
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Create User
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        role: member.role,
        isActive: true,
        password: hashedPassword,
      },
      create: {
        email,
        password: hashedPassword,
        role: member.role,
        isActive: true,
      },
    });

    // Create Staff record linked to the user
    await prisma.staff.upsert({
      where: { userId: user.id },
      update: {
        firstName: member.firstName,
        lastName: member.lastName,
        specialization: member.specialization,
        isAvailable: true,
      },
      create: {
        userId: user.id,
        firstName: member.firstName,
        lastName: member.lastName || '',
        specialization: member.specialization,
        isAvailable: true,
      },
    });

    console.log(`  ✓ ${member.firstName} ${member.lastName} (${email}) / pw: ${plainPassword}`);
  }

  const userCount = await prisma.user.count();
  const staffCount = await prisma.staff.count();
  console.log(`\n✅ Seeded complete.`);
  console.log(`   Users: ${userCount} | Staff: ${staffCount}`);
}

// Standalone execution
if (require.main === module) {
  seedStaff()
    .catch((e) => {
      console.error('❌ Seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedStaff };