// prisma/seed/procedures.seed.ts
/**
 * Seeds ProcedureCategory and Procedure records
 * - Hierarchical categories with proper parent-child relationships
 * - Procedures with correct pricing models, units, and currencies (UGX/USD)
 * - Idempotent: safe to run multiple times
 * - Independent: no external dependencies required
 */

import { 
  PrismaClient, 
  PricingModel, 
  BillingUnit,
  AppointmentType 
} from '@prisma/client';
import { logSuccess, logError } from './utils';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────
// CATEGORY HIERARCHY DEFINITION
// ─────────────────────────────────────────────────────────────────────

type CategoryDef = {
  name: string;
  code: string;
  description?: string;
  color?: string;
  icon?: string;
  children?: Omit<CategoryDef, 'children'>[];
};

const CATEGORIES: CategoryDef[] = [
  {
    name: 'Consultation',
    code: 'CONS',
    description: 'General patient consultation and assessment',
    color: '#3B82F6',
    icon: 'user-search',
    children: [
      { name: 'General Consultation', code: 'CONS-GEN', description: 'Standard dental consultation' }
    ]
  },
  {
    name: 'Conservative & Endodontics',
    code: 'CONS-ENDO',
    description: 'Fillings, root canals, and tooth preservation',
    color: '#10B981',
    icon: 'tooth',
    children: [
      { name: 'Composite Class 5 & 1 Shallow', code: 'ENDO-COMP-SH', description: 'Shallow composite restoration' },
      { name: 'Composite Class 3,4,1 Deep', code: 'ENDO-COMP-DP', description: 'Deep composite restoration' },
      { name: 'Composite Class 2', code: 'ENDO-COMP-C2', description: 'Class 2 composite restoration' },
      { name: 'Indirect Pulp Capping', code: 'ENDO-IPC', description: 'Pulp protection procedure' },
      { name: 'GIC Filling', code: 'ENDO-GIC', description: 'Glass ionomer cement restoration' },
      { name: 'Composite Veneers', code: 'ENDO-VEN', description: 'Aesthetic composite veneer' },
      { name: 'Root Canal 1 Canal', code: 'ENDO-RC1', description: 'Single canal root canal treatment' },
      { name: 'Root Canal 2 Canals', code: 'ENDO-RC2', description: 'Two canal root canal treatment' },
      { name: 'Root Canal 3-4 Canals', code: 'ENDO-RC34', description: 'Multi-canal root canal treatment' },
      { name: 'Retreatment RCT', code: 'ENDO-RCT-RT', description: 'Root canal retreatment' },
      { name: 'Post and Core Build Up', code: 'ENDO-PC', description: 'Post and core restoration' },
      { name: 'Bleaching', code: 'ENDO-BLEACH', description: 'Teeth whitening procedure' },
      { name: 'X-Ray', code: 'ENDO-XRAY', description: 'Standard dental X-ray' },
      { name: 'X-Ray within RCT', code: 'ENDO-XRAY-RCT', description: 'X-ray during root canal' },
      { name: 'Amalgam Restoration', code: 'ENDO-AMAL', description: 'Amalgam filling' }
    ]
  },
  {
    name: 'Pedodontics',
    code: 'PEDO',
    description: 'Pediatric dental care',
    color: '#F59E0B',
    icon: 'baby',
    children: [
      { name: 'Extraction', code: 'PEDO-EXT', description: 'Pediatric tooth extraction' },
      { name: 'Filling GIC', code: 'PEDO-GIC', description: 'Pediatric GIC filling' },
      { name: 'Pulpotomy', code: 'PEDO-PT', description: 'Pediatric pulpotomy' },
      { name: 'Pulpectomy', code: 'PEDO-PE', description: 'Pediatric pulpectomy' },
      { name: 'Stainless Steel Crown', code: 'PEDO-SSC', description: 'Pediatric stainless steel crown' },
      { name: 'Space Maintainer Band & Loop', code: 'PEDO-SM', description: 'Space maintenance appliance' },
      { name: 'Scaling', code: 'PEDO-SCALE', description: 'Pediatric dental cleaning' },
      { name: 'Fluoride Application', code: 'PEDO-FL', description: 'Preventive fluoride treatment' },
      { name: 'Pit & Fissure Sealant', code: 'PEDO-SEAL', description: 'Preventive sealant application' },
      { name: 'Surgical Exposure Unerupted Teeth', code: 'PEDO-SE', description: 'Surgical exposure for eruption' }
    ]
  },
  {
    name: 'Surgery',
    code: 'SURG',
    description: 'Oral and maxillofacial surgical procedures',
    color: '#EF4444',
    icon: 'scalpel',
    children: [
      { name: 'Extraction Anterior', code: 'SURG-EXT-ANT', description: 'Anterior tooth extraction' },
      { name: 'Extraction Premolar', code: 'SURG-EXT-PREM', description: 'Premolar extraction' },
      { name: 'Extraction Molars', code: 'SURG-EXT-MOL', description: 'Molar extraction' },
      { name: 'Extraction Wisdom Teeth', code: 'SURG-EXT-WIS', description: 'Third molar extraction' },
      { name: 'Surgical Extraction Simple', code: 'SURG-EXT-SIM', description: 'Simple surgical extraction' },
      { name: 'Surgical Extraction Complicated', code: 'SURG-EXT-COMP', description: 'Complex surgical extraction' },
      { name: 'Frenectomy', code: 'SURG-FREN', description: 'Frenum removal procedure' },
      { name: 'Surgical Excision Lesion', code: 'SURG-EXC', description: 'Excision of fibroma, granuloma, etc.' },
      { name: 'Surgical Drainage', code: 'SURG-DRN', description: 'Abscess drainage procedure' },
      { name: 'Eyelet Wiring', code: 'SURG-EYELET', description: 'Intermaxillary wiring' },
      { name: 'IMF (Intermaxillary Fixation)', code: 'SURG-IMF', description: 'Jaw fixation procedure' }
    ]
  },
  {
    name: 'Prosthodontics',
    code: 'PROSTH',
    description: 'Dentures, crowns, bridges, and prosthetic rehabilitation',
    color: '#8B5CF6',
    icon: 'crown',
    children: [
      { name: 'Complete Denture Upper & Lower', code: 'PROSTH-CD-FULL', description: 'Full mouth dentures' },
      { name: 'Complete Denture One Arch', code: 'PROSTH-CD-ARCH', description: 'Single arch denture' },
      { name: 'Partial Denture', code: 'PROSTH-PD', description: 'Removable partial denture' },
      { name: 'Flexible Partial Denture', code: 'PROSTH-FPD', description: 'Flexible partial denture' },
      { name: 'Denture Repair/Addition', code: 'PROSTH-REP', description: 'Denture repair or tooth/clasp addition' },
      { name: 'Denture Rebasing & Relining', code: 'PROSTH-REL', description: 'Denture base adjustment' },
      { name: 'Night Guard', code: 'PROSTH-NG', description: 'Occlusal night guard' },
      { name: 'Fixed Prosthesis Acrylic', code: 'PROSTH-FP-ACR', description: 'Acrylic crown/bridge' },
      { name: 'PFM/Ceramic Crown', code: 'PROSTH-PFM', description: 'Porcelain fused to metal crown' },
      { name: 'Full Zirconia Crown', code: 'PROSTH-ZIR', description: 'Monolithic zirconia crown' },
      { name: 'Veneer Zirconia', code: 'PROSTH-VEN-ZIR', description: 'Zirconia veneer' },
      { name: 'Inlay/Onlay', code: 'PROSTH-INLAY', description: 'Indirect restoration' }
    ]
  },
  {
    name: 'Periodontics',
    code: 'PERIO',
    description: 'Gum disease treatment and periodontal surgery',
    color: '#EC4899',
    icon: 'flower',
    children: [
      { name: 'Full Mouth Scaling Mild', code: 'PERIO-SCALE-M', description: 'Mild scaling and polishing' },
      { name: 'Full Mouth Scaling Moderate', code: 'PERIO-SCALE-MOD', description: 'Moderate scaling and polishing' },
      { name: 'Full Mouth Scaling Severe', code: 'PERIO-SCALE-S', description: 'Severe scaling and polishing' },
      { name: 'Gingivectomy Single Tooth', code: 'PERIO-GING-ST', description: 'Single tooth gum contouring' },
      { name: 'Gingivectomy Full Arch', code: 'PERIO-GING-FA', description: 'Full arch gum contouring' }
    ]
  },
  {
    name: 'Orthodontics',
    code: 'ORTHO',
    description: 'Braces, retainers, and orthodontic appliances',
    color: '#6366F1',
    icon: 'braces',
    children: [
      { name: 'Fixed Ortho One Arch', code: 'ORTHO-FIX-1A', description: 'Fixed braces single arch' },
      { name: 'Fixed Ortho Both Arches', code: 'ORTHO-FIX-2A', description: 'Fixed braces both arches' },
      { name: 'Removable Appliance Jack Screw', code: 'ORTHO-REM-JS', description: 'Removable expansion appliance' },
      { name: 'Fixed Appliance Hyrax', code: 'ORTHO-FIX-HY', description: 'Hyrax expander' },
      { name: 'Removable Retainer Hawley', code: 'ORTHO-RET-HAW', description: 'Hawley retainer' },
      { name: 'Removable Retainer Clear (Essix)', code: 'ORTHO-RET-ESS', description: 'Clear Essix retainer' },
      { name: 'Fixed Retainer', code: 'ORTHO-RET-FIX', description: 'Bonded fixed retainer' },
      { name: 'Habit Breaking Appliance', code: 'ORTHO-HBA', description: 'Appliance for thumb sucking, etc.' },
      { name: 'Ortho Follow Up', code: 'ORTHO-FU', description: 'Orthodontic adjustment visit' },
      { name: 'Re-bonding Bracket/Buccal Tube', code: 'ORTHO-REBOND', description: 'Bracket reattachment' },
      { name: 'Lost Bracket/Buccal Tube', code: 'ORTHO-LOST', description: 'Replacement of lost bracket' },
      { name: 'Functional Appliance', code: 'ORTHO-FUNC', description: 'Growth modification appliance' },
      { name: 'Canine Exposure', code: 'ORTHO-CE', description: 'Surgical exposure for orthodontic traction' }
    ]
  },
  {
    name: 'Implantology',
    code: 'IMPLANT',
    description: 'Dental implants and implant-supported prosthetics',
    color: '#14B8A6',
    icon: 'implant',
    children: [
      { name: 'Single Implant', code: 'IMPL-SINGLE', description: 'Single dental implant placement' },
      { name: 'Single Implant with Bone Graft', code: 'IMPL-BG', description: 'Implant with bone augmentation' },
      { name: 'Implant-Supported Denture One Arch', code: 'IMPL-CD-1A', description: 'Implant-retained denture single arch' },
      { name: 'Implant-Supported Denture Both Arches', code: 'IMPL-CD-2A', description: 'Implant-retained denture full mouth' }
    ]
  }
];

