import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { ATLAS_INCIDENT_HOTFIX_GROWTH } from '@/app/lib/atlas-hotfix';
import { checkPaymentRateLimit } from '@/app/lib/payment-rate-limit';
import { normalizeManualPlan, planDisplayName } from '@/app/lib/atlas-manual-subscription';
import { sendEmailViaResend } from '@/app/lib/atlas-email-resend';
import { getPlanCompanyCap } from '@/app/lib/atlas-pricing-plans';
import { recordServerAnalyticsEvent } from '@/app/lib/server-analytics-event';
import { getWhatsAppOpsPhoneDigits, sendWhatsAppMessage } from '@/app/lib/whatsapp-service';
import { buildManualRequestAcknowledgedEmailHtml } from '@/app/lib/atlas-email-templates';

function clientIp(request: NextRequest): string {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function bearer(request: NextRequest): string | null {
  const h = request.headers.get('authorization') ?? '';
  if (!h.toLowerCase().startsWith('bearer ')) return null;
  const t = h.slice(7).trim();
  return t || null;
}

export async function POST(request: NextRequest) {
  if (ATLAS_INCIDENT_HOTFIX_GROWTH) {
    console.warn('[api/manual-subscription] blocked by ATLAS_INCIDENT_HOTFIX_GROWTH');
    return NextResponse.json(
      {
        ok: false,
        error: 'temporarily_unavailable',
        message: 'Les paiements manuels sont temporairement désactivés (incident hotfix).',
      },
      { status: 503 },
    );
  }
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ ok: false, error: 'not_enabled' }, { status: 400 });
  }

  const ip = clientIp(request);
  const rate = checkPaymentRateLimit(`manual_sub:${ip}`);
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  const token = bearer(request);
  if (!token) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as null | { plan?: string; user_id?: string };
  const planNorm = normalizeManualPlan(String(body?.plan ?? ''));
  if (!planNorm) {
    return NextResponse.json({ ok: false, error: 'invalid_plan' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: auth, error: authErr } = await userClient.auth.getUser();
  if (authErr || !auth.user?.id) {
    return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 });
  }

  const userId = auth.user.id;
  if (body?.user_id && String(body.user_id).trim() !== userId) {
    return NextResponse.json({ ok: false, error: 'user_mismatch' }, { status: 403 });
  }

  const email = auth.user.email?.trim() ?? '';
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const planStored = planNorm === 'business' ? 'business' : planNorm;
  const companyLimit = getPlanCompanyCap(planStored);

  const { error: cancelErr } = await admin
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'pending_manual');
  if (cancelErr) {
    console.warn('[manual-subscription] cancel prior pending', cancelErr.message);
  }

  const { data: inserted, error: insErr } = await admin
    .from('subscriptions')
    .insert({
      user_id: userId,
      user_email: email || null,
      plan: planStored,
      status: 'pending_manual',
      payment_method: 'manual',
      company_limit: companyLimit,
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    console.error('[manual-subscription] insert', insErr);
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }

  console.info('[manual-subscription] created', { id: inserted.id, userId, plan: planStored });

  await recordServerAnalyticsEvent(admin, {
    userId,
    eventName: 'manual_payment_requested',
    path: '/api/manual-subscription',
    metadata: { plan: planStored, request_id: inserted.id },
  });

  const planLabel = planDisplayName(planStored);
  if (email) {
    const ack = buildManualRequestAcknowledgedEmailHtml(planLabel);
    void sendEmailViaResend({ to: email, subject: ack.subject, html: ack.html });
  }

  const opsMsg = `Bonjour — nouvelle demande paiement manuel ZAFIRIX PRO.\nClient: ${email || userId}\nPlan: ${planLabel}\nRéf: ${inserted.id}`;
  void sendWhatsAppMessage(getWhatsAppOpsPhoneDigits(), opsMsg);

  const alertTo = process.env.ADMIN_MANUAL_SUBSCRIPTION_EMAIL?.trim();
  if (alertTo && email) {
    const subject = `ZAFIRIX PRO — demande paiement manuel (${planStored})`;
    const html = `<p>Nouvelle demande manuelle.</p><ul><li>Email: ${email}</li><li>Plan: ${planStored}</li><li>Id: ${inserted.id}</li></ul>`;
    void sendEmailViaResend({ to: alertTo, subject, html });
  }

  return NextResponse.json({
    ok: true,
    message: 'Votre demande a été enregistrée. Notre équipe vous contactera après validation du paiement.',
    id: inserted.id,
  });
}
