// Protected Route Component
// src/components/common/ProtectedRoute.tsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { UserRole } from '@/types/shared';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
  requiredPermission?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRoles,
  requiredPermission,
}) => {
  const { hasRole, hasPermission } = usePermissions();

  if (requiredRoles && !hasRole(requiredRoles)) {
    return <Navigate to="/unauthorized" />;
  }

  if (requiredPermission && !hasPermission(requiredPermission as any)) {
    return <Navigate to="/unauthorized" />;
  }

  return <>{children}</>;
};