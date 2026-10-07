// src/pages/patients/PatientDetailPage.tsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { patientsApi, emrApi } from "../../lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { UserRole } from "@/types/shared";
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
import { DentalChart } from "../visits/components/DentalChart";
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
        "animate-spin text-primary",
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
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/70">
      <Icon className="w-10 h-10 mb-3 opacity-25" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {subtitle && <p className="text-xs mt-1 text-muted-foreground/70">{subtitle}</p>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-success-muted/60 text-success border-success/25",
    INACTIVE: "bg-danger-muted/60 text-danger border-danger/25",
    COMPLETED: "bg-success-muted/60 text-success border-success/25",
    IN_PROGRESS: "bg-primary-muted/60 text-primary border-primary/25",
    PLANNED: "bg-muted text-muted-foreground border-border",
    ON_HOLD: "bg-warning-muted/60 text-warning border-warning/25",
    CANCELLED: "bg-danger-muted/60 text-danger border-danger/25",
    SCHEDULED: "bg-primary-muted/60 text-primary border-primary/25",
    CHECKED_IN: "bg-warning-muted/60 text-warning border-warning/25",
    PAID: "bg-success-muted/60 text-success border-success/25",
    UNPAID: "bg-danger-muted/60 text-danger border-danger/25",
    PARTIAL: "bg-warning-muted/60 text-warning border-warning/25",
    PENDING: "bg-muted text-muted-foreground border-border",
    VERIFIED: "bg-success-muted/60 text-success border-success/25",
    EXPIRED: "bg-danger-muted/60 text-danger border-danger/25",
    NO_SHOW: "bg-danger-muted/60 text-danger border-danger/25",
  };
  const cls =
    map[status?.toUpperCase()] ??
    "bg-muted text-muted-foreground border-border";
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
  { id: "dental-chart", label: "Dental Chart", icon: Stethoscope, clinical: true },
  { id: "treatment", label: "Treatment Plans", icon: ClipboardList, clinical: true },
  { id: "prescriptions", label: "Prescriptions", icon: Pill },
  { id: "billing", label: "Billing / Ledger", icon: Receipt },
  { id: "progress", label: "Progress Report", icon: ShieldCheck, clinical: true },
  { id: "timeline", label: "Timeline", icon: Activity },
  { id: 'procedures', label: 'Procedures', icon: Activity, clinical: true },
  { id: 'patient-report', label: 'Patient Report', icon: FileText, clinical: true },
] as Array<{ id: string; label: string; icon: any; clinical?: boolean }>;

