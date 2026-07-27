import { getAtlasPlanById } from '@/app/lib/atlas-pricing-plans';

export const MANUAL_SUBSCRIPTION_PLANS = ['starter', 'pro', 'business', 'cabinet'] as const;
export type ManualSubscriptionPlan = (typeof MANUAL_SUBSCRIPTION_PLANS)[number];

export type ManualSubscriptionStatus = 'pending_manual' | 'active' | 'canceled';

/** Maps UI label "cabinet" to catalog plan id `business`. */
export function normalizeManualPlan(plan: string): 'starter' | 'pro' | 'business' | null {
  const p = plan.trim().toLowerCase();
  if (p === 'cabinet') return 'business';
  if (p === 'starter' || p === 'pro' || p === 'business') return p;
  return null;
}

export function planDisplayName(plan: string): string {
  const id = normalizeManualPlan(plan) ?? plan;
  const def = getAtlasPlanById(id);
  if (def) return def.name;
  if (plan.toLowerCase() === 'cabinet') return 'Cabinet';
  return plan;
}

export function buildManualSubscriptionWhatsAppUrl(params: {
  /** E.164 without + e.g. 212622171488 */
  phoneDigits?: string;
  planLabel: string;
  userEmail?: string;
}): string {
  const planName = String(params.planLabel ?? '').trim() || 'sélectionné';
  let message = `Bonjour, je souhaite activer le forfait ${planName} sur ZAFIRIX PRO pour mon compte.`;
  const email = String(params.userEmail ?? '').trim();
  if (email) {
    message += `\nMon email: ${email}`;
  }
  const digits = String(params.phoneDigits ?? getManualWhatsAppPhoneDigits()).replace(/\D/g, '') || '212622171488';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Deep link only; WhatsApp Business number for manual Maroc payments. */
export function getManualWhatsAppPhoneDigits(): string {
  const raw =
    process.env.NEXT_PUBLIC_MANUAL_PAYMENT_WHATSAPP_E164?.trim() ||
    process.env.NEXT_PUBLIC_ZAFIRIX_WHATSAPP_E164?.trim() ||
    '212622171488';
  return raw.replace(/^\+/, '').replace(/\D/g, '') || '212622171488';
}
