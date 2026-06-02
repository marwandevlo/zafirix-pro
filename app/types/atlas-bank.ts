export type BankValidationStatus = 'draft' | 'reviewed' | 'validated' | 'rejected';

export type BankStatement = {
  id: string;
  companyId: string | null;
  sourceDocumentId: string | null;
  bankName: string | null;
  accountNumber: string | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  currency: string;
  transactionCount: number;
  validationStatus: BankValidationStatus;
  createdAt: string;
};

export type BankTransaction = {
  id: string;
  statementId: string | null;
  sourceDocumentId: string | null;
  accountNumber: string | null;
  transactionDate: string | null;
  valueDate: string | null;
  description: string | null;
  reference: string | null;
  debit: number;
  credit: number;
  amount: number;
  balance: number | null;
  currency: string;
  validationStatus: BankValidationStatus;
  confidenceScore: number | null;
  createdAt: string;
};

export type ReconciliationStatus = 'matched' | 'suggested' | 'unmatched' | 'rejected';

export type BankReconciliation = {
  id: string;
  transactionId: string;
  entityType: string;
  entityId: string;
  confidence: number;
  status: ReconciliationStatus;
  matchReason: string | null;
  createdAt: string;
};

export type BankDashboardKpis = {
  transactions_imported: number;
  reconciled: number;
  suggested: number;
  unmatched: number;
  alerts: number;
  statements: number;
};
