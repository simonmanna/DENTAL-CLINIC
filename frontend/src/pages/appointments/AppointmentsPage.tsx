// src/pages/appointments/AppointmentsPage.tsx
import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "../../lib/api/staff-api";
import { appointmentsApi, patientsApi, visitsApi } from "../../lib/api";
import { useAuthStore } from "../../store/auth.store";

import { cn } from "../../lib/utils";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Clock,
  User,
  Stethoscope,
  Play,
  XCircle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  CalendarDays,
  Phone,
  FileText,
  X,
  MapPin,
  Tag,
  MoreHorizontal,
  Filter,
  CheckCheck,
  CalendarPlus,
} from "lucide-react";
import {
  Button,
  Modal,
  FormField,
  Input,
  Select,
  LoadingSpinner,
} from "../../components/shared";
import { APPOINTMENT_TYPES } from "../../lib/utils";
import {
  format,
  addDays,
  startOfWeek,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns";
import { toast } from "sonner";

function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "outline" | "secondary" | "destructive";
  className?: string;
}) {
  const variants = {
    default: "bg-foreground text-background hover:bg-foreground/80",
    outline:
      "border border-border bg-white text-foreground hover:bg-muted",
    secondary: "bg-muted text-foreground hover:bg-muted/80",
    destructive: "bg-danger text-danger-foreground hover:bg-danger/90",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
// ─── Types ────────────────────────────────────────────────────────────────────
export interface Appointment {
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

export interface Dentist {
  id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
  avatar?: string;
  schedules?: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isWorking: boolean;
  }[];
}

// ─── Config ───────────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8am–8pm
const HOUR_H = 72; // Slightly taller for better readability

// AdminLTE-inspired Status Configuration
export const STATUS_CFG: Record<
  string,
  {
    label: string;
    bg: string;
    text: string;
    dot: string;
    border: string;
    icon: React.ReactNode;
  }
> = {
  SCHEDULED: {
    label: "Scheduled",
    bg: "bg-primary-muted/60",
    text: "text-primary",
    dot: "bg-primary",
    border: "border-primary/25",
    icon: <Calendar className="w-3 h-3" />,
  },
  CONFIRMED: {
    label: "Confirmed",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
    border: "border-indigo-200",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  ARRIVED: {
    label: "ARRIVED",
    bg: "bg-warning-muted/60",
    text: "text-warning",
    dot: "bg-warning",
    border: "border-warning/25",
    icon: <User className="w-3 h-3" />,
  },
  IN_PROGRESS: {
    label: "In Progress",
    bg: "bg-purple-50",
    text: "text-purple-700",
    dot: "bg-purple-500",
    border: "border-purple-200",
    icon: <Play className="w-3 h-3" />,
  },
  COMPLETED: {
    label: "Completed",
    bg: "bg-success-muted/60",
    text: "text-success",
    dot: "bg-success",
    border: "border-success/25",
    icon: <CheckCheck className="w-3 h-3" />,
  },
  CANCELLED: {
    label: "Cancelled",
    bg: "bg-danger-muted/60",
    text: "text-danger",
    dot: "bg-danger",
    border: "border-danger/25",
    icon: <XCircle className="w-3 h-3" />,
  },
  NO_SHOW: {
    label: "No Show",
    bg: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/70",
    border: "border-border",
    icon: <AlertCircle className="w-3 h-3" />,
  },
  RESCHEDULED: {
    label: "Rescheduled",
    bg: "bg-warning-muted/60",
    text: "text-warning",
    dot: "bg-warning",
    border: "border-warning/25",
    icon: <RefreshCw className="w-3 h-3" />,
  },
  DRAFT: {
    label: "Draft",
    bg: "bg-warning",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/70",
    border: "border-input",
    icon: <FileText className="w-3 h-3" />, // ← add FileText to lucide imports
  },
};

export const initials = (f: string, l: string) =>
  `${f?.[0] ?? ""}${l?.[0] ?? ""}`.toUpperCase();
const aptTop = (dt: string) => {
  const d = new Date(dt);
  return (d.getHours() - 8) * HOUR_H + (d.getMinutes() / 60) * HOUR_H;
};
const aptH = (dur: number) => Math.max((dur / 60) * HOUR_H, 48); // Minimum height for visibility

// ─── StatusBadge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.SCHEDULED;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border",
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
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

// Professional Medical Color Palette - ADD THIS if not already defined
export const TYPE_COLOR: Record<string, { bg: string; border: string; text: string }> =
  {
    CONSULTATION: { bg: "#EFF6FF", border: "#3B82F6", text: "#1E40AF" },
    CLEANING: { bg: "#ECFDF5", border: "#10B981", text: "#065F46" },
    FILLING: { bg: "#F5F3FF", border: "#8B5CF6", text: "#5B21B6" },
    EXTRACTION: { bg: "#FEF2F2", border: "#EF4444", text: "#991B1B" },
    ROOT_CANAL: { bg: "#FFFBEB", border: "#F59E0B", text: "#92400E" },
    ORTHODONTIC: { bg: "#ECFEFF", border: "#06B6D4", text: "#155E75" },
    CROWN: { bg: "#FDF4FF", border: "#D946EF", text: "#86198F" },
    BRIDGE: { bg: "#EEF2FF", border: "#6366F1", text: "#3730A3" },
    IMPLANT: { bg: "#F0FDF4", border: "#22C55E", text: "#166534" },
    WHITENING: { bg: "#FFFAF0", border: "#F97316", text: "#9A3412" },
    EMERGENCY: { bg: "#FEF2F2", border: "#DC2626", text: "#7F1D1D" },
    FOLLOW_UP: { bg: "#F8FAFC", border: "#64748B", text: "#334155" },
    X_RAY: { bg: "#F0F9FF", border: "#0EA5E9", text: "#0C4A6E" },
    PEDIATRIC: { bg: "#FDF2F8", border: "#EC4899", text: "#831843" },
    OTHER: { bg: "#F1F5F9", border: "#94A3B8", text: "#475569" },
  };

// ─── Enhanced Calendar Appointment Card with Type Colors ─────────────────────
function AptCard({
  apt,
  onClick,
  style,
}: {
  apt: Appointment;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  const colors = TYPE_COLOR[apt.type] ?? TYPE_COLOR.OTHER;
  const cfg = STATUS_CFG[apt.status] ?? STATUS_CFG.SCHEDULED;
  const h = aptH(apt.duration);
  const isTiny = h < 56;
  const startTime = new Date(apt.scheduledAt);
  const endTime = new Date(startTime.getTime() + apt.duration * 60000);

  // Calculate age if available
  const age = apt.patient.dateOfBirth
    ? Math.floor(
        (Date.now() - new Date(apt.patient.dateOfBirth).getTime()) /
          31557600000,
      )
    : null;

  return (
    <div
      onClick={onClick}
      style={{
        ...style,
        backgroundColor: colors.bg,
        borderLeftWidth: "2px",
        borderLeftColor: colors.border,
        borderTop: "1px solid " + colors.border + "40", // 25% opacity
        borderRight: "1px solid " + colors.border + "40",
        borderBottom: "1px solid " + colors.border + "40",
      }}
      className={cn(
        "absolute left-0.5 right-0 rounded-r-md rounded-l-sm px-0.5 py-0 cursor-pointer select-none overflow-hidden",
        "transition-all duration-200 hover:shadow-lg hover:z-20 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]",
      )}
    >
      {/* Header: Patient Name, Status, and Time with Type-Colored Background */}
      <div className="flex items-start justify-between gap-0 min-w-0">
        <div className="flex items-start gap-0 min-w-0 flex-1">
          {/* Initials Avatar with type color */}

          <div className="min-w-0 flex-1">
            {/* Patient Name */}
            <p className="text-xs font-semibold truncate leading-tight text-foreground">
              {apt.patient.firstName} {apt.patient.lastName}
            </p>

            {/* Status Badge + Time Row */}
            <div className="flex items-left gap-0 mt-0">
              {/* Status Label - Small pill */}
              <span
                className="text-[9px] font-bold px-0 py-0.5 rounded-sm uppercase tracking-wider"
                style={{
                  backgroundColor: cfg.bg
                    .replace("bg-", "")
                    .replace("50", "100"), // Convert to solid color
                  color: cfg.text.replace("text-", "").replace("700", "800"),
                }}
              >
                {cfg.label}
              </span>

              {/* Time */}
              <span className="text-[9px] text-muted-foreground font-bold flex items-center px-1">
                <Clock className="w-2.5 h-2.5 mr-1" />
                {format(startTime, "h:mm a")}
              </span>
            </div>
          </div>
        </div>

        {/* Status Dot */}
        <span className={cn("w-2 h-2 rounded-full shrink-0 mt-0.5", cfg.dot)} />
      </div>

      {/* Type Label - Prominent */}
      {/* {!isTiny && ( */}
      <div className="flex items-center gap-1 mb-1">
        {/* <Tag className="w-3 h-3 shrink-0" style={{ color: colors.border }} /> */}
        <span
          className="text-[10px] font-bold truncate uppercase tracking-wide"
          style={{ color: colors.text }}
        >
          {apt.type.replace(/_/g, " ")} |{" "}
          <span className="truncate font-medium">
            Dr. {apt.dentist.firstName}
          </span>
        </span>
      </div>
      {/* )} */}

      {/* Doctor Row */}
      {/* {h > 60 && ( */}
      {/* <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mb-1">
          <Stethoscope className="w-3 h-3 shrink-0" style={{ color: colors.border }} />
          <span className="truncate font-medium">Dr. {apt.dentist.lastName}</span>
        </div> */}
      {/* )} */}

      {/* Time Range - Show duration */}
      {h > 72 && (
        <div className="flex items-center gap-1 text-[9px] font-medium mt-auto pt-1 border-t border-black/5">
          <span style={{ color: colors.text }}>
            {format(startTime, "h:mm")}–{format(endTime, "h:mm a")}
          </span>
          <span className="text-muted-foreground/70">· {apt.duration}min</span>
        </div>
      )}

      {/* Walk-in Badge */}
      {apt.isWalkIn && h > 48 && (
        <div className="absolute top-1 right-1">
          <span className="text-[7px] font-bold px-1 py-0.5 bg-white/80 text-foreground rounded border border-border shadow-sm">
            WALK-IN
          </span>
        </div>
      )}
    </div>
  );
}
// ─── Now Indicator ─────────────────────────────────────────────────────────────
function NowLine() {
  const now = new Date();
  const h = now.getHours(),
    m = now.getMinutes();
  if (h < 8 || h >= 20) return null;
  const top = (h - 8) * HOUR_H + (m / 60) * HOUR_H;
  return (
    <div
      className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
      style={{ top }}
    >
      <div className="w-3 h-3 rounded-full bg-danger ring-2 ring-white shadow-sm ml-2 shrink-0 animate-pulse" />
      <div className="flex-1 h-0.5 bg-gradient-to-r from-danger/80 to-transparent" />
      <span className="text-[12px] font-bold text-danger bg-white px-1.5 py-0 rounded shadow-sm -ml-2">
        Now
      </span>
    </div>
  );
}

// ─── Appointment Drawer ────────────────────────────────────────────────────────
// Replace the AptDrawer signature
export function AptDrawer({
  apt,
  onClose,
  onArrive,
  onStartVisit,
  onCancel,
  onConfirm,
  onEdit,
  onDelete,
  loading,
}: {
  apt: Appointment;
  onClose: () => void;
  onArrive: () => void;
  onStartVisit: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onEdit: () => void; // ← new
  onDelete: () => void;
  loading: boolean;
}) {
  const colors = TYPE_COLOR[apt.type] ?? TYPE_COLOR.OTHER;
  const cfg = STATUS_CFG[apt.status] ?? STATUS_CFG.SCHEDULED;
  const age = apt.patient.dateOfBirth
    ? Math.floor(
        (Date.now() - new Date(apt.patient.dateOfBirth).getTime()) /
          31557600000,
      )
    : null;

  const startTime = new Date(apt.scheduledAt);
  const endTime = new Date(startTime.getTime() + apt.duration * 60000);

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[420px] bg-white shadow-2xl border-l border-border flex flex-col overflow-hidden">
      {/* Colored top accent */}
      <div className="h-1.5 w-full" style={{ background: colors.border }} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white shadow-sm border border-border">
            <CalendarDays className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              {apt.appointmentCode}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={apt.status} small />
              {apt.isWalkIn && (
                <span className="text-[10px] font-bold text-warning px-1.5 py-0.5 bg-warning-muted/60 rounded border border-warning/20">
                  WALK-IN
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ← Edit + Close buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition-colors"
          >
            {/* Use the Pencil icon — add to imports */}
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Edit
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground/70" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Patient Card */}
          <div className="bg-gradient-to-br from-muted/50 to-white rounded-xl p-4 border border-border shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-lg font-bold text-indigo-700 shrink-0 shadow-inner">
                {initials(apt.patient.firstName, apt.patient.lastName)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground text-lg">
                  {apt.patient.firstName} {apt.patient.lastName}
                  {age !== null && (
                    <span className="text-sm text-muted-foreground/70 font-normal ml-2">
                      ({age}y)
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground font-medium">
                  {apt.patient.patientCode}
                </p>
                {apt.patient.gender && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5 capitalize">
                    {apt.patient.gender}
                  </p>
                )}
              </div>
            </div>

            {apt.patient.phone && (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground bg-white rounded-lg px-3 py-2 border border-border">
                <Phone className="w-4 h-4 text-muted-foreground/70" />
                <span className="font-medium">{apt.patient.phone}</span>
              </div>
            )}
          </div>

          {/* Appointment Details Grid */}
          <div className="grid grid-cols-2 gap-3">
            <DetailCard
              icon={<Clock className="w-4 h-4" />}
              label="Time"
              value={format(startTime, "h:mm a")}
              subValue={`${format(startTime, "EEE, MMM d")} · ${apt.duration}min`}
              color="blue"
            />
            <DetailCard
              icon={<Stethoscope className="w-4 h-4" />}
              label="Dentist"
              value={`Dr. ${apt.dentist.firstName}`}
              subValue={apt.dentist.specialization || "General Dentistry"}
              color="emerald"
            />
          </div>

          {/* Type & Complaint */}
          <div className="space-y-3">
            <div
              className="flex items-center gap-2 p-3 rounded-lg border"
              style={{ backgroundColor: colors.bg, borderColor: colors.border }}
            >
              <div className="p-1.5 rounded-md bg-white/80">
                <Tag className="w-4 h-4" style={{ color: colors.text }} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Type
                </p>
                <p className="text-sm font-bold" style={{ color: colors.text }}>
                  {apt.type.replace(/_/g, " ")}
                </p>
              </div>
            </div>

            {apt.chiefComplaint && (
              <div className="p-3 rounded-lg bg-warning-muted/60 border border-warning/25">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-warning" />
                  <p className="text-xs font-bold text-warning uppercase tracking-wide">
                    Chief Complaint
                  </p>
                </div>
                <p className="text-sm text-warning leading-relaxed">
                  {apt.chiefComplaint}
                </p>
              </div>
            )}
          </div>

          {/* Visit Status */}
          {apt.visit && (
            <div className="p-4 bg-success-muted/60 rounded-xl border border-success/25">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-success-muted rounded-md">
                    <Stethoscope className="w-4 h-4 text-success" />
                  </div>
                  <span className="text-sm font-bold text-success">
                    Active Visit
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="border-success/30 text-success"
                >
                  {apt.visit.status.replace(/_/g, " ")}
                </Badge>
              </div>
              {apt.visit.totalCost > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-success">Total Cost</span>
                  <span className="font-bold text-success">
                    UGX {apt.visit.totalCost.toLocaleString()}
                  </span>
                </div>
              )}
              {apt.visit.amountPaid > 0 && (
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-success">Amount Paid</span>
                  <span className="font-bold text-success">
                    UGX {apt.visit.amountPaid.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {apt.notes && (
            <div className="p-3 bg-muted/50 rounded-xl border border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">
                Notes
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                {apt.notes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border bg-muted/80 space-y-2">
        {["SCHEDULED", "RESCHEDULED"].includes(apt.status) && (
          <button
            onClick={onConfirm}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-colors disabled:opacity-50 border border-indigo-200"
          >
            <CheckCircle2 className="w-4 h-4" />
            Confirm Appointment
          </button>
        )}

        {["SCHEDULED", "CONFIRMED", "RESCHEDULED"].includes(apt.status) && (
          <button
            onClick={onArrive}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary transition-colors shadow-md shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <LoadingSpinner /> : <User className="w-4 h-4" />}
            {loading ? "Arriving…" : "Patient Arrived"}
          </button>
        )}

        {apt.status === "ARRIVED" && !apt.visit && (
          <button
            onClick={onStartVisit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-success text-white text-sm font-bold hover:bg-success transition-colors shadow-md shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <LoadingSpinner /> : <Play className="w-4 h-4" />}
            {loading ? "Starting Visit…" : "Start Visit"}
          </button>
        )}

        {apt.visit && ["ARRIVED", "IN_PROGRESS"].includes(apt.visit.status) && (
          <button
            onClick={onStartVisit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-colors shadow-md shadow-purple-200 disabled:opacity-50"
          >
            <Stethoscope className="w-4 h-4" />
            {loading ? "Loading…" : "Continue Visit"}
          </button>
        )}

        {["SCHEDULED", "CONFIRMED", "ARRIVED", "RESCHEDULED"].includes(
          apt.status,
        ) &&
          !apt.visit && (
            <button
              onClick={onCancel}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-danger text-sm font-medium hover:bg-danger-muted/60 transition-colors disabled:opacity-50 border border-transparent hover:border-danger/25"
            >
              <XCircle className="w-4 h-4" />
              Cancel Appointment
            </button>
          )}

        {/* Delete button — only show when no visit and status allows it */}
        {!apt.visit &&
          [
            "SCHEDULED",
            "CONFIRMED",
            "CANCELLED",
            "NO_SHOW",
            "DRAFT",
            "RESCHEDULED",
          ].includes(apt.status) && (
            <button
              onClick={onDelete}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-danger text-sm font-medium hover:bg-danger-muted/60 transition-colors disabled:opacity-50 border border-transparent hover:border-danger/25"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete Appointment
            </button>
          )}
      </div>
    </div>
  );
}

function DetailCard({
  icon,
  label,
  value,
  subValue,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-primary-muted/60 border-primary/25 text-primary",
    emerald: "bg-success-muted/60 border-success/25 text-success",
    amber: "bg-warning-muted/60 border-warning/25 text-warning",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
  };

  return (
    <div
      className={cn(
        "p-3 rounded-lg border",
        colorClasses[color] || colorClasses.blue,
      )}
    >
      <div className="flex items-center gap-2 mb-1 opacity-80">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-sm font-bold truncate">{value}</p>
      <p className="text-xs opacity-75 truncate">{subValue}</p>
    </div>
  );
}

// ─── Book Modal ────────────────────────────────────────────────────────────────
interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  patientCode: string;
  phone?: string;
  dateOfBirth?: string;
  avatar?: string;
  gender?: string;
}

const EMPTY_FORM = {
  patientId: "",
  dentistId: "",
  type: "CONSULTATION",
  date: "",
  time: "",
  scheduledAt: "",
  duration: 30,
  chiefComplaint: "",
  notes: "",
  isWalkIn: false,
};

export function BookModal({
  open,
  onClose,
  onBook,
  dentists,
  defaultPatientId,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onBook: (data: any) => void;
  dentists: Dentist[];
  defaultPatientId?: string;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    patientId: defaultPatientId || "",
  });
  const [patientSearch, setPatientSearch] = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  // Inside your component, after all useState declarations
  useEffect(() => {
    if (open) {
      setInputFocused(false);
      setPatientSearch("");
      // Optionally clear selected patient if you want a fresh start:
      // p('patientId', '');
    }
  }, [open]);

  // Reset every time modal opens
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, patientId: defaultPatientId || "" });
      setPatientSearch("");
    }
  }, [open, defaultPatientId]);

  const p = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // ── Patients ──────────────────────────────────────────────────────────────
  const { data: patientsData = [], isLoading: patientsLoading } = useQuery({
    queryKey: ["patients", patientSearch],
    queryFn: () =>
      patientsApi.getAll({ search: patientSearch || undefined, limit: 50 }),
    enabled: open,
  });

  const patients: Patient[] = (patientsData as any)?.data || patientsData || [];
  // A just-registered patient (opened via ?patientId=) may not be in the first
  // page of search results — fetch it directly so it shows as selected.
  const listedPatient = patients.find((pt) => pt.id === form.patientId);
  const { data: fetchedPatient } = useQuery<Patient>({
    queryKey: ["patient", form.patientId],
    queryFn: () => patientsApi.getById(form.patientId),
    enabled: open && !!form.patientId && !patientsLoading && !listedPatient,
  });
  const selectedPatient =
    listedPatient ??
    (fetchedPatient?.id === form.patientId ? fetchedPatient : undefined);
  const age = selectedPatient?.dateOfBirth
    ? Math.floor(
        (Date.now() - new Date(selectedPatient.dateOfBirth).getTime()) /
          31_557_600_000,
      )
    : null;

  // ── Date + time → ISO ─────────────────────────────────────────────────────
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    const iso = date && form.time ? `${date}T${form.time}:00` : "";
    setForm((f) => ({ ...f, date, scheduledAt: iso }));
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = e.target.value;
    const iso = form.date && time ? `${form.date}T${time}:00` : "";
    setForm((f) => ({ ...f, time, scheduledAt: iso }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patientId) return toast.error("Please select a patient");
    if (!form.dentistId) return toast.error("Please select a dentist");
    if (!form.scheduledAt) return toast.error("Please select date and time");
    const { date, time, ...payload } = form;
    onBook(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book New Appointment"
      width="max-w-4xl"
    >
      {/* ── Sky-Blue Header ─────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ── Patient Searchable Dropdown ──────────────────────────────────── */}
        <div className="bg-muted/50 rounded-lg p-3 border border-border">
          <label className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-primary" />
            Select Patient
            <span className="text-danger">*</span>
          </label>

          {!selectedPatient ? (
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setTimeout(() => setInputFocused(false), 150)}
                placeholder="Search by name, code, or phone…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60 bg-white"
              />
              {patientsLoading && (
                <LoadingSpinner className="absolute right-3 top-2.5 w-4 h-4" />
              )}

              {/* Dropdown – visible when input is focused or there are results */}
              {inputFocused && (
                <div className="absolute z-50 w-full mt-1 max-h-52 overflow-y-auto bg-white border border-border rounded-lg shadow-lg">
                  {patientsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <LoadingSpinner className="w-4 h-4" />
                      <span className="ml-2 text-xs text-muted-foreground/70">
                        Searching...
                      </span>
                    </div>
                  ) : patients.length > 0 ? (
                    patients.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onMouseDown={() => {
                          p("patientId", patient.id);
                          setPatientSearch("");
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-primary-muted/60 flex items-center gap-3 border-b border-border/40 last:border-0 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary-muted flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {initials(patient.firstName, patient.lastName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {patient.firstName} {patient.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground/70">
                            {patient.patientCode}
                            {patient.phone && ` · ${patient.phone}`}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : patientSearch.length > 1 && !patientsLoading ? (
                    <p className="text-xs text-center text-muted-foreground/70 py-4">
                      No patients found
                    </p>
                  ) : (
                    <p className="text-xs text-center text-muted-foreground/70 py-4">
                      Type to search patients...
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg px-3 py-2 border border-primary/25 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-muted to-primary-muted flex items-center justify-center text-xs font-bold text-primary">
                  {initials(
                    selectedPatient.firstName,
                    selectedPatient.lastName,
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {selectedPatient.firstName} {selectedPatient.lastName}
                    {age !== null && (
                      <span className="text-muted-foreground/70 font-normal ml-1">
                        ({age}y)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {selectedPatient.patientCode}
                    {selectedPatient.phone && ` · ${selectedPatient.phone}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  p("patientId", "");
                  setPatientSearch("");
                }}
                className="p-1 hover:bg-muted rounded-md text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ── Main fields (2-column, tighter) ──────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Left Column */}
          <div className="space-y-2.5">
            <FormField label="Dentist" required>
              <Select
                value={form.dentistId}
                onChange={(e) => p("dentistId", e.target.value)}
                required
                className="w-full py-1.5"
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
                className="w-full py-1.5"
              >
                {APPOINTMENT_TYPES.map((t: any) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Duration">
              <Select
                value={form.duration}
                onChange={(e) => p("duration", +e.target.value)}
                className="w-full py-1.5"
              >
                {[15, 20, 30, 45, 60, 90, 120].map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </Select>
            </FormField>

            <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-muted/50 border border-transparent hover:border-border transition-colors">
              <input
                type="checkbox"
                checked={form.isWalkIn}
                onChange={(e) => p("isWalkIn", e.target.checked)}
                className="w-4 h-4 rounded border-input text-primary focus:ring-primary/60"
              />
              <span className="text-sm text-foreground font-medium">
                Walk-in
              </span>
            </label>
          </div>

          {/* Right Column — Date & Time */}
          <div className="space-y-2.5">
            <FormField label="Date" required>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
                <input
                  type="date"
                  value={form.date}
                  onChange={handleDateChange}
                  min={format(new Date(), "yyyy-MM-dd")}
                  required
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60"
                />
              </div>
            </FormField>

            <FormField label="Time" required>
              <div className="relative">
                <Clock className="absolute left-3 top-2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
                <input
                  type="time"
                  value={form.time}
                  onChange={handleTimeChange}
                  required
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60"
                />
              </div>
            </FormField>

            {/* Compact summary */}
            {form.scheduledAt && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-primary-muted/60 rounded-lg border border-primary/25">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-primary">
                    {format(new Date(form.scheduledAt), "EEE, MMM d, yyyy")}
                  </p>
                  <p className="text-xs text-primary">
                    {format(new Date(form.scheduledAt), "h:mm a")} ·{" "}
                    {form.duration} min
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Chief Complaint & Notes (inline) ─────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Chief Complaint">
            <input
              type="text"
              value={form.chiefComplaint}
              onChange={(e) => p("chiefComplaint", e.target.value)}
              placeholder="Reason for visit…"
              className="w-full px-3 py-1.5 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60"
            />
          </FormField>
          <FormField label="Additional Notes">
            <textarea
              value={form.notes}
              onChange={(e) => p("notes", e.target.value)}
              rows={1}
              placeholder="Any extra info…"
              className="w-full px-3 py-1.5 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60 resize-none"
            />
          </FormField>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={loading}
            disabled={
              !form.patientId || !form.dentistId || !form.scheduledAt || loading
            }
            className="bg-primary hover:bg-primary"
          >
            Book Appointment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── EditModal ─────────────────────────────────────────────────────────────────
// Add this right before AppointmentsPage export

const EDITABLE_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "ARRIVED",
  "RESCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export function EditModal({
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
  const [form, setForm] = useState<{
    dentistId: string;
    type: string;
    date: string;
    time: string;
    scheduledAt: string;
    duration: number;
    chiefComplaint: string;
    notes: string;
    isWalkIn: boolean;
    status: string;
  } | null>(null);

  // Seed form whenever modal opens for a new appointment
  useEffect(() => {
    if (open && apt) {
      const dt = new Date(apt.scheduledAt);
      const date = format(dt, "yyyy-MM-dd");
      const time = format(dt, "HH:mm");
      setForm({
        dentistId: apt.dentistId,
        type: apt.type,
        date,
        time,
        scheduledAt: apt.scheduledAt,
        duration: apt.duration,
        chiefComplaint: apt.chiefComplaint ?? "",
        notes: apt.notes ?? "",
        isWalkIn: apt.isWalkIn,
        status: apt.status,
      });
    }
  }, [open, apt]);

  if (!open || !apt || !form) return null;

  const p = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    const scheduledAt =
      date && form.time ? `${date}T${form.time}:00` : form.scheduledAt;
    setForm((f) => (f ? { ...f, date, scheduledAt } : f));
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = e.target.value;
    const scheduledAt =
      form.date && time ? `${form.date}T${time}:00` : form.scheduledAt;
    setForm((f) => (f ? { ...f, time, scheduledAt } : f));
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
      title={`Edit Appointment:  ${apt.appointmentCode}`}
      width="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-2">
        {/* ── Status ──────────────────────────────────────────────────────── */}
        <div className="p-3 bg-muted/50 rounded-xl border border-border">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Appointment Status
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
                      ? `${cfg.bg} ${cfg.text} ${cfg.border} shadow-sm ring-2 ring-offset-1`
                      : "bg-white text-muted-foreground border-border hover:border-input hover:bg-muted/50",
                    active && `ring-${cfg.dot.replace("bg-", "")}`,
                  )}
                  // style={active ? { ringColor: cfg.dot } : {}}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      active ? cfg.dot : "bg-border",
                    )}
                  />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Patient (read-only) ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-xl border border-border">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-700 shrink-0">
            {initials(apt.patient.firstName, apt.patient.lastName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">
              {apt.patient.firstName} {apt.patient.lastName}
            </p>
            <p className="text-xs text-muted-foreground/70">{apt.patient.patientCode}</p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 bg-white px-2 py-1 rounded-md border border-border">
            Patient (locked)
          </span>
        </div>

        {/* ── Dentist + Type ──────────────────────────────────────────────── */}
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
                  Dr. {d.firstName}
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

        {/* ── Date + Time + Duration ──────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Date" required>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
              <input
                type="date"
                value={form.date}
                onChange={handleDateChange}
                required
                className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </FormField>

          <FormField label="Time" required>
            <div className="relative">
              <Clock className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
              <input
                type="time"
                value={form.time}
                onChange={handleTimeChange}
                required
                className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  {d} minutes
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        {/* Scheduled-at preview */}
        {form.scheduledAt && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg border"
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
                {format(new Date(form.scheduledAt), "h:mm a")}
                {" · "}
                {form.duration} min
                {" · "}
                {form.type.replace(/_/g, " ")}
              </p>
            </div>
          </div>
        )}

        {/* ── Walk-in toggle ──────────────────────────────────────────────── */}
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            checked={form.isWalkIn}
            onChange={(e) => p("isWalkIn", e.target.checked)}
            className="w-4 h-4 rounded border-input text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Walk-in appointment
            </p>
            <p className="text-xs text-muted-foreground/70">
              Patient arrived without a prior booking
            </p>
          </div>
        </label>

        {/* ── Chief Complaint + Notes ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Chief Complaint">
            <input
              type="text"
              value={form.chiefComplaint}
              onChange={(e) => p("chiefComplaint", e.target.value)}
              placeholder="Reason for visit…"
              className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </FormField>

          <FormField label="Additional Notes">
            <textarea
              value={form.notes}
              onChange={(e) => p("notes", e.target.value)}
              rows={2}
              placeholder="Any additional information…"
              className="w-full px-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </FormField>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
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


export function RoleWarningDialog({
  open,
  onClose,
  userRole,
}: {
  open: boolean;
  onClose: () => void;
  userRole?: string;
}) {
  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed z-[61] inset-0 flex items-center justify-center pointer-events-none">
        <div className="bg-white rounded-xl shadow-2xl w-[400px] overflow-hidden pointer-events-auto border border-border">
          {/* Red accent bar */}
          <div className="h-1 w-full bg-danger" />

          <div className="p-6 pb-4 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-danger-muted/60 flex items-center justify-center shrink-0">
                <XCircle className="w-6 h-6 text-danger" />
              </div>
              <div>
                <p className="text-base font-bold text-foreground mb-1">
                  Access restricted
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Starting a visit requires one of the following roles:
                </p>
              </div>
            </div>

            {/* Allowed roles pills */}
            <div className="flex gap-2 flex-wrap pl-[60px]">
              {[
                { label: "Super Admin", bg: "bg-danger-muted/60", text: "text-danger", border: "border-danger/25" },
                { label: "Admin",      bg: "bg-success-muted/60", text: "text-success", border: "border-success/25" },
                { label: "Dentist",    bg: "bg-primary-muted/60",  text: "text-primary",  border: "border-primary/25" },
              ].map((r) => (
                <span
                  key={r.label}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${r.bg} ${r.text} ${r.border}`}
                >
                  {r.label}
                </span>
              ))}
            </div>

            {/* Current role callout */}
            {userRole && (
              <div className="ml-[60px] bg-warning-muted/60 border border-warning/25 rounded-lg px-3 py-2.5">
                <p className="text-sm text-warning leading-relaxed">
                  <span className="font-semibold">Your role:</span>{" "}
                  <span className="capitalize">{userRole.toLowerCase().replace(/_/g, " ")}</span>
                  {" "}— cannot start visits. Please ask an authorised staff member to begin the visit.
                </p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-border/60 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-muted hover:bg-muted text-foreground transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function AppointmentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<"day" | "week">("week");
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { user } = useAuthStore();
  const isReception = user?.role === "RECEPTIONIST" || user?.role === "ADMIN";
  const [filterDentist, setFilterDentist] = useState<string>(
    isReception ? "all" : (user?.staff.id ?? "all"),
  );

  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
  // ?book=1 (e.g. "Register Patient & Appointment") opens the booking dialog.
  const [showBook, setShowBook] = useState(searchParams.get("book") === "1");
  const closeBook = () => {
    setShowBook(false);
    // Drop the one-shot ?book / ?patientId so a refresh doesn't reopen it.
    if (searchParams.has("book") || searchParams.has("patientId")) {
      setSearchParams({}, { replace: true });
    }
  };
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [showRoleWarning, setShowRoleWarning] = useState(false);

  const weekDays = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    return [selectedDate];
  }, [selectedDate, view]);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Fetch calendar data
  const { data: calData, isLoading } = useQuery({
    queryKey: ["cal", dateStr, filterDentist, view],
    queryFn: () =>
      appointmentsApi.getAll({
        date: view === "day" ? dateStr : undefined,
        startDate:
          view === "week"
            ? format(weekDays[0], "yyyy-MM-dd") + "T00:00:00"
            : undefined,
        endDate:
          view === "week"
            ? format(weekDays[6], "yyyy-MM-dd") + "T23:59:59"
            : undefined,
        dentistId: filterDentist === "all" ? undefined : filterDentist,
        limit: 200,
      }),
  });

  const { data: statsData } = useQuery({
    queryKey: ["apt-stats"],
    queryFn: () =>
      appointmentsApi
        .getAll({ date: format(new Date(), "yyyy-MM-dd"), limit: 200 })
        .then((r) => {
          const apts = r.data || [];
          return {
            total: apts.length,
            scheduled: apts.filter((a: Appointment) => a.status === "SCHEDULED")
              .length,
            IN_PROGRESS: apts.filter(
              (a: Appointment) => a.status === "IN_PROGRESS",
            ).length,
            completed: apts.filter((a: Appointment) => a.status === "COMPLETED")
              .length,
            ARRIVED: apts.filter((a: Appointment) => a.status === "ARRIVED")
              .length,
            CONFIRMED: apts.filter((a: Appointment) => a.status === "CONFIRMED")
              .length,
          };
        }),
    refetchInterval: 60000,
  });

  const { data: dentists = [] } = useQuery({
    queryKey: ["dentists"],
    queryFn: staffApi.getDentists,
  });

  const { data: searchData } = useQuery({
    queryKey: ["apt-search", search],
    queryFn: () => appointmentsApi.getAll({ search, limit: 8 }),
    enabled: search.length > 1,
  });

  // Mutations with proper error handling
  const bookMutation = useMutation({
    mutationFn: appointmentsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal"] });
      closeBook();
      toast.success("Appointment booked successfully");
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || "Failed to book appointment",
      );
    },
  });

  const checkInMutation = useMutation({
    mutationFn: (id: string) => appointmentsApi.arrive(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["cal"] });
      setSelectedApt((prev) => (prev ? { ...prev, status: "ARRIVED" } : null));
      toast.success("Patient Arrived successfully");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to Arrive patient");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      appointmentsApi.cancel(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal"] });
      setSelectedApt(null);
      toast.success("Appointment cancelled");
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || "Failed to cancel appointment",
      );
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      appointmentsApi.update(id, { status: "CONFIRMED" as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal"] });
      setSelectedApt((prev) =>
        prev ? { ...prev, status: "CONFIRMED" } : null,
      );
      toast.success("Appointment confirmed");
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || "Failed to confirm appointment",
      );
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      appointmentsApi.update(id, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["cal"] });
      // Keep the drawer open but reflect updated data
      setSelectedApt(updated);
      setShowEdit(false);
      toast.success("Appointment updated successfully");
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || "Failed to update appointment",
      );
    },
  });

  const draftMutation = useMutation({
    mutationFn: (id: string) => appointmentsApi.draft(id), // you'll add this to api
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal"] });
      setSelectedApt((prev) => (prev ? { ...prev, status: "DRAFT" } : null));
      toast.success("Appointment set to draft");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to set draft");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => appointmentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal"] });
      setSelectedApt(null);
      toast.success("Appointment deleted successfully");
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || "Failed to delete appointment",
      );
    },
  });

  const createVisitMutation = useMutation({
    mutationFn: ({
      appointmentId,
      dentistId,
    }: {
      appointmentId: string;
      dentistId: string;
    }) => visitsApi.create({ appointmentId, dentistId }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["cal"] });
      navigate(`/visits/${data.id}`);
      setSelectedApt(null);
      toast.success("Visit started successfully");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to start visit");
    },
  });

  const appointments: Appointment[] = calData?.data || [];

  const aptsByDentist = useMemo(() => {
    const m: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      if (!m[a.dentistId]) m[a.dentistId] = [];
      m[a.dentistId].push(a);
    }
    return m;
  }, [appointments]);

  const visibleDentists: Dentist[] =
    filterDentist === "all"
      ? dentists
      : dentists.filter((d: Dentist) => d.id === filterDentist);

  const step = (dir: 1 | -1) =>
    setSelectedDate((d) => {
      const n = new Date(d);
      n.setDate(d.getDate() + dir * (view === "week" ? 7 : 1));
      return n;
    });

  const handleCancel = () => {
    if (!selectedApt) return;
    const reason = window.prompt("Reason for cancellation:");
    if (reason && reason.trim()) {
      cancelMutation.mutate({ id: selectedApt.id, reason: reason.trim() });
    }
  };

  const handleDelete = () => {
    if (!selectedApt) return;
    if (
      !window.confirm(
        `Delete appointment ${selectedApt.appointmentCode} for ${selectedApt.patient.firstName} ${selectedApt.patient.lastName}? This cannot be undone.`,
      )
    )
      return;
    deleteMutation.mutate(selectedApt.id);
  };

  const VISIT_ALLOWED_ROLES = ["SUPER_ADMIN", "ADMIN", "DENTIST"];

const handleStartVisit = () => {
  if (!selectedApt) return;

  // Role check
  if (!user?.role || !VISIT_ALLOWED_ROLES.includes(user.role)) {
    setShowRoleWarning(true);
    return;
  }

  if (selectedApt.visit) {
    navigate(`/visits/${selectedApt.visit.id}`);
    setSelectedApt(null);
  } else {
    createVisitMutation.mutate({
      appointmentId: selectedApt.id,
      dentistId: selectedApt.dentistId,
    });
  }
};

  const isActionLoading =
    checkInMutation.isPending ||
    cancelMutation.isPending ||
    confirmMutation.isPending ||
    createVisitMutation.isPending;
  editMutation.isPending;
  deleteMutation.isPending;

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] bg-muted/50 overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="bg-white border-b border-border px-1 py-1 flex items-center gap-1 shrink-0 z-10 shadow-sm">
        {/* Left: Title + date nav */}
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-2">
            {/* <div className="px-1 bg-indigo-50 rounded-lg">
              <CalendarDays className="w-5 h-2 text-indigo-600" />
            </div> */}
            <h1 className="text-sm font-bold text-foreground hidden md:block">
              Appointments
            </h1>
          </div>

          <div className="h-6 w-px bg-muted hidden md:block" />

          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => step(-1)}
              className="p-1.5 rounded-md hover:bg-white text-muted-foreground transition-colors shadow-sm"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="px-3 py-1 text-xs font-bold rounded-md bg-white text-indigo-700 hover:bg-indigo-50 transition-colors shadow-sm"
            >
              Today
            </button>
            <button
              onClick={() => step(1)}
              className="p-1.5 rounded-md hover:bg-white text-muted-foreground transition-colors shadow-sm"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <span className="text-sm font-bold text-foreground bg-muted px-1.5 py-1.5 rounded-lg">
            {view === "week"
              ? `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], "MMM d, yyyy")}`
              : format(selectedDate, "EEEE, MMMM d, yyyy")}
          </span>

          {isToday(selectedDate) && view === "day" && (
            <span className="px-2.5 py-1 bg-success-muted text-success text-xs font-bold rounded-full border border-success/25">
              Today
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Stats */}
        {statsData && (
          <div className="hidden xl:flex items-center bg-muted/50 rounded-lg py-0.5 px-0 border border-border">
            {[
              {
                label: "Total",
                value: statsData.total,
                color: "text-foreground",
                bg: "bg-white",
              },
              {
                label: "Scheduled",
                value: statsData.scheduled,
                color: "text-primary",
                bg: "bg-primary-muted/60",
              },
              {
                label: "Confirmed",
                value: statsData.CONFIRMED,
                color: "text-success",
                bg: "bg-success-muted/60",
              },
              {
                label: "Arrived",
                value: statsData.ARRIVED,
                color: "text-warning",
                bg: "bg-warning-muted/60",
              },
              {
                label: "In Progress",
                value: statsData.IN_PROGRESS,
                color: "text-warning",
                bg: "bg-warning-muted/60",
              },
              {
                label: "Done",
                value: statsData.completed,
                color: "text-success",
                bg: "bg-success-muted/60",
              },
            ].map((s) => (
              <div
                key={s.label}
                className={cn(
                  "px-0 py-0.5 rounded-md text-center min-w-[60px]",
                  s.bg,
                )}
              >
                <p className={cn("text-l font-bold leading-none", s.color)}>
                  {s.value}
                </p>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground/70 font-bold mt-0.5">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Right controls */}
        <div className="flex items-center gap-1">
          {/* View toggle */}
          <div className="flex bg-muted rounded-lg p-0.5 gap-0.5 border border-border">
            {(["day", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-1 py-0 text-xs font-bold rounded-md transition-all capitalize",
                  view === v
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Dentist filter */}
          <div className="relative">
            <Filter className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground/70" />
            <select
              value={filterDentist}
              onChange={(e) => setFilterDentist(e.target.value)}
              className="pl-9 pr-8 text-xs border border-border rounded-lg py-2 bg-white text-foreground focus:ring-2 focus:ring-indigo-300 focus:outline-none font-medium"
            >
              <option value="all">All Dentists</option>
              {dentists.map((d: Dentist) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.firstName}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            {/* <button 
              onClick={() => setShowSearch(s => !s)}
              className={cn('p-2 rounded-lg transition-colors border', 
                showSearch ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-border hover:bg-muted/50 text-muted-foreground')}
            >
              <Search className="w-4 h-4" />
            </button> */}

            {showSearch && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-border z-50 overflow-hidden">
                <div className="p-3 border-b border-border/60 bg-muted/50">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground/70" />
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search patient or code…"
                      className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>
                {(searchData?.data || []).length > 0 ? (
                  <ul className="max-h-72 overflow-y-auto divide-y divide-border/40">
                    {(searchData?.data || []).map((a: Appointment) => (
                      <li key={a.id}>
                        <button
                          onClick={() => {
                            setSelectedApt(a);
                            setShowSearch(false);
                            setSearch("");
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-muted/50 flex items-center gap-3 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                            {initials(a.patient.firstName, a.patient.lastName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">
                              {a.patient.firstName} {a.patient.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground/70">
                              {format(
                                new Date(a.scheduledAt),
                                "MMM d · h:mm a",
                              )}{" "}
                              · {a.type.replace(/_/g, " ")}
                            </p>
                          </div>
                          <StatusBadge status={a.status} small />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  search.length > 1 && (
                    <div className="py-8 text-center text-muted-foreground/70 text-sm">
                      No results found
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["cal"] })}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground/70 transition-colors border border-transparent hover:border-border"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowBook(true)}
            className="flex items-center gap-1 px-2 py-1 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      {/* ── Calendar Grid ── */}
      <div className="flex-1 overflow-auto bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <LoadingSpinner />
              <p className="text-sm text-muted-foreground/70">Loading appointments...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Week day headers */}
            {view === "week" && (
              <div
                className="sticky top-0 z-10 bg-white border-b border-border flex shadow-sm"
                style={{ paddingLeft: 56 }}
              >
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    style={{ width: `${100 / 7}%` }}
                    className={cn(
                      "py-0 text-center border-r border-border/60 last:border-r-0",
                      isToday(day) && "bg-indigo-50/80",
                    )}
                  >
                    <p className="text-xs font-bold text-muted-foreground/70 uppercase tracking-wider">
                      {format(day, "EEE")}
                    </p>
                    <p
                      className={cn(
                        "text-xl font-bold mt-0",
                        isToday(day) ? "text-indigo-600" : "text-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </p>
                    {/* {isToday(day) && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full mt-1 inline-block">
                        Today
                      </span>
                    )} */}
                  </div>
                ))}
              </div>
            )}

            {/* Day view: dentist headers */}
            {view === "day" && visibleDentists.length > 0 && (
              <div
                className="sticky top-0 z-10 bg-white border-b border-border flex shadow-sm"
                style={{ paddingLeft: 56 }}
              >
                {visibleDentists.map((d: Dentist) => {
                  const cnt = (aptsByDentist[d.id] || []).length;
                  return (
                    <div
                      key={d.id}
                      style={{ width: `${100 / visibleDentists.length}%` }}
                      className="px-4 py-3 border-r border-border/60 last:border-r-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-700 shrink-0 shadow-sm">
                          {initials(d.firstName, d.lastName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-foreground truncate">
                            Dr. {d.firstName}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">
                              {d.specialization || "General Dentistry"}
                            </span>
                            <span className="text-muted-foreground/50">|</span>
                            <span className="font-bold text-indigo-600">
                              {cnt}
                            </span>
                            <span>appt{cnt !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Time grid */}
            <div className="flex relative">
              {/* Time labels */}
              <div className="w-14 shrink-0 border-r border-border bg-muted/50 pt-2">
                {HOURS.map((h) => (
                  <div key={h} style={{ height: HOUR_H }} className="relative">
                    <span className="absolute -top-2 right-1 text-[11px] font-bold text-muted-foreground/70 select-none">
                      {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Columns */}
              {view === "day" ? (
                visibleDentists.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-24 text-muted-foreground/70">
                    <CalendarDays className="w-16 h-16 text-muted-foreground/40 mb-4" />
                    <p className="text-base font-medium text-muted-foreground">
                      No appointments scheduled
                    </p>
                    <button
                      onClick={() => setShowBook(true)}
                      className="mt-4 px-5 py-2.5 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-xl hover:bg-indigo-100 transition-colors border border-indigo-200"
                    >
                      + Book New Appointment
                    </button>
                  </div>
                ) : (
                  visibleDentists.map((d: Dentist) => (
                    <div
                      key={d.id}
                      style={{ width: `${100 / visibleDentists.length}%` }}
                      className="relative border-r border-border/60 last:border-r-0 bg-white"
                    >
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          style={{ height: HOUR_H }}
                          className="border-t border-border/60 relative hover:bg-muted/50 transition-colors"
                        >
                          <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-border" />
                        </div>
                      ))}
                      <NowLine />
                      <div className="absolute inset-0">
                        {(aptsByDentist[d.id] || []).map((apt) => (
                          <AptCard
                            key={apt.id}
                            apt={apt}
                            onClick={() => setSelectedApt(apt)}
                            style={{
                              top: aptTop(apt.scheduledAt),
                              height: aptH(apt.duration),
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )
              ) : (
                weekDays.map((day) => {
                  const dayApts = appointments.filter((a) =>
                    isSameDay(new Date(a.scheduledAt), day),
                  );
                  return (
                    <div
                      key={day.toISOString()}
                      style={{ width: `${100 / 7}%` }}
                      className={cn(
                        "relative border-r border-border/60 last:border-r-0",
                        isToday(day) && "bg-indigo-50/10",
                      )}
                    >
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          style={{ height: HOUR_H }}
                          className="border-t border-border/60 relative hover:bg-muted/30 transition-colors"
                        >
                          <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-border" />
                        </div>
                      ))}
                      {isToday(day) && <NowLine />}
                      <div className="absolute inset-0">
                        {dayApts.map((apt) => (
                          <AptCard
                            key={apt.id}
                            apt={apt}
                            onClick={() => setSelectedApt(apt)}
                            style={{
                              top: aptTop(apt.scheduledAt),
                              height: aptH(apt.duration),
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Drawer overlay ── */}
      {selectedApt && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedApt(null)}
          />
          <AptDrawer
            apt={selectedApt}
            onClose={() => setSelectedApt(null)}
            onArrive={() => checkInMutation.mutate(selectedApt.id)}
            onStartVisit={handleStartVisit}
            onCancel={handleCancel}
            onConfirm={() => confirmMutation.mutate(selectedApt.id)}
            onEdit={() => setShowEdit(true)} // ← add this
            onDelete={handleDelete}
            loading={isActionLoading}
          />
        </>
      )}

      {/* ── Book Modal ── */}
      <BookModal
        open={showBook}
        onClose={closeBook}
        onBook={(d) => bookMutation.mutate(d)}
        dentists={dentists}
        defaultPatientId={searchParams.get("patientId") || undefined}
        loading={bookMutation.isPending}
      />

      <EditModal
        open={showEdit}
        apt={selectedApt}
        onClose={() => setShowEdit(false)}
        onSave={(id, data) => editMutation.mutate({ id, data })}
        dentists={dentists}
        loading={editMutation.isPending}
      />

      <RoleWarningDialog
  open={showRoleWarning}
  onClose={() => setShowRoleWarning(false)}
  userRole={user?.role}
/>
    </div>
  );
}
