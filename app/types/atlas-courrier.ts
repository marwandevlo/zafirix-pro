/** Courrier Arrivé/Départ — administrative correspondence archive types. */

export type CorrespondenceDirection = 'incoming' | 'outgoing';

export type CorrespondenceLetterType =
  | 'administrative'
  | 'legal_notice'
  | 'commercial'
  | 'fiscal'
  | 'judicial'
  | 'hr'
  | 'other';

export type CorrespondenceStatus = 'registered' | 'in_progress' | 'replied' | 'archived' | 'cancelled';

export type CorrespondencePriority = 'low' | 'normal' | 'high' | 'urgent';

export type CorrespondenceConfidentiality = 'public' | 'internal' | 'confidential' | 'restricted';

export type CorrespondenceAttachmentType =
  | 'scan'
  | 'original'
  | 'proof_of_delivery'
  | 'acknowledgment'
  | 'other';

export type AtlasCorrespondenceAttachment = {
  id: string;
  correspondenceId: string;
  fileName: string;
  fileUrl: string | null;
  documentType: CorrespondenceAttachmentType;
  sourceDocumentId: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  uploadedAt: string;
};

export type AtlasCorrespondence = {
  id: string;
  companyId: string | null;
  direction: CorrespondenceDirection;
  referenceNumber: string;
  externalReference: string | null;
  subject: string;
  letterType: CorrespondenceLetterType;
  status: CorrespondenceStatus;
  priority: CorrespondencePriority;
  confidentiality: CorrespondenceConfidentiality;
  correspondenceDate: string;
  receivedAt: string | null;
  sentAt: string | null;
  responseDueDate: string | null;
  daysUntilResponseDue: number | null;
  senderName: string | null;
  senderOrganization: string | null;
  senderAddress: string | null;
  senderEmail: string | null;
  senderPhone: string | null;
  senderCity: string | null;
  senderCountry: string | null;
  recipientName: string | null;
  recipientOrganization: string | null;
  recipientAddress: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientCity: string | null;
  recipientCountry: string | null;
  assignedTo: string | null;
  clientId: string | null;
  linkedCorrespondenceId: string | null;
  summary: string | null;
  notes: string | null;
  archivedAt: string | null;
  attachments: AtlasCorrespondenceAttachment[];
  createdAt: string;
  updatedAt: string;
};

export type AtlasCorrespondenceEvent = {
  id: string;
  correspondenceId: string;
  eventType: string;
  channel: string | null;
  title: string;
  body: string | null;
  createdAt: string;
};

export type CourrierDashboardSummary = {
  total: number;
  incoming: number;
  outgoing: number;
  registered: number;
  inProgress: number;
  replied: number;
  archived: number;
  overdueResponses: number;
  urgent: number;
};

export type CourrierPayload = {
  items: AtlasCorrespondence[];
  summary: CourrierDashboardSummary;
  events: AtlasCorrespondenceEvent[];
};

export const DIRECTION_LABELS: Record<CorrespondenceDirection, string> = {
  incoming: 'Courrier arrivé',
  outgoing: 'Courrier départ',
};

export const LETTER_TYPE_LABELS: Record<CorrespondenceLetterType, string> = {
  administrative: 'Administratif',
  legal_notice: 'Mise en demeure / Avis légal',
  commercial: 'Commercial',
  fiscal: 'Fiscal / Administratif public',
  judicial: 'Judiciaire',
  hr: 'Ressources humaines',
  other: 'Autre',
};

export const STATUS_LABELS: Record<CorrespondenceStatus, string> = {
  registered: 'Enregistré',
  in_progress: 'En cours',
  replied: 'Répondu',
  archived: 'Archivé',
  cancelled: 'Annulé',
};

export const PRIORITY_LABELS: Record<CorrespondencePriority, string> = {
  low: 'Basse',
  normal: 'Normale',
  high: 'Haute',
  urgent: 'Urgente',
};

export const CONFIDENTIALITY_LABELS: Record<CorrespondenceConfidentiality, string> = {
  public: 'Public',
  internal: 'Interne',
  confidential: 'Confidentiel',
  restricted: 'Restreint',
};

export const ATTACHMENT_TYPE_LABELS: Record<CorrespondenceAttachmentType, string> = {
  scan: 'Scan numérisé',
  original: 'Original',
  proof_of_delivery: 'Accusé de réception',
  acknowledgment: 'Accusé de réception signé',
  other: 'Autre',
};
