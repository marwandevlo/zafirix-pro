import { getPublicAppUrl } from '@/app/lib/atlas-app-url';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';

export type EmailEnvSnapshot = {
  resendApiKey: string;
  fromAddress: string;
  appUrl: string;
  hasResendApiKey: boolean;
  hasAppUrlEnv: boolean;
  hasFromEnv: boolean;
};

let warnedMissingKey = false;
let warnedMissingAppUrl = false;
let warnedMissingFrom = false;

export function resolveResendApiKey(): string {
  return (process.env.RESEND_API_KEY ?? process.env.EMAIL_API_KEY ?? '').trim();
}

export function resolveResendFromAddress(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    'ZAFIRIX PRO <onboarding@resend.dev>'
  );
}

export function hasPublicAppUrlEnv(): boolean {
  return Boolean((process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '').trim());
}

export function resolveEmailEnv(): EmailEnvSnapshot {
  const resendApiKey = resolveResendApiKey();
  const appUrl = getPublicAppUrl();
  const hasAppUrlEnv = hasPublicAppUrlEnv();
  const hasFromEnv = Boolean((process.env.EMAIL_FROM ?? process.env.RESEND_FROM_EMAIL ?? '').trim());
  const fromAddress = resolveResendFromAddress();

  if (!resendApiKey && !warnedMissingKey) {
    warnedMissingKey = true;
    logAtlasServerEvent('email', 'warn', 'resend_api_key_missing', {
      hint: 'Set RESEND_API_KEY (or EMAIL_API_KEY). Sends will be skipped.',
    });
  }

  if (!hasAppUrlEnv && !warnedMissingAppUrl) {
    warnedMissingAppUrl = true;
    logAtlasServerEvent('email', 'warn', 'public_app_url_env_missing', {
      hint: 'Set NEXT_PUBLIC_APP_URL (or NEXT_PUBLIC_SITE_URL) so CTA links stay canonical.',
      fallback: appUrl,
    });
  }

  if (!hasFromEnv && !warnedMissingFrom) {
    warnedMissingFrom = true;
    logAtlasServerEvent('email', 'warn', 'email_from_missing', {
      hint: 'Set EMAIL_FROM (or RESEND_FROM_EMAIL). Using the Resend onboarding default.',
      fallback: fromAddress,
    });
  }

  return {
    resendApiKey,
    fromAddress,
    appUrl,
    hasResendApiKey: Boolean(resendApiKey),
    hasAppUrlEnv,
    hasFromEnv,
  };
}
