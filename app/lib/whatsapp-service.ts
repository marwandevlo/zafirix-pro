/**
 * WhatsApp messaging layer — production path uses Meta WhatsApp Cloud API when configured.
 * Without credentials, operations log structured lines and expose wa.me deep links for ops tooling.
 */

import { ATLAS_INCIDENT_HOTFIX_GROWTH } from '@/app/lib/atlas-hotfix';

export type WhatsAppSendResult =
  | { ok: true; channel: 'cloud_api'; messageId?: string }
  | { ok: true; channel: 'logged'; deeplink: string }
  | { ok: false; reason: string };

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Public deep link (opens WhatsApp client). Safe to embed in emails / admin UI. */
export function buildWaMeDeepLink(phoneE164Digits: string, text: string): string {
  const d = digitsOnly(phoneE164Digits);
  const q = encodeURIComponent(text);
  return `https://wa.me/${d}?text=${q}`;
}

/**
 * Sends a WhatsApp message when Cloud API env is configured; otherwise logs + returns deeplink (integration-ready).
 */
export async function sendWhatsAppMessage(phone: string, message: string): Promise<WhatsAppSendResult> {
  if (ATLAS_INCIDENT_HOTFIX_GROWTH) {
    const to = digitsOnly(phone);
    if (!to) return { ok: false, reason: 'invalid_phone' };
    return { ok: true, channel: 'logged', deeplink: buildWaMeDeepLink(to, message) };
  }

  const token = process.env.WHATSAPP_CLOUD_API_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  const to = digitsOnly(phone);
  if (!to) return { ok: false, reason: 'invalid_phone' };

  const deeplink = buildWaMeDeepLink(to, message);

  if (!token || !phoneNumberId) {
    console.info('[whatsapp-service] cloud_api_disabled', { to: to.slice(0, 5) + '…', preview: message.slice(0, 120) });
    return { ok: true, channel: 'logged', deeplink };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: false, body: message.slice(0, 4096) },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    if (!res.ok) {
      console.warn('[whatsapp-service] api_error', res.status, json);
      return { ok: true, channel: 'logged', deeplink };
    }
    const mid = json.messages?.[0]?.id;
    return { ok: true, channel: 'cloud_api', messageId: mid };
  } catch (e) {
    console.warn('[whatsapp-service] network', e);
    return { ok: true, channel: 'logged', deeplink };
  }
}

/** Ops / sales line for outbound automation (E.164 digits, no +). */
export function getWhatsAppOpsPhoneDigits(): string {
  return (
    process.env.WHATSAPP_OPS_PHONE_E164?.trim() ||
    process.env.NEXT_PUBLIC_MANUAL_PAYMENT_WHATSAPP_E164?.trim() ||
    '212665425852'
  ).replace(/\D/g, '');
}
