// prisma/seeds/seed-drugs-from-medicines.ts
import { PrismaClient, UnitOfMeasure } from '@prisma/client';

const prisma = new PrismaClient();

const DRUG_CATEGORY_ID = 'cmp6p5b5j0000fmi0x9rk09n7'; // General

type DrugSeed = {
  inventoryItemId: string;
  name: string;
  genericName?: string;
  form?: string;
  strength?: string;
  manufacturer?: string;
  unit: string;
  uom: UnitOfMeasure;
  unitPrice: number;
  sellPrice: number;
  requiresPrescription: boolean;
};

const drugSeeds: DrugSeed[] = [
  {
    inventoryItemId: 'cmpd175zu000132wlan5mgtsc', // ← updated ID
    name: 'RIVAMOX 500mg Capsules',
    genericName: 'Rivamox (Antibiotic)',
    form: 'Capsule',
    strength: '500mg',
    manufacturer: 'Unknown',
    unit: 'capsule',
    uom: UnitOfMeasure.CAPSULE,
    unitPrice: 6500,
    sellPrice: 6500,
    requiresPrescription: true,
  },
  {
    inventoryItemId: 'cmpd1760n000332wlkrui2tin', // ← updated ID
    name: 'Metro 400mg Tablets',
    genericName: 'Metronidazole',
    form: 'Tablet',
    strength: '400mg',
    manufacturer: 'Axcel',
    unit: 'tablet',
    uom: UnitOfMeasure.TABLET,
    unitPrice: 20000,
    sellPrice: 20000,
    requiresPrescription: true,
  },
  {
    inventoryItemId: 'cmpd1760r000532wlho9czb8d', // ← updated ID
    name: 'Doxy 100mg Tablets',
    genericName: 'Doxycycline',
    form: 'Tablet',
    strength: '100mg',
    manufacturer: 'Unknown',
    unit: 'tablet',
    uom: UnitOfMeasure.TABLET,
    unitPrice: 5000,
    sellPrice: 5000,
    requiresPrescription: true,
  },
  {
    inventoryItemId: 'cmpd1760u000732wlde4nq1nl', // ← updated ID
    name: 'Ibuprofen 400mg Tablets',
    genericName: 'Ibuprofen',
    form: 'Tablet',
    strength: '400mg',
    manufacturer: 'Denk',
    unit: 'tablet',
    uom: UnitOfMeasure.TABLET,
    unitPrice: 37000,
    sellPrice: 37000,
    requiresPrescription: false,
  },
  {
    inventoryItemId: 'cmpd1760y000932wlzbybs1t1', // ← updated ID
    name: 'Sonatec M Wash',
    genericName: 'Antiseptic Mouthwash',
    form: 'Solution',
    strength: '250ml',
    manufacturer: 'Sonatec',
    unit: 'bottle',
    uom: UnitOfMeasure.PIECES,
    unitPrice: 0,
    sellPrice: 0,
    requiresPrescription: false,
  },
  {
    inventoryItemId: 'cmpd17611000b32wluq08u00a', // ← updated ID
    name: 'Colage',
    genericName: 'Dental adhesive / collagen?',
    form: 'Gel',
    unit: 'piece',
    uom: UnitOfMeasure.PIECES,
    unitPrice: 0,
    sellPrice: 0,
    requiresPrescription: false,
  },
  {
    inventoryItemId: 'cmpd17616000d32wlq17fel0s', // ← updated ID
    name: 'Toothbrush',
    genericName: 'Manual toothbrush',
    form: 'Tool',
    unit: 'piece',
    uom: UnitOfMeasure.PIECES,
    unitPrice: 0,
    sellPrice: 0,
    requiresPrescription: false,
  },
];

async function seedDrugs() {
  console.log('💊 Seeding Drugs linked to medicine inventory items...');

  try {
    for (const drug of drugSeeds) {
      const result = await prisma.drug.upsert({
        where: { inventoryItemId: drug.inventoryItemId },
        update: {
          name: drug.name,
          genericName: drug.genericName,
          categoryId: DRUG_CATEGORY_ID,
          form: drug.form,
          strength: drug.strength,
          manufacturer: drug.manufacturer,
          unit: drug.unit,
          uom: drug.uom,
          unitPrice: drug.unitPrice,
          sellPrice: drug.sellPrice,
          requiresPrescription: drug.requiresPrescription,
          isActive: true,
        },
        create: {
          inventoryItemId: drug.inventoryItemId,
          name: drug.name,
          genericName: drug.genericName,
          categoryId: DRUG_CATEGORY_ID,
          form: drug.form,
          strength: drug.strength,
          manufacturer: drug.manufacturer,
          unit: drug.unit,
          uom: drug.uom,
          unitPrice: drug.unitPrice,
          sellPrice: drug.sellPrice,
          requiresPrescription: drug.requiresPrescription,
          isActive: true,
        },
      });

      console.log(
        `  ✓ ${result.name} (${result.id}) – linked to inventory ${drug.inventoryItemId}`,
      );
    }

    const total = await prisma.drug.count({
      where: { categoryId: DRUG_CATEGORY_ID },
    });
    console.log(
      `\n✅ Drug seed complete. Total drugs in "General" category: ${total}`,
    );
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Standalone execution
if (require.main === module) {
  seedDrugs();
}

export { seedDrugs };
