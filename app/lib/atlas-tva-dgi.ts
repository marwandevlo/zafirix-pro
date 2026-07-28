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
  'prélèvement': 3,
  prelevement: 3,
  virement: 4,
  effet: 5,
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

export type DgiTvaXmlOptions = {
  identifiantFiscal: string;
  /** 1 = trimestriel (default), 2 = mensuel */
  regime?: number;
};

export type DgiReleveDeductionRow = {
  num: number;
  numFacture: string;
  designation: string;
  montantHT: number;
  taux: number;
  montantTVA: number;
  montantTTC: number;
  iceFournisseur: string;
  nomFournisseur: string;
  dateFacture: string;
  modePaiement: string;
  modePaiementCode: number;
  datePaiement: string;
};

export type DgiTvaClientInfo = {
  nom_client: string;
  ice_client: string;
  annee: number;
  periode: number;
  periodKey: string;
  periodLabel: string;
};

export function parseDgiPeriodFromKey(periodKey: string): { annee: number; periode: number; periodLabel: string } {
  const annual = periodKey.match(/^(\d{4})-AN$/);
  if (annual) {
    const year = Number(annual[1]);
    return { annee: year, periode: 4, periodLabel: `Annuel ${year}` };
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
    return { annee: year, periode: month, periodLabel: `${month}/${year}` };
  }

  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  const year = now.getFullYear();
  return { annee: year, periode: q, periodLabel: `Trimestre ${q} / ${year}` };
}

export function dgiPaymentModeCode(paymentMode: string | null | undefined): number {
  const key = String(paymentMode ?? '').trim().toLowerCase();
  return PAYMENT_MODE_CODES[key] ?? 1;
}

export function dgiPaymentModeLabel(paymentMode: string | null | undefined, code?: number): string {
  if (paymentMode?.trim()) return paymentMode.trim();
  return PAYMENT_MODE_LABELS[code ?? 1] ?? 'Espèces';
}

export function formatDgiIce(ice: string | null | undefined): string {
  const digits = String(ice ?? '')
    .split('.')[0]
    .replace(/\D/g, '');
  if (!digits) return '0'.repeat(15);
  return digits.padStart(15, '0').slice(-15);
}

export function formatDgiVatRate(rate: number | null | undefined): number {
  if (rate == null || Number.isNaN(rate)) return 20;
  const value = Number(rate);
  if (value > 0 && value < 1) return Math.round(value * 100);
  return Math.round(value);
}

export function dgiRegimeCode(regimeTVA: string | null | undefined): number {
  return String(regimeTVA ?? '').toLowerCase().includes('trim') ? 1 : 2;
}

export function isDeductiblePurchaseLine(line: AtlasTvaLineItem): boolean {
  return line.kind === 'purchase' && line.source !== 'accounting_entry';
}

export function buildDgiReleveRows(record: AtlasTvaPeriodRecord): DgiReleveDeductionRow[] {
  return record.lines.filter(isDeductiblePurchaseLine).map((line, index) => {
    const modePaiementCode = dgiPaymentModeCode(line.paymentMode);
    return {
      num: index + 1,
      numFacture: line.reference || String(index + 1),
      designation: line.designation || 'Achats / Services',
      montantHT: line.amountHT,
      taux: formatDgiVatRate(line.vatRate),
      montantTVA: line.vatAmount,
      montantTTC: line.totalTTC,
      iceFournisseur: formatDgiIce(line.supplierIce),
      nomFournisseur: line.counterparty || 'Fournisseur',
      dateFacture: line.issueDate.slice(0, 10),
      modePaiement: dgiPaymentModeLabel(line.paymentMode, modePaiementCode),
      modePaiementCode,
      datePaiement: (line.paymentDate || line.issueDate).slice(0, 10),
    };
  });
}

export function buildDgiClientInfo(
  record: AtlasTvaPeriodRecord,
  company: { name?: string | null; legal_name?: string | null; trade_name?: string | null; ice?: string | null },
): DgiTvaClientInfo {
  const { annee, periode, periodLabel } = parseDgiPeriodFromKey(record.periodKey);
  const nom =
    company.trade_name?.trim() ||
    company.legal_name?.trim() ||
    company.name?.trim() ||
    'Société';
  return {
    nom_client: nom,
    ice_client: formatDgiIce(company.ice),
    annee,
    periode,
    periodKey: record.periodKey,
    periodLabel,
  };
}
