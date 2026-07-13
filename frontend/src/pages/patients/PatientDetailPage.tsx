// src/pages/patients/PatientDetailPage.tsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { patientsApi, emrApi } from "../../lib/api";
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  getAge,
  getInitials,
  cn,
} from "../../lib/utils";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Droplets,
  Heart,
  Pill,
  Calendar,
  FileText,
  CreditCard,
  Activity,
  Image,
  Stethoscope,
  Plus,
  Clock,
  AlertTriangle,
  BarChart2,
  Receipt,
  ClipboardList,
  CalendarDays,
  ShieldCheck,
  UserCheck,
  Loader2,
  ArrowLeft,
  Edit,
  ChevronRight,
  Zap,
  HeartPulse,
  Briefcase,
} from "lucide-react";

import TreatmentPlanTab from "./components/TreatmentPlanTab";
// import { DentalChart } from "./components/DentalChart";
import PrescriptionsTab from "./components/PrescriptionsTab";
import { BillingTab } from "./components/BillingTab";
// import { ExaminationTab } from "./components/ExaminationTab";
import ProgressReportsTab from "./components/ProgressReportsTab";
import { PatientAppointmentsTab } from "./components/PatientAppointmentsTab";

import { PatientVisitsTab } from './components/PatientVisitsTab';
import { PatientProceduresTab } from './components/PatientProceduresTab';

import { PatientReportTab } from './components/PatientReportTab';

// ─── Helpers ──────────────────────────────────────────────────────────────────


// ─── Helpers ──────────────────────────────────────────────────────────────────

// Parse allergies that could be string, array, or null/undefined
function parseAllergies(allergies: any): string[] {
  // Handle null/undefined/empty
  if (!allergies) return [];
  
  // If already an array, filter and return
  if (Array.isArray(allergies)) {
    return allergies
      .map((a: any) => String(a).trim())
      .filter((a: string) => a.length > 0);
  }
  
  // If it's a string, split by comma
  if (typeof allergies === 'string') {
    return allergies
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
  }
  
  // Fallback: convert to string and try to parse
  return String(allergies)
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}


function Spinner({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <Loader2
      className={cn(
        "animate-spin text-blue-600",
        size === "sm" ? "w-4 h-4" : "w-6 h-6",
      )}
    />
  );
}

function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: any;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Icon className="w-10 h-10 mb-3 opacity-25" />
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {subtitle && <p className="text-xs mt-1 text-slate-400">{subtitle}</p>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    INACTIVE: "bg-red-50 text-red-600 border-red-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
    PLANNED: "bg-slate-100 text-slate-600 border-slate-200",
    ON_HOLD: "bg-amber-50 text-amber-700 border-amber-200",
    CANCELLED: "bg-red-50 text-red-600 border-red-200",
    SCHEDULED: "bg-sky-50 text-sky-700 border-sky-200",
    CHECKED_IN: "bg-amber-50 text-amber-700 border-amber-200",
    PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
    UNPAID: "bg-red-50 text-red-600 border-red-200",
    PARTIAL: "bg-amber-50 text-amber-700 border-amber-200",
    PENDING: "bg-slate-100 text-slate-600 border-slate-200",
    VERIFIED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    EXPIRED: "bg-red-50 text-red-600 border-red-200",
    NO_SHOW: "bg-red-50 text-red-600 border-red-200",
  };
  const cls =
    map[status?.toUpperCase()] ??
    "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={cn(
        "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap",
        cls,
      )}
    >
      {status?.replace(/_/g, " ")}
    </span>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview", icon: User },
  { id: "appointments", label: "Appointments", icon: CalendarDays },
  { id: 'visits', label: 'Visits', icon: Calendar },
  { id: "treatment", label: "Treatment Plans", icon: ClipboardList },
  { id: "prescriptions", label: "Prescriptions", icon: Pill },
  { id: "billing", label: "Billing / Ledger", icon: Receipt },
  { id: "progress", label: "Progress Report", icon: ShieldCheck },
  { id: "timeline", label: "Timeline", icon: Activity },
  { id: 'procedures', label: 'Procedures', icon: Activity },
  { id: 'patient-report', label: 'Patient Report', icon: FileText },
];

// ─── Sub-tabs/content ─────────────────────────────────────────────────────────

