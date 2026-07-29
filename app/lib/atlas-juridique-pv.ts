import type {
  GeneratedPvDocument,
  MoroccanLegalIdentifiers,
  PvAgeInput,
  PvAgoInput,
  PvAssemblyType,
} from '@/app/types/atlas-juridique-pv';
import type { JuridiqueCompany } from '@/app/juridique/juridique-types';
import { asRecord } from '@/app/lib/atlas-json';

const LEGAL_DISCLAIMER =
  'Document généré automatiquement par Zafirix Pro — à valider par un juriste ou expert-comptable avant dépôt au greffe du Tribunal de Commerce.';

function normalizeForme(forme: string): 'SARL' | 'SA' {
  const f = forme.toUpperCase();
  if (f.includes('SA') && !f.includes('SARL')) return 'SA';
  return 'SARL';
}

/** Tribunal de Commerce compétent selon le siège social (ville). */
export function resolveTribunalCommerce(ville: string): string {
  const v = ville.trim();
  if (!v) return 'Tribunal de Commerce compétent';
  return `Tribunal de Commerce de ${v}`;
}

export function extractCapitalSocial(company: JuridiqueCompany & { companyJson?: Record<string, unknown> }): string {
  const json = company.companyJson ?? {};
  return String(json.capitalSocial ?? json.capital_social ?? '').trim();
}

/** Construit les identifiants légaux marocains depuis une société juridique. */
export function buildMoroccanLegalIdentifiers(
  company: JuridiqueCompany & { companyJson?: Record<string, unknown> },
  overrides?: Partial<MoroccanLegalIdentifiers>,
): MoroccanLegalIdentifiers {
  const capital = overrides?.capitalSocial ?? (extractCapitalSocial(company) || 'À compléter');
  const siege = overrides?.siegeSocial ?? ([company.adresse, company.ville].filter(Boolean).join(', ') || 'À compléter');
  const ville = company.ville?.trim() || 'Casablanca';
  return {
    raisonSociale: overrides?.raisonSociale ?? company.raisonSociale,
    formeJuridique: overrides?.formeJuridique ?? normalizeForme(company.formeJuridique),
    rc: overrides?.rc ?? (company.rc || '—'),
    ice: overrides?.ice ?? (company.ice || '—'),
    ifFiscal: overrides?.ifFiscal ?? (company.if_fiscal || '—'),
    capitalSocial: capital,
    siegeSocial: siege,
    tribunalCommerce: overrides?.tribunalCommerce ?? resolveTribunalCommerce(ville),
    ville,
  };
}

/** Bloc d'en-tête légal obligatoire (Raison sociale, RC, ICE, IF, Capital, Siège, Tribunal). */
export function buildMoroccanLegalHeaderBlock(company: MoroccanLegalIdentifiers): string {
  return [
    company.raisonSociale.toUpperCase(),
    `${company.formeJuridique} au capital social de ${company.capitalSocial} MAD`,
    `Siège social : ${company.siegeSocial}`,
    `Immatriculée au Registre du Commerce sous le n° ${company.rc}`,
    `Identifiant Commun de l'Entreprise (ICE) : ${company.ice}`,
    `Identifiant Fiscal (IF) : ${company.ifFiscal}`,
    `Greffe compétent : ${company.tribunalCommerce}`,
  ].join('\n');
}

function dirigeantLabel(forme: MoroccanLegalIdentifiers['formeJuridique']): string {
  return forme === 'SA' ? 'Président du Conseil d\'Administration' : 'Gérant';
}

function assembleeLabel(forme: MoroccanLegalIdentifiers['formeJuridique']): string {
  return forme === 'SA' ? 'Assemblée Générale des Actionnaires' : 'Assemblée Générale des Associés';
}

function formatMad(value: string): string {
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('fr-MA');
}

