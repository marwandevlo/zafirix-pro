/** Corporate Governance & Board Minutes archive. */

export type BoardRole = 'president' | 'vice_president' | 'secretary' | 'treasurer' | 'member' | 'observer';

export type BoardAccessLevel = 'full' | 'read_only' | 'restricted';

export type BoardMemberStatus = 'active' | 'inactive' | 'terminated';

export type GovernanceAccessTier = 'public_internal' | 'executive' | 'board_confidential';

export type MeetingType = 'ordinary' | 'extraordinary' | 'committee' | 'strategy';

export type MeetingStatus = 'draft' | 'approved' | 'archived';

export type AssemblyType = 'ago' | 'age' | 'unanimous_written' | 'board_decision';

export type ResolutionStatus = 'draft' | 'adopted' | 'filed' | 'archived';

export type GovernanceDocumentType =
  | 'charter'
  | 'bylaws'
  | 'internal_regulation'
  | 'committee_charter'
  | 'ethics_code'
  | 'policy'
  | 'risk_charter'
  | 'audit_committee'
  | 'other';

export type GovernanceDocumentStatus = 'active' | 'superseded' | 'archived';

export type GovernanceArchiveTab = 'all' | 'meetings' | 'resolutions' | 'documents' | 'board' | 'access_log';

export type AtlasBoardMember = {
  id: string;
  companyId: string;
  memberUserId: string | null;
  fullName: string;
  email: string | null;
  boardRole: BoardRole;
  accessLevel: BoardAccessLevel;
  status: BoardMemberStatus;
  appointedAt: string | null;
  termEnd: string | null;
  notes: string | null;
  createdAt: string;
};

export type AtlasBoardMeeting = {
  id: string;
  companyId: string;
  referenceNumber: string;
  meetingDate: string;
  meetingType: MeetingType;
  title: string;
  location: string | null;
  quorumPresent: boolean;
  attendees: string[];
  agenda: string | null;
  minutesBody: string | null;
  decisionsSummary: string | null;
  accessTier: GovernanceAccessTier;
  status: MeetingStatus;
  fileUrl: string | null;
  fileName: string | null;
  approvedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type AtlasShareholderResolution = {
  id: string;
  companyId: string;
  referenceNumber: string;
  resolutionDate: string;
  assemblyType: AssemblyType;
  title: string;
  resolutionText: string;
  votesFor: number | null;
  votesAgainst: number | null;
  votesAbstain: number | null;
  quorumPct: number | null;
  capitalRepresentedPct: number | null;
  accessTier: GovernanceAccessTier;
  status: ResolutionStatus;
  fileUrl: string | null;
  fileName: string | null;
  meetingId: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type AtlasGovernanceDocument = {
  id: string;
  companyId: string;
  documentType: GovernanceDocumentType;
  title: string;
  description: string | null;
  versionLabel: string | null;
  effectiveDate: string | null;
  reviewDate: string | null;
  accessTier: GovernanceAccessTier;
  status: GovernanceDocumentStatus;
  fileUrl: string | null;
  fileName: string | null;
  tags: string[];
  archivedAt: string | null;
  createdAt: string;
};

export type GovernanceAccessLogEntry = {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityTitle: string | null;
  createdAt: string;
};

export type GovernanceAccessContext = {
  isOwner: boolean;
  isBoardMember: boolean;
  boardRole: BoardRole | null;
  accessLevel: BoardAccessLevel | null;
  maxTier: GovernanceAccessTier;
  canWrite: boolean;
  canManageBoard: boolean;
};

export type GovernanceArchiveSummary = {
  totalMeetings: number;
  totalResolutions: number;
  totalDocuments: number;
  boardMembers: number;
  draftMeetings: number;
  confidentialItems: number;
};

export type GovernanceArchivePayload = {
  access: GovernanceAccessContext;
  boardMembers: AtlasBoardMember[];
  meetings: AtlasBoardMeeting[];
  resolutions: AtlasShareholderResolution[];
  documents: AtlasGovernanceDocument[];
  accessLog: GovernanceAccessLogEntry[];
  summary: GovernanceArchiveSummary;
};

export const BOARD_ROLE_LABELS: Record<BoardRole, string> = {
  president: 'Président',
  vice_president: 'Vice-président',
  secretary: 'Secrétaire',
  treasurer: 'Trésorier',
  member: 'Membre',
  observer: 'Observateur',
};

export const BOARD_ACCESS_LABELS: Record<BoardAccessLevel, string> = {
  full: 'Accès complet',
  read_only: 'Lecture seule',
  restricted: 'Restreint',
};

export const ACCESS_TIER_LABELS: Record<GovernanceAccessTier, string> = {
  public_internal: 'Interne',
  executive: 'Direction',
  board_confidential: 'Confidentiel CA',
};

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  ordinary: 'Ordinaire',
  extraordinary: 'Extraordinaire',
  committee: 'Comité',
  strategy: 'Stratégique',
};

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  draft: 'Brouillon',
  approved: 'Approuvé',
  archived: 'Archivé',
};

export const ASSEMBLY_TYPE_LABELS: Record<AssemblyType, string> = {
  ago: 'AGO',
  age: 'AGE',
  unanimous_written: 'Décision unanime écrite',
  board_decision: 'Décision du CA',
};

export const RESOLUTION_STATUS_LABELS: Record<ResolutionStatus, string> = {
  draft: 'Brouillon',
  adopted: 'Adoptée',
  filed: 'Déposée',
  archived: 'Archivée',
};

export const GOVERNANCE_DOC_TYPE_LABELS: Record<GovernanceDocumentType, string> = {
  charter: 'Charte',
  bylaws: 'Statuts',
  internal_regulation: 'Règlement intérieur',
  committee_charter: 'Charte de comité',
  ethics_code: 'Code éthique',
  policy: 'Politique',
  risk_charter: 'Charte risques',
  audit_committee: 'Comité audit',
  other: 'Autre',
};

export const GOVERNANCE_DOC_STATUS_LABELS: Record<GovernanceDocumentStatus, string> = {
  active: 'Actif',
  superseded: 'Remplacé',
  archived: 'Archivé',
};
