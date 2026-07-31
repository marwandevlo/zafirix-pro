import type { AtlasTvaLineItem, AtlasTvaPeriodRecord } from '@/app/types/atlas-tva';

/** DGI SIMPL-TVA payment mode codes (Relevé de déductions). */
const PAYMENT_MODE_CODES: Record<string, number> = {
  espèces: 1,
  especes: 1,
  espèce: 1,
  espece: 1,
  cash: 1,
  chèque: 2,
  cheque: 2,
  chèques: 2,
  cheques: 2,
  'prélèvement': 3,
  prelevement: 3,
  prélèvements: 3,
  prelevements: 3,
  virement: 4,
  virements: 4,
  effet: 5,
  effets: 5,
  compensation: 6,
};

const PAYMENT_MODE_LABELS: Record<number, string> = {
  1: 'Espèces',
  2: 'Chèque',
  3: 'Prélèvement',
  4: 'Virement',
  5: 'Effet',
  6: 'Compensation',
};

/** DGI declaration regime: 1 = Débit / Encaissement standard. */
export const DGI_DECLARATION_REGIME_STANDARD = 1;

export type TvaDgiExportCompanySources = {
  if_fiscal?: string | null;
  if_number?: string | null;
  ice?: string | null;
  company_json?: Record<string, unknown> | null;
};

export type DgiTvaXmlOptions = {
  identifiantFiscal?: string | null;
  /** Company profile fields used when identifiantFiscal is omitted. */
  company?: TvaDgiExportCompanySources | null;
  /** DGI regime code — default 1 (Débit / Encaissement standard). */
  regime?: number;
};

export type DgiReleveSupplierRef = {
  ifFiscal: string;
  nom: string;
  ice: string;
};

/** Index built from supplier invoices for ICE/IF fallback by invoice id or name. */
export type SupplierIdentityIndex = {
  byInvoiceId: Map<string, DgiReleveSupplierRef>;
  byNormalizedName: Map<string, DgiReleveSupplierRef>;
};

function normalizeSupplierNameKey(name: string | null | undefined): string {
  return sanitizeDgiNomFournisseur(name).toLowerCase();
}

function mergeSupplierIdentity(
  existing: DgiReleveSupplierRef | undefined,
  incoming: DgiReleveSupplierRef,
): DgiReleveSupplierRef {
  return {
    nom: incoming.nom || existing?.nom || 'Fournisseur',
    ice: incoming.ice || existing?.ice || '',
    ifFiscal: incoming.ifFiscal || existing?.ifFiscal || '',
  };
}

/** Build lookup tables from supplier invoice rows (DB or TVA lines). */
export function buildSupplierIdentityIndex(
  invoices: Array<{
    id: string;
    supplier_name?: string | null;
    supplier_ice?: string | null;
    supplier_if?: string | null;
  }>,
): SupplierIdentityIndex {
  const byInvoiceId = new Map<string, DgiReleveSupplierRef>();
  const byNormalizedName = new Map<string, DgiReleveSupplierRef>();

  for (const inv of invoices) {
    const record: DgiReleveSupplierRef = {
      ifFiscal: formatDgiIdentifiantFiscal(inv.supplier_if),
      ice: formatDgiIce(inv.supplier_ice),
      nom: sanitizeDgiNomFournisseur(inv.supplier_name),
    };

    byInvoiceId.set(String(inv.id), record);

    const nameKey = normalizeSupplierNameKey(record.nom);
    if (!nameKey) continue;

    const existing = byNormalizedName.get(nameKey);
    byNormalizedName.set(nameKey, mergeSupplierIdentity(existing, record));
  }

  return { byInvoiceId, byNormalizedName };
}

/** Build supplier index from TVA period supplier_invoice lines. */
export function buildSupplierIdentityIndexFromPeriod(record: AtlasTvaPeriodRecord): SupplierIdentityIndex {
  return buildSupplierIdentityIndex(
    record.lines
      .filter((line) => line.source === 'supplier_invoice')
      .map((line) => ({
        id: line.id,
        supplier_name: line.counterparty,
        supplier_ice: line.supplierIce,
        supplier_if: line.supplierIf,
      })),
  );
}

