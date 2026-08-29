import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin } from '@/app/lib/admin/require-admin';

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ ok: false, error: 'not_enabled' }, { status: 400 });
  }

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'misconfigured' }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const [refs, bals, txs] = await Promise.all([
      admin.from('atlas_referrals').select('status'),
      admin.from('atlas_affiliate_balances').select('user_id, lifetime_earned, available_balance, pending_balance, paid_out'),
      admin
        .from('atlas_affiliate_transactions')
        .select('id, referrer_user_id, commission_amount, commission_percent, status, created_at, source')
        .order('created_at', { ascending: false })
        .limit(40),
    ]);

    const missingTable =
      refs.error?.message?.includes('does not exist') ||
      bals.error?.message?.includes('does not exist') ||
      txs.error?.message?.includes('does not exist');
    if (missingTable) {
      return NextResponse.json({
        ok: true,
        clicks: 0,
        signups: 0,
        activated: 0,
        lifetimeEarned: 0,
        pendingEarnings: 0,
        paidOut: 0,
        affiliates: 0,
        leaders: [],
        transactions: [],
        warning: 'Affiliate tables are not migrated yet.',
      });
    }

    let clicks = 0;
    let signups = 0;
    let activated = 0;
    for (const row of refs.data ?? []) {
      const status = String((row as { status?: string }).status ?? '');
      if (status === 'clicked') clicks += 1;
      else if (status === 'signed_up') signups += 1;
      else if (status === 'activated') activated += 1;
    }

    let lifetimeEarned = 0;
    let pendingEarnings = 0;
    let paidOut = 0;
    const leaders = (bals.data ?? []).map((row) => {
      const r = row as {
        user_id?: string;
        lifetime_earned?: number;
        available_balance?: number;
        pending_balance?: number;
        paid_out?: number;
      };
      const lifetime = Number(r.lifetime_earned || 0);
      const pending = Number(r.pending_balance ?? r.available_balance ?? 0);
      const paid = Number(r.paid_out || 0);
      lifetimeEarned += lifetime;
      pendingEarnings += pending;
      paidOut += paid;
      return {
        userId: String(r.user_id ?? ''),
        lifetimeEarned: lifetime,
        pendingEarnings: pending,
        paidOut: paid,
      };
    });
    leaders.sort((a, b) => b.lifetimeEarned - a.lifetimeEarned);

    const transactions = (txs.data ?? []).map((row) => {
      const r = row as {
        id?: string;
        referrer_user_id?: string;
        commission_amount?: number;
        commission_percent?: number;
        status?: string;
        created_at?: string;
        source?: string;
      };
      return {
        id: String(r.id ?? ''),
        referrerUserId: String(r.referrer_user_id ?? ''),
        commissionAmount: Number(r.commission_amount || 0),
        commissionPercent: Number(r.commission_percent || 0),
        status: String(r.status ?? 'pending'),
        source: String(r.source ?? ''),
        createdAt: String(r.created_at ?? ''),
      };
    });

    return NextResponse.json({
      ok: true,
      clicks,
      signups: signups + activated,
      activated,
      lifetimeEarned,
      pendingEarnings,
      paidOut,
      affiliates: leaders.length,
      leaders: leaders.slice(0, 20),
      transactions,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
