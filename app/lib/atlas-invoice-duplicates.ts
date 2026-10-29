import { MONEY_TOLERANCE } from '@/app/lib/atlas-documents-accounting-engine';

export type InvoiceIdentity = {
  number: string | null | undefined;
  date: string | null | undefined;
  ttc: number | null | undefined;
  counterparty: string | null | undefined;
  ice?: string | null;
};

export function normalizeInvoiceNumber(value: string | null | undefined): string {
  return String(value ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}

function normalizeParty(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

/**
 * Two records describe the same invoice when number, date, TTC and counterparty all match.
 * Any missing element answers false: refusing a genuine invoice is worse than missing a copy.
 */
export function isSameInvoice(a: InvoiceIdentity, b: InvoiceIdentity): boolean {
  const numberA = normalizeInvoiceNumber(a.number);
  if (!numberA || numberA !== normalizeInvoiceNumber(b.number)) return false;
  if (!a.date || !b.date || a.date.slice(0, 10) !== b.date.slice(0, 10)) return false;
  if (a.ttc == null || b.ttc == null || Math.abs(Number(a.ttc) - Number(b.ttc)) > MONEY_TOLERANCE + 1e-9) return false;
  const iceA = String(a.ice ?? '').replace(/\D/g, '');
  const iceB = String(b.ice ?? '').replace(/\D/g, '');
  if (iceA && iceB) return iceA === iceB;
  const partyA = normalizeParty(a.counterparty);
  return partyA !== '' && partyA === normalizeParty(b.counterparty);
}
