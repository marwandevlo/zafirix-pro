/**
 * Notification queue — enqueue, dedupe, and process email/WhatsApp alerts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmailViaResend } from '@/app/lib/atlas-email-resend';
import { recordNotification, type DispatchNotificationInput } from '@/app/lib/atlas-notifications-core';
import { sendWhatsAppMessage } from '@/app/lib/whatsapp-service';
import type { NotificationCategory, NotificationChannel } from '@/app/types/atlas-enterprise-modules';

export type EnqueueInput = DispatchNotificationInput & {
  dedupeKey: string;
  scheduledAt?: string;
  metadata?: Record<string, unknown>;
};

export type ManagerContacts = {
  email: string | null;
  phone: string | null;
  userEmail: string | null;
};

export async function resolveManagerContacts(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<ManagerContacts> {
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const userEmail = authUser?.user?.email ?? null;

  const { data: company } = await admin
    .from('atlas_companies')
    .select('email, phone, company_json')
    .eq('id', companyId)
    .maybeSingle();

  const json = (company?.company_json ?? {}) as Record<string, unknown>;
  const jsonEmail = typeof json.email === 'string' ? json.email : null;
  const jsonPhone = typeof json.telephone === 'string' ? json.telephone : null;

  return {
    email: company?.email?.trim() || jsonEmail?.trim() || userEmail,
    phone: company?.phone?.trim() || jsonPhone?.trim() || null,
    userEmail,
  };
}

/** Enqueue alert if not already pending/sent for this dedupe key. */
export async function enqueueNotification(
  admin: SupabaseClient,
  input: EnqueueInput,
): Promise<{ queued: boolean; id?: string }> {
  const { data: existing } = await admin
    .from('zafirix_notification_queue')
    .select('id')
    .eq('dedupe_key', input.dedupeKey)
    .in('status', ['pending', 'processing', 'sent'])
    .maybeSingle();

  if (existing?.id) return { queued: false };

  const { data, error } = await admin
    .from('zafirix_notification_queue')
    .insert({
      user_id: input.userId,
      company_id: input.companyId ?? null,
      channel: input.channel,
      category: input.category,
      title: input.title,
      body: input.body ?? null,
      recipient_email: input.recipientEmail ?? null,
      recipient_phone: input.recipientPhone ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      dedupe_key: input.dedupeKey,
      scheduled_at: input.scheduledAt ?? new Date().toISOString(),
      status: 'pending',
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single();

  if (error) return { queued: false };
  return { queued: true, id: String(data.id) };
}

/** Queue email + WhatsApp + in_app for managers (when contacts exist). */
export async function enqueueManagerAlert(
  admin: SupabaseClient,
  contacts: ManagerContacts,
  base: Omit<EnqueueInput, 'channel' | 'recipientEmail' | 'recipientPhone' | 'dedupeKey'> & { dedupeKey: string },
): Promise<number> {
  let count = 0;

  await recordNotification(admin, { ...base, channel: 'in_app' }, 'sent');
  count++;

  if (contacts.email) {
    const r = await enqueueNotification(admin, {
      ...base,
      channel: 'email',
      recipientEmail: contacts.email,
      dedupeKey: `${base.dedupeKey}:email`,
    });
    if (r.queued) count++;
  }

  if (contacts.phone) {
    const r = await enqueueNotification(admin, {
      ...base,
      channel: 'whatsapp',
      recipientPhone: contacts.phone,
      dedupeKey: `${base.dedupeKey}:whatsapp`,
    });
    if (r.queued) count++;
  }

  return count;
}

async function dispatchQueueItem(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<'sent' | 'failed' | 'skipped'> {
  const id = String(row.id);
  const channel = row.channel as NotificationChannel;
  const title = String(row.title ?? '');
  const body = String(row.body ?? title);

  await admin
    .from('zafirix_notification_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', id);

  let ok = false;
  let errorMessage: string | null = null;

  if (channel === 'email') {
    const email = String(row.recipient_email ?? '').trim();
    if (!email) {
      errorMessage = 'missing_recipient_email';
    } else {
      const result = await sendEmailViaResend({
        to: email,
        subject: title,
        html: `<div style="font-family:sans-serif;line-height:1.5"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body).replace(/\n/g, '<br/>')}</p><p style="color:#888;font-size:12px">Zafirix Pro — alerte automatique</p></div>`,
        text: body,
      });
      if (result.ok) ok = true;
      else if ('skipped' in result && result.skipped) {
        errorMessage = result.reason;
        ok = true;
      } else if ('error' in result) errorMessage = result.error;
    }
  } else if (channel === 'whatsapp') {
    const phone = String(row.recipient_phone ?? '').trim();
    if (!phone) {
      errorMessage = 'missing_recipient_phone';
    } else {
      const result = await sendWhatsAppMessage(phone, `${title}\n\n${body}`);
      ok = result.ok;
      if (!result.ok) errorMessage = result.reason;
      else if (result.channel === 'logged') {
        await admin
          .from('zafirix_notification_queue')
          .update({
            metadata: { ...(row.metadata as object), wa_deeplink: result.deeplink },
          })
          .eq('id', id);
      }
    }
  } else {
    ok = true;
  }

  const status = ok ? 'sent' : 'failed';
  await admin
    .from('zafirix_notification_queue')
    .update({
      status,
      sent_at: ok ? new Date().toISOString() : null,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (ok) {
    await recordNotification(
      admin,
      {
        userId: String(row.user_id),
        companyId: (row.company_id as string | null) ?? null,
        channel,
        category: row.category as NotificationCategory,
        title,
        body,
        entityType: (row.entity_type as string | null) ?? undefined,
        entityId: (row.entity_id as string | null) ?? undefined,
        recipientEmail: (row.recipient_email as string | null) ?? undefined,
        recipientPhone: (row.recipient_phone as string | null) ?? undefined,
      },
      'sent',
    );
  }

  return ok ? 'sent' : 'failed';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Process pending queue items (scheduled_at <= now). */
export async function processNotificationQueue(
  admin: SupabaseClient,
  opts?: { limit?: number; companyId?: string },
): Promise<{ processed: number; sent: number; failed: number }> {
  const limit = opts?.limit ?? 50;
  const now = new Date().toISOString();

  let query = admin
    .from('zafirix_notification_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (opts?.companyId) query = query.eq('company_id', opts.companyId);

  const { data: rows } = await query;
  let sent = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const result = await dispatchQueueItem(admin, row as Record<string, unknown>);
    if (result === 'sent') sent++;
    else if (result === 'failed') failed++;
  }

  return { processed: (rows ?? []).length, sent, failed };
}

export const FISCAL_ALERT_THRESHOLDS_DAYS = [21, 14, 7, 3, 1] as const;

export function fiscalDedupeKey(deadlineId: string, daysRemaining: number, channel: string): string {
  return `fiscal:${deadlineId}:d${daysRemaining}:${channel}`;
}

export function stockDedupeKey(storeId: string, itemId: string, channel: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `low_stock:${storeId}:${itemId}:${day}:${channel}`;
}

export function invoiceDedupeKey(invoiceId: string, channel: string): string {
  const week = getWeekKey();
  return `invoice_reminder:${invoiceId}:${week}:${channel}`;
}

export function debtDedupeKey(caseId: string, stage: string, channel: string): string {
  const week = getWeekKey();
  return `debt:${caseId}:${stage}:${week}:${channel}`;
}

export function contractDedupeKey(
  contractId: string,
  kind: 'expiry' | 'renewal',
  threshold: number,
  channel: string,
): string {
  return `contract:${contractId}:${kind}:${threshold}:${channel}`;
}

function getWeekKey(): string {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}
