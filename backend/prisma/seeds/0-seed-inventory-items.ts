// prisma/seeds/seed-inventory-items.ts
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
  MEDICINES: 'cmpd0wv0l0000ej2le3qo3fys', // must exist in DB
} as const;

type SeedItem = {
  id: string;              // exact ID from CSV
  itemCode: string;
  name: string;
  description: string;
  unit: string;
  categoryCode: keyof typeof CATEGORY_IDS;
  minQuantity: number;
  unitCost: number;
};

const items: SeedItem[] = [
  // Basic Setup & Infection Control
  { id: 'cmpd16t3d0001ksif1haplt2u', itemCode: 'SETUP-GLV-001', name: 'Nitrile Examination Gloves (S-XL)', description: 'Powder-free nitrile gloves, assorted sizes', unit: 'Box', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t3s0003ksifxiekkewk', itemCode: 'SETUP-MSK-001', name: 'Disposable Face Masks', description: 'Earloop surgical masks, 3-ply', unit: 'Box', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t3v0005ksif7lihm0lf', itemCode: 'SETUP-GWN-001', name: 'Disposable Gowns', description: 'Isolation gowns, non-sterile', unit: 'Pack', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t3x0007ksifabj9v9a1', itemCode: 'SETUP-BIB-001', name: 'Patient Bibs', description: 'Waterproof patient bibs, disposable', unit: 'Roll', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t400009ksif4f4piom9', itemCode: 'SETUP-BCL-001', name: 'Bib Clips', description: 'Metal bib clips with chain', unit: 'Pack', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t42000bksifranh66sj', itemCode: 'SETUP-WPE-001', name: 'Surface Disinfectant Wipes', description: 'Pre-saturated disinfectant wipes, tub', unit: 'Canister', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t46000dksifdsbwla92', itemCode: 'SETUP-SPR-001', name: 'Surface Disinfectant Spray', description: 'Broad-spectrum surface disinfectant spray', unit: 'Bottle', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t49000fksifs7v1rzpv', itemCode: 'SETUP-PCH-001', name: 'Sterilization Pouches', description: 'Self-seal sterilization pouches, assorted sizes', unit: 'Box', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t4c000hksiflqcnipf4', itemCode: 'SETUP-IND-001', name: 'Sterilization Indicator Strips', description: 'Type 4 chemical indicator strips', unit: 'Box', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t4f000jksif7flvipkx', itemCode: 'SETUP-SLV-001', name: 'Saliva Ejectors', description: 'Disposable white saliva ejector tips', unit: 'Box', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t4k000lksifhscyz3aq', itemCode: 'SETUP-HVE-001', name: 'High Volume Evacuator Tips', description: 'Disposable HVE tips, autoclavable', unit: 'Box', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t4m000nksifuagmrzm1', itemCode: 'SETUP-ROL-001', name: 'Cotton Rolls', description: 'Non-sterile cotton rolls, medium', unit: 'Bag', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t4o000pksifzhs4o5tg', itemCode: 'SETUP-GAU-001', name: 'Gauze 2x2', description: '4-ply non-sterile gauze sponges', unit: 'Box', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t4r000rksifrzylsf6c', itemCode: 'SETUP-PEL-001', name: 'Cotton Pellets', description: 'Cotton pellets #2, non-sterile', unit: 'Bag', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t4t000tksif6tgkf8zl', itemCode: 'SETUP-FLM-001', name: 'Barrier Film', description: 'Sticky-side barrier film for surfaces', unit: 'Roll', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t4v000vksif0n6jbj6c', itemCode: 'SETUP-TCV-001', name: 'Tray Covers', description: 'Disposable plastic tray covers', unit: 'Box', categoryCode: 'SETUP', minQuantity: 0, unitCost: 0 },

  // Local Anesthesia
  { id: 'cmpd16t50000xksifdyd5f1h8', itemCode: 'ANES-LID-001', name: 'Lidocaine 2% + Epi 1:100k Carpules', description: '50 carpules per box', unit: 'Box', categoryCode: 'ANESTHESIA', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t52000zksifneovxltc', itemCode: 'ANES-ART-001', name: 'Articaine 4% + Epi 1:100k Carpules', description: '50 carpules per box', unit: 'Box', categoryCode: 'ANESTHESIA', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t540011ksifbpjiu0mi', itemCode: 'ANES-NDL-30G', name: 'Needles Short 30G', description: 'Dental needle 30G short, 100/box', unit: 'Box', categoryCode: 'ANESTHESIA', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t560013ksifxfiipfav', itemCode: 'ANES-NDL-27G', name: 'Needles Long 27G', description: 'Dental needle 27G long, 100/box', unit: 'Box', categoryCode: 'ANESTHESIA', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t580015ksifxhvzq1yc', itemCode: 'ANES-TOP-001', name: 'Topical Anesthetic Gel 20% Benzocaine', description: '30g tube, fast-acting topical gel', unit: 'Tube', categoryCode: 'ANESTHESIA', minQuantity: 0, unitCost: 0 },

  // Restorative Core
  { id: 'cmpd16t5b0017ksifcm6f20dy', itemCode: 'RCOR-OPT-001', name: 'OptiBond Universal Bonding Agent', description: '5ml bottle with primer/adhesive', unit: 'Bottle', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t5e0019ksife845aksf', itemCode: 'RCOR-SCO-001', name: 'Scotchbond Universal Adhesive', description: '5ml bottle, self-etch bonding agent', unit: 'Bottle', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t5i001bksifw6mfsohg', itemCode: 'RCOR-ETC-001', name: 'Etchant Gel 37% Phosphoric Acid', description: '10 syringes, blue gel', unit: 'Pack', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t5l001dksif4n1y5hxn', itemCode: 'RCOR-FLO-A1', name: 'Flowable Composite A1', description: '2g syringe, light-cure, shade A1', unit: 'Syringe', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t5n001fksifc7ecndu8', itemCode: 'RCOR-FLO-A2', name: 'Flowable Composite A2', description: '2g syringe, light-cure, shade A2', unit: 'Syringe', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t5q001hksiflkf06fz4', itemCode: 'RCOR-FLO-A3', name: 'Flowable Composite A3', description: '2g syringe, light-cure, shade A3', unit: 'Syringe', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t5t001jksif6g05z1la', itemCode: 'RCOR-PAK-A2', name: 'Packable Composite A2', description: '4g syringe, packable, shade A2', unit: 'Syringe', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t5x001lksifxvggaced', itemCode: 'RCOR-PAK-A3', name: 'Packable Composite A3', description: '4g syringe, packable, shade A3', unit: 'Syringe', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t60001nksifx4dlndcy', itemCode: 'RCOR-FU9-001', name: 'Fuji IX Glass Ionomer', description: 'Posterior glass ionomer, powder/liquid', unit: 'Kit', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t63001pksif4898el1d', itemCode: 'RCOR-FU2-001', name: 'Fuji II LC Glass Ionomer', description: 'Anterior light-cure glass ionomer, capsule', unit: 'Capsule', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t66001rksifjcvzlgse', itemCode: 'RCOR-CAV-001', name: 'Cavit Temporary Filling Material', description: '30g jar, ready-to-use', unit: 'Jar', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t68001tksifi1gnqwy2', itemCode: 'RCOR-IRM-001', name: 'IRM Temporary Filling', description: 'Powder/liquid intermediate restorative material', unit: 'Kit', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t6b001vksifiu3zx041', itemCode: 'RCOR-DSC-001', name: 'Finishing/Polishing Discs', description: 'Sof-Lex discs, assorted grits', unit: 'Pack', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t6f001xksif26gug1kh', itemCode: 'RCOR-STR-001', name: 'Finishing/Polishing Strips', description: 'Diamond finishing strips, metal/plastic', unit: 'Pack', categoryCode: 'RESTORATIVE_CORE', minQuantity: 0, unitCost: 0 },

  // Cements
  { id: 'cmpd16t6i001zksiftl35j7u8', itemCode: 'CEM-TBN-001', name: 'Temp-Bond NE Temporary Cement', description: 'Eugenol-free temporary cement, 34g base + catalyst', unit: 'Kit', categoryCode: 'CEMENTS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t6k0021ksifnz1mhk96', itemCode: 'CEM-RLX-001', name: 'RelyX Luting Plus Cement', description: 'Resin-modified glass ionomer, automix syringe', unit: 'Syringe', categoryCode: 'CEMENTS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t6m0023ksif3hbmlx83', itemCode: 'CEM-FJC-001', name: 'FujiCEM Permanent Cement', description: 'Glass ionomer luting cement, capsule', unit: 'Capsule', categoryCode: 'CEMENTS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t6p0025ksifkc3mdfck', itemCode: 'CEM-DYC-001', name: 'Dycal Calcium Hydroxide Liner', description: 'Base/catalyst paste for pulp capping', unit: 'Kit', categoryCode: 'CEMENTS', minQuantity: 0, unitCost: 0 },

  // Endo Basics
  { id: 'cmpd16t6t0027ksifzi65cijs', itemCode: 'ENDB-NOC-001', name: 'Sodium Hypochlorite 5.25%', description: '500ml irrigation solution', unit: 'Bottle', categoryCode: 'ENDO_BASICS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t6v0029ksif01yb9i22', itemCode: 'ENDB-EDT-001', name: 'EDTA 17% Solution', description: '100ml smear layer remover', unit: 'Bottle', categoryCode: 'ENDO_BASICS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t6y002bksif6cnshwoa', itemCode: 'ENDB-PPT-001', name: 'Paper Points Assorted', description: 'Assorted sizes #15-40, 200/box', unit: 'Box', categoryCode: 'ENDO_BASICS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t70002dksifav00of2h', itemCode: 'ENDB-GP-001', name: 'Gutta Percha Points Assorted', description: 'Assorted sizes #15-40, 120/box', unit: 'Box', categoryCode: 'ENDO_BASICS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t72002fksiflbiweplx', itemCode: 'ENDB-AHP-001', name: 'AH Plus Endodontic Sealer', description: 'Epoxy-resin based sealer, 2x4g tubes', unit: 'Kit', categoryCode: 'ENDO_BASICS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t74002hksifxvbkge1c', itemCode: 'ENDB-PEL-001', name: 'Cotton Pellets (Endo)', description: 'Small cotton pellets for canal drying', unit: 'Bag', categoryCode: 'ENDO_BASICS', minQuantity: 0, unitCost: 0 },

  // Impressions
  { id: 'cmpd16t77002jksifoi2cdp3g', itemCode: 'IMP-ALG-001', name: 'Alginate Impression Material', description: 'Dust-free alginate, 500g bag', unit: 'Bag', categoryCode: 'IMPRESSIONS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t7b002lksifztc6ut4j', itemCode: 'IMP-SCO-001', name: 'Measuring Scoops for Alginate', description: 'Set of water & powder scoops', unit: 'Pack', categoryCode: 'IMPRESSIONS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t7d002nksifhodq53l6', itemCode: 'IMP-PVS-HV', name: 'PVS Heavy Body', description: 'Heavy body cartridge, 48ml, assorted', unit: 'Cartridge', categoryCode: 'IMPRESSIONS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t7e002pksifqf3g7onh', itemCode: 'IMP-PVS-LV', name: 'PVS Light Body', description: 'Light body cartridge, 48ml', unit: 'Cartridge', categoryCode: 'IMPRESSIONS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t7g002rksiflxspcpdp', itemCode: 'IMP-BTR-001', name: 'Bite Registration Material', description: 'Fast-set bite registration, automix', unit: 'Cartridge', categoryCode: 'IMPRESSIONS', minQuantity: 0, unitCost: 0 },

  // Preventive
  { id: 'cmpd16t7i002tksifi8st5f3o', itemCode: 'PREV-PST-001', name: 'Prophy Paste', description: 'Mint prophy paste, medium grit, 200g jar', unit: 'Jar', categoryCode: 'PREVENTIVE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t7k002vksif5g58uemm', itemCode: 'PREV-ANG-001', name: 'Prophy Angles & Cups', description: 'Disposable prophy angles (soft) with cups', unit: 'Pack', categoryCode: 'PREVENTIVE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t7m002xksif5r862bk7', itemCode: 'PREV-FLV-001', name: 'Fluoride Varnish Unit Dose', description: 'Single-dose packs, 0.5ml each', unit: 'Box', categoryCode: 'PREVENTIVE', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t7q002zksif9fh39lbf', itemCode: 'PREV-SLT-001', name: 'Pit & Fissure Sealant with Etch', description: 'Light-cure sealant + etchant, kit', unit: 'Kit', categoryCode: 'PREVENTIVE', minQuantity: 0, unitCost: 0 },

  // Surgical / Simple Extractions
  { id: 'cmpd16t7t0031ksifl7ldtwnf', itemCode: 'SURG-CG3-001', name: 'Chromic Gut Suture 3-0', description: 'Absorbable chromic gut, 18" strand, box/36', unit: 'Box', categoryCode: 'SURGICAL_EXTRACTIONS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t7v0033ksif1lywtp8a', itemCode: 'SURG-CG4-001', name: 'Chromic Gut Suture 4-0', description: 'Absorbable chromic gut, 18" strand, box/36', unit: 'Box', categoryCode: 'SURGICAL_EXTRACTIONS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t7w0035ksif8fi2bii7', itemCode: 'SURG-GEL-001', name: 'Gelfoam Absorbable Sponge', description: 'Hemostatic gelatin sponge, size 100', unit: 'Pack', categoryCode: 'SURGICAL_EXTRACTIONS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t7y0037ksiferap6b31', itemCode: 'SURG-HEM-001', name: 'Hemodent/ViscoStat Hemostatic Agent', description: '20% ferric sulfate solution, 30ml', unit: 'Bottle', categoryCode: 'SURGICAL_EXTRACTIONS', minQuantity: 0, unitCost: 0 },

  // Restorative Materials
  { id: 'cmpd16t800039ksif1ibjegij', itemCode: 'RMAT-COM-001', name: 'Composite Resin Universal', description: 'Tooth-coloured hybrid composite, syringe A2', unit: 'Syringe', categoryCode: 'RESTORATIVE_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t83003bksifl5okvpna', itemCode: 'RMAT-GIC-001', name: 'Glass Ionomer Filling Material', description: 'Self-cure glass ionomer, capsule', unit: 'Capsule', categoryCode: 'RESTORATIVE_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t88003dksif9ac5p7vz', itemCode: 'RMAT-AMG-001', name: 'Dental Amalgam Alloy', description: 'High-copper amalgam capsules', unit: 'Capsule', categoryCode: 'RESTORATIVE_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t8a003fksifebimoydz', itemCode: 'RMAT-CMP-001', name: 'Compomer Restorative Material', description: 'Polyacid-modified composite, syringe A2', unit: 'Syringe', categoryCode: 'RESTORATIVE_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t8c003hksif45rsu5px', itemCode: 'RMAT-TMP-001', name: 'Temporary Filling Material Kit', description: 'Cavit & IRM combo pack', unit: 'Kit', categoryCode: 'RESTORATIVE_MATERIALS', minQuantity: 0, unitCost: 0 },

  // Cements & Liners
  { id: 'cmpd16t8e003jksifqcqdyks1', itemCode: 'CLIN-ZNP-001', name: 'Zinc Phosphate Cement', description: 'Crown/bridge luting cement, powder/liquid', unit: 'Kit', categoryCode: 'CEMENTS_LINERS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t8g003lksifl0mt0y0j', itemCode: 'CLIN-ZOE-001', name: 'Zinc Oxide Eugenol Cement (ZOE)', description: 'Temporary luting and sedative base', unit: 'Kit', categoryCode: 'CEMENTS_LINERS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t8i003nksif6b9y3ld9', itemCode: 'CLIN-PCX-001', name: 'Polycarboxylate Cement', description: 'Crown and ortho band cement, powder/liquid', unit: 'Kit', categoryCode: 'CEMENTS_LINERS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t8m003pksiftfy0kpcr', itemCode: 'CLIN-RCM-001', name: 'Light-Cure Resin Cement', description: 'Bonding veneers, inlays, crowns, syringe', unit: 'Syringe', categoryCode: 'CEMENTS_LINERS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t8p003rksifhrcdyoz4', itemCode: 'CLIN-DUC-001', name: 'Ducal Life Calcium Hydroxide Liner', description: 'Radiopaque pulp-capping liner, 2x13g', unit: 'Kit', categoryCode: 'CEMENTS_LINERS', minQuantity: 0, unitCost: 0 },

  // Impression Materials
  { id: 'cmpd16t8r003tksif2t6c4h09', itemCode: 'IMAT-ALG-001', name: 'Alginate (Impression)', description: 'Chromatic alginate, 500g', unit: 'Bag', categoryCode: 'IMPRESSION_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t8s003vksif76a438xg', itemCode: 'IMAT-PVS-001', name: 'PVS Impression Material', description: 'Addition silicone heavy/light body kit', unit: 'Kit', categoryCode: 'IMPRESSION_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t8u003xksifo52jasrd', itemCode: 'IMAT-PLY-001', name: 'Polyether Impression Material', description: 'High precision, for implants, cartridge', unit: 'Cartridge', categoryCode: 'IMPRESSION_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t8w003zksifrqn7qlu6', itemCode: 'IMAT-ZOE-001', name: 'ZOE Impression Paste', description: 'Edentulous impression material, tube', unit: 'Tube', categoryCode: 'IMPRESSION_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t8y0041ksifdjga5fic', itemCode: 'IMAT-CPD-001', name: 'Impression Compound', description: 'Thermoplastic compound sticks, border moulding', unit: 'Box', categoryCode: 'IMPRESSION_MATERIALS', minQuantity: 0, unitCost: 0 },

  // Preventive Materials
  { id: 'cmpd16t900043ksiffz89qhyy', itemCode: 'PMAT-DUR-001', name: 'Duraphat Fluoride Varnish', description: '5% NaF varnish, 30ml tube', unit: 'Tube', categoryCode: 'PREVENTIVE_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t940045ksif0an2i7tp', itemCode: 'PMAT-VAN-001', name: 'Vanish Fluoride Varnish', description: '5% NaF varnish, single-dose packs', unit: 'Box', categoryCode: 'PREVENTIVE_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t980047ksif26m6p9fo', itemCode: 'PMAT-SLT-001', name: 'Pit & Fissure Sealant', description: 'Light-cure resin sealant, 2x1.2ml', unit: 'Kit', categoryCode: 'PREVENTIVE_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t9b0049ksifmuws73n2', itemCode: 'PMAT-PST-001', name: 'Prophy Paste (Preventive)', description: 'Coarse grit prophy paste, 200g jar', unit: 'Jar', categoryCode: 'PREVENTIVE_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t9d004bksiflhn7g9e4', itemCode: 'PMAT-DIS-001', name: 'Disclosing Solution', description: 'Two-tone plaque disclosing solution, 240ml', unit: 'Bottle', categoryCode: 'PREVENTIVE_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t9f004dksifpaczal2v', itemCode: 'PMAT-DTB-001', name: 'Disclosing Tablets', description: 'Plaque disclosing tablets, 250/bottle', unit: 'Bottle', categoryCode: 'PREVENTIVE_MATERIALS', minQuantity: 0, unitCost: 0 },

  // Endodontic Materials
  { id: 'cmpd16t9h004fksifp7tisxmj', itemCode: 'EMAT-GP-001', name: 'Gutta Percha Points (Endo)', description: 'Standardised GP points #15-40, 120/box', unit: 'Box', categoryCode: 'ENDO_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t9l004hksifs89rbne3', itemCode: 'EMAT-AHP-001', name: 'AH Plus Sealer', description: 'Epoxy resin sealer, 4g tube', unit: 'Tube', categoryCode: 'ENDO_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t9n004jksifvdvqm13a', itemCode: 'EMAT-SLP-001', name: 'Sealapex Sealer', description: 'Calcium hydroxide based sealer, 12g', unit: 'Tube', categoryCode: 'ENDO_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t9p004lksifylymwo4e', itemCode: 'EMAT-NOC-001', name: 'Sodium Hypochlorite 5.25% (Endo)', description: 'Irrigation solution, 500ml', unit: 'Bottle', categoryCode: 'ENDO_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t9s004nksiffykcbsut', itemCode: 'EMAT-EDT-001', name: 'EDTA 17% Solution (Endo)', description: 'Smear layer remover, 100ml', unit: 'Bottle', categoryCode: 'ENDO_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t9u004pksifta1u5871', itemCode: 'EMAT-PPT-001', name: 'Paper Points Assorted (Endo)', description: 'Assorted sizes, 200/box', unit: 'Box', categoryCode: 'ENDO_MATERIALS', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16t9w004rksifoja3fa8l', itemCode: 'EMAT-CAH-001', name: 'Calcium Hydroxide Paste', description: 'Intracanal medicament, 2g syringe', unit: 'Syringe', categoryCode: 'ENDO_MATERIALS', minQuantity: 0, unitCost: 0 },

  // Surgical & Misc Consumables
  { id: 'cmpd16t9z004tksifqj65zctm', itemCode: 'SMSC-LID-001', name: 'Lidocaine 2% + Epi Carpules (Surg)', description: '50 carpules per box', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16ta1004vksif0i7gc4sk', itemCode: 'SMSC-ART-001', name: 'Articaine 4% + Epi Carpules (Surg)', description: '50 carpules per box', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16ta4004xksiflmjtqjug', itemCode: 'SMSC-MEP-001', name: 'Mepivacaine 3% Plain Carpules', description: 'Short-acting anaesthetic, 50/box', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16ta6004zksif14r4g4sb', itemCode: 'SMSC-VCR-001', name: 'Vicryl Suture', description: 'Polyglactin 910 braided suture, assorted', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16ta90051ksifo2golu0b', itemCode: 'SMSC-SLK-001', name: 'Silk Suture', description: 'Non-absorbable silk suture, assorted', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tab0053ksifzspkoua1', itemCode: 'SMSC-NYL-001', name: 'Nylon Suture', description: 'Monofilament nylon suture, assorted', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tad0055ksifm3gcb1s1', itemCode: 'SMSC-CHG-001', name: 'Chromic Gut Suture (Misc)', description: 'Absorbable gut suture, 3-0/4-0', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16taf0057ksifvz0zxlu3', itemCode: 'SMSC-GEL-001', name: 'Gelfoam Sponge', description: 'Absorbable gelatin sponge, size 100', unit: 'Pack', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16taj0059ksifogud5fs9', itemCode: 'SMSC-SRG-001', name: 'Surgicel Hemostat', description: 'Oxidised regenerated cellulose, 2x3"', unit: 'Pack', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tam005bksifpar2qzw6', itemCode: 'SMSC-HEM-001', name: 'Hemodent Solution', description: 'Ferric sulfate 20% hemostatic, 30ml', unit: 'Bottle', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tan005dksifnp68dg5y', itemCode: 'SMSC-BIO-001', name: 'Bio-Oss Bone Graft', description: 'Anorganic bovine bone mineral, 0.5g', unit: 'Vial', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tap005fksif24s1r87r', itemCode: 'SMSC-ALO-001', name: 'Allograft Bone Graft', description: 'Freeze-dried bone allograft, 1cc', unit: 'Vial', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tar005hksifyhmtp7qo', itemCode: 'SMSC-SGV-001', name: 'Sterile Surgical Gloves', description: 'Latex surgical gloves, size 7.5, pair', unit: 'Pair', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tau005jksifjun222iu', itemCode: 'SMSC-MSK-001', name: 'Surgical Masks (Misc)', description: 'Fluid-resistant masks, box/50', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16taw005lksifc7shusfv', itemCode: 'SMSC-BIB-001', name: 'Surgical Bibs', description: 'Sterile disposable surgical bibs', unit: 'Pack', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16taz005nksifr9pyjt36', itemCode: 'SMSC-SUT-001', name: 'Suction Tips (Surgical)', description: 'Yankauer suction tips, sterile', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tb2005pksifkop5tgij', itemCode: 'SMSC-ROL-001', name: 'Cotton Rolls (Surg)', description: 'Non-sterile, medium', unit: 'Bag', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tb5005rksifg1qr2ktv', itemCode: 'SMSC-GAU-001', name: 'Gauze 2x2 (Surg)', description: 'Sterile 4-ply gauze sponges', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tb7005tksif5cb21zos', itemCode: 'SMSC-PEL-001', name: 'Cotton Pellets (Surg)', description: 'Cotton pellets, small', unit: 'Bag', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tb9005vksifhv70ccio', itemCode: 'SMSC-ETC-001', name: 'Etchant Gel 37% (Surg)', description: 'Phosphoric acid etchant, syringe', unit: 'Syringe', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tbb005xksifk3cudpb1', itemCode: 'SMSC-BON-001', name: 'Bonding Agent (Surg)', description: 'Universal bonding agent, 5ml', unit: 'Bottle', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tbe005zksif2u3ael1r', itemCode: 'SMSC-RTC-001', name: 'Retraction Cord with Hemostatic', description: 'Knitted cord, epinephrine impregnated', unit: 'Vial', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tbh0061ksifgzqubjt3', itemCode: 'SMSC-ATP-001', name: 'Articulating Paper', description: 'Bite registration paper, horseshoe shape', unit: 'Booklet', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tbj0063ksiffbai2owe', itemCode: 'SMSC-WAX-UT', name: 'Utility Wax', description: 'Dental utility wax, 500g box', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tbl0065ksifx58rho6k', itemCode: 'SMSC-WAX-BX', name: 'Boxing Wax', description: 'Sheet boxing wax, 1lb', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tbn0067ksifxudikbn8', itemCode: 'SMSC-WAX-BT', name: 'Bite Wax', description: 'Bite registration wax, horseshoe shaped', unit: 'Box', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },
  { id: 'cmpd16tbp0069ksif5s95r04f', itemCode: 'SMSC-ACR-001', name: 'Cold Cure Acrylic Resin', description: 'Self-cure acrylic, powder & liquid', unit: 'Kit', categoryCode: 'SURGICAL_MISC', minQuantity: 0, unitCost: 0 },

  // ----- DRUG INVENTORY ITEMS (from CSV) -----
  { id: 'cmpd175zu000132wlan5mgtsc', itemCode: 'MED-RIV-001', name: 'RIVAMOX 500mg Capsules', description: 'Rivamox 500mg, 20 capsules per box. Antibiotic.', unit: 'Box', categoryCode: 'MEDICINES', minQuantity: 5, unitCost: 6500 },
  { id: 'cmpd1760n000332wlkrui2tin', itemCode: 'MED-MET-001', name: 'Metro 400mg Tablets', description: 'Metronidazole 400mg, 10x10 (100 tablets) by Axcel.', unit: 'Box', categoryCode: 'MEDICINES', minQuantity: 5, unitCost: 20000 },
  { id: 'cmpd1760r000532wlho9czb8d', itemCode: 'MED-DOX-001', name: 'Doxy 100mg Tablets', description: 'Doxycycline 100mg, 10x10 (100 tablets).', unit: 'Box', categoryCode: 'MEDICINES', minQuantity: 5, unitCost: 5000 },
  { id: 'cmpd1760u000732wlde4nq1nl', itemCode: 'MED-IBU-001', name: 'Ibuprofen 400mg Tablets', description: 'Ibuprofen 400mg, 10x10 (100 tablets) – Denk.', unit: 'Box', categoryCode: 'MEDICINES', minQuantity: 5, unitCost: 37000 },
  { id: 'cmpd1760y000932wlzbybs1t1', itemCode: 'MED-SNW-001', name: 'Sonatec M Wash', description: 'Sonatec M antiseptic mouthwash, 250ml bottle.', unit: 'Bottle', categoryCode: 'MEDICINES', minQuantity: 10, unitCost: 0 },
  { id: 'cmpd17611000b32wluq08u00a', itemCode: 'MED-COL-001', name: 'Colage', description: 'Colage (dental product – please verify).', unit: 'Each', categoryCode: 'MEDICINES', minQuantity: 10, unitCost: 0 },
  { id: 'cmpd17616000d32wlq17fel0s', itemCode: 'MED-BRS-001', name: 'Toothbrush', description: 'Manual toothbrush, soft bristles.', unit: 'Each', categoryCode: 'MEDICINES', minQuantity: 20, unitCost: 0 },
];

async function seedInventoryItems() {
  console.log('🌱 Starting InventoryItem seed...');

  try {
    // Clear existing items (optional – uncomment if needed)
    // await prisma.inventoryItem.deleteMany();

    for (const item of items) {
      const categoryId = CATEGORY_IDS[item.categoryCode];
      if (!categoryId) {
        console.warn(`⚠️ Missing category ID for ${item.categoryCode}, skipping "${item.name}"`);
        continue;
      }

      await prisma.inventoryItem.create({
        data: {
          id: item.id,               // use exact CSV ID
          itemCode: item.itemCode,
          name: item.name,
          description: item.description,
          unit: item.unit,
          type: 'CONSUMABLE',
          categoryId,
          isActive: true,
          batchTracking: false,
          minQuantity: item.minQuantity,
          unitCost: item.unitCost,
          uom: 'PIECES',             // all CSV entries use PIECES
        },
      });
      console.log(`✅ Created: ${item.name} (${item.itemCode})`);
    }

    const total = await prisma.inventoryItem.count();
    const active = await prisma.inventoryItem.count({ where: { isActive: true } });
    console.log('\n🎉 Seed complete!');
    console.log(`   Total items: ${total}`);
    console.log(`   Active: ${active}`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedInventoryItems();
}

export { seedInventoryItems };