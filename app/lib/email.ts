import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmailViaResend, type SendEmailResult } from '@/app/lib/atlas-email-resend';
import type { EnsureUserProfileResult } from '@/app/lib/ensure-user-profile';
import { hasLifecycleEmailSent } from '@/app/lib/atlas-lifecycle-email';
import { isAccountAcceptedStatus, isRecentlyCreatedProfile } from '@/app/lib/email-account-status';
import { buildApprovalEmail, sendApprovalEmail } from '@/app/lib/send-approval-email';
import { EMAIL_BRAND_NAVY, emailGreeting, renderBrandedEmail } from '@/app/lib/email-brand';

export { isAccountAcceptedStatus, isRecentlyCreatedProfile } from '@/app/lib/email-account-status';
export { buildApprovalEmail, queueApprovalEmail, sendApprovalEmail } from '@/app/lib/send-approval-email';
export {
  buildPasswordResetEmail,
  buildSecurityAlertEmail,
  buildSubscriptionEmail,
  queuePasswordResetEmail,
  queueSecurityAlertEmail,
  queueSubscriptionEmail,
  sendPasswordResetEmail,
  sendSecurityAlertEmail,
  sendSubscriptionEmail,
  type SecurityAlertKind,
  type SubscriptionEmailKind,
  type TransactionalEmailKind,
} from '@/app/lib/email-transactional';

export type { SendEmailResult };

export const ACCOUNT_EMAIL_KEYS = ['user_added', 'user_accepted'] as const;
export type AccountEmailKey = (typeof ACCOUNT_EMAIL_KEYS)[number];

export type AccountNotificationKind = 'user_added' | 'user_accepted';

export type AccountEmailRecipient = {
  to: string;
  displayName?: string | null;
};

export function buildUserAddedEmail(recipient: AccountEmailRecipient): { subject: string; html: string; text: string } {
  const hello = emailGreeting(recipient.displayName);
  const subject = 'ZAFIRIX PRO — votre compte a été créé';
  const rendered = renderBrandedEmail({
    title: subject,
    preview: 'Votre compte Zafirixpro est prêt. Un administrateur validera l’accès si besoin.',
    heading: `${hello}, votre compte est créé`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#334155;">
        Bienvenue sur <strong style="color:${EMAIL_BRAND_NAVY};">Zafirixpro</strong>. Votre espace a bien été enregistré.
      </p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#334155;">
        Si votre accès est en attente de validation, vous recevrez un second e-mail dès que le compte sera <strong>accepté</strong>.
      </p>
      <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">
        En attendant, conservez cet e-mail : il confirme la création de votre identifiant.
      </p>
    `,
    ctaLabel: 'Se connecter',
    ctaHref: '/login',
  });
  return { subject, html: rendered.html, text: rendered.text };
}

export function buildUserAcceptedEmail(recipient: AccountEmailRecipient): { subject: string; html: string } {
  const template = buildApprovalEmail(recipient);
  return { subject: template.subject, html: template.html };
}

async function rememberAccountEmail(
  admin: SupabaseClient | undefined,
  userId: string | undefined,
  emailKey: AccountEmailKey,
): Promise<void> {
  if (!admin || !userId) return;
  const { error } = await admin.from('atlas_lifecycle_email_sends').insert({ user_id: userId, email_key: emailKey });
  if (error) {
    console.warn('[email] lifecycle send row not stored', { emailKey, userId, message: error.message });
  }
}

export async function sendAccountNotificationEmail(params: {
  kind: AccountNotificationKind;
  to: string;
  displayName?: string | null;
  userId?: string;
  admin?: SupabaseClient;
}): Promise<SendEmailResult> {
  const to = params.to.trim();
  if (!to) return { ok: false, error: 'missing_recipient' };

  const emailKey: AccountEmailKey = params.kind;
  if (params.admin && params.userId) {
    try {
      if (await hasLifecycleEmailSent(params.admin, params.userId, emailKey)) {
        return { ok: false, skipped: true, reason: 'already_sent' };
      }
    } catch (error) {
      console.warn('[email] idempotency check failed, sending anyway', {
        emailKey,
        message: error instanceof Error ? error.message : error,
      });
    }
  }

  if (params.kind === 'user_accepted') {
    return sendApprovalEmail({
      to,
      displayName: params.displayName,
      userId: params.userId,
      admin: params.admin,
    });
  }

  const template = buildUserAddedEmail({ to, displayName: params.displayName });

  const result = await sendEmailViaResend({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    kind: 'user_added',
  });

  if (!result.ok) {
    if ('skipped' in result && result.skipped) {
      console.info('[email] skipped', { kind: params.kind, reason: result.reason });
    } else if ('error' in result) {
      console.error('[email] send failed', { kind: params.kind, to, error: result.error });
    }
    return result;
  }

  await rememberAccountEmail(params.admin, params.userId, emailKey);
  return result;
}

/** Fire-and-forget wrapper: never throws into the calling API/action. */
export function notifyAccountChange(params: {
  kind: AccountNotificationKind;
  to?: string | null;
  displayName?: string | null;
  userId?: string;
  admin?: SupabaseClient;
}): void {
  const to = params.to?.trim();
  if (!to) {
    console.warn('[email] notify skipped: missing recipient', { kind: params.kind, userId: params.userId });
    return;
  }

  void sendAccountNotificationEmail({
    kind: params.kind,
    to,
    displayName: params.displayName,
    userId: params.userId,
    admin: params.admin,
  }).catch((error: unknown) => {
    console.error('[email] notify unexpected error', {
      kind: params.kind,
      message: error instanceof Error ? error.message : error,
    });
  });
}

/** Node-only: send added/accepted mail after ensureUserProfile. Safe no-op when keys are missing. */
export function notifyAfterEnsureUserProfile(params: {
  admin: SupabaseClient;
  userId: string;
  email?: string | null;
  displayName?: string | null;
  ensured: EnsureUserProfileResult;
}): void {
  if (!params.ensured.ok) return;

  const to = params.email?.trim();
  const displayName = params.displayName ?? to;

  if (params.ensured.activated) {
    notifyAccountChange({
      kind: 'user_accepted',
      to,
      displayName,
      userId: params.userId,
      admin: params.admin,
    });
    return;
  }

  const shouldAnnounceCreate =
    params.ensured.created ||
    (!isAccountAcceptedStatus(params.ensured.status) && isRecentlyCreatedProfile(params.ensured.createdAt));

  if (shouldAnnounceCreate) {
    notifyAccountChange({
      kind: 'user_added',
      to,
      displayName,
      userId: params.userId,
      admin: params.admin,
    });
  }
}
