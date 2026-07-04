// prisma/seed/items.seed.ts
/**
 * Seeds InventoryItem records
 * References existing categories from categories.seed.ts
 */

import { InventoryType, UnitOfMeasure } from '@prisma/client';
import { prisma, logSuccess, logError } from './utils';

// Category IDs from categories.seed.ts
const CATEGORIES = {
  MEDICINES: 'cmogdvh1i0000prg5w0noo7uh',        // Medicines & Pharmaceuticals
  CONSUMABLES: 'cmogdvh1i0001prg5y9qukmwz',      // Dental Consumables
  INSTRUMENTS: 'cmogdvh1i0002prg5cv4gyjhy',      // Dental Instruments
  PPE: 'cmogdvh1i0003prg5v5nlotfg',              // PPE & Safety Equipment
  LAB: 'cmogdvh1i0004prg5fqgbl2fi',              // Laboratory Supplies
  IMAGING: 'cmogdvh1i0005prg5gqxkswg7',          // Imaging & Radiography
  STERILIZATION: 'cmogdvh1i0006prg5dy5qr457',     // Sterilization & Infection Control
  ADMIN: 'cmogdvh1i0007prg5y521eklq',            // Office & Administrative
  EQUIPMENT: 'cmogdvh1i0008prg5037eynvm',         // Equipment & Hardware
  CLEANING: 'cmogdvh1j0009prg5sqm6o0bq',         // Cleaning & Disinfection
  ANESTHETICS: 'cmogdvh1u000aprg51zirsy9h',       // Anesthetics (subcategory)
  ANTIBIOTICS: 'cmogdvh1u000bprg5ogqrf5yz',       // Antibiotics (subcategory)
  ANALGESICS: 'cmogdvh1u000cprg5omhmtw76',        // Analgesics (subcategory)
};

const INVENTORY_ITEMS = [
  {
    itemCode: 'LIDO-2-50ML',
    name: 'Lidocaine 2% with Epinephrine 1:100,000',
    description: 'Local anesthetic cartridge for dental procedures, 50ml vial. Contains 2% lidocaine hydrochloride with epinephrine 1:100,000 for vasoconstriction.',
    unit: 'Vial',
    uom: UnitOfMeasure.PIECES,
    minQuantity: 5,
    unitCost: 45.00,
    type: InventoryType.MEDICINE,
    batchTracking: true,
    categoryId: CATEGORIES.ANESTHETICS,
  },
  {
    itemCode: 'AMOX-500-100CAP',
    name: 'Amoxicillin 500mg Capsules',
    description: 'Broad-spectrum antibiotic for dental infections. 100 capsules per bottle. Used for prophylaxis and treatment of odontogenic infections.',
    unit: 'Bottle',
    uom: UnitOfMeasure.PIECES,
    minQuantity: 3,
    unitCost: 28.50,
    type: InventoryType.MEDICINE,
    batchTracking: true,
    categoryId: CATEGORIES.ANTIBIOTICS,
  },
  {
    itemCode: 'IBUP-400-50TAB',
    name: 'Ibuprofen 400mg Tablets',
    description: 'Non-steroidal anti-inflammatory drug for post-operative pain management. 50 tablets per pack.',
    unit: 'Pack',
    uom: UnitOfMeasure.PIECES,
    minQuantity: 5,
    unitCost: 12.00,
    type: InventoryType.MEDICINE,
    batchTracking: true,
    categoryId: CATEGORIES.ANALGESICS,
  },
  {
    itemCode: 'NITRILE-M-200',
    name: 'Nitrile Examination Gloves (Medium)',
    description: 'Powder-free nitrile examination gloves, medium size. Box of 200 gloves. Latex-free, puncture resistant.',
    unit: 'Box',
    uom: UnitOfMeasure.PIECES,
    minQuantity: 10,
    unitCost: 18.00,
    type: InventoryType.CONSUMABLE,
    batchTracking: false,
    categoryId: CATEGORIES.PPE,
  },
  {
    itemCode: 'MIRROR-5R-DS',
    name: 'Dental Mouth Mirror #5 Round (Double-Sided)',
    description: 'Stainless steel dental mouth mirror with #5 round head, double-sided reflective surface. Autoclavable reusable instrument.',
    unit: 'Piece',
    uom: UnitOfMeasure.PIECES,
    minQuantity: 2,
    unitCost: 35.00,
    type: InventoryType.EQUIPMENT,
    batchTracking: false,
    categoryId: CATEGORIES.INSTRUMENTS,
  },
];

async function seedInventoryItems() {
  try {
    console.log('🔄 Seeding Inventory Items...');

    for (const item of INVENTORY_ITEMS) {
      const existing = await prisma.inventoryItem.findUnique({
        where: { itemCode: item.itemCode }
      });

      if (existing) {
        console.log(`   ⏭️  Item "${item.itemCode}" already exists, skipping...`);
        continue;
      }

      await prisma.inventoryItem.create({
        data: {
          ...item,
          isActive: true,
        },
      });

      console.log(`   ✅ Created item: ${item.name}`);
    }

    const count = await prisma.inventoryItem.count();
    logSuccess('InventoryItem', count);

  } catch (error: any) {
    logError('InventoryItem', error);
    throw error;
  }
}

if (require.main === module) {
  seedInventoryItems()
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedInventoryItems };