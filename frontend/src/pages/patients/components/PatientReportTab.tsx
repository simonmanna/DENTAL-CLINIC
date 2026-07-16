import { useQuery } from "@tanstack/react-query";
import { patientsApi } from "../../../lib/api/patients";
import { treatmentPlansApi } from "../../../lib/api/treatment-plans";
import { conditionsApi } from "../../../lib/api/conditions";
import { chartEntriesApi } from "../../../lib/api/chart-entries";
import { treatmentProceduresApi } from "../../../lib/api/treatment-procedures";
import { prescriptionsApi, imagingApi } from "../../../lib/api";
import { formatDate, getAge, cn } from "../../../lib/utils";
import {
  Loader2, Printer, Activity, Clock, Syringe, CheckCircle, XCircle,
  Pill, User, FileText, Stethoscope, CalendarDays, ClipboardList,
  Heart, ShieldAlert, FlaskConical, Camera, History, TrendingUp,
  ClipboardCheck, Award, Phone, Mail, MapPin, Droplets, Calendar,
  Microscope, Hash, AlertTriangle, Eye,
} from "lucide-react";

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

function Section({
  title,
  children,
  icon: Icon,
  iconBg = "bg-blue-600",
  subtitle,
  className,
  noPadding,
  accentBorder,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ElementType;
  iconBg?: string;
  subtitle?: string;
  className?: string;
  noPadding?: boolean;
  accentBorder?: string;
}) {
  return (
    <div className={cn(
      "print-section bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden",
      accentBorder ? "border-l-4 " + accentBorder : "",
      className
    )}>
      <div className={cn(
        "flex items-center gap-3",
        noPadding ? "px-4 py-2.5" : "px-5 py-3",
        "border-b border-slate-100",
        "bg-gradient-to-r from-slate-50/80 to-white"
      )}>
        {Icon && (
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-800 leading-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{subtitle}</p>}
        </div>
      </div>
      <div className={cn("no-print", !noPadding && "p-5")}>
        {children}
      </div>
      {/* Print: render children directly inside the section */}
      <div className="print-only p-2">
        {children}
      </div>
    </div>
  );
}

function StatChip({
  icon: Icon, label, value, color = "blue",
}: {
  icon: React.ElementType;
  label: string;
  value?: React.ReactNode;
  color?: "blue" | "emerald" | "amber" | "purple" | "rose" | "slate";
}) {
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    blue:   { bg: "bg-blue-50",    text: "text-blue-700",  ring: "ring-blue-200" },
    emerald:{ bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
    amber:  { bg: "bg-amber-50",   text: "text-amber-700", ring: "ring-amber-200" },
    purple: { bg: "bg-purple-50",  text: "text-purple-700", ring: "ring-purple-200" },
    rose:   { bg: "bg-rose-50",    text: "text-rose-700", ring: "ring-rose-200" },
    slate:  { bg: "bg-slate-100",  text: "text-slate-700", ring: "ring-slate-200" },
  };
  const c = colorMap[color];
  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ring-1", c.bg, c.text, c.ring)}>
      <Icon className="w-3 h-3 shrink-0" />
      <span className="text-[11px] font-medium">{label}:</span>
      <span className="text-[11px] font-bold">{value || "—"}</span>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-1.5 border-b border-slate-100/80 last:border-0">
      <span className="text-xs font-semibold text-slate-500 w-36 shrink-0">{label}</span>
      <span className="text-sm text-slate-800 font-medium">{value || "—"}</span>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">{label}</span>
      <span className="text-sm text-slate-800 font-semibold">{value || "—"}</span>
    </div>
  );
}

function EmptyRow({ message, icon: Icon }: { message?: string; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      {Icon && <Icon className="w-8 h-8 text-slate-300 mb-2" />}
      <p className="text-sm text-slate-400 italic">{message || "No data recorded"}</p>
    </div>
  );
}

function Table({ headers, children, className }: { headers: string[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-slate-200", className)}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {headers.map((h, i) => (
              <th key={i} className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider py-2.5 px-3 first:pl-4 last:pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

interface CellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
  bold?: boolean;
}

function Cell({ children, className, bold, ...rest }: CellProps) {
  return (
    <td className={cn(
      "py-2.5 px-3 text-sm text-slate-700 first:pl-4 last:pr-4",
      bold && "font-semibold text-slate-800",
      className
    )} {...rest}>{children}</td>
  );
}

function toArray(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as any).data)) return (data as any).data;
  return [];
}

