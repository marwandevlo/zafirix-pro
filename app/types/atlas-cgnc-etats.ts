/** CGNC états de synthèse (Modèle Normal / Simplifié) + CGI tableau de passage. */

export type CgncModele = 'normal' | 'simplifie';

export type CgncJournalLine = {
  compte: string;
  debit?: number;
  credit?: number;
  libelle?: string;
};

export type CgncAccountBalance = {
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
  /** Solde débiteur − solde créditeur (nature débit). */
  solde: number;
};

export type CgncBilanLine = {
  code: string;
  label: string;
  brut: number;
  amortProv: number;
  net: number;
};

export type CgncBilanMasse = {
  code: 'I' | 'II' | 'III';
  label: string;
  lines: CgncBilanLine[];
  totalBrut: number;
  totalAmortProv: number;
  totalNet: number;
};

export type CgncBilanSide = {
  masses: CgncBilanMasse[];
  totalBrut: number;
  totalAmortProv: number;
  totalNet: number;
};

export type CgncBilan = {
  modele: CgncModele;
  actif: CgncBilanSide;
  passif: CgncBilanSide;
  resultatNetInclus: number;
  resultatNetInjecte: boolean;
  equilibre: boolean;
  ecart: number;
};

export type CgncCpcLine = {
  code: string;
  label: string;
  montant: number;
};

export type CgncCpc = {
  modele: CgncModele;
  produitsExploitation: CgncCpcLine[];
  totalProduitsExploitation: number;
  chargesExploitation: CgncCpcLine[];
  totalChargesExploitation: number;
  resultatExploitation: number;
  produitsFinanciers: CgncCpcLine[];
  totalProduitsFinanciers: number;
  chargesFinancieres: CgncCpcLine[];
  totalChargesFinancieres: number;
  resultatFinancier: number;
  resultatCourant: number;
  produitsNonCourants: CgncCpcLine[];
  totalProduitsNonCourants: number;
  chargesNonCourantes: CgncCpcLine[];
  totalChargesNonCourantes: number;
  resultatNonCourant: number;
  resultatAvantImpots: number;
  impotsSurLesResultats: number;
  resultatNet: number;
};

export type CgncPassageLine = {
  code: string;
  label: string;
  montant: number;
  cgiRef: string;
};

export type CgncTableauPassage = {
  resultatNetComptable: number;
  reintegrations: CgncPassageLine[];
  totalReintegrations: number;
  deductions: CgncPassageLine[];
  totalDeductions: number;
  resultatFiscal: number;
};

export type CgncImpotSocietes = {
  chiffreAffairesHT: number;
  resultatFiscal: number;
  isCalcule: number;
  tauxApplique: string;
  cotisationMinimale: number;
  cotisationMinimaleTaux: string;
  cotisationMinimalePlancher: number;
  cotisationMinimaleAppliquee: boolean;
  impotDu: number;
  formuleVersion: string;
};

export type CgncConsistencyCheck = {
  id: string;
  ok: boolean;
  message: string;
  expected?: number;
  actual?: number;
};

export type CgncEtatsCompilation = {
  fiscalYear: number;
  journalEquilibre: boolean;
  totalDebit: number;
  totalCredit: number;
  balances: CgncAccountBalance[];
  bilanNormal: CgncBilan;
  bilanSimplifie: CgncBilan;
  cpcNormal: CgncCpc;
  cpcSimplifie: CgncCpc;
  tableauPassage: CgncTableauPassage;
  impotSocietes: CgncImpotSocietes;
  consistency: CgncConsistencyCheck[];
};

export type CgncCompileOptions = {
  fiscalYear?: number;
  deficitReportable?: number;
  reintegrationsManuelles?: CgncPassageLine[];
  deductionsManuelles?: CgncPassageLine[];
};
