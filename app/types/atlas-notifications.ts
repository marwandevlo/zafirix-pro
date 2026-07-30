/** WhatsApp / Email alerts — zafirix_notifications + zafirix_notification_queue. */

export type NotificationChannel = 'in_app' | 'email' | 'whatsapp';

export type NotificationCategory =
  | 'invoice_reminder'
  | 'low_stock'
  | 'fiscal_deadline'
  | 'contract_expiry'
  | 'debt_collection'
  | 'delivery_update'
  | 'general';

export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export type NotificationQueueStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';

export type AtlasNotification = {
  id: string;
  companyId: string | null;
  channel: NotificationChannel;
  category: NotificationCategory;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  status: NotificationStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type AtlasNotificationQueueItem = {
  id: string;
  companyId: string | null;
  channel: NotificationChannel;
  category: NotificationCategory;
  title: string;
  body: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  entityType: string | null;
  entityId: string | null;
  dedupeKey: string;
  scheduledAt: string;
  status: NotificationQueueStatus;
  sentAt: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type NotificationsListPayload = {
  notifications: AtlasNotification[];
  unreadCount: number;
};

export type NotificationScanResult = {
  invoiceReminders: number;
  debtCollection: number;
  lowStock: number;
  fiscal: number;
  contracts: number;
  queueProcessed: number;
};
