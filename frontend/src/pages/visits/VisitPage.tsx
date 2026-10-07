// src/pages/visits/VisitPage.tsx — UPDATED
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Stethoscope,
  FileText,
  Activity,
  Pill,
  CheckCircle,
  Clock,
  ArrowLeft,
  ClipboardList,
  Loader2,
  CalendarDays,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { UserRole } from "@/types/shared";
import { billingApi } from "@/lib/api/billing";

import { TreatmentPlanTab } from "./components/TreatmentPlanTab";
import { DentalChart } from "./components/DentalChart";
import { PrescriptionTab } from "./components/PrescriptionTab";
import { ExaminationTab } from "./components/ExaminationTab";
import { PatientAppointmentsTab } from "./components/PatientAppointmentsTab";
import { PatientReportTab } from "../patients/components/PatientReportTab";
import { ProgressTab } from "./components/ProgressTab";
import { VisitImagingTab } from "./components/VisitImagingTab";
import { VisitProcedureSessionsTab } from "./components/VisitProcedureSessionsTab";
import { visitsApi } from "@/lib/api";

/** Opening and closing an encounter — front desk included (matches the API). */
const CAN_MANAGE_VISIT = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.DENTIST,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
];

const apiError = (e: any, fallback: string) =>
  e?.response?.data?.message
    ? Array.isArray(e.response.data.message)
      ? e.response.data.message.join(", ")
      : String(e.response.data.message)
    : fallback;

