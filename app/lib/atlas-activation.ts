/** Shared post-signup landing. Query is part of the path so auth `next` can carry it. */
export const ACTIVATION_INVOICE_PATH = '/factures?welcome=1';

/**
 * Same naming rule as signup: explicit company name, otherwise `Société de {name}`,
 * otherwise `Mon Entreprise`.
 */
export function placeholderCompanyName(
  fullName?: string | null,
  companyName?: string | null,
): string {
  const explicit = String(companyName ?? '').trim();
  if (explicit) return explicit;
  const person = String(fullName ?? '').trim();
  if (person) return `Société de ${person}`;
  return 'Mon Entreprise';
}

export function activationCallbackUrl(origin: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(ACTIVATION_INVOICE_PATH)}`;
}
