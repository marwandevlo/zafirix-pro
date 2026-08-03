import type { AtlasTvaLineItem, AtlasTvaPeriodRecord, AtlasTvaPeriodType } from '@/app/types/atlas-tva';

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

/** DGI XML `<regime>`: 1 = déclaration mensuelle, 2 = déclaration trimestrielle (SIMPL-TVA EDI). */
export const DGI_XML_REGIME_MONTHLY = 1;
export const DGI_XML_REGIME_QUARTERLY = 2;

/** @deprecated Use DGI_XML_REGIME_MONTHLY — kept for backward compatibility. */
export const DGI_DECLARATION_REGIME_STANDARD = DGI_XML_REGIME_MONTHLY;

/** SIMPL-TVA accepted `<regime>` codes in Relevé de déductions XML headers. */
export const DGI_REGIME_CODES = [DGI_XML_REGIME_MONTHLY, DGI_XML_REGIME_QUARTERLY] as const;

export type DgiPeriodKind = 'monthly' | 'quarterly' | 'annual';

export type DgiPeriodMetadata = {
  annee: number;
  periode: number;
  periodKind: DgiPeriodKind;
  periodLabel: string;
  valid: boolean;
  error?: string;
};

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
  /** Pre-built supplier ICE/IF index (all company invoices + documents). */
  supplierIndex?: SupplierIdentityIndex | null;
  /** DGI regime code — default 1 (Débit / Encaissement standard). */
  regime?: number;
  /** Explicit period key from UI/API (e.g. 2025-Q2) — overrides record.periodKey for DGI header. */
  periodKey?: string | null;
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
  if (existing?.ice && incoming.ice && existing.ice !== incoming.ice) {
    return incoming;
  }
  if (existing?.ifFiscal && incoming.ifFiscal && existing.ifFiscal !== incoming.ifFiscal) {
    return incoming;
  }

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

/** Build supplier index from all deductible purchase lines in a TVA period. */
export function buildSupplierIdentityIndexFromPeriod(record: AtlasTvaPeriodRecord): SupplierIdentityIndex {
  return buildSupplierIdentityIndex(
    record.lines
      .filter((line) => line.kind === 'purchase')
      .map((line) => ({
        id: line.sourceInvoiceId ?? line.id,
        supplier_name: line.counterparty,
        supplier_ice: line.supplierIce,
        supplier_if: line.supplierIf,
      })),
  );
}

/** Exact supplier name lookup — no fuzzy/partial matching (prevents ICE/IF cross-contamination). */
export function lookupSupplierIdentityByName(
  index: SupplierIdentityIndex,
  name: string | null | undefined,
): DgiReleveSupplierRef | undefined {
  const key = normalizeSupplierNameKey(name);
  if (!key) return undefined;
  return index.byNormalizedName.get(key);
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

const DGI_RELEVE_AMOUNT_TOLERANCE = 0.01;

/** Enforce SIMPL-TVA row math: TTC must equal MHT + TVA (cent-level tolerance). */
export function normalizeDgiReleveAmounts(
  mhtRaw: number,
  tvaRaw: number,
  ttcRaw?: number | null,
): { mht: number; tva: number; ttc: number } {
  const mht = roundDgiAmount(mhtRaw);
  const tva = roundDgiAmount(tvaRaw);
  const expectedTtc = roundDgiAmount(mht + tva);
  const ttcProvided =
    ttcRaw != null && Number.isFinite(Number(ttcRaw)) ? roundDgiAmount(Number(ttcRaw)) : null;

  if (ttcProvided == null || Math.abs(ttcProvided - expectedTtc) > DGI_RELEVE_AMOUNT_TOLERANCE) {
    return { mht, tva, ttc: expectedTtc };
  }

  return { mht, tva, ttc: ttcProvided };
}

export function isDgiReleveAmountConsistent(mht: number, tva: number, ttc: number): boolean {
  return Math.abs(roundDgiAmount(mht + tva) - roundDgiAmount(ttc)) <= DGI_RELEVE_AMOUNT_TOLERANCE;
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
  const meta = resolveDgiPeriodMetadata(periodKey);
  if (meta.valid) {
    return { annee: meta.annee, periode: meta.periode, periodLabel: meta.periodLabel };
  }

  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  const year = now.getFullYear();
  return { annee: year, periode: q, periodLabel: `Trimestre ${q} / ${year}` };
}

function finalizeDgiPeriodMetadata(
  meta: Omit<DgiPeriodMetadata, 'valid' | 'error'>,
): DgiPeriodMetadata {
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(meta.annee) || meta.annee < 2000 || meta.annee > currentYear + 1) {
    return { ...meta, valid: false, error: 'invalid_year' };
  }
  if (!Number.isInteger(meta.periode)) {
    return { ...meta, valid: false, error: 'invalid_period' };
  }
  if (meta.periodKind === 'monthly' && (meta.periode < 1 || meta.periode > 12)) {
    return { ...meta, valid: false, error: 'invalid_month' };
  }
  if (meta.periodKind === 'quarterly' && (meta.periode < 1 || meta.periode > 4)) {
    return { ...meta, valid: false, error: 'invalid_quarter' };
  }
  if (meta.periodKind === 'annual' && meta.periode !== 4) {
    return { ...meta, valid: false, error: 'invalid_annual_period' };
  }
  return { ...meta, valid: true };
}

