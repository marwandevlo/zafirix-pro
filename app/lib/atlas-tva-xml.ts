import type { AtlasTvaPeriodRecord } from '@/app/types/atlas-tva';
import {
  buildDgiReleveRows,
  buildSupplierIdentityIndexFromPeriod,
  escapeDgiXml,
  formatDgiAmount,
  formatDgiIce,
  formatDgiIdentifiantFiscal,
  isDeductiblePurchaseLine,
  isDgiRegimePeriodConsistent,
  isValidDgiDateYmd,
  isValidDgiRegimeCode,
  resolveDgiPeriodMetadata,
  resolveDgiXmlRegimeFromPeriod,
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
  isDgiRegimePeriodConsistent,
  isValidDgiDateYmd,
  isValidDgiRegimeCode,
  lookupSupplierIdentityByName,
  normalizeDgiRegimeCode,
  parseDgiPeriodFromKey,
  resolveDgiCompanyIdentifiers,
  resolveDgiIce,
  resolveDgiIdentifiantFiscal,
  resolveDgiPeriodMetadata,
  resolveDgiXmlRegimeFromPeriod,
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
  /** Explicit period key from UI/API — used for DGI header validation when set. */
  periodKey?: string | null;
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

function isXmlExportableDgiReleveRow(row: DgiReleveDeductionRow): boolean {
  return Boolean(row.refF.ice && row.refF.ifFiscal);
}

function appendMissingSupplierIdentifierWarnings(
  warnings: string[],
  purchaseRows: DgiReleveDeductionRow[],
): void {
  const missingIceRows = purchaseRows.filter((row) => !row.refF.ice);
  if (missingIceRows.length > 0) {
    const samples = missingIceRows
      .slice(0, 5)
      .map((row) => `${row.num} (${row.refF.nom})`)
      .join(', ');
    warnings.push(
      `${missingIceRows.length} ligne(s) sans ICE fournisseur valide (15 chiffres) — ` +
        `exclue(s) de l'export XML : ${samples}${missingIceRows.length > 5 ? '…' : ''}. ` +
        'Complétez les factures fournisseur pour les inclure dans une prochaine déclaration.',
    );
  }

  const missingIfRows = purchaseRows.filter((row) => !row.refF.ifFiscal);
  if (missingIfRows.length > 0) {
    const samples = missingIfRows
      .slice(0, 5)
      .map((row) => `${row.num} (${row.refF.nom})`)
      .join(', ');
    warnings.push(
      `${missingIfRows.length} ligne(s) sans IF fournisseur valide (7-8 chiffres) — ` +
        `exclue(s) de l'export XML : ${samples}${missingIfRows.length > 5 ? '…' : ''}. ` +
        'Complétez les factures fournisseur pour les inclure dans une prochaine déclaration.',
    );
  }
}

function resolveTvaXmlExportPeriodKey(
  record: AtlasTvaPeriodRecord,
  explicitPeriodKey?: string | null,
): string {
  const key = explicitPeriodKey?.trim();
  return key || record.periodKey;
}

function resolveTvaXmlExportPeriodMetadata(
  record: AtlasTvaPeriodRecord,
  explicitPeriodKey?: string | null,
) {
  const periodKey = resolveTvaXmlExportPeriodKey(record, explicitPeriodKey);
  return { periodKey, meta: resolveDgiPeriodMetadata(periodKey, record.periodType) };
}

function resolveTvaXmlExportRegime(
  periodMeta: ReturnType<typeof resolveDgiPeriodMetadata>,
  opts: Pick<TvaDgiExportValidationOptions, 'regime' | 'regimeTVA'>,
): number {
  return resolveDgiXmlRegimeFromPeriod(periodMeta, opts.regimeTVA);
}

function appendRegimeAutoCorrectWarning(
  warnings: string[],
  periodMeta: ReturnType<typeof resolveDgiPeriodMetadata>,
  opts: Pick<TvaDgiExportValidationOptions, 'regime' | 'regimeTVA'>,
  resolvedRegime: number,
): void {
  if (opts.regime == null || !isValidDgiRegimeCode(opts.regime) || opts.regime === resolvedRegime) {
    return;
  }
  warnings.push(
    `Code régime XML corrigé automatiquement (${opts.regime} → ${resolvedRegime}) pour correspondre à ${periodMeta.periodLabel}.`,
  );
}

/** Advisory validation for Excel / preview — warnings only. */
export function validateTvaDgiExport(
  record: AtlasTvaPeriodRecord,
  opts: TvaDgiExportValidationOptions,
): TvaDgiExportValidation {
  const warnings: string[] = [];
  const identifiantFiscal = resolveTvaDeclarationIdentifiantFiscal(opts.company, opts.identifiantFiscal);
  if (!identifiantFiscal) {
    warnings.push(
      "Identifiant Fiscal (IF) société absent du profil — requis pour un dépôt SIMPL-TVA conforme.",
    );
  }

  if (!resolveTvaDeclarationCompanyIce(opts.company, opts.companyIce)) {
    warnings.push('ICE société manquant ou invalide dans le profil entreprise.');
  }

  const { periodKey, meta: periodMeta } = resolveTvaXmlExportPeriodMetadata(record, opts.periodKey);
  if (!periodMeta.valid) {
    warnings.push(periodValidationMessage(periodMeta.error, periodKey));
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
 * Blocks on invalid company IF, period/year, or regime; missing supplier ICE/IF are warnings only.
 */
export function validateTvaDgiXmlExport(
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

  const { periodKey, meta: periodMeta } = resolveTvaXmlExportPeriodMetadata(record, opts.periodKey);
  if (!periodMeta.valid) {
    return {
      ok: false,
      error: periodMeta.error ?? 'invalid_period',
      message: periodValidationMessage(periodMeta.error, periodKey),
    };
  }

  const regime = resolveTvaXmlExportRegime(periodMeta, opts);
  appendRegimeAutoCorrectWarning(warnings, periodMeta, opts, regime);
  if (!isDgiRegimePeriodConsistent(regime, periodMeta)) {
    return {
      ok: false,
      error: 'regime_period_mismatch',
      message:
        `Incohérence régime/période — SIMPL-TVA attend régime ${regime} avec ` +
        `${periodMeta.periodKind === 'monthly' ? 'un mois (1-12)' : 'un trimestre (1-4)'} ` +
        `(période : ${periodKey}).`,
    };
  }

  if (!resolveTvaDeclarationCompanyIce(opts.company, opts.companyIce)) {
    warnings.push('ICE société (15 chiffres) absent du profil — recommandé pour la cohérence SIMPL-TVA.');
  }

  const supplierIndex = opts.supplierIndex ?? buildSupplierIdentityIndexFromPeriod(record);
  const purchaseRows = collectExportRows(record, supplierIndex);
  appendMissingSupplierIdentifierWarnings(warnings, purchaseRows);

  const exportableRows = purchaseRows.filter(isXmlExportableDgiReleveRow);
  for (const row of exportableRows) {
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
  if (genericNames > 0) {
    warnings.push(`${genericNames} ligne(s) avec nom fournisseur générique — vérifiez les libellés.`);
  }

  return { ok: true, warnings: warnings.length > 0 ? warnings : undefined };
}

function buildRefFXml(ref: DgiReleveDeductionRow['refF']): string[] {
  const ice = formatDgiIce(ref.ice);
  const ifFiscal = formatDgiIdentifiantFiscal(ref.ifFiscal);
  const nom = sanitizeDgiNomFournisseur(ref.nom);

  return [
    '      <refF>',
    `        <if>${escapeDgiXml(ifFiscal)}</if>`,
    `        <nom>${escapeDgiXml(nom)}</nom>`,
    `        <ice>${escapeDgiXml(ice)}</ice>`,
    '      </refF>',
  ];
}

/** Post-generation guard — rejects legacy schema, placeholder IDs, malformed header/rows. */
export function assertValidTvaDgiXmlOutput(xml: string): void {
  if (/iceFournisseur|nomFournisseur|ifFournisseur|montantHT|numFacture|dateFacture/i.test(xml)) {
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
  if (!isValidDgiRegimeCode(regime)) throw new Error('invalid_regime');

  if (regime === 1 && (periode < 1 || periode > 12)) throw new Error('invalid_period');
  if (regime === 2 && (periode < 1 || periode > 4)) throw new Error('invalid_period');

  if (/<ice>\s*0+\s*<\/ice>/i.test(xml)) {
    throw new Error('placeholder_supplier_ice');
  }
  if (/<ice>9{15}<\/ice>/.test(xml) || /<if>9{8}<\/if>/.test(xml)) {
    throw new Error('placeholder_supplier_identifiers');
  }

  const rdBlocks = xml.match(/<rd>[\s\S]*?<\/rd>/g) ?? [];
  for (const block of rdBlocks) {
    const iceMatch = block.match(/<ice>(\d*)<\/ice>/);
    if (!iceMatch || iceMatch[1].length !== 15) {
      throw new Error('invalid_supplier_ice_in_xml');
    }
    const blockIfMatch = block.match(/<if>(\d*)<\/if>/);
    if (!blockIfMatch || blockIfMatch[1].length < 7 || blockIfMatch[1].length > 8) {
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
 * Lines without valid supplier ICE/IF are omitted from XML (see warnings); no placeholder identifiers.
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
    periodKey: opts.periodKey,
  });
  if (!preflight.ok) {
    throw new Error(preflight.error ?? 'dgi_preflight_failed');
  }

  const { meta: periodMeta } = resolveTvaXmlExportPeriodMetadata(record, opts.periodKey);
  const regime = resolveTvaXmlExportRegime(periodMeta, opts);
  const identifiantFiscal = resolveTvaDeclarationIdentifiantFiscal(opts.company, opts.identifiantFiscal);

  const supplierIndex = opts.supplierIndex ?? buildSupplierIdentityIndexFromPeriod(record);
  const exportableRows = collectExportRows(record, supplierIndex).filter(isXmlExportableDgiReleveRow);

  const rdBlocks = exportableRows.map((row, index) => buildRdXmlBlock(row, index + 1)).join('\n');

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
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