// ─────────────────────────────────────────────────────────────────────
// PROCEDURE PRICING DEFINITION
// Format: { categoryCode, procedureCode, pricingModel, billingUnit, price, currency, duration?, requiresXray?, notes? }
// ─────────────────────────────────────────────────────────────────────

type ProcedurePricing = {
  categoryCode: string;
  procedureCode: string;
  name: string;
  pricingModel: PricingModel;
  billingUnit?: BillingUnit;
  price: number;
  currency: 'UGX' | 'USD';
  cost?: number; // Internal cost (typically 30-40% of price)
  defaultDuration?: number;
  requiresXray?: boolean;
  priceRangeMin?: number;
  priceRangeMax?: number;
  description?: string;
};

const PROCEDURES: ProcedurePricing[] = [
  // ── CONSULTATION ───────────────────────────────────────────────────
  {
    categoryCode: 'CONS',
    procedureCode: 'CONS-GEN',
    name: 'General Consultation',
    pricingModel: 'FIXED',
    price: 15000,
    currency: 'UGX',
    cost: 5000,
    defaultDuration: 30,
    description: 'Standard dental consultation and assessment'
  },

  // ── CONSERVATIVE & ENDODONTICS ─────────────────────────────────────
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-COMP-SH',
    name: 'Composite Class 5 & 1 Shallow',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 50000,
    currency: 'UGX',
    cost: 18000,
    defaultDuration: 45,
    priceRangeMin: 45000,
    priceRangeMax: 60000
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-COMP-DP',
    name: 'Composite Class 3,4,1 Deep',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 80000,
    currency: 'UGX',
    cost: 30000,
    defaultDuration: 60,
    priceRangeMin: 70000,
    priceRangeMax: 100000
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-COMP-C2',
    name: 'Composite Class 2',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 100000,
    currency: 'UGX',
    cost: 40000,
    defaultDuration: 60,
    priceRangeMin: 90000,
    priceRangeMax: 120000
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-IPC',
    name: 'Indirect Pulp Capping',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 100000,
    currency: 'UGX',
    cost: 35000,
    defaultDuration: 45
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-GIC',
    name: 'GIC Filling',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 50000,
    currency: 'UGX',
    cost: 18000,
    defaultDuration: 30
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-VEN',
    name: 'Composite Veneers',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 50000,
    currency: 'UGX',
    cost: 20000,
    defaultDuration: 60
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-RC1',
    name: 'Root Canal 1 Canal',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 200000,
    currency: 'UGX',
    cost: 70000,
    defaultDuration: 90,
    requiresXray: true
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-RC2',
    name: 'Root Canal 2 Canals',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 250000,
    currency: 'UGX',
    cost: 90000,
    defaultDuration: 120,
    requiresXray: true
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-RC34',
    name: 'Root Canal 3-4 Canals',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 300000,
    currency: 'UGX',
    cost: 110000,
    defaultDuration: 150,
    requiresXray: true
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-RCT-RT',
    name: 'Retreatment RCT',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 300000,
    currency: 'UGX',
    cost: 110000,
    defaultDuration: 150,
    requiresXray: true
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-PC',
    name: 'Post and Core Build Up',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 350000,
    currency: 'UGX',
    cost: 130000,
    defaultDuration: 90
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-BLEACH',
    name: 'Bleaching',
    pricingModel: 'FIXED',
    price: 800000,
    currency: 'UGX',
    cost: 300000,
    defaultDuration: 90
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-XRAY',
    name: 'X-Ray',
    pricingModel: 'FIXED',
    price: 25000,
    currency: 'UGX',
    cost: 8000,
    defaultDuration: 10,
    requiresXray: true
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-XRAY-RCT',
    name: 'X-Ray within RCT',
    pricingModel: 'FIXED',
    price: 15000,
    currency: 'UGX',
    cost: 5000,
    defaultDuration: 5,
    requiresXray: true
  },
  {
    categoryCode: 'CONS-ENDO',
    procedureCode: 'ENDO-AMAL',
    name: 'Amalgam Restoration',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 50000,
    currency: 'UGX',
    cost: 18000,
    defaultDuration: 45
  },

  // ── PEDODONTICS ────────────────────────────────────────────────────
  {
    categoryCode: 'PEDO',
    procedureCode: 'PEDO-EXT',
    name: 'Extraction',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 30000,
    currency: 'UGX',
    cost: 10000,
    defaultDuration: 30
  },
  {
    categoryCode: 'PEDO',
    procedureCode: 'PEDO-GIC',
    name: 'Filling GIC',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 35000,
    currency: 'UGX',
    cost: 12000,
    defaultDuration: 30
  },
  {
    categoryCode: 'PEDO',
    procedureCode: 'PEDO-PT',
    name: 'Pulpotomy',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 40000,
    currency: 'UGX',
    cost: 15000,
    defaultDuration: 45
  },
  {
    categoryCode: 'PEDO',
    procedureCode: 'PEDO-PE',
    name: 'Pulpectomy',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 100000,
    currency: 'UGX',
    cost: 35000,
    defaultDuration: 60
  },
  {
    categoryCode: 'PEDO',
    procedureCode: 'PEDO-SSC',
    name: 'Stainless Steel Crown',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 200000,
    currency: 'UGX',
    cost: 75000,
    defaultDuration: 60
  },
  {
    categoryCode: 'PEDO',
    procedureCode: 'PEDO-SM',
    name: 'Space Maintainer Band & Loop',
    pricingModel: 'FIXED',
    price: 300000,
    currency: 'UGX',
    cost: 110000,
    defaultDuration: 45
  },
  {
    categoryCode: 'PEDO',
    procedureCode: 'PEDO-SCALE',
    name: 'Scaling',
    pricingModel: 'FIXED',
    price: 40000,
    currency: 'UGX',
    cost: 15000,
    defaultDuration: 30
  },
  {
    categoryCode: 'PEDO',
    procedureCode: 'PEDO-FL',
    name: 'Fluoride Application',
    pricingModel: 'FIXED',
    price: 50000,
    currency: 'UGX',
    cost: 18000,
    defaultDuration: 20
  },
  {
    categoryCode: 'PEDO',
    procedureCode: 'PEDO-SEAL',
    name: 'Pit & Fissure Sealant',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 50000,
    currency: 'UGX',
    cost: 18000,
    defaultDuration: 20
  },
  {
    categoryCode: 'PEDO',
    procedureCode: 'PEDO-SE',
    name: 'Surgical Exposure Unerupted Teeth',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 150000,
    currency: 'UGX',
    cost: 55000,
    defaultDuration: 60,
    requiresXray: true
  },

  // ── SURGERY ────────────────────────────────────────────────────────
  {
    categoryCode: 'SURG',
    procedureCode: 'SURG-EXT-ANT',
    name: 'Extraction Anterior',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 50000,
    currency: 'UGX',
    cost: 18000,
    defaultDuration: 30
  },
  {
    categoryCode: 'SURG',
    procedureCode: 'SURG-EXT-PREM',
    name: 'Extraction Premolar',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 60000,
    currency: 'UGX',
    cost: 22000,
    defaultDuration: 30
  },
  {
    categoryCode: 'SURG',
    procedureCode: 'SURG-EXT-MOL',
    name: 'Extraction Molars',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 70000,
    currency: 'UGX',
    cost: 26000,
    defaultDuration: 45
  },
  {
    categoryCode: 'SURG',
    procedureCode: 'SURG-EXT-WIS',
    name: 'Extraction Wisdom Teeth',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 80000,
    currency: 'UGX',
    cost: 30000,
    defaultDuration: 45
  },
  {
    categoryCode: 'SURG',
    procedureCode: 'SURG-EXT-SIM',
    name: 'Surgical Extraction Simple',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 100000,
    currency: 'UGX',
    cost: 38000,
    defaultDuration: 45
  },
  {
    categoryCode: 'SURG',
    procedureCode: 'SURG-EXT-COMP',
    name: 'Surgical Extraction Complicated',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 150000,
    currency: 'UGX',
    cost: 55000,
    defaultDuration: 60
  },
  {
    categoryCode: 'SURG',
    procedureCode: 'SURG-FREN',
    name: 'Frenectomy',
    pricingModel: 'FIXED',
    price: 150000,
    currency: 'UGX',
    cost: 55000,
    defaultDuration: 30
  },
  {
    categoryCode: 'SURG',
    procedureCode: 'SURG-EXC',
    name: 'Surgical Excision Lesion',
    pricingModel: 'FIXED',
    price: 150000,
    currency: 'UGX',
    cost: 55000,
    defaultDuration: 45
  },
  {
    categoryCode: 'SURG',
    procedureCode: 'SURG-DRN',
    name: 'Surgical Drainage',
    pricingModel: 'FIXED',
    price: 150000,
    currency: 'UGX',
    cost: 55000,
    defaultDuration: 30
  },
  {
    categoryCode: 'SURG',
    procedureCode: 'SURG-EYELET',
    name: 'Eyelet Wiring',
    pricingModel: 'FIXED',
    price: 100000,
    currency: 'UGX',
    cost: 38000,
    defaultDuration: 45
  },
  {
    categoryCode: 'SURG',
    procedureCode: 'SURG-IMF',
    name: 'IMF (Intermaxillary Fixation)',
    pricingModel: 'FIXED',
    price: 1000000,
    currency: 'UGX',
    cost: 380000,
    defaultDuration: 120
  },

  // ── PROSTHODONTICS ─────────────────────────────────────────────────
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-CD-FULL',
    name: 'Complete Denture Upper & Lower',
    pricingModel: 'FIXED',
    price: 3000000,
    currency: 'UGX',
    cost: 1100000,
    defaultDuration: 180
  },
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-CD-ARCH',
    name: 'Complete Denture One Arch',
    pricingModel: 'PER_ARCH',
    billingUnit: 'ARCH',
    price: 1500000,
    currency: 'UGX',
    cost: 550000,
    defaultDuration: 120
  },
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-PD',
    name: 'Partial Denture',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 100000,
    currency: 'UGX',
    cost: 38000,
    defaultDuration: 90,
    priceRangeMin: 200000, // Minimum for single tooth
    description: '100,000 per tooth; minimum 200,000 for single tooth'
  },
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-FPD',
    name: 'Flexible Partial Denture',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 160000,
    currency: 'UGX',
    cost: 60000,
    defaultDuration: 90,
    priceRangeMin: 300000,
    description: '160,000 per tooth; minimum 300,000 for single tooth'
  },
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-REP',
    name: 'Denture Repair/Addition',
    pricingModel: 'FIXED',
    price: 150000,
    currency: 'UGX',
    cost: 55000,
    defaultDuration: 60
  },
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-REL',
    name: 'Denture Rebasing & Relining',
    pricingModel: 'FIXED',
    price: 120000,
    currency: 'UGX',
    cost: 45000,
    defaultDuration: 60
  },
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-NG',
    name: 'Night Guard',
    pricingModel: 'FIXED',
    price: 210000,
    currency: 'UGX',
    cost: 78000,
    defaultDuration: 45
  },
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-FP-ACR',
    name: 'Fixed Prosthesis Acrylic',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 150000,
    currency: 'UGX',
    cost: 55000,
    defaultDuration: 90
  },
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-PFM',
    name: 'PFM/Ceramic Crown',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 300000,
    currency: 'UGX',
    cost: 110000,
    defaultDuration: 120
  },
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-ZIR',
    name: 'Full Zirconia Crown',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 600000,
    currency: 'UGX',
    cost: 220000,
    defaultDuration: 120
  },
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-VEN-ZIR',
    name: 'Veneer Zirconia',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 600000,
    currency: 'UGX',
    cost: 220000,
    defaultDuration: 90
  },
  {
    categoryCode: 'PROSTH',
    procedureCode: 'PROSTH-INLAY',
    name: 'Inlay/Onlay',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 600000,
    currency: 'UGX',
    cost: 220000,
    defaultDuration: 120
  },

  // ── PERIODONTICS ───────────────────────────────────────────────────
  {
    categoryCode: 'PERIO',
    procedureCode: 'PERIO-SCALE-M',
    name: 'Full Mouth Scaling Mild',
    pricingModel: 'FIXED',
    price: 80000,
    currency: 'UGX',
    cost: 30000,
    defaultDuration: 45
  },
  {
    categoryCode: 'PERIO',
    procedureCode: 'PERIO-SCALE-MOD',
    name: 'Full Mouth Scaling Moderate',
    pricingModel: 'FIXED',
    price: 100000,
    currency: 'UGX',
    cost: 38000,
    defaultDuration: 60
  },
  {
    categoryCode: 'PERIO',
    procedureCode: 'PERIO-SCALE-S',
    name: 'Full Mouth Scaling Severe',
    pricingModel: 'FIXED',
    price: 120000,
    currency: 'UGX',
    cost: 45000,
    defaultDuration: 90
  },
  {
    categoryCode: 'PERIO',
    procedureCode: 'PERIO-GING-ST',
    name: 'Gingivectomy Single Tooth',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 150000,
    currency: 'UGX',
    cost: 55000,
    defaultDuration: 45
  },
  {
    categoryCode: 'PERIO',
    procedureCode: 'PERIO-GING-FA',
    name: 'Gingivectomy Full Arch',
    pricingModel: 'PER_ARCH',
    billingUnit: 'ARCH',
    price: 300000,
    currency: 'UGX',
    cost: 110000,
    defaultDuration: 90
  },

  // ── ORTHODONTICS ───────────────────────────────────────────────────
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-FIX-1A',
    name: 'Fixed Ortho One Arch',
    pricingModel: 'PER_ARCH',
    billingUnit: 'ARCH',
    price: 900000,
    currency: 'UGX',
    cost: 330000,
    defaultDuration: 120
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-FIX-2A',
    name: 'Fixed Ortho Both Arches',
    pricingModel: 'FIXED',
    price: 1800000,
    currency: 'UGX',
    cost: 660000,
    defaultDuration: 180
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-REM-JS',
    name: 'Removable Appliance Jack Screw',
    pricingModel: 'FIXED',
    price: 300000,
    currency: 'UGX',
    cost: 110000,
    defaultDuration: 60
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-FIX-HY',
    name: 'Fixed Appliance Hyrax',
    pricingModel: 'FIXED',
    price: 500000,
    currency: 'UGX',
    cost: 185000,
    defaultDuration: 90
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-RET-HAW',
    name: 'Removable Retainer Hawley',
    pricingModel: 'PER_ARCH',
    billingUnit: 'ARCH',
    price: 300000,
    currency: 'UGX',
    cost: 110000,
    defaultDuration: 45
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-RET-ESS',
    name: 'Removable Retainer Clear (Essix)',
    pricingModel: 'PER_ARCH',
    billingUnit: 'ARCH',
    price: 150000,
    currency: 'UGX',
    cost: 55000,
    defaultDuration: 30
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-RET-FIX',
    name: 'Fixed Retainer',
    pricingModel: 'PER_ARCH',
    billingUnit: 'ARCH',
    price: 150000,
    currency: 'UGX',
    cost: 55000,
    defaultDuration: 45
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-HBA',
    name: 'Habit Breaking Appliance',
    pricingModel: 'FIXED',
    price: 300000,
    currency: 'UGX',
    cost: 110000,
    defaultDuration: 60
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-FU',
    name: 'Ortho Follow Up',
    pricingModel: 'PER_ARCH',
    billingUnit: 'ARCH',
    price: 40000,
    currency: 'UGX',
    cost: 15000,
    defaultDuration: 30
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-REBOND',
    name: 'Re-bonding Bracket/Buccal Tube',
    pricingModel: 'PER_BRACKET',
    billingUnit: 'BRACKET',
    price: 20000,
    currency: 'UGX',
    cost: 7500,
    defaultDuration: 20
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-LOST',
    name: 'Lost Bracket/Buccal Tube',
    pricingModel: 'PER_BRACKET',
    billingUnit: 'BRACKET',
    price: 35000,
    currency: 'UGX',
    cost: 13000,
    defaultDuration: 30
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-FUNC',
    name: 'Functional Appliance',
    pricingModel: 'FIXED',
    price: 300000,
    currency: 'UGX',
    cost: 110000,
    defaultDuration: 60
  },
  {
    categoryCode: 'ORTHO',
    procedureCode: 'ORTHO-CE',
    name: 'Canine Exposure',
    pricingModel: 'PER_TOOTH',
    billingUnit: 'TOOTH',
    price: 150000,
    currency: 'UGX',
    cost: 55000,
    defaultDuration: 60
  },

  // ── IMPLANTOLOGY (USD PRICING) ─────────────────────────────────────
  {
    categoryCode: 'IMPLANT',
    procedureCode: 'IMPL-SINGLE',
    name: 'Single Implant',
    pricingModel: 'FIXED',
    price: 800,
    currency: 'USD',
    cost: 300,
    defaultDuration: 120,
    description: 'Single dental implant placement (USD)'
  },
  {
    categoryCode: 'IMPLANT',
    procedureCode: 'IMPL-BG',
    name: 'Single Implant with Bone Graft',
    pricingModel: 'FIXED',
    price: 1000,
    currency: 'USD',
    cost: 380,
    defaultDuration: 150,
    description: 'Implant with bone augmentation (USD)'
  },
  {
    categoryCode: 'IMPLANT',
    procedureCode: 'IMPL-CD-1A',
    name: 'Implant-Supported Denture One Arch',
    pricingModel: 'PER_ARCH',
    billingUnit: 'ARCH',
    price: 5000,
    currency: 'USD',
    cost: 1900,
    defaultDuration: 240,
    description: 'Implant-retained denture single arch (USD)'
  },
  {
    categoryCode: 'IMPLANT',
    procedureCode: 'IMPL-CD-2A',
    name: 'Implant-Supported Denture Both Arches',
    pricingModel: 'FIXED',
    price: 10000,
    currency: 'USD',
    cost: 3800,
    defaultDuration: 360,
    description: 'Implant-retained denture full mouth (USD)'
  }
];

