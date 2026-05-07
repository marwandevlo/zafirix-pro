import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin } from '@/app/lib/admin/require-admin';

export type FunnelStatsResponse = {
  windowDays: number;
  counts: Record<string, number>;
  signups: number;
  onboardingStarted: number;
  onboardingCompleted: number;
  landingViews: number;
  pricingViews: number;
  upgradeClicks: number;
  trialBannerClicks: number;
  /** signup_completed / view_landing */
  landingToSignupRate: number | null;
  /** onboarding_completed / signup_completed */
  signupToOnboardingRate: number | null;
  /** Same basis as landingToSignupRate — headline KPI for internal reporting */
  conversionRateEstimate: number | null;
  warnings?: string[];
  /** From `atlas_referrals` (clicks may exceed unique visitors). */
  referralClicksDb: number;
  referralLinkedSignupsDb: number;
  referralActivatedDb: number;
  referralRewardsGrantedDb: number;
};

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) {
    return NextResponse.json(
      {
        error: 'server_misconfigured',
        message: 'SUPABASE_SERVICE_ROLE_KEY required for analytics aggregates',
      } satisfies Record<string, string>,
      { status: 503 },
    );
  }

  const windowDays = Math.min(90, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10) || 30));
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - windowDays);
  const sinceIso = since.toISOString();

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: rows, error } = await admin
    .from('events')
    .select('event_name')
    .gte('created_at', sinceIso);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const r of rows ?? []) {
    const name = String((r as { event_name?: string }).event_name ?? '');
    if (!name) continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }

  const landingViews = counts.view_landing ?? 0;
  const signups = counts.signup_completed ?? 0;
  const onboardingStarted = counts.onboarding_started ?? 0;
  const onboardingCompleted = counts.onboarding_completed ?? 0;
  const pricingViews = counts.view_pricing ?? 0;
  const upgradeClicks = counts.upgrade_clicked ?? 0;
  const trialBannerClicks = counts.trial_banner_clicked ?? 0;

  const landingToSignupRate = landingViews > 0 ? signups / landingViews : null;
  const signupToOnboardingRate = signups > 0 ? onboardingCompleted / signups : null;

  let referralClicksDb = 0;
  let referralLinkedSignupsDb = 0;
  let referralActivatedDb = 0;
  let referralRewardsGrantedDb = 0;
  const warnings: string[] = [];

  const { data: refRows, error: refErr } = await admin.from('atlas_referrals').select('status, referred_user_id, referrer_reward_granted_at');
  if (refErr) {
    warnings.push(`atlas_referrals: ${refErr.message}`);
  } else {
    for (const r of refRows ?? []) {
      const st = String((r as { status?: string }).status ?? '');
      const referred = (r as { referred_user_id?: string | null }).referred_user_id;
      const rewardAt = (r as { referrer_reward_granted_at?: string | null }).referrer_reward_granted_at;
      if (st === 'clicked') referralClicksDb += 1;
      if (referred) referralLinkedSignupsDb += 1;
      if (st === 'activated') referralActivatedDb += 1;
      if (rewardAt) referralRewardsGrantedDb += 1;
    }
  }

  const body: FunnelStatsResponse = {
    windowDays,
    counts,
    signups,
    onboardingStarted,
    onboardingCompleted,
    landingViews,
    pricingViews,
    upgradeClicks,
    trialBannerClicks,
    landingToSignupRate,
    signupToOnboardingRate,
    conversionRateEstimate: landingToSignupRate,
    warnings: warnings.length ? warnings : undefined,
    referralClicksDb,
    referralLinkedSignupsDb,
    referralActivatedDb,
    referralRewardsGrantedDb,
  };

  return NextResponse.json(body);
}
