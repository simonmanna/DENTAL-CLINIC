-- ─────────────────────────────────────────────────────────────────────────────
-- CONSOLIDATED BASELINE — the whole schema in one migration.
--
-- Why this replaces the previous history:
--
-- The folders in this directory and the rows in the database's
-- `_prisma_migrations` table had no migration in common. The database had been
-- built from an older lineage (20260517114212_init, the billing-lifecycle
-- refactor, the expense-status refactor and others) whose folders were no
-- longer in the repository, while the repository carried folders that had
-- never been applied to it. `prisma migrate deploy` could not run, and
-- `prisma migrate status` reported a divergence with "the last common
-- migration is: null". Replaying history was already fiction, so it was
-- replaced with a baseline that is generated from schema.prisma and is
-- therefore guaranteed to match it.
--
-- This file is MACHINE-GENERATED from schema.prisma:
--
--     npx prisma migrate diff --from-empty \
--       --to-schema-datamodel prisma/schema.prisma --script
--
-- Do not hand-edit it. Everything Prisma cannot express in schema.prisma —
-- the document-number function, partial unique indexes, CHECK constraints —
-- lives in the migration that follows this one and IS maintained by hand.
--
-- Applying to an EXISTING database: do not run this. Bring the database level
-- with schema.prisma, then record the baseline without executing it:
--
--     npx prisma migrate resolve --applied 20261005120000_baseline_schema
--     npx prisma migrate resolve --applied 20261005120100_sql_objects_and_constraints
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('UGX', 'USD');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('ACTIVE', 'VOID');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'DENTIST', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED', 'DRAFT');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('CONSULTATION', 'CLEANING', 'FILLING', 'EXTRACTION', 'ROOT_CANAL', 'ORTHODONTIC', 'CROWN', 'BRIDGE', 'IMPLANT', 'WHITENING', 'EMERGENCY', 'FOLLOW_UP', 'X_RAY', 'PEDIATRIC', 'OTHER');

-- CreateEnum
CREATE TYPE "ToothSurface" AS ENUM ('FACIAL', 'LINGUAL', 'PALATAL', 'MESIAL', 'DISTAL', 'OCCLUSAL', 'INCISAL', 'BUCCAL', 'LABIAL');

