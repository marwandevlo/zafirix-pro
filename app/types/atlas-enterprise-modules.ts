/** Enterprise modules — inventory, notifications, logistics, petty cash, debt collection, auditor passes. */

export type StoreType = 'warehouse' | 'point_of_sale' | 'both';

export type AtlasStore = {
  id: string;
  companyId: string | null;
  name: string;
  code: string;
  address: string | null;
  storeType: StoreType;
  isActive: boolean;
  createdAt: string;
};

export type AtlasInventoryItem = {
  id: string;
  companyId: string | null;
  sku: string;
  name: string;
  unit: string;
  reorderLevel: number;
  unitCost: number;
  salePrice: number;
  category: string;
  createdAt: string;
};

export type AtlasInventoryStock = {
  id: string;
  storeId: string;
  itemId: string;
  quantity: number;
  updatedAt: string;
  /** Joined fields */
  storeName?: string;
  itemName?: string;
  itemSku?: string;
  reorderLevel?: number;
  unit?: string;
  unitCost?: number;
  valuation?: number;
  isLowStock?: boolean;
};

export type InventoryMovementType =
  | 'in'
  | 'out'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out'
  | 'sale'
  | 'usage'
  | 'purchase'
  | 'return';

export type AtlasStockMovement = {
  id: string;
  companyId: string | null;
  storeId: string;
  itemId: string;
  movementType: InventoryMovementType;
  quantityDelta: number;
  quantityAfter: number;
  unitCost: number;
  totalCost: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
  storeName?: string;
  itemName?: string;
  itemSku?: string;
};

export type StockTransferStatus = 'pending' | 'approved' | 'in_transit' | 'completed' | 'cancelled';

export type AtlasStockTransferLine = {
  itemId: string;
  quantity: number;
  unitCost: number;
  itemName?: string;
  itemSku?: string;
};

export type AtlasStockTransfer = {
  id: string;
  companyId: string | null;
  fromStoreId: string;
  toStoreId: string;
  status: StockTransferStatus;
  notes: string | null;
  requestedAt: string;
  completedAt: string | null;
  createdAt: string;
  fromStoreName?: string;
  toStoreName?: string;
  lines: AtlasStockTransferLine[];
};

export type AtlasInvoiceCogsLine = {
  id: string;
  invoiceId: string;
  storeId: string;
  itemId: string;
  quantity: number;
  unitCost: number;
  cogsAmount: number;
  movementId: string | null;
  createdAt: string;
  itemName?: string;
  itemSku?: string;
  storeName?: string;
};

export type NotificationChannel = 'in_app' | 'email' | 'whatsapp';
export type NotificationCategory =
  | 'invoice_reminder'
  | 'low_stock'
  | 'fiscal_deadline'
  | 'contract_expiry'
  | 'debt_collection'
  | 'delivery_update'
  | 'general';

export type AtlasNotification = {
  id: string;
  companyId: string | null;
  channel: NotificationChannel;
  category: NotificationCategory;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type DeliveryStatus =
  | 'pending'
  | 'in_transit'
  | 'delivered'
  | 'cod_collected'
  | 'cancelled'
  | 'returned';

export type AtlasDeliveryPartner = {
  id: string;
  companyId: string | null;
  name: string;
  code: string;
  phone: string | null;
  trackingUrlTemplate: string | null;
  isActive: boolean;
  createdAt: string;
};

export type AtlasShipmentTrackingEvent = {
  id: string;
  deliveryId: string;
  status: DeliveryStatus;
  note: string | null;
  location: string | null;
  recordedAt: string;
  createdAt: string;
};

export type CodCollectionMethod = 'cash' | 'transfer' | 'partner_settlement' | 'other';

export type AtlasCodReconciliation = {
  id: string;
  deliveryId: string;
  invoiceId: string | null;
  expectedAmount: number;
  collectedAmount: number;
  varianceAmount: number;
  collectionMethod: CodCollectionMethod;
  paymentId: string | null;
  notes: string | null;
  reconciledAt: string;
  createdAt: string;
};

export type AtlasDelivery = {
  id: string;
  companyId: string | null;
  invoiceId: string | null;
  partnerId: string | null;
  waybillNumber: string;
  trackingId: string | null;
  carrier: string | null;
  partnerName?: string | null;
  status: DeliveryStatus;
  codAmount: number;
  codCollected: number;
  trackingUrl: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  notes: string | null;
  deliveredAt: string | null;
  createdAt: string;
  /** Joined invoice summary */
  invoiceNumber?: string | null;
  invoiceClient?: string | null;
  trackingEvents?: AtlasShipmentTrackingEvent[];
  codReconciliations?: AtlasCodReconciliation[];
};

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

export type DebtCollectionStage =
  | 'reminder_1'
  | 'reminder_2'
  | 'formal_notice'
  | 'legal'
  | 'closed'
  | 'paid';

export type AtlasDebtCollectionCase = {
  id: string;
  companyId: string | null;
  invoiceId: string | null;
  clientId?: string | null;
  clientName: string;
  amountDue: number;
  outstandingAmount?: number;
  paidAmount?: number;
  invoiceNumber?: string | null;
  dueDate?: string | null;
  daysOverdue?: number;
  agingBucket?: import('@/app/types/atlas-debt-collection').AgingBucket;
  stage: DebtCollectionStage;
  stageLabel?: string;
  lastContactAt: string | null;
  nextActionAt: string | null;
  notes: string | null;
  createdAt: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
};

export type AtlasAuditorPass = {
  id: string;
  companyId: string | null;
  token: string;
  label: string;
  scope: 'read_only' | 'audit_export';
  auditorRole?: 'external_auditor' | 'expert_comptable';
  permissions?: string[];
  auditorEmail?: string | null;
  auditorFirm?: string | null;
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  lastAccessAt?: string | null;
  createdAt: string;
};
