/**
 * GET /api/workspaces — list workspaces for current user
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getOrCreateDefaultWorkspace } from '@/app/lib/atlas-workspace-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const db = getSupabaseServiceRoleClient();
  const type = request.nextUrl.searchParams.get('type') as 'single_company' | 'accounting_firm' | 'enterprise_group' | null;

  await getOrCreateDefaultWorkspace(db, userId, type ?? 'single_company');

  const { data } = await db
    .from('atlas_workspaces')
    .select('*')
    .eq('owner_user_id', userId)
    .order('created_at');

  return NextResponse.json({
    ok: true,
    workspaces: (data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      workspaceType: w.workspace_type,
      createdAt: w.created_at,
    })),
  });
}
