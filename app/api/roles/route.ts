/**
 * GET /api/roles — list enterprise roles
 * POST — assign role (logged to audit)
 */
import { NextRequest, NextResponse } from 'next/server';
import { logRoleAssignment } from '@/app/lib/atlas-workspace-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { requireWorkspaceRole, permissionJsonResponse } from '@/app/lib/atlas-permissions';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const db = getSupabaseServiceRoleClient();
  const { data } = await db.from('atlas_roles').select('slug, label').order('label');
  return NextResponse.json({ ok: true, roles: data ?? [] });
}

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    targetUserId?: string;
    roleSlug?: string;
    workspaceId?: string | null;
    companyId?: string | null;
  };

  if (!body.targetUserId || !body.roleSlug) {
    return NextResponse.json({ error: 'target_user_and_role_required' }, { status: 400 });
  }

  const db = getSupabaseServiceRoleClient();
  const workspaceId = body.workspaceId?.trim() || null;
  if (workspaceId) {
    const perm = await requireWorkspaceRole(db, userId, workspaceId, 'manager');
    if (!perm.ok) return permissionJsonResponse(perm);
  }

  const { error } = await db.from('atlas_user_roles').upsert({
    user_id: body.targetUserId,
    workspace_id: body.workspaceId ?? null,
    company_id: body.companyId ?? null,
    role_slug: body.roleSlug,
    granted_by: userId,
  }, { onConflict: 'user_id,workspace_id,company_id,role_slug' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logRoleAssignment(db, userId, body.targetUserId, body.roleSlug, body.workspaceId ?? null, body.companyId ?? null);

  return NextResponse.json({ ok: true });
}
