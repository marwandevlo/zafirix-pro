import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { dispatchNotification } from '@/app/lib/atlas-notifications-engine';
import type { NotificationCategory, NotificationChannel } from '@/app/types/atlas-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const body = (await request.json()) as {
    channel?: NotificationChannel;
    category?: NotificationCategory;
    title?: string;
    body?: string;
    companyId?: string;
    entityType?: string;
    entityId?: string;
    recipientEmail?: string;
    recipientPhone?: string;
  };

  if (!body.title || !body.channel || !body.category) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();
  const result = await dispatchNotification(admin, {
    userId: session.userId,
    companyId: body.companyId ?? null,
    channel: body.channel,
    category: body.category,
    title: body.title,
    body: body.body,
    entityType: body.entityType,
    entityId: body.entityId,
    recipientEmail: body.recipientEmail,
    recipientPhone: body.recipientPhone,
  });

  return NextResponse.json(result);
}
