// src/pages/visits/components/PrescriptionTab.tsx

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Loader2,
  Edit3,
  Eye,
} from "lucide-react";
import {
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
  ChevronUp,
  Stethoscope,
  User,
  Calendar,
  Hash,
  Package,
} from "lucide-react";
import { prescriptionsApi, drugsApi } from "../../../lib/api";
import { clinicSettingsApi } from "../../../lib/api/clinic-settings";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Drug {
  id: string;
  name: string;
  genericName?: string;
  category?: string;
  form?: string;
  strength?: string;
  manufacturer?: string;
  unitPrice: number;
  isActive: boolean;
}

interface PrescriptionItemInput {
  drugId: string;
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  quantity: string;
  instructions: string;
  refills: string;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ITEM: PrescriptionItemInput = {
  drugId: "",
  drugName: "",
  dosage: "",
  frequency: "",
  duration: "",
  route: "oral",
  quantity: "",
  instructions: "",
  refills: "0",
};

const ROUTES = [
  { value: "oral", label: "Oral" },
  { value: "topical", label: "Topical" },
  { value: "sublingual", label: "Sublingual" },
  { value: "rectal", label: "Rectal" },
  { value: "inhalation", label: "Inhalation" },
  { value: "intravenous", label: "Intravenous" },
  { value: "intramuscular", label: "Intramuscular" },
  { value: "subcutaneous", label: "Subcutaneous" },
  { value: "ophthalmic", label: "Ophthalmic" },
  { value: "otic", label: "Otic (Ear)" },
  { value: "nasal", label: "Nasal" },
  { value: "buccal", label: "Buccal" },
];

const FREQUENCY_OPTIONS = [
  { value: "once daily", label: "OD - Once daily" },
  { value: "twice daily", label: "BD - Twice daily" },
  { value: "three times daily", label: "TID - Three times daily" },
  { value: "four times daily", label: "QID - Four times daily" },
  { value: "every 4 hours", label: "Q4H - Every 4 hours" },
  { value: "every 6 hours", label: "Q6H - Every 6 hours" },
  { value: "every 8 hours", label: "Q8H - Every 8 hours" },
  { value: "every 12 hours", label: "Q12H - Every 12 hours" },
  { value: "as needed for pain", label: "PRN - As needed for pain" },
  { value: "as needed", label: "PRN - As needed" },
  { value: "at bedtime", label: "HS - At bedtime" },
  { value: "before meals", label: "AC - Before meals" },
  { value: "after meals", label: "PC - After meals" },
  { value: "once weekly", label: "Once weekly" },
  { value: "twice weekly", label: "Twice weekly" },
];

const DURATION_OPTIONS = [
  { value: "1 day", label: "1 day" },
  { value: "2 days", label: "2 days" },
  { value: "3 days", label: "3 days" },
  { value: "5 days", label: "5 days" },
  { value: "7 days", label: "7 days (1 week)" },
  { value: "10 days", label: "10 days" },
  { value: "14 days", label: "14 days (2 weeks)" },
  { value: "21 days", label: "21 days (3 weeks)" },
  { value: "1 month", label: "1 month" },
  { value: "2 months", label: "2 months" },
  { value: "3 months", label: "3 months" },
  { value: "6 months", label: "6 months" },
  { value: "until finished", label: "Until finished" },
  { value: "as directed", label: "As directed" },
  { value: "ongoing", label: "Ongoing / Chronic" },
];

const COMMON_DOSAGES = [
  "1 tablet",
  "2 tablets",
  "1 capsule",
  "2 capsules",
  "5ml",
  "10ml",
  "15ml",
  "1 teaspoon",
  "1 tablespoon",
  "1 drop",
  "2 drops",
  "3 drops",
  "1 puff",
  "2 puffs",
  "1 applicator",
  "1 patch",
  "1 suppository",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...cls: (string | boolean | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-6 h-6" };
  return <Loader2 className={cn("animate-spin text-blue-600", sizes[size])} />;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DISPENSED: "bg-blue-50 text-blue-700 border-blue-200",
  EXPIRED: "bg-slate-100 text-slate-500 border-slate-200",
  CANCELLED: "bg-red-50 text-red-600 border-red-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  ACTIVE: <Clock className="w-3 h-3" />,
  DISPENSED: <Check className="w-3 h-3" />,
  EXPIRED: <AlertTriangle className="w-3 h-3" />,
  CANCELLED: <X className="w-3 h-3" />,
};

// ─── Drug Combobox Component ────────────────────────────────────────────────

interface DrugComboboxProps {
  drugs: Drug[];
  value: string; // drugId
  displayValue: string; // drugName for display
  onChange: (drug: Drug | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

function DrugCombobox({
  drugs,
  value,
  displayValue,
  onChange,
  disabled = false,
  placeholder = "Select a drug...",
}: DrugComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter drugs based on search
  const filteredDrugs = useMemo(() => {
    if (!searchQuery.trim()) return drugs.slice(0, 50); // Show first 50 by default

    const query = searchQuery.toLowerCase();
    return drugs
      .filter(
        (drug) =>
          drug.name.toLowerCase().includes(query) ||
          drug.genericName?.toLowerCase().includes(query) ||
          drug.strength?.toLowerCase().includes(query),
      )
      .slice(0, 50);
  }, [drugs, searchQuery]);

  // Selected drug
  const selectedDrug = drugs.find((d) => d.id === value);

  const handleSelect = (drug: Drug) => {
    onChange(drug);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setSearchQuery("");
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger / Display */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2.5 border rounded-lg cursor-pointer transition-all",
          isOpen
            ? "border-blue-500 ring-2 ring-blue-100"
            : "border-slate-200 hover:border-slate-300",
          disabled && "opacity-50 cursor-not-allowed bg-slate-50",
          selectedDrug ? "bg-white" : "bg-white",
        )}
      >
        <Search className="w-4 h-4 text-slate-400 shrink-0" />

        {selectedDrug ? (
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="font-medium text-slate-800 truncate">
              {selectedDrug.name}
            </span>
            {selectedDrug.strength && (
              <span className="text-xs text-slate-500 shrink-0">
                {selectedDrug.strength}
              </span>
            )}
          </div>
        ) : (
          <span className="flex-1 text-slate-400 text-sm truncate">
            {placeholder}
          </span>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {selectedDrug && (
            <button
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              type="button"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-80 overflow-hidden flex flex-col">
          {/* Search Input */}
          <div className="p-3 border-b border-slate-100 sticky top-0 bg-white">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Type to search drugs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Drug List */}
          <div className="overflow-y-auto flex-1">
            {filteredDrugs.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">
                {searchQuery ? "No drugs found" : "Start typing to search"}
              </div>
            ) : (
              <div className="py-1">
                {filteredDrugs.map((drug) => (
                  <button
                    key={drug.id}
                    type="button"
                    onClick={() => handleSelect(drug)}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0 flex items-center gap-2",
                      drug.id === value &&
                        "bg-blue-50 border-l-4 border-l-blue-500",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800 truncate">
                          {drug.name}
                        </span>
                        {drug.id === value && (
                          <Check className="w-4 h-4 text-blue-600 shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {drug.genericName && `${drug.genericName} • `}
                        {drug.strength} {drug.form}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-slate-100 text-xs text-slate-400 text-center bg-slate-50">
            {filteredDrugs.length} of {drugs.length} drugs
          </div>
        </div>
      )}
    </div>
  );
}

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


interface NewPrescriptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  visitId: string;
  visit?: PrescriptionTabProps["visit"];
  onSuccess: () => void;
  /** When set, the dialog edits this prescription instead of creating a new one */
  editTarget?: Prescription | null;
}

function NewPrescriptionDialog({
  isOpen,
  onClose,
  visitId,
  visit,
  onSuccess,
  editTarget,
}: NewPrescriptionDialogProps) {
  const qc = useQueryClient();
  const isEditMode = !!editTarget;

  const [items, setItems] = useState<PrescriptionItemInput[]>([
    { ...DEFAULT_ITEM },
  ]);
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");

  // Load the prescription into the form when entering edit mode
  useEffect(() => {
    if (!isOpen) return;
    if (editTarget) {
      setItems(
        editTarget.items.length
          ? editTarget.items.map((it) => ({
              drugId: it.drugId,
              drugName: it.drug?.name ?? "",
              dosage: it.dosage ?? "",
              frequency: it.frequency ?? "",
              duration: it.duration ?? "",
              route: it.route ?? "oral",
              quantity: String(it.quantity ?? ""),
              instructions: it.instructions ?? "",
              refills: String(it.refills ?? 0),
            }))
          : [{ ...DEFAULT_ITEM }],
      );
      setNotes(editTarget.notes ?? "");
      setValidUntil(
        editTarget.validUntil
          ? new Date(editTarget.validUntil).toISOString().slice(0, 10)
          : "",
      );
    } else {
      setItems([{ ...DEFAULT_ITEM }]);
      setNotes("");
      setValidUntil("");
    }
    // Only re-run when the open state or target changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editTarget?.id]);

  // Fetch drugs
  const { data: drugsResponse, isLoading: drugsLoading } = useQuery({
    queryKey: ["drugs", "active"],
    queryFn: async () => {
      return drugsApi.getAll({ isActive: true, limit: 1000 });
    },
    enabled: isOpen,
    staleTime: 60000,
  });

  // Extract drugs array
  const drugs: Drug[] = useMemo(() => {
    if (Array.isArray(drugsResponse)) return drugsResponse;
    if (drugsResponse?.data) return drugsResponse.data;
    return [];
  }, [drugsResponse]);

  const createMutation = useMutation({
    mutationFn: () => {
      const validItems = items.filter(
        (item) =>
          item.drugId &&
          item.dosage &&
          item.frequency &&
          item.duration &&
          parseInt(item.quantity) > 0,
      );

      if (validItems.length === 0) {
        throw new Error("Please add at least one valid medication");
      }

      const mappedItems = validItems.map((item) => ({
        drugId: item.drugId,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        route: item.route,
        quantity: parseInt(item.quantity),
        instructions: item.instructions || undefined,
        refills: parseInt(item.refills) || 0,
      }));

      if (isEditMode && editTarget) {
        return prescriptionsApi.update(editTarget.id, {
          notes: notes || undefined,
          validUntil: validUntil || undefined,
          items: mappedItems,
        });
      }

      return prescriptionsApi.create({
        visitId,
        notes: notes || undefined,
        validUntil: validUntil || undefined,
        items: mappedItems,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions", visitId] });
      qc.invalidateQueries({ queryKey: ["visit", visitId] });
      resetForm();
      onSuccess();
    },
    onError: (error) => {
      console.error(
        `Failed to ${isEditMode ? "update" : "create"} prescription:`,
        error,
      );
    },
  });

  const resetForm = () => {
    setItems([{ ...DEFAULT_ITEM }]);
    setNotes("");
    setValidUntil("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const addItem = () => {
    setItems([...items, { ...DEFAULT_ITEM }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      setItems([{ ...DEFAULT_ITEM }]);
    } else {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (
    index: number,
    field: keyof PrescriptionItemInput,
    value: string,
  ) => {
    setItems((prev) => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
    });
  };

  const handleDrugSelect = (index: number, drug: Drug | null) => {
    if (!drug) {
      // Clear selection
      updateItem(index, "drugId", "");
      updateItem(index, "drugName", "");
      return;
    }

    updateItem(index, "drugId", drug.id);
    updateItem(index, "drugName", drug.name);

    // Auto-suggest dosage based on form
    let suggestedDosage = "1";
    const form = (drug.form || "").toLowerCase();
    if (form.includes("syrup") || form.includes("suspension")) {
      suggestedDosage = "5ml";
    } else if (form.includes("drop")) {
      suggestedDosage = "2 drops";
    } else if (form.includes("inhaler") || form.includes("spray")) {
      suggestedDosage = "1 puff";
    } else if (form.includes("cream") || form.includes("ointment")) {
      suggestedDosage = "apply thin layer";
    }

    updateItem(index, "dosage", suggestedDosage);
  };

  const autoCalculateQuantity = (index: number) => {
    const item = items[index];
    if (!item.dosage || !item.frequency || !item.duration) return;

    // Parse dosage number
    const dosageMatch = item.dosage.match(/(\d+)/);
    const dosageNum = parseInt(dosageMatch?.[1] || "1");

    // Parse frequency to daily count
    let dailyCount = 1;
    const freq = item.frequency.toLowerCase();
    if (freq.includes("twice") || freq.includes("bd") || freq.includes("b.i.d"))
      dailyCount = 2;
    else if (
      freq.includes("three") ||
      freq.includes("tid") ||
      freq.includes("t.i.d")
    )
      dailyCount = 3;
    else if (
      freq.includes("four") ||
      freq.includes("qid") ||
      freq.includes("q.i.d")
    )
      dailyCount = 4;
    else if (freq.includes("every 4") || freq.includes("q4h")) dailyCount = 6;
    else if (freq.includes("every 6") || freq.includes("q6h")) dailyCount = 4;
    else if (freq.includes("every 8") || freq.includes("q8h")) dailyCount = 3;
    else if (freq.includes("every 12") || freq.includes("q12h")) dailyCount = 2;

    // Parse duration to days
    let days = 7;
    const dur = item.duration.toLowerCase();
    const dayMatch = dur.match(/(\d+)\s*day/);
    const weekMatch = dur.match(/(\d+)\s*week/);
    const monthMatch = dur.match(/(\d+)\s*month/);

    if (dayMatch) days = parseInt(dayMatch[1]);
    else if (weekMatch) days = parseInt(weekMatch[1]) * 7;
    else if (monthMatch) days = parseInt(monthMatch[1]) * 30;
    else if (dur.includes("until finished") || dur.includes("as directed"))
      days = 30;

    const calculated = dosageNum * dailyCount * days;
    updateItem(index, "quantity", calculated.toString());
  };

  // Validation
  const validationResults = items.map((item, idx) => {
    const hasDrugId = !!item.drugId && item.drugId.length > 0;
    const hasDosage = !!item.dosage && item.dosage.trim().length > 0;
    const hasFrequency = !!item.frequency && item.frequency.trim().length > 0;
    const hasDuration = !!item.duration && item.duration.trim().length > 0;
    const qtyNum = parseInt(item.quantity);
    const hasQuantity = !isNaN(qtyNum) && qtyNum > 0;

    return {
      idx,
      checks: {
        hasDrugId,
        hasDosage,
        hasFrequency,
        hasDuration,
        hasQuantity,
        drugId: item.drugId,
      },
      isValid:
        hasDrugId && hasDosage && hasFrequency && hasDuration && hasQuantity,
    };
  });

  const validItemsCount = validationResults.filter((r) => r.isValid).length;
  const isValid = validItemsCount > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2d5a87] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isEditMode ? "Edit Prescription" : "New Prescription"}
              </h2>
              <p className="text-xs text-blue-100">
                {isEditMode && editTarget
                  ? `Rx: ${editTarget.prescriptionCode}`
                  : visit?.visitCode
                    ? `Visit: ${visit.visitCode}`
                    : "New Prescription"}
                {visit?.patient &&
                  ` • Patient: ${visit.patient.firstName} ${visit.patient.lastName}`}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/20"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Debug Panel - Remove in production */}
        {/* {process.env.NODE_ENV === 'development' && (
          <div className="bg-yellow-50 px-4 py-2 text-xs border-b border-yellow-200">
            <div className="font-bold text-yellow-800">Debug: Drugs loaded: {drugs.length} | Valid items: {validItemsCount}</div>
            {validationResults.map((r, i) => (
              <div key={i} className="text-yellow-700">
                Item {i+1}: drugId={r.checks.drugId ? '✓' : '✗'}({r.checks.drugId}) | 
                dosage={r.checks.hasDosage ? '✓' : '✗'} | 
                freq={r.checks.hasFrequency ? '✓' : '✗'} | 
                dur={r.checks.hasDuration ? '✓' : '✗'} | 
                qty={r.checks.hasQuantity ? '✓' : '✗'}({items[i].quantity})
              </div>
            ))}
          </div>
        )} */}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Patient Info */}
          {visit?.patient && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">
                    {visit.patient.firstName} {visit.patient.lastName}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                    {visit.patient.patientCode}
                  </span>
                </div>
                <div className="text-sm text-slate-500 mt-0.5">
                  Visit ID: {visit.visitCode || visitId.slice(-8)}
                </div>
              </div>
            </div>
          )}

          {/* Medications */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Pill className="w-4 h-4 text-blue-600" />
                Medications
                {validItemsCount > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                    {validItemsCount} ready
                  </span>
                )}
              </h3>
              <button
                onClick={addItem}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50"
              >
                <Plus className="w-3.5 h-3.5" /> Add Medication
              </button>
            </div>

            {items.map((item, index) => (
              <div
                key={index}
                className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4"
              >
                {/* Item Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                        validationResults[index]?.isValid
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-500",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-600">
                      Medication
                    </span>
                    {item.drugName && (
                      <span className="text-xs text-slate-400">
                        - {item.drugName}
                      </span>
                    )}
                  </div>
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(index)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-12 gap-3">
                  {/* Drug Combobox - SPANS FULL WIDTH */}
                  <div className="col-span-12">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Drug / Medication <span className="text-red-500">*</span>
                      {item.drugId && (
                        <span className="ml-2 text-emerald-600 font-normal">
                          ✓ Selected (ID: {item.drugId.slice(-6)})
                        </span>
                      )}
                    </label>
                    <DrugCombobox
                      drugs={drugs}
                      value={item.drugId}
                      displayValue={item.drugName}
                      onChange={(drug) => handleDrugSelect(index, drug)}
                      disabled={drugsLoading}
                      placeholder={
                        drugsLoading
                          ? "Loading drugs..."
                          : "Click to select a drug..."
                      }
                    />
                  </div>

                  {/* Dosage */}
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Dosage <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        list={`dosages-${index}`}
                        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., 1 tablet"
                        value={item.dosage}
                        onChange={(e) =>
                          updateItem(index, "dosage", e.target.value)
                        }
                        onBlur={() => autoCalculateQuantity(index)}
                      />
                      <datalist id={`dosages-${index}`}>
                        {COMMON_DOSAGES.map((d) => (
                          <option key={d} value={d} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  {/* Route */}
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Route
                    </label>
                    <select
                      value={item.route}
                      onChange={(e) =>
                        updateItem(index, "route", e.target.value)
                      }
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {ROUTES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Frequency */}
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Frequency <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={item.frequency}
                      onChange={(e) => {
                        updateItem(index, "frequency", e.target.value);
                        autoCalculateQuantity(index);
                      }}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Select...</option>
                      {FREQUENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Duration */}
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Duration <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={item.duration}
                      onChange={(e) => {
                        updateItem(index, "duration", e.target.value);
                        autoCalculateQuantity(index);
                      }}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Select...</option>
                      {DURATION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Qty <span className="text-red-500">*</span>
                      <button
                        type="button"
                        onClick={() => autoCalculateQuantity(index)}
                        className="ml-1 text-blue-500 hover:text-blue-700"
                        title="Auto-calculate"
                      >
                        <RefreshCw className="w-3 h-3 inline" />
                      </button>
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(index, "quantity", e.target.value)
                      }
                    />
                  </div>

                  {/* Refills */}
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Refills
                    </label>
                    <select
                      value={item.refills}
                      onChange={(e) =>
                        updateItem(index, "refills", e.target.value)
                      }
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {[0, 1, 2, 3, 5, 11].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 0 ? "(none)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Instructions - spans remaining 8 columns */}
                  <div className="col-span-8">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Patient Instructions (Sig)
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Take with food • Avoid alcohol • Complete full course"
                      value={item.instructions}
                      onChange={(e) =>
                        updateItem(index, "instructions", e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Prescription Notes & Validity */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Prescription Notes
              </label>
              <textarea
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
                placeholder="Additional instructions for pharmacist or patient..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Valid Until
              </label>
              <input
                type="date"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
              <p className="text-xs text-slate-400 mt-1">
                Default: 30 days from today
              </p>
            </div>
          </div>

          {/* Error Display */}
          {createMutation.isError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {(createMutation.error as Error)?.message ||
                "Failed to create prescription"}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="text-xs text-slate-500">
            {validItemsCount} of {items.length} medication
            {validItemsCount !== 1 ? "s" : ""} ready
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!isValid || createMutation.isPending}
              className={cn(
                "flex items-center gap-2 px-6 py-2 text-sm font-semibold rounded-lg transition-all shadow-lg",
                isValid
                  ? "bg-[#1e3a5f] text-white hover:bg-[#16304f] shadow-blue-900/20"
                  : "bg-slate-300 text-slate-500 cursor-not-allowed",
              )}
            >
              {createMutation.isPending ? (
                <>
                  <Spinner size="sm" />
                  {isEditMode ? "Saving..." : "Creating..."}
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  {isEditMode ? "Save Changes" : "Create Prescription"}
                  {validItemsCount > 0 && ` (${validItemsCount})`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
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
          ? "opacity-60 border-slate-100"
          : "border-slate-200 hover:border-slate-300 hover:shadow-md",
      )}
    >
      {/* Main Row */}
      <div className="flex items-start gap-4 px-5 py-4">
        {/* Icon */}
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            rx.status === "DISPENSED"
              ? "bg-blue-50 border border-blue-100"
              : "bg-emerald-50 border border-emerald-100",
          )}
        >
          <Pill
            className={cn(
              "w-5 h-5",
              rx.status === "DISPENSED" ? "text-blue-500" : "text-emerald-500",
            )}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header Line */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-bold text-slate-800">
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
                className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5 ml-2"
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
                <span className="text-slate-400 w-4">{idx + 1}.</span>
                <span className="font-medium text-slate-700">
                  {item.drug.name}
                </span>
                <span className="text-slate-400">
                  {item.dosage} • {item.frequency}
                </span>
                {item.instructions && (
                  <span className="text-amber-600 italic truncate max-w-[200px]">
                    • {item.instructions}
                  </span>
                )}
              </div>
            ))}
            {!expanded && rx.items.length > 2 && (
              <div className="text-xs text-slate-400 pl-4">
                +{rx.items.length - 2} more...
              </div>
            )}
          </div>

          {/* Meta Row */}
          <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-400 flex-wrap">
            <span className="flex items-center gap-1 font-mono">
              <Hash className="w-3 h-3" />
              {rx.prescriptionCode}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(rx.createdAt).toLocaleDateString()}
            </span>
            {rx.validUntil && (
              <span className={cn(isExpired && "text-red-500 font-medium")}>
                Valid until: {new Date(rx.validUntil).toLocaleDateString()}
              </span>
            )}
            {rx.dispensedAt && (
              <span className="text-blue-600 font-medium">
                Dispensed: {new Date(rx.dispensedAt).toLocaleDateString()}
                {rx.dispensedBy && ` by ${rx.dispensedBy}`}
              </span>
            )}
          </div>

          {/* Notes */}
          {rx.notes && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{rx.notes}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onPrint}
            title="Print prescription"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Printer className="w-4 h-4" />
          </button>

          {/* Edit — only while ACTIVE & not dispensed */}
          {!readOnly && rx.status === "ACTIVE" && (
            <button
              onClick={onEdit}
              title="Edit prescription"
              className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}

          {rx.status === "ACTIVE" && !readOnly && (
            <button
              onClick={onDispense}
              title="Mark as dispensed"
              className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Check className="w-4 h-4" />
            </button>
          )}

          {!readOnly && rx.status !== "DISPENSED" && (
            <button
              onClick={onDelete}
              title="Delete prescription"
              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="space-y-3">
            {rx.items.map((item, idx) => (
              <div
                key={item.id}
                className="bg-white rounded-lg border border-slate-200 p-3"
              >
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">
                        {item.drug.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.drug.strength} {item.drug.form}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                      <div>
                        <span className="text-slate-400">Dosage:</span>{" "}
                        <span className="text-slate-700">{item.dosage}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Frequency:</span>{" "}
                        <span className="text-slate-700">{item.frequency}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Duration:</span>{" "}
                        <span className="text-slate-700">{item.duration}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Quantity:</span>{" "}
                        <span className="text-slate-700">{item.quantity}</span>
                      </div>
                      {item.route && (
                        <div>
                          <span className="text-slate-400">Route:</span>{" "}
                          <span className="text-slate-700 capitalize">
                            {item.route}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400">Refills:</span>{" "}
                        <span className="text-slate-700">{item.refills}</span>
                      </div>
                    </div>
                    {item.instructions && (
                      <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded px-2 py-1.5">
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
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              Delete Prescription?
            </h3>
            <p className="text-sm text-slate-500">
              This will permanently delete {rx.items.length} medication
              {rx.items.length !== 1 ? "s" : ""}.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="w-4 h-4 text-slate-400" />
            <span className="font-mono text-sm text-slate-600">
              {rx.prescriptionCode}
            </span>
          </div>
          <div className="text-sm text-slate-700">
            {rx.items.map((i) => i.drug.name).join(", ")}
          </div>
          {rx.notes && (
            <div className="mt-2 text-xs text-slate-500 italic">
              Note: {rx.notes}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isPending ? <Spinner size="sm" /> : <Trash2 className="w-4 h-4" />}
            Delete Prescription
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main PrescriptionTab Component ────────────────────────────────────────────

export function PrescriptionTab({
  visitId,
  visit,
  readOnly,
}: PrescriptionTabProps) {
  const qc = useQueryClient();
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Prescription | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Prescription | null>(null);

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

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: string) => prescriptionsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions", visitId] });
      qc.invalidateQueries({ queryKey: ["visit", visitId] });
      setDeleteTarget(null);
    },
  });

  const dispenseMutation = useMutation({
    mutationFn: (id: string) => prescriptionsApi.dispense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions", visitId] });
      qc.invalidateQueries({ queryKey: ["visit", visitId] });
    },
  });

  // Stats
  const activeCount = prescriptions.filter((r) => r.status === "ACTIVE").length;
  const dispensedCount = prescriptions.filter(
    (r) => r.status === "DISPENSED",
  ).length;
  const totalItems = prescriptions.reduce((sum, r) => sum + r.items.length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Pill className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Prescriptions
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              {prescriptions.length > 0 ? (
                <>
                  {activeCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                      {activeCount} active
                    </span>
                  )}
                  {dispensedCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                      {dispensedCount} dispensed
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {totalItems} medication{totalItems !== 1 ? "s" : ""} total
                  </span>
                </>
              ) : (
                <span className="text-xs text-slate-400">
                  No prescriptions yet
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Refresh list"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {!readOnly && (
            <button
              onClick={() => setIsNewDialogOpen(true)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Prescription
            </button>
          )}
        </div>
      </div>

      {/* New / Edit Prescription Dialog */}
      <NewPrescriptionDialog
        isOpen={isNewDialogOpen || !!editTarget}
        onClose={() => {
          setIsNewDialogOpen(false);
          setEditTarget(null);
        }}
        visitId={visitId}
        visit={visit}
        editTarget={editTarget}
        onSuccess={() => {
          setIsNewDialogOpen(false);
          setEditTarget(null);
        }}
      />

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
          <Spinner size="lg" />
          <p className="text-sm text-slate-500 mt-3">
            Loading prescriptions...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">
              Failed to load prescriptions
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Please check your connection and try again
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && prescriptions.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Pill className="w-8 h-8 text-slate-400" />
          </div>
          <h4 className="text-base font-semibold text-slate-700 mb-1">
            No prescriptions yet
          </h4>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-4">
            Prescriptions written during this visit will appear here. Click "New
            Prescription" to add medications.
          </p>
          {!readOnly && (
            <button
              onClick={() => setIsNewDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Write your first prescription
            </button>
          )}
        </div>
      )}

      {/* Prescriptions List */}
      {!isLoading && !error && prescriptions.length > 0 && (
        <div className="space-y-3">
          {prescriptions.map((rx) => (
            <RxCard
              key={rx.id}
              rx={rx}
              visit={visit}
              readOnly={readOnly}
              onDelete={() => setDeleteTarget(rx)}
              onDispense={() => dispenseMutation.mutate(rx.id)}
              onPrint={() => printPrescription(rx, visit, clinicSettings)}
              onEdit={() => setEditTarget(rx)}
            />
          ))}
        </div>
      )}

      {/* Summary Footer */}
      {/* Summary Footer */}
      {prescriptions.length > 0 && (
        <div className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
          <span className="text-xs text-slate-500">
            Showing {prescriptions.length} prescription
            {prescriptions.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => printAllPrescriptions(prescriptions, visit, clinicSettings)}
            className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Print All Prescriptions
          </button>
        </div>
      )}
      
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
