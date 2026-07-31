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
  parseDgiPeriodFromKey,
  resolveTvaDeclarationCompanyIce,
  resolveTvaDeclarationIdentifiantFiscal,
  sanitizeDgiNomFournisseur,
  type DgiReleveDeductionRow,
  type DgiTvaXmlOptions,
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
  parseDgiPeriodFromKey,
  resolveDgiCompanyIdentifiers,
  resolveDgiIce,
  resolveDgiIdentifiantFiscal,
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
};

/** Validate supplier ICE rows before SIMPL-TVA export; company IF/ICE are advisory only. */
export function validateTvaDgiExport(
  record: AtlasTvaPeriodRecord,
  opts: TvaDgiExportValidationOptions,
): TvaDgiExportValidation {
  const warnings: string[] = [];
  const identifiantFiscal = resolveTvaDeclarationIdentifiantFiscal(opts.company, opts.identifiantFiscal);
  if (!identifiantFiscal) {
    warnings.push(
      "Identifiant Fiscal (IF) société absent du profil — l'export s'appuie sur les IF/ICE des factures et fournisseurs.",
    );
  }

  if (!resolveTvaDeclarationCompanyIce(opts.company, opts.companyIce)) {
    warnings.push("ICE société manquant ou invalide dans le profil entreprise.");
  }

  const supplierIndex = buildSupplierIdentityIndexFromPeriod(record);
  const rows = buildDgiReleveRows(record, supplierIndex);
  const missingSupplierIce = rows.filter((row) => !row.refF.ice).length;
  if (missingSupplierIce > 0) {
    return {
      ok: false,
      error: 'missing_supplier_ice',
      message:
        `${missingSupplierIce} ligne(s) d'achat sans ICE fournisseur valide (15 chiffres). ` +
        'Complétez les factures fournisseur (ICE/IF) avant export DGI — les zéros factices sont rejetés par SIMPL-TVA.',
    };
  }

  const missingSupplierIf = rows.filter((row) => !row.refF.ifFiscal).length;
  if (missingSupplierIf > 0) {
    warnings.push(
      `${missingSupplierIf} ligne(s) sans IF fournisseur — complétez les factures achats si requis par la DGI.`,
    );
  }

  const missingSupplierName = rows.filter((row) => !row.refF.nom || row.refF.nom === 'Fournisseur').length;
  if (missingSupplierName > 0) {
    warnings.push(`${missingSupplierName} ligne(s) avec nom fournisseur générique — vérifiez les libellés.`);
  }

  return { ok: true, warnings: warnings.length > 0 ? warnings : undefined };
}

function buildRefFXml(ref: DgiReleveDeductionRow['refF']): string[] {
  // DGI SIMPL-TVA: refF/if, refF/nom, refF/ice — never emit padded zero placeholders.
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

/** Official DGI `<rd>` block — ord/num/des/mht/tva/ttc + refF + tx/mp/dpai/dfac. */
function buildRdXmlBlock(row: DgiReleveDeductionRow): string {
  return [
    '    <rd>',
    `      <ord>${row.ord}</ord>`,
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
 * Schema: DeclarationReleveDeduction → identifiantFiscal, annee, periode, regime, releveDeductions/rd[]
 */
export function generateTvaDeclarationXml(
  record: AtlasTvaPeriodRecord,
  opts: DgiTvaXmlOptions,
): string {
  const { annee, periode } = parseDgiPeriodFromKey(record.periodKey);
  const regime = opts.regime ?? DGI_DECLARATION_REGIME_STANDARD;
  const identifiantFiscal = resolveTvaDeclarationIdentifiantFiscal(opts.company, opts.identifiantFiscal);

  const supplierIndex = buildSupplierIdentityIndexFromPeriod(record);
  const rows = buildDgiReleveRows(record, supplierIndex).filter((row) => {
    const valid = Boolean(row.refF.ice);
    if (!valid) {
      console.warn('[TVA XML] Ligne exclue — ICE fournisseur manquant', {
        num: row.num,
        nom: row.refF.nom,
      });
    }
    return valid;
  });

  if (rows.length === 0 && record.lines.some(isDeductiblePurchaseLine)) {
    throw new Error('missing_supplier_ice');
  }

  const rdBlocks = rows.map(buildRdXmlBlock).join('\n');

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DeclarationReleveDeduction>',
    `  <identifiantFiscal>${identifiantFiscal}</identifiantFiscal>`,
    `  <annee>${annee}</annee>`,
    `  <periode>${periode}</periode>`,
    `  <regime>${regime}</regime>`,
    '  <releveDeductions>',
  ];

  if (rdBlocks) lines.push(rdBlocks);
  lines.push('  </releveDeductions>', '</DeclarationReleveDeduction>');

  return lines.join('\n');
}

export { isDeductiblePurchaseLine };
