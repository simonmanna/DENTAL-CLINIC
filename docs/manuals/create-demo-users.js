/**
 * Creates (or resets) the four demo logins used for manual screenshots and training.
 *
 * Run from the backend folder so Prisma and bcryptjs resolve:
 *   cd backend && node ../docs/manuals/create-demo-users.js
 *
 * Requires DATABASE_URL in the environment (backend/.env is not loaded automatically).
 * Idempotent: re-running just resets the passwords.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const PASSWORD = process.env.MANUAL_DEMO_PASSWORD || 'Demo@1234';

const USERS = [
  { email: 'demo.reception@fshikta.local', role: 'RECEPTIONIST', firstName: 'Demo', lastName: 'Receptionist' },
  { email: 'demo.dentist@fshikta.local', role: 'DENTIST', firstName: 'Demo', lastName: 'Dentist',
    specialization: 'General Dentistry', licenseNumber: 'DEMO-LIC-001', qualification: 'BDS' },
  { email: 'demo.nurse@fshikta.local', role: 'NURSE', firstName: 'Demo', lastName: 'Nurse' },
  { email: 'demo.manager@fshikta.local', role: 'ADMIN', firstName: 'Demo', lastName: 'Manager' },
];

(async () => {
  const password = await bcrypt.hash(PASSWORD, 12);
  for (const { email, role, firstName, lastName, ...staff } of USERS) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { password, role, isActive: true },
      create: { email, password, role, isActive: true },
    });
    await prisma.staff.upsert({
      where: { userId: user.id },
      update: { firstName, lastName, ...staff, isAvailable: true },
      create: { userId: user.id, firstName, lastName, ...staff },
    });
    console.log(`${email.padEnd(32)} ${role}`);
  }
  console.log(`\npassword: ${PASSWORD}`);
})()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
