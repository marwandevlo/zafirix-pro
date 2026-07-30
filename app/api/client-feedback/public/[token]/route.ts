/**
 * GET  /api/client-feedback/public/[token] — public feedback form metadata
 * POST /api/client-feedback/public/[token] — submit satisfaction + NPS
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPublicFeedbackForm, submitFeedbackResponse } from '@/app/lib/atlas-client-feedback-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();
  const form = await getPublicFeedbackForm(admin, token);

  if (!form) {
    return NextResponse.json({ error: 'link_not_found_or_expired' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, form });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    satisfactionScore?: number;
    npsScore?: number;
    comment?: string;
    respondentName?: string;
  };

  const admin = getSupabaseServiceRoleClient();
  const result = await submitFeedbackResponse(admin, token, {
    satisfactionScore: Number(body.satisfactionScore ?? 0),
    npsScore: Number(body.npsScore ?? 0),
    comment: body.comment,
    respondentName: body.respondentName,
  });

  if (!result.ok) {
    const status = result.error === 'already_submitted' ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
