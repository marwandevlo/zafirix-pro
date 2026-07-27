import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin } from '@/app/lib/admin/require-admin';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logAtlasAdminAction } from '@/app/lib/admin/atlas-admin-audit';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Reject a pending manual checkout request in public.atlas_payment_requests.
 */
export async function POST(request: NextRequest) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as null | { id?: string };
  const id = String(body?.id ?? '').trim();
  if (!id || !isUuid(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  let admin: ReturnType<typeof getSupabaseServiceRoleClient>;
  try {
    admin = getSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[manual-subscriptions/reject] service_role_missing', { message: msg });
    return NextResponse.json({ error: 'server_misconfigured', message: msg }, { status: 503 });
  }

  const { data: updated, error } = await admin
    .from('atlas_payment_requests')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id, user_id');

  if (error) {
    console.error('[manual-subscriptions/reject] update_failed', {
      code: (error as { code?: string }).code ?? null,
      message: error.message,
    });
    return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 });
  }

  if (!updated?.length) {
    return NextResponse.json({ error: 'not_pending_or_already_processed' }, { status: 400 });
  }

  await logAtlasAdminAction({
    actorUserId: guard.adminUserId,
    action: 'manual_payment_reject',
    targetType: 'atlas_payment_requests',
    targetId: id,
    metadata: { user_id: (updated[0] as { user_id?: string }).user_id ?? null },
  });

  return NextResponse.json({ ok: true });
}
