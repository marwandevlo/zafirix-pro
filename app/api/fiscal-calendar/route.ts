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
import {
  getTaxCalendarPayload,
  markDeadlineFiled,
  recordComplianceEvent,
  scanAndAlertTaxDeadlines,
  syncTaxDeadlines,
  updateNotificationPreferences,
} from '@/app/lib/atlas-tax-calendar-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const companyId = new URL(request.url).searchParams.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const sync = new URL(request.url).searchParams.get('sync') !== 'false';

  try {
    const payload = await getTaxCalendarPayload(admin, session.userId, access.companyId, { sync });
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'calendar_load_failed';
    return mapDbError({ message: msg }, { ok: false, deadlines: [], events: [], counts: { red: 0, orange: 0, green: 0, total: 0, filed: 0 } });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as Record<string, unknown>;
  const action = body.action as string | undefined;

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId as string | undefined);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  if (action === 'sync') {
    const deadlines = await syncTaxDeadlines(admin, session.userId, access.companyId);
    await recordComplianceEvent(admin, {
      userId: session.userId,
      companyId: access.companyId,
      eventType: 'sync',
      title: 'Calendrier fiscal synchronisé',
      body: `${deadlines.length} échéance(s)`,
    });
    return NextResponse.json({ ok: true, synced: deadlines.length });
  }

  if (action === 'mark_filed' && body.deadlineId) {
    const deadline = await markDeadlineFiled(admin, session.userId, access.companyId, String(body.deadlineId));
    if (!deadline) return apiBadRequest('deadline_not_found', apiErrorMessageFr('not_found'));
    return NextResponse.json({ ok: true, deadline });
  }

  if (action === 'trigger_alerts') {
    const result = await scanAndAlertTaxDeadlines(admin, session.userId, access.companyId);
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === 'update_preferences') {
    const prefs = await updateNotificationPreferences(admin, session.userId, access.companyId, {
      emailEnabled: body.emailEnabled as boolean | undefined,
      whatsappEnabled: body.whatsappEnabled as boolean | undefined,
      inAppEnabled: body.inAppEnabled as boolean | undefined,
      alertDays: body.alertDays as number[] | undefined,
      categories: body.categories as string[] | undefined,
      accountantEmail: body.accountantEmail as string | undefined,
      accountantPhone: body.accountantPhone as string | undefined,
      accountantName: body.accountantName as string | undefined,
      managerEmail: body.managerEmail as string | undefined,
      managerPhone: body.managerPhone as string | undefined,
    });
    return NextResponse.json({ ok: true, preferences: prefs });
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}
