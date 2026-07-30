/**
 * User presence tracking and human-readable activity log for admin monitoring.
 */

import 'server-only';

import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import type { AuditAction, AuditEntityType, AuditLogParams } from '@/app/lib/atlas-audit-log-constants';
import {
  USER_ACTIVE_THRESHOLD_MS,
  type AdminActivityOverview,
  type AdminUserActivityRow,
  type UserActivityActionType,
  type UserActivityEntry,
  type UserPresenceStatus,
} from '@/app/types/atlas-user-activity';

export { USER_ACTIVE_THRESHOLD_MS };

export type LogUserActivityParams = {
  userId: string;
  actionType: UserActivityActionType;
  summary: string;
  entityType?: string | null;
  entityId?: string | null;
  companyId?: string | null;
  metadata?: Record<string, unknown>;
  touchPresence?: boolean;
};

const ENTITY_LABELS: Record<AuditEntityType, string> = {
  document: 'document',
  invoice: 'invoice',
  supplier_invoice: 'supplier invoice',
  accounting_entry: 'accounting entry',
  tva_suggestion: 'VAT suggestion',
  legal_document: 'legal document',
  payroll_record: 'payroll record',
  bank_statement: 'bank statement',
  bank_transaction: 'bank transaction',
  routing_record: 'routing record',
  export: 'export',
  backup: 'backup',
};

const ACTION_VERBS: Record<AuditAction, string> = {
  created: 'Created',
  corrected: 'Corrected',
  reviewed: 'Reviewed',
  validated: 'Validated',
  rejected: 'Rejected',
  propagated: 'Propagated correction for',
  routed: 'Routed',
  archived: 'Archived',
  deleted: 'Deleted',
  restored: 'Restored',
};

function pickReference(params: AuditLogParams): string {
  const meta = params.metadata ?? {};
  const nv = params.newValues ?? {};
  const ov = params.oldValues ?? {};
  const candidates = [
    meta.invoice_number,
    meta.reference,
    meta.number,
    meta.title,
    meta.name,
    nv.number,
    nv.invoice_number,
    nv.reference,
    ov.number,
    ov.invoice_number,
  ];
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (s) return s.startsWith('#') ? s : `#${s}`;
  }
  return `#${params.entityId.slice(0, 8)}`;
}

/** Map atlas_audit_logs events to user-activity action types and summaries. */
export function formatAuditEventSummary(params: AuditLogParams): {
  actionType: UserActivityActionType;
  summary: string;
} {
  const label = ENTITY_LABELS[params.entityType] ?? params.entityType;
  const ref = pickReference(params);
  const verb = ACTION_VERBS[params.action] ?? params.action;

  if (params.entityType === 'invoice' && params.action === 'created') {
    return { actionType: 'invoice_created', summary: `Generated invoice ${ref}` };
  }
  if (params.entityType === 'invoice' && params.action === 'validated') {
    return { actionType: 'invoice_validated', summary: `Validated invoice ${ref}` };
  }
  if (params.entityType === 'invoice') {
    return { actionType: 'invoice_updated', summary: `${verb} invoice ${ref}` };
  }
  if (params.entityType === 'document' && params.action === 'created') {
    return { actionType: 'document_uploaded', summary: `Uploaded document ${ref}` };
  }
  if (params.entityType === 'routing_record' || params.action === 'routed') {
    return { actionType: 'document_routed', summary: `Routed document ${ref} to module` };
  }
  if (params.entityType === 'export') {
    return { actionType: 'export', summary: `Exported ${label} ${ref}` };
  }
  if (params.entityType === 'payroll_record') {
    return { actionType: 'payroll', summary: `${verb} payroll record ${ref}` };
  }
  if (params.entityType === 'bank_statement' || params.entityType === 'bank_transaction') {
    return { actionType: 'bank_import', summary: `${verb} ${label} ${ref}` };
  }
  if (params.metadata?.feature === 'tax_simulation' || params.metadata?.module === 'tax_simulator') {
    return { actionType: 'tax_simulation', summary: `Ran AI Tax Simulation ${ref}` };
  }
  if (params.metadata?.ai === true || params.metadata?.source === 'ai') {
    return { actionType: 'ai_request', summary: `AI assistant: ${verb.toLowerCase()} ${label} ${ref}` };
  }

  return {
    actionType: 'audit',
    summary: `${verb} ${label} ${ref}`,
  };
}

