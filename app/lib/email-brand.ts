import { getPublicAppUrl } from '@/app/lib/atlas-app-url';

export const EMAIL_BRAND_NAVY = '#0F1F3D';
export const EMAIL_BRAND_CYAN = '#06b6d4';
export const EMAIL_BRAND_NAME = 'ZAFIRIX PRO';

export type BrandedEmailShellParams = {
  title: string;
  preview: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
};

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function emailGreeting(displayName?: string | null): string {
  const name = displayName?.trim();
  return name ? `Bonjour ${escapeEmailHtml(name)}` : 'Bonjour';
}

export function resolveEmailCtaUrl(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  const appUrl = getPublicAppUrl();
  return `${appUrl}${href.startsWith('/') ? href : `/${href}`}`;
}

export function htmlToEmailText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function redactEmailAddress(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

/** Shared dark/light SaaS shell — navy frame, light card, cyan CTA. */
export function renderBrandedEmail(params: BrandedEmailShellParams): { html: string; text: string } {
  const appUrl = getPublicAppUrl();
  const year = new Date().getFullYear();
  const ctaUrl = params.ctaHref ? resolveEmailCtaUrl(params.ctaHref) : '';
  const ctaBlock =
    params.ctaLabel && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
                <tr>
                  <td style="border-radius:12px;background:${EMAIL_BRAND_CYAN};">
                    <a href="${escapeEmailHtml(ctaUrl)}" style="display:inline-block;padding:13px 22px;color:${EMAIL_BRAND_NAVY};text-decoration:none;font-weight:800;font-size:14px;">${escapeEmailHtml(params.ctaLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                Si le bouton ne fonctionne pas, ouvrez :<br />
                <a href="${escapeEmailHtml(ctaUrl)}" style="color:${EMAIL_BRAND_CYAN};word-break:break-all;">${escapeEmailHtml(ctaUrl)}</a>
              </p>`
      : '';

  const footerNote = params.footerNote
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">${escapeEmailHtml(params.footerNote)}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeEmailHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_BRAND_NAVY};font-family:Inter,Segoe UI,system-ui,-apple-system,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeEmailHtml(params.preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BRAND_NAVY};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 8px 20px 8px;">
              <p style="margin:0;font-size:12px;letter-spacing:0.16em;font-weight:700;color:${EMAIL_BRAND_CYAN};text-transform:uppercase;">${EMAIL_BRAND_NAME}</p>
              <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Gestion d'entreprise · Maroc</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:18px;padding:32px 28px;">
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:${EMAIL_BRAND_NAVY};">${params.heading}</h1>
              ${params.bodyHtml}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#7dd3fc;">© ${year} Zafirixpro · Conformité, facturation et pilotage au Maroc.</p>
              ${footerNote}
              <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#64748b;"><a href="${escapeEmailHtml(appUrl)}" style="color:${EMAIL_BRAND_CYAN};">${escapeEmailHtml(appUrl)}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    htmlToEmailText(params.heading),
    htmlToEmailText(params.bodyHtml),
    ctaUrl ? `${params.ctaLabel ?? 'Ouvrir'} : ${ctaUrl}` : '',
    `© ${year} Zafirixpro — ${appUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { html, text };
}
