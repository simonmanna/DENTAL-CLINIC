import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Date/Time formatting
export function formatDate(
  value: string | Date | null | undefined,
  style: 'short' | 'long' | 'datetime' | 'relative' = 'short',
): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '—';

  if (style === 'relative') {
    return formatRelative(d);
  }

  const opts: Intl.DateTimeFormatOptions =
    style === 'datetime'
      ? { 
          day: 'numeric', 
          month: 'short', 
          year: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        }
      : style === 'long'
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' };

  return d.toLocaleDateString('en-UG', opts);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function getAge(birthDate: string | Date): number {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function formatCurrency(
  amount: number | string | null | undefined, // Added string to the type
  currency = 'UGX',
  compact = false,
): string {
  // 1. Handle empty states
  if (amount == null || amount === '') return `0 ${currency}`;

  // 2. Force it to be a number
  const numAmount = Number(amount);

  // 3. Fallback just in case the conversion results in NaN (Not-a-Number)
  if (isNaN(numAmount)) return `0 ${currency}`;

  // 4. Compact formatting
  if (compact && numAmount >= 1_000_000) {
    return `${(numAmount / 1_000_000).toFixed(1)}M ${currency}`;
  }
  if (compact && numAmount >= 1_000) {
    return `${(numAmount / 1_000).toFixed(0)}K ${currency}`;
  }

  // 5. Standard formatting with commas
  const formattedAmount = numAmount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return `${formattedAmount} ${currency}`;
}

// Status color mappings
export const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  no_show: 'bg-gray-100 text-gray-800 border-gray-200',
  active: 'bg-green-100 text-green-800 border-green-200',
  inactive: 'bg-gray-100 text-gray-800 border-gray-200',
  paid: 'bg-green-100 text-green-800 border-green-200',
  unpaid: 'bg-red-100 text-red-800 border-red-200',
  partially_paid: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  overdue: 'bg-red-100 text-red-800 border-red-200',
  low: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  medium: 'bg-blue-100 text-blue-800 border-blue-200',
  high: 'bg-red-100 text-red-800 border-red-200',
  healthy: 'bg-green-100 text-green-800 border-green-200',
  decayed: 'bg-red-100 text-red-800 border-red-200',
  filled: 'bg-blue-100 text-blue-800 border-blue-200',
  missing: 'bg-gray-100 text-gray-800 border-gray-200',
  treated: 'bg-purple-100 text-purple-800 border-purple-200',
}

// Constants
export const APPOINTMENT_TYPES = [
  { value: 'checkup', label: 'Regular Checkup' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'filling', label: 'Filling' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'root_canal', label: 'Root Canal' },
  { value: 'crown', label: 'Crown' },
  { value: 'implant', label: 'Implant' },
  { value: 'orthodontic', label: 'Orthodontic' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'consultation', label: 'Consultation' },
] as const

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'check', label: 'Check' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const

export const TOOTH_STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-emerald-500',
  decayed: 'bg-red-500',
  filled: 'bg-blue-500',
  missing: 'bg-gray-400',
  treated: 'bg-purple-500',
  crown: 'bg-amber-500',
  implant: 'bg-cyan-500',
}

// src/lib/utils.ts
// Shared utility functions for DHMS frontend

// import { type ClassValue, clsx } from 'clsx';
// import { twMerge } from 'tailwind-merge';

// shadcn/ui cn helper
// export function cn(...inputs: ClassValue[]) {
//   return twMerge(clsx(inputs));
// }

// ── Currency ─────────────────────────────────────────────────

/**
 * Format a number as UGX currency.
 * e.g. 150000 → "UGX 150,000"
 */

// ── Dates ─────────────────────────────────────────────────────

/**
 * Format a date string or Date object.
 * @param value  ISO string, Date, or nullish
 * @param style  'short' = "12 Mar 2025" | 'long' = "12 March 2025" | 'datetime' = "12 Mar 2025, 14:30"
 */
// export function formatDate(
//   value: string | Date | null | undefined,
//   style: 'short' | 'long' | 'datetime' | 'relative' = 'short',
// ): string {
//   if (!value) return '—';
//   const d = typeof value === 'string' ? new Date(value) : value;
//   if (isNaN(d.getTime())) return '—';

//   if (style === 'relative') {
//     return formatRelative(d);
//   }

//   const opts: Intl.DateTimeFormatOptions =
//     style === 'datetime'
//       ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
//       : style === 'long'
//       ? { day: 'numeric', month: 'long', year: 'numeric' }
//       : { day: 'numeric', month: 'short', year: 'numeric' };

//   return d.toLocaleDateString('en-UG', opts);
// }

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d, 'short');
}

// ── Status helpers ────────────────────────────────────────────

export type StatusVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

export function getStatusVariant(status: string): StatusVariant {
  const s = status.toUpperCase();
  if (['COMPLETED', 'PAID', 'ACTIVE', 'RECEIVED', 'DISPENSED', 'APPROVED'].includes(s))
    return 'success';
  if (['PENDING', 'PARTIAL', 'PARTIALLY_PAID', 'INVOICED', 'IN_PROGRESS', 'ORDERED'].includes(s)) return 'warning';
  if (['CANCELLED', 'REJECTED', 'VOID', 'EXPIRED', 'REFUNDED'].includes(s)) return 'danger';
  if (['DRAFT', 'INACTIVE'].includes(s)) return 'muted';
  if (['SCHEDULED', 'CONFIRMED'].includes(s)) return 'info';
  return 'default';
}

const variantClasses: Record<StatusVariant, string> = {
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  danger: 'bg-red-100 text-red-700 border-red-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
  muted: 'bg-gray-100 text-gray-600 border-gray-200',
  default: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function statusBadgeClass(status: string): string {
  return `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
    variantClasses[getStatusVariant(status)]
  }`;
}

// ── Misc ──────────────────────────────────────────────────────

export function truncate(str: string, max = 40): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? singular + 's')}`;
}

export function generateCode(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}
