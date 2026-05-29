import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { addDaysYmd, todayYmd } from '@/app/lib/atlas-dates';
import { sendWelcomeLifecycleEmail } from '@/app/lib/atlas-lifecycle-email';
import { applyPendingReferralWelcomeOnTrialGrant } from '@/app/lib/atlas-referral-server';
import { syncProfileEntitlementFromAtlas } from '@/app/lib/atlas-subscription-sync';

const FREE_TRIAL_PLAN_ID = 'free-trial';
const TRIAL_DAYS = 7;
const MAX_GRANTED_TRIALS_PER_IP = 3;
const IP_WINDOW_DAYS = 90;

function normalizeEmail(email: string | undefined | null): string {
  return (email ?? '').trim().toLowerCase();
}

function clientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 128);
  return '';
}

function normalizeFingerprint(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, 256);
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json(
      { ok: false, granted: false, reason: 'service_unavailable' as const, message: 'Mode démo : pas d’essai serveur.' },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';

  if (!serviceRoleKey) {
    return NextResponse.json(
      {
        ok: false,
        granted: false,
        reason: 'service_unavailable' as const,
        message: "Configuration serveur incomplète. L’administrateur doit définir SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
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
    return NextResponse.json({ ok: false, granted: false, reason: 'service_unavailable' as const, message: 'Non authentifié.' }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const emailNormalized = normalizeEmail(user.email);
  if (!emailNormalized) {
    return NextResponse.json(
      { ok: false, granted: false, reason: 'service_unavailable' as const, message: 'Adresse email manquante sur le compte.' },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { deviceFingerprint?: unknown };
  const deviceFingerprint = normalizeFingerprint(body.deviceFingerprint);
  const ip = clientIp(request);
  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 2000);

  const { data: subs, error: subsErr } = await admin
    .from('atlas_subscriptions')
    .select('id, plan_id, status')
    .eq('user_id', user.id);

  if (subsErr) {
    return NextResponse.json(
      { ok: false, granted: false, reason: 'service_unavailable' as const, message: 'Erreur lecture abonnement.' },
      { status: 500 },
    );
  }

  const list = subs ?? [];
  const paidActive = list.some((s) => s.status === 'active' && s.plan_id !== FREE_TRIAL_PLAN_ID);
  if (paidActive) {
    return NextResponse.json({
      ok: true,
      granted: false,
      reason: 'paid_skip' as const,
      message: undefined,
    });
  }

  const hadFreeTrialPlan = list.some((s) => s.plan_id === FREE_TRIAL_PLAN_ID);
  if (hadFreeTrialPlan) {
    const activeLike = list.some(
      (s) => s.plan_id === FREE_TRIAL_PLAN_ID && (s.status === 'trial' || s.status === 'active'),
    );
    const reason = activeLike ? ('already_has_trial' as const) : ('already_had_free_trial_plan' as const);
    return NextResponse.json({
      ok: true,
      granted: activeLike,
      reason,
      message: undefined,
    });
  }

  const logDenied = async (denyReason: string, trialGranted: boolean) => {
    await admin.from('atlas_trial_events').insert({
      user_id: user.id,
      email_normalized: emailNormalized,
      ip_address: ip || null,
      user_agent: userAgent || null,
      device_fingerprint: deviceFingerprint || null,
      trial_granted: trialGranted,
      deny_reason: denyReason,
    });
  };

  if (!user.email_confirmed_at) {
    await logDenied('email_not_confirmed', false);
    return NextResponse.json({
      ok: true,
      granted: false,
      reason: 'email_not_confirmed' as const,
      message:
        'Confirmez votre adresse e-mail (lien reçu dans la boîte de réception) pour activer l’essai gratuit. Votre compte reste créé.',
    });
  }

  const { data: emailHit } = await admin
    .from('atlas_trial_events')
    .select('id')
    .eq('email_normalized', emailNormalized)
    .eq('trial_granted', true)
    .limit(1)
    .maybeSingle();

  if (emailHit) {
    await logDenied('already_used_email', false);
    return NextResponse.json({
      ok: true,
      granted: false,
      reason: 'already_used_email' as const,
      message:
        'Un essai gratuit a déjà été activé pour cette adresse e-mail. Votre compte est actif — choisissez une offre payante pour continuer.',
    });
  }

  if (deviceFingerprint) {
    const { data: fpHit } = await admin
      .from('atlas_trial_events')
      .select('id')
      .eq('device_fingerprint', deviceFingerprint)
      .eq('trial_granted', true)
      .limit(1)
      .maybeSingle();

    if (fpHit) {
      await logDenied('already_used_device', false);
      return NextResponse.json({
        ok: true,
        granted: false,
        reason: 'already_used_device' as const,
        message:
          'Un essai gratuit a déjà été utilisé depuis cet appareil ou navigateur. Votre compte est actif — passez à une offre payante pour débloquer toutes les fonctions.',
      });
    }
  }

  if (ip) {
    const windowStart = new Date(Date.now() - IP_WINDOW_DAYS * 86_400_000).toISOString();
    const { count, error: cErr } = await admin
      .from('atlas_trial_events')
      .select('id', { count: 'exact', head: true })
      .eq('trial_granted', true)
      .eq('ip_address', ip)
      .gte('created_at', windowStart);

    if (!cErr && (count ?? 0) >= MAX_GRANTED_TRIALS_PER_IP) {
      await logDenied('ip_trial_cap', false);
      return NextResponse.json({
        ok: true,
        granted: false,
        reason: 'ip_trial_cap' as const,
        message:
          'Le nombre maximal d’essais gratuits depuis cette connexion réseau a été atteint. Votre compte est actif — contactez le support ou souscrivez une offre payante.',
      });
    }
  }

  const start = todayYmd();
  const end = addDaysYmd(start, TRIAL_DAYS);

  const { data: grantEvent, error: insEvErr } = await admin
    .from('atlas_trial_events')
    .insert({
      user_id: user.id,
      email_normalized: emailNormalized,
      ip_address: ip || null,
      user_agent: userAgent || null,
      device_fingerprint: deviceFingerprint || null,
      trial_granted: true,
      deny_reason: null,
    })
    .select('id')
    .single();

  if (insEvErr) {
    const code = (insEvErr as { code?: string }).code;
    if (code === '23505') {
      const { data: subsRace } = await admin
        .from('atlas_subscriptions')
        .select('id, plan_id, status')
        .eq('user_id', user.id)
        .eq('plan_id', FREE_TRIAL_PLAN_ID)
        .in('status', ['trial', 'active'])
        .limit(1);
      if (subsRace?.length) {
        return NextResponse.json({
          ok: true,
          granted: true,
          reason: 'already_has_trial' as const,
          message: undefined,
        });
      }
      return NextResponse.json({
        ok: true,
        granted: false,
        reason: 'already_used_email' as const,
        message:
          'Un essai gratuit a déjà été activé pour cette adresse e-mail. Votre compte est actif — choisissez une offre payante pour continuer.',
      });
    }
    return NextResponse.json(
      { ok: false, granted: false, reason: 'service_unavailable' as const, message: 'Impossible d’activer l’essai pour le moment.' },
      { status: 500 },
    );
  }

  const grantEventId = grantEvent?.id as string | undefined;

  const { error: insSubErr } = await admin.from('atlas_subscriptions').insert({
    user_id: user.id,
    plan_id: FREE_TRIAL_PLAN_ID,
    status: 'trial',
    start_date: start,
    end_date: end,
    payment_request_id: null,
    metadata: { source: 'trial_claim_api', anti_abuse: true },
  });

  if (insSubErr) {
    if ((insSubErr as { code?: string }).code === '23505') {
      if (grantEventId) await admin.from('atlas_trial_events').delete().eq('id', grantEventId);
      return NextResponse.json({
        ok: true,
        granted: true,
        reason: 'already_has_trial' as const,
        message: undefined,
      });
    }
    if (grantEventId) await admin.from('atlas_trial_events').delete().eq('id', grantEventId);
    return NextResponse.json(
      { ok: false, granted: false, reason: 'service_unavailable' as const, message: 'Impossible d’activer l’essai pour le moment.' },
      { status: 500 },
    );
  }

  const sync = await syncProfileEntitlementFromAtlas(admin, user.id);
  if (!sync.ok) {
    console.warn('[trial/claim] profile_sync', sync.error);
  }

  try {
    await applyPendingReferralWelcomeOnTrialGrant(admin, user.id);
  } catch {
    // non-blocking
  }

  void (async () => {
    try {
      const { data: full } = await admin.auth.admin.getUserById(user.id);
      const addr = full.user?.email;
      if (!addr) return;
      const meta = full.user?.user_metadata as Record<string, unknown> | undefined;
      const displayName =
        typeof meta?.full_name === 'string' ? meta.full_name : typeof meta?.name === 'string' ? meta.name : null;
      await sendWelcomeLifecycleEmail(admin, user.id, addr, displayName);
    } catch {
      // non-blocking
    }
  })();

  return NextResponse.json({
    ok: true,
    granted: true,
    reason: 'granted' as const,
    message: 'Votre essai gratuit de 7 jours est activé.',
  });
}
