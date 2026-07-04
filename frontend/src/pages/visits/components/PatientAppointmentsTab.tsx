// src/pages/visits/components/PatientAppointmentsTab.tsx
// Appointments tab inside VisitPage — shows patient's past & upcoming appointments
// and allows booking a new one directly from within the visit context.

import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format,
  isPast,
  isFuture,
  isToday,
  parseISO,
  differenceInCalendarDays,
} from "date-fns";
import {
  Calendar,
  CalendarDays,
  Clock,
  Plus,
  X,
  ChevronRight,
  Stethoscope,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  CalendarCheck,
  CalendarX,
  History,
  Sparkles,
  Phone,
  User,
  RefreshCw,
  Check,
  ChevronDown,
} from "lucide-react";
import { appointmentsApi, staffApi } from "../../../lib/api";
import { APPOINTMENT_TYPES } from "../../../lib/utils";

// Inside your component function:

// ─── Types ────────────────────────────────────────────────────────────────────
interface Appointment {
  id: string;
  appointmentCode: string;
  type: string;
  status: string;
  scheduledAt: string;
  duration: number;
  chiefComplaint?: string;
  notes?: string;
  isWalkIn: boolean;
  dentistId: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    patientCode: string;
    phone?: string;
  };
  dentist: {
    id: string;
    firstName: string;
    lastName: string;
    specialization?: string;
  };
  visit?: { id: string; status: string } | null;
}

interface Dentist {
  id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
}

interface PatientAppointmentsTabProps {
  patientId: string;
  visitId: string;
  currentDentistId?: string;
  patientName?: string;
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<
  string,
  {
    label: string;
    bg: string;
    text: string;
    border: string;
    dot: string;
    icon: React.ElementType;
  }
> = {
  SCHEDULED: {
    label: "Scheduled",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-400",
    icon: CalendarDays,
  },
  CONFIRMED: {
    label: "Confirmed",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-200",
    dot: "bg-indigo-500",
    icon: CheckCircle2,
  },
  CHECKED_IN: {
    label: "Checked In",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-400",
    icon: User,
  },
  IN_PROGRESS: {
    label: "In Progress",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
    dot: "bg-purple-500",
    icon: Stethoscope,
  },
  COMPLETED: {
    label: "Completed",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
  },
  CANCELLED: {
    label: "Cancelled",
    bg: "bg-red-50",
    text: "text-red-500",
    border: "border-red-200",
    dot: "bg-red-400",
    icon: XCircle,
  },
  NO_SHOW: {
    label: "No Show",
    bg: "bg-slate-100",
    text: "text-slate-500",
    border: "border-slate-200",
    dot: "bg-slate-400",
    icon: AlertCircle,
  },
  RESCHEDULED: {
    label: "Rescheduled",
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
    dot: "bg-orange-400",
    icon: RefreshCw,
  },
    DRAFT: {
    label: "Draft",
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
    dot: "bg-orange-400",
    icon: RefreshCw,
  },
};

const TYPE_COLOR: Record<string, string> = {
  CONSULTATION: "#4F46E5",
  CLEANING: "#0D9488",
  FILLING: "#7C3AED",
  EXTRACTION: "#DC2626",
  ROOT_CANAL: "#D97706",
  ORTHODONTIC: "#0891B2",
  CROWN: "#DB2777",
  BRIDGE: "#4338CA",
  IMPLANT: "#65A30D",
  WHITENING: "#EA580C",
  EMERGENCY: "#B91C1C",
  FOLLOW_UP: "#475569",
  X_RAY: "#0284C7",
  PEDIATRIC: "#7C3AED",
  OTHER: "#64748B",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function StatusPill({ status, small }: { status: string; small?: boolean }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.SCHEDULED;
  const Icon = c.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold border",
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        c.bg,
        c.text,
        c.border,
      )}
    >
      <span
        className={cn(
          "rounded-full shrink-0",
          small ? "w-1.5 h-1.5" : "w-2 h-2",
          c.dot,
        )}
      />
      {c.label}
    </span>
  );
}

function TypeChip({ type }: { type: string }) {
  const color = TYPE_COLOR[type] ?? "#64748B";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold text-white"
      style={{ background: color }}
    >
      {type.replace(/_/g, " ")}
    </span>
  );
}

