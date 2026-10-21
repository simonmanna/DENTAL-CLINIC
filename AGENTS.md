# AI Agent Guide — Fshikta Dental Clinic

For any AI assistant (Claude Code, Codex, etc.) working on a local install of
this repo. Read fully before pulling, migrating or editing.

## Stack

- `backend/` — NestJS + Prisma + PostgreSQL. Schema: `backend/prisma/schema.prisma`.
- `frontend/` — React + Vite + TypeScript.
- Windows client installs: PM2 process `DentalAPI` + nginx, updated by
  `scripts/update-dental.ps1`. VPS installs: Docker (`docker-compose.prod.yml`,
  `scripts/deploy-vps.sh`).

## Integrating an update (pull → migrate → build → restart)

1. Back up the database first (Settings → Backups → "Back up now", or `pg_dump`).
2. `git status` — local edits must be committed or stashed before pulling.
   Never `git reset --hard` / force-pull over local clinic changes without asking.
3. `git pull origin main`
4. Backend:
   ```
   cd backend
   npm ci
   npx prisma generate
   npx prisma migrate deploy
   npm run build
   ```
5. Frontend: `cd frontend && npm ci && npm run build`
6. Restart: `pm2 restart DentalAPI` then `nginx -s reload`.
7. Smoke test: log in, open a visit → Prescription tab, add a common drug, save.

Or run `scripts/update-dental.ps1` (edit `$projectDir` first).

Rules:
- Use `prisma migrate deploy` only. Never `migrate dev`, `migrate reset` or
  `db push --accept-data-loss` on a clinic database — they can drop data.
- New migrations are written idempotent (`IF NOT EXISTS`), so re-running is safe.
- If `migrate deploy` reports a drifted/failed migration, stop and report; do not
  "fix" by resetting.

## Changes in this release (Oct 2026)

| Area | Change |
|---|---|
| Prescriptions | Dialog replaced by inline quick-entry row + editable meds table + Common / Recent side panel (`frontend/src/pages/visits/components/PrescriptionTab.tsx`) |
| Drugs | New prescribing defaults per drug (see below) — **DB migration** |
| Inventory | Rx stock leaves exactly once (invoice post OR dispense, whichever first), via `StockMovementService` (FEFO, expired excluded, batch cost). Voiding invoice returns stock unless already dispensed |
| Inventory | Transfers keep batch identity; inventory report fixed |
| Backups | Backup location, schedule and retention managed in app (`docs/BACKUP_SETUP.md`) |
| Reports | Time-of-day filter; times shown in columns; visit report money fixed |
| Patients | History counts/timeline fixed; New Visit / Booking actions; Open + Bills on visits tab |
| Appointments | Separate date + time inputs (time defaults 09:00); complaint + notes side by side; walk-in toggle removed |
| Billing | Receipts History totals per currency |
| Nav / Auth | Settings is top-level below Reports; compact login card |
| Deploy | Production Docker setup + VPS deploy script |
| Cash Flow | New "Cash Flow" nav parent → Cash Movements (`/cash-flow`) + Accounts (`/accounts`). One page for every money movement: receipts, expense/supplier payments, deposits, withdrawals, transfers — **DB migration** |

Migrations in this release:
`backend/prisma/migrations/20261016120000_drug_prescribe_defaults/`
`backend/prisma/migrations/20261018120000_cash_flow_movements/`.

## Drug prescribing defaults (important)

New columns on `drugs` table (all optional, existing drugs unaffected):

| Column | Type | Purpose |
|---|---|---|
| `isCommon` | bool, default `false` | Drug appears in "Common Medications" panel on visit Rx tab |
| `defaultDosage` | text ≤100 | e.g. `1`, `1 tablet`, `5ml` |
| `defaultFrequency` | text ≤100 | must be a `value` from `RX_FREQUENCIES` |
| `defaultDuration` | text ≤100 | must be a `value` from `RX_DURATIONS` |
| `defaultRoute` | text ≤50 | must be a `value` from `RX_ROUTES` |
| `defaultInstructions` | text ≤500 | e.g. `Take after food` |

Where to set them: Drugs → edit drug → **Prescribing Defaults** section.

How the quick-entry row fills when a drug is picked:
- Dose = `defaultDosage` → else `suggestDosage(form)` (syrup `5ml`, drops `2 drops`,
  inhaler `1 puff`, cream `apply thin layer`, else `1`).
- Route = `defaultRoute` → else `suggestRoute(form)` (cream→topical,
  inhaler→inhalation, injection→intravenous, suppository→rectal, else oral).
- Frequency / Duration / Instructions = saved default → else blank.
- Qty = `calcQuantity(dose, frequency, duration)` = dose × perDay × days,
  rounded up. Returns null (keeps typed qty) for PRN, weekly, "as directed",
  or ml/mg/"apply" doses.