-- CreateEnum
CREATE TYPE "TreatmentStatus" AS ENUM ('PENDING', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED', 'REFERRED', 'DELETED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'VISA_CARD', 'MASTERCARD', 'MTN_MOBILE_MONEY', 'AIRTEL_MONEY', 'INSURANCE', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_NOTE', 'CREDIT');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('INVOICE_RECEIPT', 'PURCHASE_ORDER', 'EXPENSE', 'CREDIT_NOTE_APPLICATION', 'CREDIT_NOTE_REVERSAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "BalanceStatus" AS ENUM ('OPEN', 'INVOICED', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ACTIVE', 'DISPENSED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImagingType" AS ENUM ('PERIAPICAL', 'BITEWING', 'PANORAMIC', 'CEPHALOMETRIC', 'CBCT', 'PHOTO_INTRAORAL', 'PHOTO_EXTRAORAL', 'OTHER');

-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('PURCHASE', 'USAGE', 'ADJUSTMENT', 'RETURN', 'EXPIRED', 'DAMAGED', 'TRANSFER');

-- CreateEnum
CREATE TYPE "InsuranceStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'CANCELLED', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "ExpensePaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('MAIN_CLINIC', 'BRANCH', 'STORAGE', 'PHARMACY', 'LAB', 'RECEPTION', 'WAREHOUSE', 'MOBILE_UNIT', 'STORE', 'CLINIC', 'DISPENSARY');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('TRANSFER', 'RECEIPT', 'ISSUE', 'ADJUSTMENT', 'RETURN');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('OTC', 'PRESCRIPTION', 'WALK_IN');

-- CreateEnum
CREATE TYPE "PharmacySaleStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'INVOICED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CHARGE', 'PAYMENT', 'ADJUSTMENT', 'REFUND', 'PROCEDURE', 'DRUG', 'CONSULTATION', 'SERVICE', 'LAB', 'IMAGING', 'OTHER', 'TREATMENT_PROCEDURE', 'TREATMENT_PROCEDURE_SESSION', 'PHARMACY_SALE');

-- CreateEnum
CREATE TYPE "InvoiceItemType" AS ENUM ('TREATMENT_PROCEDURE', 'CONSULTATION', 'PRESCRIPTION', 'XRAY', 'MATERIAL', 'LAB', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceItemStatus" AS ENUM ('ACTIVE', 'VOID');

-- CreateEnum
CREATE TYPE "LedgerEntryStatus" AS ENUM ('PENDING', 'INVOICED', 'VOID');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('CASH_ON_DELIVERY', 'NET_7', 'NET_14', 'NET_30', 'NET_60', 'CREDIT');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETE', 'RETURNED', 'VOID');

-- CreateEnum
CREATE TYPE "StockAdjustmentReason" AS ENUM ('CYCLE_COUNT', 'DAMAGED', 'EXPIRED', 'THEFT', 'RETURNED_TO_SUPPLIER', 'FOUND', 'INITIAL_COUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "WasteCategory" AS ENUM ('EXPIRED', 'DAMAGED', 'CONTAMINATED', 'SPILLAGE', 'BREAKAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "StockLedgerType" AS ENUM ('PURCHASE_RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'WASTE', 'TRANSFER_IN', 'TRANSFER_OUT', 'USAGE', 'SALE', 'RETURN_IN', 'RETURN_TO_SUPPLIER', 'OPENING_BALANCE', 'EXPIRY_WRITE_OFF', 'STOCK_OUT', 'STOCK_IN', 'REVERSAL_IN', 'REVERSAL_OUT');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('SINGLE', 'MULTI');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('PAY_FULL', 'PAY_PARTIALLY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED', 'VOIDED');

-- CreateEnum
CREATE TYPE "SessionLedgerStatus" AS ENUM ('PENDING', 'INVOICED', 'VOID', 'UNPOSTED');

-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('FIXED', 'PER_TOOTH', 'PER_ARCH', 'PER_BRACKET', 'PER_UNIT');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('PIECES', 'BOX', 'PACK', 'BOTTLE', 'VIAL', 'AMPULE', 'TABLET', 'CAPSULE', 'STRIP', 'TUBE', 'SYRINGE', 'GLOVES_PAIR', 'ROLL', 'ML', 'LITER', 'MG', 'G', 'KG', 'INCH', 'MM', 'SET', 'KIT');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'MOBILE_MONEY', 'PETTY_CASH');

-- CreateEnum
CREATE TYPE "AccountCurrency" AS ENUM ('UGX', 'USD');

-- CreateEnum
CREATE TYPE "CashFlowDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashFlowSource" AS ENUM ('RECEIPT', 'EXPENSE_PAYMENT', 'PURCHASE_PAYMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'OPENING_BALANCE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AccountPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FIXED', 'PER_TOOTH', 'PER_ARCH', 'PER_SESSION', 'PER_BRACKET', 'PER_UNIT');

-- CreateEnum
CREATE TYPE "BillingUnit" AS ENUM ('TOOTH', 'ARCH', 'SESSION', 'BRACKET', 'UNIT');

-- CreateEnum
CREATE TYPE "BillingServiceCategory" AS ENUM ('CONSULTATION', 'PROCEDURE', 'DIAGNOSTIC', 'MEDICATION', 'THERAPY', 'SURGICAL', 'PREVENTIVE', 'ADMINISTRATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'IDLE', 'UNDER_MAINTENANCE', 'DISPOSED', 'LOST', 'LEASED');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'SCRAP');

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('DENTAL_EQUIPMENT', 'IMAGING_EQUIPMENT', 'STERILIZATION', 'LABORATORY', 'OFFICE_EQUIPMENT', 'FURNITURE', 'VEHICLES', 'BUILDING', 'IT_INFRASTRUCTURE', 'MEDICAL_INSTRUMENTS', 'OTHER');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'NONE');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'CALIBRATION', 'INSPECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "AssetMovementType" AS ENUM ('INITIAL_PLACEMENT', 'TRANSFER', 'LOAN', 'RETURN');

-- CreateEnum
CREATE TYPE "DisposalMethod" AS ENUM ('SOLD', 'SCRAPPED', 'DONATED', 'WRITTEN_OFF', 'RETURNED_TO_SUPPLIER', 'STOLEN_LOST');

-- CreateEnum
CREATE TYPE "ChartEntryType" AS ENUM ('CONDITION', 'EXISTING', 'PLANNED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ChartEntryStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'RESOLVED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ChartPresenceEffect" AS ENUM ('NONE', 'EXTRACTED', 'CONGENITAL', 'UNERUPTED', 'SUPERNUMERARY', 'RETAINED_ROOT');

-- CreateEnum
CREATE TYPE "ImagingStage" AS ENUM ('BEFORE', 'AFTER', 'PROGRESS', 'BASELINE');

-- CreateEnum
CREATE TYPE "ImagingSource" AS ENUM ('CHART', 'PROCEDURE', 'IMAGING_TAB', 'IMPORT');

-- CreateEnum
CREATE TYPE "ConditionCodingSystem" AS ENUM ('ICD_10', 'SNODENT', 'SNOMED_CT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ConditionCategory" AS ENUM ('CARIES', 'PERIODONTAL', 'PULPAL', 'PERIAPICAL', 'FRACTURE', 'EROSION_ATTRITION', 'DEVELOPMENTAL', 'NEOPLASTIC', 'TRAUMATIC', 'RESTORATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "ConditionSeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');

-- CreateEnum
CREATE TYPE "PatientConditionStatus" AS ENUM ('ACTIVE', 'MONITORED', 'IN_TREATMENT', 'RESOLVED', 'RULED_OUT');

-- CreateEnum
CREATE TYPE "StockOutCategory" AS ENUM ('GENERAL_USE', 'CLINIC_PROCEDURE', 'TRAINING', 'DAMAGED', 'SAMPLE', 'EXPIRED_MINOR', 'TRANSFER_INFORMAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ToothNotation" AS ENUM ('FDI', 'UNIVERSAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'WARNING', 'ERROR', 'SUCCESS');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('APPOINTMENT', 'CLINICAL', 'BILLING', 'INVENTORY', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "VendorCreditNoteStatus" AS ENUM ('DRAFT', 'APPROVED', 'APPLIED', 'VOIDED');

-- CreateEnum
CREATE TYPE "InventoryType" AS ENUM ('MEDICINE', 'CONSUMABLE', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "StockDocumentStatus" AS ENUM ('ACTIVE', 'VOID');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('IMPROVED', 'SAME', 'WORSE');

-- CreateEnum
CREATE TYPE "ProgressOutcome" AS ENUM ('GOOD', 'FAIR', 'POOR');

-- CreateTable
CREATE TABLE "ChartEntry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "toothNumber" INTEGER,
    "toothNotation" "ToothNotation" NOT NULL DEFAULT 'FDI',
    "surfaces" "ToothSurface"[],
    "type" "ChartEntryType" NOT NULL,
    "status" "ChartEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" TEXT NOT NULL,
    "conditionCode" TEXT,
    "procedureCode" TEXT,
    "treatmentProcedureId" TEXT,
    "procedureSessionId" TEXT,
    "conditionId" TEXT,
    "patientConditionId" TEXT,
    "notes" TEXT,
    "diagnosedAt" TIMESTAMP(3),
    "conditionStatus" "PatientConditionStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "providerId" TEXT,

    CONSTRAINT "ChartEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcedureTarget" (
    "id" TEXT NOT NULL,
    "treatmentProcedureId" TEXT,
    "procedureSessionId" TEXT,
    "toothNumber" INTEGER,
    "surfaces" "ToothSurface"[],
    "unitIndex" INTEGER,
    "toothNotation" "ToothNotation" NOT NULL DEFAULT 'FDI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcedureTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revenueAccountId" TEXT,

    CONSTRAINT "procedure_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'RECEPTIONIST',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "specialization" TEXT,
    "licenseNumber" TEXT,
    "qualification" TEXT,
    "bio" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "joiningDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_schedules" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isWorking" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_notes" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "batchNumber" TEXT,
    "fromLocationId" TEXT,
    "toLocationId" TEXT NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "performedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "level" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "patientCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "phone" TEXT,
    "alternatePhone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Uganda',
    "occupation" TEXT,
    "previousCardNumber" TEXT,
    "avatar" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bloodGroup" TEXT,
    "allergies" TEXT[],
    "medicalConditions" TEXT[],
    "currentMedications" TEXT[],
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelation" TEXT,
    "familyGroupId" TEXT,
    "familyRole" TEXT,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_insurance" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "memberNumber" TEXT,
    "groupNumber" TEXT,
    "coverageType" TEXT,
    "coveragePercent" DECIMAL(5,2),
    "maxAnnualBenefit" DECIMAL(10,2),
    "expiryDate" TIMESTAMP(3),
    "status" "InsuranceStatus" NOT NULL DEFAULT 'ACTIVE',
    "documents" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_insurance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_documents" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "appointmentCode" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "type" "AppointmentType" NOT NULL DEFAULT 'CONSULTATION',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "chiefComplaint" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentAt" TIMESTAMP(3),
    "followUpDate" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "visitCode" TEXT NOT NULL,
    "appointmentId" TEXT,
    "patientId" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'ARRIVED',
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "bloodPressure" TEXT,
    "pulseRate" INTEGER,
    "temperature" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "oxygenSat" DOUBLE PRECISION,
    "diagnosis" TEXT[],
    "icdCodes" TEXT[],
    "findings" TEXT,
    "recommendations" TEXT,
    "followUpDate" TIMESTAMP(3),
    "followUpNotes" TEXT,
    "totalCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentStatus" "BalanceStatus" NOT NULL DEFAULT 'OPEN',
    "chiefComplaint" TEXT,
    "historyOfPresentIllness" TEXT,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "visitDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_procedures" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "toothNumbers" INTEGER[],
    "surfaces" "ToothSurface"[],
    "notes" TEXT,
    "cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "paymentStatus" "BalanceStatus" NOT NULL DEFAULT 'OPEN',
    "originalPrice" DECIMAL(10,2) DEFAULT 0,
    "originalCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "finalCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "visit_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedures" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT,
    "baseCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "basePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'FIXED',
    "billingUnit" "BillingUnit",
    "priceRangeMin" DECIMAL(12,2),
    "priceRangeMax" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "revenueAccountId" TEXT,
    "defaultDuration" INTEGER NOT NULL DEFAULT 30,
    "requiresXray" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plans" (
    "id" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "diagnosis" TEXT,
    "status" "TreatmentStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "estimatedCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "consentSigned" BOOLEAN NOT NULL DEFAULT false,
    "consentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_procedures" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "notes" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "performedDate" TIMESTAMP(3),
    "performedNotes" TEXT,
    "actualInputsUsed" JSONB,
    "status" "TreatmentStatus" NOT NULL DEFAULT 'PLANNED',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "visitGroup" INTEGER NOT NULL DEFAULT 1,
    "billingContext" JSONB,
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'FIXED',
    "billingUnit" "BillingUnit",
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "pricePerUnit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costPerUnit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRate" DECIMAL(10,4),
    "baseCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "baseAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentStatus" "BalanceStatus" NOT NULL DEFAULT 'OPEN',
    "sessionType" "SessionType" NOT NULL DEFAULT 'SINGLE',
    "sessionCount" INTEGER NOT NULL DEFAULT 1,
    "billingType" "BillingType" NOT NULL DEFAULT 'PAY_FULL',
    "ledgerEntryId" TEXT,
    "ledgerStatus" "SessionLedgerStatus" NOT NULL DEFAULT 'PENDING',
    "phase" TEXT,
    "plannedVisitIndex" INTEGER,
    "providerId" TEXT,
    "cancellationReason" TEXT,
    "lastEditReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletedReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_sessions" (
    "id" TEXT NOT NULL,
    "treatmentProcedureId" TEXT NOT NULL,
    "visitId" TEXT,
    "visitGroup" INTEGER NOT NULL DEFAULT 1,
    "sessionNumber" INTEGER NOT NULL,
    "sessionLabel" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "performedDate" TIMESTAMP(3),
    "performedNotes" TEXT,
    "actualInputsUsed" JSONB,
    "surfaces" "ToothSurface"[],
    "sessionCost" DECIMAL(12,2),
    "sessionPrice" DECIMAL(12,2),
    "ledgerEntryId" TEXT,
    "ledgerStatus" "SessionLedgerStatus" NOT NULL DEFAULT 'PENDING',
    "providerId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "phase" TEXT,
    "outcome" TEXT,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletedReason" TEXT,
    "lastEditReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedure_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_attachments" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "visitId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountType" TEXT,
    "discountValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "baseCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "baseSubtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "baseDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "baseTaxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "baseTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "baseAmountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "baseBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "activatedAt" TIMESTAMP(3),
    "initialPaymentAmount" DECIMAL(10,2),
    "initialPaymentCurrency" TEXT,
    "paymentStatus" "InvoicePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentTerms" TEXT NOT NULL DEFAULT 'CASH',
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletedReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "treatmentPlanId" TEXT,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "procedureId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "toothNumbers" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ledgerEntryId" TEXT,
    "originalCurrency" TEXT,
    "originalUnitPrice" DECIMAL(10,2),
    "originalTotal" DECIMAL(10,2),
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "itemType" "InvoiceItemType" NOT NULL DEFAULT 'MANUAL',
    "treatmentProcedureId" TEXT,
    "status" "InvoiceItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "prescriptionItemId" TEXT,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "paymentCode" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "direction" "CashFlowDirection" NOT NULL,
    "invoiceId" TEXT,
    "purchaseOrderId" TEXT,
    "expenseId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT,
    "transactionId" TEXT,
    "bankName" TEXT,
    "chequeNumber" TEXT,
    "notes" TEXT,
    "receivedBy" TEXT,
    "recordedById" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "baseAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_credit_notes" (
    "id" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "expenseId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "vendorRef" TEXT,
    "documentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "VendorCreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "paymentId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emr_records" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "dentistId" TEXT NOT NULL,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "bloodPressure" TEXT,
    "pulseRate" INTEGER,
    "temperature" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "oxygenSat" DOUBLE PRECISION,
    "diagnosis" TEXT[],
    "icdCodes" TEXT[],
    "findings" TEXT,
    "recommendations" TEXT,
    "followUpDate" TIMESTAMP(3),
    "followUpNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emr_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emr_attachments" (
    "id" TEXT NOT NULL,
    "emrId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emr_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imaging_records" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "visitId" TEXT,
    "dentistId" TEXT,
    "procedureId" TEXT,
    "chartEntryId" TEXT,
    "type" "ImagingType" NOT NULL,
    "stage" "ImagingStage",
    "source" "ImagingSource",
    "groupId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "storagePath" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "toothNumbers" INTEGER[],
    "notes" TEXT,
    "findings" TEXT,
    "annotations" JSONB,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "procedureSessionId" TEXT,

    CONSTRAINT "imaging_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imaging_comparisons" (
    "id" TEXT NOT NULL,
    "baseImageId" TEXT NOT NULL,
    "compareImageId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imaging_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drug_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drugs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "categoryId" TEXT,
    "form" TEXT,
    "strength" TEXT,
    "manufacturer" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'tablet',
    "uom" "UnitOfMeasure" NOT NULL DEFAULT 'TABLET',
    "unitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sellPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inventoryItemId" TEXT,

    CONSTRAINT "drugs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "prescriptionCode" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "dentistId" TEXT,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "validUntil" TIMESTAMP(3),
    "dispensedAt" TIMESTAMP(3),
    "dispensedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "route" TEXT,
    "quantity" INTEGER NOT NULL,
    "instructions" TEXT,
    "refills" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "taxId" TEXT,
    "paymentTerms" TEXT DEFAULT 'NET_30',
    "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "uom" "UnitOfMeasure" NOT NULL DEFAULT 'PIECES',
    "supplierId" TEXT,
    "minQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "InventoryType" NOT NULL,
    "batchTracking" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "locationId" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentTerms" "PaymentTerms" NOT NULL DEFAULT 'CASH_ON_DELIVERY',
    "paymentStatus" "BalanceStatus" NOT NULL DEFAULT 'UNPAID',
    "orderType" TEXT NOT NULL DEFAULT 'INVENTORY',
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "shippingCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountCredited" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "expectedDate" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "notes" TEXT,
    "internalNotes" TEXT,
    "attachments" TEXT[],
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "uom" "UnitOfMeasure" NOT NULL DEFAULT 'PIECES',
    "quantityOrdered" DECIMAL(12,4) NOT NULL,
    "quantityReceived" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "deliveryCode" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "supplierRef" TEXT,
    "invoiceNumber" TEXT,
    "notes" TEXT,
    "attachments" TEXT[],
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_items" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "uom" "UnitOfMeasure" NOT NULL DEFAULT 'PIECES',
    "quantityDelivered" DECIMAL(12,4) NOT NULL,
    "quantityAccepted" DECIMAL(12,4) NOT NULL,
    "quantityRejected" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantityBilled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rejectionReason" TEXT,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_ledger" (
    "id" TEXT NOT NULL,
    "ledgerCode" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "batchId" TEXT,
    "type" "StockLedgerType" NOT NULL,
    "quantityBefore" DOUBLE PRECISION NOT NULL,
    "quantityChange" DOUBLE PRECISION NOT NULL,
    "quantityAfter" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "performedById" TEXT,
    "performedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryId" TEXT,
    "stockAdjustmentId" TEXT,
    "wasteRecordId" TEXT,
    "stockTransferId" TEXT,
    "stockOutId" TEXT,
    "stockInId" TEXT,
    "reversalOfId" TEXT,

    CONSTRAINT "inventory_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" TEXT NOT NULL,
    "adjustmentCode" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "reason" "StockAdjustmentReason" NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "performedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustment_items" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "itemType" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantitySystem" DOUBLE PRECISION NOT NULL,
    "quantityActual" DOUBLE PRECISION NOT NULL,
    "quantityDifference" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "batchNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_batches" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_records" (
    "id" TEXT NOT NULL,
    "wasteCode" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "category" "WasteCategory" NOT NULL,
    "reportedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "totalValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "witnessName" TEXT,
    "disposalMethod" TEXT,
    "disposalDate" TIMESTAMP(3),
    "attachments" TEXT[],
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waste_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_items" (
    "id" TEXT NOT NULL,
    "wasteId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_quantity_anomalies" (
    "id" BIGSERIAL NOT NULL,
    "sourceTable" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "itemId" TEXT,
    "locationId" TEXT,
    "batchNumber" TEXT,
    "oldQuantity" DOUBLE PRECISION NOT NULL,
    "newQuantity" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_quantity_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_location_stocks" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_location_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_orders" (
    "id" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "visitId" TEXT,
    "emrId" TEXT,
    "dentistId" TEXT,
    "testName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "instructions" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'ROUTINE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultFileUrl" TEXT,
    "resultNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "expenseCode" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'APPROVED',
    "paymentStatus" "ExpensePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountCredited" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "locationId" TEXT,
    "paymentType" TEXT NOT NULL DEFAULT 'CREDIT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletedReason" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "attachments" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "ledgerAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT,
    "recordId" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'DEFAULT',
    "key" TEXT NOT NULL,
    "currentValue" BIGINT NOT NULL DEFAULT 0,
    "prefix" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_counters" (
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "current_value" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("prefix","year")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "clinic_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy_sales" (
    "id" TEXT NOT NULL,
    "saleCode" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "patientId" TEXT,
    "prescriptionId" TEXT,
    "saleType" "SaleType" NOT NULL,
    "notes" TEXT,
    "servedBy" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "PharmacySaleStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy_sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "pharmacy_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy_sale_payments" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_inventory_inputs" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "locationId" TEXT,
    "quantityUsed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedure_inventory_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_procedure_inventory_usage" (
    "id" TEXT NOT NULL,
    "visitProcedureId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantityUsed" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "batchNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_procedure_inventory_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "entryCode" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "type" "LedgerEntryType" NOT NULL DEFAULT 'SERVICE',
    "description" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "pricePerUnit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRate" DECIMAL(10,4),
    "baseCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "baseAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amountReceived" DECIMAL(10,2) NOT NULL,
    "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'UGX',
    "currency" TEXT,
    "exchangeRate" DECIMAL(10,2),
    "baseAmountReceived" DECIMAL(10,2),
    "invoiceAmountApplied" DECIMAL(10,2),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "receivedById" TEXT,
    "receivedByName" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "accountId" TEXT,
    "paymentMethod" "PaymentMethod",
    "status" "ReceiptStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_reports" (
    "id" TEXT NOT NULL,
    "reportCode" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "dentistId" TEXT,
    "complaint" TEXT,
    "complaintStatus" "ComplaintStatus",
    "treatmentStatus" TEXT,
    "outcome" "ProgressOutcome",
    "toothNumber" INTEGER,
    "procedureName" TEXT,
    "findings" TEXT,
    "notes" TEXT,
    "nextPlan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" "AccountCurrency" NOT NULL DEFAULT 'UGX',
    "bankName" TEXT,
    "bankBranch" TEXT,
    "accountNumber" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "currentBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_entries" (
    "id" TEXT NOT NULL,
    "entryCode" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "CashFlowDirection" NOT NULL,
    "source" "CashFlowSource" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "baseAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balanceBefore" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "receiptId" TEXT,
    "paymentId" TEXT,
    "transferId" TEXT,
    "accountPeriodId" TEXT,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_flow_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_transfers" (
    "id" TEXT NOT NULL,
    "transferCode" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "fromCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "toCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "toAmount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "reference" TEXT,
    "recordedById" TEXT,
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_periods" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodLabel" TEXT,
    "openingBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "closingBalance" DECIMAL(10,2),
    "totalIn" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalOut" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "AccountPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "systemKey" TEXT,
    "name" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "normalBalance" "NormalBalance" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "cashAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',
    "reversesId" TEXT,
    "patientId" TEXT,
    "postedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "fxAmount" DECIMAL(14,2),
    "fxRate" DECIMAL(14,6),
    "patientId" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_services" (
    "id" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "LedgerEntryType" NOT NULL DEFAULT 'SERVICE',
    "category" "BillingServiceCategory" NOT NULL DEFAULT 'OTHER',
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRate" DECIMAL(10,4),
    "defaultTaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "defaultTaxLabel" TEXT,
    "priceRangeMin" DECIMAL(12,2),
    "priceRangeMax" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "AssetCategory" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "condition" "AssetCondition" NOT NULL DEFAULT 'GOOD',
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "purchaseCost" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "supplierId" TEXT,
    "invoiceNumber" TEXT,
    "warrantyExpiry" TIMESTAMP(3),
    "serialNumber" TEXT,
    "modelNumber" TEXT,
    "manufacturer" TEXT,
    "attachments" TEXT[],
    "locationId" TEXT,
    "assignedToStaffId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "usefulLifeYears" INTEGER,
    "salvageValue" DECIMAL(14,2),
    "depreciationRate" DECIMAL(6,2),
    "depreciationStartDate" TIMESTAMP(3),
    "isDepreciable" BOOLEAN NOT NULL DEFAULT true,
    "currentBookValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "accumulatedDepreciation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lastDepreciationDate" TIMESTAMP(3),
    "disposedAt" TIMESTAMP(3),
    "disposalMethod" "DisposalMethod",
    "disposalValue" DECIMAL(14,2),
    "disposalNotes" TEXT,
    "notes" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_depreciation_entries" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "depreciationAmount" DECIMAL(14,2) NOT NULL,
    "bookValueBefore" DECIMAL(14,2) NOT NULL,
    "bookValueAfter" DECIMAL(14,2) NOT NULL,
    "method" "DepreciationMethod" NOT NULL,
    "notes" TEXT,
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_depreciation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance" (
    "id" TEXT NOT NULL,
    "maintenanceCode" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "estimatedCost" DECIMAL(12,2),
    "actualCost" DECIMAL(12,2),
    "serviceProvider" TEXT,
    "technicianName" TEXT,
    "conditionBefore" "AssetCondition",
    "conditionAfter" "AssetCondition",
    "findings" TEXT,
    "partsReplaced" TEXT,
    "attachments" TEXT[],
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_movements" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "AssetMovementType" NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "fromStaffId" TEXT,
    "toStaffId" TEXT,
    "reason" TEXT,
    "expectedReturnDate" TIMESTAMP(3),
    "actualReturnDate" TIMESTAMP(3),
    "authorizedById" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_audit_trail" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fieldChanged" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_audit_trail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "transferCode" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "internalNotes" TEXT,
    "performedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "uom" "UnitOfMeasure" NOT NULL DEFAULT 'PIECES',
    "quantityRequested" DOUBLE PRECISION NOT NULL,
    "quantityTransferred" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "distributionStrategy" TEXT,
    "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conditions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "snodentCode" TEXT,
    "snomedCtCode" TEXT,
    "icd10Code" TEXT,
    "icd10Term" TEXT,
    "chartPresenceEffect" "ChartPresenceEffect" NOT NULL DEFAULT 'NONE',
    "autoResolves" BOOLEAN NOT NULL DEFAULT true,
    "codingSystem" "ConditionCodingSystem" NOT NULL DEFAULT 'ICD_10',
    "category" "ConditionCategory" NOT NULL DEFAULT 'OTHER',
    "affectedArea" TEXT,
    "isToothSpecific" BOOLEAN NOT NULL DEFAULT true,
    "requiresSurface" BOOLEAN NOT NULL DEFAULT false,
    "defaultSeverity" "ConditionSeverity",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isFavourite" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_conditions" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "conditionId" TEXT NOT NULL,
    "toothNotation" "ToothNotation" NOT NULL DEFAULT 'FDI',
    "version" INTEGER NOT NULL DEFAULT 0,
    "toothNumber" INTEGER,
    "surfaces" "ToothSurface"[],
    "severity" "ConditionSeverity",
    "status" "PatientConditionStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "diagnosedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByProcedureId" TEXT,
    "relatedProcedureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "lastEditReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletedReason" TEXT,
    "diagnosedBy" TEXT,
    "providerId" TEXT,

    CONSTRAINT "patient_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condition_procedure_links" (
    "id" TEXT NOT NULL,
    "patientConditionId" TEXT NOT NULL,
    "treatmentProcedureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedById" TEXT,
    "conditionNameAtLink" TEXT,
    "conditionCodeAtLink" TEXT,
    "conditionStatusAtLink" TEXT,
    "deletedAt" TIMESTAMP(3),
    "unlinkedById" TEXT,
    "deletedReason" TEXT,

    CONSTRAINT "condition_procedure_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_report_procedures" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "procedureSessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_report_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_report_conditions" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "patientConditionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_report_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_session_edits" (
    "id" TEXT NOT NULL,
    "editCode" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "surfacesBefore" TEXT[],
    "surfacesAfter" TEXT[],
    "surfacesAdded" TEXT[],
    "surfacesRemoved" TEXT[],
    "notesBefore" TEXT,
    "notesAfter" TEXT,
    "phaseBefore" TEXT,
    "phaseAfter" TEXT,
    "reason" TEXT,
    "editedById" TEXT,
    "editedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procedure_session_edits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ins" (
    "id" TEXT NOT NULL,
    "inCode" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "performedById" TEXT,
    "totalValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "StockDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_in_items" (
    "id" TEXT NOT NULL,
    "stockInId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_in_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_outs" (
    "id" TEXT NOT NULL,
    "outCode" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "reason" TEXT,
    "category" "StockOutCategory" NOT NULL DEFAULT 'GENERAL_USE',
    "notes" TEXT,
    "performedById" TEXT,
    "totalValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "StockDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_outs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_out_items" (
    "id" TEXT NOT NULL,
    "stockOutId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "batchNumber" TEXT,
    "distributionStrategy" TEXT DEFAULT 'FEFO',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_out_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications_v2" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "targetRole" "UserRole",
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "actionUrl" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "eventType" TEXT,
    "eventData" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "showToast" BOOLEAN NOT NULL DEFAULT true,
    "playSound" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_consumptions" (
    "id" TEXT NOT NULL,
    "consumptionCode" TEXT NOT NULL,
    "treatmentPlanId" TEXT,
    "patientId" TEXT,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "totalCost" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ChartEntryToTreatmentPlan" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "ChartEntry_patientId_idx" ON "ChartEntry"("patientId");

-- CreateIndex
CREATE INDEX "ChartEntry_patientId_toothNumber_idx" ON "ChartEntry"("patientId", "toothNumber");

-- CreateIndex
CREATE INDEX "ChartEntry_visitId_idx" ON "ChartEntry"("visitId");

-- CreateIndex
CREATE INDEX "ChartEntry_patientConditionId_idx" ON "ChartEntry"("patientConditionId");

-- CreateIndex
CREATE INDEX "ChartEntry_conditionId_idx" ON "ChartEntry"("conditionId");

-- CreateIndex
CREATE INDEX "ChartEntry_patientId_type_status_idx" ON "ChartEntry"("patientId", "type", "status");

-- CreateIndex
CREATE INDEX "ProcedureTarget_treatmentProcedureId_idx" ON "ProcedureTarget"("treatmentProcedureId");

-- CreateIndex
CREATE INDEX "ProcedureTarget_procedureSessionId_idx" ON "ProcedureTarget"("procedureSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_categories_name_key" ON "procedure_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_categories_code_key" ON "procedure_categories"("code");

-- CreateIndex
CREATE INDEX "procedure_categories_parentId_idx" ON "procedure_categories"("parentId");

-- CreateIndex
CREATE INDEX "procedure_categories_isActive_idx" ON "procedure_categories"("isActive");

-- CreateIndex
CREATE INDEX "procedure_categories_revenueAccountId_idx" ON "procedure_categories"("revenueAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_userId_key" ON "staff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_staffCode_key" ON "staff"("staffCode");

-- CreateIndex
CREATE INDEX "stock_movements_itemType_itemId_idx" ON "stock_movements"("itemType", "itemId");

-- CreateIndex
CREATE INDEX "stock_movements_fromLocationId_idx" ON "stock_movements"("fromLocationId");

-- CreateIndex
CREATE INDEX "stock_movements_toLocationId_idx" ON "stock_movements"("toLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "patients_patientCode_key" ON "patients"("patientCode");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_appointmentCode_key" ON "appointments"("appointmentCode");

-- CreateIndex
CREATE INDEX "appointments_dentistId_scheduledAt_idx" ON "appointments"("dentistId", "scheduledAt");

-- CreateIndex
CREATE INDEX "appointments_scheduledAt_idx" ON "appointments"("scheduledAt");

-- CreateIndex
CREATE INDEX "appointments_status_scheduledAt_idx" ON "appointments"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "appointments_patientId_scheduledAt_idx" ON "appointments"("patientId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "visits_visitCode_key" ON "visits"("visitCode");

-- CreateIndex
CREATE UNIQUE INDEX "visits_appointmentId_key" ON "visits"("appointmentId");

-- CreateIndex
CREATE INDEX "visits_checkedInAt_idx" ON "visits"("checkedInAt");

-- CreateIndex
CREATE INDEX "visits_status_checkedInAt_idx" ON "visits"("status", "checkedInAt");

-- CreateIndex
CREATE INDEX "visits_patientId_checkedInAt_idx" ON "visits"("patientId", "checkedInAt");

-- CreateIndex
CREATE INDEX "visits_dentistId_checkedInAt_idx" ON "visits"("dentistId", "checkedInAt");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_appointmentId_key" ON "waitlist_entries"("appointmentId");

-- CreateIndex
CREATE INDEX "visit_procedures_visitId_idx" ON "visit_procedures"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "procedures_code_key" ON "procedures"("code");

-- CreateIndex
CREATE INDEX "procedures_categoryId_idx" ON "procedures"("categoryId");

-- CreateIndex
CREATE INDEX "procedures_isActive_idx" ON "procedures"("isActive");

-- CreateIndex
CREATE INDEX "procedures_pricingModel_idx" ON "procedures"("pricingModel");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plans_planCode_key" ON "treatment_plans"("planCode");

-- CreateIndex
CREATE INDEX "treatment_procedures_treatmentPlanId_visitGroup_idx" ON "treatment_procedures"("treatmentPlanId", "visitGroup");

-- CreateIndex
CREATE INDEX "treatment_procedures_procedureId_idx" ON "treatment_procedures"("procedureId");

-- CreateIndex
CREATE INDEX "treatment_procedures_status_idx" ON "treatment_procedures"("status");

-- CreateIndex
CREATE INDEX "treatment_procedures_paymentStatus_idx" ON "treatment_procedures"("paymentStatus");

-- CreateIndex
CREATE INDEX "procedure_sessions_treatmentProcedureId_idx" ON "procedure_sessions"("treatmentProcedureId");

-- CreateIndex
CREATE INDEX "procedure_sessions_visitGroup_idx" ON "procedure_sessions"("visitGroup");

-- CreateIndex
CREATE INDEX "procedure_sessions_status_idx" ON "procedure_sessions"("status");

-- CreateIndex
CREATE INDEX "procedure_sessions_visitId_idx" ON "procedure_sessions"("visitId");

-- CreateIndex
CREATE INDEX "procedure_sessions_deletedAt_idx" ON "procedure_sessions"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_patientId_status_idx" ON "invoices"("patientId", "status");

-- CreateIndex
CREATE INDEX "invoices_visitId_idx" ON "invoices"("visitId");

-- CreateIndex
CREATE INDEX "invoices_treatmentPlanId_idx" ON "invoices"("treatmentPlanId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_paymentStatus_idx" ON "invoices"("paymentStatus");

-- CreateIndex
CREATE INDEX "invoices_createdAt_idx" ON "invoices"("createdAt");

-- CreateIndex
CREATE INDEX "invoices_paidAt_idx" ON "invoices"("paidAt");

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");

-- CreateIndex
CREATE INDEX "invoices_deletedAt_idx" ON "invoices"("deletedAt");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_items_treatmentProcedureId_idx" ON "invoice_items"("treatmentProcedureId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_paymentCode_key" ON "payments"("paymentCode");

-- CreateIndex
CREATE INDEX "payments_type_idx" ON "payments"("type");

-- CreateIndex
CREATE INDEX "payments_direction_idx" ON "payments"("direction");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_purchaseOrderId_idx" ON "payments"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "payments_expenseId_idx" ON "payments"("expenseId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_credit_notes_creditNoteNumber_key" ON "vendor_credit_notes"("creditNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_credit_notes_paymentId_key" ON "vendor_credit_notes"("paymentId");

-- CreateIndex
CREATE INDEX "vendor_credit_notes_supplierId_idx" ON "vendor_credit_notes"("supplierId");

-- CreateIndex
CREATE INDEX "vendor_credit_notes_status_idx" ON "vendor_credit_notes"("status");

-- CreateIndex
CREATE INDEX "vendor_credit_notes_documentDate_idx" ON "vendor_credit_notes"("documentDate");

-- CreateIndex
CREATE INDEX "vendor_credit_notes_purchaseOrderId_idx" ON "vendor_credit_notes"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "vendor_credit_notes_expenseId_idx" ON "vendor_credit_notes"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "emr_records_appointmentId_key" ON "emr_records"("appointmentId");

-- CreateIndex
CREATE INDEX "imaging_records_chartEntryId_idx" ON "imaging_records"("chartEntryId");

-- CreateIndex
CREATE INDEX "imaging_records_procedureId_idx" ON "imaging_records"("procedureId");

-- CreateIndex
CREATE UNIQUE INDEX "drug_categories_name_key" ON "drug_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "drug_categories_code_key" ON "drug_categories"("code");

-- CreateIndex
CREATE INDEX "drug_categories_parentId_idx" ON "drug_categories"("parentId");

-- CreateIndex
CREATE INDEX "drug_categories_isActive_idx" ON "drug_categories"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "drugs_inventoryItemId_key" ON "drugs"("inventoryItemId");

-- CreateIndex
CREATE INDEX "drugs_name_idx" ON "drugs"("name");

-- CreateIndex
CREATE INDEX "drugs_categoryId_idx" ON "drugs"("categoryId");

-- CreateIndex
CREATE INDEX "drugs_isActive_idx" ON "drugs"("isActive");

-- CreateIndex
CREATE INDEX "drugs_requiresPrescription_idx" ON "drugs"("requiresPrescription");

-- CreateIndex
CREATE INDEX "suppliers_isActive_idx" ON "suppliers"("isActive");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_categories_name_key" ON "inventory_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_categories_code_key" ON "inventory_categories"("code");

-- CreateIndex
CREATE INDEX "inventory_categories_parentId_idx" ON "inventory_categories"("parentId");

-- CreateIndex
CREATE INDEX "inventory_categories_isActive_idx" ON "inventory_categories"("isActive");

-- CreateIndex
CREATE INDEX "inventory_categories_sortOrder_idx" ON "inventory_categories"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_itemCode_key" ON "inventory_items"("itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_paymentStatus_idx" ON "purchase_orders"("paymentStatus");

-- CreateIndex
CREATE INDEX "purchase_orders_createdAt_idx" ON "purchase_orders"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_deliveryCode_key" ON "deliveries"("deliveryCode");

-- CreateIndex
CREATE INDEX "deliveries_purchaseOrderId_idx" ON "deliveries"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_ledger_ledgerCode_key" ON "inventory_ledger"("ledgerCode");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_ledger_reversalOfId_key" ON "inventory_ledger"("reversalOfId");

-- CreateIndex
CREATE INDEX "inventory_ledger_itemId_idx" ON "inventory_ledger"("itemId");

-- CreateIndex
CREATE INDEX "inventory_ledger_locationId_idx" ON "inventory_ledger"("locationId");

-- CreateIndex
CREATE INDEX "inventory_ledger_type_idx" ON "inventory_ledger"("type");

-- CreateIndex
CREATE INDEX "inventory_ledger_referenceType_referenceId_idx" ON "inventory_ledger"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "inventory_ledger_createdAt_idx" ON "inventory_ledger"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_adjustmentCode_key" ON "stock_adjustments"("adjustmentCode");

-- CreateIndex
CREATE INDEX "stock_adjustments_status_idx" ON "stock_adjustments"("status");

-- CreateIndex
CREATE INDEX "stock_adjustments_locationId_idx" ON "stock_adjustments"("locationId");

-- CreateIndex
CREATE INDEX "inventory_batches_itemId_locationId_idx" ON "inventory_batches"("itemId", "locationId");

-- CreateIndex
CREATE INDEX "inventory_batches_expiryDate_idx" ON "inventory_batches"("expiryDate");

-- CreateIndex
CREATE INDEX "inventory_batches_isActive_idx" ON "inventory_batches"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_batches_itemId_locationId_batchNumber_key" ON "inventory_batches"("itemId", "locationId", "batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "waste_records_wasteCode_key" ON "waste_records"("wasteCode");

-- CreateIndex
CREATE INDEX "waste_records_locationId_idx" ON "waste_records"("locationId");

-- CreateIndex
CREATE INDEX "waste_records_category_idx" ON "waste_records"("category");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_location_stocks_itemId_locationId_key" ON "inventory_location_stocks"("itemId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_orders_orderCode_key" ON "lab_orders"("orderCode");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_expenseCode_key" ON "expenses"("expenseCode");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_idempotencyKey_key" ON "expenses"("idempotencyKey");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"("status");

-- CreateIndex
CREATE INDEX "expenses_paymentStatus_idx" ON "expenses"("paymentStatus");

-- CreateIndex
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

-- CreateIndex
CREATE INDEX "expenses_expenseDate_idx" ON "expenses"("expenseDate");

-- CreateIndex
CREATE INDEX "expenses_createdAt_idx" ON "expenses"("createdAt");

-- CreateIndex
CREATE INDEX "expenses_supplierId_idx" ON "expenses"("supplierId");

-- CreateIndex
CREATE INDEX "expenses_locationId_idx" ON "expenses"("locationId");

-- CreateIndex
CREATE INDEX "expenses_deletedAt_idx" ON "expenses"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_slug_key" ON "expense_categories"("slug");

-- CreateIndex
CREATE INDEX "expense_categories_isActive_idx" ON "expense_categories"("isActive");

-- CreateIndex
CREATE INDEX "expense_categories_ledgerAccountId_idx" ON "expense_categories"("ledgerAccountId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_recordId_idx" ON "audit_logs"("entityType", "recordId");

-- CreateIndex
CREATE INDEX "audit_logs_module_action_idx" ON "audit_logs"("module", "action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_tenantId_key_key" ON "number_sequences"("tenantId", "key");

-- CreateIndex
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_settings_key_key" ON "clinic_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_sales_saleCode_key" ON "pharmacy_sales"("saleCode");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_sales_invoiceId_key" ON "pharmacy_sales"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_inventory_inputs_procedureId_inventoryItemId_loca_key" ON "procedure_inventory_inputs"("procedureId", "inventoryItemId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_entryCode_key" ON "ledger_entries"("entryCode");

-- CreateIndex
CREATE INDEX "ledger_entries_patientId_status_idx" ON "ledger_entries"("patientId", "status");

-- CreateIndex
CREATE INDEX "ledger_entries_visitId_status_idx" ON "ledger_entries"("visitId", "status");

-- CreateIndex
CREATE INDEX "ledger_entries_sourceType_sourceId_idx" ON "ledger_entries"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ledger_entries_createdAt_idx" ON "ledger_entries"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receiptNumber_key" ON "receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "receipts_invoiceId_idx" ON "receipts"("invoiceId");

-- CreateIndex
CREATE INDEX "receipts_paymentId_idx" ON "receipts"("paymentId");

-- CreateIndex
CREATE INDEX "receipts_status_idx" ON "receipts"("status");

-- CreateIndex
CREATE INDEX "receipts_generatedAt_idx" ON "receipts"("generatedAt");

-- CreateIndex
CREATE INDEX "receipts_receivedById_idx" ON "receipts"("receivedById");

-- CreateIndex
CREATE UNIQUE INDEX "progress_reports_reportCode_key" ON "progress_reports"("reportCode");

-- CreateIndex
CREATE INDEX "progress_reports_visitId_idx" ON "progress_reports"("visitId");

-- CreateIndex
CREATE INDEX "progress_reports_patientId_idx" ON "progress_reports"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_accountCode_key" ON "accounts"("accountCode");

-- CreateIndex
CREATE INDEX "accounts_type_idx" ON "accounts"("type");

-- CreateIndex
CREATE INDEX "accounts_currency_idx" ON "accounts"("currency");

-- CreateIndex
CREATE INDEX "accounts_isActive_idx" ON "accounts"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_entries_entryCode_key" ON "cash_flow_entries"("entryCode");

-- CreateIndex
CREATE INDEX "cash_flow_entries_accountId_idx" ON "cash_flow_entries"("accountId");

-- CreateIndex
CREATE INDEX "cash_flow_entries_direction_idx" ON "cash_flow_entries"("direction");

-- CreateIndex
CREATE INDEX "cash_flow_entries_source_idx" ON "cash_flow_entries"("source");

-- CreateIndex
CREATE INDEX "cash_flow_entries_entryDate_idx" ON "cash_flow_entries"("entryDate");

-- CreateIndex
CREATE INDEX "cash_flow_entries_receiptId_idx" ON "cash_flow_entries"("receiptId");

-- CreateIndex
CREATE INDEX "cash_flow_entries_paymentId_idx" ON "cash_flow_entries"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "account_transfers_transferCode_key" ON "account_transfers"("transferCode");

-- CreateIndex
CREATE INDEX "account_transfers_fromAccountId_idx" ON "account_transfers"("fromAccountId");

-- CreateIndex
CREATE INDEX "account_transfers_toAccountId_idx" ON "account_transfers"("toAccountId");

-- CreateIndex
CREATE INDEX "account_transfers_transferDate_idx" ON "account_transfers"("transferDate");

-- CreateIndex
CREATE INDEX "account_periods_accountId_startDate_idx" ON "account_periods"("accountId", "startDate");

-- CreateIndex
CREATE INDEX "account_periods_status_idx" ON "account_periods"("status");

-- CreateIndex
CREATE INDEX "account_periods_periodType_idx" ON "account_periods"("periodType");

-- CreateIndex
CREATE UNIQUE INDEX "account_periods_accountId_startDate_endDate_key" ON "account_periods"("accountId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_systemKey_key" ON "ledger_accounts"("systemKey");

-- CreateIndex
CREATE INDEX "ledger_accounts_type_idx" ON "ledger_accounts"("type");

-- CreateIndex
CREATE INDEX "ledger_accounts_isActive_idx" ON "ledger_accounts"("isActive");

-- CreateIndex
CREATE INDEX "ledger_accounts_cashAccountId_idx" ON "ledger_accounts"("cashAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_entryNumber_key" ON "journal_entries"("entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversesId_key" ON "journal_entries"("reversesId");

-- CreateIndex
CREATE INDEX "journal_entries_sourceType_sourceId_idx" ON "journal_entries"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "journal_entries_date_idx" ON "journal_entries"("date");

-- CreateIndex
CREATE INDEX "journal_entries_status_idx" ON "journal_entries"("status");

-- CreateIndex
CREATE INDEX "journal_entries_patientId_idx" ON "journal_entries"("patientId");

-- CreateIndex
CREATE INDEX "journal_lines_journalEntryId_idx" ON "journal_lines"("journalEntryId");

-- CreateIndex
CREATE INDEX "journal_lines_accountId_idx" ON "journal_lines"("accountId");

-- CreateIndex
CREATE INDEX "journal_lines_patientId_idx" ON "journal_lines"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_services_serviceCode_key" ON "billing_services"("serviceCode");

-- CreateIndex
CREATE INDEX "billing_services_type_idx" ON "billing_services"("type");

-- CreateIndex
CREATE INDEX "billing_services_category_idx" ON "billing_services"("category");

-- CreateIndex
CREATE INDEX "billing_services_isActive_idx" ON "billing_services"("isActive");

-- CreateIndex
CREATE INDEX "billing_services_isFavorite_idx" ON "billing_services"("isFavorite");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_assetCode_key" ON "fixed_assets"("assetCode");

-- CreateIndex
CREATE INDEX "fixed_assets_category_idx" ON "fixed_assets"("category");

-- CreateIndex
CREATE INDEX "fixed_assets_status_idx" ON "fixed_assets"("status");

-- CreateIndex
CREATE INDEX "fixed_assets_locationId_idx" ON "fixed_assets"("locationId");

-- CreateIndex
CREATE INDEX "fixed_assets_supplierId_idx" ON "fixed_assets"("supplierId");

-- CreateIndex
CREATE INDEX "fixed_assets_purchaseDate_idx" ON "fixed_assets"("purchaseDate");

-- CreateIndex
CREATE INDEX "asset_depreciation_entries_assetId_periodStart_idx" ON "asset_depreciation_entries"("assetId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "asset_maintenance_maintenanceCode_key" ON "asset_maintenance"("maintenanceCode");

-- CreateIndex
CREATE INDEX "asset_maintenance_assetId_idx" ON "asset_maintenance"("assetId");

-- CreateIndex
CREATE INDEX "asset_maintenance_status_idx" ON "asset_maintenance"("status");

-- CreateIndex
CREATE INDEX "asset_maintenance_scheduledDate_idx" ON "asset_maintenance"("scheduledDate");

-- CreateIndex
CREATE INDEX "asset_movements_assetId_idx" ON "asset_movements"("assetId");

-- CreateIndex
CREATE INDEX "asset_movements_movedAt_idx" ON "asset_movements"("movedAt");

-- CreateIndex
CREATE INDEX "asset_audit_trail_assetId_idx" ON "asset_audit_trail"("assetId");

-- CreateIndex
CREATE INDEX "asset_audit_trail_createdAt_idx" ON "asset_audit_trail"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_transferCode_key" ON "stock_transfers"("transferCode");

-- CreateIndex
CREATE INDEX "stock_transfers_status_idx" ON "stock_transfers"("status");

-- CreateIndex
CREATE INDEX "stock_transfers_fromLocationId_idx" ON "stock_transfers"("fromLocationId");

-- CreateIndex
CREATE INDEX "stock_transfers_toLocationId_idx" ON "stock_transfers"("toLocationId");

-- CreateIndex
CREATE INDEX "stock_transfers_transferDate_idx" ON "stock_transfers"("transferDate");

-- CreateIndex
CREATE INDEX "stock_transfer_items_transferId_idx" ON "stock_transfer_items"("transferId");

-- CreateIndex
CREATE INDEX "stock_transfer_items_inventoryItemId_idx" ON "stock_transfer_items"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "conditions_name_key" ON "conditions"("name");

-- CreateIndex
CREATE INDEX "conditions_isActive_idx" ON "conditions"("isActive");

-- CreateIndex
CREATE INDEX "conditions_isFavourite_idx" ON "conditions"("isFavourite");

-- CreateIndex
CREATE INDEX "conditions_category_idx" ON "conditions"("category");

-- CreateIndex
CREATE INDEX "conditions_icd10Code_idx" ON "conditions"("icd10Code");

-- CreateIndex
CREATE INDEX "patient_conditions_patientId_status_idx" ON "patient_conditions"("patientId", "status");

-- CreateIndex
CREATE INDEX "patient_conditions_visitId_idx" ON "patient_conditions"("visitId");

-- CreateIndex
CREATE INDEX "patient_conditions_conditionId_idx" ON "patient_conditions"("conditionId");

-- CreateIndex
CREATE INDEX "patient_conditions_deletedAt_idx" ON "patient_conditions"("deletedAt");

-- CreateIndex
CREATE INDEX "patient_conditions_resolvedByProcedureId_idx" ON "patient_conditions"("resolvedByProcedureId");

-- CreateIndex
CREATE INDEX "condition_procedure_links_treatmentProcedureId_idx" ON "condition_procedure_links"("treatmentProcedureId");

-- CreateIndex
CREATE INDEX "condition_procedure_links_patientConditionId_idx" ON "condition_procedure_links"("patientConditionId");

-- CreateIndex
CREATE INDEX "condition_procedure_links_deletedAt_idx" ON "condition_procedure_links"("deletedAt");

-- CreateIndex
CREATE INDEX "progress_report_procedures_reportId_idx" ON "progress_report_procedures"("reportId");

-- CreateIndex
CREATE INDEX "progress_report_procedures_procedureSessionId_idx" ON "progress_report_procedures"("procedureSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "progress_report_procedures_reportId_procedureSessionId_key" ON "progress_report_procedures"("reportId", "procedureSessionId");

-- CreateIndex
CREATE INDEX "progress_report_conditions_reportId_idx" ON "progress_report_conditions"("reportId");

-- CreateIndex
CREATE INDEX "progress_report_conditions_patientConditionId_idx" ON "progress_report_conditions"("patientConditionId");

-- CreateIndex
CREATE UNIQUE INDEX "progress_report_conditions_reportId_patientConditionId_key" ON "progress_report_conditions"("reportId", "patientConditionId");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_session_edits_editCode_key" ON "procedure_session_edits"("editCode");

-- CreateIndex
CREATE INDEX "procedure_session_edits_sessionId_idx" ON "procedure_session_edits"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_ins_inCode_key" ON "stock_ins"("inCode");

-- CreateIndex
CREATE INDEX "stock_ins_locationId_idx" ON "stock_ins"("locationId");

-- CreateIndex
CREATE INDEX "stock_ins_createdAt_idx" ON "stock_ins"("createdAt");

-- CreateIndex
CREATE INDEX "stock_in_items_stockInId_idx" ON "stock_in_items"("stockInId");

-- CreateIndex
CREATE INDEX "stock_in_items_inventoryItemId_idx" ON "stock_in_items"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_outs_outCode_key" ON "stock_outs"("outCode");

-- CreateIndex
CREATE INDEX "stock_outs_locationId_idx" ON "stock_outs"("locationId");

-- CreateIndex
CREATE INDEX "stock_outs_category_idx" ON "stock_outs"("category");

-- CreateIndex
CREATE INDEX "stock_outs_createdAt_idx" ON "stock_outs"("createdAt");

-- CreateIndex
CREATE INDEX "stock_out_items_stockOutId_idx" ON "stock_out_items"("stockOutId");

-- CreateIndex
CREATE INDEX "stock_out_items_inventoryItemId_idx" ON "stock_out_items"("inventoryItemId");

-- CreateIndex
CREATE INDEX "notifications_v2_userId_isRead_idx" ON "notifications_v2"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_v2_userId_createdAt_idx" ON "notifications_v2"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_v2_targetRole_isRead_idx" ON "notifications_v2"("targetRole", "isRead");

-- CreateIndex
CREATE INDEX "notifications_v2_category_idx" ON "notifications_v2"("category");

-- CreateIndex
CREATE INDEX "notifications_v2_entityType_entityId_idx" ON "notifications_v2"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "notifications_v2_createdAt_idx" ON "notifications_v2"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_category_key" ON "notification_preferences"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_consumptions_consumptionCode_key" ON "treatment_consumptions"("consumptionCode");

-- CreateIndex
CREATE INDEX "treatment_consumptions_treatmentPlanId_idx" ON "treatment_consumptions"("treatmentPlanId");

-- CreateIndex
CREATE INDEX "treatment_consumptions_patientId_idx" ON "treatment_consumptions"("patientId");

-- CreateIndex
CREATE INDEX "treatment_consumptions_itemType_itemId_idx" ON "treatment_consumptions"("itemType", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "_ChartEntryToTreatmentPlan_AB_unique" ON "_ChartEntryToTreatmentPlan"("A", "B");

-- CreateIndex
CREATE INDEX "_ChartEntryToTreatmentPlan_B_index" ON "_ChartEntryToTreatmentPlan"("B");

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_treatmentProcedureId_fkey" FOREIGN KEY ("treatmentProcedureId") REFERENCES "treatment_procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_procedureSessionId_fkey" FOREIGN KEY ("procedureSessionId") REFERENCES "procedure_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "conditions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_patientConditionId_fkey" FOREIGN KEY ("patientConditionId") REFERENCES "patient_conditions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureTarget" ADD CONSTRAINT "ProcedureTarget_treatmentProcedureId_fkey" FOREIGN KEY ("treatmentProcedureId") REFERENCES "treatment_procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureTarget" ADD CONSTRAINT "ProcedureTarget_procedureSessionId_fkey" FOREIGN KEY ("procedureSessionId") REFERENCES "procedure_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_categories" ADD CONSTRAINT "procedure_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "procedure_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_categories" ADD CONSTRAINT "procedure_categories_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_notes" ADD CONSTRAINT "performance_notes_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_familyGroupId_fkey" FOREIGN KEY ("familyGroupId") REFERENCES "family_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_insurance" ADD CONSTRAINT "patient_insurance_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_procedures" ADD CONSTRAINT "visit_procedures_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_procedures" ADD CONSTRAINT "visit_procedures_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "procedure_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_procedures" ADD CONSTRAINT "treatment_procedures_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_procedures" ADD CONSTRAINT "treatment_procedures_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_procedures" ADD CONSTRAINT "treatment_procedures_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_procedures" ADD CONSTRAINT "treatment_procedures_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_sessions" ADD CONSTRAINT "procedure_sessions_treatmentProcedureId_fkey" FOREIGN KEY ("treatmentProcedureId") REFERENCES "treatment_procedures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_sessions" ADD CONSTRAINT "procedure_sessions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_sessions" ADD CONSTRAINT "procedure_sessions_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_sessions" ADD CONSTRAINT "procedure_sessions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_attachments" ADD CONSTRAINT "treatment_attachments_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_treatmentProcedureId_fkey" FOREIGN KEY ("treatmentProcedureId") REFERENCES "treatment_procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "prescription_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_notes" ADD CONSTRAINT "vendor_credit_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_notes" ADD CONSTRAINT "vendor_credit_notes_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_notes" ADD CONSTRAINT "vendor_credit_notes_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_notes" ADD CONSTRAINT "vendor_credit_notes_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emr_records" ADD CONSTRAINT "emr_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emr_records" ADD CONSTRAINT "emr_records_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emr_records" ADD CONSTRAINT "emr_records_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emr_attachments" ADD CONSTRAINT "emr_attachments_emrId_fkey" FOREIGN KEY ("emrId") REFERENCES "emr_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_records" ADD CONSTRAINT "imaging_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_records" ADD CONSTRAINT "imaging_records_appointment_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_records" ADD CONSTRAINT "imaging_records_visit_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_records" ADD CONSTRAINT "imaging_records_dentist_fkey" FOREIGN KEY ("dentistId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_records" ADD CONSTRAINT "imaging_records_procedure_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_records" ADD CONSTRAINT "imaging_records_chart_entry_fkey" FOREIGN KEY ("chartEntryId") REFERENCES "ChartEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_records" ADD CONSTRAINT "imaging_records_procedure_session_fkey" FOREIGN KEY ("procedureSessionId") REFERENCES "procedure_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_comparisons" ADD CONSTRAINT "imaging_comparisons_baseImageId_fkey" FOREIGN KEY ("baseImageId") REFERENCES "imaging_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_comparisons" ADD CONSTRAINT "imaging_comparisons_compareImageId_fkey" FOREIGN KEY ("compareImageId") REFERENCES "imaging_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_categories" ADD CONSTRAINT "drug_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "drug_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drugs" ADD CONSTRAINT "drugs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "drug_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drugs" ADD CONSTRAINT "drugs_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "drugs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "inventory_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "inventory_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_performedByStaffId_fkey" FOREIGN KEY ("performedByStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_stockAdjustmentId_fkey" FOREIGN KEY ("stockAdjustmentId") REFERENCES "stock_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_wasteRecordId_fkey" FOREIGN KEY ("wasteRecordId") REFERENCES "waste_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_stockOutId_fkey" FOREIGN KEY ("stockOutId") REFERENCES "stock_outs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_stockInId_fkey" FOREIGN KEY ("stockInId") REFERENCES "stock_ins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "inventory_ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "stock_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_items" ADD CONSTRAINT "waste_items_wasteId_fkey" FOREIGN KEY ("wasteId") REFERENCES "waste_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_items" ADD CONSTRAINT "waste_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_location_stocks" ADD CONSTRAINT "inventory_location_stocks_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_location_stocks" ADD CONSTRAINT "inventory_location_stocks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_emrId_fkey" FOREIGN KEY ("emrId") REFERENCES "emr_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_sales" ADD CONSTRAINT "pharmacy_sales_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_sales" ADD CONSTRAINT "pharmacy_sales_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_sales" ADD CONSTRAINT "pharmacy_sales_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_sales" ADD CONSTRAINT "pharmacy_sales_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_sale_items" ADD CONSTRAINT "pharmacy_sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pharmacy_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_sale_items" ADD CONSTRAINT "pharmacy_sale_items_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "drugs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_sale_payments" ADD CONSTRAINT "pharmacy_sale_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pharmacy_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_inventory_inputs" ADD CONSTRAINT "procedure_inventory_inputs_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_inventory_inputs" ADD CONSTRAINT "procedure_inventory_inputs_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_inventory_inputs" ADD CONSTRAINT "procedure_inventory_inputs_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_procedure_inventory_usage" ADD CONSTRAINT "visit_procedure_inventory_usage_visitProcedureId_fkey" FOREIGN KEY ("visitProcedureId") REFERENCES "visit_procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_procedure_inventory_usage" ADD CONSTRAINT "visit_procedure_inventory_usage_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_procedure_inventory_usage" ADD CONSTRAINT "visit_procedure_inventory_usage_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_entries" ADD CONSTRAINT "cash_flow_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_entries" ADD CONSTRAINT "cash_flow_entries_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_entries" ADD CONSTRAINT "cash_flow_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_entries" ADD CONSTRAINT "cash_flow_entries_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "account_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_entries" ADD CONSTRAINT "cash_flow_entries_accountPeriodId_fkey" FOREIGN KEY ("accountPeriodId") REFERENCES "account_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_periods" ADD CONSTRAINT "account_periods_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_assignedToStaffId_fkey" FOREIGN KEY ("assignedToStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_depreciation_entries" ADD CONSTRAINT "asset_depreciation_entries_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movements" ADD CONSTRAINT "asset_movements_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_audit_trail" ADD CONSTRAINT "asset_audit_trail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_conditions" ADD CONSTRAINT "patient_conditions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_conditions" ADD CONSTRAINT "patient_conditions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_conditions" ADD CONSTRAINT "patient_conditions_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "conditions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_conditions" ADD CONSTRAINT "patient_conditions_resolvedByProcedureId_fkey" FOREIGN KEY ("resolvedByProcedureId") REFERENCES "treatment_procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_conditions" ADD CONSTRAINT "patient_conditions_relatedProcedureId_fkey" FOREIGN KEY ("relatedProcedureId") REFERENCES "procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_conditions" ADD CONSTRAINT "patient_conditions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_procedure_links" ADD CONSTRAINT "condition_procedure_links_patientConditionId_fkey" FOREIGN KEY ("patientConditionId") REFERENCES "patient_conditions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_procedure_links" ADD CONSTRAINT "condition_procedure_links_treatmentProcedureId_fkey" FOREIGN KEY ("treatmentProcedureId") REFERENCES "treatment_procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_report_procedures" ADD CONSTRAINT "progress_report_procedures_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "progress_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_report_procedures" ADD CONSTRAINT "progress_report_procedures_procedureSessionId_fkey" FOREIGN KEY ("procedureSessionId") REFERENCES "procedure_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_report_conditions" ADD CONSTRAINT "progress_report_conditions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "progress_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_report_conditions" ADD CONSTRAINT "progress_report_conditions_patientConditionId_fkey" FOREIGN KEY ("patientConditionId") REFERENCES "patient_conditions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_session_edits" ADD CONSTRAINT "procedure_session_edits_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "procedure_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ins" ADD CONSTRAINT "stock_ins_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_in_items" ADD CONSTRAINT "stock_in_items_stockInId_fkey" FOREIGN KEY ("stockInId") REFERENCES "stock_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_in_items" ADD CONSTRAINT "stock_in_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_outs" ADD CONSTRAINT "stock_outs_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_out_items" ADD CONSTRAINT "stock_out_items_stockOutId_fkey" FOREIGN KEY ("stockOutId") REFERENCES "stock_outs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_out_items" ADD CONSTRAINT "stock_out_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_v2" ADD CONSTRAINT "notifications_v2_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_v2" ADD CONSTRAINT "notifications_v2_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_consumptions" ADD CONSTRAINT "treatment_consumptions_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_consumptions" ADD CONSTRAINT "treatment_consumptions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_consumptions" ADD CONSTRAINT "treatment_consumptions_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChartEntryToTreatmentPlan" ADD CONSTRAINT "_ChartEntryToTreatmentPlan_A_fkey" FOREIGN KEY ("A") REFERENCES "ChartEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChartEntryToTreatmentPlan" ADD CONSTRAINT "_ChartEntryToTreatmentPlan_B_fkey" FOREIGN KEY ("B") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

