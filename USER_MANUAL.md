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
    - 2.4 Conditions & Diagnoses
    - 2.5 Treatment Plans & Procedures
    - 2.6 Treatment Sessions
    - 2.7 Prescriptions
    - 2.8 Imaging & Lab Orders
    - 2.9 Completing a Visit

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

## 2.4 Conditions & Diagnoses

Conditions and diagnoses are managed through the **Dental Chart** (odontogram) during a patient visit. Each condition is tied to a specific tooth and surfaces, and is colour-coded in **amber** on the chart.

---

### 2.4.1 Adding a Condition

**Navigation:** Visit → **Dental Chart** tab → select tooth/teeth → click **"+ Condition"** in toolbar

The **"Add Condition"** dialog has two panels:

**Left panel — Condition Catalog:**
- Search by name or browse categories (Caries, Periodontal, Pulpal, Fracture, etc.)
- Each condition may have associated ICD-10, SNODENT, or SNOMED CT codes
- Click a condition to select it

**Right panel — Details:**
| Field | Details |
|---|---|
| Date | Defaults to today |
| Provider | Auto-filled with your name (dentist dropdown) |
| Status | Active / Monitored / In Treatment / Resolved / Ruled Out |
| Severity | Mild / Moderate / Severe |
| Surfaces | Visual radial picker — click the tooth surfaces affected |
| Notes | Free-text clinical notes |

**Multi-tooth support:** When multiple teeth are selected, choose:
- **"Same condition to all teeth"** — applies identical condition to every selected tooth
- **"One entry per tooth"** — allows different surfaces/notes per tooth

Click **"Save Condition"** → the tooth surfaces render in **amber** on the chart.

---

### 2.4.2 Editing a Condition

1. Click the tooth on the chart → **Tooth Detail Drawer** opens
2. Under the **CONDITION** section, click **Edit**
3. Modify fields as needed (severity, status, surfaces, notes)
4. If making a clinical change, an **edit reason** is required for the audit trail
5. Click **"Save Changes"** → updates the condition and chart entries

**Concurrent edit protection:** If another user edited the same condition at the same time, the system shows a **409 Conflict** warning. Refresh the chart and try again.

---

### 2.4.3 Deleting a Condition

1. Click the tooth → **Tooth Detail Drawer** → CONDITION section → **Delete**
2. Enter a **reason** for deletion (mandatory — recorded in audit log)
3. Click **"Delete condition"**

The condition is **soft-deleted** — it disappears from the chart but remains in the patient's audit history. It can be restored by an administrator if needed.

---

### 2.4.4 Condition Statuses

| Status | Meaning |
|---|---|
| **ACTIVE** | Condition currently present and untreated |
| **MONITORED** | Under observation, no active treatment needed yet |
| **IN_TREATMENT** | Active treatment is underway |
| **RESOLVED** | Condition has resolved (may auto-resolve when a linked procedure completes) |
| **RULED_OUT** | Diagnostically excluded |

Conditions can also auto-resolve: when a procedure linked to the condition is marked complete, the system automatically transitions the condition to **RESOLVED**.

---

### 2.4.5 Condition Catalog (Master List)

**Navigation:** Sidebar → **Clinical → Conditions/Diagnosis**

This page lists all conditions available in the system. You can:

- **Search** by name or code
- **Filter** tabs: All / Favourites / System / Custom
- **Favourite** a condition (star icon) for quick access
- **Add:** Click **"New Condition"** → fill name, codes, category, affected area
- **Edit:** Click a row → modify fields
- **Delete:** Only custom (user-created) conditions can be deleted. System conditions are locked.

| Field | Details |
|---|---|
| Name | Clinical name of the condition |
| Category | Caries, Periodontal, Pulpal, Fracture, etc. |
| Coding System | ICD-10, SNODENT, SNOMED CT, or Custom |
| ICD-10 Code | e.g., K02.9 (dental caries, unspecified) |
| Affected Area | Tooth / Root / Arch / Quadrant / Soft Tissue |
| Tooth-Specific | Whether it applies to individual teeth |
| Requires Surface | Whether surface selection is needed |
| Default Severity | Mild / Moderate / Severe |
| Auto-Resolve | Automatically resolved when linked procedure completes |

