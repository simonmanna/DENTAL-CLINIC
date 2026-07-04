// prisma/seeds/seed-categories.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fixed ID for the existing drug category
const DRUG_CATEGORY_IDS = {
  GENERAL_MED: 'cmp6p5b5j0000fmi0x9rk09n7',
} as const;

const COLORS = {
  gray: '#215ed8',
};

type SeedCategory = {
  id?: string;
  name: string;
  code: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  children?: Omit<SeedCategory, 'children'>[];
};

const categories: SeedCategory[] = [
  {
    id: DRUG_CATEGORY_IDS.GENERAL_MED,
    name: 'General Medicine',
    code: 'GENERAL_MED',
    description: 'General / uncategorised medications',
    color: COLORS.gray,
    icon: 'Pill',
    sortOrder: 1,
  },
];

async function seedDrugCategories() {
  console.log('🌱 Starting DrugCategory seed...');

  try {
    // Optional: Clear existing (use cautiously in production)
    // await prisma.drugCategory.deleteMany()

    for (const cat of categories) {
      const { children, ...parentData } = cat;
      await prisma.drugCategory.create({
        data: { ...parentData, isActive: true },
      });
      console.log(`✅ Created: ${cat.name} (${cat.code}) – ID: ${cat.id}`);
    }

    const total = await prisma.drugCategory.count();
    const active = await prisma.drugCategory.count({
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
  seedDrugCategories();
}

export { seedDrugCategories };
