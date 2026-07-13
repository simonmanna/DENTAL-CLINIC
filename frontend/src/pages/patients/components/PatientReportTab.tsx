import { useQuery } from "@tanstack/react-query";
import { patientsApi } from "../../../lib/api/patients";
import { treatmentPlansApi } from "../../../lib/api/treatment-plans";
import { conditionsApi } from "../../../lib/api/conditions";
import { chartEntriesApi } from "../../../lib/api/chart-entries";
import { treatmentProceduresApi } from "../../../lib/api/treatment-procedures";
import { prescriptionsApi, imagingApi } from "../../../lib/api";
import { formatDate, getAge, cn } from "../../../lib/utils";
import { Loader2, Printer, Activity, Clock, Syringe, CheckCircle, XCircle, Pill } from "lucide-react";

interface Props {
  patientId: string;
  visit?: any;
}

const statusColors: Record<string, string> = {
  PLANNED: "bg-blue-100 text-blue-700 border-blue-200",
  IN_PROGRESS: "bg-amber-100 text-amber-700 border-amber-200",
  COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ACTIVE: "bg-blue-100 text-blue-700 border-blue-200",
  RESOLVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-gray-100 text-gray-600 border-gray-200",
  VOIDED: "bg-gray-100 text-gray-600 border-gray-200",
  SCHEDULED: "bg-blue-100 text-blue-700 border-blue-200",
  MONITORED: "bg-purple-100 text-purple-700 border-purple-200",
  IN_TREATMENT: "bg-amber-100 text-amber-700 border-amber-200",
  RULED_OUT: "bg-gray-100 text-gray-600 border-gray-200",
  ON_HOLD: "bg-orange-100 text-orange-700 border-orange-200",
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  SKIPPED: "bg-gray-100 text-gray-600 border-gray-200",
};

function Badge({ status, label }: { status: string; label?: string }) {
  const key = status?.toUpperCase().replace(/\s+/g, "_");
  const colorClass = statusColors[key as keyof typeof statusColors] || "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border", colorClass)}>
      {label || status?.replace(/_/g, " ")}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="print-section mb-8">
      <h2 className="text-base font-bold text-gray-800 border-l-4 border-blue-500 pl-3 mb-4 print:text-black">
        {title}
      </h2>
      {children}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-1 border-b border-gray-50 last:border-0">
      <span className="text-xs font-medium text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value || "—"}</span>
    </div>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">{children}</div>;
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-1">
      <span className="text-[11px] font-medium text-gray-500 block">{label}</span>
      <span className="text-sm text-gray-800 font-medium">{value || "—"}</span>
    </div>
  );
}

function EmptyRow({ message }: { message?: string }) {
  return <p className="text-sm text-gray-400 italic py-2">{message || "No data recorded"}</p>;
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            {headers.map((h, i) => (
              <th key={i} className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider py-2 px-2 first:pl-0 last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("py-2 px-2 text-sm text-gray-700 first:pl-0 last:pr-0", className)}>{children}</td>;
}

function toArray(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as any).data)) return (data as any).data;
  return [];
}