/** Official DGI SIMPL-TVA relevé row (Cahier des charges EDI). */
export type DgiReleveDeductionRow = {
  ord: number;
  num: string;
  des: string;
  mht: number;
  tva: number;
  ttc: number;
  refF: DgiReleveSupplierRef;
  tx: number;
  mp: number;
  dpai: string;
  dfac: string;
  /** Human-readable payment mode label (Excel export only). */
  modePaiement: string;
};

export type DgiTvaClientInfo = {
  nom_client: string;
  ice_client: string;
  annee: number;
  periode: number;
  periodKey: string;
  periodLabel: string;
};

/** Collapse whitespace and strip control characters / line breaks. */
export function sanitizeDgiSingleLine(text: string | null | undefined, maxLength?: number): string {
  let value = String(text ?? '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLength != null && value.length > maxLength) {
    value = value.slice(0, maxLength);
  }
  return value;
}

export function sanitizeDgiNumFacture(text: string | null | undefined): string {
  return sanitizeDgiSingleLine(text, 64) || 'S/N';
}

export function sanitizeDgiDesignation(text: string | null | undefined): string {
  return sanitizeDgiSingleLine(text, 255) || 'Achats / Services';
}

export function sanitizeDgiNomFournisseur(text: string | null | undefined): string {
  return sanitizeDgiSingleLine(text, 255) || 'Fournisseur';
}

/** Reject empty, "0", and all-zero placeholder identifiers (rejected by DGI SIMPL). */
export function isPlaceholderTaxIdentifier(id: string | null | undefined): boolean {
  const trimmed = String(id ?? '').trim();
  if (!trimmed || trimmed === '0') return true;

  const digits = trimmed.split('.')[0].replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits)) return true;

  return false;
}

/** Trim and drop placeholder tax IDs — never emit fake zeros for DGI export. */
export function formatTaxIdentifier(id: string | null | undefined): string {
  if (isPlaceholderTaxIdentifier(id)) return '';
  return String(id ?? '').trim();
}

export function formatDgiIdentifiantFiscal(ifNumber: string | null | undefined): string {
  if (isPlaceholderTaxIdentifier(ifNumber)) return '';

  const digits = String(ifNumber ?? '').replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits)) return '';
  if (digits.length < 7 || digits.length > 8) return '';

  return digits;
}

export function formatDgiAmount(value: number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0.00';
  return amount.toFixed(2);
}

export function roundDgiAmount(value: number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

export function formatDgiDateYmd(value: string | null | undefined, fallback?: string): string {
  const raw = String(value ?? '').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const frMatch = raw.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  if (frMatch) return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return fallback ?? new Date().toISOString().slice(0, 10);
}

export function escapeDgiXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function parseDgiPeriodFromKey(periodKey: string): { annee: number; periode: number; periodLabel: string } {
  const annual = periodKey.match(/^(\d{4})-AN$/);
  if (annual) {
    const year = Number(annual[1]);
    return { annee: year, periode: 4, periodLabel: `Annuel / ${year}` };
  }

  const quarterly = periodKey.match(/^(\d{4})-Q([1-4])$/);
  if (quarterly) {
    const year = Number(quarterly[1]);
    const q = Number(quarterly[2]);
    return { annee: year, periode: q, periodLabel: `Trimestre ${q} / ${year}` };
  }

  const monthly = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (monthly) {
    const year = Number(monthly[1]);
    const month = Number(monthly[2]);
    return { annee: year, periode: month, periodLabel: `Mois ${month} / ${year}` };
  }

  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  const year = now.getFullYear();
  return { annee: year, periode: q, periodLabel: `Trimestre ${q} / ${year}` };
}

export function dgiPaymentModeCode(paymentMode: string | number | null | undefined): number {
  if (paymentMode == null || paymentMode === '') return 1;

  const numeric = Number(paymentMode);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 6) return numeric;

  const key = String(paymentMode).trim().toLowerCase();
  if (/^[1-6]$/.test(key)) return Number(key);

  for (const [label, code] of Object.entries(PAYMENT_MODE_CODES)) {
    if (key.includes(label)) return code;
  }

  return PAYMENT_MODE_CODES[key] ?? 1;
}

