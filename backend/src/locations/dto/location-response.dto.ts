import { LocationType } from '@prisma/client';

export class LocationResponseDto {
  id: string;
  name: string;
  type: LocationType;
  address: string | null;  // Changed from optional to nullable
  phone: string | null;
  email: string | null;
  isActive: boolean;
  isDefault: boolean;
  parentId: string | null;
  path: string;
  level: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  
  // Nested children for tree view
  children?: LocationResponseDto[];
  
  // Parent info for breadcrumbs
  parent?: {
    id: string;
    name: string;
  } | null;
  
  // Stats
  _count?: {
    children: number;
    inventoryStocks: number;
    drugStocks: number;
  };
}