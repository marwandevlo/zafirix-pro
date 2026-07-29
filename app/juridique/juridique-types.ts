export type JuridiqueCompany = {
  id: number | string;
  dbRowId?: string;
  raisonSociale: string;
  formeJuridique: string;
  if_fiscal: string;
  ice: string;
  rc: string;
  cnss: string;
  adresse: string;
  ville: string;
  telephone: string;
  email: string;
  activite: string;
  capitalSocial?: string;
};

export type LegalProcedureField = {
  key: string;
  label: string;
  placeholder?: string;
};

export type LegalProcedure = {
  id: string;
  category: string;
  name: string;
  description: string;
  fields: LegalProcedureField[];
  /** Shown in UI — workflow IA disponible mais à valider / formalités RC manuelles */
  stabilizing?: boolean;
  /** Optional extra instructions for the juridique AI agent */
  promptHint?: string;
};
