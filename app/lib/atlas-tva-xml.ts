import type { AtlasTvaPeriodRecord } from '@/app/types/atlas-tva';
import {
  buildDgiReleveRows,
  buildSupplierIdentityIndexFromPeriod,
  DGI_DECLARATION_REGIME_STANDARD,
  escapeDgiXml,
  formatDgiAmount,
  formatDgiIce,
  formatDgiIdentifiantFiscal,
  isDeductiblePurchaseLine,
  isValidDgiDateYmd,
  isValidDgiRegimeCode,
  normalizeDgiRegimeCode,
  resolveDgiPeriodMetadata,
  resolveTvaDeclarationCompanyIce,
  resolveTvaDeclarationIdentifiantFiscal,
  sanitizeDgiNomFournisseur,
  type DgiReleveDeductionRow,
  type DgiTvaXmlOptions,
  type SupplierIdentityIndex,
  type TvaDgiExportCompanySources,
} from '@/app/lib/atlas-tva-dgi';

export type { DgiTvaXmlOptions, TvaDgiExportCompanySources } from '@/app/lib/atlas-tva-dgi';
export {
  buildDgiClientInfo,
  buildDgiReleveRows,
  buildSupplierIdentityIndex,
  buildSupplierIdentityIndexFromPeriod,
  dgiDeclarationRegime,
  dgiPaymentModeCode,
  dgiRegimeCode,
  escapeDgiXml,
  formatDgiAmount,
  formatDgiIce,
  formatDgiIdentifiantFiscal,
  formatDgiVatRate,
  formatDgiRc,
  formatTaxIdentifier,
  isPlaceholderTaxIdentifier,
  isValidDgiDateYmd,
  isValidDgiRegimeCode,
  lookupSupplierIdentityByName,
  normalizeDgiRegimeCode,
  parseDgiPeriodFromKey,
  resolveDgiCompanyIdentifiers,
  resolveDgiIce,
  resolveDgiIdentifiantFiscal,
  resolveDgiPeriodMetadata,
  resolveDgiRc,
  resolveDgiSupplierRef,
  resolveTvaDeclarationCompanyIce,
  resolveTvaDeclarationIdentifiantFiscal,
  sanitizeDgiDesignation,
  sanitizeDgiNomFournisseur,
  sanitizeDgiNumFacture,
} from '@/app/lib/atlas-tva-dgi';

export type TvaDgiExportValidation = {
  ok: boolean;
  error?: string;
  message?: string;
  warnings?: string[];
};

export type TvaDgiExportValidationOptions = {
  identifiantFiscal?: string | null;
  companyIce?: string | null;
  company?: TvaDgiExportCompanySources | null;
  supplierIndex?: SupplierIdentityIndex | null;
  regime?: number | null;
  regimeTVA?: string | null;
};

const PERIOD_ERROR_MESSAGES: Record<string, string> = {
  invalid_period_key:
    'Clé de période TVA non reconnue par SIMPL-TVA. Utilisez un format YYYY-MM, YYYY-Q[1-4] ou YYYY-AN.',
  invalid_year: 'Année fiscale invalide — vérifiez la période déclarée (الفترة أو السنة خاطئة).',
  invalid_month: 'Mois invalide — SIMPL-TVA attend une période entre 1 et 12 pour le régime mensuel.',
  invalid_quarter: 'Trimestre invalide — SIMPL-TVA attend une période entre 1 et 4.',
  invalid_annual_period: 'Période annuelle invalide pour SIMPL-TVA.',
  invalid_period: 'Période TVA invalide.',
};

function periodValidationMessage(errorCode: string | undefined, periodKey: string): string {
  const base = PERIOD_ERROR_MESSAGES[errorCode ?? ''] ?? PERIOD_ERROR_MESSAGES.invalid_period;
  return `${base} (période : ${periodKey}).`;
}

function collectExportRows(
  record: AtlasTvaPeriodRecord,
  supplierIndex: SupplierIdentityIndex,
): DgiReleveDeductionRow[] {
  return buildDgiReleveRows(record, supplierIndex);
}

function validateDgiReleveRowFields(row: DgiReleveDeductionRow): string | null {
  if (!isValidDgiDateYmd(row.dfac)) return `Date facture invalide (facture ${row.num})`;
  if (!isValidDgiDateYmd(row.dpai)) return `Date paiement invalide (facture ${row.num})`;
  if (row.mp < 1 || row.mp > 6) return `Mode paiement invalide (facture ${row.num})`;
  if (!Number.isFinite(row.mht) || !Number.isFinite(row.tva) || !Number.isFinite(row.ttc)) {
    return `Montants invalides (facture ${row.num})`;
  }
  return null;
}

