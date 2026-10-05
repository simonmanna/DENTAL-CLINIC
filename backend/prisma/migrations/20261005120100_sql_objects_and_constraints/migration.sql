-- ─────────────────────────────────────────────────────────────────────────────
-- SQL-only database objects.
--
-- Everything here is something schema.prisma cannot express: a stored
-- function, a partial (predicated) unique index, or a CHECK constraint. It is
-- maintained BY HAND — regenerating the baseline migration will not reproduce
-- any of it.
--
-- Every statement is idempotent, so this is safe to re-run and safe to apply
-- over a database that already received some of these objects from the
-- PrismaService boot hook or from the retired migration history.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╭───────────────────────────────────────────────────────────────────────────╮
-- │ 1. DOCUMENT NUMBERING                                                     │
-- ╰───────────────────────────────────────────────────────────────────────────╯
--
-- This function existed ONLY in the running database. It was referenced by a
-- migration comment ("see migration 20260530000000_document_numbering") that
-- was not in the repository, and it was not in prisma/sql either — so a fresh
-- `migrate deploy` produced a database in which every call to
-- DocumentNumberService.next() failed, and with it every patient, invoice,
-- receipt, purchase order, delivery, stock-out, adjustment, transfer and
-- ledger code in the system. Recording it here is what makes a clean deploy
-- actually work.
--
-- The single INSERT ... ON CONFLICT DO UPDATE ... RETURNING row-locks the
-- (prefix, year) counter row, so concurrent callers serialise and can never
-- be handed the same number. No COUNT(*), resets yearly, gap-tolerant (a
-- rolled-back transaction "wastes" a number, which is expected).
CREATE OR REPLACE FUNCTION public.generate_document_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_year    INT    := EXTRACT(YEAR FROM NOW())::INT % 100;
  v_counter BIGINT;
  v_code    TEXT;
BEGIN
  INSERT INTO document_counters (
    prefix,
    year,
    current_value,
    updated_at
  )
  VALUES (
    p_prefix,
    v_year,
    1,
    NOW()
  )
  ON CONFLICT (prefix, year)
  DO UPDATE SET
    current_value = document_counters.current_value + 1,
    updated_at    = NOW()
  RETURNING current_value INTO v_counter;

  v_code :=
    p_prefix || '-' ||
    LPAD(v_year::TEXT, 2, '0') || '-' ||
    LPAD(v_counter::TEXT, 4, '0');

  RETURN v_code;
END;
$function$;

-- ╭───────────────────────────────────────────────────────────────────────────╮
-- │ 2. PARTIAL UNIQUE INDEXES                                                 │
-- ╰───────────────────────────────────────────────────────────────────────────╯
--
-- Prisma's @@unique cannot carry a WHERE predicate, so these are raw SQL.

-- One ACTIVE session per (procedure, sessionNumber). Two concurrent
-- create-and-execute requests that both compute max+1 collide here; the loser
-- is replayed via its Idempotency-Key or surfaced as a 409.
CREATE UNIQUE INDEX IF NOT EXISTS procedure_sessions_active_session_number_unique
  ON procedure_sessions ("treatmentProcedureId", "sessionNumber")
  WHERE "deletedAt" IS NULL;

-- One ACTIVE link per (patientCondition, treatmentProcedure). Without it the
-- lifecycle evaluation can see the same procedure twice.
CREATE UNIQUE INDEX IF NOT EXISTS condition_procedure_links_active_unique
  ON condition_procedure_links ("patientConditionId", "treatmentProcedureId")
  WHERE "deletedAt" IS NULL;

-- One ACTIVE DRAFT invoice per (patient, visit, plan).
-- InvoiceLifecycleService.getOrCreateDraft() does findFirst-then-create; two
-- concurrent first-procedure adds on a new visit would each create a draft and,
-- if both were activated, bill the visit twice. NULL visit/plan collapse to '-'
-- so a patient-level draft is covered too.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_active_draft
  ON invoices (
    "patientId",
    COALESCE("visitId", '-'),
    COALESCE("treatmentPlanId", '-')
  )
  WHERE status = 'DRAFT' AND "deletedAt" IS NULL;