Vocabulary lives in one file: `frontend/src/lib/prescribing.ts`
(`RX_ROUTES`, `RX_FREQUENCIES`, `RX_DURATIONS`). Rules:
- Store the lowercase `value` (e.g. `three times daily`, `oral`, `5 days`),
  never the label or code (`TDS`). Otherwise the dropdown can't match it.
- To add a frequency/route/duration, add it to `prescribing.ts` only; both the
  drug form and Rx tab pick it up. Give new frequencies a correct `perDay`
  (0 = not countable).
- Empty string from the form clears a default (backend stores `null`).
- Backend: DTO `backend/src/drugs/dto/create-drug.dto.ts`, select/create/update
  in `backend/src/drugs/drugs.service.ts`. Adding a field = schema + migration
  + DTO + `DRUG_SELECT` + create + update + `frontend/src/types/drug.types.ts`
  + `DrugForm.tsx`.

Bulk-setting defaults (optional, after migration), example SQL:
```sql
UPDATE drugs SET "isCommon" = true, "defaultDosage" = '1',
  "defaultFrequency" = 'three times daily', "defaultDuration" = '5 days',
  "defaultRoute" = 'oral', "defaultInstructions" = 'Take after food'
WHERE name ILIKE 'amoxicillin%';
```
Back up first; use only `value`s from `prescribing.ts`.

## Cash flow (`/cash-flow`)

Movements are **derived on read**, not materialised, so existing history shows
up with no backfill and nothing is ever counted twice
(`backend/src/accounts/cash-flow.service.ts`):

| Source | Derived from | Direction |
|---|---|---|
| Patient receipt | `receipts` (status `ACTIVE`) | IN |
| Expense / supplier payment | `payments` (`COMPLETED`, not voided) | OUT |
| Other IN payment | `payments` with no receipt row | IN |
| Transfer in / out | `cash_flow_entries` (two rows per transfer) | IN + OUT |
| Deposit / Withdrawal / Adjustment | `cash_flow_entries` | IN / OUT |

Rules:
- An invoice payment and its receipt are the same money: receipts are read from
  `receipts`, and IN payments are only read when they have no receipt.
- Only manual sources (`DEPOSIT`, `WITHDRAWAL`, `ADJUSTMENT`, `OPENING_BALANCE`)
  and transfers are read out of `cash_flow_entries`. Never write a `RECEIPT` or
  `*_PAYMENT` entry there — it would double-count.
- Account balance = `accounts.openingBalance` + Σ IN − Σ OUT. `currentBalance`
  is a denormalised mirror, refreshed when a manual entry/transfer is written.
- `payments.accountId` records which physical account a payment moved through
  (new column; old invoice payments backfilled from their receipt). Pass it when
  adding a new payment path, or the movement shows no account.
- API: `GET /cash-flow/movements`, `GET /cash-flow/summary`,
  `POST /cash-flow/deposit|withdraw|transfer`.

## Seeding expense categories (do this on every install)

The 16 default expense categories (Dental Supplies, Laboratory Fees, Staff
Salaries, Utilities, Rent, Marketing, Equipment Maintenance, Equipment Purchase,
Transportation, Cleaning Supplies, Internet & Communication, Professional Fees,
Training, Insurance, Taxes, Miscellaneous) are defined in
`backend/src/expense-categories/default-categories.ts`.

After the update steps above (migrate + build), run from `backend/`:
```
npx ts-node prisma/seeds/0-seed-ledger-accounts.ts
npx ts-node prisma/seeds/0-seed-expense-categories.ts
```
Then check Expenses → Expense Categories shows all 16.

- Both seeds are idempotent: existing rows (by slug or name) are skipped, never
  changed or deleted. Safe to re-run; safe on a clinic DB with real expenses.
- Ledger accounts first, so categories get linked to their GL account
  (Dental/Cleaning Supplies → 5000, Salaries → 5100, Rent → 5200,
  Utilities/Internet → 5300, Miscellaneous → 5900; others unlinked).
- If `ts-node` is missing (e.g. Docker image without dev deps), restarting the
  backend does the same: `ExpenseCategoriesService` creates any missing default
  category on startup.
- Docker/VPS: the runtime image has no `src/`, so the ts-node seed can't run
  inside it. Restart instead: `docker compose -f docker-compose.prod.yml restart backend`.

## Coding rules

- All stock changes go through `StockMovementService`
  (`backend/src/common/inventory/`); Rx lines via `PrescriptionStockService`.
  Never hand-roll stock arithmetic or deduct a prescription twice.
- Clinical chart rules warn, not block; only data-integrity checks are hard errors.
- Sidebar "Medical Report" page = `frontend/src/pages/treatmentplans/TreatmentReports.tsx`.
- Match surrounding code style; run `npm run build` (and `npm test` in backend)
  after edits. Don't commit or push unless the user asks.
