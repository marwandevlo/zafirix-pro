import type { SupabaseClient } from '@supabase/supabase-js';
import { captureAtlasServerException, logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { sendEmailViaResend, type SendEmailResult } from '@/app/lib/atlas-email-resend';
import {
  EMAIL_BRAND_NAME,
  EMAIL_BRAND_NAVY,
  emailGreeting,
  escapeEmailHtml,
  redactEmailAddress,
  renderBrandedEmail,
} from '@/app/lib/email-brand';

export type { SendEmailResult };

export const TRANSACTIONAL_EMAIL_KINDS = [
  'user_approval',
  'subscription_activated',
  'subscription_renewed',
  'subscription_plan_changed',
  'subscription_cancelled',
  'password_reset',
  'password_changed',
  'profile_updated',
] as const;

export type TransactionalEmailKind = (typeof TRANSACTIONAL_EMAIL_KINDS)[number];

export type TransactionalRecipient = {
  to: string;
  displayName?: string | null;
  userId?: string;
};

export type SubscriptionEmailKind =
  | 'subscription_activated'
  | 'subscription_renewed'
  | 'subscription_plan_changed'
  | 'subscription_cancelled';

export type SubscriptionEmailParams = TransactionalRecipient & {
  kind: SubscriptionEmailKind;
  planName: string;
  previousPlanName?: string | null;
  periodEndYmd?: string | null;
};

export type PasswordResetEmailParams = TransactionalRecipient & {
  resetUrl: string;
};

export type SecurityAlertKind = 'password_changed' | 'profile_updated';

export type SecurityAlertEmailParams = TransactionalRecipient & {
  kind?: SecurityAlertKind;
  changedFields?: string[];
  actionDescription?: string;
};

export type BuiltTransactionalEmail = {
  kind: TransactionalEmailKind;
  subject: string;
  html: string;
  text: string;
};

function paragraph(html: string): string {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#334155;">${html}</p>`;
}

export function buildApprovalEmail(recipient: TransactionalRecipient): BuiltTransactionalEmail {
  const hello = emailGreeting(recipient.displayName);
  const rendered = renderBrandedEmail({
    title: `${EMAIL_BRAND_NAME} — votre compte a été approuvé`,
    preview: `Votre compte ${EMAIL_BRAND_NAME} est approuvé. Connectez-vous pour accéder à votre espace.`,
    heading: `${hello}, votre compte est approuvé`,
    bodyHtml: [
      paragraph(
        `Merci de votre confiance. Un administrateur a <strong>approuvé</strong> votre accès à <strong style="color:${EMAIL_BRAND_NAVY};">${EMAIL_BRAND_NAME}</strong>.`,
      ),
      paragraph(
        'Vous pouvez dès maintenant vous connecter pour utiliser la facturation, la TVA, les documents et le pilotage.',
      ),
      paragraph('En cas de question, répondez simplement à cet e-mail ou contactez le support.'),
    ].join(''),
    ctaLabel: `Se connecter à ${EMAIL_BRAND_NAME}`,
    ctaHref: '/login',
  });
  return {
    kind: 'user_approval',
    subject: `${EMAIL_BRAND_NAME} — votre compte a été approuvé`,
    ...rendered,
  };
}

export function buildSubscriptionEmail(params: SubscriptionEmailParams): BuiltTransactionalEmail {
  const hello = emailGreeting(params.displayName);
  const plan = escapeEmailHtml(params.planName.trim() || 'votre forfait');
  const period = params.periodEndYmd?.trim();
  const previous = params.previousPlanName?.trim();

  const copy: Record<SubscriptionEmailKind, { subject: string; preview: string; heading: string; body: string }> = {
    subscription_activated: {
      subject: `${EMAIL_BRAND_NAME} — votre abonnement est activé`,
      preview: `Votre forfait ${params.planName} est actif sur ${EMAIL_BRAND_NAME}.`,
      heading: `${hello}, votre abonnement est actif`,
      body: [
        paragraph(
          `Votre forfait <strong style="color:${EMAIL_BRAND_NAVY};">${plan}</strong> est désormais <strong>actif</strong>. Merci de votre confiance.`,
        ),
        period ? paragraph(`Fin de la période en cours : <strong>${escapeEmailHtml(period)}</strong>.`) : '',
        paragraph('Vous pouvez gérer votre offre, vos factures et vos accès depuis l’espace abonnement.'),
      ].join(''),
    },
    subscription_renewed: {
      subject: `${EMAIL_BRAND_NAME} — renouvellement confirmé`,
      preview: `Le renouvellement de votre forfait ${params.planName} est confirmé.`,
      heading: `${hello}, votre renouvellement est confirmé`,
      body: [
        paragraph(`Le renouvellement de votre forfait <strong style="color:${EMAIL_BRAND_NAVY};">${plan}</strong> a bien été enregistré.`),
        period ? paragraph(`Prochaine échéance : <strong>${escapeEmailHtml(period)}</strong>.`) : '',
        paragraph('Aucun changement n’est requis de votre côté. Vous conservez l’accès à toutes les fonctionnalités du forfait.'),
      ].join(''),
    },
    subscription_plan_changed: {
      subject: `${EMAIL_BRAND_NAME} — changement de forfait`,
      preview: `Votre forfait ${EMAIL_BRAND_NAME} a été mis à jour.`,
      heading: `${hello}, votre forfait a changé`,
      body: [
        previous
          ? paragraph(
              `Votre offre est passée de <strong>${escapeEmailHtml(previous)}</strong> à <strong style="color:${EMAIL_BRAND_NAVY};">${plan}</strong>.`,
            )
          : paragraph(`Votre offre est désormais <strong style="color:${EMAIL_BRAND_NAVY};">${plan}</strong>.`),
        period ? paragraph(`Valable jusqu’au <strong>${escapeEmailHtml(period)}</strong>.`) : '',
        paragraph('Les nouveaux plafonds et modules s’appliquent immédiatement à votre espace.'),
      ].join(''),
    },
    subscription_cancelled: {
      subject: `${EMAIL_BRAND_NAME} — abonnement annulé`,
      preview: `Votre abonnement ${EMAIL_BRAND_NAME} a été annulé.`,
      heading: `${hello}, votre abonnement a été annulé`,
      body: [
        paragraph(`L’abonnement <strong>${plan}</strong> a été annulé.`),
        period
          ? paragraph(`Vous conservez l’accès jusqu’au <strong>${escapeEmailHtml(period)}</strong>, sauf indication contraire.`)
          : paragraph('L’accès aux fonctionnalités payantes peut être restreint selon les conditions de votre offre.'),
        paragraph('Vous pouvez souscrire à nouveau à tout moment depuis la page tarifs.'),
      ].join(''),
    },
  };

  const selected = copy[params.kind];
  const rendered = renderBrandedEmail({
    title: selected.subject,
    preview: selected.preview,
    heading: selected.heading,
    bodyHtml: selected.body,
    ctaLabel: params.kind === 'subscription_cancelled' ? 'Voir les tarifs' : 'Gérer mon abonnement',
    ctaHref: params.kind === 'subscription_cancelled' ? '/pricing' : '/subscription',
  });
  return { kind: params.kind, subject: selected.subject, ...rendered };
}

export function buildPasswordResetEmail(params: PasswordResetEmailParams): BuiltTransactionalEmail {
  const hello = emailGreeting(params.displayName);
  const rendered = renderBrandedEmail({
    title: `${EMAIL_BRAND_NAME} — réinitialisation du mot de passe`,
    preview: `Lien sécurisé pour réinitialiser votre mot de passe ${EMAIL_BRAND_NAME}.`,
    heading: `${hello}, réinitialisez votre mot de passe`,
    bodyHtml: [
      paragraph(`Nous avons reçu une demande de réinitialisation pour votre compte <strong>${EMAIL_BRAND_NAME}</strong>.`),
      paragraph('Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien expire rapidement et ne peut être utilisé qu’une fois.'),
      paragraph('Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail — votre mot de passe actuel reste inchangé.'),
    ].join(''),
    ctaLabel: 'Choisir un nouveau mot de passe',
    ctaHref: params.resetUrl,
    footerNote: 'Ne transmettez jamais ce lien. L’équipe Zafirixpro ne vous demandera jamais votre mot de passe.',
  });
  return {
    kind: 'password_reset',
    subject: `${EMAIL_BRAND_NAME} — réinitialisez votre mot de passe`,
    ...rendered,
  };
}

export function inferSecurityAlertKind(actionDescription?: string | null): SecurityAlertKind {
  return /mot de passe|password/i.test(String(actionDescription ?? '')) ? 'password_changed' : 'profile_updated';
}

export function buildSecurityAlertEmail(params: SecurityAlertEmailParams): BuiltTransactionalEmail {
  const hello = emailGreeting(params.displayName);
  const kind = params.kind ?? inferSecurityAlertKind(params.actionDescription);
  const description = params.actionDescription?.trim();
  const fields = (params.changedFields ?? []).map((f) => escapeEmailHtml(f)).filter(Boolean);
  const fieldList = fields.length
    ? paragraph(`Champs concernés : <strong>${fields.join(', ')}</strong>.`)
    : '';
  const descriptionBlock = description
    ? paragraph(`Détail : <strong>${escapeEmailHtml(description)}</strong>.`)
    : '';

  if (kind === 'password_changed') {
    const rendered = renderBrandedEmail({
      title: `${EMAIL_BRAND_NAME} — mot de passe modifié`,
      preview: `Le mot de passe de votre compte ${EMAIL_BRAND_NAME} vient d’être modifié.`,
      heading: `${hello}, votre mot de passe a été modifié`,
      bodyHtml: [
        paragraph(`Le mot de passe de votre compte <strong>${EMAIL_BRAND_NAME}</strong> vient d’être mis à jour.`),
        descriptionBlock,
        paragraph('Si vous êtes à l’origine de ce changement, aucune action n’est requise.'),
        paragraph('Dans le cas contraire, réinitialisez immédiatement votre mot de passe et contactez le support.'),
      ].join(''),
      ctaLabel: 'Se connecter',
      ctaHref: '/login',
      footerNote: 'Alerte de sécurité automatique — ne répondez pas avec vos identifiants.',
    });
    return {
      kind: 'password_changed',
      subject: `${EMAIL_BRAND_NAME} — alerte sécurité : mot de passe modifié`,
      ...rendered,
    };
  }

  const rendered = renderBrandedEmail({
    title: `${EMAIL_BRAND_NAME} — profil mis à jour`,
    preview: `Des informations importantes de votre compte ${EMAIL_BRAND_NAME} ont été modifiées.`,
    heading: `${hello}, votre profil a été mis à jour`,
    bodyHtml: [
      paragraph(`Des informations importantes de votre compte <strong>${EMAIL_BRAND_NAME}</strong> viennent d’être modifiées.`),
      descriptionBlock,
      fieldList,
      paragraph('Si vous n’êtes pas à l’origine de cette modification, contactez le support et sécurisez votre compte.'),
    ].join(''),
    ctaLabel: 'Voir mon profil',
    ctaHref: '/dashboard',
    footerNote: 'Alerte de sécurité automatique — ne répondez pas avec vos identifiants.',
  });
  return {
    kind: 'profile_updated',
    subject: `${EMAIL_BRAND_NAME} — alerte sécurité : profil mis à jour`,
    ...rendered,
  };
}

async function dispatchBuiltEmail(
  kind: TransactionalEmailKind,
  to: string,
  built: BuiltTransactionalEmail,
): Promise<SendEmailResult> {
  try {
    return await sendEmailViaResend({
      to,
      subject: built.subject,
      html: built.html,
      text: built.text,
      kind,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logAtlasServerEvent('email', 'error', 'transactional_dispatch_threw', {
      kind,
      recipient: redactEmailAddress(to),
      message,
    });
    await captureAtlasServerException(error, { scope: 'email.transactional', kind });
    return { ok: false, error: message };
  }
}

export async function sendApprovalEmail(params: TransactionalRecipient): Promise<SendEmailResult> {
  const to = params.to.trim();
  if (!to) return { ok: false, error: 'missing_recipient' };
  return dispatchBuiltEmail('user_approval', to, buildApprovalEmail(params));
}

export async function sendSubscriptionEmail(params: SubscriptionEmailParams): Promise<SendEmailResult> {
  const to = params.to.trim();
  if (!to) return { ok: false, error: 'missing_recipient' };
  return dispatchBuiltEmail(params.kind, to, buildSubscriptionEmail({ ...params, to }));
}

export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<SendEmailResult> {
  const to = params.to.trim();
  if (!to) return { ok: false, error: 'missing_recipient' };
  if (!params.resetUrl.trim()) return { ok: false, error: 'missing_reset_url' };
  return dispatchBuiltEmail('password_reset', to, buildPasswordResetEmail({ ...params, to }));
}

export async function sendSecurityAlertEmail(params: SecurityAlertEmailParams): Promise<SendEmailResult> {
  const to = params.to.trim();
  if (!to) return { ok: false, error: 'missing_recipient' };
  const kind = params.kind ?? inferSecurityAlertKind(params.actionDescription);
  return dispatchBuiltEmail(kind, to, buildSecurityAlertEmail({ ...params, to, kind }));
}

function queue<T>(kind: TransactionalEmailKind, to: string | null | undefined, send: () => Promise<SendEmailResult>): void {
  const recipient = to?.trim();
  if (!recipient) {
    logAtlasServerEvent('email', 'warn', 'queue_skipped_missing_recipient', { kind });
    return;
  }
  void send()
    .then((result) => {
      if (!result.ok && !('skipped' in result && result.skipped)) {
        logAtlasServerEvent('email', 'error', 'queued_send_failed', {
          kind,
          recipient: redactEmailAddress(recipient),
          error: 'error' in result ? result.error : 'unknown',
        });
      }
    })
    .catch((error: unknown) => {
      logAtlasServerEvent('email', 'error', 'queued_send_threw', {
        kind,
        recipient: redactEmailAddress(recipient),
        message: error instanceof Error ? error.message : String(error),
      });
      void captureAtlasServerException(error, { scope: 'email.queue', kind });
    });
}

export function queueApprovalEmail(params: TransactionalRecipient): void {
  queue('user_approval', params.to, () => sendApprovalEmail(params));
}

export function queueSubscriptionEmail(params: SubscriptionEmailParams): void {
  queue(params.kind, params.to, () => sendSubscriptionEmail(params));
}

export function queuePasswordResetEmail(params: PasswordResetEmailParams): void {
  queue('password_reset', params.to, () => sendPasswordResetEmail(params));
}

export function queueSecurityAlertEmail(params: SecurityAlertEmailParams): void {
  const kind = params.kind ?? inferSecurityAlertKind(params.actionDescription);
  queue(kind, params.to, () => sendSecurityAlertEmail({ ...params, kind }));
}

export async function resolveAuthUserContact(
  admin: SupabaseClient,
  userId: string,
): Promise<{ email: string; displayName: string } | null> {
  try {
    const [{ data: authWrap }, { data: profile }] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from('profiles').select('email, full_name').eq('id', userId).maybeSingle(),
    ]);
    const authEmail = String(authWrap.user?.email ?? '').trim();
    const row = (profile ?? {}) as { email?: string | null; full_name?: string | null };
    const email = String(row.email ?? '').trim() || authEmail;
    if (!email) return null;
    const meta = authWrap.user?.user_metadata as Record<string, unknown> | undefined;
    const metaName =
      typeof meta?.full_name === 'string' ? meta.full_name : typeof meta?.name === 'string' ? meta.name : '';
    const displayName = String(row.full_name ?? '').trim() || metaName || email;
    return { email, displayName };
  } catch (error) {
    logAtlasServerEvent('email', 'error', 'resolve_contact_failed', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
