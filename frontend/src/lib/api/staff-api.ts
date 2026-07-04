// src/lib/api/staff.ts
import { api } from "./client";
import type {
  Staff,
  StaffSchedule,
  CreateStaffForm,
  UpdateStaffForm,
  UpdateScheduleForm,
  Dentist,
  StaffStats,
} from "../../types/staff";

export const staffApi = {
  /** Get all staff with pagination/filters */
  getAll: (params?: Record<string, string | number | undefined>) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params || {}).filter(
        ([_, value]) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== "undefined"
      )
    );
    return api.get<Staff[]>("/staff", { params: cleanParams }).then((r) => r.data);
  },

  /** Get single staff member by ID */
  getOne: (id: string) =>
    api.get<Staff>(`/staff/${id}`).then((r) => r.data),

  /** Get all dentists */
  getDentists: () =>
    api.get<Dentist[]>("/staff/dentists").then((r) => r.data),

  /** Update staff member */
  update: (id: string, data: UpdateStaffForm) =>
    api.patch<Staff>(`/staff/${id}`, data).then((r) => r.data),

  /** Update staff schedule */
  updateSchedule: (id: string, schedules: UpdateScheduleForm[]) =>
    api.post<StaffSchedule>(`/staff/${id}/schedule`, { schedules }).then((r) => r.data),

  /** Get staff statistics */
  getStats: () =>
    api.get<StaffStats>("/staff/stats").then((r) => r.data),
};