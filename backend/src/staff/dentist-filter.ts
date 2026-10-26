// src/staff/dentist-filter.ts
// ─────────────────────────────────────────────────────────────────────────────
// A user has exactly one role, so a practising dentist who is also given
// SUPER_ADMIN (to manage configuration) would otherwise vanish from dentist
// pickers, dentist reports and dentist notifications. "Is a dentist" is
// therefore: role DENTIST, or role SUPER_ADMIN with a dentistry
// specialization on the staff record (e.g. "General Dentistry").
// ─────────────────────────────────────────────────────────────────────────────
import { Prisma, UserRole } from '@prisma/client';

const DENTISTRY_SPECIALIZATION: Prisma.StringNullableFilter = {
  contains: 'dentistry',
  mode: 'insensitive',
};

/** Staff where-clause matching every practising dentist. */
export const DENTIST_STAFF_WHERE: Prisma.StaffWhereInput = {
  OR: [
    { user: { role: UserRole.DENTIST } },
    {
      user: { role: UserRole.SUPER_ADMIN },
      specialization: DENTISTRY_SPECIALIZATION,
    },
  ],
};

/** User where-clause matching every practising dentist's login. */
export const DENTIST_USER_WHERE: Prisma.UserWhereInput = {
  OR: [
    { role: UserRole.DENTIST },
    {
      role: UserRole.SUPER_ADMIN,
      staff: { specialization: DENTISTRY_SPECIALIZATION },
    },
  ],
};