---

## 2.5 Treatment Plans & Procedures

Treatment plans organise clinical work into structured, multi-visit care. Procedures are the individual clinical actions within a plan. Sessions execute a procedure in a single visit.

**Navigation:** Visit → **Treatment Plans** tab, or Sidebar → **Patients** → select patient → **Treatment Plan** tab

---

### 2.5.1 Treatment Plans

A treatment plan groups procedures for a patient, tracking the full course of care from diagnosis to completion.

#### Creating a Treatment Plan

1. From the Treatment Plans tab, click **"+ New Treatment Plan"** (or create inline when adding the first procedure)
2. Enter a **title** (e.g., "Upper Arch Restoration", "Root Canal 26")
3. Select the **dentist/provider**
4. Click **Create**
5. The plan appears in the left sidebar under **Active** plans

A plan code is auto-generated.

#### Viewing & Selecting Plans

The left sidebar groups plans into:

| Group | Contains |
|---|---|
| **Active** | Plans with status PLANNED or IN_PROGRESS |
| **Referred** | Plans sent to a specialist (REFERRED) |
| **Completed** | Plans with all procedures completed |
| **Cancelled** | Plans that were cancelled |

Click a plan to load its procedures in the main panel.

#### Editing a Plan

- **Rename:** Click the pencil icon next to the plan title → edit inline
- **Status override:** Use the status dropdown to manually set ON_HOLD or REFERRED
- **Resume auto-status:** Select **"Resume Auto"** to let the system recalculate the plan status from its procedures
- **Other fields:** Click **Edit** to modify priority, diagnosis, consent status, or notes

#### Deleting a Plan

- Only allowed when the plan has **zero procedures**
- Click the trash icon → confirm deletion
- If procedures exist, remove them first or cancel the plan instead

#### Duplicating a Plan

- Click the duplicate icon to copy an entire plan with all its procedures
- Useful for creating similar plans for different arches or patients

#### Plan Summary

The top of the plan panel shows:
- **Progress bar** — percentage of procedures completed
- **Cost breakdown** — completed cost vs. remaining cost
- **Procedure counts** — total / completed / remaining

#### Plan Statuses

| Status | Meaning |
|---|---|
| **PLANNED** | Plan created, procedures added, not yet started |
| **IN_PROGRESS** | At least one procedure is in progress |
| **COMPLETED** | All procedures completed |
| **ON_HOLD** | Treatment paused (manual override) |
| **REFERRED** | Referred to a specialist |
| **CANCELLED** | Plan abandoned |

Plan statuses for PLANNED / IN_PROGRESS / COMPLETED are **auto-derived** from child procedure statuses. Manual overrides (ON_HOLD, REFERRED, CANCELLED) are sticky until "Resume Auto" is used.

---

### 2.5.2 Treatment Procedures

Procedures are individual clinical actions (e.g., "Composite Filling — Posterior", "Root Canal Therapy") assigned to specific teeth and surfaces, grouped under a treatment plan.

#### Adding a Procedure

**Navigation:** Treatment Plans tab → click **"+ Add Treatment"**

The **"Add Treatment"** dialog has two tabs:

**Tab 1 — New Treatment:**

1. **Search the procedure catalog** — type to search by name, or filter by category dropdown
2. **Select provider** — choose the dentist performing the procedure
3. **Select treatment plan** — pick from existing plans, or create a new one
4. **Select teeth** — the currently selected teeth from the dental chart are pre-filled; use FDI notation
5. **Pick surfaces** — Mesial, Occlusal, Distal, Buccal, Lingual via the surface picker
6. **Link conditions** (optional) — check active conditions on the selected teeth to link them (e.g., linking "Caries 26" to a filling procedure enables auto-resolve)
7. **Session type** — toggle:
   - **Single** — one session for the entire procedure
   - **Multi** — multiple sessions (e.g., root canal over 2–3 visits); set visit count via stepper
8. **Payment type** — choose:
   - **Pay in Full** — full cost billed upfront
   - **Pay Partially** — billed per session; set a deposit amount
