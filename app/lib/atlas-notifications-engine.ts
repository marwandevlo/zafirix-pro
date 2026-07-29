/**
 * Omnichannel notification engine — invoice reminders, low stock, fiscal deadlines.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMoroccanFiscalDeadlines } from '@/app/lib/atlas-fiscal-calendar';
import { openWhatsAppShare } from '@/app/lib/atlas-quick-share';
import { sendEmailViaResend } from '@/app/lib/atlas-email-resend';
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

export async function dispatchNotification(
  admin: SupabaseClient,
  input: DispatchNotificationInput,
): Promise<{ ok: boolean; notificationId?: string; error?: string }> {
  let sent = false;
  let errorMsg: string | undefined;

  if (input.channel === 'email' && input.recipientEmail) {
    const result = await sendEmailViaResend({
      to: input.recipientEmail,
      subject: input.title,
      html: `<p>${(input.body ?? input.title).replace(/\n/g, '<br/>')}</p>`,
    });
    sent = result.ok;
    if (!result.ok && 'error' in result) errorMsg = result.error;
  } else if (input.channel === 'whatsapp') {
    if (typeof window !== 'undefined') {
      openWhatsAppShare(input.body ?? input.title, input.recipientPhone);
      sent = true;
    } else {
      sent = true;
    }
  } else {
    sent = true;
  }

  const notificationId = await recordNotification(admin, input, sent ? 'sent' : 'failed');
  return sent
    ? { ok: true, notificationId: notificationId ?? undefined }
    : { ok: false, error: errorMsg ?? 'dispatch_failed', notificationId: notificationId ?? undefined };
}

export async function scanInvoiceReminders(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: invoices } = await admin
    .from('atlas_invoices')
    .select('id, number, client_name, due_date, total_ttc, status')
    .eq('company_id', companyId)
    .neq('status', 'paid')
    .lt('due_date', today);

  let count = 0;
  for (const inv of invoices ?? []) {
    const title = `Relance facture ${inv.number} — ${inv.client_name}`;
    const body = `Facture ${inv.number} en retard depuis le ${inv.due_date}. Montant TTC : ${Number(inv.total_ttc).toLocaleString('fr-MA')} MAD.`;
    await recordNotification(admin, {
      userId,
      companyId,
      channel: 'in_app',
      category: 'invoice_reminder',
      title,
      body,
      entityType: 'invoice',
      entityId: String(inv.id),
    }, 'sent');
    count++;
  }
  return count;
}

export async function scanLowStockAlerts(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const { data: items } = await admin
    .from('zafirix_inventory_items')
    .select('id, sku, name, reorder_level')
    .eq('company_id', companyId);

  if (!items?.length) return 0;

  const { data: stockRows } = await admin
    .from('zafirix_inventory_stock')
    .select('item_id, quantity')
    .in('item_id', items.map((i) => i.id));

  const qtyByItem = new Map<string, number>();
  for (const s of stockRows ?? []) {
    qtyByItem.set(String(s.item_id), (qtyByItem.get(String(s.item_id)) ?? 0) + Number(s.quantity));
  }

  let count = 0;
  for (const item of items) {
    const total = qtyByItem.get(String(item.id)) ?? 0;
    const reorder = Number(item.reorder_level ?? 0);
    if (reorder > 0 && total <= reorder) {
      await recordNotification(admin, {
        userId,
        companyId,
        channel: 'in_app',
        category: 'low_stock',
        title: `Stock bas — ${item.name} (${item.sku})`,
        body: `Quantité totale ${total} ≤ seuil ${reorder}. Réapprovisionnement recommandé.`,
        entityType: 'inventory_item',
        entityId: String(item.id),
      }, 'sent');
      count++;
    }
  }
  return count;
}

export async function scanFiscalDeadlineAlerts(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const { deadlines } = buildMoroccanFiscalDeadlines(new Date());
  const urgent = deadlines.filter((d) => d.severity === 'red' || d.severity === 'orange');
  let count = 0;
  for (const d of urgent.slice(0, 8)) {
    await recordNotification(admin, {
      userId,
      companyId,
      channel: 'in_app',
      category: 'fiscal_deadline',
      title: `Échéance ${d.labelFr} — ${d.dueDate}`,
      body: `Obligation fiscale ${d.category.toUpperCase()} à préparer.`,
      entityType: 'fiscal_deadline',
      entityId: d.id,
    }, 'sent');
    count++;
  }
  return count;
}

export async function scanContractExpiryAlerts(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const alertDate = new Date();
  alertDate.setDate(alertDate.getDate() + 30);
  const alertYmd = alertDate.toISOString().slice(0, 10);

  const { data: contracts } = await admin
    .from('zafirix_legal_documents')
    .select('id, title, expiry_date')
    .eq('company_id', companyId)
    .not('expiry_date', 'is', null)
    .lte('expiry_date', alertYmd);

  let count = 0;
  for (const c of contracts ?? []) {
    await recordNotification(admin, {
      userId,
      companyId,
      channel: 'in_app',
      category: 'contract_expiry',
      title: `Contrat expirant — ${c.title ?? 'Sans titre'}`,
      body: `Date d'expiration : ${c.expiry_date}. Renouvellement ou archivage à prévoir.`,
      entityType: 'legal_contract',
      entityId: String(c.id),
    }, 'sent');
    count++;
  }
  return count;
}

export async function runNotificationDispatchers(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<{ invoiceReminders: number; lowStock: number; fiscal: number; contracts: number }> {
  const [invoiceReminders, lowStock, fiscal, contracts] = await Promise.all([
    scanInvoiceReminders(admin, userId, companyId),
    scanLowStockAlerts(admin, userId, companyId),
    scanFiscalDeadlineAlerts(admin, userId, companyId),
    scanContractExpiryAlerts(admin, userId, companyId),
  ]);
  return { invoiceReminders, lowStock, fiscal, contracts };
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  invoice_reminder: 'Relance facture',
  low_stock: 'Stock bas',
  fiscal_deadline: 'Échéance fiscale',
  contract_expiry: 'Contrat expirant',
  debt_collection: 'Recouvrement',
  delivery_update: 'Livraison',
  general: 'Général',
};