/**
 * Strict SIMPL-TVA period resolution — no silent fallback to "today".
 * Monthly keys → periode 1-12; quarterly → 1-4; annual (-AN) → periode 4.
 */
export function resolveDgiPeriodMetadata(
  periodKey: string,
  periodType?: AtlasTvaPeriodType | null,
): DgiPeriodMetadata {
  const annual = periodKey.match(/^(\d{4})-AN$/);
  if (annual) {
    return finalizeDgiPeriodMetadata({
      annee: Number(annual[1]),
      periode: 4,
      periodKind: 'annual',
      periodLabel: `Annuel / ${annual[1]}`,
    });
  }

  const quarterly = periodKey.match(/^(\d{4})-Q([1-4])$/);
  if (quarterly) {
    const annee = Number(quarterly[1]);
    const periode = Number(quarterly[2]);
    return finalizeDgiPeriodMetadata({
      annee,
      periode,
      periodKind: 'quarterly',
      periodLabel: `Trimestre ${periode} / ${annee}`,
    });
  }

  const monthly = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (monthly) {
    const annee = Number(monthly[1]);
    const periode = Number(monthly[2]);
    return finalizeDgiPeriodMetadata({
      annee,
      periode,
      periodKind: periodType === 'quarterly' ? 'quarterly' : 'monthly',
      periodLabel: `Mois ${periode} / ${annee}`,
    });
  }

  return {
    annee: 0,
    periode: 0,
    periodKind: 'quarterly',
    periodLabel: periodKey,
    valid: false,
    error: 'invalid_period_key',
  };
}

export function isValidDgiRegimeCode(regime: number): boolean {
  return Number.isInteger(regime) && (DGI_REGIME_CODES as readonly number[]).includes(regime);
}

function isTrimestrielRegimeTVA(regimeTVA?: string | null): boolean {
  return String(regimeTVA ?? '').toLowerCase().includes('trim');
}

/** Company TVA cadence → default DGI XML regime when period metadata is unavailable. */
export function dgiDeclarationRegime(regimeTVA?: string | null): number {
  return isTrimestrielRegimeTVA(regimeTVA) ? DGI_XML_REGIME_QUARTERLY : DGI_XML_REGIME_MONTHLY;
}

/**
 * Derive DGI XML `<regime>` from resolved period metadata.
 * Period kind wins over company profile — prevents monthly code (1) with quarterly `<periode>`.
 */
export function resolveDgiXmlRegimeFromPeriod(
  periodMeta: Pick<DgiPeriodMetadata, 'periodKind'>,
  regimeTVA?: string | null,
): number {
  switch (periodMeta.periodKind) {
    case 'monthly':
      return DGI_XML_REGIME_MONTHLY;
    case 'quarterly':
    case 'annual':
      return DGI_XML_REGIME_QUARTERLY;
    default:
      return dgiDeclarationRegime(regimeTVA);
  }
}

