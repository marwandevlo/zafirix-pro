/**
 * GET /api/billing/usage
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { buildBillingUsageSummary } from '@/app/lib/atlas-feature-access';
import { ensureWorkspaceSubscription } from '@/app/lib/atlas-billing-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const db = getSupabaseServiceRoleClient();
  const workspaceIdParam = request.nextUrl.searchParams.get('workspaceId');
  const { workspaceId } = await ensureWorkspaceSubscription(db, userId, workspaceIdParam);
  const summary = await buildBillingUsageSummary(db, userId, workspaceId);

  return NextResponse.json({ ok: true, ...summary });
}
