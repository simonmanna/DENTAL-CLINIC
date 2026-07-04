-- Split the former kitchen-sink "PaymentStatus" enum into two:
--   PaymentStatus  → transaction states   (payments.status)
--   BalanceStatus  → balance/workflow      (visits, visit_procedures,
--                                            treatment_procedures, purchase_orders)
-- The duplicate PARTIAL folds into PARTIALLY_PAID. Every legacy value is mapped
-- exhaustively so no row is left holding an out-of-range value.
-- Applied via `prisma db execute` (this project has no clean migrate history).
-- Postgres runs this file in one implicit transaction → all-or-nothing.

-- 1. New balance enum.
CREATE TYPE "BalanceStatus" AS ENUM (
  'OPEN', 'INVOICED', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WRITTEN_OFF'
);

-- 2. Convert the four balance columns. Drop defaults first (a DEFAULT typed as
--    the old enum blocks the column type change), then re-apply new defaults.
ALTER TABLE "visits"               ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TABLE "visit_procedures"     ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TABLE "treatment_procedures" ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TABLE "purchase_orders"      ALTER COLUMN "paymentStatus" DROP DEFAULT;

ALTER TABLE "visits" ALTER COLUMN "paymentStatus" TYPE "BalanceStatus" USING (
  CASE "paymentStatus"::text
    WHEN 'PARTIAL'   THEN 'PARTIALLY_PAID'
    WHEN 'PENDING'   THEN 'OPEN'
    WHEN 'COMPLETED' THEN 'PAID'
    WHEN 'FAILED'    THEN 'UNPAID'
    WHEN 'REFUNDED'  THEN 'WRITTEN_OFF'
    WHEN 'VOIDED'    THEN 'WRITTEN_OFF'
    ELSE "paymentStatus"::text
  END::"BalanceStatus"
);
ALTER TABLE "visit_procedures" ALTER COLUMN "paymentStatus" TYPE "BalanceStatus" USING (
  CASE "paymentStatus"::text
    WHEN 'PARTIAL'   THEN 'PARTIALLY_PAID'
    WHEN 'PENDING'   THEN 'OPEN'
    WHEN 'COMPLETED' THEN 'PAID'
    WHEN 'FAILED'    THEN 'UNPAID'
    WHEN 'REFUNDED'  THEN 'WRITTEN_OFF'
    WHEN 'VOIDED'    THEN 'WRITTEN_OFF'
    ELSE "paymentStatus"::text
  END::"BalanceStatus"
);
ALTER TABLE "treatment_procedures" ALTER COLUMN "paymentStatus" TYPE "BalanceStatus" USING (
  CASE "paymentStatus"::text
    WHEN 'PARTIAL'   THEN 'PARTIALLY_PAID'
    WHEN 'PENDING'   THEN 'OPEN'
    WHEN 'COMPLETED' THEN 'PAID'
    WHEN 'FAILED'    THEN 'UNPAID'
    WHEN 'REFUNDED'  THEN 'WRITTEN_OFF'
    WHEN 'VOIDED'    THEN 'WRITTEN_OFF'
    ELSE "paymentStatus"::text
  END::"BalanceStatus"
);
ALTER TABLE "purchase_orders" ALTER COLUMN "paymentStatus" TYPE "BalanceStatus" USING (
  CASE "paymentStatus"::text
    WHEN 'PARTIAL'   THEN 'PARTIALLY_PAID'
    WHEN 'PENDING'   THEN 'OPEN'
    WHEN 'COMPLETED' THEN 'PAID'
    WHEN 'FAILED'    THEN 'UNPAID'
    WHEN 'REFUNDED'  THEN 'WRITTEN_OFF'
    WHEN 'VOIDED'    THEN 'WRITTEN_OFF'
    ELSE "paymentStatus"::text
  END::"BalanceStatus"
);

ALTER TABLE "visits"               ALTER COLUMN "paymentStatus" SET DEFAULT 'OPEN';
ALTER TABLE "visit_procedures"     ALTER COLUMN "paymentStatus" SET DEFAULT 'OPEN';
ALTER TABLE "treatment_procedures" ALTER COLUMN "paymentStatus" SET DEFAULT 'OPEN';
ALTER TABLE "purchase_orders"      ALTER COLUMN "paymentStatus" SET DEFAULT 'UNPAID';

-- 3. Narrow PaymentStatus to transaction states. Postgres can't remove enum
--    values in place, so build the narrowed type, swap payments.status onto it,
--    drop the old type, and rename. After step 2 no other column references the
--    old PaymentStatus, so the DROP is unblocked.
ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'VOIDED');
ALTER TABLE "payments" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING (
  CASE "status"::text
    WHEN 'PENDING'   THEN 'PENDING'
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'FAILED'    THEN 'FAILED'
    WHEN 'REFUNDED'  THEN 'REFUNDED'
    WHEN 'VOIDED'    THEN 'VOIDED'
    ELSE 'COMPLETED'
  END::"PaymentStatus_new"
);
DROP TYPE "PaymentStatus";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'COMPLETED';
