export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string };

function resolveResendApiKey(): string {
  return (process.env.EMAIL_API_KEY ?? process.env.RESEND_API_KEY ?? '').trim();
}

function resolveFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || 'ZAFIRIX PRO <onboarding@resend.dev>';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return 'resend_error';
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
}): Promise<SendEmailResult> {
  const apiKey = resolveResendApiKey();
  const from = resolveFromAddress();

  if (!apiKey) {
    return { ok: false, skipped: true, reason: 'EMAIL_API_KEY or RESEND_API_KEY not configured' };
  }

  const to = params.to.trim();
  if (!to) return { ok: false, error: 'missing_recipient' };

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
      return { ok: false, error: errorMessage(error) };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network_error' };
  }
}
