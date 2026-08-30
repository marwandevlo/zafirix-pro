import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { readAffiliateBalance } from '@/app/lib/atlas-affiliate-commission';
import {
  AFFILIATE_PLAN_COMMISSION_PERCENT,
  loadAffiliateCommissionTiers,
  nextAffiliateCommissionTier,
  resolveAffiliateCommissionBreakdown,
} from '@/app/lib/atlas-affiliate-tiers';
import { getPublicAppUrl } from '@/app/lib/atlas-app-url';
import {
  countReferralFunnelForReferrer,
  ensureReferralCodeForUser,
} from '@/app/lib/atlas-referral-server';
import { recordServerAnalyticsEvent } from '@/app/lib/server-analytics-event';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ ok: false, error: 'not_enabled' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'misconfigured' }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabaseUser = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });

  const { data: authData, error: authErr } = await supabaseUser.auth.getUser();
  const user = authData?.user;
  if (authErr || !user?.id) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { code, created } = await ensureReferralCodeForUser(admin, user.id);
    if (created) {
      void recordServerAnalyticsEvent(admin, {
        userId: user.id,
        eventName: 'referral_link_created',
        path: '/api/affiliate/dashboard',
        metadata: { referral_code: code },
      });
    }

    const origin = getPublicAppUrl();
    const [funnel, earnings, tiers, txRes] = await Promise.all([
      countReferralFunnelForReferrer(admin, user.id),
      readAffiliateBalance(admin, user.id),
      loadAffiliateCommissionTiers(admin),
      admin
        .from('atlas_affiliate_transactions')
        .select('id, source, payment_amount, commission_percent, commission_amount, currency, status, created_at, metadata')
        .eq('referrer_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const breakdown = resolveAffiliateCommissionBreakdown({
      activatedReferrals: funnel.activated,
      tiers,
    });
    const currentTier =
      tiers.find((t) => t.id === breakdown.tier.id) ??
      tiers.filter((t) => funnel.activated >= t.minActivated).at(-1) ??
      tiers[0] ??
      breakdown.tier;
    const nextTier = nextAffiliateCommissionTier(funnel.activated, tiers);

    const transactions = (Array.isArray(txRes.data) ? txRes.data : []).map((row) => {
      const r = row as {
        id?: string;
        source?: string;
        payment_amount?: number;
        commission_percent?: number;
        commission_amount?: number;
        currency?: string;
        status?: string;
        created_at?: string;
        metadata?: Record<string, unknown> | null;
      };
      return {
        id: String(r.id ?? ''),
        source: String(r.source ?? ''),
        paymentAmount: Number(r.payment_amount || 0),
        commissionPercent: Number(r.commission_percent || 0),
        commissionAmount: Number(r.commission_amount || 0),
        currency: String(r.currency || earnings.currency),
        status: String(r.status ?? 'pending'),
        tierId: String(r.metadata?.commission_tier || ''),
        createdAt: String(r.created_at ?? ''),
      };
    });

    const planRates = Object.entries(AFFILIATE_PLAN_COMMISSION_PERCENT).map(([planId, percent]) => ({
      planId,
      percent,
    }));

    return NextResponse.json({
      ok: true,
      code,
      referralLink: `${origin}/?ref=${encodeURIComponent(code)}`,
      signupUrl: `${origin}/register?ref=${encodeURIComponent(code)}`,
      clicks: funnel.clicks,
      signups: funnel.signups,
      activeReferrals: funnel.activated,
      pendingEarnings: earnings.pendingBalance,
      paidOut: earnings.paidOut,
      availableBalance: earnings.availableBalance,
      lifetimeEarned: earnings.lifetimeEarned,
      earningsCurrency: earnings.currency,
      currentPercent: currentTier.percent,
      currentTier,
      nextTier,
      tiers,
      planRates,
      transactions,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