function getInitials(p: any) {
  return `${p?.firstName?.[0] || ""}${p?.lastName?.[0] || ""}`.toUpperCase();
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
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-slate-500">Compiling patient report…</span>
      </div>
    );
  }

  if (!patient) {
    return <p className="text-sm text-slate-400 py-10 text-center">Patient not found.</p>;
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

  const timelineEvents: { date: string; label: string; desc: string; type: string }[] = [];

  if (patient.createdAt) {
    timelineEvents.push({ date: patient.createdAt, label: "Registration", desc: "Patient registered in the system", type: "registration" });
  }

  sortedVisits.forEach((v: any) => {
    timelineEvents.push({
      date: v.createdAt || v.date,
      label: "Visit",
      desc: `${v.visitCode || v.reason || "Visit"} — ${v.status}`,
      type: "visit",
    });
  });

  plans.forEach((p: any) => {
    timelineEvents.push({ date: p.createdAt, label: "Treatment Plan", desc: `${p.title} (${p.status})`, type: "plan" });
  });

  allProcedures.forEach((pr: any) => {
    if (pr.completedAt) {
      timelineEvents.push({
        date: pr.completedAt,
        label: "Procedure Completed",
        desc: pr.procedure?.name || "Procedure",
        type: "procedure",
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
        type: "session",
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

  const generatedDate = new Date().toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });

  const triggerPrint = () => {
    window.print();
  };

  /* ─── Timeline icon map ────────────────────────────────────────────── */
  const timelineIconMap: Record<string, { Icon: React.ElementType; color: string; bg: string }> = {
    registration: { Icon: User,                     color: "text-slate-600",  bg: "bg-slate-100" },
    visit:        { Icon: CalendarDays,             color: "text-blue-600",   bg: "bg-blue-100" },
    plan:         { Icon: ClipboardList,            color: "text-purple-600", bg: "bg-purple-100" },
    procedure:    { Icon: FlaskConical,             color: "text-amber-600",  bg: "bg-amber-100" },
    session:      { Icon: CheckCircle,              color: "text-emerald-600",bg: "bg-emerald-100" },
  };

  /* ─── Condition status config ───────────────────────────────────────── */
  const statusCfg: Record<string, { label: string; icon: any; color: string; bg: string; border: string; iconColor: string }> = {
    ACTIVE:     { label: "Active",     icon: Activity,   color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200",    iconColor: "text-blue-600" },
    MONITORED:  { label: "Monitored",  icon: Clock,      color: "text-purple-700", bg: "bg-purple-50",  border: "border-purple-200",  iconColor: "text-purple-600" },
    IN_TREATMENT:{ label: "In Treatment",icon: Syringe,   color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200",   iconColor: "text-amber-600" },
    RESOLVED:   { label: "Resolved",   icon: CheckCircle,color: "text-emerald-700",bg: "bg-emerald-50", border: "border-emerald-200",iconColor: "text-emerald-600" },
    RULED_OUT:  { label: "Ruled Out",  icon: XCircle,    color: "text-gray-600",   bg: "bg-gray-50",    border: "border-gray-200",    iconColor: "text-gray-500" },
  };
  const groupOrder = ["ACTIVE", "IN_TREATMENT", "MONITORED", "RESOLVED", "RULED_OUT"];

  const grouped: Record<string, any[]> = {};
  mergedConditions.forEach((c: any) => {
    const key = c.status || "ACTIVE";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

  return (
    <div className="patient-report">
      <style>{`
        .print-only { display: none !important; }

        @media print {
          @page { margin: 1.2cm; }

          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          html, body { background: white !important; font-size: 11px !important; }

          body * { visibility: hidden !important; }
          .patient-report, .patient-report * { visibility: visible !important; }
          .patient-report { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; padding: 0 !important; }

          .no-print { display: none !important; }
          .print-only { display: block !important; visibility: visible !important; }
          .print-only-grid { display: grid !important; visibility: visible !important; }

          .print-section { page-break-inside: avoid; break-inside: avoid; }
          table { page-break-inside: auto; font-size: 10px !important; }
          tr { page-break-inside: avoid; break-inside: avoid; }
          thead { display: table-header-group; }
          h2 { font-size: 12px !important; }
          .text-sm { font-size: 10px !important; }
          .text-xs { font-size: 9px !important; }
          .text-gray-400 { color: #666 !important; }
          .text-gray-500 { color: #666 !important; }
          .text-gray-700 { color: #222 !important; }
          .text-gray-800 { color: #000 !important; }
          .bg-gray-50 { background: #f5f5f5 !important; }
          .border-gray-200 { border-color: #ccc !important; }
        }
      `}</style>

      {/* ── Report Header ────────────────────────────────────────────────── */}
      <div className="no-print mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Patient Clinical Report</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {patient.firstName} {patient.lastName} · {patient.patientCode || "—"} · Generated {generatedDate}
              </p>
            </div>
          </div>
          <button
            onClick={triggerPrint}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 text-sm font-semibold transition-all shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {/* Print-only header */}
      <div className="print-only mb-5 border-b-2 border-blue-600 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">Patient Clinical Report</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {patient.firstName} {patient.lastName} · {patient.patientCode || "—"} · Generated {generatedDate}
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-Column Layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* ════════════════════════════════════════════
            LEFT SIDEBAR (4 cols)
        ════════════════════════════════════════════ */}
        <div className="lg:col-span-4 space-y-5">

          {/* Patient Profile Card */}
          <Section
            title="Patient Profile"
            icon={User}
            iconBg="bg-gradient-to-br from-blue-600 to-indigo-600"
            subtitle="Demographic overview"
            accentBorder="border-blue-400"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center ring-2 ring-blue-200">
                <span className="text-base font-black text-blue-700">{getInitials(patient)}</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">{patient.firstName} {patient.lastName}</h3>
                <p className="text-xs text-slate-500 font-mono">{patient.patientCode}</p>
              </div>
            </div>
            <div className="space-y-0">
              <InfoItem label="Date of Birth" value={patient.dateOfBirth ? `${formatDate(patient.dateOfBirth)} (${age} yrs)` : "—"} />
              <InfoItem label="Gender" value={patient.gender || "—"} />
              <InfoItem label="Blood Group" value={
                <span className="inline-flex items-center gap-1.5">
                  <Droplets className="w-3 h-3 text-rose-400" />
                  {patient.bloodGroup || "—"}
                </span>
              } />
              <InfoItem label="Phone" value={
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {patient.phone || "—"}
                </span>
              } />
              <InfoItem label="Email" value={
                patient.email ?
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-slate-400" />
                    {patient.email}
                  </span> : "—"
              } />
              <InfoItem label="Address" value={
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  {patient.address || "—"}
                </span>
              } />
              <InfoItem label="First Visit" value={firstVisitDate ? formatDate(firstVisitDate.createdAt || firstVisitDate.date) : "—"} />
              <InfoItem label="Latest Visit" value={latestVisitDate ? formatDate(latestVisitDate.createdAt || latestVisitDate.date) : "—"} />
              <InfoItem label="Total Visits" value={
                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-xs font-bold ring-1 ring-blue-200">
                  {visits.length}
                </span>
              } />
            </div>
          </Section>

          {/* Overall Summary */}
          <Section
            title="Overall Summary"
            icon={Award}
            iconBg="bg-gradient-to-br from-amber-500 to-orange-500"
            subtitle="Key metrics at a glance"
            accentBorder="border-amber-400"
          >
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: "Total Visits",   value: visits.length,             color: "blue",   icon: CalendarDays },
                { label: "Treatment Plans", value: plans.length,             color: "emerald",icon: ClipboardList },
                { label: "Completed Plans", value: totalCompletedPlans,      color: "emerald",icon: CheckCircle },
                { label: "Sessions",       value: totalCompletedSessions,    color: "purple", icon: Activity },
                { label: "Prescriptions",  value: prescriptions.length,      color: "rose",   icon: Pill },
                { label: "Conditions",     value: mergedConditions.length,   color: "amber",  icon: ShieldAlert },
              ].map(({ label, value, color, icon: SIcon }) => (
                <div key={label} className={cn(
                  "flex items-center gap-2.5 rounded-xl p-3 ring-1",
                  color === "blue"    && "bg-blue-50  ring-blue-200",
                  color === "emerald" && "bg-emerald-50 ring-emerald-200",
                  color === "purple"  && "bg-purple-50 ring-purple-200",
                  color === "rose"    && "bg-rose-50   ring-rose-200",
                  color === "amber"   && "bg-amber-50  ring-amber-200",
                )}>
                  <SIcon className={cn(
                    "w-4 h-4 shrink-0",
                    color === "blue"    && "text-blue-600",
                    color === "emerald" && "text-emerald-600",
                    color === "purple"  && "text-purple-600",
                    color === "rose"    && "text-rose-600",
                    color === "amber"   && "text-amber-600",
                  )} />
                  <div>
                    <p className="text-lg font-black text-slate-800 leading-none">{value}</p>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-tight">{label}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-xl p-3.5 ring-1 ring-slate-200">
              <div className="flex items-start gap-2">
                <ClipboardCheck className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  {patient.firstName} {patient.lastName} has <strong>{visits.length} visit{visits.length !== 1 ? "s" : ""}</strong> on record,
                  with <strong>{plans.length} treatment plan{plans.length !== 1 ? "s" : ""}</strong> ({totalCompletedPlans} completed).
                  {mergedConditions.length > 0
                    ? <> <strong>{mergedConditions.length} condition{mergedConditions.length !== 1 ? "s" : ""}</strong> documented ({activeConditionCount} active).</>
                    : " No documented conditions."}
                  {sessions.length > 0
                    ? <> <strong>{sessions.length} procedure session{sessions.length !== 1 ? "s" : ""}</strong> performed ({totalCompletedSessions} completed).</>
                    : ""}
                  {prescriptions.length > 0
                    ? <> <strong>{prescriptions.length} prescription{prescriptions.length !== 1 ? "s" : ""}</strong> issued.</>
                    : ""}
                </p>
              </div>
            </div>
          </Section>

        </div>

        {/* ════════════════════════════════════════════
            MAIN CONTENT (8 cols)
        ════════════════════════════════════════════ */}
        <div className="lg:col-span-8 space-y-5">

          {/* 1. Chief Complaint & Present Illness */}
          {visit && (
            <Section
              title="Chief Complaint & Present Illness"
              icon={Stethoscope}
              iconBg="bg-gradient-to-br from-rose-500 to-pink-600"
              subtitle="Presenting symptoms and clinical history"
              accentBorder="border-rose-400"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-rose-50 to-white rounded-xl p-4 ring-1 ring-rose-200/60">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-md bg-rose-100 flex items-center justify-center">
                      <Heart className="w-3 h-3 text-rose-600" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Chief Complaint</span>
                  </div>
                  <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{chiefComplaint || <em className="text-slate-400">None recorded</em>}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl p-4 ring-1 ring-amber-200/60">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center">
                      <ClipboardList className="w-3 h-3 text-amber-600" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">History of Present Illness</span>
                  </div>
                  <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{historyOfPresentIllness || <em className="text-slate-400">None recorded</em>}</p>
                </div>
              </div>
            </Section>
          )}

          {/* 2. Patient Medical History */}
          <Section
            title="Patient Medical History"
            icon={ShieldAlert}
            iconBg="bg-gradient-to-br from-amber-500 to-orange-500"
            subtitle="Allergies, conditions &amp; medications"
            accentBorder="border-amber-400"
          >
            {hasMedicalData ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Allergies */}
                <div>
                  {patient.allergies && patient.allergies.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                          Allergies
                        </span>
                        <span className="text-[10px] font-bold bg-rose-600 text-white px-1.5 py-0.5 rounded-full">{patient.allergies.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {patient.allergies.map((a, i) => (
                          <span key={i} className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-lg text-xs font-semibold ring-1 ring-rose-100">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* Medical Conditions */}
                <div>
                  {patient.medicalConditions && patient.medicalConditions.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Heart className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                          Medical Conditions
                        </span>
                        <span className="text-[10px] font-bold bg-amber-600 text-white px-1.5 py-0.5 rounded-full">{patient.medicalConditions.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {patient.medicalConditions.map((m, i) => (
                          <span key={i} className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-semibold ring-1 ring-amber-100">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* Medications */}
                <div>
                  {patient.currentMedications && patient.currentMedications.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Pill className="w-3.5 h-3.5 text-purple-600" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                          Current Medications
                        </span>
                        <span className="text-[10px] font-bold bg-purple-600 text-white px-1.5 py-0.5 rounded-full">{patient.currentMedications.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {patient.currentMedications.map((m, i) => (
                          <span key={i} className="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-lg text-xs font-semibold ring-1 ring-purple-100">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyRow message="No medical history recorded." icon={ShieldAlert} />
            )}
          </Section>

          {/* 3. SOAP Clinical Notes */}
          {visit && hasSOAP && (
            <Section
              title="Clinical Notes (SOAP)"
              icon={FileText}
              iconBg="bg-gradient-to-br from-violet-500 to-purple-600"
              subtitle="Structured clinical documentation"
              accentBorder="border-violet-400"
            >
              <div className="space-y-3">
                {/* S/O/A/P color bar */}
                <div className="grid grid-cols-4 rounded-xl overflow-hidden ring-1 ring-slate-200">
                  {[
                    { letter: "S", label: "Subjective",    color: "bg-violet-500" },
                    { letter: "O", label: "Objective",     color: "bg-blue-500" },
                    { letter: "A", label: "Assessment",    color: "bg-emerald-500" },
                    { letter: "P", label: "Plan",          color: "bg-amber-500" },
                  ].map(({ letter, label, color }) => (
                    <div key={letter} className={`${color} py-2 flex items-center justify-center gap-1.5`}>
                      <span className="text-white font-black text-sm">{letter}</span>
                      <span className="text-white/80 text-[11px] hidden sm:block">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {visit.subjective && (
                    <div className="bg-violet-50/60 rounded-xl p-3.5 border border-violet-200/60">
                      <span className="text-[11px] font-black uppercase tracking-widest text-violet-600 block mb-1">Subjective (S)</span>
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{visit.subjective}</p>
                    </div>
                  )}
                  {visit.objective && (
                    <div className="bg-blue-50/60 rounded-xl p-3.5 border border-blue-200/60">
                      <span className="text-[11px] font-black uppercase tracking-widest text-blue-600 block mb-1">Objective (O)</span>
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{visit.objective}</p>
                    </div>
                  )}
                  {visit.assessment && (
                    <div className="bg-emerald-50/60 rounded-xl p-3.5 border border-emerald-200/60">
                      <span className="text-[11px] font-black uppercase tracking-widest text-emerald-600 block mb-1">Assessment (A)</span>
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{visit.assessment}</p>
                    </div>
                  )}
                  {visit.plan && (
                    <div className="bg-amber-50/60 rounded-xl p-3.5 border border-amber-200/60">
                      <span className="text-[11px] font-black uppercase tracking-widest text-amber-600 block mb-1">Plan (P)</span>
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{visit.plan}</p>
                    </div>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* 4. Findings & Recommendations */}
          {visit && hasFindingsRecs && (
            <Section
              title="Findings &amp; Recommendations"
              icon={Eye}
              iconBg="bg-gradient-to-br from-slate-600 to-slate-700"
              subtitle="Clinical observations"
              accentBorder="border-slate-400"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {visit.findings && (
                  <div className="bg-slate-50 rounded-xl p-4 ring-1 ring-slate-200">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">Clinical Findings</span>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{visit.findings}</p>
                  </div>
                )}
                {visit.recommendations && (
                  <div className="bg-blue-50 rounded-xl p-4 ring-1 ring-blue-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block mb-2">Recommendations</span>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{visit.recommendations}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* 5. Diagnoses & Conditions */}
          <Section
            title="Diagnoses &amp; Conditions"
            icon={Microscope}
            iconBg="bg-gradient-to-br from-purple-500 to-indigo-600"
            subtitle="Dental conditions by status"
            accentBorder="border-purple-400"
          >
            {mergedConditions.length === 0 ? (
              <EmptyRow message="No conditions or diagnoses recorded." icon={Activity} />
            ) : (
              <div className="space-y-4">
                {groupOrder.map((gk) => {
                  const items = grouped[gk];
                  if (!items?.length) return null;
                  const cfg = statusCfg[gk] || statusCfg.ACTIVE;
                  const Icon = cfg.icon;
                  return (
                    <div key={gk}>
                      {/* Status group header */}
                      <div className={cn("flex items-center gap-2.5 px-4 py-2.5 rounded-xl mb-2.5", cfg.bg, "border", cfg.border)}>
                        <Icon className={cn("w-4 h-4", cfg.iconColor)} />
                        <span className={cn("text-sm font-bold", cfg.color)}>{cfg.label}</span>
                        <span className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold bg-white/80 text-slate-700 ring-1 ring-slate-200">
                          {items.length}
                        </span>
                      </div>
                      {/* Condition cards */}
                      <div className="space-y-2">
                        {items.map((c: any) => (
                          <div key={c.id} className={cn("bg-white rounded-xl p-4 ring-1", "ring-slate-200", "border-l-4", {
                            "border-l-blue-500":   c.status === "ACTIVE",
                            "border-l-amber-500": c.status === "IN_TREATMENT",
                            "border-l-purple-500":c.status === "MONITORED",
                            "border-l-emerald-500":c.status === "RESOLVED",
                            "border-l-gray-400":  c.status === "RULED_OUT",
                          })}>
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 pr-3">
                                <h4 className="text-sm font-bold text-slate-800">{c.condition?.name || "—"}</h4>
                                {c.toothNumber && (
                                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                                    <Hash className="w-3 h-3" />
                                    Tooth #{c.toothNumber}{c.surfaces?.length > 0 ? ` (${c.surfaces.join(", ")})` : ""}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                {c.severity && (
                                  <span className={cn(
                                    "text-[11px] font-bold px-2 py-0.5 rounded-md",
                                    String(c.severity).toUpperCase() === "SEVERE"   ? "bg-rose-100 text-rose-700 ring-1 ring-rose-200" :
                                    String(c.severity).toUpperCase() === "MODERATE" ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200" :
                                                                                   "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
                                  )}>
                                    {c.severity}
                                  </span>
                                )}
                                {c.conditionStatus && c.conditionStatus !== c.status && (
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                                    {String(c.conditionStatus).replace(/_/g, " ")}
                                  </span>
                                )}
                                <span className={cn("text-[11px] font-semibold px-2.5 py-0.5 rounded-md", cfg.bg, cfg.color, "border", cfg.border)}>
                                  {cfg.label}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-1.5">
                              <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> Diagnosed: {formatDate(c.diagnosedAt)}</span>
                              {c.diagnosedBy && <span>By: {typeof c.diagnosedBy === "object" ? `${c.diagnosedBy.firstName} ${c.diagnosedBy.lastName}` : c.diagnosedBy}</span>}
                              {c.resolvedAt && <span className="inline-flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Resolved: {formatDate(c.resolvedAt)}</span>}
                            </div>
                            {c.notes && (
                              <p className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 italic">{c.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* 6. Visit History */}
          {hasVisits && (
            <Section
              title="Visit History"
              icon={CalendarDays}
              iconBg="bg-gradient-to-br from-sky-500 to-blue-600"
              subtitle={`${visits.length} visit${visits.length !== 1 ? "s" : ""} on record`}
              accentBorder="border-sky-400"
            >
              <Table headers={["#", "Date", "Visit Code", "Type", "Dentist", "Status"]}>
                {sortedVisits.slice(0, 50).map((v: any, i: number) => (
                  <tr key={v.id} className={cn(
                    "hover:bg-blue-50/40 transition-colors",
                    i === 0 && "bg-blue-50/30"
                  )}>
                    <Cell className="text-slate-400 text-xs tabular-nums">{sortedVisits.length - i}</Cell>
                    <Cell className="whitespace-nowrap">{formatDate(v.createdAt || v.date)}</Cell>
                    <Cell className="text-xs font-mono text-slate-500">{v.visitCode || v.id.slice(0, 8)}</Cell>
                    <Cell>{v.appointment?.type || v.reason || "—"}</Cell>
                    <Cell className="text-xs">{v.dentist ? `Dr. ${v.dentist.firstName} ${v.dentist.lastName}` : "—"}</Cell>
                    <Cell><Badge status={v.status} /></Cell>
                  </tr>
                ))}
              </Table>
              {sortedVisits.length > 50 && (
                <p className="text-xs text-slate-400 mt-2">Showing last 50 of {sortedVisits.length} visits.</p>
              )}
            </Section>
          )}

          {/* 7. Treatment Plans */}
          {hasPlans && (
            <Section
              title="Treatment Plans"
              icon={ClipboardList}
              iconBg="bg-gradient-to-br from-emerald-500 to-teal-600"
              subtitle={`${plans.length} plan${plans.length !== 1 ? "s" : ""} for this patient`}
              accentBorder="border-emerald-400"
            >
              <div className="space-y-4">
                {plans.map((plan: any) => {
                  const planProcs = proceduresByPlanId[plan.id] || [];
                  const statusC = plan.status === "COMPLETED" ? { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", iconBg: "bg-emerald-100", iconColor: "text-emerald-600" } :
                                   plan.status === "IN_PROGRESS" ? { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    iconBg: "bg-blue-100",    iconColor: "text-blue-600" } :
                                   plan.status === "CANCELLED" ? { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    iconBg: "bg-rose-100",    iconColor: "text-rose-600" } :
                                                                       { bg: "bg-slate-100",  text: "text-slate-700",   border: "border-slate-200",   iconBg: "bg-slate-200",   iconColor: "text-slate-600" };
                  return (
                    <div key={plan.id} className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      {/* Plan header bar */}
                      <div className={cn("px-4 py-3 flex items-center justify-between", statusC.bg, "border-b", statusC.border)}>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-800">{plan.title}</h4>
                            <Badge status={plan.status} />
                            {plan.priority && <Badge status={plan.priority} />}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{plan.planCode} · Created {formatDate(plan.createdAt)}</p>
                        </div>
                      </div>
                      <div className="p-4 space-y-3">
                        {plan.diagnosis && (
                          <p className="text-xs text-slate-600"><span className="font-bold uppercase tracking-wider text-[11px] text-slate-500 mr-1.5">Diagnosis</span>{plan.diagnosis}</p>
                        )}
                        {plan.summary && (
                          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg ring-1 ring-slate-200"><ClipboardList className="w-3 h-3 text-blue-500" /> {plan.summary.totalProcedures || 0} procedures</span>
                            <span className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg ring-1 ring-slate-200"><CheckCircle className="w-3 h-3 text-emerald-500" /> {plan.summary.completedCount || 0} completed</span>
                            {typeof plan.summary.completionPercent === "number" && (
                              <span className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg ring-1 ring-slate-200"><TrendingUp className="w-3 h-3 text-blue-500" /> {plan.summary.completionPercent}%</span>
                            )}
                          </div>
                        )}
                        {planProcs.length > 0 ? (
                          <Table headers={["#", "Procedure", "Code", "Teeth", "Status", "Price"]}>
                            {planProcs.map((pr: any) => (
                              <tr key={pr.id} className="hover:bg-slate-50/60 transition-colors">
                                <Cell className="text-slate-400 text-xs">{pr.sequence || "—"}</Cell>
                                <Cell className="font-semibold">{pr.procedure?.name || "—"}</Cell>
                                <Cell className="text-xs text-slate-500">{pr.procedure?.code || "—"}</Cell>
                                <Cell>{pr.targets?.map((t: any) => `#${t.toothNumber}`).join(", ") || pr.toothNumbers?.join(", ") || "—"}</Cell>
                                <Cell><Badge status={pr.status} /></Cell>
                                <Cell className="text-xs font-mono">{pr.totalPrice != null ? `UGX ${pr.totalPrice.toLocaleString()}` : "—"}</Cell>
                              </tr>
                            ))}
                          </Table>
                        ) : (
                          <EmptyRow message="No procedures in this plan" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* 8. Prescriptions */}
          <Section
            title="Prescriptions"
            icon={Pill}
            iconBg="bg-gradient-to-br from-violet-500 to-purple-600"
            subtitle={`${prescriptions.length} prescription${prescriptions.length !== 1 ? "s" : ""} issued`}
            accentBorder="border-violet-400"
          >
            {hasPrescriptions ? (
              <div className="space-y-4">
                {sortedPrescriptions.map((rx: any) => (
                  <div key={rx.id} className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gradient-to-r from-violet-50 to-purple-50 border-b border-violet-200/60 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Pill className="w-4 h-4 text-violet-600" />
                          <h4 className="text-sm font-bold text-slate-800">{rx.prescriptionCode}</h4>
                          <Badge status={rx.status} />
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 ml-6">
                          {formatDate(rx.createdAt)} — Dr. {rx.dentist?.firstName} {rx.dentist?.lastName}
                        </p>
                      </div>
                    </div>
                    {rx.notes && (
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1.5">Notes</span>
                        <span className="text-xs text-slate-700">{rx.notes}</span>
                      </div>
                    )}
                    {rx.items?.length > 0 && (
                      <Table headers={["Drug", "Dosage", "Frequency", "Duration", "Route", "Qty", "Instructions"]}>
                        {rx.items.map((item: any) => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <Cell className="font-semibold">{item.drug?.name || "—"}</Cell>
                            <Cell>{item.dosage || "—"}</Cell>
                            <Cell>{item.frequency || "—"}</Cell>
                            <Cell>{item.duration || "—"}</Cell>
                            <Cell className="text-xs">{item.route || "—"}</Cell>
                            <Cell className="text-xs tabular-nums">{item.quantity ?? "—"}</Cell>
                            <Cell className="text-slate-500 max-w-[180px] truncate" title={item.instructions}>{item.instructions || "—"}</Cell>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRow message="No prescriptions recorded." icon={Pill} />
            )}
          </Section>

          {/* 9. Completed Procedures & Sessions */}
          {hasSessions && (
            <Section
              title="Completed Procedures &amp; Sessions"
              icon={ClipboardCheck}
              iconBg="bg-gradient-to-br from-emerald-500 to-green-600"
              subtitle={`${sessions.length} session${sessions.length !== 1 ? "s" : ""} performed`}
              accentBorder="border-emerald-400"
            >
              <Table headers={["Date", "Procedure", "Tooth", "Surfaces", "Session", "Outcome"]}>
                {sortedSessions.slice(0, 100).map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <Cell className="whitespace-nowrap">{s.performedDate ? formatDate(s.performedDate) : formatDate(s.createdAt)}</Cell>
                    <Cell className="font-semibold">{s.treatmentProcedure?.procedure?.name || s.procedure?.name || s.sessionLabel || `Session ${s.sessionNumber || ""}`}</Cell>
                    <Cell>{s.targets?.map((t: any) => `#${t.toothNumber}`).join(", ") || "—"}</Cell>
                    <Cell>{s.surfaces?.join(", ") || "—"}</Cell>
                    <Cell className="text-xs text-slate-500">{s.sessionNumber ? `Session ${s.sessionNumber}` : "—"}</Cell>
                    <Cell>{s.outcome || <Badge status={s.status} />}</Cell>
                  </tr>
                ))}
              </Table>
              {sortedSessions.length > 100 && (
                <p className="text-xs text-slate-400 mt-2">Showing last 100 of {sortedSessions.length} sessions.</p>
              )}
            </Section>
          )}

          {/* 10. Clinical Timeline */}
          {hasTimeline && (
            <Section
              title="Clinical Timeline"
              icon={History}
              iconBg="bg-gradient-to-br from-indigo-500 to-violet-600"
              subtitle="Chronological record of key events"
              accentBorder="border-indigo-400"
            >
              <div className="relative pl-7 border-l-2 border-dashed border-blue-300/70 space-y-4">
                {/* Timeline line */}
                {timelineEvents.slice(0, 30).map((evt, i) => {
                  const tIcon = timelineIconMap[evt.type] || timelineIconMap.visit;
                  const Icon = tIcon.Icon;
                  return (
                    <div key={i} className="relative">
                      <div className={cn(
                        "absolute -left-[31px] top-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center",
                        tIcon.bg
                      )}>
                        <Icon className={cn("w-2 h-2", tIcon.color)} />
                      </div>
                      <p className="text-[11px] font-semibold text-slate-400 tabular-nums">{formatDate(evt.date)}</p>
                      <p className="text-sm font-bold text-slate-800">{evt.label}</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{evt.desc}</p>
                    </div>
                  );
                })}
              </div>
              {timelineEvents.length > 30 && (
                <p className="text-xs text-slate-400 mt-3">Showing last 30 of {timelineEvents.length} events.</p>
              )}
            </Section>
          )}

          {/* 11. Imaging */}
          {images.length > 0 && (
            <Section
              title="Imaging"
              icon={Camera}
              iconBg="bg-gradient-to-br from-sky-500 to-cyan-600"
              subtitle={`${images.length} image${images.length !== 1 ? "s" : ""} captured`}
              accentBorder="border-sky-400"
            >
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 no-print">
                {images.map((img: any) => (
                  <div key={img.id} className="group rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm hover:shadow-md hover:border-blue-300 transition-all">
                    <div className="relative">
                      <img
                        src={resolveUrl(img.thumbnailUrl || img.fileUrl)}
                        alt={img.fileName || "Imaging"}
                        className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-2.5">
                        <img
                          src={resolveUrl(img.thumbnailUrl || img.fileUrl)}
                          alt={img.fileName || "Imaging"}
                          className="hidden"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                    <div className="p-2.5 space-y-1">
                      <p className="text-xs font-bold text-slate-700">{img.type?.replace(/_/g, " ") || "—"}</p>
                      <p className="text-[11px] text-slate-500">{img.takenAt ? formatDate(img.takenAt) : ""}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {img.stage && (
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 border border-blue-200 ring-1 ring-blue-200">
                            {img.stage}
                          </span>
                        )}
                      </div>
                      {img.notes && <p className="text-[10px] text-slate-500 truncate" title={img.notes}>{img.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {/* Print: simple table layout */}
              <div className="print-only">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left text-[11px] font-semibold text-gray-500 py-1.5 px-2">Type</th>
                      <th className="text-left text-[11px] font-semibold text-gray-500 py-1.5 px-2">Date</th>
                      <th className="text-left text-[11px] font-semibold text-gray-500 py-1.5 px-2">Stage</th>
                      <th className="text-left text-[11px] font-semibold text-gray-500 py-1.5 px-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {images.map((img: any) => (
                      <tr key={img.id}>
                        <td className="py-1.5 px-2 text-sm">{img.type?.replace(/_/g, " ") || "—"}</td>
                        <td className="py-1.5 px-2 text-sm">{img.takenAt ? formatDate(img.takenAt) : ""}</td>
                        <td className="py-1.5 px-2 text-sm">{img.stage || "—"}</td>
                        <td className="py-1.5 px-2 text-sm text-gray-500">{img.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

        </div>

        {/* right-end of two-col grid */}
      </div>

    </div>
  );
}
