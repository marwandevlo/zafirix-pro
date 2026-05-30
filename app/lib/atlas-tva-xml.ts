import type { AtlasTvaPeriodRecord } from '@/app/types/atlas-tva';

export function generateTvaDeclarationXml(record: AtlasTvaPeriodRecord): string {
  const periode = record.periodKey.replace('-', '');
  const now = new Date();
  const sales = record.lines.filter((l) => l.kind === 'sale' && l.source !== 'accounting_entry');
  const purchases = record.lines.filter((l) => l.kind === 'purchase' && l.source !== 'accounting_entry');

  return `<?xml version="1.0" encoding="UTF-8"?>
<DeclarationTVA xmlns="http://www.tax.gov.ma/tva/v1">
  <Entete>
    <Periode>${periode}</Periode>
    <DateCreation>${now.toISOString().split('T')[0]}</DateCreation>
    <TypeDeclaration>${record.periodType === 'monthly' ? 'MENSUELLE' : 'TRIMESTRIELLE'}</TypeDeclaration>
  </Entete>
  <Ventes>
    <ChiffreAffaires>${record.caHT}</ChiffreAffaires>
    <TVACollectee>${record.tvaCollectee}</TVACollectee>
    ${sales.map((f) => `<Facture>
      <Reference>${f.reference}</Reference>
      <Client>${f.counterparty}</Client>
      <MontantHT>${f.amountHT}</MontantHT>
      <TVA>${f.vatAmount}</TVA>
    </Facture>`).join('\n    ')}
  </Ventes>
  <Achats>
    <TotalAchats>${record.achatsHT}</TotalAchats>
    <TVADeductible>${record.tvaDeductible}</TVADeductible>
    ${purchases.map((f) => `<Facture>
      <Reference>${f.reference}</Reference>
      <Fournisseur>${f.counterparty}</Fournisseur>
      <MontantHT>${f.amountHT}</MontantHT>
      <TVA>${f.vatAmount}</TVA>
    </Facture>`).join('\n    ')}
  </Achats>
  <Solde>
    <TVACollectee>${record.tvaCollectee}</TVACollectee>
    <TVADeductible>${record.tvaDeductible}</TVADeductible>
    <NetAPayer>${record.tvaNette}</NetAPayer>
  </Solde>
</DeclarationTVA>`;
}