/** PV d'Assemblée Générale Ordinaire — approbation des comptes et affectation du résultat. */
export function generatePvAgo(input: PvAgoInput): GeneratedPvDocument {
  const { company } = input;
  const dirigeant = dirigeantLabel(company.formeJuridique);
  const assemblee = assembleeLabel(company.formeJuridique);
  const lieu = input.lieu?.trim() || company.ville;
  const participants =
    input.participants?.trim() ||
    (company.formeJuridique === 'SA'
      ? 'L\'ensemble des actionnaires représentant la totalité du capital social.'
      : 'L\'ensemble des associés représentant la totalité des parts sociales.');

  const lines = [
    buildMoroccanLegalHeaderBlock(company),
    '',
    `PROCES-VERBAL DE L'ASSEMBLEE GENERALE ORDINAIRE`,
    `Tenue le ${input.dateAssemblee} à ${lieu}`,
    '',
    `L'an ${input.dateAssemblee.split('/').pop() ?? '…'}, à ${lieu},`,
    `${participants}`,
    `Se sont réunis en ${assemblee} Ordinaire de la société ${company.raisonSociale}, ${company.formeJuridique}.`,
    '',
    `La séance est présidée par ${input.dirigeant}, ${dirigeant} de la société, qui constate que l'assemblée est régulièrement constituée et peut valablement délibérer.`,
    '',
    'ORDRE DU JOUR',
    `1. Approbation des comptes annuels de l'exercice clos le 31/12/${input.exercice}`,
    `2. Affectation du résultat de l'exercice ${input.exercice}`,
    `3. Quitus au ${dirigeant.toLowerCase()}`,
    `4. Questions diverses`,
    '',
    'DELIBERATIONS',
    '',
    'PREMIERE RESOLUTION — APPROBATION DES COMPTES',
    `L'assemblée, après avoir pris connaissance du rapport de gestion, des états financiers (bilan, compte de produits et charges et annexe) arrêtés au 31 décembre ${input.exercice},`,
    `et constaté un résultat net ${Number(input.resultatNet.replace(/\s/g, '')) >= 0 ? 'bénéficiaire' : 'déficitaire'} de ${formatMad(input.resultatNet)} MAD,`,
    `approuve lesdits comptes tels qu'ils ont été présentés.`,
    '',
    'DEUXIEME RESOLUTION — AFFECTATION DU RESULTAT',
    `L'assemblée décide d'affecter le résultat de l'exercice ${input.exercice} comme suit :`,
    input.affectation,
    '',
    `TROISIEME RESOLUTION — QUITUS AU ${dirigeant.toUpperCase()}`,
    `L'assemblée donne quitus entier et sans réserve à ${input.dirigeant}, ${dirigeant.toLowerCase()}, pour sa gestion au cours de l'exercice ${input.exercice}.`,
    '',
    'QUATRIEME RESOLUTION — POUVOIRS',
    `Tous pouvoirs sont conférés au ${dirigeant.toLowerCase()} ou à tout autre mandataire de la société pour accomplir toutes formalités légales, notamment le dépôt du présent procès-verbal au greffe du ${company.tribunalCommerce}, conformément à l'article 68 de la loi n° 5-96 relative aux Sociétés Anonymes et aux dispositions applicables aux ${company.formeJuridique}.`,
    '',
    `Fait à ${lieu}, le ${input.dateAssemblee}`,
    '',
    `Le ${dirigeant.toLowerCase()},`,
    `${input.dirigeant}`,
    '',
    LEGAL_DISCLAIMER,
  ];

  return {
    title: `PV AGO ${input.exercice} — ${company.raisonSociale}`,
    content: lines.join('\n'),
    assemblyType: 'ago',
    procedureId: 'pv_ago',
    generatedAt: new Date().toISOString(),
  };
}

