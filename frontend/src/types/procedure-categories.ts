export interface ProcedureCategory {
  id: string;
  name: string;
  code?: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string | null;
  parent?: {
    id: string;
    name: string;
  };
  children?: ProcedureCategory[];
  isActive: boolean;
  sortOrder: number;
  /** GL revenue account default for procedures in this category (LedgerAccount.id). */
  revenueAccountId?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    procedures: number;
    children: number;
  };
}

export interface CreateCategoryForm {
  name: string;
  code?: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  revenueAccountId?: string | null;
}

export interface CategoryHierarchy extends ProcedureCategory {
  children: ProcedureCategory[];
}