/** Smart contract management types. */

export type ContractType =
  | 'commercial'
  | 'lease'
  | 'service'
  | 'employment'
  | 'nda'
  | 'partnership'
  | 'other';

export type ContractStatus = 'draft' | 'active' | 'expiring' | 'terminated' | 'renewed';

export type ContractPartyRole = 'client' | 'supplier' | 'partner' | 'landlord' | 'employee' | 'other';

export type ContractAttachmentType = 'contract' | 'amendment' | 'annex' | 'notice' | 'other';

export type AtlasContractParty = {
  id: string;
  contractId: string;
  partyName: string;
  partyRole: ContractPartyRole;
  contactEmail: string | null;
  contactPhone: string | null;
  clientId: string | null;
  sortOrder: number;
};

export type AtlasContractAttachment = {
  id: string;
  contractId: string;
  fileName: string;
  fileUrl: string | null;
  documentType: ContractAttachmentType;
  sourceDocumentId: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  uploadedAt: string;
};

export type AtlasContract = {
  id: string;
  companyId: string | null;
  reference: string | null;
  title: string;
  contractType: ContractType;
  status: ContractStatus;
  computedStatus: ContractStatus;
  effectiveDate: string | null;
  expiryDate: string | null;
  renewalDate: string | null;
  renewalTerms: string | null;
  autoRenew: boolean;
  renewalNoticeDays: number;
  alertDays: number[];
  contractValue: number | null;
  currency: string;
  notes: string | null;
  legalDocumentId: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  daysUntilExpiry: number | null;
  daysUntilRenewal: number | null;
  parties: AtlasContractParty[];
  attachments: AtlasContractAttachment[];
  createdAt: string;
  updatedAt: string;
};

export type ContractDashboardSummary = {
  active: number;
  expiring: number;
  terminated: number;
  draft: number;
  renewed: number;
  total: number;
  totalValue: number;
};

export type ContractsPayload = {
  contracts: AtlasContract[];
  summary: ContractDashboardSummary;
  events: AtlasContractEvent[];
};

export type AtlasContractEvent = {
  id: string;
  contractId: string;
  eventType: string;
  channel: string | null;
  title: string;
  body: string | null;
  createdAt: string;
};

export const DEFAULT_CONTRACT_ALERT_DAYS = [42, 28, 21, 14, 7, 3, 1] as const;

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  commercial: 'Commercial',
  lease: 'Bail / Location',
  service: 'Prestation de service',
  employment: 'Travail / RH',
  nda: 'Confidentialité (NDA)',
  partnership: 'Partenariat',
  other: 'Autre',
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  expiring: 'Expire bientôt',
  terminated: 'Résilié',
  renewed: 'Renouvelé',
};

export const PARTY_ROLE_LABELS: Record<ContractPartyRole, string> = {
  client: 'Client',
  supplier: 'Fournisseur',
  partner: 'Partenaire',
  landlord: 'Bailleur',
  employee: 'Salarié',
  other: 'Autre',
};
