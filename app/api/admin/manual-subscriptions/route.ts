import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { planDisplayName } from '@/app/lib/atlas-manual-subscription';
import { requireAdmin } from '@/app/lib/admin/require-admin';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { getAtlasPlanById } from '@/app/lib/atlas-pricing-plans';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Admin row shape for /admin/manual-payments.
 * Sourced from public.atlas_payment_requests (same table as /api/payments/manual-request).
 * Status aliases keep the existing Maroc UI filters working:
 *   pending_manual ↔ pending, active ↔ paid, canceled ↔ rejected
 */
export type ManualSubscriptionRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  plan: string;
  plan_label: string;
  status: string;
  payment_method: string;
  manual_provider: string | null;
  amount_mad: number;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentRequestRow = {
  id: string;
  user_id: string;
  plan_id: string;
  amount_mad: number | null;
  currency: string | null;
  payment_method: string | null;
  manual_provider: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeStatusFilter(raw: string): 'pending' | 'paid' | 'rejected' | null {
  const s = raw.trim().toLowerCase();
  if (!s || s === 'all') return null;
  if (s === 'pending' || s === 'pending_manual') return 'pending';
  if (s === 'paid' || s === 'active') return 'paid';
  if (s === 'rejected' || s === 'canceled' || s === 'cancelled') return 'rejected';
  return null;
}

/** Map DB status → UI-friendly status used by ManualPaymentsAdminClient filters/actions. */
function toUiStatus(dbStatus: string): string {
  const s = dbStatus.trim().toLowerCase();
  if (s === 'pending') return 'pending_manual';
  if (s === 'paid') return 'active';
  if (s === 'rejected') return 'canceled';
  return s || 'pending_manual';
}

function resolvePlanLabel(planId: string): string {
  const fromCatalog = getAtlasPlanById(planId);
  if (fromCatalog) return fromCatalog.name;
  return planDisplayName(planId);
}

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let admin: ReturnType<typeof getSupabaseServiceRoleClient>;
  try {
    admin = getSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/admin/manual-subscriptions] service_role_missing', { message: msg });
    return NextResponse.json({ error: 'server_misconfigured', message: msg }, { status: 503 });
  }

  const statusFilter = normalizeStatusFilter(request.nextUrl.searchParams.get('status') ?? '');
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();

  let query = admin
    .from('atlas_payment_requests')
    .select(
      'id, user_id, plan_id, amount_mad, currency, payment_method, manual_provider, status, metadata, created_at, updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error('[api/admin/manual-subscriptions] atlas_payment_requests_query_failed', {
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
        details: (error as { details?: string }).details ?? null,
        hint: (error as { hint?: string }).hint ?? null,
      },
      { status: 500 },
    );
  }

  const raw = (rows ?? []) as PaymentRequestRow[];
  const userIds = Array.from(new Set(raw.map((r) => String(r.user_id ?? '')).filter(Boolean)));

  const emailById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id, email')
      .in('id', userIds)
      .limit(500);

    if (profileError) {
      console.error('[api/admin/manual-subscriptions] profiles_lookup_failed', {
        code: (profileError as { code?: string }).code ?? null,
        message: profileError.message,
      });
    } else {
      for (const p of (profiles ?? []) as Array<{ id: string; email: string | null }>) {
        emailById.set(String(p.id), String(p.email ?? ''));
      }
    }

    // Fill gaps via auth admin when profiles.email is empty.
    const missing = userIds.filter((id) => !emailById.get(id));
    for (const userId of missing.slice(0, 50)) {
      try {
        const { data } = await admin.auth.admin.getUserById(userId);
        const email = data.user?.email?.trim();
        if (email) emailById.set(userId, email);
      } catch {
        // ignore per-user lookup failures
      }
    }
  }

  let list: ManualSubscriptionRow[] = raw.map((r) => {
    const planId = String(r.plan_id ?? '');
    const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
    const metaEmail =
      meta && typeof meta === 'object' && typeof (meta as { user_email?: unknown }).user_email === 'string'
        ? String((meta as { user_email: string }).user_email).trim()
        : '';
    const addonNote =
      meta && typeof meta === 'object' && 'kind' in meta && meta.kind === 'company_slot_addon'
        ? `addon:${String((meta as { addonId?: unknown }).addonId ?? '')}`
        : null;

    return {
      id: String(r.id),
      user_id: String(r.user_id),
      user_email: emailById.get(String(r.user_id)) || metaEmail || null,
      plan: planId,
      plan_label: resolvePlanLabel(planId),
      status: toUiStatus(String(r.status ?? 'pending')),
      payment_method: String(r.payment_method ?? 'manual'),
      manual_provider: typeof r.manual_provider === 'string' ? r.manual_provider : null,
      amount_mad: Number(r.amount_mad ?? 0),
      currency: String(r.currency ?? 'MAD'),
      notes: addonNote,
      created_at: String(r.created_at ?? ''),
      updated_at: String(r.updated_at ?? r.created_at ?? ''),
    };
  });

  if (q) {
    list = list.filter((r) => (r.user_email ?? '').toLowerCase().includes(q) || r.plan.toLowerCase().includes(q));
  }

  return NextResponse.json({ rows: list, source: 'atlas_payment_requests' });
}
