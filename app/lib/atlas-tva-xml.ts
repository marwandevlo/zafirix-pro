import type { AtlasTvaPeriodRecord } from '@/app/types/atlas-tva';
import {
  buildDgiReleveRows,
  dgiRegimeCode,
  formatDgiIce,
  formatDgiVatRate,
  isDeductiblePurchaseLine,
  parseDgiPeriodFromKey,
  type DgiTvaXmlOptions,
} from '@/app/lib/atlas-tva-dgi';

export type { DgiTvaXmlOptions } from '@/app/lib/atlas-tva-dgi';
export {
  buildDgiClientInfo,
  buildDgiReleveRows,
  dgiPaymentModeCode,
  dgiRegimeCode,
  formatDgiIce,
  formatDgiVatRate,
  parseDgiPeriodFromKey,
} from '@/app/lib/atlas-tva-dgi';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

/** Generate DGI SIMPL-TVA Relevé de déductions XML from Atlas TVA period data. */
export function generateTvaDeclarationXml(
  record: AtlasTvaPeriodRecord,
  opts: DgiTvaXmlOptions,
): string {
  const { annee, periode } = parseDgiPeriodFromKey(record.periodKey);
  const regime = opts.regime ?? 1;
  const identifiantFiscal = escapeXml(String(opts.identifiantFiscal || '').trim() || '00000000');
  const rows = buildDgiReleveRows(record);
  const rdBlocks = rows
    .map(
      (row) => `    <rd>
      <num>${row.num}</num>
      <numFacture>${escapeXml(row.numFacture)}</numFacture>
      <designation>${escapeXml(row.designation)}</designation>
      <montantHT>${formatAmount(row.montantHT)}</montantHT>
      <taux>${row.taux}</taux>
      <montantTVA>${formatAmount(row.montantTVA)}</montantTVA>
      <montantTTC>${formatAmount(row.montantTTC)}</montantTTC>
      <iceFournisseur>${row.iceFournisseur}</iceFournisseur>
      <nomFournisseur>${escapeXml(row.nomFournisseur)}</nomFournisseur>
      <dateFacture>${row.dateFacture}</dateFacture>
      <modePaiement>${row.modePaiementCode}</modePaiement>
      <datePaiement>${row.datePaiement}</datePaiement>
    </rd>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<DeclarationReleveDeduction>
  <identifiantFiscal>${identifiantFiscal}</identifiantFiscal>
  <annee>${annee}</annee>
  <periode>${periode}</periode>
  <regime>${regime}</regime>
  <releveDeductions>
${rdBlocks}
  </releveDeductions>
</DeclarationReleveDeduction>`;
}

export { isDeductiblePurchaseLine };
