import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { redactEmailAddress } from '@/app/lib/email-brand';
import { resolveEmailEnv } from '@/app/lib/email-env';

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string };

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return 'resend_error';
}

function logResult(kind: string | undefined, to: string, result: SendEmailResult): void {
  const recipient = redactEmailAddress(to);
  if (result.ok) {
    logAtlasServerEvent('email', 'info', 'resend_sent', { kind: kind ?? 'unspecified', recipient, id: result.id ?? null });
    return;
  }
  if ('skipped' in result && result.skipped) {
    logAtlasServerEvent('email', 'warn', 'resend_skipped', { kind: kind ?? 'unspecified', recipient, reason: result.reason });
    return;
  }
  logAtlasServerEvent('email', 'error', 'resend_failed', {
    kind: kind ?? 'unspecified',
    recipient,
    error: 'error' in result ? result.error : 'unknown',
  });
}

/**
 * Sends via the official Resend SDK when `EMAIL_API_KEY` or `RESEND_API_KEY` is set.
 * Dynamic import keeps Edge middleware / client bundles free of the Node SDK.
 * Missing keys skip (no throw) so Vercel builds succeed.
 */
export async function sendEmailViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  kind?: string;
}): Promise<SendEmailResult> {
  const env = resolveEmailEnv();
  const apiKey = env.resendApiKey;
  const from = env.fromAddress;
  const to = params.to.trim();
  const kind = params.kind;

  if (!apiKey) {
    const result: SendEmailResult = { ok: false, skipped: true, reason: 'RESEND_API_KEY or EMAIL_API_KEY not configured' };
    logResult(kind, to, result);
    return result;
  }

  if (!to) {
    const result: SendEmailResult = { ok: false, error: 'missing_recipient' };
    logResult(kind, to, result);
    return result;
  }

  try {
    const { Resend } = await import('resend');
    const { data, error } = await new Resend(apiKey).emails.send({
      from,
      to: [to],
      subject: params.subject,
      html: params.html,
      text: params.text ?? stripHtml(params.html),
    });

    if (error) {
      const result: SendEmailResult = { ok: false, error: errorMessage(error) };
      logResult(kind, to, result);
      return result;
    }
    const result: SendEmailResult = { ok: true, id: data?.id };
    logResult(kind, to, result);
    return result;
  } catch (e) {
    const result: SendEmailResult = { ok: false, error: e instanceof Error ? e.message : 'network_error' };
    logResult(kind, to, result);
    return result;
  }
}
