// src/hooks/usePermissions.ts
import { UserRole } from '@/types/shared'; // ← IMPORT FROM SHARED TYPES
import { useAuthStore } from '@/store/auth.store';

type Permission = 
  | 'manage_staff' 
  | 'manage_patients' 
  | 'manage_billing' 
  | 'view_reports' 
  | 'manage_inventory' 
  | 'manage_settings';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: ['manage_staff', 'manage_patients', 'manage_billing', 'view_reports', 'manage_inventory', 'manage_settings'],
  [UserRole.ADMIN]: ['manage_staff', 'manage_patients', 'manage_billing', 'view_reports', 'manage_inventory'],
  [UserRole.DENTIST]: ['manage_patients', 'view_reports'],
  [UserRole.NURSE]: ['manage_patients'],
  [UserRole.RECEPTIONIST]: ['manage_patients', 'manage_billing'],
  [UserRole.PHARMACIST]: ['manage_inventory'],
  [UserRole.LAB_TECHNICIAN]: ['manage_patients'],
};

export const usePermissions = () => {
  const { user } = useAuthStore();

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    return ROLE_PERMISSIONS[user.role]?.includes(permission) || false;
  };

  const hasRole = (roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role); // ✅ Now UserRole is from shared types
  };

  return {
    hasPermission,
    hasRole,
    userRole: user?.role,
    isAdmin: user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN,
  };
};