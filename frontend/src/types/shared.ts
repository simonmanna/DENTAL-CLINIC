// Generated TypeScript types from Prisma enums

// ✅ Enum works as both type and value
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  DENTIST = 'DENTIST',
  NURSE = 'NURSE',
  RECEPTIONIST = 'RECEPTIONIST',
  PHARMACIST = 'PHARMACIST',
  LAB_TECHNICIAN = 'LAB_TECHNICIAN',
}

export type Gender =
  | "MALE"
  | "FEMALE"
  | "OTHER";


export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "RESCHEDULED"
  | "DRAFT";

export type AppointmentType =
  | "CONSULTATION"
  | "CLEANING"
  | "FILLING"
  | "EXTRACTION"
  | "ROOT_CANAL"
  | "ORTHODONTIC"
  | "CROWN"
  | "BRIDGE"
  | "IMPLANT"
  | "WHITENING"
  | "EMERGENCY"
  | "FOLLOW_UP"
  | "X_RAY"
  | "PEDIATRIC"
  | "OTHER";

export type ToothStatus =
  | "HEALTHY"
  | "DECAYED"
  | "FILLED"
  | "EXTRACTED"
  | "CROWNED"
  | "MISSING_CONGENITAL"
  | "IMPLANT"
  | "ROOT_CANAL_TREATED"
  | "BRIDGE_PONTIC"
  | "BRIDGE_ABUTMENT"
  | "FRACTURED"
  | "WATCH"
  | "UNERUPTED"
  | "IMPACTED"
  | "VENEER"
  | "SEALANT";

export type ToothSurface =
  | "FACIAL"
  | "LINGUAL"
  | "PALATAL"
  | "MESIAL"
  | "DISTAL"
  | "OCCLUSAL"
  | "INCISAL"
  | "BUCCAL"
  | "LABIAL";

export type TreatmentStatus =
  | "PENDING"
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ON_HOLD"
  | "CANCELLED";

export type InvoiceStatus =
  | "DRAFT"
  | "ISSUED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentMethod =
  | "CASH"
  | "VISA_CARD"
  | "MASTERCARD"
  | "MTN_MOBILE_MONEY"
  | "AIRTEL_MONEY"
  | "INSURANCE"
  | "BANK_TRANSFER"
  | "CHEQUE"
  | "CREDIT_NOTE";

export type PaymentType =
  | "INVOICE_RECEIPT"
  | "PURCHASE_ORDER"
  | "EXPENSE"
  | "OTHER";

export type PaymentStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED"
  | "OPEN"
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "WRITTEN_OFF"
  | "INVOICED";

export type PrescriptionStatus =
  | "ACTIVE"
  | "DISPENSED"
  | "EXPIRED"
  | "CANCELLED";

export type ImagingType =
  | "PERIAPICAL"
  | "BITEWING"
  | "PANORAMIC"
  | "CEPHALOMETRIC"
  | "CBCT"
  | "PHOTO_INTRAORAL"
  | "PHOTO_EXTRAORAL"
  | "OTHER";

export type StockTransactionType =
  | "PURCHASE"
  | "USAGE"
  | "ADJUSTMENT"
  | "RETURN"
  | "EXPIRED"
  | "DAMAGED"
  | "TRANSFER";

export type InsuranceStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "PENDING"
  | "REJECTED";

export type ExpenseCategory =
  | "UTILITIES"
  | "SALARIES"
  | "SUPPLIES"
  | "EQUIPMENT"
  | "MAINTENANCE"
  | "RENT"
  | "MARKETING"
  | "INSURANCE"
  | "LEGAL"
  | "TRANSPORT"
  | "COMMUNICATION"
  | "OTHER";

export type ExpenseStatus =
  | "PENDING"
  | "APPROVED"
  | "PAID"
  | "REJECTED"
  | "CANCELLED";

export type LocationType =
  | "MAIN_CLINIC"
  | "BRANCH"
  | "STORAGE"
  | "PHARMACY"
  | "LAB"
  | "RECEPTION"
  | "WAREHOUSE"
  | "MOBILE_UNIT"
  | "STORE"
  | "CLINIC"
  | "DISPENSARY";

export type StockMovementType =
  | "TRANSFER"
  | "RECEIPT"
  | "ISSUE"
  | "ADJUSTMENT"
  | "RETURN";

export type VisitStatus =
  | "ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type SaleType =
  | "OTC"
  | "PRESCRIPTION"
  | "WALK_IN";

export type PharmacySaleStatus =
  | "PENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED"
  | "INVOICED";

export type LedgerEntryType =
  | "PROCEDURE"
  | "DRUG"
  | "CONSULTATION"
  | "SERVICE"
  | "LAB"
  | "IMAGING"
  | "OTHER"
  | "TREATMENT_PROCEDURE"
  | "TREATMENT_PROCEDURE_SESSION"
  | "PHARMACY_SALE";

export type LedgerEntryStatus =
  | "PENDING"
  | "INVOICED"
  | "VOID";

export type PurchaseOrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "PARTIALLY_RECEIVED"
  | "FULLY_RECEIVED"
  | "CANCELLED"
  | "RECEIVED";

