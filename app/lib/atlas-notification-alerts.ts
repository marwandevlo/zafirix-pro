/**
 * Automated alert scanners — invoice/debt reminders, fiscal deadlines, per-store low stock.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  enqueueManagerAlert,
  processNotificationQueue,
  resolveManagerContacts,
  stockDedupeKey,
} from '@/app/lib/atlas-notification-queue';

/** Overdue invoices + upcoming due — manager + client email/WhatsApp. */
export async function scanInvoiceReminders(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const { scanSmartDebtCollection } = await import('@/app/lib/atlas-debt-collection-server');
  const result = await scanSmartDebtCollection(admin, userId, companyId);
  return result.invoiceAlerts + result.debtAlerts;
}

/** Active debt collection cases — included in scanInvoiceReminders via scanSmartDebtCollection. */
export async function scanDebtCollectionAlerts(
  _admin: SupabaseClient,
  _userId: string,
  _companyId: string,
): Promise<number> {
  return 0;
}

/** Per-store low stock — instant manager alert (deduped daily per store/item). */
export async function scanLowStockAlerts(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const contacts = await resolveManagerContacts(admin, userId, companyId);

  const { data: stores } = await admin
    .from('zafirix_stores')
    .select('id, name')
    .eq('company_id', companyId);

  const { data: items } = await admin
    .from('zafirix_inventory_items')
    .select('id, sku, name, reorder_level')
    .eq('company_id', companyId);

  if (!items?.length) return 0;

  const { data: stockRows } = await admin
    .from('zafirix_inventory_stock')
    .select('store_id, item_id, quantity')
    .in('item_id', items.map((i) => i.id));

  const storeName = new Map((stores ?? []).map((s) => [String(s.id), String(s.name ?? 'Magasin')]));
  let count = 0;

  for (const s of stockRows ?? []) {
    const item = items.find((i) => String(i.id) === String(s.item_id));
    if (!item) continue;
    const qty = Number(s.quantity ?? 0);
    const reorder = Number(item.reorder_level ?? 0);
    if (reorder <= 0 || qty > reorder) continue;

    const storeId = String(s.store_id);
    const storeLabel = storeName.get(storeId) ?? 'Magasin';
    const title = `Stock bas — ${item.name} @ ${storeLabel}`;
    const body = `${item.sku} : ${qty} ${qty === 1 ? 'unité' : 'unités'} (seuil ${reorder}) au magasin ${storeLabel}. Réapprovisionnement recommandé.`;

    count += await enqueueManagerAlert(admin, contacts, {
      userId,
      companyId,
      category: 'low_stock',
      title,
      body,
      entityType: 'inventory_item',
      entityId: String(item.id),
      dedupeKey: stockDedupeKey(storeId, String(item.id), 'all'),
      metadata: { storeId, quantity: qty, reorderLevel: reorder },
    });
  }
  return count;
}

/** TVA, IS, IR, CNSS — proactive alerts using DB preferences + accountant contacts. */
export async function scanFiscalDeadlineAlerts(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const { scanAndAlertTaxDeadlines } = await import('@/app/lib/atlas-tax-calendar-server');
  const result = await scanAndAlertTaxDeadlines(admin, userId, companyId);
  return result.alerted;
}

export async function scanContractExpiryAlerts(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const { scanAndAlertContractRenewals } = await import('@/app/lib/atlas-contracts-server');
  const result = await scanAndAlertContractRenewals(admin, userId, companyId);
  return result.alerted;
}

export async function runNotificationDispatchers(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<{
  invoiceReminders: number;
  debtCollection: number;
  lowStock: number;
  fiscal: number;
  contracts: number;
  queueProcessed: number;
}> {
  const [smartDebt, lowStock, fiscal, contracts] = await Promise.all([
    (async () => {
      const { scanSmartDebtCollection } = await import('@/app/lib/atlas-debt-collection-server');
      return scanSmartDebtCollection(admin, userId, companyId);
    })(),
    scanLowStockAlerts(admin, userId, companyId),
    scanFiscalDeadlineAlerts(admin, userId, companyId),
    scanContractExpiryAlerts(admin, userId, companyId),
  ]);

  const queue = await processNotificationQueue(admin, { limit: 100, companyId });

  return {
    invoiceReminders: smartDebt.invoiceAlerts,
    debtCollection: smartDebt.debtAlerts,
    lowStock,
    fiscal,
    contracts,
    queueProcessed: queue.sent,
  };
}

/** Cron entry — scan all active companies then flush queue. */
export async function runAutomatedAlertsForAllCompanies(
  admin: SupabaseClient,
  opts?: { maxCompanies?: number },
): Promise<{
  companies: number;
  queued: number;
  queue: { processed: number; sent: number; failed: number };
}> {
  const limit = opts?.maxCompanies ?? 200;
  const { data: companies } = await admin
    .from('atlas_companies')
    .select('id, user_id')
    .eq('is_active', true)
    .neq('status', 'archived')
    .limit(limit);

  let queued = 0;
  for (const co of companies ?? []) {
    const userId = String(co.user_id);
    const companyId = String(co.id);
    const counts = await runNotificationDispatchers(admin, userId, companyId);
    queued +=
      counts.invoiceReminders +
      counts.debtCollection +
      counts.lowStock +
      counts.fiscal +
      counts.contracts;
  }

  const queue = await processNotificationQueue(admin, { limit: 200 });
  return { companies: (companies ?? []).length, queued, queue };
}
