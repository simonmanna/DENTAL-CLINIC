// prisma/seed/locations.seed.ts
import { PrismaClient, LocationType } from '@prisma/client';

const prisma = new PrismaClient();

const locations = [
  {
    id: 'loc_001',
    name: 'Reception',
    type: LocationType.RECEPTION,
    description: 'Main reception area',
    isDefault: true,
    sortOrder: 1,
  },
  {
    id: 'loc_002',
    name: 'Clinic Store',
    type: LocationType.STORE,
    description: 'Main storage for clinical consumables and materials',
    isDefault: false,
    sortOrder: 2,
  },
];

export async function seedLocations() {
  console.log('🌱 Seeding Locations...');

  for (const loc of locations) {
    const { description, ...data } = loc; // description not a direct field, but we can keep it as notes? Actually Location model has no "description" field. Let's drop it.
    // The Location model has no description field, so we'll store it as part of notes? Not needed. We'll just omit it.
    await prisma.location.upsert({
      where: { id: loc.id },
      update: {
        name: loc.name,
        type: loc.type,
        isDefault: loc.isDefault,
        sortOrder: loc.sortOrder,
      },
      create: {
        id: loc.id,
        name: loc.name,
        type: loc.type,
        isActive: true,
        isDefault: loc.isDefault,
        sortOrder: loc.sortOrder,
        // parentId, path, level all stay default (null, "", 0)
      },
    });
    console.log(`  ✓ Upserted location: ${loc.name}`);
  }

  console.log(`✅ Seeded ${locations.length} locations\n`);
}

// Standalone execution
if (require.main === module) {
  seedLocations()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}