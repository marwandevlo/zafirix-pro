import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin } from '@/app/lib/admin/require-admin';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['pending_manual']);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
