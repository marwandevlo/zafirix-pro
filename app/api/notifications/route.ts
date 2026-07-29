import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
  apiUnauthorized,
  mapDbError,
} from '@/app/lib/atlas-api-response';
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
  if (!session.ok) return apiUnauthorized();

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10));

  const admin = getSupabaseServiceRoleClient();

  if (companyId) {
    const access = await requireApiCompanyAccess(admin, session.userId, companyId);
    if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));
  }

  let query = admin
    .from('zafirix_notifications')
    .select('*')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) return mapDbError(error, { notifications: [], unreadCount: 0 });

  const notifications = (data ?? []).map((r) => rowToNotification(r as Record<string, unknown>));
  const unread = notifications.filter((n) => n.status === 'sent').length;

  return NextResponse.json({ ok: true, notifications, unreadCount: unread });
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as {
    action?: 'dispatch_all';
    companyId?: string;
  };

  if (body.action !== 'dispatch_all' || !body.companyId) {
    return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const counts = await runNotificationDispatchers(admin, session.userId, access.companyId);
  return NextResponse.json({ ok: true, counts });
}
