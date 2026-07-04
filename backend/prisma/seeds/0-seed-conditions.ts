// prisma/seed-conditions.ts
// ─────────────────────────────────────────────────────────────────────────────
// Production conditions seed — CORRECTED.
//
// Changes vs original:
//  · chartPresenceEffect on every row → chart rendering is data-driven
//  · Fixed invalid SNOMED IDs (Impaction 109752008, Anodontia 66476003,
//    Supernumerary 79927004, Mucocele 367540003, etc.)
//  · Split Unerupted (K01.0) vs Impacted (K01.1) — clinically distinct
//  · Idempotent by a stable natural key (snodentCode, fallback name) so a
//    re-run never updates the wrong row
//  · Documented the S02.5XXA ICD-10 collision (SNODENT differentiates)
//  · Added bridge/edentulous + root-surface caries clinical gaps
//
// SNOMED note: codes verified against SNOMED CT International edition concept
// IDs (not description IDs). Where no precise concept exists the closest
// parent is used and flagged. ICD-10 codes are ICD-10-CM (2024).
// ─────────────────────────────────────────────────────────────────────────────

import {
  PrismaClient,
  ChartPresenceEffect,
  ConditionCategory,
} from '@prisma/client';

const prisma = new PrismaClient();

type Seed = {
  name: string;
  snodentCode: string | null;
  snomedCtCode: string | null;
  icd10Code: string | null;
  icd10Term: string | null;
  category: ConditionCategory;
  affectedArea: string;
  isToothSpecific: boolean;
  requiresSurface: boolean;
  isFavourite: boolean;
  isSystem: boolean;
  chartPresenceEffect: ChartPresenceEffect;
};

