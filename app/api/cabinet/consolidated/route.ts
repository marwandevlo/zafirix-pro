/**
 * GET /api/cabinet/consolidated — consolidated dashboard KPIs
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { buildConsolidatedDashboard, getOrCreateDefaultWorkspace } from '@/app/lib/atlas-workspace-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const db = getSupabaseServiceRoleClient();
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  const ws = workspaceId
    ? { id: workspaceId }
    : await getOrCreateDefaultWorkspace(db, userId, 'accounting_firm');

  const dashboard = await buildConsolidatedDashboard(db, userId, ws.id);

  return NextResponse.json({ ok: true, dashboard });
}
