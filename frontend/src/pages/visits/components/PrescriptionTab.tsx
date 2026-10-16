// src/pages/visits/components/PrescriptionTab.tsx

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionButton, RowActions } from "@/components/ui/action-button";
import {
  Loader2,
  Edit3,
  Plus,
  Pill,
  Trash2,
  Printer,
  Search,
  CheckCircle,
  X,
  AlertTriangle,
  Clock,
  Check,
  RefreshCw,
  ChevronDown,
  Star,
  Calendar,
  Hash,
} from "lucide-react";
import { prescriptionsApi, drugsApi } from "../../../lib/api";
import { clinicSettingsApi } from "../../../lib/api/clinic-settings";
import {
  RX_ROUTES,
  RX_FREQUENCIES,
  RX_DURATIONS,
  calcQuantity,
  frequencyMeta,
  routeLabel,
  suggestDosage,
  suggestRoute,
} from "@/lib/prescribing";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Drug {
  id: string;
  name: string;
  genericName?: string;
  category?: string | { id: string; name: string } | null;
  form?: string;
  strength?: string;
  manufacturer?: string;
  unitPrice: number;
  isActive: boolean;
  isCommon?: boolean;
  defaultDosage?: string | null;
  defaultFrequency?: string | null;
  defaultDuration?: string | null;
  defaultRoute?: string | null;
  defaultInstructions?: string | null;
}

interface PrescriptionItem {
  id: string;
  drugId: string;
  drug: Drug;
  dosage: string;
  frequency: string;
  duration: string;
  route?: string;
  quantity: number;
  instructions?: string;
  refills: number;
  createdAt: string;
}

interface Prescription {
  id: string;
  prescriptionCode: string;
  visitId: string;
  patientId: string;
  dentistId: string;
  status: "ACTIVE" | "DISPENSED" | "EXPIRED" | "CANCELLED";
  notes?: string;
  validUntil?: string;
  dispensedAt?: string;
  dispensedBy?: string;
  createdAt: string;
  items: PrescriptionItem[];
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    patientCode: string;
    dateOfBirth?: string;
  };
  dentist?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  visit?: {
    id: string;
    visitCode: string;
    status: string;
  };
}

