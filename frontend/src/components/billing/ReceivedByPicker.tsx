// src/components/billing/ReceivedByPicker.tsx
//
// Dropdown of active staff used to record who physically received a payment.
// Defaults to the logged-in user's staff record. The chosen Staff.id is
// returned via `onChange` so callers can pass it as `receivedById`.

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { staffApi } from "@/lib/api/staff-api";
import { useAuthStore } from "@/store/auth.store";
import type { Staff } from "@/types/staff";
import { cn } from "@/lib/utils";

interface Props {
  value: string;                          // Staff.id (empty string = unset)
  onChange: (staffId: string) => void;
  /** If true, an explicit "— unassigned —" option is allowed. Default: false. */
  allowEmpty?: boolean;
  className?: string;
  disabled?: boolean;
  label?: string;
  /** Show a required asterisk next to the label. Default: false. */
  required?: boolean;
  /** Optional id forwarded to the underlying select element. */
  id?: string;
}

export function ReceivedByPicker({
  value,
  onChange,
  allowEmpty = false,
  className,
  disabled,
  label = "Received By",
  required = false,
  id,
}: Props) {
  const currentUserStaffId = useAuthStore((s) => s.user?.staff?.id);

  const { data: staff = [], isLoading } = useQuery<Staff[]>({
    queryKey: ["staff", "active-cashiers"],
    queryFn: async () => {
      // Backend returns Staff[] directly for /staff
      const raw = await staffApi.getAll({ isActive: "true" });
      return Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
    },
    staleTime: 5 * 60_000,
  });

  // Default to current user when value is empty and we know who they are.
  useEffect(() => {
    if (value || !currentUserStaffId || isLoading) return;
    const exists = staff.some((s) => s.id === currentUserStaffId);
    if (exists) onChange(currentUserStaffId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, currentUserStaffId, isLoading, staff.length]);

  const sorted = [...staff].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
  );

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-slate-600 mb-1"
        >
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || isLoading}
        className={cn(
          "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm",
          "focus:ring-2 focus:ring-emerald-500 focus:outline-none",
          "disabled:bg-slate-50 disabled:text-slate-400",
        )}
      >
        {allowEmpty && <option value="">— Unassigned —</option>}
        {!allowEmpty && !value && (
          <option value="" disabled>
            {isLoading ? "Loading staff…" : "Select staff member"}
          </option>
        )}
        {sorted.map((s) => (
          <option key={s.id} value={s.id}>
            {s.firstName} {s.lastName}
            {s.specialization ? ` · ${s.specialization}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