// ─── Complete-visit confirmation ───────────────────────────────────────────────
function CompleteVisitDialog({
  visitId,
  open,
  onClose,
  onConfirm,
  pending,
}: {
  visitId: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { followUpDate?: string; followUpNotes?: string }) => void;
  pending: boolean;
}) {
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  // Draft invoices still on this visit: the front desk should post (or
  // void) them — completing the visit does not do it.
  const { data: drafts } = useQuery({
    queryKey: ["billing-invoices", visitId, "DRAFT"],
    queryFn: () => billingApi.getInvoices({ visitId, status: "DRAFT" }),
    enabled: open,
  });
  const draftCount = (drafts as any)?.data?.length ?? 0;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-5 space-y-3">
        <h3 className="text-base font-semibold text-foreground">Complete this visit?</h3>
        <p className="text-sm text-muted-foreground">
          The clinical record becomes read-only. Later corrections are
          amendments by the treating dentist or an administrator, with a reason.
        </p>
        {draftCount > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-muted/50 px-3 py-2 text-xs text-foreground">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
            <span>
              {draftCount} draft invoice{draftCount === 1 ? "" : "s"} on this visit
              still need{draftCount === 1 ? "s" : ""} to be posted at check-out.
            </span>
          </div>
        )}
        <label className="block text-xs font-medium text-muted-foreground">
          Follow-up date (optional)
          <input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Follow-up notes (optional)
          <textarea
            value={followUpNotes}
            onChange={(e) => setFollowUpNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-border text-sm text-muted-foreground hover:bg-muted"
          >
            Back
          </button>
          <button
            disabled={pending}
            onClick={() =>
              onConfirm({
                followUpDate: followUpDate || undefined,
                followUpNotes: followUpNotes.trim() || undefined,
              })
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-success text-white text-sm font-semibold disabled:opacity-60"
          >
            {pending ? <Spinner size="sm" /> : <CheckCircle className="w-4 h-4" />}
            Complete visit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cancel-visit dialog ───────────────────────────────────────────────────────
function CancelVisitDialog({
  open,
  onClose,
  onConfirm,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-5 space-y-3">
        <h3 className="text-base font-semibold text-foreground">Cancel this visit?</h3>
        <p className="text-sm text-muted-foreground">
          Only a visit with nothing recorded can be cancelled. A visit with
          treatment, diagnoses, prescriptions or invoices is completed instead.
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Reason (required)"
          className="w-full rounded border border-border px-2 py-1 text-sm"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-border text-sm text-muted-foreground hover:bg-muted"
          >
            Back
          </button>
          <button
            disabled={pending || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-danger text-white text-sm font-semibold disabled:opacity-60"
          >
            {pending ? <Spinner size="sm" /> : <XCircle className="w-4 h-4" />}
            Cancel visit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type VisitStatus =
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "ARRIVED";

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
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

function ChartImagingTab({
  patientId,
  visit,
  visitId,
  readOnly = false,
  dentistId
}: {
  patientId: string;
  visit: any;
  visitId?: string;
  readOnly?: boolean;
   dentistId?: string; 
}) {
  return (
    <div
      className="bg-white rounded-xl border border-border px-1 py-0.5"
      style={{ minHeight: 520 }}
    >
      <DentalChart
        patientId={patientId}
        visitId={visitId}
        readOnly={readOnly}
        dentistId={dentistId}
      />
    </div>
  );
}

// ─── Tab definition ───────────────────────────────────────────────────────────
const TABS = [
  { id: "chart", label: "Dental Chart", icon: Activity },
  { id: "treatment", label: "Treatment Plans", icon: ClipboardList },
  { id: "exam", label: "Exam/Notes", icon: Stethoscope },
  { id: "appointments", label: "Appointments", icon: CalendarDays },
  { id: "prescriptions", label: "Prescriptions", icon: Pill },
  { id: "imaging", label: "Imaging", icon: Activity },
  { id: "tx-progress", label: "Progress Report", icon: FileText },
  { id: "sessions", label: "Procedure Sessions", icon: Activity },
  { id: "patient-report", label: "Patient Report", icon: FileText },
];

// ─── Main VisitPage ───────────────────────────────────────────────────────────
export function VisitPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("chart");
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { hasRole } = usePermissions();
  const canManageVisit = hasRole(CAN_MANAGE_VISIT);

  const {
    data: visitData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["visit", id],
    queryFn: () => visitsApi.getOne(id!),
    enabled: !!id,
  });

  const startMutation = useMutation({
    mutationFn: () => visitsApi.startExamination(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visit", id] }),
    onError: (e) => toast.error(apiError(e, "Could not start the examination")),
  });

  const completeMutation = useMutation({
    mutationFn: (data: any) => visitsApi.complete(id!, data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["visit", id] });
      setConfirmComplete(false);
      const open = res?.warnings?.openSessions ?? 0;
      const drafts = res?.warnings?.draftInvoices ?? 0;
      if (open || drafts) {
        toast.warning(
          [
            open ? `${open} session(s) still pending` : null,
            drafts ? `${drafts} draft invoice(s) to post at check-out` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        );
      } else {
        toast.success("Visit completed");
      }
      navigate("/visits");
    },
    onError: (e) => toast.error(apiError(e, "Could not complete the visit")),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => visitsApi.cancel(id!, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visit", id] });
      setConfirmCancel(false);
      toast.success("Visit cancelled");
      navigate("/visits");
    },
    onError: (e) => toast.error(apiError(e, "Could not cancel the visit")),
  });

  if (!id)
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground/70">
        <p className="text-sm">No visit ID provided</p>
      </div>
    );

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <p className="text-sm text-muted-foreground/70">Loading visit…</p>
        </div>
      </div>
    );

  if (error || !visitData)
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-danger text-sm mb-4">Failed to load visit</p>
        <button
          onClick={() => navigate("/visits")}
          className="flex items-center gap-2 px-4 py-2 rounded border border-border text-sm text-muted-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Visits
        </button>
      </div>
    );

  const visit = visitData.visit || visitData;
  const status: VisitStatus = visit.status;
  const isArrived = status === "ARRIVED";
  const isInProgress = status === "IN_PROGRESS";
  const isCompleted = status === "COMPLETED";
  // Clinical writes are allowed only while the visit is open (the API
  // enforces the same rule); a completed or cancelled visit is read-only.
  const readOnly = !(isArrived || isInProgress);
  const patientId = visit.patient?.id || visit.patientId;
  const dentistId = visit.dentist?.id || visit.dentistId;

  const STATUS_PILL: Record<VisitStatus, string> = {
    CHECKED_IN: "bg-warning-muted text-warning",
    IN_PROGRESS: "bg-primary-muted text-primary",
    COMPLETED: "bg-success-muted text-success",
    CANCELLED: "bg-danger-muted text-danger",
    ARRIVED: "bg-warning-muted text-warning",
  };

  return (
    <div className="min-h-screen bg-muted/50">
      <div className="max-w-screen-2xl mx-auto px-0.5 py-0.5 space-y-1">
        {/* ── Visit Header Card ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          {/* White text only on this bar: the brand teal (text-primary) has
              almost no contrast against the blue background. */}
          <div className="px-5 py-2.5 bg-[#0369a1] text-white flex flex-wrap xl:flex-nowrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              {/* Left Side: Patient Identity */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 bg-white/20 ring-1 ring-white/30 rounded-full flex items-center justify-center text-sm font-bold uppercase">
                  {visit.patient?.firstName?.[0]}
                  {visit.patient?.lastName?.[0]}
                </div>
                <div>
                  <p className="font-semibold text-base leading-tight text-white">
                    {visit.patient?.firstName} {visit.patient?.lastName}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-white/85">
                    {visit.patient?.patientCode}
                  </p>
                </div>
              </div>

              {/* Right Side: Condensed Visit Metadata */}
              <dl className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {[
                  { label: "Visit Code", value: visit.visitCode },
                  {
                    label: "Dentist",
                    value: `Dr. ${visit.dentist?.firstName} ${visit.dentist?.lastName}`,
                  },
                  {
                    label: "Appointment",
                    value: visit.appointment?.type || "—",
                  },
                  {
                    label: "DOB",
                    value: visit.patient?.dateOfBirth
                      ? new Date(visit.patient.dateOfBirth).toLocaleDateString()
                      : "—",
                  },
                  {
                    label: "Gender",
                    value: visit.patient?.gender
                      ? visit.patient.gender.charAt(0) + visit.patient.gender.slice(1).toLowerCase()
                      : "—",
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col border-l border-white/25 pl-5 first:border-0 first:pl-0"
                  >
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-white/80 whitespace-nowrap">
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-white whitespace-nowrap">
                      {value}
                    </dd>
                  </div>
                ))}

                {/* Optional: Inline Allergies Alert */}
                {/* {visit.patient?.allergies?.length > 0 && (
      <div className="flex items-center gap-1.5 bg-danger/20 border border-danger/30 rounded px-2.5 py-1 text-xs text-danger/50 ml-2">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Allergies: {visit.patient.allergies.join(", ")}</span>
      </div>
    )} */}
              </dl>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Time over status — same two-line rhythm as the metadata. */}
              <div className="flex flex-col items-end border-r border-white/25 pr-4 mr-1">
                <span
                  className="flex items-center gap-1 text-sm font-semibold text-white tabular-nums whitespace-nowrap"
                  title="Checked in"
                >
                  <Clock className="w-3.5 h-3.5 text-white/80" />
                  {visit.checkedInAt
                    ? new Date(visit.checkedInAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </span>
                <span
                  className={cn(
                    "mt-0.5 px-2 py-px rounded-full text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap",
                    STATUS_PILL[status],
                  )}
                >
                  {status.replace("_", " ")}
                </span>
              </div>
              {isArrived && (
                <HeaderAction
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                  className="bg-white text-[#1e3a5f] hover:bg-primary-muted/60"
                  icon={
                    startMutation.isPending ? (
                      <Spinner size="sm" />
                    ) : (
                      <Stethoscope className="w-4 h-4" />
                    )
                  }
                  top="Start"
                  bottom="Exam"
                />
              )}
              {(isArrived || isInProgress) && canManageVisit && (
                <HeaderAction
                  onClick={() => setConfirmCancel(true)}
                  disabled={cancelMutation.isPending}
                  className="bg-white/10 border border-white/40 text-white hover:bg-white/20"
                  icon={<XCircle className="w-4 h-4" />}
                  top="Cancel"
                  bottom="Visit"
                />
              )}
              {isInProgress && (
                <HeaderAction
                  onClick={() => setConfirmComplete(true)}
                  disabled={completeMutation.isPending}
                  className="bg-success text-white hover:brightness-110"
                  icon={
                    completeMutation.isPending ? (
                      <Spinner size="sm" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )
                  }
                  top="Complete"
                  bottom="Visit"
                />
              )}
            </div>
          </div>

        </div>

        <CompleteVisitDialog
          visitId={id}
          open={confirmComplete}
          onClose={() => setConfirmComplete(false)}
          onConfirm={(data) => completeMutation.mutate(data)}
          pending={completeMutation.isPending}
        />
        <CancelVisitDialog
          open={confirmCancel}
          onClose={() => setConfirmCancel(false)}
          onConfirm={(reason) => cancelMutation.mutate(reason)}
          pending={cancelMutation.isPending}
        />

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="flex border-b border-border bg-muted/50 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1 text-base font-medium whitespace-nowrap border-b-2 transition-colors",
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

          {activeTab === "chart" && (
            <ChartImagingTab
              patientId={patientId}
              visit={visitData}
              visitId={id}
              readOnly={readOnly}
              dentistId={dentistId}
            />
          )}
          <div className="px-1 py-0.5">
            {activeTab === "exam" && (
              <ExaminationTab
                visitId={id}
                visit={visit}
                readOnly={readOnly}
              />
            )}
            {activeTab === "treatment" && (
              <TreatmentPlanTab
                patientId={patientId}
                visitId={id}
                dentistId={dentistId}
                readOnly={readOnly}
              />
            )}
            {activeTab === "imaging" && (
              <VisitImagingTab
                patientId={patientId}
                visitId={id}
                dentistId={dentistId}
                readOnly={readOnly}
              />
            )}
            {activeTab === "prescriptions" && (
              <PrescriptionTab
                visitId={id}
                visit={visitData}
                readOnly={readOnly}
              />
            )}
            {activeTab === "appointments" && (
              <PatientAppointmentsTab
                patientId={patientId}
                visitId={id}
                currentDentistId={dentistId}
                patientName={
                  visit.patient
                    ? `${visit.patient.firstName} ${visit.patient.lastName}`
                    : undefined
                }
              />
            )}
            {activeTab === "tx-progress" && (
              <ProgressTab visitId={id} patientId={patientId} readOnly={readOnly} />
            )}
            {activeTab === "sessions" && (
              <VisitProcedureSessionsTab visitId={id} />
            )}
            {activeTab === "patient-report" && (
              <PatientReportTab patientId={patientId} visit={visit} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact header button: icon beside a two-line label, so the header row
 *  keeps the same label-over-value rhythm as the visit metadata. */
function HeaderAction({
  onClick,
  disabled,
  className,
  icon,
  top,
  bottom,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  icon: React.ReactNode;
  top: string;
  bottom: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1 text-left transition-colors disabled:opacity-60",
        className,
      )}
    >
      {icon}
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">
          {top}
        </span>
        <span className="text-xs font-semibold">{bottom}</span>
      </span>
    </button>
  );
}