function OverviewTab({
  patient,
  navigate,
  setActiveTab,
}: {
  patient: any;
  navigate: any;
  setActiveTab: (t: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-1">
      {/* ── Left column ── */}
      <div className="lg:col-span-2 space-y-1">
        {/* Personal Info */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" /> Personal Information
            </h3>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
            {[
              { label: "First Name", value: patient.firstName },
              { label: "Last Name", value: patient.lastName },
              {
                label: "Date of Birth",
                value: patient.dateOfBirth
                  ? formatDate(patient.dateOfBirth)
                  : "—",
              },
              {
                label: "Age",
                value: patient.dateOfBirth
                  ? `${getAge(patient.dateOfBirth)} years`
                  : "—",
              },
              { label: "Gender", value: patient.gender || "—" },
              { label: "Marital Status", value: patient.maritalStatus || "—" },
            ].map(({ label, value, cls }: any) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
                  {label}
                </p>
                <p className={cn("text-sm font-semibold text-slate-800", cls)}>
                  {value}
                </p>
              </div>
            ))}
          
          </div>
        </div>

        {/* Medical Background */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-semibold text-slate-700">
              Medical Information
            </h3>
          </div>
          <div className="p-4 space-y-4">
            {/* Medical Conditions */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">
                Medical Conditions
              </p>
              {patient.medicalConditions?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {patient.medicalConditions.map((c: string) => (
                    <span
                      key={c}
                      className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-medium text-amber-700"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">None on record</p>
              )}
            </div>


     <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
        Allergies
      </p>
      {parseAllergies(patient.allergies).length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {parseAllergies(patient.allergies).map((allergy) => (
            <span
              key={allergy}
              className="px-2 py-0.5 bg-red-50 border border-red-200 rounded-full text-[12px] font-semibold text-red-700 flex items-center gap-1"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              {allergy}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm font-semibold text-slate-800">—</p>
      )}
    </div>



            {/* Current Medications */}
            {patient.currentMedications?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">
                  Current Medications
                </p>
                <div className="flex flex-wrap gap-2">
                  {patient.currentMedications.map((m: string) => (
                    <span
                      key={m}
                      className="px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-full text-xs font-medium text-purple-700"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* Notes */}
            {patient.medicalNotes && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                  Notes
                </p>
                <p className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg p-3 leading-relaxed">
                  {patient.medicalNotes}
                </p>
              </div>
            )}

          </div>
        </div>

        {/* Contact Info */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2">
            <Phone className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-700">
              Contact Information
            </h3>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
            {[
              { label: "Phone", value: patient.phone || "—" },
              { label: "Alt. Phone", value: patient.alternatePhone || "—" },
              { label: "Email", value: patient.email || "—" },
              { label: "Address", value: patient.address || "—" },
              { label: "City", value: patient.city || "—" },
              { label: "Country", value: patient.country || "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
                  {label}
                </p>
                <p className="text-sm font-semibold text-slate-800 break-words">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Right column ── */}
      <div className="space-y-5">
        {/* Emergency Contact */}
        {patient.emergencyContactName && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-700">
                Emergency Contact
              </h3>
            </div>
            <div className="p-4 space-y-2">
              <p className="font-bold text-slate-800">
                {patient.emergencyContactName}
              </p>
              <p className="text-xs text-slate-500">
                {patient.emergencyContactRelation}
              </p>
              <p className="text-sm font-semibold text-blue-600">
                {patient.emergencyContactPhone}
              </p>
              {patient.emergencyContactEmail && (
                <p className="text-xs text-slate-500">
                  {patient.emergencyContactEmail}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Activity Summary */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-700">
              Activity Summary
            </h3>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {[
              {
                label: "Appointments",
                value: patient._count?.appointments ?? 0,
                color: "text-blue-600",
                bg: "bg-blue-50",
              },
              {
                label: "Treatment Plans",
                value: patient._count?.treatmentPlans ?? 0,
                color: "text-indigo-600",
                bg: "bg-indigo-50",
              },
              {
                label: "EMR Records",
                value: patient._count?.emrRecords ?? 0,
                color: "text-emerald-600",
                bg: "bg-emerald-50",
              },
              {
                label: "Invoices",
                value: patient._count?.invoices ?? 0,
                color: "text-amber-600",
                bg: "bg-amber-50",
              },
              {
                label: "Prescriptions",
                value: patient._count?.prescriptions ?? 0,
                color: "text-purple-600",
                bg: "bg-purple-50",
              },
              {
                label: "Visits",
                value: patient._count?.visits ?? 0,
                color: "text-rose-600",
                bg: "bg-rose-50",
              },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={cn("rounded-lg p-3 text-center", bg)}>
                <p className={cn("text-2xl font-bold", color)}>{value}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Invoices snapshot */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-500" /> Recent Invoices
            </h3>
            <button
              onClick={() => setActiveTab("billing")}
              className="text-xs text-blue-600 hover:underline"
            >
              View all
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {patient.invoices?.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6 italic">
                No invoices
              </p>
            ) : (
              patient.invoices?.slice(0, 4).map((inv: any) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between px-4 py-2.5"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-700">
                      {inv.invoiceNumber}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {formatDate(inv.createdAt)}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="text-xs font-bold text-slate-800">
                      {formatCurrency(inv.total)}
                    </p>
                    <StatusPill status={inv.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Referred By */}
        {(patient.referredBy || patient.referralSource) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-700">Referral</h3>
            </div>
            <div className="p-4 space-y-1">
              {patient.referredBy && (
                <p className="text-sm font-semibold text-slate-800">
                  {patient.referredBy}
                </p>
              )}
              {patient.referralSource && (
                <p className="text-xs text-slate-500">
                  {patient.referralSource}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ── EMR Tab ───────────────────────────────────────────────────────────────────
function EMRTab({ patient, navigate }: { patient: any; navigate: any }) {
  const records = patient.emrRecords ?? [];
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => navigate(`/emr/new?patientId=${patient.id}`)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-semibold hover:bg-[#16324f] transition-colors"
        >
          <Plus className="w-4 h-4" /> New EMR Record
        </button>
      </div>
      {records.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No medical records"
          subtitle="Records will appear here after consultations."
        />
      ) : (
        records.map((emr: any) => (
          <div
            key={emr.id}
            onClick={() => navigate(`/emr/${emr.id}`)}
            className="p-4 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/20 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {formatDateTime(emr.createdAt)}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Dr. {emr.dentist?.firstName} {emr.dentist?.lastName}
                  </p>
                </div>
              </div>
              {emr.visitType && <StatusPill status={emr.visitType} />}
            </div>
            {emr.chiefComplaint && (
              <p className="text-xs text-slate-600 mt-3 pl-12">
                <span className="font-semibold text-slate-700">
                  Chief complaint:{" "}
                </span>
                {emr.chiefComplaint}
              </p>
            )}
            {emr.assessment && (
              <div className="mt-2 pl-12">
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-blue-700">
                    Assessment:{" "}
                  </span>
                  <span className="text-xs text-blue-600">
                    {emr.assessment}
                  </span>
                </div>
              </div>
            )}
            {emr.treatmentNotes && (
              <div className="mt-2 pl-12">
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-slate-600">
                    Treatment notes:{" "}
                  </span>
                  <span className="text-xs text-slate-500">
                    {emr.treatmentNotes}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}



// ── Timeline Tab ──────────────────────────────────────────────────────────────
function TimelineTab({ patientId }: { patientId: string }) {
  const { data: timeline, isLoading } = useQuery({
    queryKey: ["patient-timeline", patientId],
    queryFn: () => emrApi.getTimeline(patientId),
    enabled: !!patientId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!timeline || (timeline as any[]).length === 0) {
    return <EmptyState icon={Activity} title="No timeline events yet" />;
  }

  const ICON_MAP: Record<string, any> = {
    APPOINTMENT: CalendarDays,
    EMR: FileText,
    INVOICE: CreditCard,
    PRESCRIPTION: Pill,
    IMAGING: Image,
    VISIT: Stethoscope,
  };
  const COLOR_MAP: Record<string, string> = {
    APPOINTMENT: "bg-blue-100 text-blue-600 border-blue-200",
    EMR: "bg-emerald-100 text-emerald-600 border-emerald-200",
    INVOICE: "bg-amber-100 text-amber-600 border-amber-200",
    PRESCRIPTION: "bg-purple-100 text-purple-600 border-purple-200",
    IMAGING: "bg-indigo-100 text-indigo-600 border-indigo-200",
    VISIT: "bg-rose-100 text-rose-600 border-rose-200",
  };

  return (
    <div className="relative pl-6">
      <div className="absolute left-5 top-2 bottom-2 w-px bg-slate-200" />
      {(timeline as any[]).map((event: any, i: number) => {
        const Icon = ICON_MAP[event.type] ?? Activity;
        const cls =
          COLOR_MAP[event.type] ??
          "bg-slate-100 text-slate-500 border-slate-200";
        return (
          <div key={i} className="relative flex gap-4 mb-4">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 border-2 border-white shadow-sm",
                cls,
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm p-3 mb-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {event.type}
                </span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDateTime(event.date)}
                </span>
              </div>
              <p className="text-sm text-slate-700 font-medium">
                {event.data?.assessment ||
                  event.data?.invoiceNumber ||
                  event.data?.type?.replace(/_/g, " ") ||
                  event.data?.title ||
                  event.data?.medicationName ||
                  "Record"}
              </p>
              {event.data?.chiefComplaint && (
                <p className="text-xs text-slate-400 mt-1 italic">
                  "{event.data.chiefComplaint}"
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main PatientDetailPage ───────────────────────────────────────────────────

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  const {
    data: patient,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["patient", id],
    queryFn: () => patientsApi.getOne(id!),
    enabled: !!id,
  });

  if (!id)
    return (
      <div className="flex items-center justify-center h-96 text-slate-400 text-sm">
        No patient ID provided
      </div>
    );

  if (isLoading)
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Spinner />
        <p className="text-sm text-slate-400">Loading patient…</p>
      </div>
    );

  if (error || !patient)
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-red-500 text-sm mb-4">Patient not found</p>
        <button
          onClick={() => navigate("/patients")}
          className="flex items-center gap-2 px-4 py-2 rounded border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Patients
        </button>
      </div>
    );

  const age = patient.dateOfBirth ? getAge(patient.dateOfBirth) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-screen-2xl mx-auto px-2 py-4 space-y-4">
        {/* ── Patient Header Card ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Dark top bar */}
          <div className="px-5 py-1.5 bg-[#0369a1] text-white flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <p className="font-bold text-base leading-tight">
                  {patient.firstName} {patient.lastName}
                </p>
                <p className="text-blue-200 text-xs mt-0.5">
                  {patient.patientCode}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Active/Inactive badge */}
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-semibold",
                  patient.isActive
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-600",
                )}
              >
                {patient.isActive ? "● Active" : "● Inactive"}
              </span>

              {/* Quick action buttons */}
              <button
                onClick={() =>
                  navigate(`/appointments/new?patientId=${patient.id}`)
                }
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded text-xs font-semibold transition-colors border border-white/20"
              >
                <CalendarDays className="w-3.5 h-3.5" /> Book Appointment
              </button>
              {/*              <button
                onClick={() => navigate(`/dental-chart/${patient.id}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#1e3a5f] rounded text-xs font-semibold hover:bg-blue-50 transition-colors"
              >
                <Stethoscope className="w-3.5 h-3.5" /> Dental Chart
              </button>*/}
            </div>
          </div>

          {/* Info strip */}
          <div className="px-5 py-2.5 flex flex-wrap gap-x-8 gap-y-2 bg-slate-50 border-b border-slate-200">
            {[
              { label: "Age", value: age ? `${age} yrs` : "—" },
              { label: "Gender", value: patient.gender || "—" },
              {
                label: "DOB",
                value: patient.dateOfBirth
                  ? formatDate(patient.dateOfBirth)
                  : "—",
              },
              { label: "Phone", value: patient.phone || "—" },
              { label: "City", value: patient.city || "—" },
              {
                label: "Registered",
                value: patient.registeredAt
                  ? formatDate(patient.registeredAt)
                  : "—",
              },
            ].map(({ label, value, cls }: any) => (
              <div key={label} className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                  {label}
                </span>
                <span
                  className={cn("font-semibold text-slate-700 text-xs", cls)}
                >
                  {value}
                </span>
              </div>
            ))}

            <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
        Allergies
      </p>
      {parseAllergies(patient.allergies).length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {parseAllergies(patient.allergies).map((allergy) => (
            <span
              key={allergy}
              className="px-2 py-0.5 bg-red-50 border border-red-200 rounded-full text-[10px] font-semibold text-red-700 flex items-center gap-1"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              {allergy}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm font-semibold text-slate-800">—</p>
      )}
    </div>

            {/* Allergy alert inline */}
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                    active
                      ? "border-blue-600 text-blue-700 bg-white"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-5">
            {activeTab === "overview" && (
              <OverviewTab
                patient={patient}
                navigate={navigate}
                setActiveTab={setActiveTab}
              />
            )}
            {activeTab === "appointments" && (
              <PatientAppointmentsTab
                patientId={patient.id} />
            )}
            {activeTab === 'visits' && <PatientVisitsTab patientId={patient.id} />}
            {activeTab === 'procedures' && <PatientProceduresTab patientId={patient.id} />}
            {activeTab === "treatment" && (
              <TreatmentPlanTab patientId={patient.id} />
            )}
            {activeTab === "prescriptions" && (
              <PrescriptionsTab
                patient={patient}
                patientId={patient.id}
              />
            )}
            {activeTab === "billing" && (
              <BillingTab
                patientId={patient.id}
                patientName={`${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim()}
                navigate={navigate}
              />
            )}
            {activeTab === "progress" && (
              <ProgressReportsTab
                patient={patient}
                patientId={patient.id}
              />
            )}
            {activeTab === "timeline" && <TimelineTab patientId={patient.id} />}
            {activeTab === "patient-report" && <PatientReportTab patientId={patient.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}
