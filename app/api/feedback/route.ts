/**
 * POST /api/feedback — Phase 17 user feedback
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    rating?: number;
    kind?: string;
    message?: string;
  };

  const rating = Number(body.rating ?? 0);
  const kind = String(body.kind ?? 'satisfaction').slice(0, 32);
  const message = String(body.message ?? '').slice(0, 2000);

  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'invalid_rating' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();
  const { error } = await admin.from('events').insert({
    user_id: userId,
    event_name: 'feedback_submitted',
    metadata: { rating, kind, message, source: 'feedback_widget' },
  });

  if (error) {
    return NextResponse.json({ error: 'store_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
