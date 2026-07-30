/**
 * Notifications server — row mappers, queue dispatch, automated alert scanners.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtlasNotification,
  AtlasNotificationQueueItem,
  NotificationCategory,
  NotificationChannel,
  NotificationQueueStatus,
  NotificationStatus,
} from '@/app/types/atlas-notifications';

export type { DispatchNotificationInput } from '@/app/lib/atlas-notifications-core';
export { recordNotification } from '@/app/lib/atlas-notifications-core';

export {
  enqueueNotification,
  enqueueManagerAlert,
  processNotificationQueue,
  resolveManagerContacts,
  fiscalDedupeKey,
  stockDedupeKey,
  invoiceDedupeKey,
  debtDedupeKey,
  contractDedupeKey,
  FISCAL_ALERT_THRESHOLDS_DAYS,
} from '@/app/lib/atlas-notification-queue';
export type { EnqueueInput, ManagerContacts } from '@/app/lib/atlas-notification-queue';

export {
  runNotificationDispatchers,
  runAutomatedAlertsForAllCompanies,
  scanInvoiceReminders,
  scanDebtCollectionAlerts,
  scanLowStockAlerts,
  scanFiscalDeadlineAlerts,
  scanContractExpiryAlerts,
} from '@/app/lib/atlas-notification-alerts';

export {
  dispatchNotification,
  NOTIFICATION_CATEGORY_LABELS,
} from '@/app/lib/atlas-notifications-engine';

export function rowToNotification(row: Record<string, unknown>): AtlasNotification {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    channel: row.channel as NotificationChannel,
    category: row.category as NotificationCategory,
    title: String(row.title ?? ''),
    body: (row.body as string | null) ?? null,
    entityType: (row.entity_type as string | null) ?? null,
    entityId: (row.entity_id as string | null) ?? null,
    status: row.status as NotificationStatus,
    scheduledAt: (row.scheduled_at as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

export function rowToQueueItem(row: Record<string, unknown>): AtlasNotificationQueueItem {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    channel: row.channel as NotificationChannel,
    category: row.category as NotificationCategory,
    title: String(row.title ?? ''),
    body: (row.body as string | null) ?? null,
    recipientEmail: (row.recipient_email as string | null) ?? null,
    recipientPhone: (row.recipient_phone as string | null) ?? null,
    entityType: (row.entity_type as string | null) ?? null,
    entityId: (row.entity_id as string | null) ?? null,
    dedupeKey: String(row.dedupe_key ?? ''),
    scheduledAt: String(row.scheduled_at ?? ''),
    status: row.status as NotificationQueueStatus,
    sentAt: (row.sent_at as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function listNotifications(
  admin: SupabaseClient,
  userId: string,
  opts?: { companyId?: string | null; limit?: number },
): Promise<{ notifications: AtlasNotification[]; unreadCount: number }> {
  const limit = Math.min(100, opts?.limit ?? 50);

  let query = admin
    .from('zafirix_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts?.companyId) query = query.eq('company_id', opts.companyId);

  const { data, error } = await query;
  if (error) return { notifications: [], unreadCount: 0 };

  const notifications = (data ?? []).map((r) => rowToNotification(r as Record<string, unknown>));
  const unreadCount = notifications.filter((n) => n.status === 'sent').length;
  return { notifications, unreadCount };
}

export async function listPendingQueueItems(
  admin: SupabaseClient,
  userId: string,
  opts?: { companyId?: string | null; limit?: number },
): Promise<AtlasNotificationQueueItem[]> {
  const limit = Math.min(100, opts?.limit ?? 50);

  let query = admin
    .from('zafirix_notification_queue')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'processing'])
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (opts?.companyId) query = query.eq('company_id', opts.companyId);

  const { data } = await query;
  return (data ?? []).map((r) => rowToQueueItem(r as Record<string, unknown>));
}
