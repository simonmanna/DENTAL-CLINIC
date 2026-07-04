// src/pages/appointments/DraftAppointmentsPage.tsx
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "../../lib/api/staff-api";
import { appointmentsApi, visitsApi } from "../../lib/api";
import { cn } from "../../lib/utils";
import {
  FileText,
  Search,
  Clock,
  User,
  Stethoscope,
  Play,
  XCircle,
  CheckCircle2,
  RefreshCw,
  CalendarDays,
  Phone,
  Tag,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  Eye,
  AlertTriangle,
  CheckCheck,
  Calendar,
  ArrowUpDown,
  Pencil,
  MoreHorizontal,
  ClipboardList,
  Trash2,
} from "lucide-react";
import {
  Button,
  Modal,
  FormField,
  Select,
  LoadingSpinner,
} from "../../components/shared";
import { APPOINTMENT_TYPES } from "../../lib/utils";
import {
  format,
  formatDistanceToNow,
  parseISO,
  isToday,
  isYesterday,
  isThisWeek,
} from "date-fns";
import { toast } from "sonner";

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
    avatar?: string;
    dateOfBirth?: string;
    gender?: string;
  };
  dentist: {
    id: string;
    firstName: string;
    lastName: string;
    specialization?: string;
    avatar?: string;
  };
  visit?: {
    id: string;
    status: string;
    totalCost: number;
    amountPaid: number;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

interface Dentist {
  id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
  avatar?: string;
}

type SortField = "createdAt" | "scheduledAt" | "patient" | "dentist" | "type";
type SortDir = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const initials = (f: string, l: string) =>
  `${f?.[0] ?? ""}${l?.[0] ?? ""}`.toUpperCase();

const TYPE_COLOR: Record<
  string,
  { bg: string; border: string; text: string; pill: string }
> = {
  CONSULTATION: {
    bg: "#EFF6FF",
    border: "#3B82F6",
    text: "#1E40AF",
    pill: "bg-blue-100 text-blue-700",
  },
  CLEANING: {
    bg: "#ECFDF5",
    border: "#10B981",
    text: "#065F46",
    pill: "bg-emerald-100 text-emerald-700",
  },
  FILLING: {
    bg: "#F5F3FF",
    border: "#8B5CF6",
    text: "#5B21B6",
    pill: "bg-violet-100 text-violet-700",
  },
  EXTRACTION: {
    bg: "#FEF2F2",
    border: "#EF4444",
    text: "#991B1B",
    pill: "bg-red-100 text-red-700",
  },
  ROOT_CANAL: {
    bg: "#FFFBEB",
    border: "#F59E0B",
    text: "#92400E",
    pill: "bg-amber-100 text-amber-700",
  },
  ORTHODONTIC: {
    bg: "#ECFEFF",
    border: "#06B6D4",
    text: "#155E75",
    pill: "bg-cyan-100 text-cyan-700",
  },
  CROWN: {
    bg: "#FDF4FF",
    border: "#D946EF",
    text: "#86198F",
    pill: "bg-fuchsia-100 text-fuchsia-700",
  },
  BRIDGE: {
    bg: "#EEF2FF",
    border: "#6366F1",
    text: "#3730A3",
    pill: "bg-indigo-100 text-indigo-700",
  },
  IMPLANT: {
    bg: "#F0FDF4",
    border: "#22C55E",
    text: "#166534",
    pill: "bg-green-100 text-green-700",
  },
  WHITENING: {
    bg: "#FFFAF0",
    border: "#F97316",
    text: "#9A3412",
    pill: "bg-orange-100 text-orange-700",
  },
  EMERGENCY: {
    bg: "#FEF2F2",
    border: "#DC2626",
    text: "#7F1D1D",
    pill: "bg-red-100 text-red-800",
  },
  FOLLOW_UP: {
    bg: "#F8FAFC",
    border: "#64748B",
    text: "#334155",
    pill: "bg-slate-100 text-slate-700",
  },
  X_RAY: {
    bg: "#F0F9FF",
    border: "#0EA5E9",
    text: "#0C4A6E",
    pill: "bg-sky-100 text-sky-700",
  },
  PEDIATRIC: {
    bg: "#FDF2F8",
    border: "#EC4899",
    text: "#831843",
    pill: "bg-pink-100 text-pink-700",
  },
  OTHER: {
    bg: "#F1F5F9",
    border: "#94A3B8",
    text: "#475569",
    pill: "bg-slate-100 text-slate-600",
  },
};

function relativeDate(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return `Today ${format(d, "h:mm a")}`;
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  if (isThisWeek(d)) return format(d, "EEE h:mm a");
  return format(d, "MMM d, yyyy");
}

// ─── Sort Header Cell ─────────────────────────────────────────────────────────
function SortTh({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: SortField;
  sort: { field: SortField; dir: SortDir };
  onSort: (f: SortField) => void;
}) {
  const active = sort.field === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={cn(
        "px-4 py-3 text-left text-xs font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap group transition-colors",
        active
          ? "text-indigo-700 bg-indigo-50"
          : "text-slate-500 hover:text-slate-700 hover:bg-slate-50",
      )}
    >
      <div className="flex items-center gap-1.5">
        {label}
        <span className="opacity-100 transition-opacity">
          {active ? (
            sort.dir === "asc" ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )
          ) : (
            <ChevronsUpDown className="w-3.5 h-3.5" />
          )}
        </span>
      </div>
    </th>
  );
}

