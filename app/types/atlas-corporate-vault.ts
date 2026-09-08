/** Coffre-fort numérique — dossiers légaux & fiscaux (dynamic slug IDs). */

export type CorporateVaultFolderId = string;

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
