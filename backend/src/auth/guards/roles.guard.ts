// src/auth/guards/roles.guard.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reads the `@Roles(UserRole...)` metadata set by the decorator at
// `../decorators/roles.decorator.ts`, then compares against `req.user.role`
// (populated by JwtAuthGuard via JwtStrategy.validate).
//
// Routes without a `@Roles(...)` decorator are NOT gated by this guard —
// authentication via JwtAuthGuard is still required by the global APP_GUARD
// chain, but role-based gating only applies when explicitly requested.
//
// SUPER_ADMIN bypasses every gate by design.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const role = req.user?.role as UserRole | undefined;

    if (!role) {
      throw new ForbiddenException('No role on principal — refusing access.');
    }
    // SUPER_ADMIN and ADMIN both bypass every gate. In a clinic the
    // ADMIN is typically the practice owner — they need full clinical
    // write access to correct records, cover for absent staff, and
    // train new dentists. Locking ADMIN out of condition / procedure
    // writes broke every existing admin workflow when this guard was
    // first introduced. The narrower roles (NURSE / RECEPTIONIST /
    // PHARMACIST / LAB_TECHNICIAN) are still scoped by the @Roles(...)
    // metadata on each route.
    if (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN) return true;

    if (!required.includes(role)) {
      throw new ForbiddenException(
        `Requires one of [${required.join(', ')}] — you are ${role}.`,
      );
    }
    return true;
  }
}