export function mapAuditToActivityAction(params: AuditLogParams): UserActivityActionType {
  return formatAuditEventSummary(params).actionType;
}

export function isUserActiveNow(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const ts = new Date(lastSeenAt).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts <= USER_ACTIVE_THRESHOLD_MS;
}

export function presenceStatus(lastSeenAt: string | null | undefined): UserPresenceStatus {
  return isUserActiveNow(lastSeenAt) ? 'active' : 'offline';
}

function startOfTodayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function rowToEntry(row: Record<string, unknown>): UserActivityEntry {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    actionType: String(row.action_type) as UserActivityActionType,
    summary: String(row.summary),
    entityType: row.entity_type ? String(row.entity_type) : null,
    entityId: row.entity_id ? String(row.entity_id) : null,
    companyId: row.company_id ? String(row.company_id) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  };
}

/** Append a user activity event. Non-throwing. */
export async function logUserActivity(params: LogUserActivityParams): Promise<void> {
  try {
    const admin = getSupabaseServiceRoleClient();
    const { error } = await admin.from('atlas_user_activity').insert({
      user_id: params.userId,
      action_type: params.actionType,
      summary: params.summary,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      company_id: params.companyId ?? null,
      metadata: params.metadata ?? {},
    });
    if (error) {
      console.error('[user_activity] insert error:', error.message);
      return;
    }
    if (params.touchPresence !== false) {
      await touchUserPresence(params.userId);
    }
  } catch (err) {
    console.error('[user_activity] unexpected error:', err instanceof Error ? err.message : err);
  }
}

/** Update last_seen_at without logging an activity row. */
export async function touchUserPresence(userId: string): Promise<void> {
  try {
    const admin = getSupabaseServiceRoleClient();
    const now = new Date().toISOString();
    const { error } = await admin.from('profiles').update({ last_seen_at: now }).eq('id', userId);
    if (error) {
      console.error('[user_activity] touch presence error:', error.message);
    }
  } catch (err) {
    console.error('[user_activity] touch unexpected error:', err instanceof Error ? err.message : err);
  }
}

/** Record login: updates last_login + last_seen and logs activity. */
export async function recordUserLogin(
  userId: string,
  opts?: { email?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    const admin = getSupabaseServiceRoleClient();
    const now = new Date().toISOString();
    const { error } = await admin
      .from('profiles')
      .update({ last_login: now, last_seen_at: now })
      .eq('id', userId);
    if (error) {
      console.error('[user_activity] login profile update error:', error.message);
    }
    await logUserActivity({
      userId,
      actionType: 'login',
      summary: opts?.email ? `Signed in (${opts.email})` : 'Signed in',
      metadata: opts?.metadata ?? {},
      touchPresence: false,
    });
  } catch (err) {
    console.error('[user_activity] record login error:', err instanceof Error ? err.message : err);
  }
}

/** Optional page-view log (throttled by caller). */
export async function logPageView(userId: string, path: string): Promise<void> {
  const clean = path.trim() || '/';
  await logUserActivity({
    userId,
    actionType: 'page_view',
    summary: `Viewed ${clean}`,
    metadata: { path: clean },
    touchPresence: true,
  });
}

/** Bridge from atlas_audit_logs — call after audit insert. */
export async function logActivityFromAudit(params: AuditLogParams): Promise<void> {
  const { actionType, summary } = formatAuditEventSummary(params);
  await logUserActivity({
    userId: params.performedBy,
    actionType,
    summary,
    entityType: params.entityType,
    entityId: params.entityId,
    companyId: params.companyId ?? null,
    metadata: {
      audit_action: params.action,
      ...(params.metadata ?? {}),
    },
    touchPresence: true,
  });
}

export async function getUserActivityHistory(
  userId: string,
  limit = 50,
): Promise<UserActivityEntry[]> {
  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('atlas_user_activity')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[user_activity] history error:', error.message);
    return [];
  }
  return (data ?? []).map((r) => rowToEntry(r as Record<string, unknown>));
}

