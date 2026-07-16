# Fshikta Dental — Clinic User Manual

**Patient Workflow Guide:** Registration → Appointment → Visit → Billing

*Version 2.1.0 — July 2026*

---

## Table of Contents

1. [Section 1: Reception Guide](#section-1-reception-guide)
   - 1.1 Patient Registration
   - 1.2 Booking Appointments
   - 1.3 Managing Appointments
   - 1.4 Patient Check-in
   - 1.5 Payment Collection
   - 1.6 Daily Tasks Checklist

2. [Section 2: Dentist Guide](#section-2-dentist-guide)
   - 2.1 Starting a Visit
   - 2.2 Clinical Notes (SOAP)
   - 2.3 Vital Signs
   - 2.4 Procedures
   - 2.5 Prescriptions
   - 2.6 Imaging & Lab Orders
   - 2.7 Completing a Visit

3. [Section 3: Manager Guide](#section-3-manager-guide)
   - 3.1 Dashboard Overview
   - 3.2 Reports & Analytics
   - 3.3 Financial Management
   - 3.4 Staff Management
   - 3.5 System Settings & Audit

4. [Appendix](#appendix)
   - A: Status Flow Diagrams
   - B: Glossary of Terms

---

# Section 1: Reception Guide

This section covers all front-desk tasks: registering patients, scheduling appointments, checking patients in, and collecting payments.

---

## 1.1 Patient Registration

**Navigation:** Sidebar → **Patients** → Click **"New Patient"**

The **"Register New Patient"** modal contains three sections:

### Personal Information

| Field | Required | Notes |
|---|---|---|
| First Name | Yes | e.g., "John" |
| Last Name | Yes | e.g., "Doe" |
| Age (years) | Yes | Must be 0–120 |
| Phone Number | Yes | e.g., "+256 700 000 000" |
| Gender | Yes | Male / Female |
| City | No | e.g., "Kampala" |
| Address | No | Street address |
| Previous Card / File No. | No | For legacy card migration |

### Medical History

| Field | Notes |
|---|---|
| Allergies | Comma-separated, e.g., "Penicillin, Aspirin" |
| Medical Conditions | e.g., "Diabetes, Hypertension" |

### Emergency Contact

| Field | Notes |
|---|---|
| Contact Name | e.g., "Jane Doe" |
| Contact Phone | e.g., "+256 700 000 001" |
| Relationship | Spouse / Parent / Child / Sibling / Friend / Other |

**After submission:** System auto-generates a patient code (`PAT-YY-NNNN`). The patient appears in the patient list immediately.

**To edit:** Click the patient's row → click **"Edit"** pencil icon.

**Active/Inactive:** Patients can be marked inactive via their detail page. Inactive patients are hidden from most searches by default.

### Patient List Screen

- **Search:** by name, patient code, or phone number
- **Filters:** Gender dropdown, registration date range
- **Columns:** #, Patient, Contact, Gender, D.O.B / Age, Registered, Card No., Visits, Actions
- **Bulk actions:** None currently — each patient is managed individually.

---

## 1.2 Booking Appointments

**Navigation:** Sidebar → **Appointments** → Click **"New"**

The **"Book New Appointment"** modal:

| Step | Field | Details |
|---|---|---|
| 1 | Select Patient | Search by name, code, or phone |
| 2 | Dentist | Dropdown of all available dentists |
| 3 | Appointment Type | Regular Checkup, Cleaning, Filling, Extraction, Root Canal, Crown, Implant, Orthodontic, Emergency, Consultation |
| 4 | Duration | 15 / 20 / 30 / 45 / 60 / 90 / 120 minutes |
| 5 | Walk-in | Check if patient arrived without prior booking |
| 6 | Date | Date picker |
| 7 | Time | Time picker (slots shown based on dentist schedule) |
| 8 | Chief Complaint | Brief reason for visit |
| 9 | Additional Notes | Any extra information |

**Calendar view:** Toggle between **day** and **week** view. Appointments are colour-coded by dentist. Use the **"Today"** button to jump to the current date.

**Walk-in appointments:** Toggle the "Walk-in" checkbox when a patient arrives without a prior booking. The system will find the next available slot.

### Appointment Statuses

| Status | Meaning |
|---|---|
| Draft | Unsaved placeholder, not yet confirmed |
| Scheduled | Booked, awaiting confirmation |
| Confirmed | Confirmed by reception |
| Arrived | Patient checked in at front desk |
| In Progress | Dentist has started the visit |
| Completed | Visit finished |
| Cancelled | Appointment cancelled |
| No Show | Patient did not arrive |
| Rescheduled | Moved to a different time |

---

## 1.3 Managing Appointments

### Appointment Drawer

Click any appointment on the calendar to open the **appointment drawer** (slide-out panel). It shows:

- Patient info (name, code, gender, phone, age)
- Time & Dentist
- Appointment Type
- Chief Complaint
- Active Visit link (if visit started)
- Notes

### Context-sensitive actions

| Current Status | Available Actions |
|---|---|
| Scheduled / Rescheduled | **Confirm Appointment**, Cancel |
| Confirmed / Scheduled / Rescheduled | **Patient Arrived** (check-in), Cancel |
| Arrived (no visit yet) | **Start Visit** |
| Arrived / In Progress (has visit) | **Continue Visit** |
| Any cancellable status | **Cancel Appointment** (prompts for reason) |

### Editing an Appointment

Click the **Edit** pencil icon in the drawer to open the **"Edit Appointment"** modal. You can change dentist, type, date, time, duration, and notes. The patient field is locked once set.

### Draft Appointments

Access via **Appointments → Draft Appointments** in the sidebar. Drafts are unconfirmed placeholders that do not affect the dentist's schedule.

---

## 1.4 Patient Check-in

When a patient arrives at the clinic:

1. Find their appointment in the calendar or search the appointment list
2. Click the appointment to open the drawer
3. Click **"Patient Arrived"**
   - Appointment status changes to **"ARRIVED"**
   - The system records `actualStartAt` timestamp
   - A real-time notification is sent to the dentist's dashboard
4. If no appointment exists, create a **Walk-in** appointment first

**After check-in:** The dentist will see the patient on their visit list. No further reception action is needed until check-out/payment.

---

## 1.5 Payment Collection

At check-out, the receptionist handles billing.

**Navigation:** Go to the visit → click the **"Bills"** icon, or navigate through **Invoices & Receipts → Invoices**.

### Steps

1. Open the patient's invoice (status should be **Posted** — blue badge)
2. Click **"Receive {amount}"** (green button)

### Record Payment Receipt Dialog

| Field | Details |
|---|---|
| Payment Amount | Enter the amount being paid |
| Currency | UGX (default) or USD |
| Payment Method | Cash, MTN Mobile Money, Airtel Money, Visa Card, Mastercard, Bank Transfer, Cheque |
| Transaction Reference | Optional — e.g., TXN-2024-XYZ, Check #1234 |
| Received By | Auto-filled with your name |

**Partial payments** are supported. The invoice status will update to **Partially Paid** (amber badge) until the balance is cleared.

**Payment Methods explained:**

| Method | When to use |
|---|---|
| Cash | Physical cash payment |
| MTN Mobile Money | Mobile money transfer via MTN |
| Airtel Money | Mobile money transfer via Airtel |
| Visa Card / Mastercard | Card payments at POS terminal |
| Bank Transfer | Direct bank deposit or transfer |
| Cheque | Physical or digital cheque |

### Receipts

After payment, a receipt is auto-generated. Access receipts via **Invoices & Receipts → Receipts**. Receipts can be printed.

**Voiding a receipt:** If a payment was recorded in error, void the receipt (this also reverses the associated ledger entries).

---

## 1.6 Daily Tasks Checklist

**Opening:**
- [ ] Log in to the system
- [ ] Check today's appointments on the Calendar
- [ ] Confirm any Scheduled appointments that need confirmation

**Throughout the day:**
- [ ] Register new patients as they arrive
- [ ] Book appointments (scheduled and walk-in)
- [ ] Check in arriving patients
- [ ] Process payments at check-out

**Closing:**
- [ ] Reconcile cash drawer against receipts
- [ ] Verify no appointments are left in "Arrived" status
- [ ] Confirm next day's appointments if needed

---

# Section 2: Dentist Guide

This section covers clinical workflows: starting a visit, documenting findings, performing procedures, writing prescriptions, and completing a visit.

---

## 2.1 Starting a Visit

**From the appointment drawer:** When a patient's status is **ARRIVED**, click **"Start Visit"**.

The system creates a **Visit** record with a unique code (`VIS-YY-NNNN`) and loads the **Visit Dashboard**.

### Visit Dashboard Layout

The visit dashboard shows:

- **Header strip:** Patient name, patient code, visit code, dentist name, appointment type, DOB, gender
- **Status badge:** CHECKED_IN / IN_PROGRESS / COMPLETED
- **Action buttons:** "Start Examination" (if ARRIVED), "Complete Visit" (if IN_PROGRESS)
- **Tabs:** Dental Chart, Treatment Plans, Exam/Notes, Appointments, Prescriptions, Imaging, Progress Report, Procedure Sessions, Patient Report

### Visit statuses

| Status | Meaning |
|---|---|
| ARRIVED | Patient checked in, visit record created |
| IN_PROGRESS | Dentist actively examining/treating |
| COMPLETED | All clinical work done |
| CANCELLED | Visit cancelled |

---

## 2.2 Clinical Notes (SOAP)

**Tab:** **Exam/Notes**

The SOAP system is split into four sections. All fields **auto-save** as you type.

### S — Subjective

What the patient tells you:
- Chief Complaint (CC) — the patient's main reason for visiting
- History of Present Illness (HPI) — onset, duration, severity, aggravating/relieving factors

### O — Objective

Clinical examination findings:
- Intra-oral and extra-oral examination
- Radiographic observations
- Test results
- Any measurable or observable signs

### A — Assessment

Your clinical judgment:
- Diagnosis / clinical impression
- Differential diagnoses
- ICD-10 codes (searchable dropdown)

### P — Plan

Treatment plan:
- Procedures to perform
- Prescriptions needed
- Referrals
- Follow-up instructions

**Completeness indicator:** A progress bar at the top shows "X/4 fields filled". All four should be completed before finishing the visit.

**Read-only mode:** Once a visit is **COMPLETED**, clinical notes become read-only.

### Findings & Recommendations

| Field | Purpose |
|---|---|
| Clinical Findings | Detailed intra-oral and extra-oral findings |
| Patient Recommendations | Post-treatment instructions, dietary advice, hygiene recommendations, follow-up schedule |

---

## 2.3 Vital Signs

**Section within Exam/Notes tab**

Six vital sign cards, each with a unit and normal range helper text:

| Vital | Placeholder | Unit | Normal Range |
|---|---|---|---|
| Blood Pressure | 120/80 | mmHg | 90–120 / 60–80 |
| Pulse Rate | 72 | bpm | 60–100 |
| Temperature | 36.5 | °C | 36–37.5 |
| Weight | 70 | kg | — |
| Height | 170 | cm | — |
| SpO₂ | 98 | % | 95–100 |

Values outside normal ranges are flagged visually. All vitals auto-save when entered.

---

## 2.4 Procedures

**Tab:** **Treatment Plans** or add directly from the visit dashboard.

### Adding a Procedure

1. Search the **procedure catalog** (or browse by category)
2. Select the procedure (e.g., "Composite Filling — Posterior")
3. Assign **tooth numbers** (FDI notation) if applicable
4. Assign **surfaces** (Mesial, Occlusal, Distal, Buccal, Lingual) if applicable
5. The system calculates the cost based on the pricing model (Fixed / Per Tooth / Per Arch / Per Session)
6. Click **Add** to attach to the visit

### Procedure pricing models

| Model | Description |
|---|---|
| Fixed | One price per procedure regardless of quantity |
| Per Tooth | Price × number of teeth |
| Per Arch | Price per dental arch |
| Per Session | Price per treatment session |
| Per Bracket | Price per orthodontic bracket |
| Per Unit | Price per unit quantity |

### Procedure Categories

Consultation, Procedure, Diagnostic, Medication, Therapy, Surgical, Preventive, Administrative, Other

### Tooth Chart (Dental Chart tab)

The interactive dental chart (odontogram) uses FDI numbering. Each tooth can be marked with:

- **Conditions:** Decayed, Missing, Filled, etc.
- **Status colours:** Healthy (green), Decayed (red), Filled (blue), Missing (grey), Treated (purple), Crown (amber), Implant (cyan)

Click a tooth to add chart entries (condition, existing work, planned treatment, completed procedure).

---

## 2.5 Prescriptions

**Tab:** **Prescriptions**

### Creating a Prescription

1. Click **"New Prescription"**
2. Search the **drug catalog** by name
3. For each drug, set:
   - **Dosage** (e.g., "500mg")
   - **Frequency** (e.g., "Twice daily", "Every 8 hours")
   - **Duration** (e.g., "7 days")
   - **Quantity** (e.g., "14 tablets")
   - **Refills** (if applicable)
4. The system generates a prescription code (`RX-YY-NNNN`)
5. **Print** or send to the pharmacy

### Drug Catalog

Accessible via **Medicines → Drugs**. Drugs are categorised (Antibiotics, Analgesics, Anaesthetics, etc.) and linked to inventory stock levels.

**Important:** Prescriptions check inventory availability. If a drug is out of stock, the system will alert you.

---

## 2.6 Imaging & Lab Orders

### Imaging

**Tab:** **Imaging**

Upload radiographic images directly to the patient's record:

| Field | Details |
|---|---|
| Image Type | Periapical, Bitewing, Panoramic, CBCT, Cephalometric, Intraoral Photo, Extraoral Photo |
| Stage | Pre-treatment, Post-treatment, Review, Emergency |
| Classification | Normal, Abnormal, Pathological |

All images are stored in the local file system and linked to the visit. Previous imaging is available for comparison.

### Lab Orders

**Tab:** Create lab test orders linked to the visit. Each order tracks its status (Pending → In Progress → Completed). Results can be attached once returned.

---

## 2.7 Completing a Visit

When all clinical work is done:

1. Verify all SOAP fields are filled
2. Confirm all procedures are added
3. Click **"Complete Visit"**
   - Visit status → **COMPLETED**
   - `completedAt` timestamp is recorded
   - Appointment status → **COMPLETED**
   - `actualEndAt` timestamp is recorded
4. Optional: Set a **follow-up date** and notes
   - This will suggest a follow-up appointment when the receptionist views the patient record

**After completion:** The visit data is locked for editing. Ledger entries are generated for each procedure, ready for billing by reception.

---

# Section 3: Manager Guide

This section covers oversight functions: monitoring KPIs, generating reports, financial management, staff administration, and system configuration.

---

## 3.1 Dashboard Overview

**Navigation:** Sidebar → **Dashboard**

The dashboard provides a real-time snapshot of clinic operations:

| KPI | What it shows |
|---|---|
| Today's Appointments | Total appointments scheduled for today |
| Revenue (Today) | Total payments collected today |
| Active Patients | Total registered and active patients |
| Appointment Breakdown | Scheduled / Confirmed / Arrived / In Progress / Completed counts |

Use the dashboard as your morning check-in to see what the day looks like.

---

## 3.2 Reports & Analytics

**Navigation:** Sidebar → **Reports**

### Available Reports

| Report | Description |
|---|---|
| **Medical Report** | Clinical outcomes, treatments performed |
| **Patients Report** | Registration trends (daily/weekly/monthly), demographics (age/gender), insurance breakdown, city distribution, month-over-month growth |
| **Sales & Receipts** | Revenue by dentist, by procedure, by period, by payment method |
| **Expenses & Payments** | Operational costs, supplier payments, expense categories |
| **Inventory Report** | Stock levels, valuation, usage trends, waste |
| **General Ledger** | Chart of accounts, journal entries, trial balance |
| **Audit Log** | All system state changes (who did what and when) |

### Patient Reports Detail

The **Patients Report** page (`/patients/reports`) provides:
- **Registration Trend** chart — new patients over time
- **Age/Gender Distribution** — demographics pie/bar charts
- **Insurance Breakdown** — how many patients have insurance vs. not
- **City Distribution** — geographic spread
- **Growth Rate** — percentage change in registrations month-over-month

### Exporting Reports

Reports can be **printed** or **exported** (where implemented). Financial reports are available in PDF and CSV formats.

---

## 3.3 Financial Management

### Invoice Lifecycle

```
DRAFT ──► POSTED ──► (fully paid) ──► closed
  │               │
  └── Delete       └── VOID (with reason + audit trail)
```

| Status | Meaning |
|---|---|
| **DRAFT** | Invoice is being built. Not yet reflected in accounting. Can be edited freely. |
| **POSTED** | Invoice activated. Ledger entries are created. Affects Accounts Receivable and Revenue. |
| **VOID** | Invoice cancelled. Must include a reason. Voiding reverses ledger entries and voids any associated receipts. |

### Creating an Invoice

1. Open a visit → click **Bills** icon
2. Click **"Add Items"** to include procedures, drugs, or manual line items
3. Adjust quantities, discounts, and set tax percentage as needed
4. Click **"Post Invoice"** to activate it
   - This creates the double-entry journal: DR Accounts Receivable, CR Revenue
   - Any patient deposits are applied automatically

### Payment Statuses

| Status | Badge Colour |
|---|---|
| Unpaid | Slate |
| Partially Paid | Amber |
| Paid | Green |

### Multi-currency

The system supports **UGX** (base) and **USD** (and other currencies). Each invoice has a currency selector. Exchange rates are tracked at the time of payment and recorded on the receipt for audit purposes.

### Discounts

Two types available:
- **Fixed amount** — subtract a specific value
- **Percentage** — subtract a % of the subtotal

### General Ledger

**Navigation:** Reports → **General Ledger**

The system uses double-entry accounting. Key accounts:

| Account | Type | Purpose |
|---|---|---|
| Accounts Receivable (A/R) | Asset | Tracks what patients owe |
| Revenue (Treatment) | Income | Income from procedures |
| Patient Deposits | Liability | Prepayments by patients |
| Tax Payable | Liability | VAT/sales tax collected |
| Cash/Bank Accounts | Asset | Physical money locations |

**Closing periods:** At the end of each day/week/month, reconcile accounts using the **Account Period** system. This locks transactions for the period and produces a summary.

### Expenses

**Navigation:** Sidebar → **Expenses**

Track operational costs:
- Dynamic expense categories (rent, utilities, supplies, etc.)
- Link expenses to suppliers
- Post to General Ledger automatically

### Fixed Assets

**Navigation:** Sidebar → **Expenses → (Fixed Assets)**

Track dental equipment, computers, furniture with depreciation schedules.

---

## 3.4 Staff Management

**Navigation:** Sidebar → **Staff**

### Staff Records

Each staff member has:
- Personal details (name, contact, role)
- Linked **User account** for system login
- **Role-based permissions**

### Roles

| Role | Typical Access |
|---|---|
| Super Admin | Full system access, user management |
| Admin | Full access (practice owner / general manager) |
| Dentist | Clinical: visits, SOAP, procedures, prescriptions, treatment plans, dental chart, patient records (read/write) |
| Nurse | Assist with visits, vitals, stock usage; limited billing |
| Receptionist | Patient registration, appointments, check-in/out, payment collection |
| Pharmacist | Drug management, dispensing, pharmacy sales |
| Lab Technician | Lab orders, imaging records |

### Dentist Schedules

**Navigation:** Staff → **Dentist profile → Schedule**

Set each dentist's working hours and days. The appointment system uses this to determine available time slots.

### Performance Notes

**Navigation:** Staff → **Dentist profile → Performance**

Record performance reviews, KPIs, and notes.

---

## 3.5 System Settings & Audit

### Clinic Settings

**Navigation:** Sidebar → **Settings** (gear icon)

Configure:
- Clinic name and branding
- Default appointment duration
- Tax rate
- Currency settings
- Receipt/invoice numbering prefix

### Audit Log

**Navigation:** Reports → **Audit Log**

Every state change in the system is recorded:
- Who made the change
- What was changed (old value → new value)
- When it happened
- IP address / session info

This is append-only and cannot be modified. Use it for compliance, troubleshooting, and dispute resolution.

### Notifications

The notification bell (top header) shows real-time alerts for:
- Appointment status changes
- Billing events
- Inventory low-stock warnings

Click a notification to navigate to the relevant record.

---

# Appendix

## A: Status Flow Diagrams

### Appointment Status Lifecycle

```
                         ┌─────────────────────────────┐
                         │          DRAFT              │
                         └─────────────┬───────────────┘
                                       │ Save
                                       ▼
                         ┌─────────────────────────────┐
                         │        SCHEDULED            │
                         └─────────────┬───────────────┘
                                       │ Confirm
                                       ▼
                         ┌─────────────────────────────┐
                         │        CONFIRMED            │
                         └─────────────┬───────────────┘
                                       │ Patient arrives
                                       ▼
                         ┌─────────────────────────────┐
                         │         ARRIVED             │
                         └─────────────┬───────────────┘
                                       │ Dentist starts
                                       ▼
                         ┌─────────────────────────────┐
                         │      IN_PROGRESS            │
                         └─────────────┬───────────────┘
                                       │ Visit completed
                                       ▼
                         ┌─────────────────────────────┐
                         │        COMPLETED            │
                         └─────────────────────────────┘

  CANCELLED ◄── (any status above)
  NO_SHOW   ◄── SCHEDULED or CONFIRMED (patient didn't arrive)
  RESCHEDULED ◄── SCHEDULED or CONFIRMED (moved to new time)
```

### Invoice Lifecycle

```
                         ┌─────────────────────────────┐
                         │          DRAFT              │
                         │  (editable, no accounting)  │
                         └─────────────┬───────────────┘
                                       │ Post Invoice
                                       ▼
                         ┌─────────────────────────────┐
                         │         POSTED              │
                         │  (DR A/R, CR Revenue)       │
                         └─────────────┬───────────────┘
                                       │ Payments received
                                       ▼
              ┌──────────────────────────────────────────┐
              │  UNPAID ──► PARTIALLY_PAID ──► PAID     │
              └──────────────────────────────────────────┘

  VOID ◄── DRAFT or POSTED (with reason + audit trail)
```

### Visit Status Lifecycle

```
  ARRIVED ──► IN_PROGRESS ──► COMPLETED
        └──► CANCELLED
```

---

## B: Glossary of Terms

| Term | Definition |
|---|---|
| **A/R** | Accounts Receivable — money owed by patients |
| **CC** | Chief Complaint — patient's primary reason for visit |
| **Chart Entry** | A record on the dental odontogram (per-tooth data) |
| **Cuid** | Collision-resistant unique identifier used for database IDs |
| **FDI Notation** | Two-digit tooth numbering system (11–18, 21–28, etc.) |
| **GL** | General Ledger — the clinic's chart of accounts |
| **HPI** | History of Present Illness |
| **ICD-10** | International Classification of Diseases, 10th revision |
| **Invoice** | Bill for services rendered |
| **Ledger Entry** | Individual financial transaction on a patient's account |
| **Odontogram** | Dental chart showing all teeth and their conditions |
| **SOAP** | Subjective, Objective, Assessment, Plan — clinical documentation format |
| **SpO₂** | Blood oxygen saturation level |
| **Treatment Plan** | Grouped procedures for ongoing/multi-visit care |
| **Visit** | A single clinical encounter from check-in to check-out |

---

*End of manual. For support, contact your system administrator.*

---

© 2024–2026 Fshikta Dental Dental Management System — v2.1.0
