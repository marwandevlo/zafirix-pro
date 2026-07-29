/** Enterprise modules — inventory, notifications, logistics, petty cash, debt collection, auditor passes. */

export type AtlasStore = {
  id: string;
  companyId: string | null;
  name: string;
  code: string;
  address: string | null;
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

export type AtlasDelivery = {
  id: string;
  companyId: string | null;
  invoiceId: string | null;
  waybillNumber: string;
  carrier: string | null;
  status: DeliveryStatus;
  codAmount: number;
  codCollected: number;
  trackingUrl: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

export type PettyCashEntryType = 'advance' | 'expense' | 'replenishment';
export type PettyCashStatus = 'pending' | 'approved' | 'rejected' | 'reimbursed';

export type AtlasPettyCashEntry = {
  id: string;
  companyId: string | null;
  entryType: PettyCashEntryType;
  amount: number;
  beneficiary: string | null;
  purpose: string | null;
  status: PettyCashStatus;
  entryDate: string;
  approvedBy: string | null;
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
  clientName: string;
  amountDue: number;
  stage: DebtCollectionStage;
  lastContactAt: string | null;
  nextActionAt: string | null;
  notes: string | null;
  createdAt: string;
};

export type AtlasAuditorPass = {
  id: string;
  companyId: string | null;
  token: string;
  label: string;
  scope: 'read_only' | 'audit_export';
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  createdAt: string;
};
