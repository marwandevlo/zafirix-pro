import 'server-only';

import { getAuthSiteUrl } from '@/app/lib/site-url';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { redactEmailAddress } from '@/app/lib/email-brand';
import { sendPasswordResetEmail, type SendEmailResult } from '@/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidNotifyEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * Generate a Supabase recovery link and send the branded reset email.
 * Returns a generic ok to the caller — never reveals whether the account exists.
 */
export async function dispatchPasswordResetForEmail(rawEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!isValidNotifyEmail(email)) {
    return { ok: false, error: 'invalid_email' };
  }

  let admin: ReturnType<typeof getSupabaseServiceRoleClient>;
  try {
    admin = getSupabaseServiceRoleClient();
  } catch (error) {
    logAtlasServerEvent('email', 'error', 'password_reset_misconfigured', {
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'server_misconfigured' };
  }

  const redirectTo = `${getAuthSiteUrl()}/reset-password`;

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

    if (error) {
      // Unknown user / rate limit — still look like success to the client.
      logAtlasServerEvent('email', 'warn', 'password_reset_link_not_generated', {
        recipient: redactEmailAddress(email),
        message: error.message,
      });
      return { ok: true };
    }

    const actionLink = String(data.properties?.action_link ?? '').trim();
    if (!actionLink) {
      logAtlasServerEvent('email', 'warn', 'password_reset_empty_action_link', {
        recipient: redactEmailAddress(email),
      });
      return { ok: true };
    }

    const meta = data.user?.user_metadata as Record<string, unknown> | undefined;
    const displayName =
      typeof meta?.full_name === 'string' ? meta.full_name : typeof meta?.name === 'string' ? meta.name : email;

    const result: SendEmailResult = await sendPasswordResetEmail({
      to: email,
      displayName,
      userId: data.user?.id,
      resetUrl: actionLink,
    });

    if (!result.ok && !('skipped' in result && result.skipped)) {
      logAtlasServerEvent('email', 'error', 'password_reset_send_failed', {
        recipient: redactEmailAddress(email),
        error: 'error' in result ? result.error : 'unknown',
      });
    }
    return { ok: true };
  } catch (error) {
    logAtlasServerEvent('email', 'error', 'password_reset_unexpected', {
      recipient: redactEmailAddress(email),
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: true };
  }
}