interface PrescriptionTabProps {
  visitId: string;
  visit?: {
    id: string;
    visitCode: string;
    patientId: string;
    patient?: {
      id: string;
      firstName: string;
      lastName: string;
      patientCode: string;
    };
    dentistId?: string;
    status: string;
  };
  readOnly?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...cls: (string | boolean | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-6 h-6" };
  return <Loader2 className={cn("animate-spin text-primary", sizes[size])} />;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-success-muted/60 text-success border-success/25",
  DISPENSED: "bg-primary-muted/60 text-primary border-primary/25",
  EXPIRED: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-danger-muted/60 text-danger border-danger/25",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  ACTIVE: <Clock className="w-3 h-3" />,
  DISPENSED: <Check className="w-3 h-3" />,
  EXPIRED: <AlertTriangle className="w-3 h-3" />,
  CANCELLED: <X className="w-3 h-3" />,
};

// ─── Prescription Print Helpers ───────────────────────────────────────────────

interface ClinicPrintInfo {
  name: string;
  address: string;
  city: string;
  phone: string;
  qualification: string;
  regNumber: string;
  designation: string;
}

function buildClinicPrintInfo(s: Record<string, string> = {}): ClinicPrintInfo {
  return {
    name:          s['clinicName'] || s['clinic_name'] || s['name'] || 'Dental Health Clinic',
    address:       s['address'] || s['clinicAddress'] || '',
    city:          s['city'] || '',
    phone:         s['phone'] || s['clinicPhone'] || s['telephone'] || '',
    qualification: s['doctorQualification'] || s['qualification'] || 'BDS',
    regNumber:     s['regNumber'] || s['registrationNumber'] || s['reg_number'] || '',
    designation:   s['designation'] || s['doctorDesignation'] || 'Dental Surgeon',
  };
}

function getFormAbbrev(form?: string): string {
  const f = (form || '').toLowerCase();
  if (f.includes('tablet'))                        return 'Tab.';
  if (f.includes('capsule'))                       return 'Cap.';
  if (f.includes('syrup') || f.includes('suspension')) return 'Syr.';
  if (f.includes('injection') || f.includes('inj')) return 'Inj.';
  if (f.includes('ointment') || f.includes('cream')) return 'Oint.';
  if (f.includes('drop'))                          return 'Drops';
  if (f.includes('inhaler'))                       return 'Inh.';
  if (f.includes('gel'))                           return 'Gel';
  if (f.includes('patch'))                         return 'Patch';
  if (f.includes('suppository'))                   return 'Supp.';
  return '';
}

function rxCalcAge(dob?: string): number | null {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function rxFmtDate(d?: string): string {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
}

function rxEsc(s?: string): string {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const RX_PRINT_CSS = `
  @page { size: A4 portrait; margin: 14mm 16mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11.5pt; color: #000; background: #fff; }
  .rx-page { max-width: 178mm; margin: 0 auto; }
  .page-break { page-break-after: always; padding-bottom: 18mm; }

  /* ── Header ── */
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; }
  .clinic-col { display: flex; align-items: flex-start; gap: 10px; }
  .caduceus { font-size: 52pt; line-height: 1; color: #1a3a6e; font-family: 'Segoe UI Symbol', serif; }
  .cln { font-size: 19pt; font-weight: 700; color: #1a3a6e; font-family: Arial, Helvetica, sans-serif; line-height: 1.1; }
  .caddr { font-size: 10pt; color: #222; margin-top: 4px; line-height: 1.55; }
  .doc-col { text-align: right; }
  .doc-name { font-size: 13.5pt; font-weight: 700; color: #000; font-family: Arial, Helvetica, sans-serif; }
  .doc-meta { font-size: 10pt; color: #222; line-height: 1.55; }

  /* ── Dividers ── */
  .rule { border: none; border-top: 1.5px solid #1a3a6e; margin: 8px 0; }
  .rule-footer { border: none; border-top: 1px solid #1a3a6e; margin: 18px 0 8px; }

  /* ── Rx row ── */
  .rx-row { display: flex; justify-content: space-between; align-items: flex-end; margin: 14px 0 10px; }
  .rxsym { font-size: 50pt; font-weight: 300; line-height: 1; font-family: 'Times New Roman', serif; }
  .rxsym sub { font-size: 25pt; vertical-align: sub; }
  .rxdate { font-size: 11pt; }

  /* ── Patient table ── */
  .pt-tbl { margin-bottom: 14px; }
  .pt-tbl td { padding: 2.5px 0; font-size: 11pt; vertical-align: top; }
  .ptl { width: 78px; }
  .ptc { width: 18px; text-align: center; }
  .ptv { font-weight: 700; }

  /* ── Medicine table ── */
  .med-tbl { width: 100%; border-collapse: collapse; }
  .med-tbl thead tr { border-top: 2px solid #000; border-bottom: 2px solid #000; }
  .med-tbl th { padding: 6px 6px; font-size: 11.5pt; font-weight: 700; text-align: left; }
  .med-tbl td { padding: 8px 6px; font-size: 11pt; vertical-align: top; }
  .sno  { width: 54px; }
  .med  { width: 34%; }
  .dose { width: 18%; }

  /* ── Bottom ── */
  .bottom { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 20px; gap: 16px; }
  .advice { flex: 1; }
  .adv-title { font-weight: 700; font-size: 11pt; margin-bottom: 5px; }
  .adv-list { padding-left: 18px; font-size: 10.5pt; }
  .adv-list li { margin-bottom: 3px; }
  .review { font-size: 10.5pt; margin-top: 10px; }
  .sig-area { text-align: center; min-width: 165px; }
  .sig-space { height: 52px; }
  .sig-line { border-top: 1px solid #000; padding-top: 5px; font-size: 11pt; font-weight: 700; }
  .sig-reg { font-size: 10pt; margin-top: 2px; }

  /* ── Footer ── */
  .footer-txt { text-align: center; font-size: 9.5pt; color: #444; line-height: 1.6; }

  @media print { body { margin: 0; } }
`;

function buildRxPageHtml(rx: Prescription, visit: any, clinic: ClinicPrintInfo, isLast: boolean): string {
  const patient  = rx.patient || visit?.patient;
  const dentist  = rx.dentist;
  const docName  = dentist ? `${dentist.firstName || ''} ${dentist.lastName || ''}`.trim() : '—';
  const ptName   = patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : '—';
  const ptCode   = patient?.patientCode || '—';
  const age      = rxCalcAge((patient as any)?.dateOfBirth);

  const itemRows = rx.items.map((item, idx) => {
    const abbrev  = getFormAbbrev(item.drug.form);
    const medName = rxEsc([abbrev, item.drug.name, item.drug.strength].filter(Boolean).join(' '));
    const doseStr = rxEsc(item.drug.strength || item.dosage || '—');
    const instrParts = [item.dosage, item.frequency, item.duration && item.duration !== 'as directed' ? `for ${item.duration}` : '', item.instructions].filter(Boolean);
    return `<tr>
        <td class="sno">${idx + 1}.</td>
        <td class="med">${medName}</td>
        <td class="dose">${doseStr}</td>
        <td>${rxEsc(instrParts.join(' '))}</td>
      </tr>`;
  }).join('');

  const notesBullets = rx.notes
    ? rx.notes.split('\n').filter(l => l.trim()).map(l => `<li>${rxEsc(l)}</li>`).join('')
    : '';

  const clinicAddrHtml = [clinic.address, clinic.city].filter(Boolean).map(rxEsc).join('<br>');
  const phoneHtml      = clinic.phone ? `Ph: ${rxEsc(clinic.phone)}` : '';

  return `
<div class="rx-page${isLast ? '' : ' page-break'}">
  <!-- HEADER -->
  <div class="hdr">
    <div class="clinic-col">
      <div class="caduceus">⚕</div>
      <div>
        <div class="cln">${rxEsc(clinic.name)}</div>
        ${clinicAddrHtml ? `<div class="caddr">${clinicAddrHtml}</div>` : ''}
        ${phoneHtml       ? `<div class="caddr">${phoneHtml}</div>`       : ''}
      </div>
    </div>
    <div class="doc-col">
      <div class="doc-name">Dr. ${rxEsc(docName)}</div>
      <div class="doc-meta">${rxEsc(clinic.qualification)}</div>
      ${clinic.regNumber ? `<div class="doc-meta">Reg. No.: ${rxEsc(clinic.regNumber)}</div>` : ''}
      <div class="doc-meta">${rxEsc(clinic.designation)}</div>
    </div>
  </div>
  <hr class="rule">

  <!-- Rx + Date -->
  <div class="rx-row">
    <div class="rxsym">R<sub>x</sub></div>
    <div class="rxdate">Date:&nbsp;&nbsp;${rxFmtDate(rx.createdAt)}</div>
  </div>

  <!-- Patient Info -->
  <table class="pt-tbl">
    <tr><td class="ptl">Name</td><td class="ptc">:</td><td class="ptv">${rxEsc(ptName)}</td></tr>
    <tr><td class="ptl">Age / Sex</td><td class="ptc">:</td><td>${age !== null ? age + ' Y' : '—'}</td></tr>
    <tr><td class="ptl">UHID</td><td class="ptc">:</td><td>${rxEsc(ptCode)}</td></tr>
  </table>

  <!-- Medicine Table -->
  <table class="med-tbl">
    <thead>
      <tr>
        <th class="sno">S. No.</th>
        <th class="med">Medicine</th>
        <th class="dose">Dose / Strength</th>
        <th>Instructions</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="4" style="text-align:center;color:#888;padding:10px">No medications listed</td></tr>'}
    </tbody>
  </table>
  <hr class="rule">

  <!-- Advice + Signature -->
  <div class="bottom">
    <div class="advice">
      ${rx.notes ? `<div class="adv-title">Advice / Notes:</div><ul class="adv-list">${notesBullets}</ul>` : ''}
      ${rx.validUntil ? `<div class="review">Review after: ${rxFmtDate(rx.validUntil)}</div>` : ''}
    </div>
    <div class="sig-area">
      <div class="sig-space"></div>
      <div class="sig-line">Dr. ${rxEsc(docName)}</div>
      ${clinic.regNumber ? `<div class="sig-reg">Reg. No.: ${rxEsc(clinic.regNumber)}</div>` : ''}
    </div>
  </div>

  <!-- Footer -->
  <hr class="rule-footer">
  <div class="footer-txt">
    This is a computer generated prescription.<br>
    Not valid for medico-legal purpose.
  </div>
</div>`;
}

function printPrescription(rx: Prescription, visit?: any, clinicSettings: Record<string, string> = {}) {
  const clinic = buildClinicPrintInfo(clinicSettings);
  const html = `<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8">
    <title>Prescription – ${rxEsc(rx.prescriptionCode)}</title>
    <style>${RX_PRINT_CSS}</style>
  </head><body>
    ${buildRxPageHtml(rx, visit, clinic, true)}
    <script>window.onload = () => { window.print(); window.close(); };</script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=820,height=1060');
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── Helper: Print ALL Prescriptions in One Document ─────────────────────────

// ─── Helper: Print ALL Prescriptions in One Document (Professional Borderless Table View) ─────────

// ─── Helper: Print ALL Prescriptions in One Document (Single Page - No Page Breaks) ─────────

// Print ALL prescriptions for the patient on a SINGLE consolidated page.
// One header, one patient block, one unified numbered medicine table,
// combined advice notes, one signature.
function printAllPrescriptions(prescriptions: Prescription[], visit?: any, clinicSettings: Record<string, string> = {}) {
  if (prescriptions.length === 0) return;
  const clinic = buildClinicPrintInfo(clinicSettings);

  // Patient (use first prescription, fall back to visit)
  const patient = prescriptions[0].patient || visit?.patient;
  const ptName = patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : '—';
  const ptCode = patient?.patientCode || '—';
  const age    = rxCalcAge((patient as any)?.dateOfBirth);

  // Doctor — pick first dentist; warn if mixed
  const dentists = prescriptions.map(p => p.dentist).filter(Boolean) as any[];
  const dentistIds = new Set(dentists.map(d => d.id));
  const docPick = dentists[0];
  const docName = docPick ? `${docPick.firstName || ''} ${docPick.lastName || ''}`.trim() : '—';
  const multipleDoctors = dentistIds.size > 1;

  // Date — use the latest prescription's createdAt
  const latestDate = prescriptions
    .map(p => new Date(p.createdAt).getTime())
    .reduce((a, b) => Math.max(a, b), 0);

  // Latest validUntil (across all)
  const validUntils = prescriptions
    .map(p => p.validUntil ? new Date(p.validUntil).getTime() : 0)
    .filter(Boolean);
  const latestValidUntil = validUntils.length
    ? new Date(Math.max(...validUntils)).toISOString()
    : undefined;

  // Combine all items into one continuous numbered table
  let serialNo = 0;
  const itemRows = prescriptions
    .flatMap(rx => rx.items.map(item => {
      serialNo++;
      const abbrev  = getFormAbbrev(item.drug.form);
      const medName = rxEsc([abbrev, item.drug.name, item.drug.strength].filter(Boolean).join(' '));
      const doseStr = rxEsc(item.drug.strength || item.dosage || '—');
      const instrParts = [
        item.dosage,
        item.frequency,
        item.duration && item.duration !== 'as directed' ? `for ${item.duration}` : '',
        item.instructions,
      ].filter(Boolean);
      return `<tr>
        <td class="sno">${serialNo}.</td>
        <td class="med">${medName}</td>
        <td class="dose">${doseStr}</td>
        <td>${rxEsc(instrParts.join(' '))}</td>
      </tr>`;
    }))
    .join('');

  // Combine all notes (preserve per-prescription separation as bullets)
  const noteBullets = prescriptions
    .filter(rx => rx.notes && rx.notes.trim())
    .flatMap(rx => rx.notes!.split('\n').filter(l => l.trim()))
    .map(l => `<li>${rxEsc(l)}</li>`)
    .join('');

  const clinicAddrHtml = [clinic.address, clinic.city].filter(Boolean).map(rxEsc).join('<br>');
  const phoneHtml      = clinic.phone ? `Ph: ${rxEsc(clinic.phone)}` : '';

  const pageHtml = `
<div class="rx-page">
  <!-- HEADER -->
  <div class="hdr">
    <div class="clinic-col">
      <div class="caduceus">⚕</div>
      <div>
        <div class="cln">${rxEsc(clinic.name)}</div>
        ${clinicAddrHtml ? `<div class="caddr">${clinicAddrHtml}</div>` : ''}
        ${phoneHtml       ? `<div class="caddr">${phoneHtml}</div>`       : ''}
      </div>
    </div>
    <div class="doc-col">
      <div class="doc-name">Dr. ${rxEsc(docName)}</div>
      <div class="doc-meta">${rxEsc(clinic.qualification)}</div>
      ${clinic.regNumber ? `<div class="doc-meta">Reg. No.: ${rxEsc(clinic.regNumber)}</div>` : ''}
      <div class="doc-meta">${rxEsc(clinic.designation)}</div>
      ${multipleDoctors ? `<div class="doc-meta" style="color:#b45309;font-size:9pt;margin-top:4px">⚠ Multiple prescribers</div>` : ''}
    </div>
  </div>
  <hr class="rule">

  <!-- Rx + Date -->
  <div class="rx-row">
    <div class="rxsym">R<sub>x</sub></div>
    <div class="rxdate">Date:&nbsp;&nbsp;${rxFmtDate(new Date(latestDate).toISOString())}</div>
  </div>

  <!-- Patient Info -->
  <table class="pt-tbl">
    <tr><td class="ptl">Name</td><td class="ptc">:</td><td class="ptv">${rxEsc(ptName)}</td></tr>
    <tr><td class="ptl">Age / Sex</td><td class="ptc">:</td><td>${age !== null ? age + ' Y' : '—'}</td></tr>
    <tr><td class="ptl">UHID</td><td class="ptc">:</td><td>${rxEsc(ptCode)}</td></tr>
  </table>

  <!-- Unified Medicine Table -->
  <table class="med-tbl">
    <thead>
      <tr>
        <th class="sno">S. No.</th>
        <th class="med">Medicine</th>
        <th class="dose">Dose / Strength</th>
        <th>Instructions</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="4" style="text-align:center;color:#888;padding:10px">No medications listed</td></tr>'}
    </tbody>
  </table>
  <hr class="rule">

  <!-- Advice + Signature -->
  <div class="bottom">
    <div class="advice">
      ${noteBullets ? `<div class="adv-title">Advice / Notes:</div><ul class="adv-list">${noteBullets}</ul>` : ''}
      ${latestValidUntil ? `<div class="review">Review after: ${rxFmtDate(latestValidUntil)}</div>` : ''}
    </div>
    <div class="sig-area">
      <div class="sig-space"></div>
      <div class="sig-line">Dr. ${rxEsc(docName)}</div>
      ${clinic.regNumber ? `<div class="sig-reg">Reg. No.: ${rxEsc(clinic.regNumber)}</div>` : ''}
    </div>
  </div>

  <!-- Footer -->
  <hr class="rule-footer">
  <div class="footer-txt">
    This is a computer generated prescription.<br>
    Not valid for medico-legal purpose.
  </div>
</div>`;

  const html = `<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8">
    <title>All Prescriptions – ${rxEsc(ptName)}</title>
    <style>${RX_PRINT_CSS}</style>
  </head><body>
    ${pageHtml}
    <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 350); };</script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=820,height=1060');
  if (w) { w.document.write(html); w.document.close(); }
  else alert('Please allow popups to print prescriptions.');
}

/* ── Legacy large impl below is kept as reference (commented out) ── */
function _printAllPrescriptions_legacy(prescriptions: Prescription[], visit?: any) {
  if (prescriptions.length === 0) return;

  // ─── Helpers ───
  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const escapeHtml = (str?: string) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const getStatusInfo = (status: string, validUntil?: string) => {
    let isExpired = false;
    if (status === 'ACTIVE' && validUntil) {
      if (new Date(validUntil) < new Date()) isExpired = true;
    }
    if (isExpired) return { label: 'EXPIRED', className: 'expired' };
    switch (status) {
      case 'ACTIVE':
        return { label: 'ACTIVE', className: 'active' };
      case 'DISPENSED':
        return { label: 'DISPENSED', className: 'dispensed' };
      case 'CANCELLED':
        return { label: 'CANCELLED', className: 'cancelled' };
      default:
        return { label: status, className: '' };
    }
  };

  // ─── Single Patient (from first prescription) ───
  const firstPatient = prescriptions[0].patient || visit?.patient;
  const patientName = firstPatient
    ? `${firstPatient.firstName || ''} ${firstPatient.lastName || ''}`.trim()
    : '—';
  const patientIdCode = firstPatient?.patientCode ? ` (${firstPatient.patientCode})` : '';
  const patientDob = firstPatient?.dateOfBirth
    ? `DOB: ${formatDate(firstPatient.dateOfBirth)}`
    : '';

  // ─── Single Prescriber (from first prescription, with warning if mixed) ───
  const dentists = new Set(
    prescriptions
      .map((rx) => {
        const d = rx.dentist;
        return d ? `Dr. ${d.firstName || ''} ${d.lastName || ''}`.trim() : null;
      })
      .filter(Boolean)
  );
  const prescriberName = dentists.values().next().value || '—';
  const multiplePrescribers = dentists.size > 1;

  // ─── Build unified table rows ───
  let tableRows = '';
  let totalItems = 0;

  prescriptions.forEach((rx) => {
    const statusObj = getStatusInfo(rx.status, rx.validUntil);
    const rxCode = escapeHtml(rx.prescriptionCode || rx.id?.slice(0, 8));
    const rxDate = formatDate(rx.createdAt);
    const rxValid = rx.validUntil ? formatDate(rx.validUntil) : '—';
    const rxDispensed = rx.dispensedAt ? formatDate(rx.dispensedAt) : null;

    if (!rx.items || rx.items.length === 0) {
      // Empty prescription row
      tableRows += `
        <tr class="rx-group-start">
          <td class="rx-code-cell">${rxCode}</td>
          <td><span class="rx-status ${statusObj.className}">${statusObj.label}</span></td>
          <td class="date-cell">${rxDate}</td>
          <td class="muted" colspan="5">No medication items recorded</td>
          <td class="num-cell">—</td>
          <td class="num-cell">—</td>
        </tr>
      `;
    } else {
      rx.items.forEach((item, idx) => {
        totalItems++;
        const drugName = item.drug?.name || 'Medication';
        const strength = item.drug?.strength ? ` ${item.drug.strength}` : '';
        const form = item.drug?.form ? ` (${item.drug.form})` : '';
        const drugDisplay = `${drugName}${strength}${form}`;

        const instructions = item.instructions?.trim()
          ? `<div class="item-instructions">📋 ${escapeHtml(item.instructions)}</div>`
          : '';
        const rxNotes = idx === 0 && rx.notes?.trim()
          ? `<div class="rx-notes">📝 ${escapeHtml(rx.notes)}</div>`
          : '';

        tableRows += `
          <tr class="${idx === 0 ? 'rx-group-start' : ''}">
            <td class="rx-code-cell">${idx === 0 ? rxCode : ''}</td>
            <td>${idx === 0 ? `<span class="rx-status ${statusObj.className}">${statusObj.label}</span>` : ''}</td>
            <td class="date-cell">${idx === 0 ? rxDate : ''}</td>
            <td class="drug-cell">
              ${escapeHtml(drugDisplay)}
              ${instructions}
              ${rxNotes}
            </td>
            <td>${escapeHtml(item.dosage || '—')}</td>
            <td>${escapeHtml(item.frequency || '—')}</td>
            <td>${escapeHtml(item.duration || '—')}</td>
            <td>${escapeHtml(item.route || '—')}</td>
            <td class="num-cell">${item.quantity ?? 0}</td>
            <td class="num-cell">${item.refills ?? 0}</td>
          </tr>
        `;
      });
    }

    // Optional: subtle separator row between prescriptions
    tableRows += `
      <tr class="row-spacer">
        <td colspan="10"></td>
      </tr>
    `;
  });

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const currentDateTime = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // ─── HTML Document ───
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Prescriptions | ${escapeHtml(patientName)}</title>
      <style>
        @page { size: A4 landscape; margin: 1cm 1cm; }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
          color: #0f172a;
          font-size: 10.5px;
          line-height: 1.35;
          background: white;
        }