export type PaymentTerms =
  | "CASH_ON_DELIVERY"
  | "NET_7"
  | "NET_14"
  | "NET_30"
  | "NET_60"
  | "CREDIT";

export type DeliveryStatus =
  | "PENDING"
  | "PARTIAL"
  | "COMPLETE"
  | "RETURNED";

export type StockAdjustmentReason =
  | "CYCLE_COUNT"
  | "DAMAGED"
  | "EXPIRED"
  | "THEFT"
  | "RETURNED_TO_SUPPLIER"
  | "FOUND"
  | "INITIAL_COUNT"
  | "OTHER";

export type WasteCategory =
  | "EXPIRED"
  | "DAMAGED"
  | "CONTAMINATED"
  | "SPILLAGE"
  | "BREAKAGE"
  | "OTHER";

export type StockLedgerType =
  | "PURCHASE_RECEIPT"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "WASTE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "USAGE"
  | "SALE"
  | "RETURN_IN"
  | "RETURN_TO_SUPPLIER"
  | "OPENING_BALANCE"
  | "EXPIRY_WRITE_OFF"
  | "STOCK_OUT";

export type SessionType =
  | "SINGLE"
  | "MULTI";

export type BillingType =
  | "PAY_FULL"
  | "PAY_PARTIALLY";

export type SessionStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED"
  | "VOIDED";

export type SessionLedgerStatus =
  | "PENDING"
  | "INVOICED"
  | "VOID";

export type PricingUnit =
  | "FIXED"
  | "PER_TOOTH"
  | "PER_ARCH"
  | "PER_BRACKET"
  | "PER_UNIT";

export type InstallmentStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "DEFAULTED"
  | "CANCELLED";

export type UnitOfMeasure =
  | "PIECES"
  | "BOX"
  | "PACK"
  | "BOTTLE"
  | "VIAL"
  | "AMPULE"
  | "TABLET"
  | "CAPSULE"
  | "STRIP"
  | "TUBE"
  | "SYRINGE"
  | "GLOVES_PAIR"
  | "ROLL"
  | "ML"
  | "LITER"
  | "MG"
  | "G"
  | "KG"
  | "INCH"
  | "MM"
  | "SET"
  | "KIT";

export type AccountType =
  | "CASH"
  | "BANK"
  | "MOBILE_MONEY"
  | "PETTY_CASH";

export type AccountCurrency =
  | "UGX"
  | "USD"
  | "EUR"
  | "GBP"
  | "KES";

export type CashFlowDirection =
  | "IN"
  | "OUT";

export type CashFlowSource =
  | "RECEIPT"
  | "EXPENSE_PAYMENT"
  | "PURCHASE_PAYMENT"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "OPENING_BALANCE"
  | "ADJUSTMENT";

export type AccountPeriodStatus =
  | "OPEN"
  | "CLOSED";

export type PricingModel =
  | "FIXED"
  | "PER_TOOTH"
  | "PER_ARCH"
  | "PER_SESSION"
  | "PER_BRACKET"
  | "PER_UNIT";

export type BillingUnit =
  | "TOOTH"
  | "ARCH"
  | "SESSION"
  | "BRACKET"
  | "UNIT";

export type BillingServiceCategory =
  | "CONSULTATION"
  | "PROCEDURE"
  | "DIAGNOSTIC"
  | "MEDICATION"
  | "THERAPY"
  | "SURGICAL"
  | "PREVENTIVE"
  | "ADMINISTRATIVE"
  | "OTHER";

export type AssetStatus =
  | "ACTIVE"
  | "IDLE"
  | "UNDER_MAINTENANCE"
  | "DISPOSED"
  | "LOST"
  | "LEASED";

export type AssetCondition =
  | "EXCELLENT"
  | "GOOD"
  | "FAIR"
  | "POOR"
  | "SCRAP";

export type AssetCategory =
  | "DENTAL_EQUIPMENT"
  | "IMAGING_EQUIPMENT"
  | "STERILIZATION"
  | "LABORATORY"
  | "OFFICE_EQUIPMENT"
  | "FURNITURE"
  | "VEHICLES"
  | "BUILDING"
  | "IT_INFRASTRUCTURE"
  | "MEDICAL_INSTRUMENTS"
  | "OTHER";

export type DepreciationMethod =
  | "STRAIGHT_LINE"
  | "DECLINING_BALANCE"
  | "NONE";

export type MaintenanceType =
  | "PREVENTIVE"
  | "CORRECTIVE"
  | "CALIBRATION"
  | "INSPECTION"
  | "OTHER";

export type MaintenanceStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "OVERDUE";

export type AssetMovementType =
  | "INITIAL_PLACEMENT"
  | "TRANSFER"
  | "LOAN"
  | "RETURN";

export type DisposalMethod =
  | "SOLD"
  | "SCRAPPED"
  | "DONATED"
  | "WRITTEN_OFF"
  | "RETURNED_TO_SUPPLIER"
  | "STOLEN_LOST";

export type ChartEntryType =
  | "CONDITION"
  | "EXISTING"
  | "PLANNED"
  | "COMPLETED";

export type ChartEntryStatus =
  | "ACTIVE"
  | "SUPERSEDED"
  | "VOIDED";