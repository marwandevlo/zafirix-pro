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
  const missingSupplierIce = rows.filter((row) => !row.iceFournisseur).length;
  if (missingSupplierIce > 0) {
    warnings.push(
      `${missingSupplierIce} ligne(s) d'achat sans ICE fournisseur valide — SIMPL-TVA peut rejeter le relevé.`,
    );
  }

  return { ok: true, warnings: warnings.length > 0 ? warnings : undefined };
}

function buildRdXmlBlock(row: ReturnType<typeof buildDgiReleveRows>[number]): string {
  return [
    '    <rd>',
    `      <num>${row.num}</num>`,
    `      <numFacture>${escapeDgiXml(row.numFacture)}</numFacture>`,
    `      <designation>${escapeDgiXml(row.designation)}</designation>`,
    `      <montantHT>${formatDgiAmount(row.montantHT)}</montantHT>`,
    `      <taux>${row.taux}</taux>`,
    `      <montantTVA>${formatDgiAmount(row.montantTVA)}</montantTVA>`,
    `      <montantTTC>${formatDgiAmount(row.montantTTC)}</montantTTC>`,
    `      <iceFournisseur>${row.iceFournisseur}</iceFournisseur>`,
    `      <nomFournisseur>${escapeDgiXml(row.nomFournisseur)}</nomFournisseur>`,
    `      <dateFacture>${row.dateFacture}</dateFacture>`,
    `      <modePaiement>${row.modePaiementCode}</modePaiement>`,
    `      <datePaiement>${row.datePaiement}</datePaiement>`,
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
