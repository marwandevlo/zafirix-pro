import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { planDisplayName } from '@/app/lib/atlas-manual-subscription';
import { requireAdmin } from '@/app/lib/admin/require-admin';

export type ManualSubscriptionRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  plan: string;
  plan_label: string;
  status: string;
  payment_method: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? '';
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 });
  }

  const statusFilter = (request.nextUrl.searchParams.get('status') ?? '').trim().toLowerCase();
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = admin.from('subscriptions').select('*');
  if (statusFilter === 'pending_manual' || statusFilter === 'active' || statusFilter === 'canceled') {
    query = query.eq('status', statusFilter);
  }
  const { data: rows, error } = await query.order('created_at', { ascending: false }).limit(500);
  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  let list: ManualSubscriptionRow[] = (rows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    user_id: String(r.user_id),
    user_email: typeof r.user_email === 'string' ? r.user_email : null,
    plan: String(r.plan ?? ''),
    plan_label: planDisplayName(String(r.plan ?? '')),
    status: String(r.status ?? ''),
    payment_method: String(r.payment_method ?? 'manual'),
    notes: typeof r.notes === 'string' ? r.notes : null,
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
  }));

  if (q) {
    list = list.filter((r) => (r.user_email ?? '').toLowerCase().includes(q));
  }

  return NextResponse.json({ rows: list });
}