export async function getAdminActivityOverview(opts?: {
  q?: string;
  limit?: number;
}): Promise<AdminActivityOverview> {
  const admin = getSupabaseServiceRoleClient();
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 1000);
  const q = (opts?.q ?? '').trim().toLowerCase();
  const todayStart = startOfTodayUtc();

  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, email, full_name, last_seen_at, last_login')
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (profErr) {
    console.error('[user_activity] profiles error:', profErr.message);
    return { stats: { activeNow: 0, totalUsers: 0, totalOperationsToday: 0 }, users: [] };
  }

  const profileRows = (profiles ?? []) as Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    last_seen_at: string | null;
    last_login: string | null;
  }>;

  const filtered = q
    ? profileRows.filter((p) => {
        const hay = `${p.email ?? ''} ${p.full_name ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
    : profileRows;

  const userIds = filtered.map((p) => p.id);
  if (userIds.length === 0) {
    return { stats: { activeNow: 0, totalUsers: 0, totalOperationsToday: 0 }, users: [] };
  }

  const { data: todayRows, error: countErr } = await admin
    .from('atlas_user_activity')
    .select('user_id')
    .gte('created_at', todayStart)
    .in('user_id', userIds);

  if (countErr) {
    console.error('[user_activity] count error:', countErr.message);
  }

  const countsByUser = new Map<string, number>();
  for (const row of todayRows ?? []) {
    const uid = String((row as { user_id: string }).user_id);
    countsByUser.set(uid, (countsByUser.get(uid) ?? 0) + 1);
  }

  const { data: recentRows, error: recentErr } = await admin
    .from('atlas_user_activity')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .limit(Math.min(userIds.length * 5, 500));

  if (recentErr) {
    console.error('[user_activity] recent error:', recentErr.message);
  }

  const recentByUser = new Map<string, UserActivityEntry[]>();
  for (const row of recentRows ?? []) {
    const entry = rowToEntry(row as Record<string, unknown>);
    const list = recentByUser.get(entry.userId) ?? [];
    if (list.length < 5) {
      list.push(entry);
      recentByUser.set(entry.userId, list);
    }
  }

  const now = Date.now();
  let activeNow = 0;
  let totalOperationsToday = 0;

  const users: AdminUserActivityRow[] = filtered.map((p) => {
    const lastSeenAt = p.last_seen_at ?? null;
    const status: UserPresenceStatus = isUserActiveNow(lastSeenAt, now) ? 'active' : 'offline';
    if (status === 'active') activeNow += 1;
    const operationsToday = countsByUser.get(p.id) ?? 0;
    totalOperationsToday += operationsToday;
    return {
      id: p.id,
      email: String(p.email ?? ''),
      fullName: String(p.full_name ?? ''),
      status,
      lastSeenAt,
      lastLoginAt: p.last_login ?? null,
      operationsToday,
      recentActivities: recentByUser.get(p.id) ?? [],
    };
  });

  // Sort: active first, then by operations today, then last seen
  users.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    if (b.operationsToday !== a.operationsToday) return b.operationsToday - a.operationsToday;
    const aTs = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    const bTs = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    return bTs - aTs;
  });

  return {
    stats: {
      activeNow,
      totalUsers: users.length,
      totalOperationsToday,
    },
    users,
  };
}

/** Batch enrich admin user list with presence + today's ops. */
export async function enrichUsersWithActivity<T extends { id: string }>(
  users: T[],
): Promise<Array<T & { last_seen_at: string | null; is_active_now: boolean; operations_today: number }>> {
  if (users.length === 0) return [];
  const admin = getSupabaseServiceRoleClient();
  const ids = users.map((u) => u.id);
  const todayStart = startOfTodayUtc();

  const [{ data: profiles }, { data: todayRows }] = await Promise.all([
    admin.from('profiles').select('id, last_seen_at').in('id', ids),
    admin.from('atlas_user_activity').select('user_id').gte('created_at', todayStart).in('user_id', ids),
  ]);

  const seenById = new Map<string, string | null>();
  for (const p of profiles ?? []) {
    seenById.set(String((p as { id: string }).id), (p as { last_seen_at: string | null }).last_seen_at ?? null);
  }

  const counts = new Map<string, number>();
  for (const row of todayRows ?? []) {
    const uid = String((row as { user_id: string }).user_id);
    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }

  const now = Date.now();
  return users.map((u) => {
    const lastSeen = seenById.get(u.id) ?? null;
    return {
      ...u,
      last_seen_at: lastSeen,
      is_active_now: isUserActiveNow(lastSeen, now),
      operations_today: counts.get(u.id) ?? 0,
    };
  });
}
