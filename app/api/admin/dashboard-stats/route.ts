import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin, requireBearer } from '@/app/lib/admin/require-admin';

async function countByStatus(supabase: SupabaseClient, table: string, statuses: string[]) {
  const out: Record<string, number> = {};
  for (const status of statuses) {
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('status', status);
    out[status] = count ?? 0;
  }
  const { count: total } = await supabase.from(table).select('id', { count: 'exact', head: true });
  return { ...out, total: total ?? 0 };
}

type PaymentRequestRecentRow = { id: string; status: string | null; plan_id: string | null; created_at: string | null };
type SubUserIdRow = { user_id: string | null };

export async function GET(request: NextRequest) {
  try {
    if (atlasDataBackend() !== 'supabase') return NextResponse.json({ error: 'not_enabled' }, { status: 400 });

    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const token = requireBearer(request);
    if (!token) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Prefer service-role for cross-user aggregates when available.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
    const supabaseAdmin = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

    const baseClient = supabaseAdmin ?? supabaseUser;
    const warnings: string[] = [];
    if (!supabaseAdmin) warnings.push('SUPABASE_SERVICE_ROLE_KEY not set; some aggregates may be unavailable.');

    const paymentRequests = await countByStatus(baseClient, 'atlas_payment_requests', ['pending', 'paid', 'rejected']);
    const subscriptions = await countByStatus(baseClient, 'atlas_subscriptions', ['active', 'trial', 'cancelled']);

    let companies: { total: number; byPlan?: Record<string, number> } | undefined;
    try {
      const { count } = await baseClient.from('atlas_companies').select('id', { count: 'exact', head: true });
      companies = { total: count ?? 0 };
    } catch {
      // ignore
    }

    let users: { total: number; active: number; trial: number; paid: number } | undefined;
    if (supabaseAdmin) {
      let total = 0;
      for (let page = 1; page <= 10; page += 1) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) break;
        const batch = data?.users?.length ?? 0;
        total += batch;
        if (batch < 1000) break;
      }

      const distinctCount = async (status: string) => {
        const { data } = await supabaseAdmin.from('atlas_subscriptions').select('user_id').eq('status', status);
        const ids = new Set(
          ((data ?? []) as SubUserIdRow[]).map((r) => String(r.user_id ?? '')).filter(Boolean),
        );
        return ids.size;
      };

      const [trial, paid] = await Promise.all([distinctCount('trial'), distinctCount('active')]);
      users = { total, active: trial + paid, trial, paid };
    }

    const { data: recent } = await baseClient
      .from('atlas_payment_requests')
      .select('id, status, plan_id, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      paymentRequests,
      subscriptions,
      users,
      companies,
      recentPaymentRequests: ((recent ?? []) as PaymentRequestRecentRow[]).map((r) => ({
        id: String(r.id),
        status: String(r.status),
        planId: String(r.plan_id),
        createdAt: String(r.created_at ?? ''),
      })),
      system: { backend: 'supabase', localAdminMode: false },
      warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur';
    return NextResponse.json({ error: 'server_error', message }, { status: 500 });
  }
}

