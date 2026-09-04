/**
 * Central transactional email API for Zafirix Pro (Resend).
 *
 * Preferred call sites:
 *   sendApprovalEmail(userEmail, userName)
 *   sendSubscriptionEmail(userEmail, userName, planName, actionType)
 *   sendPasswordResetEmail(userEmail, resetLink)
 *   sendSecurityAlertEmail(userEmail, userName, actionDescription)
 *
 * Object-param overloads remain for existing server routes.
 * Use the `queue*` variants from API routes / Server Actions so Resend never blocks DB writes.
 *
 * Env: RESEND_API_KEY (or EMAIL_API_KEY), NEXT_PUBLIC_APP_URL (or NEXT_PUBLIC_SITE_URL),
 * EMAIL_FROM (or RESEND_FROM_EMAIL).
 */

import { captureAtlasServerException, logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { redactEmailAddress } from '@/app/lib/email-brand';
import { resolveEmailEnv } from '@/app/lib/email-env';
import {
  sendApprovalEmail as sendApprovalEmailIdempotent,
  queueApprovalEmail as queueApprovalEmailIdempotent,
  type SendApprovalEmailParams,
} from '@/app/lib/send-approval-email';
import {
  inferSecurityAlertKind,
  queuePasswordResetEmail as queuePasswordResetEmailInternal,
  queueSecurityAlertEmail as queueSecurityAlertEmailInternal,
  queueSubscriptionEmail as queueSubscriptionEmailInternal,
  sendPasswordResetEmail as sendPasswordResetEmailInternal,
  sendSecurityAlertEmail as sendSecurityAlertEmailInternal,
  sendSubscriptionEmail as sendSubscriptionEmailInternal,
  type PasswordResetEmailParams,
  type SecurityAlertEmailParams,
  type SendEmailResult,
  type SubscriptionEmailKind,
  type SubscriptionEmailParams,
  type TransactionalRecipient,
} from '@/app/lib/email-transactional';

export type { SendEmailResult, SubscriptionEmailKind };

export type SubscriptionActionType =
  | 'upgrade'
  | 'upgraded'
  | 'activate'
  | 'activated'
  | 'renew'
  | 'renewed'
  | 'renewal'
  | 'change'
  | 'changed'
  | 'plan_changed'
  | 'cancel'
  | 'canceled'
  | 'cancelled'
  | SubscriptionEmailKind;

export {
  ACCOUNT_EMAIL_KEYS,
  buildPasswordResetEmail,
  buildSecurityAlertEmail,
  buildSubscriptionEmail,
  buildUserAcceptedEmail,
  buildUserAddedEmail,
  isAccountAcceptedStatus,
  isRecentlyCreatedProfile,
  notifyAccountChange,
  notifyAfterEnsureUserProfile,
  sendAccountNotificationEmail,
  type AccountEmailKey,
  type AccountEmailRecipient,
  type AccountNotificationKind,
  type SecurityAlertKind,
  type TransactionalEmailKind,
} from '@/app/lib/email';

export {
  buildApprovalEmail,
  type ApprovalEmailRecipient,
  type SendApprovalEmailParams,
} from '@/app/lib/send-approval-email';

function isObjectParam(value: unknown): value is { to: string } {
  return typeof value === 'object' && value !== null && 'to' in value;
}

export function normalizeSubscriptionAction(actionType: string): SubscriptionEmailKind {
  const value = actionType.trim().toLowerCase();
  if (value === 'subscription_activated' || value === 'activate' || value === 'activated' || value === 'upgrade' || value === 'upgraded') {
    return 'subscription_activated';
  }
  if (value === 'subscription_renewed' || value === 'renew' || value === 'renewed' || value === 'renewal') {
    return 'subscription_renewed';
  }
  if (value === 'subscription_plan_changed' || value === 'change' || value === 'changed' || value === 'plan_changed') {
    return 'subscription_plan_changed';
  }
  if (value === 'subscription_cancelled' || value === 'cancel' || value === 'canceled' || value === 'cancelled') {
    return 'subscription_cancelled';
  }
  return 'subscription_activated';
}

async function safeSend(kind: string, to: string, send: () => Promise<SendEmailResult>): Promise<SendEmailResult> {
  resolveEmailEnv();
  try {
    return await send();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logAtlasServerEvent('email', 'error', 'public_send_threw', {
      kind,
      recipient: redactEmailAddress(to),
      message,
    });
    await captureAtlasServerException(error, { scope: 'lib.email', kind });
    return { ok: false, error: message };
  }
}

export async function sendApprovalEmail(userEmail: string, userName?: string | null): Promise<SendEmailResult>;
export async function sendApprovalEmail(params: SendApprovalEmailParams): Promise<SendEmailResult>;
export async function sendApprovalEmail(
  userEmailOrParams: string | SendApprovalEmailParams,
  userName?: string | null,
): Promise<SendEmailResult> {
  const params: SendApprovalEmailParams = isObjectParam(userEmailOrParams)
    ? userEmailOrParams
    : { to: userEmailOrParams, displayName: userName };
  return safeSend('user_approval', params.to, () => sendApprovalEmailIdempotent(params));
}

export async function sendSubscriptionEmail(
  userEmail: string,
  userName: string | null | undefined,
  planName: string,
  actionType: SubscriptionActionType,
): Promise<SendEmailResult>;
export async function sendSubscriptionEmail(params: SubscriptionEmailParams): Promise<SendEmailResult>;
export async function sendSubscriptionEmail(
  userEmailOrParams: string | SubscriptionEmailParams,
  userName?: string | null,
  planName?: string,
  actionType?: SubscriptionActionType,
): Promise<SendEmailResult> {
  const params: SubscriptionEmailParams = isObjectParam(userEmailOrParams)
    ? userEmailOrParams
    : {
        to: userEmailOrParams,
        displayName: userName,
        planName: planName ?? 'votre forfait',
        kind: normalizeSubscriptionAction(String(actionType ?? 'activated')),
      };
  return safeSend(params.kind, params.to, () => sendSubscriptionEmailInternal(params));
}

export async function sendPasswordResetEmail(userEmail: string, resetLink: string): Promise<SendEmailResult>;
export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<SendEmailResult>;
export async function sendPasswordResetEmail(
  userEmailOrParams: string | PasswordResetEmailParams,
  resetLink?: string,
): Promise<SendEmailResult> {
  const params: PasswordResetEmailParams = isObjectParam(userEmailOrParams)
    ? userEmailOrParams
    : { to: userEmailOrParams, resetUrl: resetLink ?? '' };
  return safeSend('password_reset', params.to, () => sendPasswordResetEmailInternal(params));
}

export async function sendSecurityAlertEmail(
  userEmail: string,
  userName: string | null | undefined,
  actionDescription: string,
): Promise<SendEmailResult>;
export async function sendSecurityAlertEmail(params: SecurityAlertEmailParams): Promise<SendEmailResult>;
export async function sendSecurityAlertEmail(
  userEmailOrParams: string | SecurityAlertEmailParams,
  userName?: string | null,
  actionDescription?: string,
): Promise<SendEmailResult> {
  const params: SecurityAlertEmailParams = isObjectParam(userEmailOrParams)
    ? userEmailOrParams
    : {
        to: userEmailOrParams,
        displayName: userName,
        actionDescription: actionDescription ?? '',
        kind: inferSecurityAlertKind(actionDescription),
      };
  return safeSend(params.kind ?? 'profile_updated', params.to, () => sendSecurityAlertEmailInternal(params));
}

export function queueApprovalEmail(userEmail: string, userName?: string | null): void;
export function queueApprovalEmail(params: SendApprovalEmailParams | TransactionalRecipient): void;
export function queueApprovalEmail(
  userEmailOrParams: string | SendApprovalEmailParams | TransactionalRecipient,
  userName?: string | null,
): void {
  const params: SendApprovalEmailParams = isObjectParam(userEmailOrParams)
    ? userEmailOrParams
    : { to: userEmailOrParams, displayName: userName };
  queueApprovalEmailIdempotent(params);
}

export function queueSubscriptionEmail(
  userEmail: string,
  userName: string | null | undefined,
  planName: string,
  actionType: SubscriptionActionType,
): void;
export function queueSubscriptionEmail(params: SubscriptionEmailParams): void;
export function queueSubscriptionEmail(
  userEmailOrParams: string | SubscriptionEmailParams,
  userName?: string | null,
  planName?: string,
  actionType?: SubscriptionActionType,
): void {
  const params: SubscriptionEmailParams = isObjectParam(userEmailOrParams)
    ? userEmailOrParams
    : {
        to: userEmailOrParams,
        displayName: userName,
        planName: planName ?? 'votre forfait',
        kind: normalizeSubscriptionAction(String(actionType ?? 'activated')),
      };
  queueSubscriptionEmailInternal(params);
}

export function queuePasswordResetEmail(userEmail: string, resetLink: string): void;
export function queuePasswordResetEmail(params: PasswordResetEmailParams): void;
export function queuePasswordResetEmail(
  userEmailOrParams: string | PasswordResetEmailParams,
  resetLink?: string,
): void {
  const params: PasswordResetEmailParams = isObjectParam(userEmailOrParams)
    ? userEmailOrParams
    : { to: userEmailOrParams, resetUrl: resetLink ?? '' };
  queuePasswordResetEmailInternal(params);
}

export function queueSecurityAlertEmail(
  userEmail: string,
  userName: string | null | undefined,
  actionDescription: string,
): void;
export function queueSecurityAlertEmail(params: SecurityAlertEmailParams): void;
export function queueSecurityAlertEmail(
  userEmailOrParams: string | SecurityAlertEmailParams,
  userName?: string | null,
  actionDescription?: string,
): void {
  const params: SecurityAlertEmailParams = isObjectParam(userEmailOrParams)
    ? userEmailOrParams
    : {
        to: userEmailOrParams,
        displayName: userName,
        actionDescription: actionDescription ?? '',
        kind: inferSecurityAlertKind(actionDescription),
      };
  queueSecurityAlertEmailInternal(params);
}