export function dgiPaymentModeLabel(paymentMode: string | null | undefined, code?: number): string {
  const sanitized = sanitizeDgiSingleLine(paymentMode, 40);
  if (sanitized && !/^[1-6]$/.test(sanitized)) return sanitized;
  return PAYMENT_MODE_LABELS[code ?? 1] ?? 'Espèces';
}

export function formatDgiIce(ice: string | null | undefined): string {
  if (isPlaceholderTaxIdentifier(ice)) return '';

  const digits = String(ice ?? '')
    .split('.')[0]
    .replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits)) return '';
  // DGI ICE must be exactly 15 digits — never pad short values into fake identifiers.
  if (digits.length !== 15) return '';

  return digits;
}

/** Pick the first valid ICE from multiple sources (invoice line, client, supplier, etc.). */
export function resolveDgiIce(...sources: Array<string | null | undefined>): string {
  for (const source of sources) {
    const formatted = formatDgiIce(source);
    if (formatted) return formatted;
  }
  return '';
}

/** Pick the first valid IF from multiple sources (company profile fields). */
export function resolveDgiIdentifiantFiscal(...sources: Array<string | null | undefined>): string {
  for (const source of sources) {
    const formatted = formatDgiIdentifiantFiscal(source);
    if (formatted) return formatted;
  }
  return '';
}

function companyJsonIfSources(json: Record<string, unknown> | null | undefined): Array<string | null | undefined> {
  if (!json) return [];
  return [
    json.if_fiscal as string | null | undefined,
    json.if_number as string | null | undefined,
    json.identifiant_fiscal as string | null | undefined,
    json.identifiantFiscal as string | null | undefined,
  ];
}

/** Resolve declaring company IF from explicit value, profile columns, and company_json. */
export function resolveTvaDeclarationIdentifiantFiscal(
  company?: TvaDgiExportCompanySources | null,
  explicitIf?: string | null,
): string {
  const json = company?.company_json;
  return resolveDgiIdentifiantFiscal(
    explicitIf,
    company?.if_fiscal,
    company?.if_number,
    ...companyJsonIfSources(json),
  );
}

/** Resolve declaring company ICE from explicit value, profile columns, and company_json. */
export function resolveTvaDeclarationCompanyIce(
  company?: TvaDgiExportCompanySources | null,
  explicitIce?: string | null,
): string {
  const json = company?.company_json;
  return resolveDgiIce(explicitIce, company?.ice, json?.ice as string | null | undefined);
}

/** Sanitize RC for export — blank when missing or placeholder digits only. */
export function formatDgiRc(rc: string | null | undefined): string {
  const trimmed = formatTaxIdentifier(rc);
  if (!trimmed) return '';

  const normalized = trimmed.replace(/\s+/g, '').toUpperCase();
  const digitsOnly = normalized.replace(/\D/g, '');
  if (digitsOnly && /^0+$/.test(digitsOnly) && !/[A-Z]/.test(normalized)) return '';

  return trimmed;
}

/** Pick the first valid RC from multiple sources. */
export function resolveDgiRc(...sources: Array<string | null | undefined>): string {
  for (const source of sources) {
    const formatted = formatDgiRc(source);
    if (formatted) return formatted;
  }
  return '';
}

export type DgiCompanyIdentifiers = {
  identifiantFiscal: string;
  ice: string;
  rc: string;
};

/** Resolve company ICE / IF / RC from profile fields for DGI exports. */
export function resolveDgiCompanyIdentifiers(company: {
  ice?: string | null;
  if_fiscal?: string | null;
  if_number?: string | null;
  rc?: string | null;
}): DgiCompanyIdentifiers {
  return {
    identifiantFiscal: resolveDgiIdentifiantFiscal(company.if_fiscal, company.if_number),
    ice: formatDgiIce(company.ice),
    rc: formatDgiRc(company.rc),
  };
}

export function formatDgiVatRate(rate: number | null | undefined): number {
  if (rate == null || Number.isNaN(rate)) return 20;
  const value = Number(rate);
  if (value > 0 && value < 1) return Math.round(value * 100);
  return Math.round(value);
}

