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
  buildFeedbackDashboard,
  CHANNEL_LABELS,
  createFeedbackRequest,
  createFeedbackRequestForInvoice,
  createFeedbackRequestForProject,
  REQUEST_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
} from '@/app/lib/atlas-client-feedback-server';
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

  try {
    const dashboard = await buildFeedbackDashboard(
      admin,
      session.userId,
      access.companyId,
      request.nextUrl.origin,
    );
    return NextResponse.json({
      ok: true,
      ...dashboard,
      sourceTypeLabels: SOURCE_TYPE_LABELS,
      statusLabels: REQUEST_STATUS_LABELS,
      channelLabels: CHANNEL_LABELS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'feedback_load_failed';
    return mapDbError({ message: msg }, { requests: [], summary: {}, trends: [] });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const body = (await request.json()) as Record<string, unknown>;
  const action = body.action as string | undefined;

  if (!body.companyId) {
    return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, body.companyId as string);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const origin = request.nextUrl.origin;

  if (action === 'create_request' && body.subjectLabel) {
    try {
      const item = await createFeedbackRequest(admin, session.userId, access.companyId, {
        sourceType: (body.sourceType as 'invoice' | 'project' | 'manual') ?? 'manual',
        subjectLabel: String(body.subjectLabel),
        invoiceId: body.invoiceId as string | undefined,
        projectId: body.projectId as string | undefined,
        clientId: body.clientId as string | undefined,
        clientName: body.clientName as string | undefined,
        clientEmail: body.clientEmail as string | undefined,
        clientPhone: body.clientPhone as string | undefined,
        channel: body.channel as 'link' | 'whatsapp' | 'email' | 'manual' | undefined,
        markSent: body.markSent as boolean | undefined,
      }, origin);
      return NextResponse.json({ ok: true, item });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'create_for_invoice' && body.invoiceId) {
    try {
      const item = await createFeedbackRequestForInvoice(
        admin,
        session.userId,
        access.companyId,
        String(body.invoiceId),
        { channel: body.channel as 'whatsapp' | undefined, markSent: true },
        origin,
      );
      return NextResponse.json({ ok: true, item });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'create_for_project' && body.projectId) {
    try {
      const item = await createFeedbackRequestForProject(
        admin,
        session.userId,
        access.companyId,
        String(body.projectId),
        {
          clientName: body.clientName as string | undefined,
          channel: body.channel as 'link' | undefined,
          markSent: body.markSent as boolean | undefined,
        },
        origin,
      );
      return NextResponse.json({ ok: true, item });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}
