/**
 * Moroccan individual taxpayer modules — Auto-entrepreneur & Personne physique.
 * Amounts and rates are indicative compliance aids (expert-comptable validation required).
 */

export type IndividualProfileType = 'auto_entrepreneur' | 'personne_physique';
export type AeActivityType = 'services' | 'commerce' | 'industrie' | 'artisanat';
export type PpTaxRegime = 'rnr' | 'rns';
export type AeDeclarationStatus = 'pending' | 'declared' | 'paid' | 'late' | 'exempt';
export type PpLedgerEntryType = 'revenue' | 'expense';

export type AtlasIndividualProfile = {
  id: string;
  companyId: string;
  profileType: IndividualProfileType;
  activityType: AeActivityType;
  annualCeilingMad: number;
  taxRegime: PpTaxRegime;
  fiscalYear: number;
  displayName: string | null;
  iceOrIf: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AtlasAeTurnoverEntry = {
  id: string;
  companyId: string;
  entryDate: string;
  amountMad: number;
  label: string;
  clientName: string | null;
  invoiceRef: string | null;
  quarter: 1 | 2 | 3 | 4;
  fiscalYear: number;
  createdAt: string;
};

export type AtlasAeQuarterlyDeclaration = {
  id: string;
  companyId: string;
  fiscalYear: number;
  quarter: 1 | 2 | 3 | 4;
  declaredCaMad: number;
  taxDueMad: number;
  status: AeDeclarationStatus;
  dueDate: string | null;
  declaredAt: string | null;
  notes: string | null;
};

export type AtlasPpLedgerEntry = {
  id: string;
  companyId: string;
  entryType: PpLedgerEntryType;
  entryDate: string;
  amountMad: number;
  category: string;
  label: string;
  deductible: boolean;
  fiscalYear: number;
  documentRef: string | null;
  createdAt: string;
};

export type AeQuarterSummary = {
  quarter: 1 | 2 | 3 | 4;
  caMad: number;
  invoiceCount: number;
  declaration: AtlasAeQuarterlyDeclaration | null;
  dueDate: string;
  label: string;
};

export type AeComplianceStatus = 'conforme' | 'attention' | 'depassement' | 'declarations_en_retard';

export type AeDashboardPayload = {
  profile: AtlasIndividualProfile | null;
  fiscalYear: number;
  annualCaMad: number;
  annualCeilingMad: number;
  ceilingUsagePct: number;
  remainingCeilingMad: number;
  invoiceCount: number;
  currentQuarterCaMad: number;
  currentQuarter: 1 | 2 | 3 | 4;
  quarters: AeQuarterSummary[];
  complianceStatus: AeComplianceStatus;
  complianceLabel: string;
  indicativeTaxRatePct: number;
  indicativeAnnualTaxMad: number;
  entries: AtlasAeTurnoverEntry[];
};

export type PpDashboardPayload = {
  profile: AtlasIndividualProfile | null;
  fiscalYear: number;
  regime: PpTaxRegime;
  chiffreAffairesMad: number;
  chargesDeductiblesMad: number;
  chargesNonDeductiblesMad: number;
  beneficeNetImposableMad: number;
  indicativeIrMad: number;
  indicativeEffectiveRatePct: number;
  revenueCount: number;
  expenseCount: number;
  entries: AtlasPpLedgerEntry[];
};

export const AE_ACTIVITY_CEILINGS: Record<AeActivityType, number> = {
  services: 200_000,
  commerce: 500_000,
  industrie: 500_000,
  artisanat: 500_000,
};

export const AE_INDICATIVE_TAX_RATE: Record<AeActivityType, number> = {
  services: 0.01,
  commerce: 0.005,
  industrie: 0.005,
  artisanat: 0.005,
};

export const AE_ACTIVITY_LABELS: Record<AeActivityType, string> = {
  services: 'Prestations de services',
  commerce: 'Activité commerciale',
  industrie: 'Activité industrielle',
  artisanat: 'Activité artisanale',
};

export const PP_REGIME_LABELS: Record<PpTaxRegime, string> = {
  rnr: 'Résultat Net Réel (RNR)',
  rns: 'Résultat Net Simplifié (RNS)',
};

export const PP_EXPENSE_CATEGORIES: Record<string, string> = {
  loyer: 'Loyer professionnel',
  fournitures: 'Fournitures & consommables',
  deplacement: 'Déplacements & transport',
  telecom: 'Télécom & internet',
  honoraires: 'Honoraires & sous-traitance',
  amortissement: 'Amortissements',
  assurance: 'Assurances professionnelles',
  formation: 'Formation',
  divers: 'Charges diverses',
};

export const PP_REVENUE_CATEGORIES: Record<string, string> = {
  honoraires: 'Honoraires / prestations',
  ventes: 'Ventes de biens',
  commissions: 'Commissions',
  autres: 'Autres produits',
};

export const AE_DECLARATION_STATUS_LABELS: Record<AeDeclarationStatus, string> = {
  pending: 'À déclarer',
  declared: 'Déclaré',
  paid: 'Payé',
  late: 'En retard',
  exempt: 'Néant / exonéré',
};
