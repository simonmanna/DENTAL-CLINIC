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
} from "lucide-react";

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
        "animate-spin text-blue-600",
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
      className="bg-white rounded-xl border border-slate-200 px-1 py-0.5"
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
  });

  const completeMutation = useMutation({
    mutationFn: (data: any) => visitsApi.complete(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visit", id] });
      navigate("/visits");
    },
  });

  if (!id)
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400">
        <p className="text-sm">No visit ID provided</p>
      </div>
    );

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <p className="text-sm text-slate-400">Loading visit…</p>
        </div>
      </div>
    );

  if (error || !visitData)
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-red-500 text-sm mb-4">Failed to load visit</p>
        <button
          onClick={() => navigate("/visits")}
          className="flex items-center gap-2 px-4 py-2 rounded border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
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
  const patientId = visit.patient?.id || visit.patientId;
  const dentistId = visit.dentist?.id || visit.dentistId;

  const STATUS_PILL: Record<VisitStatus, string> = {
    CHECKED_IN: "bg-amber-100 text-amber-700",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
    CANCELLED: "bg-red-100 text-red-600",
    ARRIVED: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-screen-2xl mx-auto px-0.5 py-0.5 space-y-1">
        {/* ── Visit Header Card ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-1 bg-[#0369a1] text-white flex items-center justify-between">
            <div className="flex flex-wrap items-center justify-between gap-4 px-1 py-1 text-white border-b border-slate-800">
              {/* Left Side: Patient Identity */}
              <div className="flex items-center gap-3 shrink-0">
                <div className=" w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold">
                  {visit.patient?.firstName?.[0]}
                  {visit.patient?.lastName?.[0]}
                </div>
                <div>
                  <p className="font-semibold text-base text-white">
                    {visit.patient?.firstName} {visit.patient?.lastName}
                  </p>
                  <p className="text-blue-200 text-xs">
                    {visit.patient?.patientCode}
                  </p>
                </div>
              </div>

              {/* Right Side: Condensed Visit Metadata */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-base ml-7">
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
                  { label: "Gender", value: visit.patient?.gender || "—" },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col border-l border-white/10 pl-4 first:border-0 first:pl-0"
                  >
                    <span className="text-[14px] text-blue-200/95 uppercase tracking-wide">
                      {label}
                    </span>
                    <span className="font-medium text-white text-xs mt-0.5">
                      {value}
                    </span>
                  </div>
                ))}

                {/* Optional: Inline Allergies Alert */}
                {/* {visit.patient?.allergies?.length > 0 && (
      <div className="flex items-center gap-1.5 bg-red-500/20 border border-red-500/30 rounded px-2.5 py-1 text-xs text-red-200 ml-2">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Allergies: {visit.patient.allergies.join(", ")}</span>
      </div>
    )} */}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xs text-blue-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {visit.checkedInAt
                  ? new Date(visit.checkedInAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </div>
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-medium",
                  STATUS_PILL[status],
                )}
              >
                {status.replace("_", " ")}
              </span>
              {isArrived && (
                <button
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#1e3a5f] rounded text-xs font-semibold hover:bg-blue-50 transition-colors disabled:opacity-60"
                >
                  {startMutation.isPending ? (
                    <Spinner size="sm" />
                  ) : (
                    <Stethoscope className="w-3.5 h-3.5" />
                  )}
                  Start Examination
                </button>
              )}
              {isInProgress && (
                <button
                  onClick={() => completeMutation.mutate({})}
                  disabled={completeMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded text-xs font-semibold hover:bg-green-600 transition-colors disabled:opacity-60"
                >
                  {completeMutation.isPending ? (
                    <Spinner size="sm" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Complete Visit
                </button>
              )}
            </div>
          </div>

        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
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
                    "flex items-center gap-1 px-3 py-1 text-base font-medium whitespace-nowrap border-b-2 transition-colors",
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

          {activeTab === "chart" && (
            <ChartImagingTab
              patientId={patientId}
              visit={visitData}
              visitId={id}
              readOnly={isCompleted}
              dentistId={dentistId}
            />
          )}
          <div className="px-1 py-0.5">
            {activeTab === "exam" && (
              <ExaminationTab
                visitId={id}
                visit={visit}
                readOnly={isCompleted}
              />
            )}
            {activeTab === "treatment" && (
              <TreatmentPlanTab
                patientId={patientId}
                visitId={id}
                dentistId={dentistId}
                readOnly={isCompleted}
              />
            )}
            {activeTab === "imaging" && (
              <VisitImagingTab
                patientId={patientId}
                visitId={id}
                dentistId={dentistId}
              />
            )}
            {activeTab === "prescriptions" && (
              <PrescriptionTab
                visitId={id}
                visit={visitData}
                readOnly={isCompleted}
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
              <ProgressTab visitId={id} patientId={patientId} />
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
