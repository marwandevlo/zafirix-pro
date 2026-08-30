/**
 * Post-vision-LLM normalization for Moroccan supplier identifiers on invoices.
 * Tolerates stamp overlap and common OCR label/digit confusions (e.g. ACE vs ICE).
 */

import type { AtlasExtractedField, AtlasStructuredExtraction } from '@/app/types/atlas-document';
import {
  isValidIce,
  isValidIf,
  normalizeIce,
  normalizeIf,
  normalizePatente,
  normalizeRc,
} from '@/app/lib/atlas-morocco-compliance';

const OCR_DIGIT_REPLACEMENTS: Record<string, string> = {
  O: '0',
  o: '0',
  Q: '0',
  D: '0',
  I: '1',
  l: '1',
  '|': '1',
  i: '1',
  Z: '2',
  z: '2',
  S: '5',
  s: '5',
  G: '6',
  b: '6',
  T: '7',
  B: '8',
  g: '9',
  q: '9',
};

export type MoroccoSupplierIds = {
  ice: string | null;
  if: string | null;
  rc: string | null;
  patente: string | null;
};

function repairOcrDigitString(raw: string): string {
  return String(raw ?? '')
    .split('')
    .map((ch) => (/\d/.test(ch) ? ch : (OCR_DIGIT_REPLACEMENTS[ch] ?? ch)))
    .join('');
}

function fieldSourceString(field?: AtlasExtractedField): string {
  if (!field) return '';
  const raw = field.raw_value ?? field.value;
  return raw != null ? String(raw).trim() : '';
}

function findIceCandidate(raw: string): string {
  const repaired = repairOcrDigitString(raw);
  const direct = normalizeIce(repaired);
  if (direct) return direct;

  const digits = repaired.replace(/\D/g, '');
  if (digits.length < 15) return '';

  for (let i = 0; i <= digits.length - 15; i++) {
    const slice = digits.slice(i, i + 15);
    if (slice.startsWith('00') && isValidIce(slice)) return slice;
  }
  for (let i = 0; i <= digits.length - 15; i++) {
    const slice = digits.slice(i, i + 15);
    if (isValidIce(slice)) return slice;
  }
  return '';
}

function findIfCandidate(raw: string): string {
  const repaired = repairOcrDigitString(raw);
  const direct = normalizeIf(repaired);
  if (direct) return direct;

  const digits = repaired.replace(/\D/g, '');
  if (digits.length >= 7) {
    for (const len of [8, 7]) {
      if (digits.length >= len) {
        const slice = digits.slice(-len);
        if (isValidIf(slice)) return normalizeIf(slice);
      }
    }
  }
  return '';
}

function withNormalizedField(
  field: AtlasExtractedField | undefined,
  normalized: string,
): AtlasExtractedField | undefined {
  if (!field && !normalized) return undefined;
  const base = field ?? { value: null, confidence: 0 };
  return {
    ...base,
    normalized_value: normalized || undefined,
    value: normalized || base.value,
  };
}

export function applyMoroccoIdentifierNormalization(
  extraction: AtlasStructuredExtraction,
  llmIds?: Partial<MoroccoSupplierIds> | null,
  extraText?: string | null,
): AtlasStructuredExtraction {
  const iceNorm =
    findIceCandidate(fieldSourceString(extraction.supplier_ice)) ||
    findIceCandidate(String(llmIds?.ice ?? '')) ||
    findIceCandidate(extraText ?? '');
  const ifNorm =
    findIfCandidate(fieldSourceString(extraction.supplier_if)) ||
    findIfCandidate(String(llmIds?.if ?? '')) ||
    findIfCandidate(extraText ?? '');
  const rcNorm =
    normalizeRc(fieldSourceString(extraction.supplier_rc)) ||
    normalizeRc(String(llmIds?.rc ?? ''));
  const patenteNorm =
    normalizePatente(fieldSourceString(extraction.supplier_patente)) ||
    normalizePatente(String(llmIds?.patente ?? ''));

  extraction.supplier_ice = withNormalizedField(extraction.supplier_ice, iceNorm);
  extraction.supplier_if = withNormalizedField(extraction.supplier_if, ifNorm);
  extraction.supplier_rc = withNormalizedField(extraction.supplier_rc, rcNorm);
  extraction.supplier_patente = withNormalizedField(extraction.supplier_patente, patenteNorm);

  extraction.morocco_supplier_ids = {
    ice: iceNorm || null,
    if: ifNorm || null,
    rc: rcNorm || null,
    patente: patenteNorm || null,
  };

  return extraction;
}

export function moroccoIdsFromExtraction(extraction: AtlasStructuredExtraction): MoroccoSupplierIds {
  const ids = extraction.morocco_supplier_ids;
  if (ids) return ids;
  return {
    ice: normalizeIce(fieldSourceString(extraction.supplier_ice)) || null,
    if: normalizeIf(fieldSourceString(extraction.supplier_if)) || null,
    rc: normalizeRc(fieldSourceString(extraction.supplier_rc)) || null,
    patente: normalizePatente(fieldSourceString(extraction.supplier_patente)) || null,
  };
}
