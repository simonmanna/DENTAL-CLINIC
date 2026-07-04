export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  DENTIST = 'DENTIST',
  NURSE = 'NURSE',
  RECEPTIONIST = 'RECEPTIONIST',
  PHARMACIST = 'PHARMACIST',
  LAB_TECHNICIAN = 'LAB_TECHNICIAN',
}

export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
] as const;


export interface Staff {
  id: string;
  staffCode: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string;
  role: UserRole;
  specialization: string | null;
  licenseNumber: string | null;
  qualification: string | null;
  bio: string | null;
  isAvailable: boolean;
  isActive: boolean;
  joiningDate: string;
  avatar: string | null;
  lastLoginAt: string | null;
  schedules: StaffSchedule[];
  _count?: {
    appointments: number;
    treatmentPlans: number;
  };
}

export interface StaffSchedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
}

export interface CreateStaffRequest {
  email: string;
  password: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  phone?: string;
  specialization?: string;
  licenseNumber?: string;
  qualification?: string;
  bio?: string;
}

// export interface StaffFilters {
//   role?: UserRole;
//   isActive?: boolean;
//   search?: string;
//   page: number;
//   limit: number;
// }

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Administrator',
  ADMIN: 'Administrator',
  DENTIST: 'Dentist',
  NURSE: 'Nurse',
  RECEPTIONIST: 'Receptionist',
  PHARMACIST: 'Pharmacist',
  LAB_TECHNICIAN: 'Lab Technician',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: 'red',
  ADMIN: 'orange',
  DENTIST: 'blue',
  NURSE: 'green',
  RECEPTIONIST: 'purple',
  PHARMACIST: 'cyan',
  LAB_TECHNICIAN: 'pink',
};


export interface ScheduleFormItem {
  id?: string;              // present if editing an existing schedule
  dayOfWeek: number;        // 0 (Sun) to 6 (Sat)
  startTime: string;        // "HH:mm"
  endTime: string;          // "HH:mm"
  isWorking: boolean;
}

// ─── Create Staff ────────────────────────────────────────────────────────
export interface CreateStaffForm {
  /** User account details */
  email: string;
  password: string;
  role: UserRole;

  /** Staff profile */
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  specialization?: string;
  licenseNumber?: string;
  qualification?: string;
  bio?: string;
  isAvailable?: boolean;       // defaults to true
  joiningDate?: Date | string; // ISO date string

  /** Optional initial work schedule */
  schedules?: ScheduleFormItem[];
}

// ─── Update Staff ────────────────────────────────────────────────────────
export interface UpdateStaffForm {
  /** Basic identity - userId & role managed via separate endpoints */
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
  specialization?: string;
  licenseNumber?: string;
  qualification?: string;
  bio?: string;
  isAvailable?: boolean;
  joiningDate?: Date | string;
  // email, role, and password are managed via User model endpoints (e.g., /users/:id)
  // schedules are managed via separate endpoints / forms
}

// ─── Update Schedule (single schedule entry) ────────────────────────────
export interface UpdateScheduleForm {
  id?: string;                // required if updating an existing entry
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
}

// ─── Dentist (simplified representation, often for UI dropdowns) ─────────
export interface Dentist {
  id: string;
  staffCode: string;
  firstName: string;
  lastName: string;
  specialization?: string;
  avatar?: string;
  isAvailable: boolean;
}

// ─── Staff Stats (aggregated performance / summary) ─────────────────────
export interface StaffStats {
  totalAppointments: number;
  completedAppointments: number;
  upcomingAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  totalPatients: number;          // distinct patients treated
  totalRevenue: number;           // sum of completed procedures/payments
  averageRating?: number;         // from performance notes
  // ... add other aggregated fields as needed by your frontend
}