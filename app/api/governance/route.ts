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
  ACCESS_TIER_LABELS,
  archiveGovernanceItem,
  ASSEMBLY_TYPE_LABELS,
  BOARD_ACCESS_LABELS,
  BOARD_ROLE_LABELS,
  createBoardMeeting,
  createBoardMember,
  createGovernanceDocument,
  createShareholderResolution,
  getGovernanceArchive,
  GOVERNANCE_DOC_STATUS_LABELS,
  GOVERNANCE_DOC_TYPE_LABELS,
  MEETING_STATUS_LABELS,
  MEETING_TYPE_LABELS,
  RESOLUTION_STATUS_LABELS,
  updateBoardMemberAccess,
} from '@/app/lib/atlas-governance-server';
import type {
  AssemblyType,
  BoardAccessLevel,
  BoardRole,
  GovernanceAccessTier,
  GovernanceDocumentType,
  MeetingType,
} from '@/app/types/atlas-corporate-governance';
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

  const tab = url.searchParams.get('tab') as 'all' | 'meetings' | 'resolutions' | 'documents' | null;
  const tier = url.searchParams.get('tier') as GovernanceAccessTier | 'all' | null;
  const q = url.searchParams.get('q') ?? undefined;

  try {
    const payload = await getGovernanceArchive(admin, session.userId, access.companyId, {
      q,
      tab: tab ?? 'all',
      tier: tier ?? 'all',
    });
    return NextResponse.json({
      ok: true,
      ...payload,
      accessTierLabels: ACCESS_TIER_LABELS,
      boardRoleLabels: BOARD_ROLE_LABELS,
      boardAccessLabels: BOARD_ACCESS_LABELS,
      meetingTypeLabels: MEETING_TYPE_LABELS,
      meetingStatusLabels: MEETING_STATUS_LABELS,
      assemblyTypeLabels: ASSEMBLY_TYPE_LABELS,
      resolutionStatusLabels: RESOLUTION_STATUS_LABELS,
      documentTypeLabels: GOVERNANCE_DOC_TYPE_LABELS,
      documentStatusLabels: GOVERNANCE_DOC_STATUS_LABELS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'governance_load_failed';
    if (msg === 'governance_access_denied') {
      return apiForbidden('Accès réservé aux membres du conseil et à la direction.');
    }
    return mapDbError(e as Error, { access: null, meetings: [], resolutions: [], documents: [] });
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

  try {
    if (action === 'create_board_member' && body.fullName) {
      const member = await createBoardMember(admin, session.userId, access.companyId, {
        fullName: String(body.fullName),
        email: body.email as string | undefined,
        memberUserId: body.memberUserId as string | undefined,
        boardRole: body.boardRole as BoardRole | undefined,
        accessLevel: body.accessLevel as BoardAccessLevel | undefined,
        appointedAt: body.appointedAt as string | undefined,
        termEnd: body.termEnd as string | undefined,
        notes: body.notes as string | undefined,
      });
      return NextResponse.json({ ok: true, member });
    }

    if (action === 'create_meeting' && body.title && body.meetingDate) {
      const meeting = await createBoardMeeting(admin, session.userId, access.companyId, {
        title: String(body.title),
        meetingDate: String(body.meetingDate),
        meetingType: body.meetingType as MeetingType | undefined,
        location: body.location as string | undefined,
        agenda: body.agenda as string | undefined,
        minutesBody: body.minutesBody as string | undefined,
        decisionsSummary: body.decisionsSummary as string | undefined,
        accessTier: body.accessTier as GovernanceAccessTier | undefined,
        attendees: body.attendees as string[] | undefined,
        fileUrl: body.fileUrl as string | undefined,
        fileName: body.fileName as string | undefined,
      });
      return NextResponse.json({ ok: true, meeting });
    }

    if (action === 'create_resolution' && body.title && body.resolutionText && body.resolutionDate) {
      const resolution = await createShareholderResolution(admin, session.userId, access.companyId, {
        title: String(body.title),
        resolutionText: String(body.resolutionText),
        resolutionDate: String(body.resolutionDate),
        assemblyType: body.assemblyType as AssemblyType | undefined,
        votesFor: body.votesFor != null ? Number(body.votesFor) : undefined,
        votesAgainst: body.votesAgainst != null ? Number(body.votesAgainst) : undefined,
        votesAbstain: body.votesAbstain != null ? Number(body.votesAbstain) : undefined,
        quorumPct: body.quorumPct != null ? Number(body.quorumPct) : undefined,
        capitalRepresentedPct: body.capitalRepresentedPct != null ? Number(body.capitalRepresentedPct) : undefined,
        accessTier: body.accessTier as GovernanceAccessTier | undefined,
        fileUrl: body.fileUrl as string | undefined,
        fileName: body.fileName as string | undefined,
        meetingId: body.meetingId as string | undefined,
      });
      return NextResponse.json({ ok: true, resolution });
    }

    if (action === 'create_document' && body.title) {
      const document = await createGovernanceDocument(admin, session.userId, access.companyId, {
        title: String(body.title),
        documentType: body.documentType as GovernanceDocumentType | undefined,
        description: body.description as string | undefined,
        versionLabel: body.versionLabel as string | undefined,
        effectiveDate: body.effectiveDate as string | undefined,
        reviewDate: body.reviewDate as string | undefined,
        accessTier: body.accessTier as GovernanceAccessTier | undefined,
        fileUrl: body.fileUrl as string | undefined,
        fileName: body.fileName as string | undefined,
        tags: body.tags as string[] | undefined,
      });
      return NextResponse.json({ ok: true, document });
    }

    if (action === 'update_board_member' && body.memberId) {
      const member = await updateBoardMemberAccess(admin, session.userId, access.companyId, String(body.memberId), {
        accessLevel: body.accessLevel as BoardAccessLevel | undefined,
        status: body.status as 'active' | 'inactive' | 'terminated' | undefined,
        boardRole: body.boardRole as BoardRole | undefined,
      });
      if (!member) return apiNotFound('Membre introuvable.');
      return NextResponse.json({ ok: true, member });
    }

    if (action === 'archive' && body.entityType && body.entityId) {
      const archived = await archiveGovernanceItem(
        admin,
        session.userId,
        access.companyId,
        body.entityType as 'meeting' | 'resolution' | 'document',
        String(body.entityId),
      );
      if (!archived) return apiNotFound('Élément introuvable.');
      return NextResponse.json({ ok: true, archived: true });
    }

    return apiBadRequest('invalid_action', apiErrorMessageFr('invalid_action'));
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'governance_access_denied' || msg === 'governance_write_forbidden' || msg === 'governance_tier_forbidden') {
      return apiForbidden('Action non autorisée pour votre niveau d\'accès.');
    }
    return mapDbError(e as Error);
  }
}