        .print-container {
          max-width: 100%;
          margin: 0 auto;
          padding: 0;
        }

        /* Header */
        .doc-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 14px;
          padding-bottom: 10px;
          border-bottom: 2px solid #1e3a5f;
        }

        .doc-header-left .clinic-name {
          font-size: 20px;
          font-weight: 700;
          color: #0c4a6e;
          letter-spacing: -0.3px;
        }

        .doc-header-left .clinic-tagline {
          font-size: 10px;
          color: #64748b;
          margin-top: 2px;
        }

        .doc-header-right {
          text-align: right;
        }

        .doc-header-right .patient-name {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
        }

        .doc-header-right .patient-meta {
          font-size: 10px;
          color: #475569;
          margin-top: 2px;
        }

        .print-meta {
          text-align: right;
          font-size: 9px;
          color: #94a3b8;
          margin-bottom: 10px;
        }

        /* Unified Table */
        .rx-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
        }

        .rx-table thead th {
          text-align: left;
          background: #f1f5f9;
          color: #334155;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 9px;
          letter-spacing: 0.4px;
          padding: 7px 6px;
          border-bottom: 2px solid #cbd5e1;
          white-space: nowrap;
        }

        .rx-table tbody td {
          padding: 6px;
          vertical-align: top;
          border-bottom: 1px solid #e2e8f0;
        }

        .rx-table tbody tr.rx-group-start td {
          padding-top: 10px;
        }

        .rx-table tbody tr.row-spacer td {
          height: 4px;
          padding: 0;
          border-bottom: none;
        }

        .rx-code-cell {
          font-family: 'SF Mono', 'Courier New', monospace;
          font-weight: 700;
          color: #0c4a6e;
          white-space: nowrap;
          width: 90px;
        }

        .date-cell { white-space: nowrap; color: #475569; width: 80px; }

        .rx-status {
          display: inline-block;
          font-size: 9px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 12px;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .rx-status.active   { background: #dbeafe; color: #1e40af; }
        .rx-status.dispensed { background: #dcfce7; color: #166534; }
        .rx-status.cancelled { background: #fee2e2; color: #991b1b; }
        .rx-status.expired   { background: #f1f5f9; color: #475569; }

        .drug-cell {
          font-weight: 600;
          color: #0f172a;
          min-width: 180px;
        }

        .item-instructions {
          font-weight: 400;
          font-size: 9px;
          color: #475569;
          margin-top: 3px;
          padding: 3px 6px;
          background: #fefce8;
          border-radius: 4px;
          display: inline-block;
        }

        .rx-notes {
          font-weight: 400;
          font-size: 9px;
          color: #92400e;
          margin-top: 3px;
          padding: 3px 6px;
          background: #fffbeb;
          border-left: 2px solid #f59e0b;
          border-radius: 0 4px 4px 0;
        }

        .num-cell { text-align: center; width: 50px; }

        .muted { color: #94a3b8; font-style: italic; }

        /* Footer / Prescriber */
        .doc-footer {
          margin-top: 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .validity-summary {
          font-size: 9px;
          color: #64748b;
        }

        .signature-block {
          text-align: center;
        }

        .signature-line {
          width: 260px;
          border-top: 1px solid #334155;
          padding-top: 6px;
          font-size: 10px;
          color: #0f172a;
          font-weight: 600;
        }

        .signature-label {
          font-size: 9px;
          color: #64748b;
          margin-top: 2px;
        }

        .prescriber-warning {
          font-size: 9px;
          color: #b45309;
          margin-top: 4px;
        }

        .page-footer {
          margin-top: 14px;
          text-align: center;
          font-size: 8px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          padding-top: 6px;
        }

        @media print {
          body { background: white; }
          .rx-table tbody tr { break-inside: avoid; page-break-inside: avoid; }
          .signature-block { break-inside: avoid; page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="print-container">
        <!-- Header -->
        <div class="doc-header">
          <div class="doc-header-left">
            <div class="clinic-name">🏥 DENTAL HEALTH MANAGEMENT SYSTEM</div>
            <div class="clinic-tagline">Professional Dental Care · Electronic Prescriptions</div>
          </div>
          <div class="doc-header-right">
            <div class="patient-name">${escapeHtml(patientName)}${escapeHtml(patientIdCode)}</div>
            <div class="patient-meta">${patientDob} · ${prescriptions.length} Rx · ${totalItems} Medication${totalItems !== 1 ? 's' : ''}</div>
          </div>
        </div>

        <div class="print-meta">Generated: ${currentDateTime}</div>

        <!-- Unified Prescriptions Table -->
        <table class="rx-table">
          <thead>
            <tr>
              <th>Rx Code</th>
              <th>Status</th>
              <th>Date</th>
              <th>Medication</th>
              <th>Dosage</th>
              <th>Frequency</th>
              <th>Duration</th>
              <th>Route</th>
              <th class="num-cell">Qty</th>
              <th class="num-cell">Refills</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <!-- Footer with Single Prescriber -->
        <div class="doc-footer">
          <div class="validity-summary">
            <strong>Prescriber:</strong> ${escapeHtml(prescriberName)}
            ${multiplePrescribers ? `<div class="prescriber-warning">⚠️ Multiple prescribers detected in this list</div>` : ''}
          </div>
          <div class="signature-block">
            <div class="signature-line">${escapeHtml(prescriberName)}</div>
            <div class="signature-label">Prescriber Signature / Digital Stamp</div>
          </div>
        </div>

        <div class="page-footer">
          This is a computer-generated prescription summary. Valid only with attending dentist's signature and official stamp.
          <br>DHMS · ${new Date().getFullYear()} · Page 1 of 1
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 300);
        };
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank', 'width=1200,height=900,menubar=yes,toolbar=yes');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    alert('Please allow popups to print prescriptions. Check your browser settings.');
  }
} // end _printAllPrescriptions_legacy

// function printAllPrescriptions(prescriptions: Prescription[], visit?: any) {
//   if (prescriptions.length === 0) return;

//   // Helper function to format date safely
//   const formatDate = (dateString?: string) => {
//     if (!dateString) return '—';
//     try {
//       return new Date(dateString).toLocaleDateString('en-US', { 
//         year: 'numeric', 
//         month: 'short', 
//         day: 'numeric' 
//       });
//     } catch {
//       return '—';
//     }
//   };

//   // Helper to escape HTML
//   const escapeHtml = (str?: string) => {
//     if (!str) return '';
//     return str
//       .replace(/&/g, '&amp;')
//       .replace(/</g, '&lt;')
//       .replace(/>/g, '&gt;')
//       .replace(/"/g, '&quot;')
//       .replace(/'/g, '&#39;');
//   };

//   // Get status class and label
//   const getStatusInfo = (status: string, validUntil?: string) => {
//     let isExpired = false;
//     if (status === "ACTIVE" && validUntil) {
//       if (new Date(validUntil) < new Date()) isExpired = true;
//     }
//     if (isExpired) return { label: "EXPIRED", className: "expired" };
//     switch (status) {
//       case "ACTIVE": return { label: "ACTIVE", className: "active" };
//       case "DISPENSED": return { label: "DISPENSED", className: "dispensed" };
//       case "CANCELLED": return { label: "CANCELLED", className: "cancelled" };
//       default: return { label: status, className: "" };
//     }
//   };

//   // Build HTML for all prescriptions (single page - no forced page breaks)
//   const prescriptionsHtml = prescriptions.map((rx, index) => {
//     const patient = rx.patient || visit?.patient;
//     const dentist = rx.dentist;
//     const patientName = patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : '—';
//     const patientIdCode = patient?.patientCode ? ` (${patient.patientCode})` : '';
//     const patientDob = patient?.dateOfBirth ? ` | DOB: ${formatDate(patient.dateOfBirth)}` : '';
//     const dentistName = dentist ? `Dr. ${dentist.firstName || ''} ${dentist.lastName || ''}`.trim() : '—';
//     const statusObj = getStatusInfo(rx.status, rx.validUntil);
    
//     // Build items table HTML
//     let itemsHtml = '';
//     if (rx.items && rx.items.length) {
//       itemsHtml = `
//         <table class="items-table">
//           <thead>
//             <tr>
//               <th class="drug-name-cell">Medication</th>
//               <th class="dosage-cell">Dosage</th>
//               <th class="freq-cell">Frequency</th>
//               <th class="duration-cell">Duration</th>
//               <th class="route-cell">Route</th>
//               <th class="qty-cell">Qty</th>
//               <th class="refill-cell">Refills</th>
//             </tr>
//           </thead>
//           <tbody>
//       `;
      
//       rx.items.forEach(item => {
//         const drugName = item.drug?.name || "Medication";
//         const strengthInfo = item.drug?.strength ? ` ${item.drug.strength}` : "";
//         const drugDisplay = `${drugName}${strengthInfo}${item.drug?.form ? ` (${item.drug.form})` : ''}`;
        
//         itemsHtml += `
//           <tr>
//             <td class="drug-name-cell">${escapeHtml(drugDisplay)}</td>
//             <td class="dosage-cell">${escapeHtml(item.dosage || '—')}</td>
//             <td class="freq-cell">${escapeHtml(item.frequency || '—')}</td>
//             <td class="duration-cell">${escapeHtml(item.duration || '—')}</td>
//             <td class="route-cell">${escapeHtml(item.route || '—')}</td>
//             <td class="qty-cell">${item.quantity || 0}</td>
//             <td class="refill-cell">${item.refills ?? 0}</td>
//           </tr>
//         `;
        
//         // Add instructions row if present
//         if (item.instructions && item.instructions.trim()) {
//           itemsHtml += `
//             <tr class="instructions-row">
//               <td colspan="7" class="instructions-cell">
//                 📋 <strong>Instructions:</strong> ${escapeHtml(item.instructions)}
//               </td>
//             </tr>
//           `;
//         }
//       });
      
//       itemsHtml += `
//           </tbody>
//         </table>
//       `;
//     } else {
//       itemsHtml = `<div class="no-items">No medication items recorded.</div>`;
//     }
    
//     // Add separator between prescriptions (except after last one)
//     const separator = index < prescriptions.length - 1 ? '<div class="prescription-separator"></div>' : '';
    
//     return `
//       <div class="prescription-block">
//         <!-- Header Row with Prescription Code and Status -->
//         <div class="rx-meta-row">
//           <span class="rx-code">${escapeHtml(rx.prescriptionCode || rx.id?.slice(0, 8))}</span>
//           <div class="rx-meta-right">
//             <span class="rx-status ${statusObj.className}">${statusObj.label}</span>
//             <span class="rx-date">📅 ${formatDate(rx.createdAt)}</span>
//           </div>
//         </div>
        
//         <!-- Patient and Dentist Info -->
//         <div class="info-row">
//           <div class="info-cell">
//             <span class="info-label">👤 Patient:</span>
//             <span class="info-value">${escapeHtml(patientName)}${escapeHtml(patientIdCode)}${patientDob}</span>
//           </div>
//           <div class="info-cell">
//             <span class="info-label">🦷 Prescriber:</span>
//             <span class="info-value">${escapeHtml(dentistName)}</span>
//           </div>
//         </div>
        
//         <!-- Borderless Medication Table -->
//         ${itemsHtml}
        
//         <!-- Notes Section -->
//         ${rx.notes ? `
//           <div class="notes-section">
//             📋 <strong>Note:</strong> ${escapeHtml(rx.notes)}
//           </div>
//         ` : ''}
        
//         <!-- Validity and Dispensing Info -->
//         <div class="validity-note">
//           <strong>Valid until:</strong> ${rx.validUntil ? formatDate(rx.validUntil) : 'Not specified'} 
//           ${rx.dispensedAt ? ` | <strong>Dispensed:</strong> ${formatDate(rx.dispensedAt)} ${rx.dispensedBy ? `by ${escapeHtml(rx.dispensedBy)}` : ''}` : ''}
//         </div>
        
//         <!-- Signature Line -->
//         <div class="signature-area">
//           <div class="signature-line">
//             Prescriber Signature / Digital Stamp
//           </div>
//         </div>
//       </div>
//       ${separator}
//     `;
//   }).join('');

//   // Calculate total medications count
//   const totalMedications = prescriptions.reduce((sum, rx) => sum + (rx.items?.length || 0), 0);
//   const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
//   const currentDateTime = new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

//   // Complete HTML document - SINGLE PAGE, NO FORCED PAGE BREAKS
//   const html = `
//     <!DOCTYPE html>
//     <html lang="en">
//     <head>
//       <meta charset="UTF-8">
//       <meta name="viewport" content="width=device-width, initial-scale=1.0">
//       <title>Prescriptions Summary | ${currentDate}</title>
//       <style>
//         * {
//           margin: 0;
//           padding: 0;
//           box-sizing: border-box;
//         }
        
//         /* CRITICAL: Single page - no page breaks inside */
//         @page {
//           size: A4;
//           margin: 1.5cm 1.2cm;
//         }
        
//         body {
//           font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
//           background: white;
//           color: #0f172a;
//           line-height: 1.4;
//           padding: 0;
//           margin: 0;
//         }
        
//         /* Main container */
//         .print-container {
//           max-width: 100%;
//           margin: 0 auto;
//           background: white;
//         }
        
//         /* Header Section */
//         .prescription-header {
//           text-align: center;
//           margin-bottom: 20px;
//           padding-bottom: 12px;
//           border-bottom: 2px solid #1e3a5f;
//         }
        
//         .clinic-name {
//           font-size: 24px;
//           font-weight: 700;
//           letter-spacing: -0.3px;
//           color: #0c4a6e;
//           margin-bottom: 4px;
//         }
        
//         .clinic-tagline {
//           font-size: 11px;
//           color: #475569;
//           letter-spacing: 0.3px;
//         }
        
//         .print-date {
//           font-size: 10px;
//           color: #64748b;
//           margin-top: 6px;
//         }
        
//         /* Summary Strip */
//         .summary-strip {
//           display: flex;
//           justify-content: space-between;
//           align-items: baseline;
//           margin-bottom: 20px;
//           padding: 8px 12px;
//           background: #f8fafc;
//           border-radius: 8px;
//         }
        
//         .prescription-count {
//           font-weight: 600;
//           font-size: 12px;
//           color: #1e3a5f;
//         }
        
//         .print-timestamp {
//           font-size: 10px;
//           color: #64748b;
//         }
        
//         /* Prescriptions List Container */
//         .prescriptions-list {
//           display: flex;
//           flex-direction: column;
//         }
        
//         /* Individual Prescription Block - NO PAGE BREAKS */
//         .prescription-block {
//           break-inside: avoid;
//           page-break-inside: avoid;
//           background: #ffffff;
//           margin-bottom: 20px;
//           padding: 16px;
//           border: 1px solid #e2e8f0;
//           border-radius: 12px;
//         }
        
//         /* Separator between prescriptions */
//         .prescription-separator {
//           height: 1px;
//           background: linear-gradient(to right, transparent, #cbd5e1, transparent);
//           margin: 8px 0 16px 0;
//         }
        
//         /* Meta Row */
//         .rx-meta-row {
//           display: flex;
//           flex-wrap: wrap;
//           justify-content: space-between;
//           align-items: baseline;
//           margin-bottom: 12px;
//           padding-bottom: 8px;
//           border-bottom: 1px solid #e2e8f0;
//         }
        
//         .rx-code {
//           font-family: 'SF Mono', 'Courier New', monospace;
//           font-weight: 700;
//           font-size: 13px;
//           color: #0c4a6e;
//           background: #eef2ff;
//           padding: 4px 12px;
//           border-radius: 20px;
//           letter-spacing: 0.3px;
//         }
        
//         .rx-meta-right {
//           display: flex;
//           gap: 12px;
//           align-items: center;
//         }
        
//         .rx-status {
//           font-size: 10px;
//           font-weight: 600;
//           padding: 3px 10px;
//           border-radius: 20px;
//           text-transform: uppercase;
//         }
        
//         .rx-status.expired {
//           background: #f1f5f9;
//           color: #475569;
//         }
        
//         .rx-status.dispensed {
//           background: #dcfce7;
//           color: #166534;
//         }
        
//         .rx-status.cancelled {
//           background: #fee2e2;
//           color: #991b1b;
//         }
        
//         .rx-status.active {
//           background: #dbeafe;
//           color: #1e40af;
//         }
        
//         .rx-date {
//           font-size: 10px;
//           color: #64748b;
//         }
        
//         /* Patient & Doctor Info Row */
//         .info-row {
//           display: flex;
//           flex-wrap: wrap;
//           justify-content: space-between;
//           margin-bottom: 14px;
//           font-size: 11px;
//           padding: 6px 0;
//         }
        
//         .info-cell {
//           display: flex;
//           gap: 6px;
//           flex-wrap: wrap;
//           align-items: baseline;
//         }
        
//         .info-label {
//           font-weight: 600;
//           color: #475569;
//           min-width: 70px;
//         }
        
//         .info-value {
//           color: #0f172a;
//           font-weight: 500;
//         }
        
//         /* BORDERLESS TABLE - Clean Medical Style */
//         .items-table {
//           width: 100%;
//           border-collapse: collapse;
//           font-size: 11px;
//           margin: 10px 0 6px;
//         }
        
//         .items-table th {
//           text-align: left;
//           font-weight: 600;
//           color: #475569;
//           background: #f8fafc;
//           padding: 8px 6px 6px 0;
//           border-bottom: 1px solid #e2e8f0;
//           font-size: 10px;
//           text-transform: uppercase;
//           letter-spacing: 0.5px;
//         }
        
//         .items-table td {
//           padding: 7px 6px 7px 0;
//           vertical-align: top;
//           color: #1e293b;
//           border-bottom: 1px solid #f1f5f9;
//         }
        
//         .drug-name-cell {
//           font-weight: 600;
//           width: 28%;
//         }
        
//         .dosage-cell {
//           width: 14%;
//         }
        
//         .freq-cell {
//           width: 18%;
//         }
        
//         .duration-cell {
//           width: 12%;
//         }
        
//         .route-cell {
//           width: 10%;
//         }
        
//         .qty-cell {
//           width: 8%;
//           text-align: center;
//         }
        
//         .refill-cell {
//           width: 10%;
//           text-align: center;
//         }
        
//         .instructions-row td {
//           padding-top: 2px;
//           padding-bottom: 6px;
//         }
        
//         .instructions-cell {
//           font-size: 10px;
//           color: #475569;
//           background: #fefce8;
//           padding: 6px 10px !important;
//           border-radius: 6px;
//         }
        
//         .no-items {
//           padding: 12px;
//           font-size: 11px;
//           color: #94a3b8;
//           text-align: center;
//           background: #f8fafc;
//           border-radius: 8px;
//         }
        
//         /* Notes Section */
//         .notes-section {
//           margin-top: 10px;
//           padding: 8px 12px;
//           background: #fffbeb;
//           font-size: 10px;
//           border-left: 3px solid #f59e0b;
//           color: #92400e;
//           border-radius: 6px;
//         }
        
//         /* Validity Note */
//         .validity-note {
//           font-size: 9px;
//           color: #64748b;
//           margin-top: 10px;
//           padding-top: 8px;
//           text-align: right;
//           border-top: 1px dashed #e2e8f0;
//         }
        
//         /* Signature Area */
//         .signature-area {
//           margin-top: 16px;
//           display: flex;
//           justify-content: flex-end;
//         }
        
//         .signature-line {
//           width: 200px;
//           border-top: 1px solid #94a3b8;
//           padding-top: 6px;
//           text-align: center;
//           font-size: 9px;
//           color: #64748b;
//         }
        
//         /* Footer */
//         .footer-note {
//           text-align: center;
//           font-size: 8px;
//           color: #94a3b8;
//           margin-top: 20px;
//           padding-top: 10px;
//           border-top: 1px solid #e2e8f0;
//         }
        
//         /* Print-specific - NO PAGE BREAKS */
//         @media print {
//           body {
//             background: white;
//             padding: 0;
//             margin: 0;
//           }
          
//           .print-container {
//             margin: 0;
//             padding: 0;
//           }
          
//           /* CRITICAL: Prevent any page breaks inside prescriptions */
//           .prescription-block {
//             break-inside: avoid;
//             page-break-inside: avoid;
//             break-before: avoid;
//             page-break-before: avoid;
//             break-after: avoid;
//             page-break-after: avoid;
//           }
          
//           /* Ensure table rows don't break */
//           .items-table tr {
//             break-inside: avoid;
//             page-break-inside: avoid;
//           }
          
//           /* Keep everything together */
//           .items-table td, 
//           .items-table th {
//             break-inside: avoid;
//             page-break-inside: avoid;
//           }
//         }
//       </style>
//     </head>
//     <body>
//       <div class="print-container">
//         <!-- Header -->
//         <div class="prescription-header">
//           <div class="clinic-name">🏥 DENTAL HEALTH MANAGEMENT SYSTEM</div>
//           <div class="clinic-tagline">Professional Dental Care · Electronic Prescriptions</div>
//           <div class="print-date">Generated: ${currentDateTime}</div>
//         </div>
        
//         <!-- Summary -->
//         <div class="summary-strip">
//           <span class="prescription-count">
//             📋 ${prescriptions.length} Prescription${prescriptions.length !== 1 ? 's' : ''} • 💊 ${totalMedications} Medication${totalMedications !== 1 ? 's' : ''}
//           </span>
//           <span class="print-timestamp">Official Clinical Summary</span>
//         </div>
        
//         <!-- Prescriptions List - All on ONE PAGE -->
//         <div class="prescriptions-list">
//           ${prescriptionsHtml}
//         </div>
        
//         <!-- Footer -->
//         <div class="footer-note">
//           This is a computer-generated prescription summary. Valid only with attending dentist's signature and official stamp.
//           <br>DHMS · ${new Date().getFullYear()} · Page 1 of 1
//         </div>
//       </div>
      
//       <script>
//         window.onload = function() {
//           setTimeout(function() {
//             window.print();
//             window.close();
//           }, 300);
//         };
//       </script>
//     </body>
//     </html>
//   `;

//   // Open print window
//   const printWindow = window.open("", "_blank", "width=1100,height=900,menubar=yes,toolbar=yes");
//   if (printWindow) {
//     printWindow.document.write(html);
//     printWindow.document.close();
//   } else {
//     alert("Please allow popups to print prescriptions. Check your browser settings.");
//   }
// }


// ─── Prescription Card Component ────────────────────────────────────────────────

interface RxCardProps {
  rx: Prescription;
  visit?: PrescriptionTabProps["visit"];
  readOnly?: boolean;
  onDelete: () => void;
  onDispense: () => void;
  onPrint: () => void;
  onEdit: () => void;
}

function RxCard({
  rx,
  visit,
  readOnly,
  onDelete,
  onDispense,
  onPrint,
  onEdit,
}: RxCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isExpired =
    rx.validUntil &&
    new Date(rx.validUntil) < new Date() &&
    rx.status === "ACTIVE";

  return (
    <div
      className={cn(
        "bg-white rounded-xl border transition-all group",
        rx.status === "CANCELLED"
          ? "opacity-60 border-border/60"
          : "border-border hover:border-input hover:shadow-md",
      )}
    >
      {/* Main Row */}
      <div className="flex items-start gap-4 px-5 py-4">
        {/* Icon */}
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            rx.status === "DISPENSED"
              ? "bg-primary-muted/60 border border-primary/20"
              : "bg-success-muted/60 border border-success/20",
          )}
        >
          <Pill
            className={cn(
              "w-5 h-5",
              rx.status === "DISPENSED" ? "text-primary" : "text-success",
            )}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header Line */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-bold text-foreground">
              {rx.items.length} Medication{rx.items.length !== 1 ? "s" : ""}
            </span>

            <span
              className={cn(
                "flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full border font-medium",
                isExpired ? STATUS_STYLES.EXPIRED : STATUS_STYLES[rx.status],
              )}
            >
              {isExpired ? STATUS_ICONS.EXPIRED : STATUS_ICONS[rx.status]}
              {isExpired ? "Expired" : rx.status}
            </span>

            {rx.items.length > 1 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[11px] text-primary hover:underline flex items-center gap-0.5 ml-2"
              >
                {expanded ? "Show less" : "Show all"}
                <ChevronDown
                  className={cn(
                    "w-3 h-3 transition-transform",
                    expanded && "rotate-180",
                  )}
                />
              </button>
            )}
          </div>

          {/* Items Preview */}
          <div
            className={cn(
              "space-y-1",
              !expanded && rx.items.length > 2 && "max-h-12 overflow-hidden",
            )}
          >
            {rx.items.slice(0, expanded ? undefined : 2).map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground/70 w-4">{idx + 1}.</span>
                <span className="font-medium text-foreground">
                  {item.drug.name}
                </span>
                <span className="text-muted-foreground/70">
                  {item.dosage} • {item.frequency}
                </span>
                {item.instructions && (
                  <span className="text-warning italic truncate max-w-[200px]">
                    • {item.instructions}
                  </span>
                )}
              </div>
            ))}
            {!expanded && rx.items.length > 2 && (
              <div className="text-xs text-muted-foreground/70 pl-4">
                +{rx.items.length - 2} more...
              </div>
            )}
          </div>

          {/* Meta Row */}
          <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground/70 flex-wrap">
            <span className="flex items-center gap-1 font-mono">
              <Hash className="w-3 h-3" />
              {rx.prescriptionCode}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(rx.createdAt).toLocaleDateString()}
            </span>
            {rx.validUntil && (
              <span className={cn(isExpired && "text-danger font-medium")}>
                Valid until: {new Date(rx.validUntil).toLocaleDateString()}
              </span>
            )}
            {rx.dispensedAt && (
              <span className="text-primary font-medium">
                Dispensed: {new Date(rx.dispensedAt).toLocaleDateString()}
                {rx.dispensedBy && ` by ${rx.dispensedBy}`}
              </span>
            )}
          </div>

          {/* Notes */}
          {rx.notes && (
            <div className="mt-2 text-xs text-warning bg-warning-muted/60 border border-warning/20 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{rx.notes}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <RowActions className="shrink-0">
          {rx.status === "ACTIVE" && !readOnly && (
            <ActionButton tone="success" label="Dispense" icon={Check} onClick={onDispense} />
          )}
          <ActionButton iconOnly tone="info" label="Print prescription" onClick={onPrint} />
          {!readOnly && rx.status === "ACTIVE" && (
            <ActionButton iconOnly tone="edit" label="Edit prescription" onClick={onEdit} />
          )}
          {!readOnly && rx.status !== "DISPENSED" && (
            <ActionButton iconOnly tone="delete" label="Delete prescription" onClick={onDelete} />
          )}
        </RowActions>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-border/60 bg-muted/50 px-5 py-4">
          <div className="space-y-3">
            {rx.items.map((item, idx) => (
              <div
                key={item.id}
                className="bg-white rounded-lg border border-border p-3"
              >
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-primary-muted text-primary rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {item.drug.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.drug.strength} {item.drug.form}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                      <div>
                        <span className="text-muted-foreground/70">Dosage:</span>{" "}
                        <span className="text-foreground">{item.dosage}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/70">Frequency:</span>{" "}
                        <span className="text-foreground">{item.frequency}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/70">Duration:</span>{" "}
                        <span className="text-foreground">{item.duration}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/70">Quantity:</span>{" "}
                        <span className="text-foreground">{item.quantity}</span>
                      </div>
                      {item.route && (
                        <div>
                          <span className="text-muted-foreground/70">Route:</span>{" "}
                          <span className="text-foreground capitalize">
                            {item.route}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground/70">Refills:</span>{" "}
                        <span className="text-foreground">{item.refills}</span>
                      </div>
                    </div>
                    {item.instructions && (
                      <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                        <span className="font-medium">Instructions:</span>{" "}
                        {item.instructions}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Delete Confirmation Dialog ────────────────────────────────────────────────

function DeleteDialog({
  rx,
  isOpen,
  onClose,
  onConfirm,
  isPending,
}: {
  rx: Prescription | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  if (!isOpen || !rx) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-danger-muted rounded-full flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-danger" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">
              Delete Prescription?
            </h3>
            <p className="text-sm text-muted-foreground">
              This will permanently delete {rx.items.length} medication
              {rx.items.length !== 1 ? "s" : ""}.
            </p>
          </div>
        </div>

        <div className="bg-muted/50 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="w-4 h-4 text-muted-foreground/70" />
            <span className="font-mono text-sm text-muted-foreground">
              {rx.prescriptionCode}
            </span>
          </div>
          <div className="text-sm text-foreground">
            {rx.items.map((i) => i.drug.name).join(", ")}
          </div>
          {rx.notes && (
            <div className="mt-2 text-xs text-muted-foreground italic">
              Note: {rx.notes}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-danger hover:bg-danger disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isPending ? <Spinner size="sm" /> : <Trash2 className="w-4 h-4" />}
            Delete Prescription
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline editor: draft model ──────────────────────────────────────────────

interface DraftItem {
  key: string;
  drugId: string;
  drug: Pick<Drug, "name" | "strength" | "form">;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  quantity: string;
  refills: string;
  instructions: string;
}

type QuickEntry = Omit<DraftItem, "key" | "drug" | "drugId"> & {
  drug: Drug | null;
};

const EMPTY_QUICK: QuickEntry = {
  drug: null,
  dosage: "",
  frequency: "",
  duration: "",
  route: "oral",
  quantity: "",
  refills: "0",
  instructions: "",
};

let draftSeq = 0;
const newKey = () => `d${++draftSeq}`;

function drugCategoryName(drug: Drug): string {
  const c = drug.category as unknown;
  if (!c) return "";
  return typeof c === "string" ? c : ((c as { name?: string }).name ?? "");
}

function drugLabel(drug: Pick<Drug, "name" | "strength">): string {
  const s = drug.strength?.trim();
  return s && !drug.name.toLowerCase().includes(s.toLowerCase())
    ? `${drug.name} ${s}`
    : drug.name;
}

function itemToDraft(it: PrescriptionItem): DraftItem {
  return {
    key: newKey(),
    drugId: it.drugId,
    drug: {
      name: it.drug?.name ?? "Unknown drug",
      strength: it.drug?.strength,
      form: it.drug?.form,
    },
    dosage: it.dosage ?? "",
    frequency: it.frequency ?? "",
    duration: it.duration ?? "",
    route: it.route || "oral",
    quantity: String(it.quantity ?? ""),
    refills: String(it.refills ?? 0),
    instructions: it.instructions ?? "",
  };
}

function isCompleteItem(i: {
  dosage: string;
  frequency: string;
  duration: string;
  quantity: string;
}) {
  return (
    !!i.dosage.trim() &&
    !!i.frequency &&
    !!i.duration &&
    parseInt(i.quantity, 10) > 0
  );
}

/** Quick-entry values for a drug: its saved defaults, else form-based guesses. */
function quickFromDrug(drug: Drug): QuickEntry {
  const dosage = drug.defaultDosage || suggestDosage(drug.form);
  const frequency = drug.defaultFrequency || "";
  const duration = drug.defaultDuration || "";
  const qty = calcQuantity(dosage, frequency, duration);
  return {
    drug,
    dosage,
    frequency,
    duration,
    route: drug.defaultRoute || suggestRoute(drug.form),
    quantity: qty ? String(qty) : "",
    refills: "0",
    instructions: drug.defaultInstructions || "",
  };
}

function freqDisplay(value: string) {
  const m = frequencyMeta(value);
  if (!m) return { code: value, hint: "" };
  return {
    code: m.code,
    hint: m.perDay ? `${m.perDay}× daily` : m.label.split(" - ")[1] ?? "",
  };
}

const fieldCls =
  "w-full h-10 px-3 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 disabled:opacity-50";
const cellCls =
  "w-full h-8 px-2 text-xs border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/30";

// ─── Drug search (quick entry) ───────────────────────────────────────────────

const DrugSearch = React.forwardRef<
  HTMLInputElement,
  {
    drugs: Drug[];
    selected: Drug | null;
    loading: boolean;
    onSelect: (drug: Drug | null) => void;
  }
>(function DrugSearch({ drugs, selected, loading, onSelect }, ref) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? drugs.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.genericName?.toLowerCase().includes(q) ||
            d.strength?.toLowerCase().includes(q),
        )
      : drugs;
    return list.slice(0, 30);
  }, [drugs, query]);

  useEffect(() => setActive(0), [query]);

  const pick = (d: Drug) => {
    onSelect(d);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      e.stopPropagation();
      pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && selected) {
      onSelect(null);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
      <input
        ref={ref}
        type="text"
        className={cn(fieldCls, "pl-9 pr-8")}
        placeholder={
          loading
            ? "Loading drugs..."
            : selected
              ? ""
              : "Search medicine (e.g. Paracetamol)"
        }
        value={selected && !open ? drugLabel(selected) : query}
        onChange={(e) => {
          if (selected) onSelect(null);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        disabled={loading}
        autoComplete="off"
      />
      {selected ? (
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setQuery("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          aria-label="Clear drug"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : (
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
      )}

      {open && !loading && (
        <div className="absolute z-40 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-xl max-h-72 overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No drugs found
            </div>
          ) : (
            results.map((d, i) => (
              <button
                key={d.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(d)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "w-full text-left px-3 py-2 border-b border-border/40 last:border-0 flex items-center gap-2",
                  i === active ? "bg-primary-muted/60" : "hover:bg-muted/50",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {drugLabel(d)}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[d.form, d.genericName, drugCategoryName(d)]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                </div>
                {d.isCommon && (
                  <Star className="w-3.5 h-3.5 text-warning shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});

// ─── Right panel ─────────────────────────────────────────────────────────────

interface RecentMed {
  drugId: string;
  drug: Drug;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  quantity: number;
  instructions: string;
}

function MedsSidePanel({
  drugs,
  recent,
  onQuickAdd,
  onAddRecent,
  inListIds,
  disabled,
}: {
  drugs: Drug[];
  recent: RecentMed[];
  onQuickAdd: (drug: Drug) => void;
  onAddRecent: (r: RecentMed) => void;
  inListIds: Set<string>;
  disabled?: boolean;
}) {
  const [tab, setTab] = useState<"common" | "recent">("common");
  const [q, setQ] = useState("");

  const common = useMemo(() => drugs.filter((d) => d.isCommon), [drugs]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    // Typing searches the whole formulary, so the panel never dead-ends.
    const pool = s ? drugs : common;
    return (
      s
        ? pool.filter(
            (d) =>
              d.name.toLowerCase().includes(s) ||
              d.genericName?.toLowerCase().includes(s),
          )
        : pool
    ).slice(0, 40);
  }, [drugs, common, q]);

  const defaultsLine = (d: Drug) => {
    const f = d.defaultFrequency ? freqDisplay(d.defaultFrequency).code : "";
    return [d.defaultDosage, f, d.defaultDuration].filter(Boolean).join(" • ");
  };

  return (
    <aside className="bg-white rounded-xl border border-border flex flex-col lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] overflow-hidden">
      <div className="flex border-b border-border px-2">
        {(
          [
            ["common", "Common Medications"],
            ["recent", "Recent / Previous"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === k
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "common" ? (
        <>
          <div className="p-3 border-b border-border/60">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
              <input
                className={cn(fieldCls, "pl-9 h-9")}
                placeholder={common.length ? "Search common drugs..." : "Search all drugs..."}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {shown.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground leading-relaxed">
                {q ? (
                  "No drugs match."
                ) : (
                  <>
                    No common medications yet.
                    <br />
                    Open <strong>Drugs</strong>, edit a drug and turn on{" "}
                    <strong>Common Medication</strong> under Prescribing
                    Defaults.
                  </>
                )}
              </div>
            )}
            {shown.map((d) => {
              const added = inListIds.has(d.id);
              const line = defaultsLine(d);
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 hover:border-primary/40 hover:bg-primary-muted/20 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {drugLabel(d)}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[d.form, drugCategoryName(d)].filter(Boolean).join(" • ")}
                    </div>
                    {line && (
                      <div className="text-[11px] text-primary/80 truncate">
                        {line}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={disabled || added}
                    onClick={() => onQuickAdd(d)}
                    className={cn(
                      "w-8 h-8 shrink-0 rounded-full border flex items-center justify-center transition-colors",
                      added
                        ? "border-success/40 text-success bg-success-muted/40"
                        : "border-primary/40 text-primary hover:bg-primary hover:text-white disabled:opacity-40",
                    )}
                    title={added ? "Already in list" : "Add to prescription"}
                    aria-label={`Add ${d.name}`}
                  >
                    {added ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {recent.length === 0 && (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No previous prescriptions for this patient.
            </div>
          )}
          {recent.map((r) => {
            const added = inListIds.has(r.drugId);
            return (
              <div
                key={`${r.drugId}|${r.dosage}|${r.frequency}|${r.duration}`}
                className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 hover:border-primary/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {drugLabel(r.drug)}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[r.dosage, freqDisplay(r.frequency).code, r.duration]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={disabled || added}
                  onClick={() => onAddRecent(r)}
                  className={cn(
                    "w-8 h-8 shrink-0 rounded-full border flex items-center justify-center transition-colors",
                    added
                      ? "border-success/40 text-success bg-success-muted/40"
                      : "border-primary/40 text-primary hover:bg-primary hover:text-white disabled:opacity-40",
                  )}
                  title={added ? "Already in list" : "Add with same details"}
                  aria-label={`Add ${r.drug.name}`}
                >
                  {added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}

// ─── Main PrescriptionTab Component ────────────────────────────────────────────

export function PrescriptionTab({
  visitId,
  visit,
  readOnly,
}: PrescriptionTabProps) {
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Prescription | null>(null);

  // Editor state. targetId: undefined = auto (latest ACTIVE rx), null = new rx.
  const [targetId, setTargetId] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [dirty, setDirty] = useState(false);
  const [quick, setQuick] = useState<QuickEntry>(EMPTY_QUICK);
  const [quickError, setQuickError] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [printMenu, setPrintMenu] = useState(false);

  const drugInputRef = useRef<HTMLInputElement>(null);
  const doseRef = useRef<HTMLInputElement>(null);
  const freqRef = useRef<HTMLSelectElement>(null);
  const durRef = useRef<HTMLSelectElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  // Fetch clinic settings for print header
  const { data: settingsArr = [] } = useQuery({
    queryKey: ['clinic-settings'],
    queryFn: () => clinicSettingsApi.getAll(),
    staleTime: 5 * 60 * 1000,
  });
  const clinicSettings: Record<string, string> = Object.fromEntries(
    (settingsArr as any[]).map((s: any) => [s.key, s.value]),
  );

  // Fetch prescriptions
  const {
    data: prescriptions = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Prescription[]>({
    queryKey: ["prescriptions", visitId],
    queryFn: () => prescriptionsApi.getByVisit(visitId),
    enabled: !!visitId,
  });

  const { data: drugsResponse, isLoading: drugsLoading } = useQuery({
    queryKey: ["drugs", "active"],
    queryFn: () => drugsApi.getAll({ isActive: true, limit: 1000 }),
    enabled: !readOnly,
    staleTime: 60000,
  });
  const drugs: Drug[] = useMemo(() => {
    const r = drugsResponse as any;
    const list: Drug[] = Array.isArray(r) ? r : (r?.data ?? []);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [drugsResponse]);

  const patientId = visit?.patientId ?? visit?.patient?.id;
  const { data: patientRx = [] } = useQuery<Prescription[]>({
    queryKey: ["prescriptions", "patient", patientId],
    queryFn: () => prescriptionsApi.getByPatient(patientId!),
    enabled: !!patientId && !readOnly,
    staleTime: 60000,
  });

  const sortedRx = useMemo(
    () =>
      [...prescriptions].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      ),
    [prescriptions],
  );
  const target =
    targetId === undefined
      ? (sortedRx.find((r) => r.status === "ACTIVE") ?? null)
      : targetId === null
        ? null
        : (sortedRx.find((r) => r.id === targetId) ?? null);

  // Mirror the server copy into the editor whenever there are no local edits.
  const targetSig = target
    ? `${target.id}:${target.items.map((i) => i.id).join(",")}:${target.notes ?? ""}:${target.validUntil ?? ""}`
    : "new";
  useEffect(() => {
    if (dirty) return;
    setDraft(target ? target.items.map(itemToDraft) : []);
    setNotes(target?.notes ?? "");
    setValidUntil(
      target?.validUntil
        ? new Date(target.validUntil).toISOString().slice(0, 10)
        : "",
    );
    setEditKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSig, dirty]);

  // Previous meds for this patient (other visits), newest first, de-duplicated.
  const previousRx = useMemo(
    () =>
      [...patientRx]
        .filter((r) => r.visitId !== visitId && r.status !== "CANCELLED" && r.items?.length)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [patientRx, visitId],
  );
  const recentMeds: RecentMed[] = useMemo(() => {
    const seen = new Set<string>();
    const out: RecentMed[] = [];
    for (const rx of previousRx) {
      for (const it of rx.items) {
        const sig = `${it.drugId}|${it.dosage}|${it.frequency}|${it.duration}`;
        if (seen.has(sig) || !it.drug) continue;
        seen.add(sig);
        out.push({
          drugId: it.drugId,
          drug: it.drug,
          dosage: it.dosage,
          frequency: it.frequency,
          duration: it.duration,
          route: it.route || "oral",
          quantity: it.quantity,
          instructions: it.instructions ?? "",
        });
        if (out.length >= 15) return out;
      }
    }
    return out;
  }, [previousRx]);

  const inListIds = useMemo(() => new Set(draft.map((d) => d.drugId)), [draft]);

  // ── Draft mutations ──
  const touch = () => setDirty(true);

  const pushItem = (item: Omit<DraftItem, "key">): boolean => {
    if (inListIds.has(item.drugId)) {
      setQuickError(`${item.drug.name} is already in the list — edit that row instead.`);
      return false;
    }
    setDraft((d) => [...d, { ...item, key: newKey() }]);
    setQuickError("");
    touch();
    return true;
  };

  const setQuickField = <K extends keyof QuickEntry>(k: K, v: QuickEntry[K]) => {
    setQuick((q) => {
      const next = { ...q, [k]: v };
      if (k === "dosage" || k === "frequency" || k === "duration") {
        const qty = calcQuantity(next.dosage, next.frequency, next.duration);
        if (qty) next.quantity = String(qty);
      }
      return next;
    });
    setQuickError("");
  };

  const focusFirstMissing = (q: QuickEntry) => {
    const el = !q.dosage
      ? doseRef.current
      : !q.frequency
        ? freqRef.current
        : !q.duration
          ? durRef.current
          : !(parseInt(q.quantity, 10) > 0)
            ? qtyRef.current
            : doseRef.current;
    setTimeout(() => el?.focus(), 0);
  };

  const selectQuickDrug = (drug: Drug | null) => {
    if (!drug) {
      setQuick(EMPTY_QUICK);
      return;
    }
    const q = quickFromDrug(drug);
    setQuick(q);
    setQuickError(
      inListIds.has(drug.id) ? `${drug.name} is already in the list.` : "",
    );
    focusFirstMissing(q);
  };

  const addQuick = () => {
    if (!quick.drug) {
      setQuickError("Pick a medicine first.");
      drugInputRef.current?.focus();
      return;
    }
    if (!isCompleteItem(quick)) {
      setQuickError("Dose, frequency, duration and quantity are required.");
      focusFirstMissing(quick);
      return;
    }
    const ok = pushItem({
      drugId: quick.drug.id,
      drug: quick.drug,
      dosage: quick.dosage.trim(),
      frequency: quick.frequency,
      duration: quick.duration,
      route: quick.route,
      quantity: quick.quantity,
      refills: quick.refills || "0",
      instructions: quick.instructions.trim(),
    });
    if (ok) {
      setQuick(EMPTY_QUICK);
      setTimeout(() => drugInputRef.current?.focus(), 0);
    }
  };

  /** One click from the Common panel: add straight away when the drug's
   *  defaults are complete, otherwise stage it in the quick-entry row. */
  const quickAddDrug = (drug: Drug) => {
    const q = quickFromDrug(drug);
    if (isCompleteItem(q)) {
      pushItem({
        drugId: drug.id,
        drug,
        dosage: q.dosage,
        frequency: q.frequency,
        duration: q.duration,
        route: q.route,
        quantity: q.quantity,
        refills: "0",
        instructions: q.instructions,
      });
    } else {
      setQuick(q);
      setQuickError("Complete the missing details, then Add to List.");
      focusFirstMissing(q);
    }
  };

  const addRecent = (r: RecentMed) =>
    pushItem({
      drugId: r.drugId,
      drug: r.drug,
      dosage: r.dosage,
      frequency: r.frequency,
      duration: r.duration,
      route: r.route,
      quantity: String(
        calcQuantity(r.dosage, r.frequency, r.duration) ?? r.quantity ?? 1,
      ),
      refills: "0",
      instructions: r.instructions,
    });

  const loadPreviousRx = () => {
    const last = previousRx[0];
    if (!last) return;
    const fresh = last.items
      .filter((it) => !inListIds.has(it.drugId))
      .map((it) => ({ ...itemToDraft(it), refills: "0" }));
    if (!fresh.length) {
      setQuickError("Everything from the previous prescription is already listed.");
      return;
    }
    setDraft((d) => [...d, ...fresh]);
    if (!notes && last.notes) setNotes(last.notes);
    setQuickError("");
    touch();
  };

  const updateDraft = (key: string, field: keyof DraftItem, value: string) => {
    setDraft((d) =>
      d.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, [field]: value };
        if (field === "dosage" || field === "frequency" || field === "duration") {
          const qty = calcQuantity(next.dosage, next.frequency, next.duration);
          if (qty) next.quantity = String(qty);
        }
        return next;
      }),
    );
    touch();
  };

  const removeDraft = (key: string) => {
    setDraft((d) => d.filter((it) => it.key !== key));
    if (editKey === key) setEditKey(null);
    touch();
  };

  const discardChanges = () => {
    setDirty(false); // effect re-syncs from the server copy
    setQuick(EMPTY_QUICK);
    setQuickError("");
  };

  const startNew = () => {
    setTargetId(null);
    setDirty(false);
    setQuick(EMPTY_QUICK);
    setQuickError("");
  };

  // ── Server mutations ──
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["prescriptions", visitId] });
    qc.invalidateQueries({ queryKey: ["visit", visitId] });
    if (patientId)
      qc.invalidateQueries({ queryKey: ["prescriptions", "patient", patientId] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const incomplete = draft.filter((d) => !isCompleteItem(d));
      if (incomplete.length) {
        throw new Error(
          `Complete dose, frequency, duration and quantity for: ${incomplete
            .map((d) => d.drug.name)
            .join(", ")}`,
        );
      }
      const items = draft.map((d) => ({
        drugId: d.drugId,
        dosage: d.dosage.trim(),
        frequency: d.frequency,
        duration: d.duration,
        route: d.route,
        quantity: parseInt(d.quantity, 10),
        instructions: d.instructions.trim() || undefined,
        refills: parseInt(d.refills, 10) || 0,
      }));
      if (target) {
        return prescriptionsApi.update(target.id, {
          items,
          notes,
          validUntil: validUntil || undefined,
        });
      }
      return prescriptionsApi.create({
        visitId,
        items,
        notes: notes || undefined,
        validUntil: validUntil || undefined,
      });
    },
    onSuccess: async (saved: any) => {
      // Refetch first so the editor re-syncs to the saved copy without a flash.
      await qc.invalidateQueries({ queryKey: ["prescriptions", visitId] });
      invalidate();
      if (saved?.id) setTargetId(saved.id);
      setDirty(false);
      setEditKey(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => prescriptionsApi.remove(id),
    onSuccess: (_r, id) => {
      if (target?.id === id) {
        setTargetId(undefined);
        setDirty(false);
      }
      invalidate();
      setDeleteTarget(null);
    },
  });

  const dispenseMutation = useMutation({
    mutationFn: (id: string) => prescriptionsApi.dispense(id),
    onSuccess: (_r, id) => {
      if (target?.id === id) setTargetId(undefined);
      invalidate();
    },
  });

  // Stats
  const otherRx = sortedRx.filter((r) => r.id !== target?.id);
  const activeCount = prescriptions.filter((r) => r.status === "ACTIVE").length;
  const editingLocked = !!target && target.status !== "ACTIVE";
  const canSave = !readOnly && !editingLocked && dirty && draft.length > 0;

  const onQuickKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      addQuick();
    }
  };

  // ─── Read-only view (completed visit, etc.) ───
  if (readOnly) {
    return (
      <div className="space-y-3">
        {isLoading && (
          <div className="flex justify-center py-12 bg-white rounded-xl border border-border">
            <Spinner size="lg" />
          </div>
        )}
        {!isLoading && sortedRx.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-input text-sm text-muted-foreground">
            No prescriptions for this visit.
          </div>
        )}
        {sortedRx.map((rx) => (
          <RxCard
            key={rx.id}
            rx={rx}
            visit={visit}
            readOnly
            onDelete={() => {}}
            onDispense={() => {}}
            onPrint={() => printPrescription(rx, visit, clinicSettings)}
            onEdit={() => {}}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
      <div className="space-y-4 min-w-0">
        <div className="bg-white rounded-xl border border-border">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <div className="flex items-center gap-3 min-w-0">
              <Pill className="w-6 h-6 text-primary shrink-0" />
              <h3 className="text-xl font-bold text-foreground">Prescription</h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-success-muted/60 text-success font-medium">
                {draft.length} medication{draft.length !== 1 ? "s" : ""}
              </span>
              {target && (
                <span className="text-xs font-mono text-muted-foreground">
                  {target.prescriptionCode}
                  {target.status !== "ACTIVE" && ` · ${target.status}`}
                </span>
              )}
              {dirty && (
                <span className="text-xs text-warning font-medium">Unsaved changes</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => refetch()}
                className="p-2 rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={loadPreviousRx}
                disabled={!previousRx.length || editingLocked}
                title={
                  previousRx.length
                    ? `Copy medicines from ${previousRx[0].prescriptionCode} (${new Date(previousRx[0].createdAt).toLocaleDateString()})`
                    : "No previous prescription for this patient"
                }
                className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-4 h-4" />
                Load Previous Rx
              </button>
              {(target || dirty) && (
                <button
                  type="button"
                  onClick={startNew}
                  className="flex items-center gap-2 h-9 px-3 rounded-lg border border-primary/30 text-sm font-medium text-primary hover:bg-primary-muted/40"
                  title="Start another prescription for this visit"
                >
                  <Plus className="w-4 h-4" />
                  New Rx
                </button>
              )}
            </div>
          </div>

          {editingLocked ? (
            <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              This prescription is {target!.status.toLowerCase()} and can't be
              changed. Use <strong className="mx-1">New Rx</strong> to prescribe more.
            </div>
          ) : (
            /* Quick entry */
            <div
              className="mx-5 mt-4 rounded-xl border border-primary/20 bg-primary-muted/20 p-4"
              onKeyDown={onQuickKey}
            >
              <div className="text-sm font-semibold text-foreground mb-3">
                Add New Medication{" "}
                <span className="font-normal text-muted-foreground">(quick entry)</span>
              </div>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-12 items-end">
                <div className="col-span-2 md:col-span-4">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Drug / Medication <span className="text-danger">*</span>
                  </label>
                  <DrugSearch
                    ref={drugInputRef}
                    drugs={drugs}
                    selected={quick.drug}
                    loading={drugsLoading}
                    onSelect={selectQuickDrug}
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Dose <span className="text-danger">*</span>
                  </label>
                  <input
                    ref={doseRef}
                    className={fieldCls}
                    placeholder="e.g. 1"
                    value={quick.dosage}
                    onChange={(e) => setQuickField("dosage", e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Route
                  </label>
                  <select
                    className={fieldCls}
                    value={quick.route}
                    onChange={(e) => setQuickField("route", e.target.value)}
                  >
                    {RX_ROUTES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Frequency <span className="text-danger">*</span>
                  </label>
                  <select
                    ref={freqRef}
                    className={fieldCls}
                    value={quick.frequency}
                    onChange={(e) => setQuickField("frequency", e.target.value)}
                  >
                    <option value="">Select…</option>
                    {RX_FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Duration <span className="text-danger">*</span>
                  </label>
                  <select
                    ref={durRef}
                    className={fieldCls}
                    value={quick.duration}
                    onChange={(e) => setQuickField("duration", e.target.value)}
                  >
                    <option value="">Select…</option>
                    {RX_DURATIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Qty <span className="text-danger">*</span>
                  </label>
                  <input
                    ref={qtyRef}
                    type="number"
                    min={1}
                    className={fieldCls}
                    value={quick.quantity}
                    onChange={(e) => setQuickField("quantity", e.target.value)}
                  />
                </div>
                <div className="col-span-2 md:col-span-9">
                  <input
                    className={cn(fieldCls, "h-9")}
                    placeholder="Instructions (optional) — e.g. Take after food"
                    value={quick.instructions}
                    onChange={(e) => setQuickField("instructions", e.target.value)}
                  />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <button
                    type="button"
                    onClick={addQuick}
                    className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add to List
                  </button>
                </div>
              </div>
              <div className="mt-2 min-h-[1rem] text-xs">
                {quickError ? (
                  <span className="text-danger">{quickError}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Type to search, ↑/↓ then Enter to pick. Enter in any field adds to the list.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Current medications */}
          <div className="px-5 pt-5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-base font-semibold text-foreground">
                Current Medications
              </h4>
              {draft.length > 0 && !editingLocked && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft([]);
                    setEditKey(null);
                    touch();
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-danger hover:underline"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </button>
              )}
            </div>
            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2.5 w-8">#</th>
                    <th className="px-3 py-2.5">Medication</th>
                    <th className="px-3 py-2.5 w-20">Dose</th>
                    <th className="px-3 py-2.5 w-28">Route</th>
                    <th className="px-3 py-2.5 w-32">Frequency</th>
                    <th className="px-3 py-2.5 w-28">Duration</th>
                    <th className="px-3 py-2.5 w-16">Qty</th>
                    <th className="px-3 py-2.5 w-16">Refills</th>
                    <th className="px-3 py-2.5">Instructions</th>
                    <th className="px-3 py-2.5 w-20 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(isLoading || (drugsLoading && !draft.length)) && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center">
                        <Spinner />
                      </td>
                    </tr>
                  )}
                  {!isLoading && draft.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                        No medications yet — search above or click{" "}
                        <Plus className="w-3.5 h-3.5 inline" /> on a common medication.
                      </td>
                    </tr>
                  )}
                  {draft.map((it, idx) => {
                    const editing = editKey === it.key;
                    const incomplete = !isCompleteItem(it);
                    const f = freqDisplay(it.frequency);
                    return (
                      <tr
                        key={it.key}
                        className={cn(
                          "border-t border-border/60 align-middle",
                          editing ? "bg-primary-muted/20" : "hover:bg-muted/30",
                          incomplete && !editing && "bg-warning-muted/30",
                        )}
                      >
                        <td className="px-3 py-3 text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-foreground">{drugLabel(it.drug)}</div>
                          {it.drug.form && (
                            <div className="text-[11px] text-muted-foreground">{it.drug.form}</div>
                          )}
                        </td>
                        {editing ? (
                          <>
                            <td className="px-1.5 py-2">
                              <input
                                className={cellCls}
                                value={it.dosage}
                                autoFocus
                                onChange={(e) => updateDraft(it.key, "dosage", e.target.value)}
                              />
                            </td>
                            <td className="px-1.5 py-2">
                              <select
                                className={cellCls}
                                value={it.route}
                                onChange={(e) => updateDraft(it.key, "route", e.target.value)}
                              >
                                {RX_ROUTES.map((r) => (
                                  <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-1.5 py-2">
                              <select
                                className={cellCls}
                                value={it.frequency}
                                onChange={(e) => updateDraft(it.key, "frequency", e.target.value)}
                              >
                                <option value="">Select…</option>
                                {!frequencyMeta(it.frequency) && it.frequency && (
                                  <option value={it.frequency}>{it.frequency}</option>
                                )}
                                {RX_FREQUENCIES.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-1.5 py-2">
                              <select
                                className={cellCls}
                                value={it.duration}
                                onChange={(e) => updateDraft(it.key, "duration", e.target.value)}
                              >
                                <option value="">Select…</option>
                                {!RX_DURATIONS.some((o) => o.value === it.duration) && it.duration && (
                                  <option value={it.duration}>{it.duration}</option>
                                )}
                                {RX_DURATIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-1.5 py-2">
                              <input
                                type="number"
                                min={1}
                                className={cellCls}
                                value={it.quantity}
                                onChange={(e) => updateDraft(it.key, "quantity", e.target.value)}
                              />
                            </td>
                            <td className="px-1.5 py-2">
                              <input
                                type="number"
                                min={0}
                                className={cellCls}
                                value={it.refills}
                                onChange={(e) => updateDraft(it.key, "refills", e.target.value)}
                              />
                            </td>
                            <td className="px-1.5 py-2">
                              <input
                                className={cellCls}
                                value={it.instructions}
                                placeholder="Optional"
                                onChange={(e) => updateDraft(it.key, "instructions", e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && setEditKey(null)}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-3">{it.dosage || <span className="text-danger">—</span>}</td>
                            <td className="px-3 py-3">{routeLabel(it.route)}</td>
                            <td className="px-3 py-3">
                              {it.frequency ? (
                                <>
                                  <div>{f.code}</div>
                                  {f.hint && (
                                    <div className="text-[11px] text-muted-foreground">({f.hint})</div>
                                  )}
                                </>
                              ) : (
                                <span className="text-danger">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3">{it.duration || <span className="text-danger">—</span>}</td>
                            <td className="px-3 py-3">{it.quantity || <span className="text-danger">—</span>}</td>
                            <td className="px-3 py-3">{it.refills || 0}</td>
                            <td className="px-3 py-3 text-muted-foreground">{it.instructions || "—"}</td>
                          </>
                        )}
                        <td className="px-3 py-3">
                          {!editingLocked && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setEditKey(editing ? null : it.key)}
                                className={cn(
                                  "p-1.5 rounded-md",
                                  editing
                                    ? "text-success hover:bg-success-muted/60"
                                    : "text-primary hover:bg-primary-muted/60",
                                )}
                                title={editing ? "Done" : "Edit"}
                                aria-label={editing ? "Done editing" : `Edit ${it.drug.name}`}
                              >
                                {editing ? <Check className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeDraft(it.key)}
                                className="p-1.5 rounded-md text-danger hover:bg-danger-muted/60"
                                title="Remove"
                                aria-label={`Remove ${it.drug.name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes + validity */}
          <div className="px-5 pt-5 grid gap-4 md:grid-cols-[1fr_180px]">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Additional Prescription Notes{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                rows={3}
                disabled={editingLocked}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                placeholder="e.g. advice to pharmacist, special instructions..."
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  touch();
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Valid Until
              </label>
              <input
                type="date"
                disabled={editingLocked}
                className={fieldCls}
                value={validUntil}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => {
                  setValidUntil(e.target.value);
                  touch();
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Blank = 30 days</p>
            </div>
          </div>

          {saveMutation.isError && (
            <div className="mx-5 mt-4 flex items-center gap-2 bg-danger-muted/60 border border-danger/25 rounded-lg px-4 py-3 text-sm text-danger">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {(saveMutation.error as any)?.response?.data?.message ||
                (saveMutation.error as Error)?.message ||
                "Failed to save prescription"}
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-center gap-2">
              <div className="relative flex">
                <button
                  type="button"
                  disabled={!target || dirty}
                  onClick={() => target && printPrescription(target, visit, clinicSettings)}
                  title={dirty ? "Save before printing" : !target ? "Nothing saved yet" : "Print this prescription"}
                  className="flex items-center gap-2 h-10 px-4 rounded-l-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Printer className="w-4 h-4" />
                  Print Prescription
                </button>
                <button
                  type="button"
                  disabled={!sortedRx.length}
                  onClick={() => setPrintMenu((v) => !v)}
                  className="h-10 px-2 rounded-r-lg border border-l-0 border-border hover:bg-muted disabled:opacity-50"
                  aria-label="More print options"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                {printMenu && (
                  <div
                    className="absolute bottom-full mb-1 left-0 z-30 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[220px]"
                    onMouseLeave={() => setPrintMenu(false)}
                  >
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        setPrintMenu(false);
                        printAllPrescriptions(sortedRx, visit, clinicSettings);
                      }}
                    >
                      Print all for this visit ({sortedRx.length})
                    </button>
                  </div>
                )}
              </div>
              {target?.status === "ACTIVE" && !dirty && (
                <>
                  <button
                    type="button"
                    onClick={() => dispenseMutation.mutate(target.id)}
                    disabled={dispenseMutation.isPending}
                    className="flex items-center gap-2 h-10 px-4 rounded-lg border border-success/40 text-success text-sm font-medium hover:bg-success-muted/40 disabled:opacity-50"
                  >
                    {dispenseMutation.isPending ? <Spinner size="sm" /> : <Check className="w-4 h-4" />}
                    Dispense
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(target)}
                    className="p-2.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger-muted/60"
                    title="Delete prescription"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {dirty && (
                <button
                  type="button"
                  onClick={discardChanges}
                  className="h-10 px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                >
                  Discard
                </button>
              )}
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={!canSave || saveMutation.isPending}
                className="flex items-center gap-2 h-11 px-6 rounded-lg bg-primary text-white text-sm font-semibold shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveMutation.isPending ? <Spinner size="sm" /> : <CheckCircle className="w-4 h-4" />}
                {target ? "Save Prescription" : "Create Prescription"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-danger-muted/60 border border-danger/25 rounded-xl px-5 py-4">
            <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
            <p className="flex-1 text-sm font-medium text-danger">
              Failed to load prescriptions
            </p>
            <button
              onClick={() => refetch()}
              className="px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-muted rounded-lg"
            >
              Retry
            </button>
          </div>
        )}

        {/* Other prescriptions on this visit */}
        {otherRx.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-sm font-semibold text-foreground">
                Other prescriptions this visit
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {activeCount} active
                </span>
              </h4>
            </div>
            {otherRx.map((rx) => (
              <RxCard
                key={rx.id}
                rx={rx}
                visit={visit}
                onDelete={() => setDeleteTarget(rx)}
                onDispense={() => dispenseMutation.mutate(rx.id)}
                onPrint={() => printPrescription(rx, visit, clinicSettings)}
                onEdit={() => {
                  if (dirty && !window.confirm("Discard unsaved changes?")) return;
                  setTargetId(rx.id);
                  setDirty(false);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <MedsSidePanel
        drugs={drugs}
        recent={recentMeds}
        inListIds={inListIds}
        disabled={editingLocked}
        onQuickAdd={quickAddDrug}
        onAddRecent={addRecent}
      />

      {/* Delete Confirmation */}
      <DeleteDialog
        rx={deleteTarget}
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

export default PrescriptionTab;
