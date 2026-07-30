/**
 * Omnichannel notification engine — dispatch helpers and labels.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmailViaResend } from '@/app/lib/atlas-email-resend';
import {
  recordNotification,
  type DispatchNotificationInput,
} from '@/app/lib/atlas-notifications-core';
import { sendWhatsAppMessage } from '@/app/lib/whatsapp-service';
import type { NotificationCategory } from '@/app/types/atlas-enterprise-modules';

export type { DispatchNotificationInput } from '@/app/lib/atlas-notifications-core';
export { recordNotification } from '@/app/lib/atlas-notifications-core';
export {
  runNotificationDispatchers,
  runAutomatedAlertsForAllCompanies,
  scanInvoiceReminders,
  scanDebtCollectionAlerts,
  scanLowStockAlerts,
  scanFiscalDeadlineAlerts,
  scanContractExpiryAlerts,
} from '@/app/lib/atlas-notification-alerts';

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
    sent = result.ok || ('skipped' in result && !!result.skipped);
    if (!sent && 'error' in result) errorMsg = result.error;
  } else if (input.channel === 'whatsapp' && input.recipientPhone) {
    const result = await sendWhatsAppMessage(input.recipientPhone, input.body ?? input.title);
    sent = result.ok;
    if (!result.ok) errorMsg = result.reason;
  } else if (input.channel === 'in_app') {
    sent = true;
  } else {
    errorMsg = 'missing_recipient';
  }

  const notificationId = await recordNotification(admin, input, sent ? 'sent' : 'failed');
  return sent
    ? { ok: true, notificationId: notificationId ?? undefined }
    : { ok: false, error: errorMsg ?? 'dispatch_failed', notificationId: notificationId ?? undefined };
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
