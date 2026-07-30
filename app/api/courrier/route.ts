import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import {
  apiBadRequest,
  apiErrorMessageFr,
  apiForbidden,
  apiNotFound,
  apiUnauthorized,
  mapDbError,
} from '@/app/lib/atlas-api-response';
import {
  addCorrespondenceAttachment,
  CONFIDENTIALITY_LABELS,
  createCorrespondence,
  DIRECTION_LABELS,
  getCourrierPayload,
  LETTER_TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  updateCorrespondenceStatus,
} from '@/app/lib/atlas-courrier-server';
import type {
  CorrespondenceConfidentiality,
  CorrespondenceDirection,
  CorrespondenceLetterType,
  CorrespondencePriority,
  CorrespondenceStatus,
} from '@/app/types/atlas-courrier';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) return apiUnauthorized();

  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  if (!companyId) return apiBadRequest('company_id_required', apiErrorMessageFr('company_id_required'));

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, session.userId, companyId);
  if (!access.ok) return apiForbidden(apiErrorMessageFr(access.error));

  const direction = (url.searchParams.get('direction') ?? 'all') as CorrespondenceDirection | 'all';
  const status = (url.searchParams.get('status') ?? 'all') as CorrespondenceStatus | 'all';
  const letterType = (url.searchParams.get('letterType') ?? 'all') as CorrespondenceLetterType | 'all';
  const q = url.searchParams.get('q') ?? undefined;
  const dateFrom = url.searchParams.get('dateFrom') ?? undefined;
  const dateTo = url.searchParams.get('dateTo') ?? undefined;

  try {
    const payload = await getCourrierPayload(admin, session.userId, access.companyId, {
      direction,
      status,
      letterType,
      q,
      dateFrom,
      dateTo,
    });
    return NextResponse.json({
      ok: true,
      ...payload,
      directionLabels: DIRECTION_LABELS,
      letterTypeLabels: LETTER_TYPE_LABELS,
      statusLabels: STATUS_LABELS,
      priorityLabels: PRIORITY_LABELS,
      confidentialityLabels: CONFIDENTIALITY_LABELS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'courrier_load_failed';
    return mapDbError({ message: msg }, { items: [], summary: {}, events: [] });
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

  if (action === 'create' && body.subject && body.direction) {
    try {
      const item = await createCorrespondence(admin, session.userId, access.companyId, {
        direction: body.direction as CorrespondenceDirection,
        subject: String(body.subject),
        letterType: body.letterType as CorrespondenceLetterType | undefined,
        priority: body.priority as CorrespondencePriority | undefined,
        confidentiality: body.confidentiality as CorrespondenceConfidentiality | undefined,
        correspondenceDate: body.correspondenceDate as string | undefined,
        externalReference: body.externalReference as string | undefined,
        referenceNumber: body.referenceNumber as string | undefined,
        responseDueDate: body.responseDueDate as string | undefined,
        senderName: body.senderName as string | undefined,
        senderOrganization: body.senderOrganization as string | undefined,
        senderAddress: body.senderAddress as string | undefined,
        senderEmail: body.senderEmail as string | undefined,
        senderPhone: body.senderPhone as string | undefined,
        senderCity: body.senderCity as string | undefined,
        recipientName: body.recipientName as string | undefined,
        recipientOrganization: body.recipientOrganization as string | undefined,
        recipientAddress: body.recipientAddress as string | undefined,
        recipientEmail: body.recipientEmail as string | undefined,
        recipientPhone: body.recipientPhone as string | undefined,
        recipientCity: body.recipientCity as string | undefined,
        assignedTo: body.assignedTo as string | undefined,
        summary: body.summary as string | undefined,
        notes: body.notes as string | undefined,
        attachments: body.attachments as Array<{ fileName: string; fileUrl?: string; documentType?: string }> | undefined,
      });
      return NextResponse.json({ ok: true, item });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'update_status' && body.correspondenceId && body.status) {
    try {
      const item = await updateCorrespondenceStatus(
        admin,
        session.userId,
        access.companyId,
        String(body.correspondenceId),
        body.status as CorrespondenceStatus,
        {
          assignedTo: body.assignedTo as string | undefined,
          notes: body.notes as string | undefined,
        },
      );
      if (!item) return apiNotFound('Courrier introuvable.');
      return NextResponse.json({ ok: true, item });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  if (action === 'add_attachment' && body.correspondenceId && body.fileName) {
    try {
      const attachment = await addCorrespondenceAttachment(
        admin,
        session.userId,
        access.companyId,
        String(body.correspondenceId),
        {
          fileName: String(body.fileName),
          fileUrl: body.fileUrl as string | undefined,
          documentType: body.documentType as string | undefined,
        },
      );
      if (!attachment) return apiNotFound('Courrier introuvable.');
      return NextResponse.json({ ok: true, attachment });
    } catch (e) {
      return mapDbError(e as Error);
    }
  }

  return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
}
