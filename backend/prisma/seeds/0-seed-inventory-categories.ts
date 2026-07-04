// prisma/seeds/seed-inventory-categories.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Category IDs from your existing seeded categories
const CATEGORY_IDS = {
  SETUP: 'cmp6tnine0000ozxniniv41dp',
  ANESTHESIA: 'cmp6tnio50001ozxncki5sao5',
  RESTORATIVE_CORE: 'cmp6tnio80002ozxnrbr43ho6',
  CEMENTS: 'cmp6tnioa0003ozxn9tp661cy',
  ENDO_BASICS: 'cmp6tniof0004ozxn9pibkn7g',
  IMPRESSIONS: 'cmp6tnioi0005ozxn7ulgulpk',
  PREVENTIVE: 'cmp6tnioo0006ozxnkk55nro0',
  SURGICAL_EXTRACTIONS: 'cmp6tnioq0007ozxngb9oxcia',
  RESTORATIVE_MATERIALS: 'cmp6tniou0008ozxn8muodp3m',
  CEMENTS_LINERS: 'cmp6tnioy0009ozxnj2pxduss',
  IMPRESSION_MATERIALS: 'cmp6tnip2000aozxn2sg2a0b4',
  PREVENTIVE_MATERIALS: 'cmp6tnip5000bozxnjklw1tce',
  ENDO_MATERIALS: 'cmp6tnip7000cozxng3vvg9da',
  SURGICAL_MISC: 'cmp6tnip9000dozxno5unfs6k',
  MEDICINE: 'cmpd0wv0l0000ej2le3qo3fys',
} as const;

const COLORS = {
  blue: '#3B82F6',
  cyan: '#06B6D4',
  teal: '#14B8A6',
  green: '#22C55E',
  emerald: '#10B981',
  amber: '#F59E0B',
  orange: '#F97316',
  red: '#EF4444',
  purple: '#A855F7',
  pink: '#EC4899',
  gray: '#6B7280',
  slate: '#64748B',
  indigo: '#6366F1',
};

type SeedCategory = {
  id?: string;
  name: string;
  code: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
};