/** PV d'Assemblée Générale Extraordinaire — modifications statutaires, capital, cession de parts. */
export function generatePvAge(input: PvAgeInput): GeneratedPvDocument {
  const { company } = input;
  const dirigeant = dirigeantLabel(company.formeJuridique);
  const assemblee = assembleeLabel(company.formeJuridique);
  const lieu = input.lieu?.trim() || company.ville;
  const participants =
    input.participants?.trim() ||
    (company.formeJuridique === 'SA'
      ? 'Les actionnaires représentant plus des trois quarts du capital social.'
      : 'Les associés représentant plus des trois quarts des parts sociales.');

  const resolutionBlocks: string[] = [];

  if (input.resolutionType === 'cession_parts' && input.cedant && input.cessionnaire) {
    resolutionBlocks.push(
      'PREMIERE RESOLUTION — CESSION DE PARTS SOCIALES',
      `L'assemblée prend acte de la cession de ${input.nombreParts ?? '…'} parts sociales`,
      `effectuée par ${input.cedant} (cédant) au profit de ${input.cessionnaire} (cessionnaire),`,
      `au prix de ${input.prixCession ? `${formatMad(input.prixCession)} MAD` : '…'}.`,
      `Les associés entérinent cette cession et autorisent la mise à jour de la répartition du capital.`,
    );
  }

  if (
    (input.resolutionType === 'augmentation_capital' || input.resolutionType === 'reduction_capital') &&
    input.capitalActuel &&
    input.capitalNouveau
  ) {
    resolutionBlocks.push(
      'PREMIERE RESOLUTION — MODIFICATION DU CAPITAL SOCIAL',
      `L'assemblée décide de porter le capital social de ${formatMad(input.capitalActuel)} MAD`,
      `à ${formatMad(input.capitalNouveau)} MAD, et de modifier en conséquence l'article relatif au capital des statuts.`,
    );
  }

  if (input.resolutionType === 'transfert_siege') {
    resolutionBlocks.push(
      'PREMIERE RESOLUTION — TRANSFERT DE SIEGE SOCIAL',
      `L'assemblée approuve le transfert du siège social au nouvel emplacement indiqué à l'ordre du jour`,
      `et autorise la modification de l'article des statuts relatif au siège social.`,
    );
  }

  if (input.resolutionType === 'changement_denomination') {
    resolutionBlocks.push(
      'PREMIERE RESOLUTION — CHANGEMENT DE DENOMINATION SOCIALE',
      `L'assemblée approuve le changement de la raison sociale et autorise la modification`,
      `de l'article relatif à la dénomination sociale des statuts.`,
    );
  }

  if (input.resolutionType === 'modification_statuts' || input.resolutionType === 'autre') {
    resolutionBlocks.push(
      'PREMIERE RESOLUTION — MODIFICATIONS STATUTAIRES',
      input.resolutions,
    );
  }

  if (!resolutionBlocks.length) {
    resolutionBlocks.push('PREMIERE RESOLUTION', input.resolutions);
  }

  resolutionBlocks.push(
    '',
    'DEUXIEME RESOLUTION — POUVOIRS',
    `Tous pouvoirs sont conférés au ${dirigeant.toLowerCase()} pour effectuer les formalités`,
    `de publicité légale et le dépôt au greffe du ${company.tribunalCommerce},`,
    `notamment la publication au Bulletin Officiel et au journal d'annonces légales.`,
  );

  const lines = [
    buildMoroccanLegalHeaderBlock(company),
    '',
    `PROCES-VERBAL DE L'ASSEMBLEE GENERALE EXTRAORDINAIRE`,
    `Tenue le ${input.dateAssemblee} à ${lieu}`,
    '',
    `L'an ${input.dateAssemblee.split('/').pop() ?? '…'}, à ${lieu},`,
    `${participants}`,
    `Se sont réunis en ${assemblee} Extraordinaire de la société ${company.raisonSociale}, ${company.formeJuridique}.`,
    '',
    `La séance est présidée par ${input.dirigeant}, ${dirigeant} de la société.`,
    `Le quorum requis pour les délibérations extraordinaires est atteint.`,
    '',
    'ORDRE DU JOUR',
    input.ordreDuJour,
    '',
    'DELIBERATIONS',
    '',
    ...resolutionBlocks,
    '',
    `Les présentes délibérations ont été adoptées à la majorité requise par la loi et les statuts.`,
    '',
    `Fait à ${lieu}, le ${input.dateAssemblee}`,
    '',
    `Le ${dirigeant.toLowerCase()},`,
    `${input.dirigeant}`,
    '',
    LEGAL_DISCLAIMER,
  ];

  return {
    title: `PV AGE — ${company.raisonSociale}`,
    content: lines.join('\n'),
    assemblyType: 'age',
    procedureId: 'pv_age',
    generatedAt: new Date().toISOString(),
  };
}

export function generatePvDocument(
  assemblyType: PvAssemblyType,
  input: PvAgoInput | PvAgeInput,
): GeneratedPvDocument {
  if (assemblyType === 'ago') return generatePvAgo(input as PvAgoInput);
  return generatePvAge(input as PvAgeInput);
}

/** Mappe une société Atlas / juridique vers les identifiants légaux. */
export function juridiqueCompanyToLegalIds(
  company: JuridiqueCompany,
  companyJson?: unknown,
): MoroccanLegalIdentifiers {
  const json = asRecord(companyJson) ?? {};
  return buildMoroccanLegalIdentifiers({ ...company, companyJson: json });
}
