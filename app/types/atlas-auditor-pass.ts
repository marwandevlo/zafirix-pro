/** Auditor guest pass — RBAC, permissions, portal payloads. */

export type AuditorRole = 'external_auditor' | 'expert_comptable';

export type AuditorScope = 'read_only' | 'audit_export';

export type AuditorPermission =
  | 'view_journal'
  | 'view_ledger'
  | 'view_invoices'
  | 'view_payments'
  | 'view_bank'
  | 'view_documents'
  | 'view_contracts'
  | 'export_verification';

export type AuditorAccessAction =
  | 'portal_view'
  | 'view_journal'
  | 'view_ledger'
  | 'view_invoices'
  | 'view_payments'
  | 'view_bank'
  | 'view_contracts'
  | 'export_verification'
  | 'token_invalid';

export type AtlasAuditorPassSession = {
  passId: string;
  companyId: string;
  userId: string;
  label: string;
  scope: AuditorScope;
  auditorRole: AuditorRole;
  permissions: AuditorPermission[];
  expiresAt: string;
  auditorEmail: string | null;
  auditorFirm: string | null;
  companyName: string;
};

export type AuditorJournalLine = {
  id: string;
  date: string;
  libelle: string;
  compte: string;
  debit: number;
  credit: number;
  validationStatus: string;
  sourceDocumentId: string | null;
};

export type AuditorLedgerAccount = {
  compte: string;
  libelle: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
  lineCount: number;
};

export type AuditorVerificationReport = {
  generatedAt: string;
  passLabel: string;
  auditorRole: AuditorRole;
  companyName: string;
  companyId: string;
  periodLabel: string;
  journal: {
    lineCount: number;
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
  };
  ledger: AuditorLedgerAccount[];
  summary: {
    invoiceCount: number;
    unpaidAmount: number;
    paymentCount: number;
    bankTransactionCount: number;
    contractCount: number;
  };
  integrityHash: string;
};

export type AuditorPortalPayload = {
  session: Omit<AtlasAuditorPassSession, 'userId' | 'passId'>;
  summary: {
    invoiceCount: number;
    documentCount: number;
    contractCount: number;
    journalLineCount: number;
    journalBalanced: boolean;
  };
  journal?: AuditorJournalLine[];
  ledger?: AuditorLedgerAccount[];
  invoices?: Array<{
    id: string;
    number: string;
    clientName: string;
    totalTtc: number;
    status: string;
    dueDate: string | null;
    issueDate: string | null;
  }>;
  payments?: Array<{
    id: string;
    invoiceId: string | null;
    amount: number;
    paidAt: string | null;
    method: string | null;
  }>;
  bankTransactions?: Array<{
    id: string;
    label: string;
    debit: number;
    credit: number;
    transactionDate: string | null;
  }>;
  contracts?: Array<{
    id: string;
    title: string;
    expiryDate: string | null;
    documentType: string;
  }>;
};

export const AUDITOR_ROLE_LABELS: Record<AuditorRole, string> = {
  external_auditor: 'Auditeur externe',
  expert_comptable: 'Expert-comptable',
};

export const AUDITOR_SCOPE_LABELS: Record<AuditorScope, string> = {
  read_only: 'Lecture seule',
  audit_export: 'Lecture + export vérification',
};

export const DEFAULT_ROLE_PERMISSIONS: Record<AuditorRole, AuditorPermission[]> = {
  external_auditor: [
    'view_journal',
    'view_ledger',
    'view_invoices',
    'view_documents',
    'view_contracts',
  ],
  expert_comptable: [
    'view_journal',
    'view_ledger',
    'view_invoices',
    'view_payments',
    'view_bank',
    'view_documents',
    'view_contracts',
    'export_verification',
  ],
};