/** DGI XML `<regime>` — 1 = Débit / Encaissement standard (SIMPL-TVA). */
export function dgiDeclarationRegime(_regimeTVA?: string | null): number {
  return DGI_DECLARATION_REGIME_STANDARD;
}

/** @deprecated Use dgiDeclarationRegime — kept for backward compatibility. */
export function dgiRegimeCode(regimeTVA: string | null | undefined): number {
  return dgiDeclarationRegime(regimeTVA);
}

export function isDeductiblePurchaseLine(line: AtlasTvaLineItem): boolean {
  return line.kind === 'purchase' && line.source !== 'accounting_entry';
}

/** Build sanitized supplier reference for DGI `<refF>` nodes. */
export function resolveDgiSupplierRef(
  sources: {
    counterparty?: string | null;
    supplierIce?: string | null;
    supplierIf?: string | null;
    sourceInvoiceId?: string | null;
  },
  index?: SupplierIdentityIndex | null,
): DgiReleveSupplierRef {
  let rawIce = sources.supplierIce;
  let rawIf = sources.supplierIf;
  let rawNom = sources.counterparty;

  if (index) {
    if (sources.sourceInvoiceId) {
      const linked = index.byInvoiceId.get(String(sources.sourceInvoiceId));
      if (linked) {
        rawIce = rawIce || linked.ice || null;
        rawIf = rawIf || linked.ifFiscal || null;
        rawNom = rawNom || linked.nom || null;
      }
    }

    const nameKey = normalizeSupplierNameKey(rawNom);
    if (nameKey) {
      const byName = index.byNormalizedName.get(nameKey);
      if (byName) {
        rawIce = rawIce || byName.ice || null;
        rawIf = rawIf || byName.ifFiscal || null;
        rawNom = rawNom || byName.nom || null;
      }
    }
  }

  return {
    ifFiscal: resolveDgiIdentifiantFiscal(rawIf),
    nom: sanitizeDgiNomFournisseur(rawNom),
    ice: resolveDgiIce(rawIce),
  };
}

export function buildDgiReleveRows(
  record: AtlasTvaPeriodRecord,
  index?: SupplierIdentityIndex | null,
): DgiReleveDeductionRow[] {
  const supplierIndex = index ?? buildSupplierIdentityIndexFromPeriod(record);

  return record.lines.filter(isDeductiblePurchaseLine).map((line, rowIndex) => {
    const modePaiementCode = dgiPaymentModeCode(line.paymentMode);
    const issueDate = formatDgiDateYmd(line.issueDate);
    const paymentDate = formatDgiDateYmd(line.paymentDate || line.issueDate, issueDate);

    return {
      ord: rowIndex + 1,
      num: sanitizeDgiNumFacture(line.reference || String(rowIndex + 1)),
      des: sanitizeDgiDesignation(line.designation),
      mht: roundDgiAmount(line.amountHT),
      tva: roundDgiAmount(line.vatAmount),
      ttc: roundDgiAmount(line.totalTTC),
      refF: resolveDgiSupplierRef(
        {
          counterparty: line.counterparty,
          supplierIce: line.supplierIce,
          supplierIf: line.supplierIf,
          sourceInvoiceId: line.sourceInvoiceId ?? (line.source === 'supplier_invoice' ? line.id : undefined),
        },
        supplierIndex,
      ),
      tx: formatDgiVatRate(line.vatRate),
      mp: modePaiementCode,
      dpai: paymentDate,
      dfac: issueDate,
      modePaiement: dgiPaymentModeLabel(line.paymentMode, modePaiementCode),
    };
  });
}

export function buildDgiClientInfo(
  record: AtlasTvaPeriodRecord,
  company: { name?: string | null; legal_name?: string | null; trade_name?: string | null; ice?: string | null },
): DgiTvaClientInfo {
  const { annee, periode, periodLabel } = parseDgiPeriodFromKey(record.periodKey);
  const nom = sanitizeDgiNomFournisseur(
    company.trade_name || company.legal_name || company.name || 'Société',
  );
  return {
    nom_client: nom,
    ice_client: formatDgiIce(company.ice),
    annee,
    periode,
    periodKey: record.periodKey,
    periodLabel,
  };
}
