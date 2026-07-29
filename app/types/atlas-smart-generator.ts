export type SmartGeneratorDocType = 'facture' | 'devis' | 'bon_commande';

export type SmartGeneratorParams = {
  dateDebut: string;
  dateFin: string;
  numeroDebut: number;
  numeroFin: number;
  montantMaxParDocument: number;
};

export type SmartGeneratorLineItem = {
  description: string;
  quantity: number;
  unitPriceHT: number;
  vatRatePercent: number;
  pcgeAccount?: string;
  amountHT: number;
  vatAmount: number;
  totalTTC: number;
};

export type SmartGeneratorDocument = {
  docType: SmartGeneratorDocType;
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
};

export type SmartGeneratorGenerateRequest = {
  companyId: string;
  prompt: string;
  docType: SmartGeneratorDocType;
  params: SmartGeneratorParams;
  language?: 'fr' | 'ar' | 'darija';
};