/** True when `<regime>` and `<periode>` ranges match DGI SIMPL-TVA EDI rules. */
export function isDgiRegimePeriodConsistent(
  regime: number,
  periodMeta: Pick<DgiPeriodMetadata, 'periodKind' | 'periode'>,
): boolean {
  if (regime === DGI_XML_REGIME_MONTHLY) {
    return periodMeta.periodKind === 'monthly' && periodMeta.periode >= 1 && periodMeta.periode <= 12;
  }
  if (regime === DGI_XML_REGIME_QUARTERLY) {
    if (periodMeta.periodKind === 'quarterly') {
      return periodMeta.periode >= 1 && periodMeta.periode <= 4;
    }
    if (periodMeta.periodKind === 'annual') {
      return periodMeta.periode === 4;
    }
    return false;
  }
  return false;
}

export function normalizeDgiRegimeCode(
  regime?: number | null,
  regimeTVA?: string | null,
  periodMeta?: Pick<DgiPeriodMetadata, 'periodKind'> | null,
): number {
  if (periodMeta) {
    return resolveDgiXmlRegimeFromPeriod(periodMeta, regimeTVA);
  }
  if (regime != null && isValidDgiRegimeCode(regime)) return regime;
  return dgiDeclarationRegime(regimeTVA);
}

/** Validate YYYY-MM-DD date strings required by SIMPL-TVA rd/dpai/dfac nodes. */
export function isValidDgiDateYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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


/** @deprecated Use dgiDeclarationRegime — kept for backward compatibility. */
export function dgiRegimeCode(regimeTVA: string | null | undefined): number {
  return dgiDeclarationRegime(regimeTVA);
}

export function isDeductiblePurchaseLine(line: AtlasTvaLineItem): boolean {
  return line.kind === 'purchase' && line.source !== 'accounting_entry';
}

/** Build sanitized supplier reference for DGI `<refF>` nodes (per-invoice ICE/IF — no cross-supplier fallback). */
export function resolveDgiSupplierRef(
  sources: {
    counterparty?: string | null;
    supplierIce?: string | null;
    supplierIf?: string | null;
    sourceInvoiceId?: string | null;
  },
  index?: SupplierIdentityIndex | null,
): DgiReleveSupplierRef {
  let rawNom = sources.counterparty;
  const iceSources: Array<string | null | undefined> = [sources.supplierIce];
  const ifSources: Array<string | null | undefined> = [sources.supplierIf];

  const invoiceId = sources.sourceInvoiceId ? String(sources.sourceInvoiceId) : '';

  if (index && invoiceId) {
    const linked = index.byInvoiceId.get(invoiceId);
    if (linked) {
      iceSources.push(linked.ice);
      ifSources.push(linked.ifFiscal);
      rawNom = rawNom || linked.nom || null;
    }
  }

  if (index) {
    const byName = lookupSupplierIdentityByName(index, rawNom);
    if (byName) {
      rawNom = rawNom || byName.nom || null;
      iceSources.push(byName.ice);
      ifSources.push(byName.ifFiscal);
    }
  }

  return {
    ifFiscal: resolveDgiIdentifiantFiscal(...ifSources),
    nom: sanitizeDgiNomFournisseur(rawNom),
    ice: resolveDgiIce(...iceSources),
  };
}

export function buildDgiReleveRows(
  record: AtlasTvaPeriodRecord,
  index?: SupplierIdentityIndex | null,
): DgiReleveDeductionRow[] {
  const supplierIndex = index ?? buildSupplierIdentityIndexFromPeriod(record);

  // Every deductible purchase line for the period is included; ICE/IF may be empty in refF.
  return record.lines.filter(isDeductiblePurchaseLine).map((line, rowIndex) => {
    const modePaiementCode = dgiPaymentModeCode(line.paymentMode);
    const issueDate = formatDgiDateYmd(line.issueDate);
    const paymentDate = formatDgiDateYmd(line.paymentDate || line.issueDate, issueDate);

    const amounts = normalizeDgiReleveAmounts(line.amountHT, line.vatAmount, line.totalTTC);

    return {
      ord: rowIndex + 1,
      num: sanitizeDgiNumFacture(line.reference || String(rowIndex + 1)),
      des: sanitizeDgiDesignation(line.designation),
      mht: amounts.mht,
      tva: amounts.tva,
      ttc: amounts.ttc,
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