const categories: SeedCategory[] = [
  {
    id: CATEGORY_IDS.SETUP,
    name: 'Basic Setup & Infection Control',
    code: 'SETUP',
    description:
      'PPE, barriers, surface disinfectants, and initial operatory setup items',
    color: COLORS.blue,
    icon: 'Shield',
    sortOrder: 1,
  },
  {
    id: CATEGORY_IDS.ANESTHESIA,
    name: 'Local Anesthesia',
    code: 'ANESTHESIA',
    description:
      'Topical and injectable local anaesthetics, needles, and delivery systems',
    color: COLORS.teal,
    icon: 'Syringe',
    sortOrder: 2,
  },
  {
    id: CATEGORY_IDS.RESTORATIVE_CORE,
    name: 'Restorative Core',
    code: 'RESTORATIVE_CORE',
    description:
      'Bonding agents, composites, glass ionomers, and core build-up materials',
    color: COLORS.green,
    icon: 'Box',
    sortOrder: 3,
  },
  {
    id: CATEGORY_IDS.CEMENTS,
    name: 'Cements',
    code: 'CEMENTS',
    description:
      'Luting and lining cements for crown, bridge, and inlay cementation',
    color: COLORS.amber,
    icon: 'Anchor',
    sortOrder: 4,
  },
  {
    id: CATEGORY_IDS.ENDO_BASICS,
    name: 'Endo Basics',
    code: 'ENDO_BASICS',
    description:
      'Files, reamers, irrigation solutions, and rubber dam accessories',
    color: COLORS.red,
    icon: 'Tool',
    sortOrder: 5,
  },
  {
    id: CATEGORY_IDS.IMPRESSIONS,
    name: 'Impressions',
    code: 'IMPRESSIONS',
    description:
      'Impression taking materials and accessories (trays, adhesives, etc.)',
    color: COLORS.purple,
    icon: 'Camera',
    sortOrder: 6,
  },
  {
    id: CATEGORY_IDS.PREVENTIVE,
    name: 'Preventive',
    code: 'PREVENTIVE',
    description: 'Prophylaxis and caries prevention supplies',
    color: COLORS.cyan,
    icon: 'Heart',
    sortOrder: 7,
  },
  {
    id: CATEGORY_IDS.SURGICAL_EXTRACTIONS,
    name: 'Surgical / Simple Extractions',
    code: 'SURGICAL_EXTRACTIONS',
    description: 'Elevators, forceps, sutures, and haemostatic agents',
    color: COLORS.pink,
    icon: 'Scissors',
    sortOrder: 8,
  },
  {
    id: CATEGORY_IDS.RESTORATIVE_MATERIALS,
    name: 'Restorative Materials',
    code: 'RESTORATIVE_MATERIALS',
    description:
      'Amalgam, temporary filling materials, matrices, wedges, and finishing strips',
    color: COLORS.emerald,
    icon: 'Pencil',
    sortOrder: 9,
  },
  {
    id: CATEGORY_IDS.CEMENTS_LINERS,
    name: 'Cements & Liners',
    code: 'CEMENTS_LINERS',
    description:
      'Glass ionomer, resin-modified, zinc phosphate, and calcium hydroxide liners',
    color: COLORS.orange,
    icon: 'Droplet',
    sortOrder: 10,
  },
  {
    id: CATEGORY_IDS.IMPRESSION_MATERIALS,
    name: 'Impression Materials',
    code: 'IMPRESSION_MATERIALS',
    description:
      'Alginate, VPS, polyether, bite registration, and tray adhesives',
    color: COLORS.indigo,
    icon: 'Layers',
    sortOrder: 11,
  },
  {
    id: CATEGORY_IDS.PREVENTIVE_MATERIALS,
    name: 'Preventive Materials',
    code: 'PREVENTIVE_MATERIALS',
    description:
      'Fluoride varnish, sealants, prophy paste, and disclosing agents',
    color: COLORS.blue,
    icon: 'Sparkles',
    sortOrder: 12,
  },
  {
    id: CATEGORY_IDS.ENDO_MATERIALS,
    name: 'Endodontic Materials',
    code: 'ENDO_MATERIALS',
    description:
      'Gutta-percha, sealers, paper points, and intracanal medicaments',
    color: COLORS.red,
    icon: 'Package',
    sortOrder: 13,
  },
  {
    id: CATEGORY_IDS.SURGICAL_MISC,
    name: 'Surgical & Misc Consumables',
    code: 'SURGICAL_MISC',
    description:
      'Blades, suction tips, saline, surgical drapes, and biopsy supplies',
    color: COLORS.gray,
    icon: 'Archive',
    sortOrder: 14,
  },
  {
    id: CATEGORY_IDS.MEDICINE,
    name: 'MEDICINE',
    code: 'MEDICINE',
    description:
      'Pharmaceuticals, antibiotics, analgesics, antiseptics, and other oral/systemic medications',
    color: COLORS.gray,
    icon: 'Archive',
    sortOrder: 14,
  },
];

async function seedInventoryCategories() {
  console.log('🌱 Starting InventoryCategory seed...');

  try {
    // Optional: clear existing (uncomment with caution)
    // await prisma.inventoryCategory.deleteMany()

    for (const cat of categories) {
      await prisma.inventoryCategory.create({
        data: { ...cat, isActive: true },
      });
      console.log(`✅ Created: ${cat.name} (${cat.code}) – ID: ${cat.id}`);
    }

    const total = await prisma.inventoryCategory.count();
    const active = await prisma.inventoryCategory.count({
      where: { isActive: true },
    });

    console.log('\n🎉 Seed complete!');
    console.log(`   Total categories: ${total}`);
    console.log(`   Active: ${active}`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedInventoryCategories();
}

export { seedInventoryCategories };
