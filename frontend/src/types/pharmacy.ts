// src/types/pharmacy.ts

export enum PharmacySaleStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  INVOICED = 'INVOICED',
}

export enum SaleType {
  WALK_IN = "WALK_IN",
  PRESCRIPTION = "PRESCRIPTION",

}