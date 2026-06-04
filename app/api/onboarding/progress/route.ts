/**
 * GET/POST /api/onboarding/progress — sync onboarding state (events audit trail)
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  return NextResponse.json({
    ok: true,
    note: 'Progress is primarily stored client-side (atlas_onboarding_progress_v1). POST to log milestones.',
    authenticated: Boolean(userId),
  });
}

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    step?: string;
    percent?: number;
    payload?: Record<string, unknown>;
  };

  const action = String(body.action ?? 'progress_sync').slice(0, 64);
  const admin = getSupabaseServiceRoleClient();
  const { error } = await admin.from('events').insert({
    user_id: userId,
    event_name: action.startsWith('onboarding_') ? action : `onboarding_${action}`,
    metadata: {
      step: body.step ?? null,
      percent: body.percent ?? null,
      ...(body.payload ?? {}),
    },
  });

  if (error) return NextResponse.json({ error: 'store_failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
