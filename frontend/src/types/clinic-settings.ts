export interface ClinicSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

export interface CreateClinicSettingPayload {
  key: string;
  value: string;
  description?: string;
}

export interface UpdateClinicSettingPayload {
  key?: string;
  value?: string;
  description?: string;
}
