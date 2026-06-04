/**
 * Phase 16 — Enterprise role & workspace permission enforcement.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export type AtlasRoleSlug =
  | 'super_admin'
  | 'owner'
  | 'manager'
  | 'accountant'
  | 'payroll_manager'
  | 'auditor'
  | 'viewer';

export const ATLAS_ROLE_RANK: Record<AtlasRoleSlug, number> = {
  viewer: 10,
  auditor: 20,
  accountant: 30,
  payroll_manager: 35,
  manager: 40,
  owner: 50,
  super_admin: 60,
};

export type PermissionDeny = { ok: false; status: 401 | 403; code: string; message?: string };
export type PermissionOk = { ok: true; role: AtlasRoleSlug | null; workspaceId?: string; companyId?: string };
export type PermissionResult = PermissionOk | PermissionDeny;

function rank(role: string | null | undefined): number {
  if (!role) return 0;
  return ATLAS_ROLE_RANK[role as AtlasRoleSlug] ?? 0;
}

export function roleMeetsMinimum(actual: string | null | undefined, minimum: AtlasRoleSlug): boolean {
  return rank(actual) >= rank(minimum);
}

export function permissionDenied(status: 401 | 403, code: string, message?: string): PermissionDeny {
  return { ok: false, status, code, message };
}

export function permissionJsonResponse(deny: PermissionDeny): NextResponse {
  return NextResponse.json({ error: deny.code, code: deny.code, message: deny.message }, { status: deny.status });
}

async function isWorkspaceOwner(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data } = await db
    .from('atlas_workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('owner_user_id', userId)
    .maybeSingle();
  return !!data?.id;
}

async function resolveWorkspaceRole(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<AtlasRoleSlug | null> {
  if (await isWorkspaceOwner(db, userId, workspaceId)) return 'owner';

  const { data } = await db
    .from('atlas_user_roles')
    .select('role_slug')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const slug = data?.role_slug ? String(data.role_slug) : null;
  return slug && slug in ATLAS_ROLE_RANK ? (slug as AtlasRoleSlug) : null;
}

async function resolveCompanyRole(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<{ role: AtlasRoleSlug | null; workspaceId: string | null; owned: boolean }> {
  const { data: company } = await db
    .from('atlas_companies')
    .select('id, user_id, workspace_id')
    .eq('id', companyId)
    .maybeSingle();

  if (!company?.id) return { role: null, workspaceId: null, owned: false };
  if (String(company.user_id) === userId) return { role: 'owner', workspaceId: company.workspace_id ? String(company.workspace_id) : null, owned: true };

  const workspaceId = company.workspace_id ? String(company.workspace_id) : null;
  if (!workspaceId) return { role: null, workspaceId: null, owned: false };

  const { data: roles } = await db
    .from('atlas_user_roles')
    .select('role_slug')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .order('created_at', { ascending: false });

  let best: AtlasRoleSlug | null = null;
  for (const r of roles ?? []) {
    const slug = String(r.role_slug) as AtlasRoleSlug;
    if (!best || rank(slug) > rank(best)) best = slug;
  }
  return { role: best, workspaceId, owned: false };
}

export async function canAccessWorkspace(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  if (await isWorkspaceOwner(db, userId, workspaceId)) return true;
  const { count } = await db
    .from('atlas_user_roles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId);
  return (count ?? 0) > 0;
}

export async function canAccessCompany(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<boolean> {
  const ctx = await resolveCompanyRole(db, userId, companyId);
  return ctx.owned || !!ctx.role;
}

export async function requireRole(
  db: SupabaseClient,
  userId: string,
  minimum: AtlasRoleSlug,
  scope: { workspaceId?: string | null; companyId?: string | null },
): Promise<PermissionResult> {
  if (!userId) return permissionDenied(401, 'auth_required');

  if (scope.companyId) {
    const ctx = await resolveCompanyRole(db, userId, scope.companyId);
    if (!ctx.role) return permissionDenied(403, 'company_forbidden');
    if (!roleMeetsMinimum(ctx.role, minimum)) return permissionDenied(403, 'insufficient_role');
    return { ok: true, role: ctx.role, companyId: scope.companyId, workspaceId: ctx.workspaceId ?? undefined };
  }

  if (scope.workspaceId) {
    const role = await resolveWorkspaceRole(db, userId, scope.workspaceId);
    if (!role) return permissionDenied(403, 'workspace_forbidden');
    if (!roleMeetsMinimum(role, minimum)) return permissionDenied(403, 'insufficient_role');
    return { ok: true, role, workspaceId: scope.workspaceId };
  }

  return permissionDenied(403, 'scope_required');
}

export async function requireWorkspaceRole(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
  minimum: AtlasRoleSlug = 'viewer',
): Promise<PermissionResult> {
  return requireRole(db, userId, minimum, { workspaceId });
}

export async function requireCompanyRole(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  minimum: AtlasRoleSlug = 'viewer',
): Promise<PermissionResult> {
  return requireRole(db, userId, minimum, { companyId });
}
