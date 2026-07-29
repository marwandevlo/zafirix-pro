export type SmartGeneratorDocType = 'facture' | 'devis' | 'bon_commande' | 'autre';

/** Manual / custom header — used when no DB company is selected. */
export type SmartGeneratorHeader = {
  raisonSociale?: string;
  ice?: string;
  if_fiscal?: string;
  rc?: string;
  patent?: string;
  cnss?: string;
  capitalSocial?: string;
  adresse?: string;
  ville?: string;
  telephone?: string;
  fax?: string;
  email?: string;
  logoUrl?: string;
  /** Base64 data URL or raw base64 for logo image */
  logoBase64?: string;
  logoMimeType?: string;
  /** Base64-encoded custom header PDF template (first page used as background) */
  headerPdfBase64?: string;
};

/** Branding assets passed to PDF export */
export type SmartGeneratorBrandingAssets = {
  logoBase64?: string;
  logoMimeType?: string;
  headerPdfBase64?: string;
};

/** Explicit item row — takes priority over LLM prompt when filled. */
export type SmartGeneratorItemSpec = {
  reference?: string;
  category?: string;
  designation: string;
  quantity: number;
  unit: string;
  unitPriceHT?: number;
  unitPriceMin?: number;
  unitPriceMax?: number;
  vatRatePercent?: number;
  pcgeAccount?: string;
};

export type SmartGeneratorParams = {
  dateDebut: string;
  dateFin: string;
  numeroDebut: number;
  numeroFin: number;
  montantMaxParDocument: number;
  documentCount?: number;
  defaultClientName?: string;
};

export type SmartGeneratorLineItem = {
  reference?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceHT: number;
  vatRatePercent: number;
  pcgeAccount?: string;
  category?: string;
  amountHT: number;
  vatAmount: number;
  totalTTC: number;
};

export type SmartGeneratorDocument = {
  docType: SmartGeneratorDocType;
  docTitle: string;
  customDocTitle?: string;
  number: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  lines: SmartGeneratorLineItem[];
  amountHT: number;
  vatAmount: number;
  totalTTC: number;
  vatRatePercent: number;
  status: 'draft';
  metadata: Record<string, unknown>;
};

export type SmartGeneratorResult = {
  documents: Array<SmartGeneratorDocument & { id?: string }>;
  summary: {
    count: number;
    totalHT: number;
    totalTVA: number;
    totalTTC: number;
  };
  provider: string;
  persisted: boolean;
};

export type SmartGeneratorGenerateRequest = {
  companyId?: string | null;
  customHeader?: SmartGeneratorHeader | null;
  brandingAssets?: SmartGeneratorBrandingAssets | null;
  prompt: string;
  docType: SmartGeneratorDocType;
  customDocTitle?: string;
  params: SmartGeneratorParams;
  itemSpecs?: SmartGeneratorItemSpec[];
  language?: 'fr' | 'ar' | 'darija';
  persistToDb?: boolean;
};
