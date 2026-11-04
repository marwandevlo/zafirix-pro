/**
 * Versioned Moroccan tax rules used by the Business Studio forecasts.
 *
 * Sources: Code Général des Impôts, édition 2026 (DGI consolidation of 30 Dec 2025 including
 * LF 50-25), retrieved from tax.gov.ma on 2026-10-29 (SHA-256 28F85C69…3B03022); "line" refers to
 * the text extract of that file. CNSS and AMO: ACAPS (official regulator) sheets retrieved 2026-10-30.
 * The consolidation is not the Bulletin Officiel; if they differ, the BO prevails.
 *
 * Nothing here has been reviewed by an expert-comptable. Rules carry a status so screens and reports
 * can say which values come from a verified text and which are conventions or user inputs.
 */

import type { IsCategory } from './model';

export const TAX_RULES_VERSION = 'ma-studio-rules-2026.11-v1';
export const LAST_INTEGRATED_FINANCE_LAW = 'LF 50-25 (loi de finances 2026)';
export const LAST_VERIFIED_FISCAL_YEAR = 2026;

export type RuleStatus = 'verified_official' | 'verified_regulator' | 'convention' | 'assumed_unchanged' | 'user_defined' | 'not_covered';

export const RULE_STATUS_LABEL: Record<RuleStatus, string> = {
  verified_official: 'Lu dans le texte officiel (CGI 2026, DGI) — non revu par un expert',
  verified_regulator: 'Source officielle du régulateur (ACAPS) — décrets non consultés',
  convention: 'Convention de calcul de l’outil — à valider par un professionnel',
  assumed_unchanged: `Hypothèse : règle ${LAST_VERIFIED_FISCAL_YEAR} maintenue (aucune loi de finances postérieure intégrée)`,
  user_defined: 'Valeur saisie par l’utilisateur — à valider par un professionnel',
  not_covered: 'Non couvert par l’outil — à déterminer avec un professionnel',
};

export type RuleSource = { document: string; reference: string; line?: string; url?: string };

const CGI_2026: Omit<RuleSource, 'reference' | 'line'> = {
  document: 'Code Général des Impôts 2026 (consolidation DGI, LF 50-25)',
  url: 'https://www.tax.gov.ma/wps/wcm/connect/08712531-1e81-4e28-a38b-2bd9edf8e09e/CGI+2026+FR.pdf',
};

export type RuleDescriptor = {
  id: string;
  tax: 'IS' | 'CM' | 'TVA' | 'IR' | 'IR_SAL' | 'CNSS' | 'AMO' | 'TFP' | 'TP' | 'TSC' | 'DE' | 'RAS';
  label: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: RuleStatus;
  source: RuleSource | null;
  note: string;
};

