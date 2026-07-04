import { UserRole } from '@prisma/client';

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
  performanceNotes?: PerformanceNote[];
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

export interface PerformanceNote {
  id: string;
  period: string;
  notes: string;
  rating?: number;
  createdAt: string;
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
  isAvailable?: boolean;
}

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
  SUPER_ADMIN: 'bg-red-100 text-red-700',
  ADMIN: 'bg-orange-100 text-orange-700',
  DENTIST: 'bg-blue-100 text-blue-700',
  NURSE: 'bg-green-100 text-green-700',
  RECEPTIONIST: 'bg-purple-100 text-purple-700',
  PHARMACIST: 'bg-cyan-100 text-cyan-700',
  LAB_TECHNICIAN: 'bg-pink-100 text-pink-700',
};

export const DAYS_OF_WEEK = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];