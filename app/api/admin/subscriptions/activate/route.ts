import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getAtlasPlanById } from '@/app/lib/atlas-pricing-plans';
import { requireAdmin, requireBearer } from '@/app/lib/admin/require-admin';

function isUuidLike(value: string): boolean {
  // Accept standard UUIDs (case-insensitive).
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function todayYmd(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const safeDays = Number.isFinite(days) ? Math.max(0, Math.trunc(days)) : 0;
  const [y, m, d] = ymd.split('-').map((v) => Number.parseInt(v, 10));
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + safeDays);
  return todayYmd(dt);
}

export async function POST(request: NextRequest) {
  try {
    if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const token = requireBearer(request);
    if (!token) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const body = (await request.json().catch(() => null)) as null | { paymentRequestId?: string };
    const paymentRequestId = (body?.paymentRequestId ?? '').trim();
    if (!paymentRequestId) return NextResponse.json({ error: 'invalid_reference' }, { status: 400 });
    if (!isUuidLike(paymentRequestId)) return NextResponse.json({ error: 'invalid_reference' }, { status: 400 });

    const { data: reqRow, error: reqErr } = await supabase
      .from('atlas_payment_requests')
      .select('id, user_id, plan_id, billing_period, status')
      .eq('id', paymentRequestId)
      .single();

    if (reqErr || !reqRow) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const plan = getAtlasPlanById(String(reqRow.plan_id));
    if (!plan) return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });

    const start = todayYmd();
    const end = plan.billingPeriod === 'trial' ? addDaysYmd(start, plan.durationDays ?? 7) : addDaysYmd(start, 365);

    if (reqRow.status !== 'paid') {
      return NextResponse.json({ error: 'payment_not_marked_paid' }, { status: 400 });
    }

    const { error: subErr } = await supabase.from('atlas_subscriptions').insert({
      user_id: reqRow.user_id,
      plan_id: plan.id,
      status: 'active',
      start_date: start,
      end_date: end,
      payment_request_id: reqRow.id,
      metadata: {},
    });

    if (subErr) return NextResponse.json({ error: 'db_error' }, { status: 500 });

    return NextResponse.json({ ok: true, startDate: start, endDate: end });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur';
    return NextResponse.json({ error: 'server_error', message }, { status: 500 });
  }
}