export const RULES: readonly RuleDescriptor[] = [
  {
    id: 'is-2026', tax: 'IS', label: 'IS : 20 % ; 35 % si bénéfice net ≥ 100 000 000 MAD ; 40 % établissements de crédit et assurances',
    effectiveFrom: '2026-01-01', effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 19-I', line: '1638' },
    note: 'Exercices ouverts à compter du 1er janvier 2026. Taux appliqué à la totalité du bénéfice de la tranche.',
  },
  {
    id: 'is-2023-2025', tax: 'IS', label: 'IS : taux transitoires des exercices ouverts de 2023 à 2025, par catégorie',
    effectiveFrom: '2023-01-01', effectiveTo: '2025-12-31', status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 247-XXXVII-A', line: '16890–16975' },
    note: 'La tranche 300 001 – 1 000 000 MAD et les anciens secteurs à 20 % sous 100 MMAD restent à 20 %. Le régime des conventions d’investissement ≥ 1,5 milliard MAD n’est pas modélisé.',
  },
  {
    id: 'cm', tax: 'CM', label: 'Cotisation minimale : 0,25 % ; minimum 3 000 MAD (IS) ou 1 500 MAD (IR)',
    effectiveFrom: '2023-01-01', effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 144-I-D', line: '9474' },
    note: 'Les cas à 0,15 % et 4 % ne sont pas déterminés automatiquement : saisir un taux de substitution.',
  },
  {
    id: 'cm-exemption', tax: 'CM', label: 'Exonération de cotisation minimale : sociétés, 36 premiers mois d’exploitation (au plus 60 mois après la constitution) ; IR, 3 premiers exercices',
    effectiveFrom: null, effectiveTo: null, status: 'convention',
    source: { ...CGI_2026, reference: 'Art. 144-I-C', line: '9474' },
    note: 'Texte vérifié. Convention de l’outil : un exercice est exonéré s’il commence dans la période d’exonération. Sociétés concessionnaires de service public exclues (non détecté).',
  },
  {
    id: 'cm-base', tax: 'CM', label: 'Base de la cotisation minimale : chiffre d’affaires et autres produits d’exploitation, produits financiers, subventions (HT)',
    effectiveFrom: null, effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 144-I-B', line: '9474' }, note: '',
  },
  {
    id: 'is-acomptes', tax: 'IS', label: 'Acomptes provisionnels : 4 × 25 % de l’impôt du dernier exercice clos, avant la fin des 3e, 6e, 9e et 12e mois ; solde dans le délai de déclaration',
    effectiveFrom: null, effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 170-I, II et IV ; art. 20', line: '11383–11440' },
    note: 'Exercice de référence de moins de 12 mois : impôt ramené à 12 mois. Excédent imputé sur les acomptes suivants. Le délai de déclaration est pris à 3 mois après la clôture. Le cas de l’art. 170-III (fin d’exonération) n’est pas modélisé.',
  },
  {
    id: 'is-deficits', tax: 'IS', label: 'Report des déficits jusqu’au 4e exercice suivant (paramétrable)',
    effectiveFrom: null, effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 12', line: '1428' },
    note: 'La fraction correspondant aux amortissements, reportable sans limite de délai, n’est pas isolée : l’outil applique la limite à tout le déficit (prudent).',
  },
  {
    id: 'amort-degressif', tax: 'IS', label: 'Amortissement dégressif : coefficients 1,5 (3–4 ans), 2 (5–6 ans), 3 (> 6 ans)',
    effectiveFrom: null, effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 10-III-C-1°', line: '1323' },
    note: 'Biens éligibles et option à confirmer ; le coefficient reste modifiable.',
  },
  {
    id: 'tva-rates', tax: 'TVA', label: 'TVA : 20 % (normal), 10 % (réduit) à compter de 2026 ; taux transitoires 2024–2025',
    effectiveFrom: '2024-01-01', effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 99 et 247-XXXXI', line: '6327 ; 17072–17140' },
    note: 'Le taux applicable à chaque produit est choisi par l’utilisateur ; l’outil signale un taux non légal à la date.',
  },
  {
    id: 'tva-encaissement', tax: 'TVA', label: 'TVA exigible à l’encaissement par défaut ; option pour les débits',
    effectiveFrom: null, effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 95', line: '6194' }, note: '',
  },
  {
    id: 'tva-deduction', tax: 'TVA', label: 'Droit à déduction au mois du paiement ; crédit reporté sur les périodes suivantes',
    effectiveFrom: null, effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 101-2° et 101-3°', line: '6551' },
    note: 'Le délai d’un an n’est pas modélisé. Seul le remboursement de l’art. 103 bis est modélisé (option).',
  },
  {
    id: 'tva-remboursement-103bis', tax: 'TVA', label: 'Remboursement du crédit de TVA non imputable sur les biens d’investissement, hors matériel et mobilier de bureau et véhicules de transport de personnes',
    effectiveFrom: null, effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 103 bis', line: '6692–6728' },
    note: 'Option de l’outil, désactivée par défaut ; établissements et entreprises publics exclus. Limité à la TVA des biens d’investissement payés dans le trimestre. Convention : demande déposée le mois suivant le trimestre, remboursement encaissé le mois d’après (délai légal de 30 jours) ; le crédit demandé n’est plus imputable.',
  },
  {
    id: 'tva-periodicity', tax: 'TVA', label: 'Déclaration mensuelle si CA taxable de l’année écoulée ≥ 1 000 000 MAD ; trimestrielle sinon et pour l’année civile de création (option mensuelle possible)',
    effectiveFrom: null, effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 108', line: '6952' }, note: 'Mode « automatique » de l’outil.',
  },
  {
    id: 'tva-payment', tax: 'TVA', label: 'TVA de la période versée le mois suivant la fin de la période',
    effectiveFrom: null, effectiveTo: null, status: 'convention',
    source: { ...CGI_2026, reference: 'Art. 110, 111 et 155', line: '6981, 6993, 10285' },
    note: 'Télédéclaration avant la fin du mois suivant (mensuel) ou du premier mois du trimestre suivant.',
  },
  {
    id: 'ir-scale-2025', tax: 'IR', label: 'IR : barème annuel 0/10/20/30/34/37 % (40 000 / 60 000 / 80 000 / 100 000 / 180 000 MAD)',
    effectiveFrom: '2025-01-01', effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 73-I', line: '4163' }, note: '',
  },
  {
    id: 'ir-salarial', tax: 'IR_SAL', label: 'IR salarial mensuel : barème annuel appliqué à 12 × la base mensuelle ; frais professionnels ; réduction pour charges de famille',
    effectiveFrom: '2025-01-01', effectiveTo: null, status: 'convention',
    source: { ...CGI_2026, reference: 'Art. 59-I-A, 73-I, 74-I', line: '4163, 4395–4400' },
    note: 'Frais professionnels : 35 % si brut annuel ≤ 78 000 MAD, sinon 25 % plafonnés à 35 000 MAD/an. Réduction 600 MAD/personne à charge, plafond 3 600 MAD/an (à compter de 2026). Convention « annuel ÷ 12 » à confirmer.',
  },
  {
    id: 'cnss', tax: 'CNSS', label: 'CNSS : prestations sociales 4,48 % salarié et 8,98 % employeur (plafond 6 000 MAD/mois) ; allocations familiales 6,40 % employeur',
    effectiveFrom: null, effectiveTo: null, status: 'verified_regulator',
    source: { document: 'ACAPS — fiche synthétique CNSS (2025-02)', reference: 'acaps.ma/sites/default/files/2025-02/fiche_synthetique_cnss.pdf' },
    note: 'Décrets non consultés.',
  },
  {
    id: 'amo', tax: 'AMO', label: 'AMO secteur privé : 2,26 % salarié ; 4,11 % employeur (2,26 % + 1,85 %), sans plafond',
    effectiveFrom: null, effectiveTo: null, status: 'verified_regulator',
    source: { document: 'ACAPS — couverture médicale de base (AMO)', reference: 'acaps.ma/fr/grand-public/sante/couverture-medicale-de-base-amo' },
    note: '',
  },
  {
    id: 'tfp', tax: 'TFP', label: 'Taxe de formation professionnelle 1,60 % employeur (collectée par la CNSS)',
    effectiveFrom: null, effectiveTo: null, status: 'convention',
    source: null, note: 'Taux issu de sources secondaires uniquement : à confirmer.',
  },
  {
    id: 'tp', tax: 'TP', label: 'Taxe professionnelle', effectiveFrom: null, effectiveTo: null, status: 'user_defined',
    source: null, note: 'Taux, base (valeur locative) et exonérations saisis par l’utilisateur : aucun taux n’est fourni par l’outil.',
  },
  {
    id: 'tsc', tax: 'TSC', label: 'Taxe de services communaux', effectiveFrom: null, effectiveTo: null, status: 'user_defined',
    source: null, note: 'Taux et base saisis par l’utilisateur : aucun taux n’est fourni par l’outil.',
  },
  {
    id: 'de', tax: 'DE', label: 'Droits d’enregistrement et taxes locales', effectiveFrom: null, effectiveTo: null, status: 'user_defined',
    source: null, note: 'Montants ou taux saisis par l’utilisateur.',
  },
  {
    id: 'ras-dividendes', tax: 'RAS', label: 'Retenue à la source sur dividendes : 12,5 % (distributions 2025), 11,25 % (2026), 10 % (à compter de 2027)',
    effectiveFrom: '2025-01-01', effectiveTo: null, status: 'verified_official',
    source: { ...CGI_2026, reference: 'Art. 19-IV-B et 247-XXXVII-C', line: '1735–1740 ; 16998–17004' },
    note: 'Mode « taux légal » : taux à la date de distribution. Les cas d’exonération ou de taux conventionnel (associés personnes morales, non-résidents) ne sont pas déterminés : choisir un taux saisi. Versée pour le compte des associés, sans effet sur le résultat de la société.',
  },
  {
    id: 'ras-19-iv-a', tax: 'RAS', label: 'Retenue de 5 % sur les prestations et loyers versés par l’État, les établissements publics, les banques, les assurances et les entreprises dont le CA ≥ 200 MMAD',
    effectiveFrom: null, effectiveTo: null, status: 'not_covered',
    source: { ...CGI_2026, reference: 'Art. 19-IV-A, 15 bis et 15 ter', line: '1724–1733' },
    note: 'Non modélisée : dépend de la nature des clients de l’entreprise.',
  },
  {
    id: 'ras-autres', tax: 'RAS', label: 'Autres retenues à la source (TVA art. 117-V, loyers, honoraires)', effectiveFrom: null, effectiveTo: null, status: 'not_covered',
    source: { ...CGI_2026, reference: 'Art. 117-V', line: '7210–7238' },
    note: 'Non modélisées : liste réglementaire des services non récupérée.',
  },
];

