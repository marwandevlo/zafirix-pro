'use client';

import type { ReactNode } from 'react';

export type EntityPermission = 'owner' | 'admin' | 'viewer' | 'any';

type PermissionGuardProps = {
  /** Required permission level for the action. */
  required: EntityPermission;
  /** The permission the current user has on this entity. */
  userPermission: EntityPermission;
  /** What to render when permission is denied. Default: null (hidden). */
  fallback?: ReactNode;
  children: ReactNode;
};

const PERMISSION_RANK: Record<EntityPermission, number> = {
  any: 0,
  viewer: 1,
  owner: 2,
  admin: 3,
};

export function hasPermission(userPermission: EntityPermission, required: EntityPermission): boolean {
  if (required === 'any') return true;
  return PERMISSION_RANK[userPermission] >= PERMISSION_RANK[required];
}

/**
 * Conditionally renders children based on the user's permission level.
 * Design is forward-compatible with RBAC: add roles without changing call sites.
 */
export function PermissionGuard({ required, userPermission, fallback = null, children }: PermissionGuardProps) {
  if (!hasPermission(userPermission, required)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
