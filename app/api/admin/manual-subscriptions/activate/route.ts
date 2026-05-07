import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getAtlasPlanById } from '@/app/lib/atlas-pricing-plans';
import { normalizeManualPlan } from '@/app/lib/atlas-manual-subscription';
import { sendEmailViaResend } from '@/app/lib/atlas-email-resend';
import { buildPaidSubscriptionActivatedEmailHtml } from '@/app/lib/atlas-email-templates';
import { getWhatsAppOpsPhoneDigits, sendWhatsAppMessage } from '@/app/lib/whatsapp-service';
import { requireAdmin } from '@/app/lib/admin/require-admin';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((v) => Number.parseInt(v, 10));
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Math.max(0, Math.trunc(days)));
  return todayYmd(dt);
}

export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const body = (await request.json().catch(() => null)) as null | { id?: string };
  const id = String(body?.id ?? '').trim();
  if (!id || !isUuid(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: row, error: readErr } = await admin.from('subscriptions').select('*').eq('id', id).single();
  if (readErr || !row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const planId = normalizeManualPlan(String((row as { plan?: string }).plan ?? ''));
  if (!planId) return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });

  const plan = getAtlasPlanById(planId);
  if (!plan || plan.billingPeriod === 'trial') {
    return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  }

  const userId = String((row as { user_id?: string }).user_id ?? '');
  if (!userId) return NextResponse.json({ error: 'invalid_user' }, { status: 400 });

  const start = todayYmd();
  const end = addDaysYmd(start, 365);

  const { data: updatedRows, error: upManual } = await admin
    .from('subscriptions')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending_manual')
    .select('id');

  if (upManual || !updatedRows?.length) {
    return NextResponse.json({ error: 'not_pending_or_already_processed' }, { status: 400 });
  }

  const { error: insSub } = await admin.from('atlas_subscriptions').insert({
    user_id: userId,
    plan_id: plan.id,
    status: 'active',
    start_date: start,
    end_date: end,
    payment_request_id: null,
    metadata: { source: 'manual_morocco', manual_subscription_id: id },
  });

  if (insSub) {
    console.error('[manual-subscriptions/activate] atlas insert', insSub);
    await admin
      .from('subscriptions')
      .update({ status: 'pending_manual', updated_at: new Date().toISOString() })
      .eq('id', id);
    return NextResponse.json({ error: 'atlas_subscription_failed' }, { status: 500 });
  }

  await admin
    .from('atlas_subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('plan_id', 'free-trial');

  const { data: userWrap } = await admin.auth.admin.getUserById(userId);
  const uemail = userWrap.user?.email?.trim();
  if (uemail) {
    const mail = buildPaidSubscriptionActivatedEmailHtml(plan.name, end);
    void sendEmailViaResend({ to: uemail, subject: mail.subject, html: mail.html });
  }

  const waText = `ZAFIRIX PRO — votre abonnement est activé 🚀\nForfait: ${plan.name}\nValable jusqu’au ${end}.`;
  void sendWhatsAppMessage(getWhatsAppOpsPhoneDigits(), `${waText}\nCompte: ${uemail ?? userId}`);

  return NextResponse.json({ ok: true, startDate: start, endDate: end });
}