9. **Price** — auto-calculated from tooth selection and pricing model; click **Edit** to override manually
10. **Notes** — optional clinical notes
11. Click **"Add to Plan"**

**Tab 2 — Existing Treatment (chart-only):**

For documenting work already done (no billing or planning):
1. Search and select the procedure
2. Select surfaces and add notes
3. Click **"Add as Existing"**

#### Pricing Models

| Model | Calculation | Example |
|---|---|---|
| **Fixed** | Flat price regardless of quantity | Consultation fee |
| **Per Tooth** | Price × number of teeth selected | Filling per tooth |
| **Per Arch** | Price per arch (upper / lower) | Full arch bleach tray |
| **Per Session** | Price per treatment session | Root canal (3 sessions) |
| **Per Bracket** | Price per orthodontic bracket | Braces |
| **Per Unit** | Generic per-unit pricing | Custom lab work |

#### Procedure Categories

Consultation, Procedure, Diagnostic, Medication, Therapy, Surgical, Preventive, Administrative, Other

#### Editing a Procedure

**Trigger:** Click the **three-dot menu** (⋮) on the procedure row → **Edit**

The **"Edit Procedure"** dialog allows changes with smart field locking:

| Field | Editable? | Condition |
|---|---|---|
| Notes, Provider | Always | |
| Sequence, Visit Group | Always | |
| Scheduled Date | Always | |
| Tooth Numbers | Only if no sessions have been executed | |
| Surfaces | Always | Changes audited via diff recording |
| Price, Discount, Tax | Only if linked invoice is DRAFT or absent | POSTED/PAID locks pricing |
| Session Config (Single/Multi, count) | Only if no sessions exist | |
| Reason for Edit | **Always required** | |

Click **"Save Changes"** — the procedure updates, and a reason is recorded in the audit log.

**Concurrent edit protection:** If another user edited the same procedure at the same time, the system returns a **409 Conflict** warning. Refresh and try again.

#### Procedure Statuses

| Status | Meaning |
|---|---|
| **PLANNED** | Procedure added, not yet started |
| **IN_PROGRESS** | Treatment has begun (at least one session started) |
| **COMPLETED** | Procedure fully done |
| **ON_HOLD** | Temporarily paused |
| **CANCELLED** | Abandoned — reason required |
| **REFERRED** | Sent to a specialist |
| **DELETED** | Soft-deleted (hidden from active views) |

#### Cancelling a Procedure

**Trigger:** Three-dot menu → **Cancel**

1. Select a **reason** from presets or type a custom reason (mandatory)
2. Cancellation reverses all side effects:
   - Chart entries are superseded
   - Pending ledger entries are voided
   - Any pending sessions are cancelled
3. The procedure remains visible in history with status **CANCELLED**

**Restrictions:**
- Can cancel from PLANNED, IN_PROGRESS, or ON_HOLD
- **Cannot** cancel a COMPLETED procedure (legal-record lock)
- Payments do not block cancellation — refund the invoice separately

#### Deleting a Procedure

**Trigger:** Three-dot menu → **Delete**

1. System checks eligibility first (no sessions executed, no payments, not completed)
2. If eligible: enter a **reason** and confirm
3. If not eligible: the system shows why and offers **Cancel** as an alternative

Delete is **soft-delete** — stamps deletedAt / deletedBy / deletedReason, voids invoice items, supersedes chart entries. Everything remains in the audit trail.

A deleted procedure can be restored by an administrator if needed.

#### Reordering Procedures

- **Drag & drop:** Drag a procedure row up or down to change its sequence
- **Move between visits:** Select procedures via checkboxes → click **"Move"** → pick a target visit number → all selected procedures move in a batch
- Reorder and move changes are saved immediately via API

---

### 2.5.3 Procedures vs. Dental Chart

When you add a procedure through the Treatment Plans tab, it also appears as a coloured entry on the **Dental Chart** tab:

| Chart Colour | Entry Type |
|---|---|
| **Blue** | Completed procedure |
| **Red** | Planned treatment |
| **Green** | Existing work |
| **Amber** | Condition |

Click any tooth on the chart to see all conditions, planned treatments, and completed work for that tooth in the Tooth Detail Drawer.

---

## 2.6 Treatment Sessions

