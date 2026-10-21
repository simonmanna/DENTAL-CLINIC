import { UserRole } from '@prisma/client';

// The owner keeps finances (invoices, receipts, revenue, cash) to admins and
// the front desk. Clinical roles get the clinical data only.
export const FINANCE_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.RECEPTIONIST,
];

export function canViewFinance(role?: string | null): boolean {
  return !!role && (FINANCE_ROLES as string[]).includes(role);
}