// ─────────────────────────────────────────────────────────────────────
// SEED FUNCTIONS
// ─────────────────────────────────────────────────────────────────────

/**
 * Seed all procedure categories with hierarchical relationships
 */
async function seedCategories(): Promise<Map<string, string>> {
  console.log('🔄 Seeding Procedure Categories...');
  
  const categoryMap = new Map<string, string>(); // code -> id

  for (const cat of CATEGORIES) {
    // Upsert root category
    const rootCat = await prisma.procedureCategory.upsert({
      where: { code: cat.code },
      update: {
        name: cat.name,
        description: cat.description,
        color: cat.color,
        icon: cat.icon,
        isActive: true,
      },
      create: {
        name: cat.name,
        code: cat.code,
        description: cat.description,
        color: cat.color,
        icon: cat.icon,
        isActive: true,
        sortOrder: 0,
      },
    });
    
    categoryMap.set(cat.code, rootCat.id);

    // Process children if any
    if (cat.children) {
      for (let i = 0; i < cat.children.length; i++) {
        const child = cat.children[i];
        const childCat = await prisma.procedureCategory.upsert({
          where: { code: child.code },
          update: {
            name: child.name,
            description: child.description,
            parentId: rootCat.id,
            isActive: true,
          },
          create: {
            name: child.name,
            code: child.code,
            description: child.description,
            parentId: rootCat.id,
            isActive: true,
            sortOrder: i,
          },
        });
        categoryMap.set(child.code, childCat.id);
      }
    }
  }

  const count = await prisma.procedureCategory.count();
  logSuccess('ProcedureCategory', count);
  
  return categoryMap;
}

