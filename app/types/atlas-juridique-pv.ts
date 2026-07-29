/** Tribunal de Commerce — procès-verbaux d'assemblée (AGO / AGE). */

export type MoroccanCompanyForm = 'SARL' | 'SA';

export type PvAssemblyType = 'ago' | 'age';

/** Identifiants légaux marocains obligatoires sur les PV déposés au greffe. */
export type MoroccanLegalIdentifiers = {
  raisonSociale: string;
  formeJuridique: MoroccanCompanyForm;
  rc: string;
  ice: string;
  ifFiscal: string;
  capitalSocial: string;
  siegeSocial: string;
  tribunalCommerce: string;
  ville: string;
};

export type PvAgoInput = {
  company: MoroccanLegalIdentifiers;
  dateAssemblee: string;
  exercice: string;
  resultatNet: string;
  affectation: string;
  dirigeant: string;
  /** Associés / actionnaires présents (optionnel). */
  participants?: string;
  lieu?: string;
};

export type PvAgeResolutionType =
  | 'modification_statuts'
  | 'augmentation_capital'
  | 'reduction_capital'
  | 'cession_parts'
  | 'transfert_siege'
  | 'changement_denomination'
  | 'autre';

export type PvAgeInput = {
  company: MoroccanLegalIdentifiers;
  dateAssemblee: string;
  ordreDuJour: string;
  resolutions: string;
  resolutionType: PvAgeResolutionType;
  dirigeant: string;
  participants?: string;
  lieu?: string;
  /** Cession de parts — cédant / cessionnaire (optionnel). */
  cedant?: string;
  cessionnaire?: string;
  nombreParts?: string;
  prixCession?: string;
  /** Modification capital (optionnel). */
  capitalActuel?: string;
  capitalNouveau?: string;
};

export type GeneratedPvDocument = {
  title: string;
  content: string;
  assemblyType: PvAssemblyType;
  procedureId: string;
  generatedAt: string;
};
