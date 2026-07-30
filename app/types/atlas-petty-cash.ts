/** Petty cash / Caisse de régie — types aligned with zafirix_petty_cash_* tables. */

export type PettyCashEntryType = 'advance' | 'expense' | 'replenishment';
export type PettyCashStatus = 'pending' | 'approved' | 'rejected' | 'reimbursed';
export type PettyCashVoucherStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'posted' | 'reconciled';
export type PettyCashApprovalStep = 'submitted' | 'manager_review' | 'finance_review' | 'approved' | 'rejected';

export type AtlasPettyCashFund = {
  id: string;
  companyId: string | null;
  name: string;
  code: string;
  floatAmount: number;
  accountingAccount: string;
  custodianName: string | null;
  isActive: boolean;
  createdAt: string;
  currentBalance?: number;
  pendingAmount?: number;
};

export type AtlasPettyCashAttachment = {
  id: string;
  voucherId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
};

export type AtlasPettyCashApproval = {
  id: string;
  voucherId: string;
  step: PettyCashApprovalStep;
  actorName: string | null;
  actorRole: string | null;
  comment: string | null;
  createdAt: string;
};

export type AtlasPettyCashVoucher = {
  id: string;
  companyId: string | null;
  fundId: string;
  voucherNumber: string;
  voucherDate: string;
  amount: number;
  beneficiary: string | null;
  purpose: string | null;
  expenseCategory: string;
  expenseAccount: string;
  status: PettyCashVoucherStatus;
  entryId: string | null;
  reconciledAt: string | null;
  accountingPosted: boolean;
  createdAt: string;
  fundName?: string;
  attachments?: AtlasPettyCashAttachment[];
  approvals?: AtlasPettyCashApproval[];
};

export type AtlasPettyCashReconciliation = {
  fundId: string;
  fundName: string;
  accountingAccount: string;
  physicalBalance: number;
  accountingBalance: number;
  variance: number;
  reconciledAt: string;
  isBalanced: boolean;
};

export type AtlasPettyCashEntry = {
  id: string;
  companyId: string | null;
  fundId?: string | null;
  voucherId?: string | null;
  entryType: PettyCashEntryType;
  amount: number;
  beneficiary: string | null;
  purpose: string | null;
  status: PettyCashStatus;
  entryDate: string;
  approvedBy: string | null;
  accountingAccount?: string | null;
  reconciledAt?: string | null;
  createdAt: string;
};

export type PettyCashDashboardPayload = {
  funds: AtlasPettyCashFund[];
  entries: AtlasPettyCashEntry[];
  vouchers?: AtlasPettyCashVoucher[];
  balance: number;
  pendingTotal: number;
  reconciliation?: AtlasPettyCashReconciliation | null;
};
