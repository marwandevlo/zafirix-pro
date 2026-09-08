/**
 * GET /api/billing/subscription
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { ensureWorkspaceSubscription } from '@/app/lib/atlas-billing-server';
import { expireTrialsIfNeeded } from '@/app/lib/atlas-trial-manager';
import { computeTrialStatus } from '@/app/lib/atlas-trial-manager';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { shouldSkipExpiredTrial } from '@/app/lib/admin/admin-entitlement-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const db = getSupabaseServiceRoleClient();
  const skipExpired = await shouldSkipExpiredTrial(db, userId);
  if (!skipExpired) {
    await expireTrialsIfNeeded(db, userId);
  }

  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  const { workspaceId: wsId, subscription } = await ensureWorkspaceSubscription(db, userId, workspaceId);
  const trial = computeTrialStatus(subscription.trialEndsAt, subscription.status);
  if (skipExpired || subscription.status === 'active') {
    trial.expired = false;
    trial.active = subscription.status === 'trial' ? trial.active : false;
    trial.labelFr = skipExpired ? 'Accès admin' : trial.labelFr;
  }

  return NextResponse.json({ ok: true, workspaceId: wsId, subscription, trial });
}
