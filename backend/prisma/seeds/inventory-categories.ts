// prisma/seed-inventory-categories.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Color palette for UI badges (dental-themed)
const COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#06B6D4', // cyan-500
  '#EC4899', // pink-500
  '#6366F1', // indigo-500
  '#14B8A6', // teal-500
  '#F97316', // orange-500
];

// Lucide icon names for UI (https://lucide.dev/icons)
const ICONS = [
  'pill', // Medicines
  'syringe', // Consumables
  'scan', // Instruments
  'shield-check', // PPE
  'flask-conical', // Lab Supplies
  'image', // Imaging
  'sparkles', // Sterilization
  'clipboard-list', // Office Supplies
  'wrench', // Equipment
  'droplets', // Cleaning
];

const CATEGORIES = [
  {
    name: 'Medicines & Pharmaceuticals',
    code: 'MED',
    description:
      'Prescription drugs, analgesics, antibiotics, anesthetics, and other pharmaceutical products',
    color: COLORS[0],
    icon: ICONS[0],
    sortOrder: 1,
  },
  {
    name: 'Dental Consumables',
    code: 'CONS',
    description:
      'Disposable items: gloves, masks, bibs, cotton rolls, suction tips, matrices, wedges',
    color: COLORS[1],
    icon: ICONS[1],
    sortOrder: 2,
  },
  {
    name: 'Dental Instruments',
    code: 'INST',
    description:
      'Reusable hand instruments: explorers, scalers, elevators, forceps, mirrors, probes',
    color: COLORS[2],
    icon: ICONS[2],
    sortOrder: 3,
  },
  {
    name: 'PPE & Safety Equipment',
    code: 'PPE',
    description:
      'Personal protective equipment: N95 masks, face shields, gowns, goggles, head covers',
    color: COLORS[3],
    icon: ICONS[3],
    sortOrder: 4,
  },
  {
    name: 'Laboratory Supplies',
    code: 'LAB',
    description:
      'Dental lab materials: impression materials, gypsum, waxes, acrylics, articulators',
    color: COLORS[4],
    icon: ICONS[4],
    sortOrder: 5,
  },
  {
    name: 'Imaging & Radiography',
    code: 'IMG',
    description:
      'X-ray films, sensors, phosphor plates, lead aprons, developer/fixer chemicals',
    color: COLORS[5],
    icon: ICONS[5],
    sortOrder: 6,
  },
  {
    name: 'Sterilization & Infection Control',
    code: 'STER',
    description:
      'Autoclave pouches, disinfectants, sterilization indicators, ultrasonic cleaners',
    color: COLORS[6],
    icon: ICONS[6],
    sortOrder: 7,
  },
  {
    name: 'Office & Administrative',
    code: 'ADMIN',
    description:
      'Patient forms, filing supplies, labels, printer paper, pens, stationery',
    color: COLORS[7],
    icon: ICONS[7],
    sortOrder: 8,
  },
  {
    name: 'Equipment & Hardware',
    code: 'EQUIP',
    description:
      'Dental chairs, handpieces, curing lights, amalgamators, compressors, suction units',
    color: COLORS[8],
    icon: ICONS[8],
    sortOrder: 9,
  },
  {
    name: 'Cleaning & Disinfection',
    code: 'CLEAN',
    description:
      'Surface disinfectants, enzymatic cleaners, hand sanitizers, waste bags, biohazard containers',
    color: COLORS[9],
    icon: ICONS[9],
    sortOrder: 10,
  },
];

async function main() {
  console.log('🌱 Starting inventory category seeding...');

  try {
    // Check if categories already exist to avoid duplicates
    const existingCount = await prisma.inventoryCategory.count();

    if (existingCount > 0) {
      console.log(
        `⚠️  Found ${existingCount} existing categories. Skipping seed to avoid duplicates.`,
      );
      console.log(
        '💡 Tip: Use prisma db seed --force or clear data first if you want to re-seed',
      );
      return;
    }

    // Create categories with transaction for atomicity
    const created = await prisma.$transaction(
      CATEGORIES.map((cat, index) =>
        prisma.inventoryCategory.create({
          data: {
            name: cat.name,
            code: cat.code,
            description: cat.description,
            color: cat.color,
            icon: cat.icon,
            isActive: true,
            sortOrder: cat.sortOrder,
            // parentId is null => these are root-level categories
          },
        }),
      ),
    );

    console.log(
      `✅ Successfully seeded ${created.length} inventory categories:`,
    );
    created.forEach((cat) => {
      console.log(
        `   • [${cat.code}] ${cat.name} ${cat.icon ? `(${cat.icon})` : ''}`,
      );
    });

    // Optional: Create a few hierarchical child categories as examples
    console.log('\n🔗 Adding example sub-categories (hierarchical demo)...');

    const medicinesCat = created.find((c) => c.code === 'MED');
    if (medicinesCat) {
      await prisma.inventoryCategory.createMany({
        data: [
          {
            name: 'Anesthetics',
            code: 'MED-ANES',
            description: 'Local anesthetics: lidocaine, articaine, mepivacaine',
            color: '#60A5FA',
            icon: 'pill-bottle',
            parentId: medicinesCat.id,
            sortOrder: 1,
          },
          {
            name: 'Antibiotics',
            code: 'MED-ANTIB',
            description: 'Amoxicillin, clindamycin, metronidazole, etc.',
            color: '#60A5FA',
            icon: 'capsule',
            parentId: medicinesCat.id,
            sortOrder: 2,
          },
          {
            name: 'Analgesics',
            code: 'MED-PAIN',
            description: 'Pain management: ibuprofen, acetaminophen, NSAIDs',
            color: '#60A5FA',
            icon: 'heart-pulse',
            parentId: medicinesCat.id,
            sortOrder: 3,
          },
        ],
      });
      console.log(
        '   • Added 3 sub-categories under "Medicines & Pharmaceuticals"',
      );
    }

    console.log('\n✨ Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Execute the seed
main().catch((e) => {
  console.error('Unhandled error during seeding:', e);
  process.exit(1);
});
