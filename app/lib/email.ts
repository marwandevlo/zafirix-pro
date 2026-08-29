import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicAppUrl } from '@/app/lib/atlas-app-url';
import { sendEmailViaResend, type SendEmailResult } from '@/app/lib/atlas-email-resend';
import type { EnsureUserProfileResult } from '@/app/lib/ensure-user-profile';
import { hasLifecycleEmailSent } from '@/app/lib/atlas-lifecycle-email';
import { isAccountAcceptedStatus, isRecentlyCreatedProfile } from '@/app/lib/email-account-status';

export { isAccountAcceptedStatus, isRecentlyCreatedProfile } from '@/app/lib/email-account-status';

export type { SendEmailResult };

export const ACCOUNT_EMAIL_KEYS = ['user_added', 'user_accepted'] as const;
export type AccountEmailKey = (typeof ACCOUNT_EMAIL_KEYS)[number];

export type AccountNotificationKind = 'user_added' | 'user_accepted';

export type AccountEmailRecipient = {
  to: string;
  displayName?: string | null;
};

const BRAND_NAVY = '#0F1F3D';
const BRAND_CYAN = '#06b6d4';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function greetingName(displayName?: string | null): string {
  const name = displayName?.trim();
  return name ? escapeHtml(name) : 'Bonjour';
}

function brandedShell(params: { title: string; preview: string; heading: string; bodyHtml: string; ctaLabel: string; ctaHref: string }): string {
  const appUrl = getPublicAppUrl();
  const ctaUrl = params.ctaHref.startsWith('http') ? params.ctaHref : `${appUrl}${params.ctaHref.startsWith('/') ? params.ctaHref : `/${params.ctaHref}`}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_NAVY};font-family:Inter,Segoe UI,system-ui,-apple-system,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(params.preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_NAVY};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 8px 20px 8px;">
              <p style="margin:0;font-size:12px;letter-spacing:0.16em;font-weight:700;color:${BRAND_CYAN};text-transform:uppercase;">ZAFIRIX PRO</p>
              <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Gestion d'entreprise · Maroc</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:18px;padding:32px 28px;">
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:${BRAND_NAVY};">${escapeHtml(params.heading)}</h1>
              ${params.bodyHtml}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
                <tr>
                  <td style="border-radius:12px;background:${BRAND_CYAN};">
                    <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:13px 22px;color:${BRAND_NAVY};text-decoration:none;font-weight:800;font-size:14px;">${escapeHtml(params.ctaLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                Si le bouton ne fonctionne pas, ouvrez :<br />
                <a href="${escapeHtml(ctaUrl)}" style="color:${BRAND_CYAN};word-break:break-all;">${escapeHtml(ctaUrl)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#7dd3fc;">© ${new Date().getFullYear()} Zafirixpro · Conformité, facturation et pilotage au Maroc.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildUserAddedEmail(recipient: AccountEmailRecipient): { subject: string; html: string } {
  const name = greetingName(recipient.displayName);
  const subject = 'ZAFIRIX PRO — votre compte a été créé';
  const html = brandedShell({
    title: subject,
    preview: 'Votre compte Zafirixpro est prêt. Un administrateur validera l’accès si besoin.',
    heading: `${name}, votre compte est créé`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#334155;">
        Bienvenue sur <strong style="color:${BRAND_NAVY};">Zafirixpro</strong>. Votre espace a bien été enregistré.
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
  return { subject, html };
}

export function buildUserAcceptedEmail(recipient: AccountEmailRecipient): { subject: string; html: string } {
  const name = greetingName(recipient.displayName);
  const subject = 'ZAFIRIX PRO — votre compte a été accepté';
  const html = brandedShell({
    title: subject,
    preview: 'Votre compte Zafirixpro est accepté. Vous pouvez accéder au tableau de bord.',
    heading: `${name}, votre compte est accepté`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#334155;">
        Bonne nouvelle : un administrateur a <strong>accepté</strong> votre compte Zafirixpro.
      </p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#334155;">
        Vous pouvez désormais vous connecter et utiliser la facturation, la TVA, les documents et le pilotage.
      </p>
      <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">
        En cas de question, répondez simplement à cet e-mail ou contactez le support.
      </p>
    `,
    ctaLabel: 'Ouvrir le tableau de bord',
    ctaHref: '/dashboard',
  });
  return { subject, html };
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

  const template =
    params.kind === 'user_accepted'
      ? buildUserAcceptedEmail({ to, displayName: params.displayName })
      : buildUserAddedEmail({ to, displayName: params.displayName });

  const result = await sendEmailViaResend({
    to,
    subject: template.subject,
    html: template.html,
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
