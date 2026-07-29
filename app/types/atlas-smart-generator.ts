export type SmartGeneratorDocType = 'facture' | 'devis' | 'bon_commande' | 'autre';

/** Manual / custom header — used when no DB company is selected. */
export type SmartGeneratorHeader = {
  raisonSociale?: string;
  ice?: string;
  if_fiscal?: string;
  rc?: string;
  adresse?: string;
  ville?: string;
  patent?: string;
  logoUrl?: string;
};

/** Explicit item row — takes priority over LLM prompt when filled. */
export type SmartGeneratorItemSpec = {
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
  /** Exact number of documents to produce (optional). */
  documentCount?: number;
  defaultClientName?: string;
};

export type SmartGeneratorLineItem = {
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
  /** Display title on PDF/Excel (preset label or custom). */
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
  prompt: string;
  docType: SmartGeneratorDocType;
  customDocTitle?: string;
  params: SmartGeneratorParams;
  itemSpecs?: SmartGeneratorItemSpec[];
  language?: 'fr' | 'ar' | 'darija';
  persistToDb?: boolean;
};
