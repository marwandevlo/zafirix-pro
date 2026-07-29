import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { runNotificationDispatchers } from '@/app/lib/atlas-notifications-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rowToNotification(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    channel: row.channel,
    category: row.category,
    title: String(row.title ?? ''),
    body: (row.body as string | null) ?? null,
    entityType: (row.entity_type as string | null) ?? null,
    entityId: (row.entity_id as string | null) ?? null,
    status: row.status,
    scheduledAt: (row.scheduled_at as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10));

  const admin = getSupabaseServiceRoleClient();
  let query = admin
    .from('zafirix_notifications')
    .select('*')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const notifications = (data ?? []).map((r) => rowToNotification(r as Record<string, unknown>));
  const unread = notifications.filter((n) => n.status === 'sent').length;

  return NextResponse.json({ ok: true, notifications, unreadCount: unread });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json()) as {
    action?: 'dispatch_all';
    companyId?: string;
  };

  if (body.action !== 'dispatch_all' || !body.companyId) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();
  const counts = await runNotificationDispatchers(admin, session.userId, body.companyId);
  return NextResponse.json({ ok: true, counts });
}
