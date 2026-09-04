import type { SupabaseClient } from '@supabase/supabase-js';
import { hasLifecycleEmailSent } from '@/app/lib/atlas-lifecycle-email';
import {
  buildApprovalEmail,
  queueApprovalEmail as queueApprovalEmailOnce,
  sendApprovalEmail as sendApprovalEmailOnce,
  type SendEmailResult,
  type TransactionalRecipient,
} from '@/app/lib/email-transactional';

export type { SendEmailResult };
export { buildApprovalEmail };

export const APPROVAL_EMAIL_KEY = 'user_accepted' as const;

export type ApprovalEmailRecipient = TransactionalRecipient;
export type SendApprovalEmailParams = TransactionalRecipient & {
  admin?: SupabaseClient;
};

async function rememberApprovalEmail(admin: SupabaseClient | undefined, userId: string | undefined): Promise<void> {
  if (!admin || !userId) return;
  const { error } = await admin.from('atlas_lifecycle_email_sends').insert({
    user_id: userId,
    email_key: APPROVAL_EMAIL_KEY,
  });
  if (error) {
    console.warn('[sendApprovalEmail] lifecycle send row not stored', { userId, message: error.message });
  }
}

/**
 * Approval mail with lifecycle idempotency (one `user_accepted` send per user).
 */
export async function sendApprovalEmail(params: SendApprovalEmailParams): Promise<SendEmailResult> {
  const to = params.to.trim();
  if (!to) return { ok: false, error: 'missing_recipient' };

  if (params.admin && params.userId) {
    try {
      if (await hasLifecycleEmailSent(params.admin, params.userId, APPROVAL_EMAIL_KEY)) {
        return { ok: false, skipped: true, reason: 'already_sent' };
      }
    } catch (error) {
      console.warn('[sendApprovalEmail] idempotency check failed, sending anyway', {
        userId: params.userId,
        message: error instanceof Error ? error.message : error,
      });
    }
  }

  const result = await sendApprovalEmailOnce({
    to,
    displayName: params.displayName,
    userId: params.userId,
  });

  if (result.ok) {
    await rememberApprovalEmail(params.admin, params.userId);
  }
  return result;
}

export function queueApprovalEmail(params: SendApprovalEmailParams): void {
  const to = params.to?.trim();
  if (!to) {
    queueApprovalEmailOnce(params);
    return;
  }

  void sendApprovalEmail(params).catch((error: unknown) => {
    console.error('[sendApprovalEmail] unexpected error', {
      userId: params.userId,
      message: error instanceof Error ? error.message : error,
    });
  });
}
