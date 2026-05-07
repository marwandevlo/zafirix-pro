import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { getAtlasPlanById } from '@/app/lib/atlas-pricing-plans';
import { requireAdmin } from '@/app/lib/admin/require-admin';

export type RevenueOverviewResponse = {
  subscriptionsManual: { pending: number; active: number; canceled: number };
  subscriptionsPaddle: { active: number };
  atlasActiveNonTrial: number;
  mrrMadEstimate: number;
  arrMadEstimate: number;
  usersTotal: number;
};

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: subRows } = await admin.from('subscriptions').select('status, payment_method');
  const manual = { pending: 0, active: 0, canceled: 0 };
  let paddleActive = 0;
  for (const r of subRows ?? []) {
    const row = r as { status?: string; payment_method?: string };
    const pm = String(row.payment_method ?? 'manual');
    const st = String(row.status ?? '');
    if (pm === 'paddle') {
      if (st === 'active') paddleActive += 1;
      continue;
    }
    if (st === 'pending_manual') manual.pending += 1;
    else if (st === 'active') manual.active += 1;
    else if (st === 'canceled') manual.canceled += 1;
  }

  const { data: atlasRows } = await admin.from('atlas_subscriptions').select('plan_id, status').eq('status', 'active');

  let mrr = 0;
  let atlasActive = 0;
  for (const r of atlasRows ?? []) {
    const planId = String((r as { plan_id?: string }).plan_id ?? '');
    if (!planId || planId === 'free-trial') continue;
    atlasActive += 1;
    const p = getAtlasPlanById(planId);
    if (p && p.billingPeriod === 'year' && p.price > 0) {
      mrr += p.price / 12;
    }
  }

  let usersTotal = 0;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    const batch = data?.users?.length ?? 0;
    usersTotal += batch;
    if (batch < 1000) break;
  }

  const body: RevenueOverviewResponse = {
    subscriptionsManual: manual,
    subscriptionsPaddle: { active: paddleActive },
    atlasActiveNonTrial: atlasActive,
    mrrMadEstimate: Math.round(mrr),
    arrMadEstimate: Math.round(mrr * 12),
    usersTotal,
  };

  return NextResponse.json(body);
}
