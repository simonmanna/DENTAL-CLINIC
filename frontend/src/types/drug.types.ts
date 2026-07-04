// ─── Enums (mirror Prisma) ────────────────────────────────────────────────────

export const UOM_OPTIONS = [
  { value: 'PIECES',      label: 'Pieces (pcs)' },
  { value: 'BOX',         label: 'Box' },
  { value: 'PACK',        label: 'Pack' },
  { value: 'BOTTLE',      label: 'Bottle' },
  { value: 'VIAL',        label: 'Vial' },
  { value: 'AMPULE',      label: 'Ampule' },
  { value: 'TABLET',      label: 'Tablet' },
  { value: 'CAPSULE',     label: 'Capsule' },
  { value: 'STRIP',       label: 'Strip' },
  { value: 'TUBE',        label: 'Tube' },
  { value: 'SYRINGE',     label: 'Syringe' },
  { value: 'GLOVES_PAIR', label: 'Gloves (pair)' },
  { value: 'ROLL',        label: 'Roll' },
  { value: 'ML',          label: 'Milliliters (ml)' },
  { value: 'LITER',       label: 'Liters (l)' },
  { value: 'MG',          label: 'Milligrams (mg)' },
  { value: 'G',           label: 'Grams (g)' },
  { value: 'KG',          label: 'Kilograms (kg)' },
  { value: 'INCH',        label: 'Inches' },
  { value: 'MM',          label: 'Millimeters (mm)' },
  { value: 'SET',         label: 'Set' },
  { value: 'KIT',         label: 'Kit' },
] as const;

export type UnitOfMeasure = (typeof UOM_OPTIONS)[number]['value'];

export const DRUG_FORMS = [
  'Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Infusion',
  'Cream', 'Ointment', 'Gel', 'Drops', 'Inhaler', 'Suppository',
  'Patch', 'Powder', 'Solution', 'Lotion', 'Spray', 'Other',
] as const;

// ─── API Response Types ───────────────────────────────────────────────────────

export interface DrugCategory {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  icon: string | null;
  parentId?: string | null;
}

export interface DrugInventoryItem {
  id: string;
  name: string;
  itemCode: string;
  quantity: number;
}

export interface DrugCount {
  prescriptionItems: number;
  saleItems: number;
}

export interface Drug {
  id: string;
  name: string;
  genericName: string | null;
  categoryId: string | null;
  category: DrugCategory | null;
  form: string | null;
  strength: string | null;
  manufacturer: string | null;
  unit: string;
  uom: UnitOfMeasure;
  unitPrice: string | number; // Decimal comes as string from Prisma
  sellPrice: string | number;
  isActive: boolean;
  requiresPrescription: boolean;
  inventoryItemId?: string | null;
  inventoryItem?: {
    id: string;
    name: string;
    itemCode: string;
    quantity: number;
  } | null;
  _count?: {
    prescriptionItems: number;
    saleItems: number;
  };
  createdAt: string;
  updatedAt: string;
}

// ─── Form Types ───────────────────────────────────────────────────────────────

export interface DrugFormValues {
  name: string;
  genericName: string;
  categoryId: string;
  form: string;
  strength: string;
  manufacturer: string;
  unit: string;
  uom: UnitOfMeasure;
  unitPrice: number;
  sellPrice: number;
  isActive: boolean;
  requiresPrescription: boolean;
  inventoryItemId: string;
}

// ─── Query / Pagination ────────────────────────────────────────────────────────

export interface DrugQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  uom?: UnitOfMeasure;
  isActive?: boolean;
  requiresPrescription?: boolean;
  sortBy?: 'name' | 'createdAt' | 'sellPrice' | 'unitPrice';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedDrugs {
  data: Drug[];
  meta: PaginationMeta;
}

export interface DrugStats {
  total: number;
  active: number;
  inactive: number;
  requiresPrescription: number;
  overTheCounter: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const formatPrice = (price: string | number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 })
    .format(Number(price));

export const getDrugDisplayName = (drug: Drug): string =>
  drug.genericName ? `${drug.name} (${drug.genericName})` : drug.name;
