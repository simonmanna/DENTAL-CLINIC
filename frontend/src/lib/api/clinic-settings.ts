import { api } from "./client";
import type {
  ClinicSetting,
  CreateClinicSettingPayload,
  UpdateClinicSettingPayload,
} from "../../types/clinic-settings";

export const clinicSettingsApi = {
  /** Get all clinic settings */
  getAll: () => api.get<ClinicSetting[]>(`/clinic-settings`).then((r) => r.data),

  /** Get single setting by key */
  getByKey: (key: string) =>
    api.get<ClinicSetting>(`/clinic-settings/${key}`).then((r) => r.data),

  /** Create a new setting */
  create: (data: CreateClinicSettingPayload) =>
    api.post<ClinicSetting>(`/clinic-settings`, data).then((r) => r.data),

  /** Update a setting by id */
  update: (id: string, data: UpdateClinicSettingPayload) =>
    api.patch<ClinicSetting>(`/clinic-settings/${id}`, data).then((r) => r.data),

  /** Delete a setting by id */
  remove: (id: string) =>
    api.delete<void>(`/clinic-settings/${id}`).then((r) => r.data),
};
