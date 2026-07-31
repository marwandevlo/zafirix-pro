import type { AtlasTvaPeriodRecord } from '@/app/types/atlas-tva';
import {
  buildDgiReleveRows,
  DGI_DECLARATION_REGIME_STANDARD,
  escapeDgiXml,
  formatDgiAmount,
  formatDgiIce,
  formatDgiIdentifiantFiscal,
  isDeductiblePurchaseLine,
  parseDgiPeriodFromKey,
  type DgiReleveDeductionRow,
  type DgiTvaXmlOptions,
} from '@/app/lib/atlas-tva-dgi';

export type { DgiTvaXmlOptions } from '@/app/lib/atlas-tva-dgi';
export {
  buildDgiClientInfo,
  buildDgiReleveRows,
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
  sanitizeDgiDesignation,
  sanitizeDgiNumFacture,
} from '@/app/lib/atlas-tva-dgi';

export type TvaDgiExportValidation = {
  ok: boolean;
  error?: string;
  message?: string;
  warnings?: string[];
};

/** Validate company IF/ICE and supplier ICE rows before SIMPL-TVA export. */
export function validateTvaDgiExport(
  record: AtlasTvaPeriodRecord,
  opts: { identifiantFiscal?: string | null; companyIce?: string | null },
): TvaDgiExportValidation {
  const identifiantFiscal = formatDgiIdentifiantFiscal(opts.identifiantFiscal);
  if (!identifiantFiscal) {
    return {
      ok: false,
      error: 'missing_if',
      message:
        "Identifiant Fiscal (IF) manquant ou invalide. Complétez le profil société (Paramètres) avant l'export DGI.",
    };
  }

  const warnings: string[] = [];
  if (!formatDgiIce(opts.companyIce)) {
    warnings.push("ICE société manquant ou invalide dans le profil entreprise.");
  }

  const rows = buildDgiReleveRows(record);
  const missingSupplierIce = rows.filter((row) => !row.refF.ice).length;
  if (missingSupplierIce > 0) {
    warnings.push(
      `${missingSupplierIce} ligne(s) d'achat sans ICE fournisseur valide — SIMPL-TVA peut rejeter le relevé.`,
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

function buildRefFXml(ref: DgiReleveDeductionRow['refF']): string[] {
  return [
    '      <refF>',
    `        <if>${escapeDgiXml(ref.ifFiscal)}</if>`,
    `        <nom>${escapeDgiXml(ref.nom)}</nom>`,
    `        <ice>${ref.ice}</ice>`,
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
  const identifiantFiscal = formatDgiIdentifiantFiscal(opts.identifiantFiscal);
  if (!identifiantFiscal) {
    throw new Error('missing_if');
  }
  const rows = buildDgiReleveRows(record);
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
