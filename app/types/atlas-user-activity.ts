/** User activity tracking types (client-safe). */

export type UserPresenceStatus = 'active' | 'offline';

export type UserActivityActionType =
  | 'login'
  | 'page_view'
  | 'invoice_created'
  | 'invoice_updated'
  | 'invoice_validated'
  | 'document_uploaded'
  | 'document_routed'
  | 'tax_simulation'
  | 'ai_request'
  | 'client_updated'
  | 'export'
  | 'payroll'
  | 'bank_import'
  | 'billing'
  | 'admin_action'
  | 'audit'
  | 'other';

export type UserActivityEntry = {
  id: string;
  userId: string;
  actionType: UserActivityActionType;
  summary: string;
  entityType: string | null;
  entityId: string | null;
  companyId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AdminUserActivityRow = {
  id: string;
  email: string;
  fullName: string;
  status: UserPresenceStatus;
  lastSeenAt: string | null;
  lastLoginAt: string | null;
  operationsToday: number;
  recentActivities: UserActivityEntry[];
};

export type AdminActivityOverview = {
  stats: {
    activeNow: number;
    totalUsers: number;
    totalOperationsToday: number;
  };
  users: AdminUserActivityRow[];
};

/** Active if last_seen within this many milliseconds (default 5 min). */
export const USER_ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;
