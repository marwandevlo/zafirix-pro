/**
 * GET /api/onboarding/metrics — dashboard-ready onboarding analytics
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ONBOARDING_EVENTS = [
  'onboarding_started',
  'onboarding_completed',
  'onboarding_wizard_step',
  'onboarding_wizard_abandoned',
  'onboarding_tour_completed',
  'onboarding_first_value',
  'onboarding_checklist_progress',
  'feedback_submitted',
];

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('events')
    .select('event_name, created_at, metadata')
    .eq('user_id', userId)
    .in('event_name', ONBOARDING_EVENTS)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: 'query_failed' }, { status: 500 });

  const events = data ?? [];
  const counts: Record<string, number> = {};
  for (const e of events) {
    const name = String(e.event_name ?? '');
    counts[name] = (counts[name] ?? 0) + 1;
  }

  const started = events.find((e) => e.event_name === 'onboarding_started');
  const completed = events.find((e) => e.event_name === 'onboarding_completed');
  const abandoned = events.find((e) => e.event_name === 'onboarding_wizard_abandoned');
  const firstValue = events.find((e) => e.event_name === 'onboarding_first_value');

  let setupDurationSec: number | null = null;
  if (started?.created_at && completed?.created_at) {
    setupDurationSec = Math.round(
      (new Date(completed.created_at).getTime() - new Date(started.created_at).getTime()) / 1000,
    );
  }

  return NextResponse.json({
    ok: true,
    metrics: {
      eventCounts: counts,
      wizardAbandoned: Boolean(abandoned),
      setupDurationSec,
      firstValueAchieved: Boolean(firstValue),
      onboardingCompleted: Boolean(completed),
      recentEvents: events.slice(0, 20),
    },
  });
}