A session is a single clinical encounter where a procedure is performed. For single-session procedures (e.g., a filling), one session covers the entire work. For multi-session procedures (e.g., root canal), each visit executes one session.

**Navigation:** Treatment Plans tab → expand a procedure row → session list is shown inline

---

### 2.6.1 Executing a Session

**Trigger:** Click the **Play** button (▶) on the procedure row

The **"Execute Session"** dialog:

| Field | Details |
|---|---|
| Performed Date | Defaults to today |
| Provider | Auto-filled with your name, changeable |
| Surfaces | Visual surface picker — confirm which surfaces were treated |
| Session Phase | Assessment, Preparation, Cleaning, Shaping, Filling, Cementation, etc. |
| Per-Tooth Status | For multi-tooth procedures: mark each tooth as pending / in-progress / completed / skipped |
| Outcome | Partial or Completed |
| Is Final Session? | Check if this is the last session (requires reason to close early) |
| Notes | Clinical notes for this session |
| Materials/Inventory | Log materials used (actual inputs consumed) |
| Imaging Links | Link radiographic images taken during this session |

Click **"Execute"** — the system atomically:
1. Creates the session record
2. Records chart entries for the treated surfaces
3. Optionally generates a ledger entry (for PAY_PARTIALLY billing)
4. Links any attached imaging

**Idempotency protection:** The system uses an idempotency key to prevent duplicate session creation if the button is double-clicked or the network retries.

---

### 2.6.2 Editing a Session

#### Quick Edit (Inline)
- For non-terminal sessions (PENDING or IN_PROGRESS), click the edit button on the session row
- Modify: status, date, notes, phase, price
- Changes save immediately

#### Audited Edit (Full)
For corrections to completed or terminal sessions:

**Trigger:** Open **Procedure Detail** → Session section → **Edit**

1. Modify surfaces (system records diff: before vs. after)
2. Modify notes, phase, performed date, provider, outcome, per-tooth statuses
3. **Reason required** (preset options or custom)
4. Click **"Save Edits"**

The system writes a **ProcedureSessionEdit** audit record capturing:
- Surfaces before / after / added / removed
- Notes before / after
- Phase before / after
- Editor identity and reason

---

### 2.6.3 Voiding / Deleting a Session

**Trigger:** Open **Procedure Detail** → Session section → **Void/Delete**

1. Select a **reason** (presets: wrong patient, duplicate, incorrect procedure, session didn't happen, data error, other)
2. Confirm deletion

Voiding reverses **every side effect**:
- Chart entries for the session are voided
- Linked ledger entries are reversed
- Imaging links are detached
- Progress report links are removed

The session is **soft-deleted** (status = VOIDED) and remains in the audit trail. It can be restored by an administrator.

**Important:** Deleting a session does NOT delete the procedure. The procedure remains with its other sessions intact.

---

### 2.6.4 Session Statuses

| Status | Meaning |
|---|---|
| **PENDING** | Session planned but not yet started |
| **IN_PROGRESS** | Session is actively being performed |
| **COMPLETED** | Session finished successfully |
| **SKIPPED** | Session was bypassed (e.g., treatment changed) |
| **CANCELLED** | Session abandoned |
| **VOIDED** | Session reversed / soft-deleted |

---

### 2.6.5 Extra Sessions

If a procedure requires more sessions than originally planned:

**Trigger:** Procedure row → **"+ Add Session"**

- Adds a session beyond the originally configured session count
- Useful when treatment takes longer than expected
- The extra session follows the same execution workflow

---

### 2.6.6 Procedure Detail View

**Trigger:** Click the procedure name or **Detail** from the three-dot menu

The **Procedure Detail** dialog shows a full read-only summary:

- Procedure name, code, and status
- Tooth numbers and surfaces
- Pricing breakdown (total price, per-unit price, quantity, discount, tax, currency)
- Session timeline — all sessions listed with expandable details
- Per-session edit / void buttons
- **"Continue Treatment"** button to execute the next pending session
- Linked conditions and procedures
- Audit log entries

---

## 2.7 Prescriptions

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

## 2.8 Imaging & Lab Orders

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

## 2.9 Completing a Visit

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
