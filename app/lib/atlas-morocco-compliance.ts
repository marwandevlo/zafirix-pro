/**
 * Moroccan regulatory identifiers & fiscal constants (DGI / PCGE).
 */

import {
  formatDgiIce,
  formatDgiIdentifiantFiscal,
  formatDgiVatRate,
} from '@/app/lib/atlas-tva-dgi';

/** Standard DGI TVA rates (%). */
export const MOROCCO_TVA_RATES = [0, 7, 10, 14, 20] as const;

export type MoroccoValidationResult = { ok: true } | { ok: false; field: string; message: string };

/** ICE — Identifiant Commun de l'Entreprise: exactly 15 digits. */
export function normalizeIce(raw: string | null | undefined): string {
  return formatDgiIce(raw);
}

export function isValidIce(raw: string | null | undefined): boolean {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 15;
}

/** IF — Identifiant Fiscal: 8 digits (DGI SIMPL). */
export function normalizeIf(raw: string | null | undefined): string {
  return formatDgiIdentifiantFiscal(raw);
}

export function isValidIf(raw: string | null | undefined): boolean {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 8;
}

/**
 * RC — Registre de Commerce (Morocco).
 * Accepts common formats: city prefix + digits, or plain 4–12 digit registration.
 */
export function isValidRc(raw: string | null | undefined): boolean {
  const value = String(raw ?? '').trim();
  if (!value) return false;
  const normalized = value.replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{1,4}\d{3,10}$/.test(normalized)) return true;
  if (/^\d{4,12}$/.test(normalized.replace(/\D/g, ''))) return true;
  return normalized.length >= 4 && normalized.length <= 20;
}

/** Validates DGI-standard TVA rate (percent). */
export function isValidMoroccoVatRate(rate: number | null | undefined): boolean {
  const pct = formatDgiVatRate(rate);
  return (MOROCCO_TVA_RATES as readonly number[]).includes(pct);
}

/** PCGE account number: 3–8 digits (Plan Comptable Général des Entreprises). */
export function isValidPcgeAccount(compte: string | null | undefined): boolean {
  const digits = String(compte ?? '').replace(/\D/g, '');
  return digits.length >= 3 && digits.length <= 8;
}

export function validateMoroccoCompanyProfile(profile: {
  ice?: string | null;
  if_fiscal?: string | null;
  rc?: string | null;
}): MoroccoValidationResult {
  if (profile.ice?.trim() && !isValidIce(profile.ice)) {
    return { ok: false, field: 'ice', message: "L'ICE doit comporter exactement 15 chiffres (norme DGI)." };
  }
  if (profile.if_fiscal?.trim() && !isValidIf(profile.if_fiscal)) {
    return { ok: false, field: 'if_fiscal', message: "L'identifiant fiscal (IF) doit comporter 7 à 8 chiffres." };
  }
  if (profile.rc?.trim() && !isValidRc(profile.rc)) {
    return { ok: false, field: 'rc', message: 'Le numéro RC est invalide (format registre de commerce marocain).' };
  }
  return { ok: true };
}
