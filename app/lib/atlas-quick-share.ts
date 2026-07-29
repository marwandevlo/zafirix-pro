/**
 * Quick share helpers — WhatsApp deeplinks, secure links, professional message templates.
 */

import { getPublicAppUrl } from '@/app/lib/atlas-app-url';
import { copyTextToClipboard } from '@/app/lib/copy-to-clipboard';

export type ShareLinkResponse = {
  ok?: boolean;
  shareLink?: string;
  token?: string;
  permissions?: string;
  expiresAt?: string;
  error?: string;
};

/** Build a professional bilingual share message for WhatsApp / SMS. */
export function buildQuickShareMessage(params: {
  entityLabel: string;
  shareUrl: string;
  senderName?: string;
}): string {
  const sender = params.senderName?.trim() ? `\n— ${params.senderName.trim()}` : '';
  return (
    `Bonjour,\n\n` +
    `Veuillez consulter le document « ${params.entityLabel} » via Zafirix Pro :\n` +
    `${params.shareUrl}\n\n` +
    `مرحباً، يرجى الاطلاع على الوثيقة عبر الرابط أعلاه.` +
    sender
  );
}

/** Open native mail client with pre-filled subject/body. */
export function openMailtoShare(params: { to?: string; subject: string; body: string }): void {
  if (typeof window === 'undefined') return;
  const qs = new URLSearchParams();
  if (params.to?.trim()) qs.set('to', params.to.trim());
  qs.set('subject', params.subject);
  qs.set('body', params.body);
  window.open(`mailto:?${qs.toString()}`, '_self');
}

/** Open WhatsApp Web/App with a pre-filled message. */
export function openWhatsAppShare(message: string, phoneE164?: string): void {
  if (typeof window === 'undefined') return;
  const encoded = encodeURIComponent(message);
  const digits = phoneE164?.replace(/\D/g, '');
  const url = digits
    ? `https://wa.me/${digits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Create a time-limited secure share link for a document. */
export async function createDocumentShareLink(
  documentId: string,
  options?: { permissions?: 'read_only' | 'download'; expiresInHours?: number },
): Promise<ShareLinkResponse> {
  const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      permissions: options?.permissions ?? 'download',
      expiresInHours: options?.expiresInHours ?? 168,
    }),
  });
  return (await res.json()) as ShareLinkResponse;
}

/** Copy secure share link to clipboard (creates link if needed). */
export async function copyDocumentShareLink(documentId: string, entityLabel: string): Promise<string> {
  const data = await createDocumentShareLink(documentId, { permissions: 'download' });
  if (!data.shareLink) throw new Error(data.error ?? 'share_failed');
  await copyTextToClipboard(data.shareLink);
  return data.shareLink;
}

/** Backup document to Google Drive; falls back to local PDF download on failure. */
export async function backupDocumentToDrive(
  documentId: string,
  format = 'pdf',
): Promise<{ ok: boolean; driveUrl?: string; localFallback?: boolean; message?: string }> {
  const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/backup-to-drive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ format }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    driveUrl?: string;
    error?: string;
    message?: string;
    localFallback?: boolean;
  };

  if (data.ok) {
    return { ok: true, driveUrl: data.driveUrl };
  }

  if (data.error === 'google_drive_not_connected' || data.localFallback) {
    const a = window.document.createElement('a');
    a.href = `/api/documents/${encodeURIComponent(documentId)}/export?format=${format}`;
    a.download = '';
    a.click();
    return {
      ok: false,
      localFallback: true,
      message: data.message ?? 'Google Drive non connecté — téléchargement local lancé.',
    };
  }

  return { ok: false, message: data.message ?? data.error ?? 'Sauvegarde échouée.' };
}

export function invoiceShareMessage(invoiceNumber: string, clientName: string, amountMad: number): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : getPublicAppUrl();
  return (
    `Bonjour ${clientName},\n\n` +
    `Votre facture ${invoiceNumber} d'un montant de ${amountMad.toLocaleString('fr-MA')} MAD ` +
    `est disponible sur Zafirix Pro.\n${origin}/factures\n\n` +
    `Cordialement.`
  );
}
