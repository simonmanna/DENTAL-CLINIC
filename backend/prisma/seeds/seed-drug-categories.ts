// prisma/seed-drug-categories.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────
// 🎨 UI CONSTANTS (Colors & Icons)
// ─────────────────────────────────────────────────────────────────────
// Color palette for UI badges (medical-themed)
const COLORS = {
  primary: '#3B82F6', // blue-500
  success: '#10B981', // emerald-500
  warning: '#F59E0B', // amber-500
  danger: '#EF4444', // red-500
  info: '#06B6D4', // cyan-500
  purple: '#8B5CF6', // violet-500
  pink: '#EC4899', // pink-500
  teal: '#14B8A6', // teal-500
  orange: '#F97316', // orange-500
  slate: '#64748B', // slate-500
};

// Lucide icon names for UI (https://lucide.dev/icons)
const ICONS = {
  anesthetics: 'syringe',
  antibiotics: 'pill',
  analgesics: 'heart-pulse',
  antiinflammatory: 'flame',
  antifungals: 'sparkles',
  antivirals: 'shield',
  sedatives: 'moon',
  hemostatics: 'droplet',
  topical: 'spray-can',
  emergency: 'zap',
  supplements: 'leaf',
  antiseptics: 'shield-check',
  // Sub-category icons
  penicillins: 'pill-bottle',
  macrolides: 'capsule',
  nsaid: 'flame-kindling',
  opioid: 'lock',
  local: 'map-pin',
  general: 'hospital',
};

// ─────────────────────────────────────────────────────────────────────
// 📋 ROOT CATEGORIES (12 Main Drug Categories)
// ─────────────────────────────────────────────────────────────────────
const ROOT_CATEGORIES = [
  {
    name: 'Local Anesthetics',
    code: 'ANESTH-LOCAL',
    description:
      'Injectable agents for local pain control during dental procedures',
    color: COLORS.primary,
    icon: ICONS.anesthetics,
    sortOrder: 1,
  },
  {
    name: 'Antibiotics',
    code: 'ANTIB',
    description:
      'Antibacterial agents for preventing/treating dental infections',
    color: COLORS.success,
    icon: ICONS.antibiotics,
    sortOrder: 2,
  },
  {
    name: 'Analgesics',
    code: 'ANALG',
    description:
      'Pain relief medications for post-operative and dental pain management',
    color: COLORS.info,
    icon: ICONS.analgesics,
    sortOrder: 3,
  },
  {
    name: 'Anti-Inflammatories (NSAIDs)',
    code: 'NSAID',
    description:
      'Non-steroidal anti-inflammatory drugs for pain and swelling reduction',
    color: COLORS.warning,
    icon: ICONS.antiinflammatory,
    sortOrder: 4,
  },];

// ─────────────────────────────────────────────────────────────────────
// 🚀 SEED FUNCTION
// ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('💊 Starting drug category seeding...');

  try {
    // 1. Check for existing categories to avoid duplicates
    const existingCount = await prisma.drugCategory.count();

    if (existingCount > 0) {
      console.log(
        `⚠️  Found ${existingCount} existing drug categories. Skipping seed to avoid duplicates.`,
      );
      console.log(
        '💡 Tip: Clear drug_categories table or use --force if re-seeding is intended',
      );
      return;
    }

    // 2. Create root categories first
    console.log('\n📦 Creating root categories...');
    const rootCategories = await prisma.$transaction(
      ROOT_CATEGORIES.map((cat) =>
        prisma.drugCategory.create({
          data: {
            name: cat.name,
            code: cat.code,
            description: cat.description,
            color: cat.color,
            icon: cat.icon,
            isActive: true,
            sortOrder: cat.sortOrder,
            // parentId is null => root level
          },
        }),
      ),
    );

    // Create lookup map for parent IDs
    const categoryMap = new Map(rootCategories.map((c) => [c.code, c]));

    console.log(`✅ Created ${rootCategories.length} root categories`);

    // 4. Display results in hierarchical format
    console.log('\n📋 Drug Category Hierarchy:');
    console.log('─'.repeat(60));

    for (const root of rootCategories) {
      const children = await prisma.drugCategory.findMany({
        where: { parentId: root.id },
        orderBy: { sortOrder: 'asc' },
      });

      console.log(
        `\n🔹 ${root.name} [${root.code}] ${root.icon ? `(${root.icon})` : ''}`,
      );
      console.log(`   └─ ${root.description}`);

      if (children.length > 0) {
        children.forEach((child, idx) => {
          const connector = idx === children.length - 1 ? '└─' : '├─';
          console.log(`      ${connector} ${child.name} [${child.code}]`);
        });
      }
    }

    // 5. Summary statistics
    const totalCategories = await prisma.drugCategory.count();
    const rootCount = await prisma.drugCategory.count({
      where: { parentId: null },
    });
    const subCount = totalCategories - rootCount;

    console.log('\n📊 Seed Summary:');
    console.log(`   • Total categories: ${totalCategories}`);
    console.log(`   • Root categories: ${rootCount}`);
    console.log(`   • Sub-categories: ${subCount}`);
    console.log(`   • All categories active: ✅`);

    console.log('\n✨ Drug category seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// ─────────────────────────────────────────────────────────────────────
// EXECUTE
// ─────────────────────────────────────────────────────────────────────

main().catch((e) => {
  console.error('Unhandled error during seeding:', e);
  process.exit(1);
});

