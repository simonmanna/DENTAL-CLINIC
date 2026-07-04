// prisma/seed/procedure-categories.seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const procedureCategories = [
  {
    id: 'cat_001',
    name: 'Conservative and Endodontics',
    code: 'CONS-ENDO',
    description: 'Restorative and root canal treatments',
    color: '#8B5CF6',
    icon: 'Activity',
    parentCode: null,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'cat_002',
    name: 'Pedodontics',
    code: 'PEDO',
    description: 'Dental care for children',
    color: '#A855F7',
    icon: 'Baby',
    parentCode: null,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'cat_003',
    name: 'Surgery',
    code: 'SURG',
    description: 'Oral surgical procedures',
    color: '#EF4444',
    icon: 'Scalpel',
    parentCode: null,
    isActive: true,
    sortOrder: 3,
  },
  {
    id: 'cat_004',
    name: 'Prosthodontics',
    code: 'PROS',
    description: 'Crowns, bridges, dentures, implants',
    color: '#F59E0B',
    icon: 'Gem',
    parentCode: null,
    isActive: true,
    sortOrder: 4,
  },
  {
    id: 'cat_005',
    name: 'Fixed Prosthesis',
    code: 'FIXED-PROS',
    description: 'Fixed crowns, bridges, inlays/onlays',
    color: '#F59E0B',
    icon: 'Link2',
    parentCode: null,
    isActive: true,
    sortOrder: 5,
  },
  {
    id: 'cat_006',
    name: 'Periodontics',
    code: 'PERIO',
    description: 'Gum and supporting tissue treatments',
    color: '#14B8A6',
    icon: 'Flower2',
    parentCode: null,
    isActive: true,
    sortOrder: 6,
  },
  {
    id: 'cat_007',
    name: 'Orthodontics',
    code: 'ORTHO',
    description: 'Teeth alignment and bite correction',
    color: '#EC4899',
    icon: 'AlignCenter',
    parentCode: null,
    isActive: true,
    sortOrder: 7,
  },
  {
    id: 'cat_008',
    name: 'Implantology',
    code: 'IMPLANT',
    description: 'Dental implant placement and restoration',
    color: '#275073',
    icon: 'AlignCenter',
    parentCode: null,
    isActive: true,
    sortOrder: 8,
  },
];

export async function seedProcedureCategories() {
  console.log('🌱 Seeding Procedure Categories...');

  for (const cat of procedureCategories) {
    const { parentCode, ...data } = cat; // parentCode is always null, destructured out
    await prisma.procedureCategory.upsert({
      where: { id: cat.id },
      update: {},
      create: data,
    });
    console.log(`  ✓ Upserted category: ${cat.name}`);
  }

  console.log(`✅ Seeded ${procedureCategories.length} procedure categories\n`);
}

// Standalone execution
if (require.main === module) {
  seedProcedureCategories()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
