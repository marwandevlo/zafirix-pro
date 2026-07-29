/** Coffre-fort numérique — dossiers légaux & fiscaux standardisés. */

export type CorporateVaultFolderId =
  | 'statuts_kbis'
  | 'proces_verbaux'
  | 'contrats_bail'
  | 'fichiers_fiscaux'
  | 'registres_legaux';

export type CorporateVaultFolder = {
  id: CorporateVaultFolderId;
  labelFr: string;
  labelAr: string;
  descriptionFr: string;
  icon: string;
  documentTypes: string[];
  tags: string[];
};

export type VaultDocumentItem = {
  id: string;
  title: string;
  filename?: string;
  folderId: CorporateVaultFolderId;
  tags: string[];
  mimeType?: string;
  createdAt: string;
  companyId: string | null;
  processingStatus?: string;
  searchText: string;
};

export type VaultSearchResult = {
  companyId: string;
  folders: CorporateVaultFolder[];
  documents: VaultDocumentItem[];
  total: number;
  query: string;
};