/**
 * Schema-safe sentinel values for missing supplier identifiers in XML only.
 * Non-zero 15-digit ICE / 8-digit IF satisfy DGI mandatory `ifreff` / ICE field rules;
 * UI and Excel exports keep the raw (possibly empty) values from `refF`.
 */
const DGI_XML_FALLBACK_SUPPLIER_ICE = '999999999999999';
const DGI_XML_FALLBACK_SUPPLIER_IF = '99999999';

function appendMissingSupplierIceWarnings(
  warnings: string[],
  purchaseRows: DgiReleveDeductionRow[],
): void {
  const invalidIceRows = purchaseRows.filter((row) => !row.refF.ice);
  if (invalidIceRows.length === 0) return;

  const samples = invalidIceRows
    .slice(0, 5)
    .map((row) => `${row.num} (${row.refF.nom})`)
    .join(', ');
  warnings.push(
    `${invalidIceRows.length} ligne(s) d'achat sans ICE fournisseur valide (15 chiffres) — ` +
      `identifiant de remplacement utilisé dans l'export XML pour : ${samples}${invalidIceRows.length > 5 ? '…' : ''}. ` +
      'Complétez les profils fournisseur avec l\'ICE réel avant dépôt SIMPL-TVA.',
  );
}

function appendMissingSupplierIfWarnings(
  warnings: string[],
  purchaseRows: DgiReleveDeductionRow[],
): void {
  const invalidIfRows = purchaseRows.filter((row) => !row.refF.ifFiscal);
  if (invalidIfRows.length === 0) return;

  const samples = invalidIfRows
    .slice(0, 5)
    .map((row) => `${row.num} (${row.refF.nom})`)
    .join(', ');
  warnings.push(
    `${invalidIfRows.length} ligne(s) sans IF fournisseur valide (7-8 chiffres) — ` +
      `identifiant de remplacement utilisé dans l'export XML pour : ${samples}${invalidIfRows.length > 5 ? '…' : ''}. ` +
      'Complétez les profils fournisseur avec l\'IF réel si la DGI le contrôle.',
  );
}

/** Resolve supplier ref for XML — never emit empty `<if>` / `<ice>` (DGI `ifreff` mandatory). */
function resolveDgiXmlSupplierRef(ref: DgiReleveDeductionRow['refF']): {
  ifFiscal: string;
  nom: string;
  ice: string;
} {
  const ice = formatDgiIce(ref.ice) || DGI_XML_FALLBACK_SUPPLIER_ICE;
  const ifFiscal = formatDgiIdentifiantFiscal(ref.ifFiscal) || DGI_XML_FALLBACK_SUPPLIER_IF;
  return {
    ifFiscal,
    nom: sanitizeDgiNomFournisseur(ref.nom),
    ice,
  };
}

