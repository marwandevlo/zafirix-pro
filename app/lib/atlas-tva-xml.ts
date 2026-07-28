import type { AtlasTvaPeriodRecord } from '@/app/types/atlas-tva';
import {
  buildDgiReleveRows,
  DGI_DECLARATION_REGIME_STANDARD,
  escapeDgiXml,
  formatDgiAmount,
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
  parseDgiPeriodFromKey,
  sanitizeDgiDesignation,
  sanitizeDgiNumFacture,
} from '@/app/lib/atlas-tva-dgi';

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