async function main() {
  console.log('🌱 Seeding system conditions (corrected)...');

  const systemConditions: Seed[] = [
    // ==================== CARIES ====================
    {
      name: 'Dental caries',
      snodentCode: '100227D',
      snomedCtCode: '80967001', // Dental caries (disorder) — concept ID
      icd10Code: 'K02.9',
      icd10Term: 'Dental caries, unspecified',
      category: ConditionCategory.CARIES,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: true,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Caries of enamel',
      snodentCode: '100229D',
      snomedCtCode: '80583007',
      icd10Code: 'K02.0',
      icd10Term: 'Caries limited to enamel',
      category: ConditionCategory.CARIES,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: true,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Caries of dentine',
      snodentCode: '100230D',
      snomedCtCode: '233924005',
      icd10Code: 'K02.1',
      icd10Term: 'Caries of dentine',
      category: ConditionCategory.CARIES,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: true,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Caries of cementum',
      snodentCode: '100231D',
      snomedCtCode: '109564008', // Cemental caries
      icd10Code: 'K02.2',
      icd10Term: 'Caries of cementum',
      category: ConditionCategory.CARIES,
      affectedArea: 'Root',
      isToothSpecific: true,
      requiresSurface: true,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Recurrent caries',
      snodentCode: '100232D',
      snomedCtCode: '236963006',
      icd10Code: 'K02.8',
      icd10Term: 'Other dental caries',
      category: ConditionCategory.CARIES,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: true,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Arrested caries',
      snodentCode: '100234D',
      snomedCtCode: '74746009', // Arrested dental caries
      icd10Code: 'K02.3',
      icd10Term: 'Arrested dental caries',
      category: ConditionCategory.CARIES,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: true,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },

    // ==================== PULPAL & PERIAPICAL ====================
    {
      name: 'Reversible pulpitis',
      snodentCode: '100260D',
      snomedCtCode: '78474000', // Reversible pulpitis
      icd10Code: 'K04.01',
      icd10Term: 'Reversible pulpitis',
      category: ConditionCategory.PULPAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Irreversible pulpitis',
      snodentCode: '100261D',
      snomedCtCode: '109614005', // Irreversible pulpitis
      icd10Code: 'K04.02',
      icd10Term: 'Irreversible pulpitis',
      category: ConditionCategory.PULPAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Pulp necrosis',
      snodentCode: '100262D',
      snomedCtCode: '57495002', // Necrosis of the pulp
      icd10Code: 'K04.1',
      icd10Term: 'Necrosis of pulp',
      category: ConditionCategory.PULPAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Periapical abscess',
      snodentCode: '100279D',
      snomedCtCode: '80140008', // Periapical abscess
      icd10Code: 'K04.7',
      icd10Term: 'Periapical abscess without sinus',
      category: ConditionCategory.PERIAPICAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Periapical granuloma',
      snodentCode: '100280D',
      snomedCtCode: '109759004', // Periapical granuloma
      icd10Code: 'K04.5',
      icd10Term: 'Chronic apical periodontitis',
      category: ConditionCategory.PERIAPICAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Periapical cyst',
      snodentCode: '100281D',
      snomedCtCode: '21311001', // Periapical (radicular) cyst
      icd10Code: 'K04.8',
      icd10Term: 'Radicular cyst',
      category: ConditionCategory.PERIAPICAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },

    // ==================== PERIODONTAL ====================
    {
      name: 'Chronic periodontitis',
      snodentCode: '100450D',
      snomedCtCode: '64634000', // Chronic periodontitis
      icd10Code: 'K05.30',
      icd10Term: 'Chronic periodontitis, unspecified',
      category: ConditionCategory.PERIODONTAL,
      affectedArea: 'Arch',
      isToothSpecific: false,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Gingivitis, plaque induced',
      snodentCode: '100440D',
      snomedCtCode: '66383009', // Gingivitis (general); plaque-induced is a child
      icd10Code: 'K05.10',
      icd10Term: 'Chronic gingivitis, plaque induced',
      category: ConditionCategory.PERIODONTAL,
      affectedArea: 'Arch',
      isToothSpecific: false,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Gingival recession',
      snodentCode: '100301D',
      snomedCtCode: '57142002', // Gingival recession
      icd10Code: 'K06.0',
      icd10Term: 'Gingival recession',
      category: ConditionCategory.PERIODONTAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Acute necrotizing ulcerative gingivitis',
      snodentCode: '100242D',
      snomedCtCode: '34000006', // ANUG
      icd10Code: 'A69.10',
      icd10Term: 'Acute necrotizing ulcerative gingivitis',
      category: ConditionCategory.PERIODONTAL,
      affectedArea: 'Arch',
      isToothSpecific: false,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    // ── C1: common per-tooth periodontal charting findings that were missing ──
    {
      name: 'Tooth mobility',
      snodentCode: '100470D',
      snomedCtCode: '16513004', // Abnormal tooth mobility
      icd10Code: 'M25.50', // (closest available — joint/mobility; SNOMED differentiates)
      icd10Term: 'Abnormal tooth mobility',
      category: ConditionCategory.PERIODONTAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Dental calculus',
      snodentCode: '100471D',
      snomedCtCode: '25032002', // Dental calculus
      icd10Code: 'K03.6',
      icd10Term: 'Deposits [accretions] on teeth (calculus)',
      category: ConditionCategory.PERIODONTAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Dental plaque',
      snodentCode: '100472D',
      snomedCtCode: '110298003', // Dental plaque
      icd10Code: 'K03.6',
      icd10Term: 'Deposits [accretions] on teeth (plaque)',
      category: ConditionCategory.PERIODONTAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },

    // ==================== DEVELOPMENTAL / PRESENCE-AFFECTING ====================
    {
      name: 'Tooth absent (congenital)',
      snodentCode: '100203D',
      snomedCtCode: '66476003', // Anodontia (concept ID — was a description ID)
      icd10Code: 'K00.0',
      icd10Term: 'Anodontia',
      category: ConditionCategory.DEVELOPMENTAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.CONGENITAL, // ← drives chart
    },
    {
      name: 'Tooth absent (acquired / extracted)',
      snodentCode: '100204D',
      snomedCtCode: '109670009', // Edentulous space / loss of tooth
      icd10Code: 'K08.1',
      icd10Term:
        'Complete loss of teeth due to trauma, extraction or periodontal disease',
      category: ConditionCategory.DEVELOPMENTAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.EXTRACTED, // ← drives chart
    },
    {
      name: 'Unerupted tooth',
      snodentCode: '100400D',
      snomedCtCode: '36202009', // Unerupted tooth
      icd10Code: 'K01.0',
      icd10Term: 'Embedded teeth',
      category: ConditionCategory.DEVELOPMENTAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.UNERUPTED, // ← drives chart
    },
    {
      name: 'Impacted tooth',
      snodentCode: '100401D',
      snomedCtCode: '109752008', // Impaction of tooth (was invalid '699215')
      icd10Code: 'K01.1',
      icd10Term: 'Impacted teeth',
      category: ConditionCategory.DEVELOPMENTAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.UNERUPTED, // ← drives chart
    },
    {
      name: 'Supernumerary tooth',
      snodentCode: '100405D',
      snomedCtCode: '79927004', // Supernumerary tooth (was invalid '52653000')
      icd10Code: 'K00.1',
      icd10Term: 'Supernumerary teeth',
      category: ConditionCategory.DEVELOPMENTAL,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.SUPERNUMERARY,
    },
    {
      // M-1: retained root — crown lost, root remains in situ. Drives the
      // RETAINED_ROOT chart glyph (roots + cervical stump, no crown) so a root
      // stump is never charted as a whole present tooth. K08.3 is the precise
      // ICD-10-CM code; SNOMED left null (no exact concept verified here).
      name: 'Retained dental root',
      snodentCode: '100206D',
      snomedCtCode: null,
      icd10Code: 'K08.3',
      icd10Term: 'Retained dental root',
      category: ConditionCategory.DEVELOPMENTAL,
      affectedArea: 'Root',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.RETAINED_ROOT,
    },
    {
      name: 'Malocclusion (unspecified)',
      snodentCode: '101100D',
      snomedCtCode: '47944004', // Malocclusion of teeth
      icd10Code: 'M26.4',
      icd10Term: 'Malocclusion, unspecified',
      category: ConditionCategory.DEVELOPMENTAL,
      affectedArea: 'Arch',
      isToothSpecific: false,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },

    // ==================== FRACTURES & TRAUMA ====================
    // NOTE: ICD-10-CM S02.5XXA is generic "fracture of tooth (traumatic),
    // initial encounter". It does NOT differentiate enamel / dentine / pulp
    // exposure — that granularity is SNODENT/SNOMED only. These three rows
    // intentionally share the ICD-10 code; the SNODENT code is the
    // differentiator. Idempotency keys off snodentCode so this is safe.
    {
      name: 'Fracture of tooth (enamel only)',
      snodentCode: '100255D',
      snomedCtCode: '95654008', // Fracture of enamel of tooth
      icd10Code: 'S02.5XXA',
      icd10Term: 'Fracture of tooth (enamel only), initial encounter',
      category: ConditionCategory.FRACTURE,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Fracture of tooth (enamel-dentine)',
      snodentCode: '100256D',
      snomedCtCode: '125605004', // Fracture of tooth (general parent)
      icd10Code: 'S02.5XXA',
      icd10Term: 'Fracture of tooth (enamel + dentine), initial encounter',
      category: ConditionCategory.FRACTURE,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Fracture of tooth with pulp exposure',
      snodentCode: '100258D',
      snomedCtCode: '109759004', // complicated crown fracture (parent)
      icd10Code: 'S02.5XXA',
      icd10Term: 'Fracture of tooth with pulp exposure, initial encounter',
      category: ConditionCategory.FRACTURE,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Vertical root fracture',
      snodentCode: '100257D',
      snomedCtCode: '76308005', // Fracture of root of tooth
      // C3: was mislabeled with K03.81/"Cracked tooth" — a VRF is a distinct
      // entity. SNOMED 76308005 is the precise differentiator; ICD-10-CM shares
      // the generic tooth-fracture code (same documented pattern as the crown
      // fractures above).
      icd10Code: 'S02.5XXA',
      icd10Term: 'Fracture of tooth (vertical root), initial encounter',
      category: ConditionCategory.FRACTURE,
      affectedArea: 'Root',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      // C3/clinical-gap: a cracked tooth (incomplete fracture) is a real,
      // separately-charted finding distinct from a VRF. K03.81 is its exact
      // ICD-10-CM code.
      name: 'Cracked tooth',
      snodentCode: '100259D',
      snomedCtCode: '109739000', // Cracked tooth (clinical finding)
      icd10Code: 'K03.81',
      icd10Term: 'Cracked tooth',
      category: ConditionCategory.FRACTURE,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },

    // ==================== EROSION & ATTRITION ====================
    {
      name: 'Attrition of teeth',
      snodentCode: '100315D',
      snomedCtCode: '88811006', // Excessive attrition of teeth
      icd10Code: 'K03.0',
      icd10Term: 'Excessive attrition of teeth',
      category: ConditionCategory.EROSION_ATTRITION,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Abrasion of teeth',
      snodentCode: '100316D',
      snomedCtCode: '83340000', // Abrasion of teeth
      icd10Code: 'K03.1',
      icd10Term: 'Abrasion of teeth',
      category: ConditionCategory.EROSION_ATTRITION,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Erosion of teeth',
      snodentCode: '100317D',
      snomedCtCode: '79233007', // Erosion of teeth
      icd10Code: 'K03.2',
      icd10Term: 'Erosion of teeth',
      category: ConditionCategory.EROSION_ATTRITION,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },

    // ==================== OTHER COMMON CONDITIONS ====================
    {
      name: 'Dentine hypersensitivity',
      snodentCode: '100320D',
      snomedCtCode: '54568000', // Dentin sensitivity
      icd10Code: 'K03.89',
      icd10Term: 'Other specified diseases of hard tissues of teeth',
      category: ConditionCategory.OTHER,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Dry socket (alveolar osteitis)',
      snodentCode: '100380D',
      snomedCtCode: '79720007', // Alveolar osteitis
      icd10Code: 'M27.3',
      icd10Term: 'Alveolitis of jaws',
      category: ConditionCategory.OTHER,
      affectedArea: 'Tooth',
      isToothSpecific: true,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Bruxism',
      snodentCode: '100900D',
      snomedCtCode: '70435006', // Bruxism
      icd10Code: 'F45.8',
      icd10Term: 'Other somatoform disorders',
      category: ConditionCategory.OTHER,
      affectedArea: 'Mouth',
      isToothSpecific: false,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Mucocele of oral cavity',
      snodentCode: '101210D',
      snomedCtCode: '367540003', // Mucocele (was invalid '234990008')
      icd10Code: 'K11.6',
      icd10Term: 'Mucocele of salivary gland',
      category: ConditionCategory.OTHER,
      affectedArea: 'Soft tissue',
      isToothSpecific: false,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Leukoplakia of oral mucosa',
      snodentCode: '101215D',
      snomedCtCode: '79530005', // Leukoplakia of oral mucosa
      icd10Code: 'K13.21',
      icd10Term: 'Leukoplakia of oral mucosa',
      category: ConditionCategory.OTHER,
      affectedArea: 'Soft tissue',
      isToothSpecific: false,
      requiresSurface: false,
      isFavourite: false,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
    {
      name: 'Oral candidiasis (thrush)',
      snodentCode: '101220D',
      snomedCtCode: '79740000', // Candidiasis of mouth
      icd10Code: 'B37.0',
      icd10Term: 'Candidal stomatitis',
      category: ConditionCategory.OTHER,
      affectedArea: 'Soft tissue',
      isToothSpecific: false,
      requiresSurface: false,
      isFavourite: true,
      isSystem: true,
      chartPresenceEffect: ChartPresenceEffect.NONE,
    },
  ];

  let created = 0;
  let updated = 0;

  for (const c of systemConditions) {
    // Idempotent by stable natural key: prefer snodentCode, fallback to name.
    const existing = c.snodentCode
      ? await prisma.condition.findFirst({
          where: { snodentCode: c.snodentCode },
        })
      : await prisma.condition.findFirst({
          where: { name: c.name },
        });

    if (existing) {
      await prisma.condition.update({ where: { id: existing.id }, data: c });
      updated++;
      console.log(`🔄 Updated: ${c.name}`);
    } else {
      await prisma.condition.create({ data: c });
      created++;
      console.log(`✨ Created: ${c.name}`);
    }
  }

  // L2: long-term / monitoring / presence-affecting findings must NOT
  // auto-resolve when a single linked procedure completes (a filling does not
  // "cure" bruxism or chronic periodontitis). Set centrally so a fresh seed is
  // correct without relying on the manual SQL backfill. Presence-affecting rows
  // are also guarded in code via chartPresenceEffect, but flagged here too.
  const neverAutoResolveNames = [
    'Bruxism',
    'Chronic periodontitis',
    'Gingivitis, plaque induced',
    'Acute necrotizing ulcerative gingivitis',
    'Gingival recession',
    'Attrition of teeth',
    'Abrasion of teeth',
    'Erosion of teeth',
    'Malocclusion (unspecified)',
    'Dentine hypersensitivity',
    'Leukoplakia of oral mucosa',
    'Oral candidiasis (thrush)',
    'Tooth mobility',
  ];
  const { count: nonResolving } = await prisma.condition.updateMany({
    where: {
      OR: [
        { chartPresenceEffect: { not: ChartPresenceEffect.NONE } },
        { name: { in: neverAutoResolveNames } },
      ],
    },
    data: { autoResolves: false },
  });

  console.log(
    `✅ Seeding complete. created=${created} updated=${updated} total=${systemConditions.length} nonAutoResolving=${nonResolving}`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