export function ruleById(id: string): RuleDescriptor | undefined {
  return RULES.find((r) => r.id === id);
}

// ─── IS ──────────────────────────────────────────────────────────────────────────────────────────

export type IsRateResolution = { ratePct: number; ruleId: string; status: RuleStatus; detail: string };

/**
 * IS rate (whole-profit rate of the band) for a fiscal year that opened in `fiscalYear`.
 * Years before 2023 are outside the catalogue and need a user override.
 */
export function resolveIsRate(taxable: number, fiscalYear: number, category: IsCategory): IsRateResolution | null {
  if (taxable <= 0) return { ratePct: 0, ruleId: fiscalYear >= 2026 ? 'is-2026' : 'is-2023-2025', status: 'verified_official', detail: 'Bénéfice fiscal nul ou négatif' };
  const big = taxable >= 100_000_000;
  if (fiscalYear >= 2026) {
    const status: RuleStatus = fiscalYear > LAST_VERIFIED_FISCAL_YEAR ? 'assumed_unchanged' : 'verified_official';
    if (category === 'credit_insurance') return { ratePct: 40, ruleId: 'is-2026', status, detail: 'Établissements de crédit et assurances' };
    return { ratePct: big ? 35 : 20, ruleId: 'is-2026', status, detail: big ? 'Bénéfice ≥ 100 MMAD' : 'Taux normal' };
  }
  if (fiscalYear < 2023) return null;
  const k = fiscalYear - 2023;
  const pick = (values: [number, number, number]) => values[k];
  let ratePct: number;
  let detail: string;
  if (category === 'credit_insurance') {
    ratePct = pick([37.75, 38.5, 39.25]);
    detail = 'Crédit et assurances';
  } else if (category === 'zai_cfc') {
    ratePct = pick([16.25, 17.5, 18.75]);
    detail = 'ZAI / CFC';
  } else if (taxable <= 300_000) {
    ratePct = pick([12.5, 15, 17.5]);
    detail = 'Bénéfice ≤ 300 000 MAD';
  } else if (category === 'former_20pct_sector') {
    ratePct = big ? pick([23.75, 27.5, 31.25]) : 20;
    detail = big ? 'Anciens secteurs à 20 % (art. 6), bénéfice ≥ 100 MMAD' : 'Anciens secteurs à 20 % (art. 6), bénéfice < 100 MMAD';
  } else if (category === 'industrial' && !big) {
    ratePct = pick([24.5, 23, 21.5]);
    detail = 'Industriel, bénéfice < 100 MMAD';
  } else if (taxable <= 1_000_000) {
    ratePct = 20;
    detail = 'Bénéfice 300 001 – 1 000 000 MAD';
  } else if (big) {
    ratePct = pick([32, 33, 34]);
    detail = 'Bénéfice ≥ 100 MMAD';
  } else {
    ratePct = pick([28.25, 25.5, 22.75]);
    detail = 'Bénéfice 1 – 100 MMAD';
  }
  return { ratePct, ruleId: 'is-2023-2025', status: 'verified_official', detail };
}

