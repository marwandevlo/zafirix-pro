import type { AtlasIsDraft } from '@/app/types/atlas-payroll';
import {
  escapeDgiXml,
  formatDgiAmount,
  formatDgiIdentifiantFiscal,
} from '@/app/lib/atlas-tva-dgi';

export type DgiIsXmlOptions = {
  identifiantFiscal: string;
  raisonSociale?: string;
};

export type IsExportValidation = {
  ok: boolean;
  error?: string;
  message?: string;
};

function totalCharges(draft: AtlasIsDraft): number {
  return draft.supplierExpensesHT + draft.payrollTotal + draft.accountingCharges;
}

/** Ensure draft contains computable fiscal activity before exporting. */
export function validateIsDraftForExport(draft: AtlasIsDraft): IsExportValidation {
  if (!draft.fiscalYear || draft.fiscalYear < 2000) {
    return { ok: false, error: 'invalid_fiscal_year', message: 'Exercice fiscal invalide.' };
  }

  const charges = totalCharges(draft);
  const hasActivity =
    Math.abs(draft.revenueHT) > 0 ||
    Math.abs(charges) > 0 ||
    Math.abs(draft.taxableResult) > 0 ||
    Math.abs(draft.estimatedIS) > 0 ||
    Math.abs(draft.minimalContribution) > 0 ||
    Math.abs(draft.isDue) > 0;

  if (!hasActivity) {
    return {
      ok: false,
      error: 'empty_fiscal_data',
      message:
        'Aucune donnée fiscale exploitable pour cet exercice. Lancez d\'abord le calcul IS (brouillon).',
    };
  }

  return { ok: true };
}

/**
 * Generate DGI SIMPL-IS declaration XML from a persisted IS draft.
 * Maps produits d'exploitation, charges, résultat fiscal, IS calculé, cotisation minimale, impôt dû.
 */
export function generateIsDeclarationXml(
  draft: AtlasIsDraft,
  opts: DgiIsXmlOptions,
): string {
  const validation = validateIsDraftForExport(draft);
  if (!validation.ok) {
    throw new Error(validation.error ?? 'export_invalid');
  }

  const identifiantFiscal = formatDgiIdentifiantFiscal(opts.identifiantFiscal);
  const raisonSociale = escapeDgiXml(String(opts.raisonSociale ?? '').trim());
  const chargesTotal = totalCharges(draft);
  const appliedRate =
    typeof draft.sourcesJson.appliedRate === 'string'
      ? escapeDgiXml(draft.sourcesJson.appliedRate)
      : '';

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DeclarationIS>',
    `  <identifiantFiscal>${identifiantFiscal}</identifiantFiscal>`,
    `  <annee>${draft.fiscalYear}</annee>`,
    `  <exerciceDu>${draft.periodStart}</exerciceDu>`,
    `  <exerciceAu>${draft.periodEnd}</exerciceAu>`,
    ...(raisonSociale ? [`  <raisonSociale>${raisonSociale}</raisonSociale>`] : []),
    '  <produitsExploitation>',
    `    <chiffreAffairesHT>${formatDgiAmount(draft.revenueHT)}</chiffreAffairesHT>`,
    `    <totalProduitsExploitation>${formatDgiAmount(draft.revenueHT)}</totalProduitsExploitation>`,
    '  </produitsExploitation>',
    '  <chargesExploitation>',
    `    <achatsFournisseursHT>${formatDgiAmount(draft.supplierExpensesHT)}</achatsFournisseursHT>`,
    `    <chargesPersonnel>${formatDgiAmount(draft.payrollTotal)}</chargesPersonnel>`,
    `    <autresChargesComptables>${formatDgiAmount(draft.accountingCharges)}</autresChargesComptables>`,
    `    <totalChargesExploitation>${formatDgiAmount(chargesTotal)}</totalChargesExploitation>`,
    '  </chargesExploitation>',
    '  <resultatFiscal>',
    `    <resultatFiscalNet>${formatDgiAmount(draft.taxableResult)}</resultatFiscalNet>`,
    '  </resultatFiscal>',
    '  <liquidationIS>',
    `    <impotSurSocietesCalcule>${formatDgiAmount(draft.estimatedIS)}</impotSurSocietesCalcule>`,
    `    <cotisationMinimale>${formatDgiAmount(draft.minimalContribution)}</cotisationMinimale>`,
    `    <impotDu>${formatDgiAmount(draft.isDue)}</impotDu>`,
    '  </liquidationIS>',
    '  <meta>',
    `    <formulaVersion>${escapeDgiXml(draft.formulaVersion)}</formulaVersion>`,
    `    <statutBrouillon>${draft.status}</statutBrouillon>`,
    ...(appliedRate ? [`    <tauxApplique>${appliedRate}</tauxApplique>`] : []),
    `    <dateGeneration>${new Date().toISOString().slice(0, 10)}</dateGeneration>`,
    '  </meta>',
    '</DeclarationIS>',
  ];

  return lines.join('\n');
}

export function isDeclarationXmlFilename(fiscalYear: number): string {
  return `IS_${fiscalYear}_DGI.xml`;
}