/**
 * Seed procedures linked to categories with proper pricing
 */
async function seedProcedures(categoryMap: Map<string, string>): Promise<void> {
  console.log('🔄 Seeding Procedures...');

  for (const proc of PROCEDURES) {
    const categoryId = categoryMap.get(proc.categoryCode);
    
    if (!categoryId) {
      console.warn(`⚠️  Category not found for code: ${proc.categoryCode}, skipping ${proc.procedureCode}`);
      continue;
    }

    // Upsert procedure
    await prisma.procedure.upsert({
      where: { code: proc.procedureCode },
      update: {
        name: proc.name,
        categoryId,
        description: proc.description,
        baseCost: proc.cost ?? Math.round(proc.price * 0.35),
        basePrice: proc.price,
        pricingModel: proc.pricingModel,
        billingUnit: proc.billingUnit ?? null,
        currency: proc.currency,
        priceRangeMin: proc.priceRangeMin ?? null,
        priceRangeMax: proc.priceRangeMax ?? null,
        defaultDuration: proc.defaultDuration ?? 30,
        requiresXray: proc.requiresXray ?? false,
        isActive: true,
      },
      create: {
        code: proc.procedureCode,
        name: proc.name,
        categoryId,
        description: proc.description,
        baseCost: proc.cost ?? Math.round(proc.price * 0.35),
        basePrice: proc.price,
        pricingModel: proc.pricingModel,
        billingUnit: proc.billingUnit ?? null,
        currency: proc.currency,
        priceRangeMin: proc.priceRangeMin ?? null,
        priceRangeMax: proc.priceRangeMax ?? null,
        defaultDuration: proc.defaultDuration ?? 30,
        requiresXray: proc.requiresXray ?? false,
        isActive: true,
      },
    });
  }

  const count = await prisma.procedure.count();
  logSuccess('Procedure', count);
}

/**
 * Main seed function - runs categories then procedures
 */
async function seedProceduresData() {
  try {
    console.log('🦷 Starting Procedure Categories & Procedures seed...');
    
    const categoryMap = await seedCategories();
    await seedProcedures(categoryMap);
    
    console.log('✅ Procedure seeding completed successfully!');
    
    // Print summary
    const categories = await prisma.procedureCategory.findMany({
      select: { name: true, code: true, _count: { select: { procedures: true } } }
    });
    
    console.log('\n📊 Seed Summary:');
    for (const cat of categories) {
      console.log(`  • ${cat.name} (${cat.code}): ${cat._count.procedures} procedures`);
    }
    
  } catch (error: any) {
    logError('Procedures', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────
// EXECUTION
// ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  seedProceduresData()
    .catch((e) => {
      console.error('❌ Seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedProceduresData, seedCategories, seedProcedures };