/** Minimum contribution rate for a fiscal year (art. 144-I-D). */
export function minimumContributionRatePct(fiscalYear: number): { ratePct: number; status: RuleStatus } {
  if (fiscalYear < 2023) return { ratePct: 0.5, status: 'convention' };
  return { ratePct: 0.25, status: fiscalYear > LAST_VERIFIED_FISCAL_YEAR ? 'assumed_unchanged' : 'verified_official' };
}

/** Art. 10-III-C-1° coefficients by useful life. */
export function legalDecliningCoefficient(usefulLifeYears: number): number | null {
  if (usefulLifeYears >= 3 && usefulLifeYears <= 4) return 1.5;
  if (usefulLifeYears >= 5 && usefulLifeYears <= 6) return 2;
  if (usefulLifeYears > 6) return 3;
  return null;
}

export const MINIMUM_CONTRIBUTION_FLOOR_IS = 3000;
export const MINIMUM_CONTRIBUTION_FLOOR_IR = 1500;

// ─── IR ──────────────────────────────────────────────────────────────────────────────────────────

const IR_ANNUAL_SCALE: ReadonlyArray<readonly [number, number]> = [
  [40_000, 0], [60_000, 0.1], [80_000, 0.2], [100_000, 0.3], [180_000, 0.34], [Number.POSITIVE_INFINITY, 0.37],
];