/** The clinical record is readable by clinicians only (same roles as the API). */
const CLINICAL_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.DENTIST,
  UserRole.NURSE,
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
        <div className="rounded-xl border border-border bg-muted/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-white flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Personal Information
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
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">
                  {label}
                </p>
                <p className={cn("text-sm font-semibold text-foreground", cls)}>
                  {value}
                </p>
              </div>
            ))}
          
          </div>
        </div>

        {/* Medical Background */}
        <div className="rounded-xl border border-border bg-muted/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-white flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-danger" />
            <h3 className="text-sm font-semibold text-foreground">
              Medical Information
            </h3>
          </div>
          <div className="p-4 space-y-4">
            {/* Medical Conditions */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-2">
                Medical Conditions
              </p>
              {patient.medicalConditions?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {patient.medicalConditions.map((c: string) => (
                    <span
                      key={c}
                      className="px-2.5 py-1 bg-warning-muted/60 border border-warning/25 rounded-full text-xs font-medium text-warning"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/70 italic">None on record</p>
              )}
            </div>


     <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">
        Allergies
      </p>
      {parseAllergies(patient.allergies).length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {parseAllergies(patient.allergies).map((allergy) => (
            <span
              key={allergy}
              className="px-2 py-0.5 bg-danger-muted/60 border border-danger/25 rounded-full text-[12px] font-semibold text-danger flex items-center gap-1"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              {allergy}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm font-semibold text-foreground">—</p>
      )}
    </div>



            {/* Current Medications */}
            {patient.currentMedications?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-2">
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
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">
                  Notes
                </p>
                <p className="text-xs text-muted-foreground bg-white border border-border rounded-lg p-3 leading-relaxed">
                  {patient.medicalNotes}
                </p>
              </div>
            )}

          </div>
        </div>

        {/* Contact Info */}
        <div className="rounded-xl border border-border bg-muted/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-white flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
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
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">
                  {label}
                </p>
                <p className="text-sm font-semibold text-foreground break-words">
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
          <div className="rounded-xl border border-border bg-muted/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Emergency Contact
              </h3>
            </div>
            <div className="p-4 space-y-2">
              <p className="font-bold text-foreground">
                {patient.emergencyContactName}
              </p>
              <p className="text-xs text-muted-foreground">
                {patient.emergencyContactRelation}
              </p>
              <p className="text-sm font-semibold text-primary">
                {patient.emergencyContactPhone}
              </p>
              {patient.emergencyContactEmail && (
                <p className="text-xs text-muted-foreground">
                  {patient.emergencyContactEmail}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Activity Summary */}
        <div className="rounded-xl border border-border bg-muted/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-white flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Activity Summary
            </h3>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {[
              {
                label: "Appointments",
                value: patient._count?.appointments ?? 0,
                color: "text-primary",
                bg: "bg-primary-muted/60",
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
                color: "text-success",
                bg: "bg-success-muted/60",
              },
              {
                label: "Invoices",
                value: patient._count?.invoices ?? 0,
                color: "text-warning",
                bg: "bg-warning-muted/60",
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
                color: "text-danger",
                bg: "bg-danger-muted/60",
              },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={cn("rounded-lg p-3 text-center", bg)}>
                <p className={cn("text-2xl font-bold", color)}>{value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Invoices snapshot */}
        <div className="rounded-xl border border-border bg-muted/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-white flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Receipt className="w-4 h-4 text-warning" /> Recent Invoices
            </h3>
            <button
              onClick={() => setActiveTab("billing")}
              className="text-xs text-primary hover:underline"
            >
              View all
            </button>
          </div>
          <div className="divide-y divide-border/60">
            {patient.invoices?.length === 0 ? (
              <p className="text-xs text-muted-foreground/70 text-center py-6 italic">
                No invoices
              </p>
            ) : (
              patient.invoices?.slice(0, 4).map((inv: any) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between px-4 py-2.5"
                >
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      {inv.invoiceNumber}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {formatDate(inv.createdAt)}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="text-xs font-bold text-foreground">
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
          <div className="rounded-xl border border-border bg-muted/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Referral</h3>
            </div>
            <div className="p-4 space-y-1">
              {patient.referredBy && (
                <p className="text-sm font-semibold text-foreground">
                  {patient.referredBy}
                </p>
              )}
              {patient.referralSource && (
                <p className="text-xs text-muted-foreground">
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
            className="p-4 rounded-xl border border-border/60 hover:border-primary/25 hover:bg-primary-muted/20 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary-muted/60 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatDateTime(emr.createdAt)}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    Dr. {emr.dentist?.firstName} {emr.dentist?.lastName}
                  </p>
                </div>
              </div>
              {emr.visitType && <StatusPill status={emr.visitType} />}
            </div>
            {emr.chiefComplaint && (
              <p className="text-xs text-muted-foreground mt-3 pl-12">
                <span className="font-semibold text-foreground">
                  Chief complaint:{" "}
                </span>
                {emr.chiefComplaint}
              </p>
            )}
            {emr.assessment && (
              <div className="mt-2 pl-12">
                <div className="bg-primary-muted/60 border border-primary/20 rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-primary">
                    Assessment:{" "}
                  </span>
                  <span className="text-xs text-primary">
                    {emr.assessment}
                  </span>
                </div>
              </div>
            )}
            {emr.treatmentNotes && (
              <div className="mt-2 pl-12">
                <div className="bg-muted/50 border border-border rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Treatment notes:{" "}
                  </span>
                  <span className="text-xs text-muted-foreground">
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
    APPOINTMENT: "bg-primary-muted text-primary border-primary/25",
    EMR: "bg-success-muted text-success border-success/25",
    INVOICE: "bg-warning-muted text-warning border-warning/25",
    PRESCRIPTION: "bg-purple-100 text-purple-600 border-purple-200",
    IMAGING: "bg-indigo-100 text-indigo-600 border-indigo-200",
    VISIT: "bg-danger-muted text-danger border-danger/25",
  };

  return (
    <div className="relative pl-6">
      <div className="absolute left-5 top-2 bottom-2 w-px bg-muted" />
      {(timeline as any[]).map((event: any, i: number) => {
        const Icon = ICON_MAP[event.type] ?? Activity;
        const cls =
          COLOR_MAP[event.type] ??
          "bg-muted text-muted-foreground border-border";
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
            <div className="flex-1 bg-white rounded-xl border border-border/60 shadow-sm p-3 mb-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                  {event.type}
                </span>
                <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDateTime(event.date)}
                </span>
              </div>
              <p className="text-sm text-foreground font-medium">
                {event.data?.assessment ||
                  event.data?.invoiceNumber ||
                  event.data?.type?.replace(/_/g, " ") ||
                  event.data?.title ||
                  event.data?.medicationName ||
                  "Record"}
              </p>
              {event.data?.chiefComplaint && (
                <p className="text-xs text-muted-foreground/70 mt-1 italic">
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
  const { hasRole } = usePermissions();
  const canSeeClinical = hasRole(CLINICAL_ROLES);
  // Front desk, pharmacy and lab users would only get "Failed to load" from
  // the clinical endpoints (403), so those tabs are not offered to them.
  const visibleTabs = TABS.filter((t) => !t.clinical || canSeeClinical);

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
      <div className="flex items-center justify-center h-96 text-muted-foreground/70 text-sm">
        No patient ID provided
      </div>
    );

  if (isLoading)
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Spinner />
        <p className="text-sm text-muted-foreground/70">Loading patient…</p>
      </div>
    );

  if (error || !patient)
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-danger text-sm mb-4">Patient not found</p>
        <button
          onClick={() => navigate("/patients")}
          className="flex items-center gap-2 px-4 py-2 rounded border border-border text-sm text-muted-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Patients
        </button>
      </div>
    );

  const age = patient.dateOfBirth ? getAge(patient.dateOfBirth) : null;

  return (
    <div className="min-h-screen bg-muted/50">
      <div className="max-w-screen-2xl mx-auto px-2 py-4 space-y-4">
        {/* ── Patient Header Card ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Dark top bar */}
          <div className="px-5 py-2.5 bg-[#0369a1] text-white flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 ring-1 ring-white/30 rounded-full flex items-center justify-center text-sm font-bold uppercase">
                {patient.firstName?.[0]}
                {patient.lastName?.[0]}
              </div>
              <div>
                <p className="font-bold text-base leading-tight text-white">
                  {patient.firstName} {patient.lastName}
                </p>
                <p className="mt-0.5 font-mono text-xs text-white/85">
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
                    ? "bg-success-muted text-success"
                    : "bg-danger-muted text-danger",
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#1e3a5f] rounded text-xs font-semibold hover:bg-primary-muted/60 transition-colors"
              >
                <Stethoscope className="w-3.5 h-3.5" /> Dental Chart
              </button>*/}
            </div>
          </div>

          {/* Info strip */}
          <div className="px-5 py-2.5 flex flex-wrap gap-x-8 gap-y-2 bg-muted/50 border-b border-border">
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
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                  {label}
                </span>
                <span
                  className={cn("font-semibold text-foreground text-xs", cls)}
                >
                  {value}
                </span>
              </div>
            ))}

            <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">
        Allergies
      </p>
      {parseAllergies(patient.allergies).length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {parseAllergies(patient.allergies).map((allergy) => (
            <span
              key={allergy}
              className="px-2 py-0.5 bg-danger-muted/60 border border-danger/25 rounded-full text-[10px] font-semibold text-danger flex items-center gap-1"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              {allergy}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm font-semibold text-foreground">—</p>
      )}
    </div>

            {/* Allergy alert inline */}
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="flex border-b border-border bg-muted/50 overflow-x-auto">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                    active
                      ? "border-primary text-primary bg-white"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted",
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
            {canSeeClinical && activeTab === "dental-chart" && (
              <DentalChart patientId={patient.id} readOnly />
            )}
            {canSeeClinical && activeTab === 'procedures' && <PatientProceduresTab patientId={patient.id} />}
            {canSeeClinical && activeTab === "treatment" && (
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
            {canSeeClinical && activeTab === "progress" && (
              <ProgressReportsTab
                patient={patient}
                patientId={patient.id}
              />
            )}
            {activeTab === "timeline" && <TimelineTab patientId={patient.id} />}
            {canSeeClinical && activeTab === "patient-report" && <PatientReportTab patientId={patient.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}
