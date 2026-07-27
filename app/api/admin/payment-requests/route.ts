import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin } from '@/app/lib/admin/require-admin';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

/**
 * Lists public.atlas_payment_requests for /admin/payments.
 * Uses service-role so pending manual checkouts are visible regardless of RLS.
 */
export async function GET(request: NextRequest) {
  try {
    if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    let admin: ReturnType<typeof getSupabaseServiceRoleClient>;
    try {
      admin = getSupabaseServiceRoleClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[api/admin/payment-requests] service_role_missing', { message: msg });
      return NextResponse.json({ error: 'server_misconfigured', message: msg }, { status: 503 });
    }

    const url = new URL(request.url);
    const status = (url.searchParams.get('status') ?? '').trim().toLowerCase();
    const allowed = new Set(['pending', 'paid', 'rejected']);
    const filterStatus = allowed.has(status) ? status : '';

    let q = admin
      .from('atlas_payment_requests')
      .select(
        'id, user_id, plan_id, amount_mad, currency, billing_period, payment_method, manual_provider, status, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(500);

    if (filterStatus) q = q.eq('status', filterStatus);

    type PaymentRow = {
      id: string;
      user_id: string;
      plan_id: string;
      amount_mad: number | null;
      currency: string | null;
      billing_period: string | null;
      payment_method: string | null;
      manual_provider: string | null;
      status: string | null;
      created_at: string | null;
    };

    const { data, error } = await q;
    if (error) {
      console.error('[api/admin/payment-requests] query_failed', {
        code: (error as { code?: string }).code ?? null,
        message: error.message,
        details: (error as { details?: string }).details ?? null,
        hint: (error as { hint?: string }).hint ?? null,
      });
      return NextResponse.json(
        {
          error: 'db_error',
          message: error.message,
          code: (error as { code?: string }).code ?? null,
          hint: (error as { hint?: string }).hint ?? null,
        },
        { status: 500 },
      );
    }

    const raw = (data ?? []) as PaymentRow[];
    const userIds = Array.from(new Set(raw.map((r) => String(r.user_id ?? '')).filter(Boolean)));
    const emailById = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: profiles } = await admin.from('profiles').select('id, email').in('id', userIds).limit(500);
      for (const p of (profiles ?? []) as Array<{ id: string; email: string | null }>) {
        emailById.set(String(p.id), String(p.email ?? ''));
      }
    }

    return NextResponse.json({
      paymentRequests: raw.map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        userEmail: emailById.get(String(r.user_id)) || null,
        planId: String(r.plan_id),
        amountMad: Number(r.amount_mad ?? 0),
        currency: String(r.currency ?? 'MAD'),
        billingPeriod: String(r.billing_period ?? 'year'),
        paymentMethod: String(r.payment_method ?? ''),
        manualProvider: r.manual_provider ?? null,
        status: String(r.status ?? ''),
        createdAt: String(r.created_at ?? ''),
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur';
    console.error('[api/admin/payment-requests] unexpected_error', { message });
    return NextResponse.json({ error: 'server_error', message }, { status: 500 });
  }
}