-- ╭───────────────────────────────────────────────────────────────────────────╮
-- │ 3. IMAGING CHART LINKS                                                    │
-- ╰───────────────────────────────────────────────────────────────────────────╯
--
-- ImagingRecord.chartEntryId / .procedureId as real foreign keys, so deleting
-- a chart entry or procedure null-sets the link instead of orphaning the image.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'imaging_records_chart_entry_fkey'
  ) THEN
    ALTER TABLE "imaging_records"
      ADD CONSTRAINT "imaging_records_chart_entry_fkey"
      FOREIGN KEY ("chartEntryId") REFERENCES "ChartEntry"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'imaging_records_procedure_fkey'
  ) THEN
    ALTER TABLE "imaging_records"
      ADD CONSTRAINT "imaging_records_procedure_fkey"
      FOREIGN KEY ("procedureId") REFERENCES "treatment_procedures"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "imaging_records_chartEntryId_idx"
  ON "imaging_records" ("chartEntryId");
CREATE INDEX IF NOT EXISTS "imaging_records_procedureId_idx"
  ON "imaging_records" ("procedureId");

-- ╭───────────────────────────────────────────────────────────────────────────╮
-- │ 4. MONEY AND QUANTITY FLOORS                                              │
-- ╰───────────────────────────────────────────────────────────────────────────╯
--
-- Last line of defence. The service layer guards each of these, but a direct
-- write or a future bug should not be the only thing standing between the
-- clinic and a negative balance or a negative quantity of gloves.

-- Any quantity that was already negative is preserved in
-- inventory_quantity_anomalies (created by the baseline migration) before
-- being clamped to zero, so the original figure stays auditable.
INSERT INTO inventory_quantity_anomalies
  ("sourceTable", "sourceId", "itemId", "locationId", "batchNumber",
   "oldQuantity", "newQuantity", note)
SELECT 'inventory_batches', id, "itemId", "locationId", "batchNumber",
       quantity, 0,
       'Clamped to 0 before adding the non-negative CHECK'
FROM inventory_batches
WHERE quantity < 0;

UPDATE inventory_batches SET quantity = 0 WHERE quantity < 0;

INSERT INTO inventory_quantity_anomalies
  ("sourceTable", "sourceId", "itemId", "locationId", "batchNumber",
   "oldQuantity", "newQuantity", note)
SELECT 'inventory_location_stocks', id, "itemId", "locationId", NULL,
       quantity, 0,
       'Clamped to 0 before adding the non-negative CHECK'
FROM inventory_location_stocks
WHERE quantity < 0;

UPDATE inventory_location_stocks SET quantity = 0 WHERE quantity < 0;

DO $$
BEGIN
  -- Inventory quantities. Every issue path deducts with a bare
  -- `quantity: { decrement: n }`; the availability check that precedes it now
  -- runs inside the same Serializable transaction, but the invariant belongs
  -- here as well.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_batches_quantity_nonneg'
      AND conrelid = 'inventory_batches'::regclass
  ) THEN
    ALTER TABLE inventory_batches
      ADD CONSTRAINT inventory_batches_quantity_nonneg
      CHECK (quantity >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_location_stocks_quantity_nonneg'
      AND conrelid = 'inventory_location_stocks'::regclass
  ) THEN
    ALTER TABLE inventory_location_stocks
      ADD CONSTRAINT inventory_location_stocks_quantity_nonneg
      CHECK (quantity >= 0);
  END IF;

  -- Received quantity. Only the floor is asserted: the over-delivery tolerance
  -- in PurchaseService may legitimately push it past the ordered amount.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_order_items_qty_received_nonneg'
      AND conrelid = 'purchase_order_items'::regclass
  ) THEN
    ALTER TABLE purchase_order_items
      ADD CONSTRAINT purchase_order_items_qty_received_nonneg
      CHECK ("quantityReceived" >= 0);
  END IF;

  -- Invoice money.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_balance_nonneg'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_balance_nonneg CHECK (balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_base_balance_nonneg'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_base_balance_nonneg CHECK ("baseBalance" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_amount_paid_nonneg'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_amount_paid_nonneg CHECK ("amountPaid" >= 0);
  END IF;
END $$;
