/**
 * Shared notification record types and persistence.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationCategory, NotificationChannel } from '@/app/types/atlas-enterprise-modules';

export type DispatchNotificationInput = {
  userId: string;
  companyId?: string | null;
  channel: NotificationChannel;
  category: NotificationCategory;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  recipientEmail?: string;
  recipientPhone?: string;
};

export async function recordNotification(
  admin: SupabaseClient,
  input: DispatchNotificationInput,
  status: 'pending' | 'sent' | 'failed' = 'pending',
): Promise<string | null> {
  const { data, error } = await admin
    .from('zafirix_notifications')
    .insert({
      user_id: input.userId,
      company_id: input.companyId ?? null,
      channel: input.channel,
      category: input.category,
      title: input.title,
      body: input.body ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  if (error) return null;
  return String(data.id);
}
