import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin, requireBearer } from '@/app/lib/admin/require-admin';

function isUuidLike(value: string): boolean {
  // Accept standard UUIDs (case-insensitive).
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

    const { data, error } = await supabase
      .from('atlas_payment_requests')
      .update({ status: 'paid' })
      .eq('id', paymentRequestId)
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
    if (!data?.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur';
    return NextResponse.json({ error: 'server_error', message }, { status: 500 });
  }
}

