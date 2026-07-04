export interface InventoryCategory {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  parent?: Pick<InventoryCategory, 'id' | 'name' | 'code'> | null;
  children?: InventoryCategory[];
  _count?: {
    inventoryItems: number;
  };
}

export interface InventoryItem {
  id: string;
  itemCode: string;
  name: string;
  categoryId: string;
  category: InventoryCategory;
  // ... other fields
}