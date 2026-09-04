'use server';

import {
  queueApprovalEmail,
  queuePasswordResetEmail,
  queueSecurityAlertEmail,
  queueSubscriptionEmail,
  type SubscriptionActionType,
} from '@/lib/email';

/** Fire-and-forget approval notice — never blocks the admin mutation. */
export async function queueApprovalNotice(userEmail: string, userName?: string | null): Promise<{ ok: true }> {
  queueApprovalEmail(userEmail, userName);
  return { ok: true };
}

/** Fire-and-forget subscription notice (upgrade / renew / change / cancel). */
export async function queueSubscriptionNotice(
  userEmail: string,
  userName: string | null | undefined,
  planName: string,
  actionType: SubscriptionActionType,
): Promise<{ ok: true }> {
  queueSubscriptionEmail(userEmail, userName, planName, actionType);
  return { ok: true };
}

/** Fire-and-forget branded reset link (caller must already have generated `resetLink`). */
export async function queuePasswordResetNotice(userEmail: string, resetLink: string): Promise<{ ok: true }> {
  queuePasswordResetEmail(userEmail, resetLink);
  return { ok: true };
}

/** Fire-and-forget security alert for a critical account change. */
export async function queueSecurityAlertNotice(
  userEmail: string,
  userName: string | null | undefined,
  actionDescription: string,
): Promise<{ ok: true }> {
  queueSecurityAlertEmail(userEmail, userName, actionDescription);
  return { ok: true };
}