// ─── New Appointment Form ─────────────────────────────────────────────────────
function BookAppointmentForm({
  patientId,
  currentDentistId,
  dentists,
  onClose,
  onBook,
  loading,
}: {
  patientId: string;
  currentDentistId?: string;
  dentists: Dentist[];
  onClose: () => void;
  onBook: (data: any) => void;
  loading: boolean;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const defaultDt = format(tomorrow, "yyyy-MM-dd'T'HH:mm");

  const [form, setForm] = useState({
    dentistId: currentDentistId || "",
    type: "FOLLOW_UP",
    scheduledAt: defaultDt,
    duration: 30,
    chiefComplaint: "",
    notes: "",
    isWalkIn: false,
    status: "DRAFT",
  });

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const inputCls =
    "w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-all text-slate-800 placeholder:text-slate-300 hover:border-slate-300 bg-white";
  const labelCls =
    "block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide";

  return (
    <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-[#1e3a5f] to-[#2563eb] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <CalendarCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">New Appointment</h3>
            <p className="text-xs text-blue-200 mt-0.5">
              Schedule a follow-up or next visit
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Dentist */}
          <div>
            <label className={labelCls}>Dentist</label>
            <select
              value={form.dentistId}
              onChange={(e) => set("dentistId", e.target.value)}
              className={cn(inputCls, "bg-white")}
              required
            >
              <option value="">Select dentist…</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.firstName} {d.lastName}
                  {d.specialization ? ` — ${d.specialization}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className={labelCls}>Appointment Type</label>
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              className={cn(inputCls, "bg-white")}
            >
              {APPOINTMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} {/* ✅ Use the label field */}
                </option>
              ))}
            </select>
          </div>

          {/* Date/Time */}
          <div>
            <label className={labelCls}>Date & Time</label>
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => set("scheduledAt", e.target.value)}
              className={inputCls}
              required
            />
          </div>

          {/* Duration */}
          <div>
            <label className={labelCls}>Duration</label>
            <select
              value={form.duration}
              onChange={(e) => set("duration", +e.target.value)}
              className={cn(inputCls, "bg-white")}
            >
              {[15, 20, 30, 45, 60, 90, 120].map((d) => (
                <option key={d} value={d}>
                  {d} minutes
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Chief Complaint */}
        <div>
          <label className={labelCls}>Chief Complaint / Reason</label>
          <input
            type="text"
            placeholder="e.g. Follow-up for RCT, pain review, review filling…"
            value={form.chiefComplaint}
            onChange={(e) => set("chiefComplaint", e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls}>
            Notes{" "}
            <span className="normal-case font-normal text-slate-400">
              (optional)
            </span>
          </label>
          <textarea
            rows={2}
            placeholder="Additional context or instructions…"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            className={cn(inputCls, "resize-none")}
          />
        </div>

        {/* Walk-in */}
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <div
            onClick={() => set("isWalkIn", !form.isWalkIn)}
            className={cn(
              "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer",
              form.isWalkIn
                ? "border-blue-600 bg-blue-600"
                : "border-slate-300 group-hover:border-blue-400",
            )}
          >
            {form.isWalkIn && <Check className="w-3 h-3 text-white" />}
          </div>
          <span className="text-sm text-slate-600 font-medium">
            Mark as walk-in
          </span>
        </label>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          <button
            onClick={() => {
              if (!form.dentistId || !form.scheduledAt) return;
              onBook({ ...form, patientId });
            }}
            disabled={loading || !form.dentistId || !form.scheduledAt}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CalendarCheck className="w-4 h-4" />
            )}
            Book Appointment
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Appointment Card ─────────────────────────────────────────────────────────
function AppointmentCard({
  apt,
  onGoToVisit,
  isCurrent,
}: {
  apt: Appointment;
  onGoToVisit?: (visitId: string) => void;
  isCurrent?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const scheduled = parseISO(apt.scheduledAt);
  const isPastApt = isPast(scheduled) && !isToday(scheduled);
  const isUpcoming = isFuture(scheduled) || isToday(scheduled);
  const daysAway = differenceInCalendarDays(scheduled, new Date());
  const color = TYPE_COLOR[apt.type] ?? "#64748B";
  const cfg = STATUS_CFG[apt.status] ?? STATUS_CFG.SCHEDULED;

  return (
    <div
      className={cn(
        "rounded-2xl border-2 overflow-hidden transition-all",
        isCurrent
          ? "border-blue-400 shadow-lg shadow-blue-100"
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm",
      )}
    >
      {/* Left accent bar + main content */}
      <div className="flex">
        {/* Color bar */}
        <div className="w-1.5 shrink-0" style={{ background: color }} />

        <div className="flex-1 px-4 py-3.5">
          {/* Top row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold">
                  {format(scheduled, "EEE, dd-MM-yyyy")}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">
                  {format(scheduled, "h:mm a")}
                </span>
              </div>
              <StatusPill status={apt.status} small />
              {isCurrent && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-600 text-white">
                  <Sparkles className="w-2.5 h-2.5" />
                  Current Visit
                </span>
              )}
              {isUpcoming && !isCurrent && daysAway === 0 && (
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Today
                </span>
              )}
              {isUpcoming && !isCurrent && daysAway === 1 && (
                <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                  Tomorrow
                </span>
              )}
              {isUpcoming && !isCurrent && daysAway > 1 && (
                <span className="text-[11px] text-slate-500">
                  in {daysAway} days
                </span>
              )}
            </div>

            {/* <div className="flex items-center gap-1 shrink-0">
              {apt.visit && onGoToVisit && (
                <button
                  onClick={() => onGoToVisit(apt.visit!.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Visit
                </button>
              )}
              {(apt.chiefComplaint || apt.notes) && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                >
                  <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
                </button>
              )}
            </div> */}
          </div>

          {/* Date + Dentist */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5">
            <TypeChip type={apt.type} />

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{apt.duration} min</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Stethoscope className="w-3 h-3 text-slate-400" />
              <span>
                Dr. {apt.dentist.firstName} {apt.dentist.lastName}
              </span>
              {apt.dentist.specialization && (
                <span className="text-slate-400">
                  · {apt.dentist.specialization}
                </span>
              )}
            </div>
            <span className="text-[11px] font-mono text-slate-300">
              {apt.appointmentCode}
            </span>
          </div>

          {/* Expanded detail */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              {apt.chiefComplaint && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5 shrink-0 w-20">
                    Complaint
                  </span>
                  <p className="text-xs text-slate-600">{apt.chiefComplaint}</p>
                </div>
              )}
              {apt.notes && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5 shrink-0 w-20">
                    Notes
                  </span>
                  <p className="text-xs text-slate-600">{apt.notes}</p>
                </div>
              )}
              {apt.isWalkIn && (
                <span className="inline-flex items-center gap-1 text-[11px] text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-lg font-semibold">
                  Walk-in
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionLabel({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div
        className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center",
          color,
        )}
      >
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <h3 className="text-sm font-bold text-slate-700">{label}</h3>
      <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
        {count}
      </span>
    </div>
  );
}

// ─── Main Tab Component ───────────────────────────────────────────────────────
export function PatientAppointmentsTab({
  patientId,
  visitId,
  currentDentistId,
  patientName,
}: PatientAppointmentsTabProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("all");

  // Fetch all appointments for this patient
  const {
    data: aptData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["patient-appointments", patientId],
    queryFn: () => appointmentsApi.getAll({ patientId, limit: 100 }),
    enabled: !!patientId,
  });

  // Fetch dentists for the booking form
  const { data: dentists = [] } = useQuery<Dentist[]>({
    queryKey: ["dentists"],
    queryFn: staffApi.getDentists,
  });

  // Book mutation
  const bookMutation = useMutation({
    mutationFn: (data: any) => appointmentsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient-appointments", patientId] });
      qc.invalidateQueries({ queryKey: ["cal"] });
      setShowForm(false);
    },
  });

  const allAppointments: Appointment[] = aptData?.data || aptData || [];

  // Separate + sort
  const { upcoming, past, todayApts } = useMemo(() => {
    const now = new Date();
    const upcoming: Appointment[] = [];
    const past: Appointment[] = [];
    const todayApts: Appointment[] = [];

    for (const a of allAppointments) {
      const d = parseISO(a.scheduledAt);
      if (isToday(d)) {
        todayApts.push(a);
      } else if (isFuture(d)) {
        upcoming.push(a);
      } else {
        past.push(a);
      }
    }

    // Sort upcoming ASC, past DESC
    upcoming.sort(
      (a, b) =>
        parseISO(a.scheduledAt).getTime() - parseISO(b.scheduledAt).getTime(),
    );
    past.sort(
      (a, b) =>
        parseISO(b.scheduledAt).getTime() - parseISO(a.scheduledAt).getTime(),
    );
    todayApts.sort(
      (a, b) =>
        parseISO(a.scheduledAt).getTime() - parseISO(b.scheduledAt).getTime(),
    );

    return { upcoming, past, todayApts };
  }, [allAppointments]);

  // Get current visit's appointment to mark it
  const currentVisitAptId = useMemo(() => {
    const todayOrPast = [...todayApts, ...past];
    const linked = todayOrPast.find((a) => a.visit?.id === visitId);
    return linked?.id ?? null;
  }, [todayApts, past, visitId]);

  const handleGoToVisit = (vId: string) => {
    navigate(`/visits/${vId}`);
  };

  // Compute visible lists based on filter
  const visibleUpcoming = filter === "past" ? [] : [...todayApts, ...upcoming];
  const visiblePast = filter === "upcoming" ? [] : past;

  const totalCount = allAppointments.length;

  return (
    <div className="space-y-5  px-2">
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            Patient Appointments
            {patientName && (
              <span className="text-slate-400 font-normal ml-2">
                — {patientName}
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {totalCount} total · {todayApts.length + upcoming.length} upcoming ·{" "}
            {past.length} past
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter chips */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
            {(
              [
                { value: "all", label: "All" },
                { value: "upcoming", label: "Upcoming" },
                { value: "past", label: "Past" },
              ] as const
            ).map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                  filter === f.value
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-400 hover:text-slate-600",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            // onClick={() => navigate('/appointments')}
            onClick={() => setShowForm(true)}
            className="flex items-center gap-0 px-4 py-1.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Appointment
          </button>
        </div>
      </div>

      {/* ── Booking form ──────────────────────────────────────────────── */}
      {showForm && (
        <BookAppointmentForm
          patientId={patientId}
          currentDentistId={currentDentistId}
          dentists={dentists}
          onClose={() => setShowForm(false)}
          onBook={(data) => bookMutation.mutate({ ...data, status: "DRAFT" })}
          loading={bookMutation.isPending}
        />
      )}

      {/* Success banner */}
      {bookMutation.isSuccess && !showForm && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-semibold">
            Appointment booked successfully!
          </span>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm">Loading appointments…</span>
          </div>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Failed to load appointments.</span>
          <button
            onClick={() => refetch()}
            className="ml-auto text-red-700 font-semibold hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Empty ─────────────────────────────────────────────────────── */}
      {!isLoading && !error && allAppointments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <CalendarX className="w-8 h-8 opacity-50" />
          </div>
          <p className="text-base font-semibold text-slate-600">
            No appointments found
          </p>
          <p className="text-sm mt-1">
            This patient has no appointment history yet.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Book First Appointment
          </button>
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────── */}
      {!isLoading && !error && allAppointments.length > 0 && (
        <div className="space-y-6">
          {/* TODAY + UPCOMING */}
          {(filter === "all" || filter === "upcoming") &&
            visibleUpcoming.length > 0 && (
              <div>
                <SectionLabel
                  icon={CalendarCheck}
                  label="Upcoming Appointments"
                  count={visibleUpcoming.length}
                  color="bg-blue-600"
                />
                <div className="space-y-2.5">
                  {visibleUpcoming.map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      apt={apt}
                      onGoToVisit={apt.visit ? handleGoToVisit : undefined}
                      isCurrent={apt.id === currentVisitAptId}
                    />
                  ))}
                </div>
              </div>
            )}

          {/* No upcoming message */}
          {filter === "upcoming" &&
            visibleUpcoming.length === 0 &&
            !isLoading && (
              <div className="flex flex-col items-center py-8 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <CalendarCheck className="w-7 h-7 mb-2 opacity-40" />
                <p className="text-sm font-medium text-slate-500">
                  No upcoming appointments
                </p>
              </div>
            )}
          {/* Divider */}
          {filter === "all" &&
            visibleUpcoming.length > 0 &&
            visiblePast.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  History
                </span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
            )}

          {/* PAST */}
          {(filter === "all" || filter === "past") &&
            visiblePast.length > 0 && (
              <div>
                <SectionLabel
                  icon={History}
                  label="Past Appointments"
                  count={visiblePast.length}
                  color="bg-slate-500"
                />
                <div className="space-y-2.5">
                  {visiblePast.map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      apt={apt}
                      onGoToVisit={apt.visit ? handleGoToVisit : undefined}
                      isCurrent={apt.id === currentVisitAptId}
                    />
                  ))}
                </div>
              </div>
            )}

          {/* No past message */}
          {filter === "past" && visiblePast.length === 0 && !isLoading && (
            <div className="flex flex-col items-center py-8 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <History className="w-7 h-7 mb-2 opacity-40" />
              <p className="text-sm font-medium text-slate-500">
                No past appointments
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