/** Advisory validation for Excel / preview — warnings only. */
export function validateTvaDgiExport(
  record: AtlasTvaPeriodRecord,
  opts: TvaDgiExportValidationOptions,
): TvaDgiExportValidation {
  const warnings: string[] = [];  const identifiantFiscal = resolveTvaDeclarationIdentifiantFiscal(opts.company, opts.identifiantFiscal);
  if (!identifiantFiscal) {
    warnings.push(
      "Identifiant Fiscal (IF) société absent du profil — requis pour un dépôt SIMPL-TVA conforme.",
    );
  }

  if (!resolveTvaDeclarationCompanyIce(opts.company, opts.companyIce)) {
    warnings.push('ICE société manquant ou invalide dans le profil entreprise.');
  }

  const periodMeta = resolveDgiPeriodMetadata(record.periodKey, record.periodType);
  if (!periodMeta.valid) {
    warnings.push(periodValidationMessage(periodMeta.error, record.periodKey));
  }

  const supplierIndex = opts.supplierIndex ?? buildSupplierIdentityIndexFromPeriod(record);
  const rows = collectExportRows(record, supplierIndex);
  const missingSupplierIce = rows.filter((row) => !row.refF.ice).length;
  if (missingSupplierIce > 0) {
    warnings.push(
      `${missingSupplierIce} ligne(s) d'achat sans ICE fournisseur valide (15 chiffres) — complétez les factures fournisseur.`,
    );
  }

  const missingSupplierIf = rows.filter((row) => !row.refF.ifFiscal).length;
  if (missingSupplierIf > 0) {
    warnings.push(
      `${missingSupplierIf} ligne(s) sans IF fournisseur — complétez les factures achats si requis par la DGI.`,
    );
  }

  return { ok: true, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * SIMPL-TVA pre-flight for XML EDI export.
 * Blocks on invalid company IF, period/year, or regime; missing supplier IF/ICE emit XML fallbacks + warnings.
 */export function validateTvaDgiXmlExport(
  record: AtlasTvaPeriodRecord,
  opts: TvaDgiExportValidationOptions,
): TvaDgiExportValidation {
  const warnings: string[] = [];

  const identifiantFiscal = resolveTvaDeclarationIdentifiantFiscal(opts.company, opts.identifiantFiscal);
  if (!identifiantFiscal) {
    return {
      ok: false,
      error: 'missing_if',
      message:
        "Identifiant Fiscal (IF) société manquant ou invalide (7-8 chiffres requis). " +
        'Complétez le profil société (Paramètres) — رقم التعريف الضريبي خاطئ.',
    };
  }

  const periodMeta = resolveDgiPeriodMetadata(record.periodKey, record.periodType);
  if (!periodMeta.valid) {
    return {
      ok: false,
      error: periodMeta.error ?? 'invalid_period',
      message: periodValidationMessage(periodMeta.error, record.periodKey),
    };
  }

  const regime = normalizeDgiRegimeCode(opts.regime, opts.regimeTVA);
  if (!isValidDgiRegimeCode(regime)) {
    return {
      ok: false,
      error: 'invalid_regime',
      message: 'Code régime TVA invalide — SIMPL-TVA attend 1 (Débit) ou 2 (Encaissement).',
    };
  }

  const supplierIndex = opts.supplierIndex ?? buildSupplierIdentityIndexFromPeriod(record);
  const purchaseRows = collectExportRows(record, supplierIndex);
  appendMissingSupplierIceWarnings(warnings, purchaseRows);
  appendMissingSupplierIfWarnings(warnings, purchaseRows);

  for (const row of purchaseRows) {
    const rowError = validateDgiReleveRowFields(row);
    if (rowError) {
      return {
        ok: false,
        error: 'invalid_releve_row',
        message: `${rowError} — corrigez la facture avant export DGI.`,
      };
    }
  }

  const genericNames = purchaseRows.filter((row) => !row.refF.nom || row.refF.nom === 'Fournisseur').length;
  if (genericNames > 0) {    warnings.push(`${genericNames} ligne(s) avec nom fournisseur générique — vérifiez les libellés.`);
  }

  if (!resolveTvaDeclarationCompanyIce(opts.company, opts.companyIce)) {
    warnings.push('ICE société (15 chiffres) absent du profil — recommandé pour la cohérence SIMPL-TVA.');
  }

  return { ok: true, warnings: warnings.length > 0 ? warnings : undefined };
}

function buildRefFXml(ref: DgiReleveDeductionRow['refF']): string[] {
  const resolved = resolveDgiXmlSupplierRef(ref);

  return [
    '      <refF>',
    `        <if>${escapeDgiXml(resolved.ifFiscal)}</if>`,
    `        <nom>${escapeDgiXml(resolved.nom)}</nom>`,
    `        <ice>${escapeDgiXml(resolved.ice)}</ice>`,
    '      </refF>',
  ];
}

/** Post-generation guard — rejects legacy schema, placeholder IDs, malformed header/rows. */
export function assertValidTvaDgiXmlOutput(xml: string): void {  if (/iceFournisseur|nomFournisseur|ifFournisseur|montantHT|numFacture|dateFacture/i.test(xml)) {
    throw new Error('legacy_tva_xml_schema');
  }

  const ifMatch = xml.match(/<identifiantFiscal>(\d*)<\/identifiantFiscal>/);
  if (!ifMatch || ifMatch[1].length < 7 || ifMatch[1].length > 8) {
    throw new Error('invalid_header_identifiant_fiscal');
  }

  const anneeMatch = xml.match(/<annee>(\d+)<\/annee>/);
  const periodeMatch = xml.match(/<periode>(\d+)<\/periode>/);
  const regimeMatch = xml.match(/<regime>(\d+)<\/regime>/);
  if (!anneeMatch || !periodeMatch || !regimeMatch) {
    throw new Error('missing_dgi_header_fields');
  }

  const annee = Number(anneeMatch[1]);
  const periode = Number(periodeMatch[1]);
  const regime = Number(regimeMatch[1]);
  const currentYear = new Date().getFullYear();
  if (annee < 2000 || annee > currentYear + 1) throw new Error('invalid_year');
  if (periode < 1 || periode > 12) throw new Error('invalid_period');
  if (!isValidDgiRegimeCode(regime)) throw new Error('invalid_regime');

  if (/<ice>\s*0+\s*<\/ice>/i.test(xml)) {
    throw new Error('placeholder_supplier_ice');
  }

  const rdBlocks = xml.match(/<rd>[\s\S]*?<\/rd>/g) ?? [];
  for (const block of rdBlocks) {
    const iceMatch = block.match(/<ice>(\d*)<\/ice>/);
    if (!iceMatch || iceMatch[1].length !== 15) {
      throw new Error('invalid_supplier_ice_in_xml');
    }
    const ifMatch = block.match(/<if>(\d*)<\/if>/);
    if (!ifMatch || ifMatch[1].length < 7 || ifMatch[1].length > 8) {
      throw new Error('invalid_supplier_if_in_xml');
    }
  }
}
export function tvaDgiXmlFilename(periodKey: string): string {
  return `TVA_${periodKey}_DGI.xml`;
}

/** Official DGI `<rd>` block — ord/num/des/mht/tva/ttc + refF + tx/mp/dpai/dfac. */
function buildRdXmlBlock(row: DgiReleveDeductionRow, ord: number): string {
  return [
    '    <rd>',
    `      <ord>${ord}</ord>`,
    `      <num>${escapeDgiXml(row.num)}</num>`,
    `      <des>${escapeDgiXml(row.des)}</des>`,
    `      <mht>${formatDgiAmount(row.mht)}</mht>`,
    `      <tva>${formatDgiAmount(row.tva)}</tva>`,
    `      <ttc>${formatDgiAmount(row.ttc)}</ttc>`,
    ...buildRefFXml(row.refF),
    `      <tx>${row.tx}</tx>`,
    '      <mp>',
    `        <id>${row.mp}</id>`,
    '      </mp>',
    `      <dpai>${row.dpai}</dpai>`,
    `      <dfac>${row.dfac}</dfac>`,
    '    </rd>',
  ].join('\n');
}

/**
 * Generate DGI SIMPL-TVA Relevé de déductions XML.
 * All purchase lines are included; missing supplier IF/ICE use XML-only schema fallbacks (see warnings).
 */
export function generateTvaDeclarationXml(
  record: AtlasTvaPeriodRecord,
  opts: DgiTvaXmlOptions & { regimeTVA?: string | null },
): string {
  const preflight = validateTvaDgiXmlExport(record, {
    company: opts.company,
    identifiantFiscal: opts.identifiantFiscal,
    supplierIndex: opts.supplierIndex,
    regime: opts.regime,
    regimeTVA: opts.regimeTVA,
  });
  if (!preflight.ok) {
    throw new Error(preflight.error ?? 'dgi_preflight_failed');
  }

  const periodMeta = resolveDgiPeriodMetadata(record.periodKey, record.periodType);
  const regime = normalizeDgiRegimeCode(opts.regime, opts.regimeTVA);
  const identifiantFiscal = resolveTvaDeclarationIdentifiantFiscal(opts.company, opts.identifiantFiscal);

  const supplierIndex = opts.supplierIndex ?? buildSupplierIdentityIndexFromPeriod(record);
  const rows = collectExportRows(record, supplierIndex);

  const rdBlocks = rows.map((row, index) => buildRdXmlBlock(row, index + 1)).join('\n');

  const lines = [    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DeclarationReleveDeduction>',
    `  <identifiantFiscal>${identifiantFiscal}</identifiantFiscal>`,
    `  <annee>${periodMeta.annee}</annee>`,
    `  <periode>${periodMeta.periode}</periode>`,
    `  <regime>${regime}</regime>`,
    '  <releveDeductions>',
  ];

  if (rdBlocks) lines.push(rdBlocks);
  lines.push('  </releveDeductions>', '</DeclarationReleveDeduction>');

  const xml = lines.join('\n');
  assertValidTvaDgiXmlOutput(xml);
  return xml;
}

export { isDeductiblePurchaseLine };