/** Annual IR on a taxable base in MAD (art. 73-I, income from 2025). */
export function irAnnual(base: number): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of IR_ANNUAL_SCALE) {
    if (base <= lower) break;
    tax += (Math.min(base, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

// ─── Payroll ─────────────────────────────────────────────────────────────────────────────────────

export const CNSS_MONTHLY_CEILING = 6000;
export const CNSS_EMPLOYEE_RATE_PCT = 4.48;
export const CNSS_EMPLOYER_SOCIAL_RATE_PCT = 8.98;
export const CNSS_EMPLOYER_FAMILY_RATE_PCT = 6.4;
export const TFP_EMPLOYER_RATE_PCT = 1.6;
export const AMO_EMPLOYEE_RATE_PCT = 2.26;
export const AMO_EMPLOYER_RATE_PCT = 4.11;

export type MonthlyPayroll = {
  /** All values in MAD for one employee and one month. */
  gross: number; cnssEmployee: number; amoEmployee: number; professionalExpenses: number; taxableBase: number;
  familyReduction: number; ir: number; net: number; cnssEmployer: number; amoEmployer: number; tfpEmployer: number;
};

/**
 * One employee's month. Rounded to the centime per component, as on a payslip.
 * `calendarYear` selects the family reduction (from 2026).
 */
export function monthlyPayroll(gross: number, dependants: number, calendarYear: number): MonthlyPayroll {
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const g = Math.max(0, gross);
  const capped = Math.min(g, CNSS_MONTHLY_CEILING);
  const cnssEmployee = r2((capped * CNSS_EMPLOYEE_RATE_PCT) / 100);
  const amoEmployee = r2((g * AMO_EMPLOYEE_RATE_PCT) / 100);
  const professionalExpenses = g * 12 <= 78_000 ? r2(g * 0.35) : r2(Math.min(g * 0.25, 35_000 / 12));
  const taxableBase = r2(Math.max(0, g - cnssEmployee - amoEmployee - professionalExpenses));
  const familyReduction = calendarYear >= 2026 ? r2(Math.min(Math.max(0, dependants) * 600, 3600) / 12) : 0;
  const ir = r2(Math.max(0, irAnnual(taxableBase * 12) / 12 - familyReduction));
  const net = r2(g - cnssEmployee - amoEmployee - ir);
  const cnssEmployer = r2((capped * CNSS_EMPLOYER_SOCIAL_RATE_PCT + g * CNSS_EMPLOYER_FAMILY_RATE_PCT) / 100);
  const amoEmployer = r2((g * AMO_EMPLOYER_RATE_PCT) / 100);
  const tfpEmployer = r2((g * TFP_EMPLOYER_RATE_PCT) / 100);
  return { gross: g, cnssEmployee, amoEmployee, professionalExpenses, taxableBase, familyReduction, ir, net, cnssEmployer, amoEmployer, tfpEmployer };
}

// ─── VAT ─────────────────────────────────────────────────────────────────────────────────────────

/** VAT rates legal on a date (art. 99; 247-XXXXI for 2024–2025). */
export function legalVatRates(date: string): number[] {
  if (date >= '2026-01-01') return [0, 10, 20];
  if (date >= '2025-01-01') return [0, 9, 10, 12, 15, 18, 20];
  if (date >= '2024-01-01') return [0, 8, 10, 11, 12, 13, 16, 20];
  return [0, 7, 10, 14, 20];
}

export function isLegalVatRate(ratePct: number, date: string): boolean {
  return legalVatRates(date).some((r) => Math.abs(r - ratePct) < 1e-9);
}

/** Months between the end of a quarter whose declaration shows the credit and the refund (art. 103 bis): filing in the following month, payment within 30 days. */
export const VAT_INVESTMENT_REFUND_LAG_MONTHS = 2;

// ─── Withholding ─────────────────────────────────────────────────────────────────────────────────

/** Withholding rate on dividends distributed on `date` (art. 19-IV-B; transitional art. 247-XXXVII-C). Null before 2025. */
export function legalDividendWithholdingPct(date: string): { ratePct: number; status: RuleStatus } | null {
  if (date < '2025-01-01') return null;
  if (date < '2026-01-01') return { ratePct: 12.5, status: 'verified_official' };
  if (date < '2027-01-01') return { ratePct: 11.25, status: 'verified_official' };
  return { ratePct: 10, status: Number(date.slice(0, 4)) > LAST_VERIFIED_FISCAL_YEAR + 1 ? 'assumed_unchanged' : 'verified_official' };
}
