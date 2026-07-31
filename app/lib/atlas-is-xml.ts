import type { AtlasIsDraft } from '@/app/types/atlas-payroll';
import type { AtlasIsAcompteTrimestriel } from '@/app/lib/atlas-payroll-calculations';
import {
  escapeDgiXml,
  formatDgiAmount,
  formatDgiIdentifiantFiscal,
  resolveDgiIdentifiantFiscal,
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

function parseAcomptes(draft: AtlasIsDraft): AtlasIsAcompteTrimestriel[] {
  const raw = draft.sourcesJson.acomptesProvisionnels;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const r = item as Record<string, unknown>;
      const trimestre = Number(r.trimestre);
      if (trimestre < 1 || trimestre > 4) return null;
      return {
        trimestre: trimestre as 1 | 2 | 3 | 4,
        echeance: String(r.echeance ?? ''),
        montant: Number(r.montant ?? 0),
      };
    })
    .filter((a): a is AtlasIsAcompteTrimestriel => a != null);
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

/** Validate IS export identifiers (IF required for DGI SIMPL-IS). */
export function validateIsExportForDgi(
  draft: AtlasIsDraft,
  opts: { identifiantFiscal?: string | null },
): IsExportValidation {
  const base = validateIsDraftForExport(draft);
  if (!base.ok) return base;

  const ifFormatted = resolveDgiIdentifiantFiscal(opts.identifiantFiscal);
  if (!ifFormatted) {
    return {
      ok: false,
      error: 'missing_if',
      message:
        "Identifiant Fiscal (IF) manquant ou invalide. Complétez le profil société (Paramètres) avant l'export DGI.",
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
  const validation = validateIsExportForDgi(draft, opts);
  if (!validation.ok) {
    throw new Error(validation.error ?? 'export_invalid');
  }

  const identifiantFiscal = formatDgiIdentifiantFiscal(opts.identifiantFiscal);
  if (!identifiantFiscal) {
    throw new Error('missing_if');
  }
  const raisonSociale = escapeDgiXml(String(opts.raisonSociale ?? '').trim());
  const chargesTotal = totalCharges(draft);
  const appliedRate =
    typeof draft.sourcesJson.appliedRate === 'string'
      ? escapeDgiXml(draft.sourcesJson.appliedRate)
      : '';
  const cotisationMinAppliquee = draft.sourcesJson.cotisationMinimaleAppliquee === true;
  const acomptes = parseAcomptes(draft);

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
    `    <cotisationMinimaleAppliquee>${cotisationMinAppliquee ? 'true' : 'false'}</cotisationMinimaleAppliquee>`,
    `    <impotDu>${formatDgiAmount(draft.isDue)}</impotDu>`,
    '  </liquidationIS>',
    ...(acomptes.length
      ? [
          '  <acomptesProvisionnels>',
          ...acomptes.flatMap((a) => [
            '    <acompte>',
            `      <trimestre>${a.trimestre}</trimestre>`,
            `      <echeance>${escapeDgiXml(a.echeance)}</echeance>`,
            `      <montant>${formatDgiAmount(a.montant)}</montant>`,
            '    </acompte>',
          ]),
          '  </acomptesProvisionnels>',
        ]
      : []),
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
