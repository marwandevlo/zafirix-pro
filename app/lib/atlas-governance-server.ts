/**
 * Corporate Governance & Board Minutes — secure archive, search, board access control.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCompanyRole, roleMeetsMinimum } from '@/app/lib/atlas-permissions';
import type {
  AssemblyType,
  AtlasBoardMeeting,
  AtlasBoardMember,
  AtlasGovernanceDocument,
  AtlasShareholderResolution,
  BoardAccessLevel,
  BoardRole,
  GovernanceAccessContext,
  GovernanceAccessLogEntry,
  GovernanceAccessTier,
  GovernanceArchivePayload,
  GovernanceArchiveSummary,
  GovernanceDocumentType,
  MeetingStatus,
  MeetingType,
  ResolutionStatus,
} from '@/app/types/atlas-corporate-governance';
import {
  ACCESS_TIER_LABELS,
  ASSEMBLY_TYPE_LABELS,
  BOARD_ACCESS_LABELS,
  BOARD_ROLE_LABELS,
  GOVERNANCE_DOC_STATUS_LABELS,
  GOVERNANCE_DOC_TYPE_LABELS,
  MEETING_STATUS_LABELS,
  MEETING_TYPE_LABELS,
  RESOLUTION_STATUS_LABELS,
} from '@/app/types/atlas-corporate-governance';

export {
  ACCESS_TIER_LABELS,
  ASSEMBLY_TYPE_LABELS,
  BOARD_ACCESS_LABELS,
  BOARD_ROLE_LABELS,
  GOVERNANCE_DOC_STATUS_LABELS,
  GOVERNANCE_DOC_TYPE_LABELS,
  MEETING_STATUS_LABELS,
  MEETING_TYPE_LABELS,
  RESOLUTION_STATUS_LABELS,
};

const TIER_RANK: Record<GovernanceAccessTier, number> = {
  public_internal: 1,
  executive: 2,
  board_confidential: 3,
};

function tierAllowed(maxTier: GovernanceAccessTier, itemTier: GovernanceAccessTier): boolean {
  return TIER_RANK[itemTier] <= TIER_RANK[maxTier];
}

function matchesSearch(haystack: string, q: string): boolean {
  if (!q.trim()) return true;
  return haystack.toLowerCase().includes(q.trim().toLowerCase());
}

export async function resolveGovernanceAccess(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<GovernanceAccessContext | null> {
  const ctx = await resolveCompanyRole(admin, userId, companyId);
  if (!ctx.role && !ctx.owned) return null;

  if (ctx.owned) {
    return {
      isOwner: true,
      isBoardMember: false,
      boardRole: null,
      accessLevel: null,
      maxTier: 'board_confidential',
      canWrite: true,
      canManageBoard: true,
    };
  }

  const { data: member } = await admin
    .from('zafirix_board_members')
    .select('*')
    .eq('company_id', companyId)
    .eq('member_user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (member) {
    const accessLevel = String(member.access_level) as BoardAccessLevel;
    const maxTier: GovernanceAccessTier =
      accessLevel === 'restricted' ? 'executive' : 'board_confidential';
    return {
      isOwner: false,
      isBoardMember: true,
      boardRole: String(member.board_role) as BoardRole,
      accessLevel,
      maxTier,
      canWrite: accessLevel === 'full',
      canManageBoard: false,
    };
  }

  if (roleMeetsMinimum(ctx.role, 'manager')) {
    return {
      isOwner: false,
      isBoardMember: false,
      boardRole: null,
      accessLevel: null,
      maxTier: 'executive',
      canWrite: roleMeetsMinimum(ctx.role, 'owner'),
      canManageBoard: false,
    };
  }

  return null;
}

async function logGovernanceAccess(
  admin: SupabaseClient,
  ownerUserId: string,
  companyId: string,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId?: string | null,
  entityTitle?: string | null,
): Promise<void> {
  await admin.from('zafirix_governance_access_log').insert({
    user_id: ownerUserId,
    company_id: companyId,
    actor_user_id: actorUserId,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    entity_title: entityTitle ?? null,
  });
}

function rowToBoardMember(row: Record<string, unknown>): AtlasBoardMember {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    memberUserId: (row.member_user_id as string | null) ?? null,
    fullName: String(row.full_name ?? ''),
    email: (row.email as string | null) ?? null,
    boardRole: row.board_role as BoardRole,
    accessLevel: row.access_level as BoardAccessLevel,
    status: row.status as AtlasBoardMember['status'],
    appointedAt: (row.appointed_at as string | null) ?? null,
    termEnd: (row.term_end as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

function rowToMeeting(row: Record<string, unknown>): AtlasBoardMeeting {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    referenceNumber: String(row.reference_number ?? ''),
    meetingDate: String(row.meeting_date ?? ''),
    meetingType: row.meeting_type as MeetingType,
    title: String(row.title ?? ''),
    location: (row.location as string | null) ?? null,
    quorumPresent: Boolean(row.quorum_present ?? true),
    attendees: Array.isArray(row.attendees) ? row.attendees.map(String) : [],
    agenda: (row.agenda as string | null) ?? null,
    minutesBody: (row.minutes_body as string | null) ?? null,
    decisionsSummary: (row.decisions_summary as string | null) ?? null,
    accessTier: row.access_tier as GovernanceAccessTier,
    status: row.status as MeetingStatus,
    fileUrl: (row.file_url as string | null) ?? null,
    fileName: (row.file_name as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

function rowToResolution(row: Record<string, unknown>): AtlasShareholderResolution {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    referenceNumber: String(row.reference_number ?? ''),
    resolutionDate: String(row.resolution_date ?? ''),
    assemblyType: row.assembly_type as AssemblyType,
    title: String(row.title ?? ''),
    resolutionText: String(row.resolution_text ?? ''),
    votesFor: row.votes_for != null ? Number(row.votes_for) : null,
    votesAgainst: row.votes_against != null ? Number(row.votes_against) : null,
    votesAbstain: row.votes_abstain != null ? Number(row.votes_abstain) : null,
    quorumPct: row.quorum_pct != null ? Number(row.quorum_pct) : null,
    capitalRepresentedPct: row.capital_represented_pct != null ? Number(row.capital_represented_pct) : null,
    accessTier: row.access_tier as GovernanceAccessTier,
    status: row.status as ResolutionStatus,
    fileUrl: (row.file_url as string | null) ?? null,
    fileName: (row.file_name as string | null) ?? null,
    meetingId: (row.meeting_id as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

function rowToDocument(row: Record<string, unknown>): AtlasGovernanceDocument {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    documentType: row.document_type as GovernanceDocumentType,
    title: String(row.title ?? ''),
    description: (row.description as string | null) ?? null,
    versionLabel: (row.version_label as string | null) ?? null,
    effectiveDate: (row.effective_date as string | null) ?? null,
    reviewDate: (row.review_date as string | null) ?? null,
    accessTier: row.access_tier as GovernanceAccessTier,
    status: row.status as AtlasGovernanceDocument['status'],
    fileUrl: (row.file_url as string | null) ?? null,
    fileName: (row.file_name as string | null) ?? null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

function buildSummary(
  meetings: AtlasBoardMeeting[],
  resolutions: AtlasShareholderResolution[],
  documents: AtlasGovernanceDocument[],
  boardMembers: AtlasBoardMember[],
): GovernanceArchiveSummary {
  return {
    totalMeetings: meetings.length,
    totalResolutions: resolutions.length,
    totalDocuments: documents.length,
    boardMembers: boardMembers.filter((m) => m.status === 'active').length,
    draftMeetings: meetings.filter((m) => m.status === 'draft').length,
    confidentialItems:
      meetings.filter((m) => m.accessTier === 'board_confidential').length +
      resolutions.filter((r) => r.accessTier === 'board_confidential').length +
      documents.filter((d) => d.accessTier === 'board_confidential').length,
  };
}

async function nextRef(
  admin: SupabaseClient,
  table: string,
  companyId: string,
  prefix: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-`;
  const { data } = await admin
    .from(table)
    .select('reference_number')
    .eq('company_id', companyId)
    .like('reference_number', `${pattern}%`)
    .order('reference_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data?.[0]?.reference_number) {
    const parts = String(data[0].reference_number).split('-');
    const last = parseInt(parts[parts.length - 1] ?? '0', 10);
    if (!Number.isNaN(last)) seq = last + 1;
  }
  return `${pattern}${String(seq).padStart(4, '0')}`;
}

export type GovernanceSearchFilters = {
  q?: string;
  tab?: 'all' | 'meetings' | 'resolutions' | 'documents';
  tier?: GovernanceAccessTier | 'all';
};

export async function getGovernanceArchive(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  filters: GovernanceSearchFilters = {},
): Promise<GovernanceArchivePayload> {
  const access = await resolveGovernanceAccess(admin, userId, companyId);
  if (!access) {
    await logGovernanceAccess(admin, userId, companyId, userId, 'access_denied', 'archive');
    throw new Error('governance_access_denied');
  }

  const { data: company } = await admin
    .from('atlas_companies')
    .select('user_id')
    .eq('id', companyId)
    .maybeSingle();
  const ownerUserId = String(company?.user_id ?? userId);

  const [membersRes, meetingsRes, resolutionsRes, documentsRes, logRes] = await Promise.all([
    admin.from('zafirix_board_members').select('*').eq('company_id', companyId).order('full_name'),
    admin.from('zafirix_board_meetings').select('*').eq('company_id', companyId).order('meeting_date', { ascending: false }),
    admin.from('zafirix_shareholder_resolutions').select('*').eq('company_id', companyId).order('resolution_date', { ascending: false }),
    admin.from('zafirix_governance_documents').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('zafirix_governance_access_log').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50),
  ]);

  const q = filters.q ?? '';
  let boardMembers = (membersRes.data ?? []).map((r) => rowToBoardMember(r as Record<string, unknown>));
  if (!access.canManageBoard) {
    boardMembers = boardMembers.filter((m) => m.memberUserId === userId || access.isOwner);
  }

  let meetings = (meetingsRes.data ?? [])
    .map((r) => rowToMeeting(r as Record<string, unknown>))
    .filter((m) => tierAllowed(access.maxTier, m.accessTier));

  let resolutions = (resolutionsRes.data ?? [])
    .map((r) => rowToResolution(r as Record<string, unknown>))
    .filter((r) => tierAllowed(access.maxTier, r.accessTier));

  let documents = (documentsRes.data ?? [])
    .map((r) => rowToDocument(r as Record<string, unknown>))
    .filter((d) => tierAllowed(access.maxTier, d.accessTier));

  if (filters.tier && filters.tier !== 'all') {
    meetings = meetings.filter((m) => m.accessTier === filters.tier);
    resolutions = resolutions.filter((r) => r.accessTier === filters.tier);
    documents = documents.filter((d) => d.accessTier === filters.tier);
  }

  if (q) {
    meetings = meetings.filter((m) =>
      matchesSearch(`${m.referenceNumber} ${m.title} ${m.agenda ?? ''} ${m.minutesBody ?? ''}`, q),
    );
    resolutions = resolutions.filter((r) =>
      matchesSearch(`${r.referenceNumber} ${r.title} ${r.resolutionText}`, q),
    );
    documents = documents.filter((d) =>
      matchesSearch(`${d.title} ${d.description ?? ''} ${d.tags.join(' ')}`, q),
    );
  }

  if (filters.tab === 'meetings') {
    resolutions = [];
    documents = [];
  } else if (filters.tab === 'resolutions') {
    meetings = [];
    documents = [];
  } else if (filters.tab === 'documents') {
    meetings = [];
    resolutions = [];
  }

  const accessLog: GovernanceAccessLogEntry[] = (logRes.data ?? [])
    .filter((row) => access.isOwner || access.canManageBoard || String(row.actor_user_id) === userId)
    .map((row) => ({
      id: String(row.id),
      actorUserId: String(row.actor_user_id),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: (row.entity_id as string | null) ?? null,
      entityTitle: (row.entity_title as string | null) ?? null,
      createdAt: String(row.created_at ?? ''),
    }));

  await logGovernanceAccess(admin, ownerUserId, companyId, userId, q ? 'search' : 'view', 'archive', null, q || 'dashboard');

  return {
    access,
    boardMembers,
    meetings,
    resolutions,
    documents,
    accessLog,
    summary: buildSummary(meetings, resolutions, documents, boardMembers),
  };
}

export async function createBoardMember(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    fullName: string;
    email?: string;
    memberUserId?: string;
    boardRole?: BoardRole;
    accessLevel?: BoardAccessLevel;
    appointedAt?: string;
    termEnd?: string;
    notes?: string;
  },
): Promise<AtlasBoardMember> {
  const access = await resolveGovernanceAccess(admin, userId, companyId);
  if (!access?.canManageBoard) throw new Error('governance_write_forbidden');

  const { data, error } = await admin
    .from('zafirix_board_members')
    .insert({
      user_id: userId,
      company_id: companyId,
      full_name: input.fullName,
      email: input.email ?? null,
      member_user_id: input.memberUserId ?? null,
      board_role: input.boardRole ?? 'member',
      access_level: input.accessLevel ?? 'read_only',
      appointed_at: input.appointedAt ?? null,
      term_end: input.termEnd ?? null,
      notes: input.notes ?? null,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) throw error;
  await logGovernanceAccess(admin, userId, companyId, userId, 'create', 'board_member', data.id, input.fullName);
  return rowToBoardMember(data as Record<string, unknown>);
}

export async function createBoardMeeting(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    title: string;
    meetingDate: string;
    meetingType?: MeetingType;
    location?: string;
    agenda?: string;
    minutesBody?: string;
    decisionsSummary?: string;
    accessTier?: GovernanceAccessTier;
    attendees?: string[];
    fileUrl?: string;
    fileName?: string;
  },
): Promise<AtlasBoardMeeting> {
  const access = await resolveGovernanceAccess(admin, userId, companyId);
  if (!access?.canWrite) throw new Error('governance_write_forbidden');
  if (input.accessTier && !tierAllowed(access.maxTier, input.accessTier)) {
    throw new Error('governance_tier_forbidden');
  }

  const referenceNumber = await nextRef(admin, 'zafirix_board_meetings', companyId, 'PV-CA');
  const { data, error } = await admin
    .from('zafirix_board_meetings')
    .insert({
      user_id: userId,
      company_id: companyId,
      reference_number: referenceNumber,
      title: input.title,
      meeting_date: input.meetingDate,
      meeting_type: input.meetingType ?? 'ordinary',
      location: input.location ?? null,
      agenda: input.agenda ?? null,
      minutes_body: input.minutesBody ?? null,
      decisions_summary: input.decisionsSummary ?? null,
      access_tier: input.accessTier ?? 'board_confidential',
      attendees: input.attendees ?? [],
      file_url: input.fileUrl ?? null,
      file_name: input.fileName ?? null,
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) throw error;
  await logGovernanceAccess(admin, userId, companyId, userId, 'create', 'meeting', data.id, input.title);
  return rowToMeeting(data as Record<string, unknown>);
}

export async function createShareholderResolution(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    title: string;
    resolutionText: string;
    resolutionDate: string;
    assemblyType?: AssemblyType;
    votesFor?: number;
    votesAgainst?: number;
    votesAbstain?: number;
    quorumPct?: number;
    capitalRepresentedPct?: number;
    accessTier?: GovernanceAccessTier;
    fileUrl?: string;
    fileName?: string;
    meetingId?: string;
  },
): Promise<AtlasShareholderResolution> {
  const access = await resolveGovernanceAccess(admin, userId, companyId);
  if (!access?.canWrite) throw new Error('governance_write_forbidden');
  if (input.accessTier && !tierAllowed(access.maxTier, input.accessTier)) {
    throw new Error('governance_tier_forbidden');
  }

  const referenceNumber = await nextRef(admin, 'zafirix_shareholder_resolutions', companyId, 'RES');
  const { data, error } = await admin
    .from('zafirix_shareholder_resolutions')
    .insert({
      user_id: userId,
      company_id: companyId,
      reference_number: referenceNumber,
      title: input.title,
      resolution_text: input.resolutionText,
      resolution_date: input.resolutionDate,
      assembly_type: input.assemblyType ?? 'ago',
      votes_for: input.votesFor ?? null,
      votes_against: input.votesAgainst ?? null,
      votes_abstain: input.votesAbstain ?? null,
      quorum_pct: input.quorumPct ?? null,
      capital_represented_pct: input.capitalRepresentedPct ?? null,
      access_tier: input.accessTier ?? 'executive',
      file_url: input.fileUrl ?? null,
      file_name: input.fileName ?? null,
      meeting_id: input.meetingId ?? null,
      status: 'adopted',
    })
    .select('*')
    .single();

  if (error) throw error;
  await logGovernanceAccess(admin, userId, companyId, userId, 'create', 'resolution', data.id, input.title);
  return rowToResolution(data as Record<string, unknown>);
}

export async function createGovernanceDocument(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: {
    title: string;
    documentType?: GovernanceDocumentType;
    description?: string;
    versionLabel?: string;
    effectiveDate?: string;
    reviewDate?: string;
    accessTier?: GovernanceAccessTier;
    fileUrl?: string;
    fileName?: string;
    tags?: string[];
  },
): Promise<AtlasGovernanceDocument> {
  const access = await resolveGovernanceAccess(admin, userId, companyId);
  if (!access?.canWrite) throw new Error('governance_write_forbidden');
  if (input.accessTier && !tierAllowed(access.maxTier, input.accessTier)) {
    throw new Error('governance_tier_forbidden');
  }

  const { data, error } = await admin
    .from('zafirix_governance_documents')
    .insert({
      user_id: userId,
      company_id: companyId,
      title: input.title,
      document_type: input.documentType ?? 'policy',
      description: input.description ?? null,
      version_label: input.versionLabel ?? null,
      effective_date: input.effectiveDate ?? null,
      review_date: input.reviewDate ?? null,
      access_tier: input.accessTier ?? 'executive',
      file_url: input.fileUrl ?? null,
      file_name: input.fileName ?? null,
      tags: input.tags ?? [],
      status: 'active',
    })
    .select('*')
    .single();

  if (error) throw error;
  await logGovernanceAccess(admin, userId, companyId, userId, 'create', 'document', data.id, input.title);
  return rowToDocument(data as Record<string, unknown>);
}

export async function updateBoardMemberAccess(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  memberId: string,
  patch: { accessLevel?: BoardAccessLevel; status?: AtlasBoardMember['status']; boardRole?: BoardRole },
): Promise<AtlasBoardMember | null> {
  const access = await resolveGovernanceAccess(admin, userId, companyId);
  if (!access?.canManageBoard) throw new Error('governance_write_forbidden');

  const { data, error } = await admin
    .from('zafirix_board_members')
    .update({
      ...(patch.accessLevel ? { access_level: patch.accessLevel } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.boardRole ? { board_role: patch.boardRole } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .eq('company_id', companyId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  await logGovernanceAccess(admin, userId, companyId, userId, 'update', 'board_member', memberId);
  return rowToBoardMember(data as Record<string, unknown>);
}

export async function archiveGovernanceItem(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  entityType: 'meeting' | 'resolution' | 'document',
  entityId: string,
): Promise<boolean> {
  const access = await resolveGovernanceAccess(admin, userId, companyId);
  if (!access?.canWrite) throw new Error('governance_write_forbidden');

  const table =
    entityType === 'meeting'
      ? 'zafirix_board_meetings'
      : entityType === 'resolution'
        ? 'zafirix_shareholder_resolutions'
        : 'zafirix_governance_documents';

  const patch =
    entityType === 'document'
      ? { status: 'archived', archived_at: new Date().toISOString() }
      : entityType === 'meeting'
        ? { status: 'archived', archived_at: new Date().toISOString() }
        : { status: 'archived', archived_at: new Date().toISOString() };

  const { data, error } = await admin
    .from(table)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', entityId)
    .eq('company_id', companyId)
    .select('id, title')
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;
  await logGovernanceAccess(admin, userId, companyId, userId, 'archive', entityType, entityId, String(data.title ?? ''));
  return true;
}
