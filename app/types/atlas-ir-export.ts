/** État 9421 — Annuel des traitements et salaires (DGI SIMPL-IR). */

export type Etat9421EmployeeLine = {
  employeeId: string;
  nom: string;
  cin?: string;
  cnssMatricule?: string;
  moisPayes: number;
  salaireBrutAnnuel: number;
  cnssSalarialAnnuel: number;
  amoSalarialAnnuel: number;
  irAnnuel: number;
  salaireNetAnnuel: number;
  cnssPatronalAnnuel: number;
  amoPatronalAnnuel: number;
};

export type Etat9421Totals = {
  nombreEmployes: number;
  totalBrut: number;
  totalCnssSalarial: number;
  totalAmoSalarial: number;
  totalIr: number;
  totalNet: number;
  totalCnssPatronal: number;
  totalAmoPatronal: number;
  moisCouverts: number;
};

export type Etat9421Data = {
  fiscalYear: number;
  identifiantFiscal: string;
  ice: string;
  raisonSociale: string;
  cnssEmployeur?: string;
  periodeDu: string;
  periodeAu: string;
  formulaVersion: string;
  employees: Etat9421EmployeeLine[];
  totals: Etat9421Totals;
};

export type Etat9421ExportValidation = {
  ok: boolean;
  error?: string;
  message?: string;
};
