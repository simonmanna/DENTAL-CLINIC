// prisma/seeds/seed-medicine-items.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const MEDICINE_CATEGORY_ID = 'cmpd0wv0l0000ej2le3qo3fys'

type MedicineItem = {
  itemCode: string
  name: string
  description: string
  unit: string
  unitCost: number
  minQuantity?: number
  batchTracking?: boolean
}

const medicineItems: MedicineItem[] = [
  {
    itemCode: 'MED-RIV-001',
    name: 'RIVAMOX 500mg Capsules',
    description: 'Rivamox 500mg, 20 capsules per box. Antibiotic.',
    unit: 'Box',
    unitCost: 6500,
    minQuantity: 5,
  },
  {
    itemCode: 'MED-MET-001',
    name: 'Metro 400mg Tablets',
    description: 'Metronidazole 400mg, 10x10 (100 tablets) by Axcel.',
    unit: 'Box',
    unitCost: 20000,
    minQuantity: 5,
  },
  {
    itemCode: 'MED-DOX-001',
    name: 'Doxy 100mg Tablets',
    description: 'Doxycycline 100mg, 10x10 (100 tablets).',
    unit: 'Box',
    unitCost: 5000,
    minQuantity: 5,
  },
  {
    itemCode: 'MED-IBU-001',
    name: 'Ibuprofen 400mg Tablets',
    description: 'Ibuprofen 400mg, 10x10 (100 tablets) – Denk.',
    unit: 'Box',
    unitCost: 37000,
    minQuantity: 5,
  },
  {
    itemCode: 'MED-SNW-001',
    name: 'Sonatec M Wash',
    description: 'Sonatec M antiseptic mouthwash, 250ml bottle.',
    unit: 'Bottle',
    unitCost: 0, // price not provided – update later
    minQuantity: 10,
  },
  {
    itemCode: 'MED-COL-001',
    name: 'Colage',
    description: 'Colage (dental product – please verify).',
    unit: 'Each',
    unitCost: 0,
    minQuantity: 10,
  },
  {
    itemCode: 'MED-BRS-001',
    name: 'Toothbrush',
    description: 'Manual toothbrush, soft bristles.',
    unit: 'Each',
    unitCost: 0,
    minQuantity: 20,
  },
]

async function seedMedicineItems() {
  console.log('💊 Adding medicine items...')

  try {
    for (const item of medicineItems) {
      const result = await prisma.inventoryItem.upsert({
        where: { itemCode: item.itemCode },
        update: {
          name: item.name,
          description: item.description,
          unit: item.unit,
          unitCost: item.unitCost,
          minQuantity: item.minQuantity ?? 0,
          batchTracking: item.batchTracking ?? false,
          isActive: true,
          categoryId: MEDICINE_CATEGORY_ID,
          type: 'CONSUMABLE',
        },
        create: {
          itemCode: item.itemCode,
          name: item.name,
          description: item.description,
          unit: item.unit,
          unitCost: item.unitCost,
          minQuantity: item.minQuantity ?? 0,
          batchTracking: item.batchTracking ?? false,
          isActive: true,
          categoryId: MEDICINE_CATEGORY_ID,
          type: 'CONSUMABLE',
        },
      })
      console.log(`  ✓ ${result.name} (${result.itemCode}) – ${result.unit} @ ${result.unitCost}`)
    }

    const total = await prisma.inventoryItem.count({
      where: { categoryId: MEDICINE_CATEGORY_ID },
    })
    console.log(`\n✅ Medicines seed complete. Total medicine items: ${total}`)
  } catch (error) {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Standalone execution
if (require.main === module) {
  seedMedicineItems()
}

export { seedMedicineItems }