export function PatientReportTab({ patientId, visit }: Props) {
  const { data: patient, isLoading: load1 } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => patientsApi.getOne(patientId),
    enabled: !!patientId,
  });

  const { data: rawVisits, isLoading: load2 } = useQuery({
    queryKey: ["patient-visits-report", patientId],
    queryFn: () => treatmentPlansApi.getPatientVisits(patientId),
    enabled: !!patientId,
  });
  const visits = toArray(rawVisits);

  const { data: rawPlans, isLoading: load3 } = useQuery({
    queryKey: ["patient-plans-report", patientId],
    queryFn: () => treatmentPlansApi.getPatientPlans(patientId),
    enabled: !!patientId,
  });
  const plans = toArray(rawPlans);

  const { data: rawSessions, isLoading: load4 } = useQuery({
    queryKey: ["patient-sessions-report", patientId],
    queryFn: () => treatmentPlansApi.getPatientExecutedSessions(patientId),
    enabled: !!patientId,
  });
  const sessions = toArray(rawSessions);

  const { data: rawConditions, isLoading: load5 } = useQuery({
    queryKey: ["patient-conditions-report", patientId],
    queryFn: () => conditionsApi.getPatientConditions(patientId),
    enabled: !!patientId,
  });
  const patientConditions = toArray(rawConditions);

  const { data: rawChartEntries, isLoading: load6 } = useQuery({
    queryKey: ["patient-chart-entries-report", patientId],
    queryFn: () => chartEntriesApi.getPatientEntries(patientId),
    enabled: !!patientId,
  });
  const chartEntries = toArray(rawChartEntries);

  const { data: rawProcedures, isLoading: load7 } = useQuery({
    queryKey: ["patient-procedures-report", patientId],
    queryFn: () => treatmentProceduresApi.getPatientProcedures(patientId),
    enabled: !!patientId,
  });
  const allProcedures = toArray(rawProcedures);

  const { data: rawPrescriptions, isLoading: load8 } = useQuery({
    queryKey: ["patient-prescriptions-report", patientId],
    queryFn: () => prescriptionsApi.getByPatient(patientId),
    enabled: !!patientId,
  });
  const prescriptions = toArray(rawPrescriptions);

  const { data: rawImages, isLoading: load9 } = useQuery({
    queryKey: ["patient-images-report", patientId],
    queryFn: () => imagingApi.getAll({ patientId, limit: 200 }),
    enabled: !!patientId,
  });
  const images = toArray(rawImages);

  const loading = load1 || load2 || load3 || load4 || load5 || load6 || load7 || load8 || load9;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-gray-500">Loading patient report...</span>
      </div>
    );
  }

  if (!patient) {
    return <p className="text-sm text-gray-400 py-10 text-center">Patient not found.</p>;
  }

  const age = patient.dateOfBirth ? getAge(patient.dateOfBirth) : null;

  const sortedVisits = [...visits].sort(
    (a: any, b: any) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()
  );

  const conditionIds = new Set(patientConditions.map((c: any) => c.id));

  const conditionChartEntries = chartEntries.filter(
    (e: any) => e.type === "CONDITION" && !conditionIds.has(e.patientConditionId)
  );

  const mergedConditions = [
    ...patientConditions,
    ...conditionChartEntries.map((e: any) => ({
      id: e.id,
      condition: e.condition || e.patientCondition?.condition || { name: e.label },
      conditionId: e.conditionId || e.patientCondition?.conditionId,
      toothNumber: e.toothNumber,
      surfaces: e.surfaces || [],
      severity: e.severity || e.patientCondition?.severity,
      status: e.status === "ACTIVE" ? "ACTIVE" : e.conditionStatus || e.patientCondition?.status || e.status,
      conditionStatus: e.conditionStatus || e.patientCondition?.status || null,
      diagnosedAt: e.diagnosedAt || e.createdAt,
      diagnosedBy: e.diagnosedBy || (e.provider && typeof e.provider === "object" ? `${e.provider.firstName} ${e.provider.lastName}` : e.providerId),
      notes: e.notes,
      resolvedAt: e.status === "RESOLVED" ? e.updatedAt : undefined,
      patientConditionId: e.patientConditionId,
    })),
  ];

  const sortedSessions = [...sessions].sort(
    (a: any, b: any) => new Date(b.performedDate || b.createdAt).getTime() - new Date(a.performedDate || a.createdAt).getTime()
  );

  const executedProcedures = allProcedures.filter(
    (p: any) => p.status === "COMPLETED" || p.status === "IN_PROGRESS"
  );

  const proceduresByPlanId: Record<string, any[]> = {};
  allProcedures.forEach((p: any) => {
    const pid = p.treatmentPlanId;
    if (!proceduresByPlanId[pid]) proceduresByPlanId[pid] = [];
    proceduresByPlanId[pid].push(p);
  });

  const timelineEvents: { date: string; label: string; desc: string }[] = [];

  if (patient.createdAt) {
    timelineEvents.push({ date: patient.createdAt, label: "Registration", desc: "Patient registered in the system" });
  }

  sortedVisits.forEach((v: any) => {
    timelineEvents.push({
      date: v.createdAt || v.date,
      label: "Visit",
      desc: `${v.visitCode || v.reason || "Visit"} — ${v.status}`,
    });
  });

  plans.forEach((p: any) => {
    timelineEvents.push({ date: p.createdAt, label: "Treatment Plan", desc: `${p.title} (${p.status})` });
  });

  allProcedures.forEach((pr: any) => {
    if (pr.completedAt) {
      timelineEvents.push({
        date: pr.completedAt,
        label: "Procedure Completed",
        desc: pr.procedure?.name || "Procedure",
      });
    }
  });

  sortedSessions.forEach((s: any) => {
    const date = s.performedDate || s.createdAt;
    if (date) {
      timelineEvents.push({
        date,
        label: "Session",
        desc: `Session ${s.sessionNumber || ""} — ${s.outcome || s.status || ""}`,
      });
    }
  });

  timelineEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const sortedPrescriptions = [...prescriptions].sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const hasPrescriptions = prescriptions.length > 0;

  const hasMedicalData =
    (patient.allergies && patient.allergies.length > 0) ||
    (patient.medicalConditions && patient.medicalConditions.length > 0) ||
    (patient.currentMedications && patient.currentMedications.length > 0) ||
    patient.bloodGroup;

  const activeConditionCount = mergedConditions.filter(
    (c: any) => c.status === "ACTIVE" || c.status === "IN_TREATMENT" || c.status === "MONITORED"
  ).length;
  const hasVisits = visits.length > 0;
  const hasPlans = plans.length > 0;
  const hasSessions = sessions.length > 0;
  const hasTimeline = timelineEvents.length > 0;

  const totalCompletedPlans = plans.filter((p: any) => p.status === "COMPLETED").length;
  const totalCompletedSessions = sessions.filter((s: any) => s.status === "COMPLETED").length;

  const firstVisitDate = sortedVisits.length > 0 ? sortedVisits[sortedVisits.length - 1] : null;
  const latestVisitDate = sortedVisits.length > 0 ? sortedVisits[0] : null;

  const chiefComplaint = visit?.chiefComplaint;
  const historyOfPresentIllness = visit?.historyOfPresentIllness;
  const hasSOAP = !!(visit?.subjective || visit?.objective || visit?.assessment || visit?.plan);
  const hasFindingsRecs = !!(visit?.findings || visit?.recommendations);

  const VITE_API = (import.meta as any).env?.VITE_API_URL ?? "";
  const resolveUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${VITE_API}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const triggerPrint = () => {
    window.print();
  };

  return (
    <div className="patient-report">
      <style>{`
        .print-only { display: none !important; }

        @media print {
          @page { margin: 1.5cm; }

          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          html, body { background: white !important; font-size: 12px !important; }

          /* Hide everything except the report */
          body * { visibility: hidden !important; }
          .patient-report, .patient-report * { visibility: visible !important; }
          .patient-report { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; padding: 0 !important; }

          .no-print { display: none !important; }
          .print-only { display: block !important; visibility: visible !important; }

          .print-section { page-break-inside: avoid; break-inside: avoid; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; break-inside: avoid; }
          thead { display: table-header-group; }
          h2 { font-size: 13px !important; }
          .text-sm { font-size: 11px !important; }
          .text-xs { font-size: 10px !important; }
          .text-gray-400 { color: #666 !important; }
          .text-gray-500 { color: #666 !important; }
          .text-gray-700 { color: #222 !important; }
          .text-gray-800 { color: #000 !important; }
          .bg-gray-50 { background: #f5f5f5 !important; }
          .border-gray-200 { border-color: #ccc !important; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-6 no-print">
        <h1 className="text-xl font-bold text-gray-800">Patient Report</h1>
        <button
          onClick={triggerPrint}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print Report
        </button>
      </div>

      {/* Print-only header */}
      <div className="print-only mb-6 border-b-2 border-blue-600 pb-3">
        <h1 className="text-2xl font-bold text-gray-900">Patient Report</h1>
        <p className="text-xs text-gray-500 mt-1">{patient.firstName} {patient.lastName} · {patient.patientCode || ""} · Generated {new Date().toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" })}</p>
      </div>

      {/* 1. Patient Summary */}
      <Section title="Patient Summary">
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-lg font-bold text-gray-800">{patient.firstName} {patient.lastName}</h3>
              <p className="text-sm text-gray-500">{patient.patientCode || ""}</p>
            </div>
            <div className="text-right text-xs text-gray-400">
              Report generated: {new Date().toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>
          <InfoGrid>
            <InfoItem label="Date of Birth" value={patient.dateOfBirth ? `${formatDate(patient.dateOfBirth)} (${age} yrs)` : "—"} />
            <InfoItem label="Gender" value={patient.gender || "—"} />
            <InfoItem label="Blood Group" value={patient.bloodGroup || "—"} />
            <InfoItem label="Phone" value={patient.phone || "—"} />
            <InfoItem label="Email" value={patient.email || "—"} />
            <InfoItem label="Address" value={patient.address || "—"} />
            <InfoItem label="First Visit" value={firstVisitDate ? formatDate(firstVisitDate.createdAt || firstVisitDate.date) : "—"} />
            <InfoItem label="Latest Visit" value={latestVisitDate ? formatDate(latestVisitDate.createdAt || latestVisitDate.date) : "—"} />
            <InfoItem label="Total Visits" value={visits.length} />
          </InfoGrid>
        </div>
      </Section>

      {/* 2a. Chief Complaint & Present Illness (only when visit data is available) */}
      {visit && (
        <Section title="Chief Complaint & Present Illness">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
            <div>
              <span className="text-xs font-semibold text-gray-500 block mb-1">Chief Complaint (CC)</span>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{chiefComplaint || "None recorded"}</p>
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-500 block mb-1">History of Present Illness (HPI)</span>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{historyOfPresentIllness || "None recorded"}</p>
            </div>
          </div>
        </Section>
      )}

      {/* 2b. Patient Medical History (always visible) */}
      <Section title="Patient Medical History">
        {hasMedicalData ? (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
            {patient.allergies && patient.allergies.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-gray-500 block mb-1">Allergies</span>
                <div className="flex flex-wrap gap-1.5">
                  {patient.allergies.map((a, i) => (
                    <span key={i} className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-xs font-medium">{a}</span>
                  ))}
                </div>
              </div>
            )}
            {patient.medicalConditions && patient.medicalConditions.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-gray-500 block mb-1">Medical Conditions</span>
                <div className="flex flex-wrap gap-1.5">
                  {patient.medicalConditions.map((m, i) => (
                    <span key={i} className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-xs font-medium">{m}</span>
                  ))}
                </div>
              </div>
            )}
            {patient.currentMedications && patient.currentMedications.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-gray-500 block mb-1">Current Medications</span>
                <div className="flex flex-wrap gap-1.5">
                  {patient.currentMedications.map((m, i) => (
                    <span key={i} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-xs font-medium">{m}</span>
                  ))}
                </div>
              </div>
            )}
            {patient.bloodGroup && (
              <DataRow label="Blood Group" value={patient.bloodGroup} />
            )}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-sm text-gray-400">No medical history recorded.</span>
          </div>
        )}
      </Section>

      {/* 2c. SOAP Clinical Notes (conditional) */}
      {visit && hasSOAP && (
        <Section title="Clinical Notes (SOAP)">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
            {visit.subjective && (
              <div>
                <span className="text-xs font-semibold text-gray-500 block mb-1">Subjective (S)</span>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{visit.subjective}</p>
              </div>
            )}
            {visit.objective && (
              <div>
                <span className="text-xs font-semibold text-gray-500 block mb-1">Objective (O)</span>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{visit.objective}</p>
              </div>
            )}
            {visit.assessment && (
              <div>
                <span className="text-xs font-semibold text-gray-500 block mb-1">Assessment (A)</span>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{visit.assessment}</p>
              </div>
            )}
            {visit.plan && (
              <div>
                <span className="text-xs font-semibold text-gray-500 block mb-1">Plan (P)</span>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{visit.plan}</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 2c. Findings & Recommendations (conditional) */}
      {visit && hasFindingsRecs && (
        <Section title="Findings & Recommendations">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
            {visit.findings && (
              <div>
                <span className="text-xs font-semibold text-gray-500 block mb-1">Clinical Findings</span>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{visit.findings}</p>
              </div>
            )}
            {visit.recommendations && (
              <div>
                <span className="text-xs font-semibold text-gray-500 block mb-1">Recommendations</span>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{visit.recommendations}</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 3. Diagnoses & Conditions — card layout matching PatientConditionsTab */}
      <Section title="Diagnoses & Conditions">
        {mergedConditions.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
            <Activity className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No conditions or diagnoses recorded.</p>
          </div>
        ) : (
          (() => {
            const statusCfg: Record<string, { label: string; icon: any; color: string; bg: string }> = {
              ACTIVE: { label: "Active", icon: Activity, color: "text-blue-700", bg: "bg-blue-50" },
              MONITORED: { label: "Monitored", icon: Clock, color: "text-purple-700", bg: "bg-purple-50" },
              IN_TREATMENT: { label: "In Treatment", icon: Syringe, color: "text-amber-700", bg: "bg-amber-50" },
              RESOLVED: { label: "Resolved", icon: CheckCircle, color: "text-emerald-700", bg: "bg-emerald-50" },
              RULED_OUT: { label: "Ruled Out", icon: XCircle, color: "text-gray-600", bg: "bg-gray-50" },
            };
            const groupOrder = ["ACTIVE", "IN_TREATMENT", "MONITORED", "RESOLVED", "RULED_OUT"];

            const grouped: Record<string, any[]> = {};
            mergedConditions.forEach((c: any) => {
              const key = c.status || "ACTIVE";
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(c);
            });

            return (
              <div className="space-y-4">
                {groupOrder.map((gk) => {
                  const items = grouped[gk];
                  if (!items?.length) return null;
                  const cfg = statusCfg[gk] || statusCfg.ACTIVE;
                  const Icon = cfg.icon;
                  return (
                    <div key={gk}>
                      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg mb-2", cfg.bg, "border", cfg.color.replace("text-", "border-").replace("700", "200"))}>
                        <Icon className={cn("w-4 h-4", cfg.color)} />
                        <span className={cn("text-sm font-semibold", cfg.color)}>{cfg.label}</span>
                        <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-white/70 text-gray-700">{items.length}</span>
                      </div>
                      <div className="space-y-2">
                        {items.map((c: any) => (
                          <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <h4 className="text-sm font-semibold text-gray-800">{c.condition?.name || "—"}</h4>
                                {c.toothNumber && (
                                  <p className="text-xs text-gray-500 mt-0.5">Tooth #{c.toothNumber}{c.surfaces?.length > 0 ? ` (${c.surfaces.join(", ")})` : ""}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-3">
                                {c.severity && (
                                  <span className={cn(
                                    "text-[11px] font-medium px-2 py-0.5 rounded",
                                    String(c.severity).toUpperCase() === "SEVERE" ? "bg-red-50 text-red-700" :
                                    String(c.severity).toUpperCase() === "MODERATE" ? "bg-amber-50 text-amber-700" :
                                    "bg-green-50 text-green-700"
                                  )}>
                                    {c.severity}
                                  </span>
                                )}
                                {c.conditionStatus && c.conditionStatus !== c.status && (
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                                    {String(c.conditionStatus).replace(/_/g, " ")}
                                  </span>
                                )}
                                <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", cfg.bg, cfg.color)}>
                                  {cfg.label}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                              <span>Diagnosed: {formatDate(c.diagnosedAt)}</span>
                              {c.diagnosedBy && <span>By: {typeof c.diagnosedBy === "object" ? `${c.diagnosedBy.firstName} ${c.diagnosedBy.lastName}` : c.diagnosedBy}</span>}
                              {c.resolvedAt && <span>Resolved: {formatDate(c.resolvedAt)}</span>}
                            </div>
                            {c.notes && (
                              <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">{c.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </Section>

      {/* 4. Visits History */}
      {hasVisits && (
        <Section title="Visit History">
          <Table headers={["#", "Date", "Visit Code", "Type", "Dentist", "Status"]}>
            {sortedVisits.slice(0, 50).map((v: any, i: number) => (
              <tr key={v.id}>
                <Cell className="text-gray-400 text-xs">{sortedVisits.length - i}</Cell>
                <Cell>{formatDate(v.createdAt || v.date)}</Cell>
                <Cell className="text-xs font-mono text-gray-500">{v.visitCode || v.id.slice(0, 8)}</Cell>
                <Cell>{v.appointment?.type || v.reason || "—"}</Cell>
                <Cell className="text-xs">{v.dentist ? `${v.dentist.firstName} ${v.dentist.lastName}` : "—"}</Cell>
                <Cell><Badge status={v.status} /></Cell>
              </tr>
            ))}
          </Table>
          {sortedVisits.length > 50 && (
            <p className="text-xs text-gray-400 mt-2">Showing last 50 of {sortedVisits.length} visits.</p>
          )}
        </Section>
      )}

      {/* 5. Treatment Plans (with full procedures from treatmentProceduresApi) */}
      {hasPlans && (
        <Section title="Treatment Plans">
          {plans.map((plan: any) => {
            const planProcs = proceduresByPlanId[plan.id] || [];
            return (
              <div key={plan.id} className="mb-4 last:mb-0 border border-gray-200 rounded-lg p-4 bg-white">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-gray-800">{plan.title}</h4>
                    <p className="text-xs text-gray-500">{plan.planCode} · Created {formatDate(plan.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={plan.status} />
                    {plan.priority && <Badge status={plan.priority} />}
                  </div>
                </div>
                {plan.diagnosis && (
                  <p className="text-xs text-gray-600 mb-2"><span className="font-medium">Diagnosis:</span> {plan.diagnosis}</p>
                )}
                {plan.summary && (
                  <div className="flex gap-4 mb-3 text-xs text-gray-500">
                    <span>{plan.summary.totalProcedures || 0} procedures</span>
                    <span>{plan.summary.completedCount || 0} completed</span>
                    {typeof plan.summary.completionPercent === "number" && (
                      <span>{plan.summary.completionPercent}% complete</span>
                    )}
                  </div>
                )}
                {planProcs.length > 0 ? (
                  <Table headers={["#", "Procedure", "Code", "Teeth", "Status", "Price"]}>
                    {planProcs.map((pr: any) => (
                      <tr key={pr.id}>
                        <Cell className="text-gray-400 text-xs">{pr.sequence || "—"}</Cell>
                        <Cell className="font-medium">{pr.procedure?.name || "—"}</Cell>
                        <Cell className="text-xs text-gray-500">{pr.procedure?.code || "—"}</Cell>
                        <Cell>{pr.targets?.map((t: any) => `#${t.toothNumber}`).join(", ") || pr.toothNumbers?.join(", ") || "—"}</Cell>
                        <Cell><Badge status={pr.status} /></Cell>
                        <Cell className="text-xs">{pr.totalPrice != null ? pr.totalPrice.toLocaleString() : "—"}</Cell>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <EmptyRow message="No procedures in this plan" />
                )}
              </div>
            );
          })}
        </Section>
      )}

      {/* 6. Prescriptions */}
      <Section title="Prescriptions">
        {hasPrescriptions ? (
          <div className="space-y-3">
            {sortedPrescriptions.map((rx: any) => (
              <div key={rx.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Pill className="w-4 h-4 text-blue-500" />
                      <h4 className="text-sm font-semibold text-gray-800">{rx.prescriptionCode}</h4>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{formatDate(rx.createdAt)} — Dr. {rx.dentist?.firstName} {rx.dentist?.lastName}</p>
                  </div>
                  <Badge status={rx.status} />
                </div>
                {rx.notes && (
                  <p className="text-xs text-gray-600 mb-2 bg-gray-50 rounded px-2 py-1">{rx.notes}</p>
                )}
                {rx.items?.length > 0 && (
                  <Table headers={["Drug", "Dosage", "Frequency", "Duration", "Route", "Qty", "Instructions"]}>
                    {rx.items.map((item: any) => (
                      <tr key={item.id}>
                        <Cell className="font-medium">{item.drug?.name || "—"}</Cell>
                        <Cell>{item.dosage || "—"}</Cell>
                        <Cell>{item.frequency || "—"}</Cell>
                        <Cell>{item.duration || "—"}</Cell>
                        <Cell className="text-xs">{item.route || "—"}</Cell>
                        <Cell className="text-xs">{item.quantity ?? "—"}</Cell>
                        <Cell className="text-gray-500 max-w-[160px] truncate">{item.instructions || "—"}</Cell>
                      </tr>
                    ))}
                  </Table>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
            <Pill className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No prescriptions recorded.</p>
          </div>
        )}
      </Section>

      {/* 7. Completed Procedures & Sessions */}
      {hasSessions && (
        <Section title="Completed Procedures & Sessions">
          <Table headers={["Date", "Procedure", "Tooth", "Surfaces", "Session", "Outcome"]}>
            {sortedSessions.slice(0, 100).map((s: any) => (
              <tr key={s.id}>
                <Cell>{s.performedDate ? formatDate(s.performedDate) : formatDate(s.createdAt)}</Cell>
                <Cell className="font-medium">{s.treatmentProcedure?.procedure?.name || s.procedure?.name || s.sessionLabel || `Session ${s.sessionNumber || ""}`}</Cell>
                <Cell>{s.targets?.map((t: any) => `#${t.toothNumber}`).join(", ") || "—"}</Cell>
                <Cell>{s.surfaces?.join(", ") || s.targets?.flatMap((t: any) => t.surfaces || []).join(", ") || "—"}</Cell>
                <Cell className="text-xs text-gray-500">{s.sessionNumber ? `Session ${s.sessionNumber}` : "—"}</Cell>
                <Cell>{s.outcome || <Badge status={s.status} />}</Cell>
              </tr>
            ))}
          </Table>
          {sortedSessions.length > 100 && (
            <p className="text-xs text-gray-400 mt-2">Showing last 100 of {sortedSessions.length} sessions.</p>
          )}
        </Section>
      )}

      {/* 8. Clinical Timeline */}
      {hasTimeline && (
        <Section title="Clinical Timeline">
          <div className="relative pl-6 border-l-2 border-blue-200 space-y-4">
            {timelineEvents.slice(0, 30).map((evt, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                <p className="text-xs text-gray-500">{formatDate(evt.date)}</p>
                <p className="text-sm font-medium text-gray-800">{evt.label}</p>
                <p className="text-xs text-gray-500">{evt.desc}</p>
              </div>
            ))}
          </div>
          {timelineEvents.length > 30 && (
            <p className="text-xs text-gray-400 mt-2">Showing last 30 of {timelineEvents.length} events.</p>
          )}
        </Section>
      )}

      {/* 9. Overall Summary */}
      <Section title="Overall Summary">
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="bg-white rounded p-3 border border-gray-200 text-center">
              <p className="text-2xl font-bold text-blue-600">{visits.length}</p>
              <p className="text-[11px] text-gray-500">Total Visits</p>
            </div>
            <div className="bg-white rounded p-3 border border-gray-200 text-center">
              <p className="text-2xl font-bold text-emerald-600">{plans.length}</p>
              <p className="text-[11px] text-gray-500">Treatment Plans</p>
            </div>
            <div className="bg-white rounded p-3 border border-gray-200 text-center">
              <p className="text-2xl font-bold text-amber-600">{totalCompletedPlans}</p>
              <p className="text-[11px] text-gray-500">Completed Plans</p>
            </div>
            <div className="bg-white rounded p-3 border border-gray-200 text-center">
              <p className="text-2xl font-bold text-purple-600">{totalCompletedSessions}</p>
              <p className="text-[11px] text-gray-500">Completed Sessions</p>
            </div>
            <div className="bg-white rounded p-3 border border-gray-200 text-center">
              <p className="text-2xl font-bold text-indigo-600">{prescriptions.length}</p>
              <p className="text-[11px] text-gray-500">Prescriptions</p>
            </div>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            {patient.firstName} {patient.lastName} has {visits.length} visit{visits.length !== 1 ? "s" : ""} on record,
            with {plans.length} treatment plan{plans.length !== 1 ? "s" : ""}
            ({totalCompletedPlans} completed).
            {mergedConditions.length > 0
              ? ` ${mergedConditions.length} condition${mergedConditions.length !== 1 ? "s" : ""} documented`
              : ""}
            {mergedConditions.length > 0
              ? ` (${activeConditionCount} active).`
              : "."}
            {sessions.length > 0
              ? ` ${sessions.length} procedure session${sessions.length !== 1 ? "s" : ""} performed (${totalCompletedSessions} completed).`
              : ""}
            {prescriptions.length > 0
              ? ` ${prescriptions.length} prescription${prescriptions.length !== 1 ? "s" : ""} issued.`
              : ""}
          </p>
        </div>
      </Section>

      {/* 10. Imaging */}
      {images.length > 0 && (
        <Section title="Imaging">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img: any) => (
              <div key={img.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <img
                  src={resolveUrl(img.thumbnailUrl || img.fileUrl)}
                  alt={img.fileName || "Imaging"}
                  className="w-full h-40 object-cover"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="p-2 space-y-1">
                  <p className="text-xs font-medium text-gray-700">{img.type?.replace(/_/g, " ") || "—"}</p>
                  <p className="text-[10px] text-gray-500">{img.takenAt ? formatDate(img.takenAt) : ""}</p>
                  {img.stage && (
                    <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {img.stage}
                    </span>
                  )}
                  {img.notes && <p className="text-[10px] text-gray-500 truncate">{img.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