// ─── Appointment Row ──────────────────────────────────────────────────────────
function AptRow({
  apt,
  onView,
  onEdit,
  onDelete,
  selected,
}: {
  apt: Appointment;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  selected: boolean;
}) {
  const colors = TYPE_COLOR[apt.type] ?? TYPE_COLOR.OTHER;
  const scheduledDt = new Date(apt.scheduledAt);
  const isPast = scheduledDt < new Date();

  return (
    <tr
      className={cn(
        "group border-b border-slate-100 cursor-pointer transition-all duration-150",
        selected
          ? "bg-indigo-50/80 border-indigo-200"
          : isPast
            ? "bg-amber-50/30 hover:bg-amber-50/60"
            : "hover:bg-slate-50",
      )}
    >
      {/* Draft indicator stripe */}
      <td className="w-1 p-0">
        <div
          className="w-1 h-full min-h-[56px]"
          style={{ backgroundColor: colors.border }}
        />
      </td>

      {/* # / Code */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-slate-400 font-mono">
            {apt.appointmentCode}
          </span>
          {apt.isWalkIn && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded w-fit">
              Walk-in
            </span>
          )}
        </div>
      </td>

      {/* Patient */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0 shadow-sm">
            {initials(apt.patient.firstName, apt.patient.lastName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">
              {apt.patient.firstName} {apt.patient.lastName}
            </p>
            <p className="text-xs text-slate-400 font-mono">
              {apt.patient.patientCode}
            </p>
            {apt.patient.phone && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3" /> {apt.patient.phone}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Type */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
            colors.pill,
          )}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: colors.border }}
          />
          {apt.type.replace(/_/g, " ")}
        </span>
      </td>

      {/* Scheduled */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex flex-col gap-0.5">
          <span
            className={cn(
              "text-sm font-bold",
              isPast ? "text-amber-700" : "text-slate-800",
            )}
          >
            {format(scheduledDt, "MMM d, yyyy")}
          </span>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {format(scheduledDt, "h:mm a")} · {apt.duration}min
          </span>
          {isPast && (
            <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Overdue
            </span>
          )}
        </div>
      </td>

      {/* Dentist */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-700 shrink-0">
            {initials(apt.dentist.firstName, apt.dentist.lastName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">
              Dr. {apt.dentist.lastName}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {apt.dentist.specialization || "General Dentistry"}
            </p>
          </div>
        </div>
      </td>

      {/* Chief Complaint */}
      <td className="px-4 py-3.5 max-w-[180px]">
        {apt.chiefComplaint ? (
          <p
            className="text-xs text-slate-600 truncate"
            title={apt.chiefComplaint}
          >
            {apt.chiefComplaint}
          </p>
        ) : (
          <span className="text-xs text-slate-300 italic">—</span>
        )}
      </td>

      {/* Created (recency) */}
      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-400">
        {apt.createdAt ? (
          <span title={format(parseISO(apt.createdAt), "PPpp")}>
            {formatDistanceToNow(parseISO(apt.createdAt), { addSuffix: true })}
          </span>
        ) : (
          "—"
        )}
      </td>

      {/* Actions */}
      {/* Actions */}
      <td
        className="px-4 py-3.5 whitespace-nowrap"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 opacity-100 transition-opacity">
          <button
            onClick={onView}
            className="p-1.5 rounded-lg hover:bg-indigo-100 text-slate-400 hover:text-indigo-700 transition-colors"
            title="View details"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-indigo-100 text-slate-400 hover:text-indigo-700 transition-colors"
            title="Edit appointment"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {/* ── Delete ── */}
          {/* ── Delete ── */}
          <button
            onClick={(e) => {
              e.stopPropagation(); // ← Prevent event bubbling to <tr>
              onDelete();
            }}
            className="p-1.5 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
            title="Delete draft"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────
function DetailDrawer({
  apt,
  onClose,
  onEdit,
  onConfirm,
  onCancel,
  onArrive,
  onStartVisit,
  onDelete,
  loading,
}: {
  apt: Appointment;
  onClose: () => void;
  onEdit: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onArrive: () => void;
  onStartVisit: () => void;
  onDelete: () => void;
  loading: boolean;
}) {
  const colors = TYPE_COLOR[apt.type] ?? TYPE_COLOR.OTHER;
  const scheduledDt = new Date(apt.scheduledAt);
  const endDt = new Date(scheduledDt.getTime() + apt.duration * 60000);
  const isPast = scheduledDt < new Date();

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[400px] bg-white shadow-2xl border-l border-slate-200 flex flex-col">
      <div className="h-1.5 w-full" style={{ background: colors.border }} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white shadow-sm border border-slate-200">
            <FileText className="w-4 h-4 text-slate-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 font-mono">
              {apt.appointmentCode}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                DRAFT
              </span>
              {isPast && (
                <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Overdue
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Patient */}
        <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-700 shrink-0">
              {initials(apt.patient.firstName, apt.patient.lastName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900">
                {apt.patient.firstName} {apt.patient.lastName}
              </p>
              <p className="text-xs text-slate-400 font-mono">
                {apt.patient.patientCode}
              </p>
              {apt.patient.gender && (
                <p className="text-xs text-slate-400 capitalize mt-0.5">
                  {apt.patient.gender}
                </p>
              )}
            </div>
          </div>
          {apt.patient.phone && (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-200">
              <Phone className="w-4 h-4 text-slate-400" />
              <span className="font-medium">{apt.patient.phone}</span>
            </div>
          )}
        </div>

        {/* Schedule */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className={cn(
              "p-3 rounded-xl border",
              isPast
                ? "bg-amber-50 border-amber-200"
                : "bg-blue-50 border-blue-200",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-1.5 mb-1 text-xs font-bold uppercase tracking-wide",
                isPast ? "text-amber-600" : "text-blue-600",
              )}
            >
              <Clock className="w-3.5 h-3.5" /> Schedule
            </div>
            <p
              className={cn(
                "text-sm font-bold",
                isPast ? "text-amber-800" : "text-blue-800",
              )}
            >
              {format(scheduledDt, "MMM d, yyyy")}
            </p>
            <p
              className={cn(
                "text-xs",
                isPast ? "text-amber-600" : "text-blue-600",
              )}
            >
              {format(scheduledDt, "h:mm")}–{format(endDt, "h:mm a")} ·{" "}
              {apt.duration}min
            </p>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="flex items-center gap-1.5 mb-1 text-xs font-bold uppercase tracking-wide text-emerald-600">
              <Stethoscope className="w-3.5 h-3.5" /> Dentist
            </div>
            <p className="text-sm font-bold text-emerald-800">
              Dr. {apt.dentist.lastName}
            </p>
            <p className="text-xs text-emerald-600">
              {apt.dentist.specialization || "General Dentistry"}
            </p>
          </div>
        </div>

        {/* Type */}
        <div
          className="flex items-center gap-3 p-3 rounded-xl border"
          style={{
            backgroundColor: colors.bg,
            borderColor: colors.border + "60",
          }}
        >
          <div className="p-2 rounded-lg bg-white/80 shadow-sm">
            <Tag className="w-4 h-4" style={{ color: colors.text }} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
              Appointment Type
            </p>
            <p className="text-sm font-bold" style={{ color: colors.text }}>
              {apt.type.replace(/_/g, " ")}
            </p>
          </div>
        </div>

        {/* Chief Complaint */}
        {apt.chiefComplaint && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">
              Chief Complaint
            </p>
            <p className="text-sm text-amber-900 leading-relaxed">
              {apt.chiefComplaint}
            </p>
          </div>
        )}

        {/* Notes */}
        {apt.notes && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
              Notes
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              {apt.notes}
            </p>
          </div>
        )}

        {/* Created / Updated */}
        {apt.createdAt && (
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Created{" "}
              {formatDistanceToNow(parseISO(apt.createdAt), {
                addSuffix: true,
              })}
            </span>
            {apt.updatedAt && apt.updatedAt !== apt.createdAt && (
              <span>
                Updated{" "}
                {formatDistanceToNow(parseISO(apt.updatedAt), {
                  addSuffix: true,
                })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/80 space-y-2">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200 disabled:opacity-50"
        >
          {loading ? <LoadingSpinner /> : <CheckCircle2 className="w-4 h-4" />}
          Confirm Appointment
        </button>
        <button
          onClick={onArrive}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50"
        >
          <User className="w-4 h-4" />
          Mark as Arrived
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-red-600 text-sm font-medium hover:bg-red-50 transition-colors border border-transparent hover:border-red-200"
        >
          <XCircle className="w-4 h-4" /> Cancel Appointment
        </button>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
const EDITABLE_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "CONFIRMED",
  "ARRIVED",
  "RESCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

const STATUS_CFG: Record<
  string,
  { label: string; bg: string; text: string; dot: string; border: string }
> = {
  DRAFT: {
    label: "Draft",
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
    border: "border-slate-300",
  },
  SCHEDULED: {
    label: "Scheduled",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
    border: "border-blue-200",
  },
  CONFIRMED: {
    label: "Confirmed",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
    border: "border-indigo-200",
  },
  ARRIVED: {
    label: "Arrived",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    border: "border-amber-200",
  },
  IN_PROGRESS: {
    label: "In Progress",
    bg: "bg-purple-50",
    text: "text-purple-700",
    dot: "bg-purple-500",
    border: "border-purple-200",
  },
  COMPLETED: {
    label: "Completed",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    border: "border-emerald-200",
  },
  CANCELLED: {
    label: "Cancelled",
    bg: "bg-red-50",
    text: "text-red-600",
    dot: "bg-red-500",
    border: "border-red-200",
  },
  NO_SHOW: {
    label: "No Show",
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
    border: "border-slate-200",
  },
  RESCHEDULED: {
    label: "Rescheduled",
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-500",
    border: "border-orange-200",
  },
};

function EditModal({
  open,
  apt,
  onClose,
  onSave,
  dentists,
  loading,
}: {
  open: boolean;
  apt: Appointment | null;
  onClose: () => void;
  onSave: (id: string, data: any) => void;
  dentists: Dentist[];
  loading: boolean;
}) {
  const [form, setForm] = useState<any>(null);

  useState(() => {
    if (open && apt) {
      const dt = new Date(apt.scheduledAt);
      setForm({
        dentistId: apt.dentistId,
        type: apt.type,
        date: format(dt, "yyyy-MM-dd"),
        time: format(dt, "HH:mm"),
        scheduledAt: apt.scheduledAt,
        duration: apt.duration,
        chiefComplaint: apt.chiefComplaint ?? "",
        notes: apt.notes ?? "",
        isWalkIn: apt.isWalkIn,
        status: apt.status,
      });
    }
  });

  // Re-seed when apt changes
  const [seedKey, setSeedKey] = useState("");
  if (open && apt && seedKey !== apt.id) {
    setSeedKey(apt.id);
    const dt = new Date(apt.scheduledAt);
    setForm({
      dentistId: apt.dentistId,
      type: apt.type,
      date: format(dt, "yyyy-MM-dd"),
      time: format(dt, "HH:mm"),
      scheduledAt: apt.scheduledAt,
      duration: apt.duration,
      chiefComplaint: apt.chiefComplaint ?? "",
      notes: apt.notes ?? "",
      isWalkIn: apt.isWalkIn,
      status: apt.status,
    });
  }

  if (!open || !apt || !form) return null;
  const p = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    const scheduledAt =
      date && form.time ? `${date}T${form.time}:00` : form.scheduledAt;
    setForm((f: any) => ({ ...f, date, scheduledAt }));
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = e.target.value;
    const scheduledAt =
      form.date && time ? `${form.date}T${time}:00` : form.scheduledAt;
    setForm((f: any) => ({ ...f, time, scheduledAt }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { date, time, ...rest } = form;
    onSave(apt.id, rest);
  };

  const colors = TYPE_COLOR[form.type] ?? TYPE_COLOR.OTHER;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit Draft · ${apt.appointmentCode}`}
      width="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Status pills */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
            Status
          </p>
          <div className="flex flex-wrap gap-2">
            {EDITABLE_STATUSES.map((s) => {
              const cfg = STATUS_CFG[s];
              const active = form.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => p("status", s)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                    active
                      ? `${cfg.bg} ${cfg.text} ${cfg.border} shadow-sm ring-2 ring-offset-1 ring-slate-300`
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      active ? cfg.dot : "bg-slate-300",
                    )}
                  />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Patient (locked) */}
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
            {initials(apt.patient.firstName, apt.patient.lastName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900">
              {apt.patient.firstName} {apt.patient.lastName}
            </p>
            <p className="text-xs text-slate-400 font-mono">
              {apt.patient.patientCode}
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
            Locked
          </span>
        </div>

        {/* Dentist + Type */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Dentist" required>
            <Select
              value={form.dentistId}
              onChange={(e) => p("dentistId", e.target.value)}
              required
              className="w-full"
            >
              <option value="">Select dentist…</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.firstName} {d.lastName}
                  {d.specialization ? ` — ${d.specialization}` : ""}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Appointment Type">
            <Select
              value={form.type}
              onChange={(e) => p("type", e.target.value)}
              className="w-full"
            >
              {APPOINTMENT_TYPES.map((t: any) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        {/* Date + Time + Duration */}
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Date" required>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={form.date}
                onChange={handleDateChange}
                required
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </FormField>
          <FormField label="Time" required>
            <div className="relative">
              <Clock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="time"
                value={form.time}
                onChange={handleTimeChange}
                required
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </FormField>
          <FormField label="Duration">
            <Select
              value={form.duration}
              onChange={(e) => p("duration", +e.target.value)}
              className="w-full"
            >
              {[15, 20, 30, 45, 60, 90, 120].map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        {/* Preview */}
        {form.scheduledAt && (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
            style={{
              backgroundColor: colors.bg,
              borderColor: colors.border + "60",
            }}
          >
            <CheckCircle2
              className="w-4 h-4 shrink-0"
              style={{ color: colors.text }}
            />
            <div>
              <p className="text-xs font-bold" style={{ color: colors.text }}>
                {format(new Date(form.scheduledAt), "EEEE, MMMM d, yyyy")}
              </p>
              <p className="text-xs opacity-75" style={{ color: colors.text }}>
                {format(new Date(form.scheduledAt), "h:mm a")} · {form.duration}{" "}
                min · {form.type.replace(/_/g, " ")}
              </p>
            </div>
          </div>
        )}

        {/* Walk-in */}
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={form.isWalkIn}
            onChange={(e) => p("isWalkIn", e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Walk-in appointment
            </p>
            <p className="text-xs text-slate-400">
              Patient arrived without a prior booking
            </p>
          </div>
        </label>

        {/* Complaint + Notes */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Chief Complaint">
            <input
              type="text"
              value={form.chiefComplaint}
              onChange={(e) => p("chiefComplaint", e.target.value)}
              placeholder="Reason for visit…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </FormField>
          <FormField label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => p("notes", e.target.value)}
              rows={2}
              placeholder="Additional notes…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button
            variant="outline"
            type="button"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={loading}
            disabled={!form.dentistId || !form.scheduledAt || loading}
            className="bg-indigo-600 hover:bg-indigo-700 min-w-[120px]"
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function DraftAppointmentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterDentist, setFilterDentist] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "createdAt",
    dir: "desc",
  });

  // Fetch DRAFT appointments only
  const {
    data: calData,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["drafts", filterDentist],
    queryFn: () =>
      appointmentsApi.getAll({
        status: "DRAFT",
        dentistId: filterDentist === "all" ? undefined : filterDentist,
        limit: 500,
      }),
    refetchInterval: 60_000,
  });

  const { data: dentists = [] } = useQuery({
    queryKey: ["dentists"],
    queryFn: staffApi.getDentists,
  });

  const raw: Appointment[] = calData?.data || [];

  // Client-side filter + sort
  const appointments = useMemo(() => {
    let list = raw.filter((a) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        `${a.patient.firstName} ${a.patient.lastName}`
          .toLowerCase()
          .includes(q) ||
        a.patient.patientCode.toLowerCase().includes(q) ||
        a.appointmentCode.toLowerCase().includes(q) ||
        (a.patient.phone || "").includes(q);
      const matchType = filterType === "all" || a.type === filterType;
      return matchSearch && matchType;
    });

    list.sort((a, b) => {
      let va: any, vb: any;
      if (sort.field === "createdAt") {
        va = a.createdAt || a.scheduledAt;
        vb = b.createdAt || b.scheduledAt;
      } else if (sort.field === "scheduledAt") {
        va = a.scheduledAt;
        vb = b.scheduledAt;
      } else if (sort.field === "patient") {
        va = `${a.patient.lastName}${a.patient.firstName}`;
        vb = `${b.patient.lastName}${b.patient.firstName}`;
      } else if (sort.field === "dentist") {
        va = a.dentist.lastName;
        vb = b.dentist.lastName;
      } else if (sort.field === "type") {
        va = a.type;
        vb = b.type;
      }
      const cmp =
        typeof va === "string"
          ? va.localeCompare(vb)
          : va < vb
            ? -1
            : va > vb
              ? 1
              : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [raw, search, filterType, sort]);

  const overdueCount = appointments.filter(
    (a) => new Date(a.scheduledAt) < new Date(),
  ).length;

  const toggleSort = (field: SortField) => {
    setSort((s) =>
      s.field === field
        ? { field, dir: s.dir === "asc" ? "desc" : "asc" }
        : { field, dir: field === "createdAt" ? "desc" : "asc" },
    );
  };

  // Mutations
  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      appointmentsApi.update(id, { status: "CONFIRMED" as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      setSelectedApt(null);
      toast.success("Appointment confirmed");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const arriveMutation = useMutation({
    mutationFn: (id: string) => appointmentsApi.arrive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      setSelectedApt(null);
      toast.success("Marked as arrived");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      appointmentsApi.cancel(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      setSelectedApt(null);
      toast.success("Appointment cancelled");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      appointmentsApi.update(id, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      setSelectedApt(updated);
      setShowEdit(false);
      toast.success("Appointment updated");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => appointmentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      setSelectedApt(null);
      toast.success("Draft appointment deleted");
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || "Failed to delete"),
  });

  const handleDelete = () => {
    if (!selectedApt) return;
    if (
      !window.confirm(
        `Delete draft ${selectedApt.appointmentCode} for ${selectedApt.patient.firstName} ${selectedApt.patient.lastName}? This cannot be undone.`,
      )
    )
      return;
    deleteMutation.mutate(selectedApt.id);
  };

  const createVisitMutation = useMutation({
    mutationFn: ({
      appointmentId,
      dentistId,
    }: {
      appointmentId: string;
      dentistId: string;
    }) => visitsApi.create({ appointmentId, dentistId }),
    onSuccess: (data) => {
      navigate(`/visits/${data.id}`);
      setSelectedApt(null);
      toast.success("Visit started");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed"),
  });

  const handleCancel = () => {
    if (!selectedApt) return;
    const reason = window.prompt("Reason for cancellation:");
    if (reason?.trim())
      cancelMutation.mutate({ id: selectedApt.id, reason: reason.trim() });
  };

  const handleStartVisit = () => {
    if (!selectedApt) return;
    if (selectedApt.visit) {
      navigate(`/visits/${selectedApt.visit.id}`);
      setSelectedApt(null);
    } else
      createVisitMutation.mutate({
        appointmentId: selectedApt.id,
        dentistId: selectedApt.dentistId,
      });
  };

  const isActionLoading =
    confirmMutation.isPending ||
    arriveMutation.isPending ||
    cancelMutation.isPending ||
    createVisitMutation.isPending ||
    deleteMutation.isPending;

  const uniqueTypes = [...new Set(raw.map((a) => a.type))].sort();

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] bg-slate-50 overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0 shadow-sm">
        {/* Title */}
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-slate-100 rounded-lg">
            <ClipboardList className="w-4 h-4 text-slate-600" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-none">
              Draft Appointments
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Pending review & confirmation
            </p>
          </div>
        </div>

        {/* Count badges */}
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full border border-slate-200">
            {appointments.length} draft{appointments.length !== 1 ? "s" : ""}
          </span>
          {overdueCount > 0 && (
            <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full border border-amber-200 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {overdueCount} overdue
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient, code, phone…"
            className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dentist filter */}
        <div className="relative">
          <Filter className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <select
            value={filterDentist}
            onChange={(e) => setFilterDentist(e.target.value)}
            className="pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-indigo-300 focus:outline-none font-medium"
          >
            <option value="all">All Dentists</option>
            {dentists.map((d: Dentist) => (
              <option key={d.id} value={d.id}>
                Dr. {d.lastName}
              </option>
            ))}
          </select>
        </div>

        {/* Type filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-indigo-300 focus:outline-none font-medium"
        >
          <option value="all">All Types</option>
          {uniqueTypes.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        {/* Refresh */}
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["drafts"] })}
          className={cn(
            "p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors border border-transparent hover:border-slate-200",
            isFetching && "animate-spin",
          )}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <LoadingSpinner />
              <p className="text-sm text-slate-400">
                Loading draft appointments…
              </p>
            </div>
          </div>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
            <div className="p-6 bg-slate-100 rounded-full">
              <FileText className="w-12 h-12 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-500">
                No draft appointments
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {search || filterType !== "all" || filterDentist !== "all"
                  ? "Try adjusting your filters"
                  : "All appointments are confirmed or scheduled"}
              </p>
            </div>
            {(search || filterType !== "all" || filterDentist !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilterType("all");
                  setFilterDentist("all");
                }}
                className="px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-white border-b-2 border-slate-200 shadow-sm">
              <tr>
                <th className="w-1 p-0" />
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                  Code
                </th>
                <SortTh
                  label="Patient"
                  field="patient"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortTh
                  label="Type"
                  field="type"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortTh
                  label="Scheduled"
                  field="scheduledAt"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortTh
                  label="Dentist"
                  field="dentist"
                  sort={sort}
                  onSort={toggleSort}
                />
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  Chief Complaint
                </th>
                <SortTh
                  label="Created"
                  field="createdAt"
                  sort={sort}
                  onSort={toggleSort}
                />
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 w-16">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((apt) => (
                <AptRow
                  key={apt.id}
                  apt={apt}
                  selected={selectedApt?.id === apt.id}
                  onView={() => setSelectedApt(apt)}
                  onEdit={() => {
                    setSelectedApt(apt);
                    setShowEdit(true);
                  }}
                  onDelete={() => {
                    // Confirm first
                    if (
                      !window.confirm(
                        `Delete draft ${apt.appointmentCode} for ${apt.patient.firstName} ${apt.patient.lastName}? This cannot be undone.`,
                      )
                    )
                      return;
                    // Delete directly without opening drawer
                    deleteMutation.mutate(apt.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer count ── */}
      {!isLoading && appointments.length > 0 && (
        <div className="bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-400">
            Showing{" "}
            <span className="font-bold text-slate-600">
              {appointments.length}
            </span>{" "}
            of <span className="font-bold text-slate-600">{raw.length}</span>{" "}
            draft appointments
          </span>
          <span className="text-xs text-slate-400">
            Sorted by{" "}
            <span className="font-semibold text-slate-600 capitalize">
              {sort.field === "createdAt" ? "date created" : sort.field}
            </span>{" "}
            ({sort.dir === "desc" ? "newest first" : "oldest first"})
          </span>
        </div>
      )}

      {/* ── Detail Drawer ── */}
      {selectedApt && !showEdit && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
            onClick={() => setSelectedApt(null)}
          />
          <DetailDrawer
            apt={selectedApt}
            onClose={() => setSelectedApt(null)}
            onEdit={() => setShowEdit(true)}
            onConfirm={() => confirmMutation.mutate(selectedApt.id)}
            onArrive={() => arriveMutation.mutate(selectedApt.id)}
            onCancel={handleCancel}
            onStartVisit={handleStartVisit}
            onDelete={handleDelete}
            loading={isActionLoading}
          />
        </>
      )}

      {/* ── Edit Modal ── */}
      <EditModal
        open={showEdit}
        apt={selectedApt}
        onClose={() => setShowEdit(false)}
        onSave={(id, data) => editMutation.mutate({ id, data })}
        dentists={dentists}
        loading={editMutation.isPending}
      />
    </div>
  );
}
