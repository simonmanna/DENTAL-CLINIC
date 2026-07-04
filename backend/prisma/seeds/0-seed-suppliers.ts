// prisma/seed/suppliers.seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const suppliers = [
  {
    id: 'sup_001',
    name: 'Market',
    contactPerson: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
  },
  {
    id: 'sup_002',
    name: 'GDR Dental Services',
    contactPerson: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
  },
  {
    id: 'sup_003',
    name: 'Bridge Dental Laboratory',
    contactPerson: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
  },
];

export async function seedSuppliers() {
  console.log('🌱 Seeding Suppliers...');

  for (const supplier of suppliers) {
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      update: {
        name: supplier.name,
        // other fields could be updated if needed
      },
      create: {
        id: supplier.id,
        name: supplier.name,
        contactPerson: supplier.contactPerson,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes,
        isActive: true,
      },
    });
    console.log(`  ✓ Upserted supplier: ${supplier.name}`);
  }

  console.log(`✅ Seeded ${suppliers.length} suppliers\n`);
}

// Standalone execution
if (require.main === module) {
  seedSuppliers()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}