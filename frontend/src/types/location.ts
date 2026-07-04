export enum LocationType {
  MAIN_CLINIC = 'MAIN_CLINIC',
  BRANCH = 'BRANCH',
  STORAGE = 'STORAGE',
  PHARMACY = 'PHARMACY',
  LAB = 'LAB',
  RECEPTION = 'RECEPTION',
  WAREHOUSE = 'WAREHOUSE',
  MOBILE_UNIT = 'MOBILE_UNIT',
  STORE = 'STORE',
  CLINIC = 'CLINIC',
  DISPENSARY = 'DISPENSARY',
}

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  isDefault: boolean;
  parentId?: string;
  path: string;
  level: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  parent?: {
    id: string;
    name: string;
  };
  children?: Location[];
  _count?: {
    children: number;
    inventoryStocks: number;
    drugStocks: number;
  };
}

export interface LocationTreeNode extends Location {
  children: LocationTreeNode[];
  expanded?: boolean;
}