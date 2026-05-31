export type AtlasDocumentProcessingStatus = 'uploading' | 'uploaded' | 'processing' | 'processed' | 'failed';

export type AtlasDocument = {
  id: string;
  companyId?: string | null;

  /** Document category: juridique, rh, facture, ocr, etc. */
  type: string;
  title: string;

  /** Arbitrary content (text or structured JSON). */
  content?: unknown;

  kind: string;
  source: string;
  status: string;

  /** Sprint D-alt — file + OCR lifecycle */
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  storagePath?: string;
  extractedText?: string;
  processingStatus?: AtlasDocumentProcessingStatus;

  metadata?: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
};

export type AtlasOcrError = {
  step: string;
  message: string;
  code: string;
};

export type AtlasOcrExtraction = {
  numero_facture?: string;
  date?: string;
  fournisseur?: string;
  montant_ht?: number;
  taux_tva?: number;
  montant_tva?: number;
  montant_ttc?: number;
  description?: string;
  error?: AtlasOcrError;
};

export type AtlasOcrPageMeta = {
  page_number: number;
  rendered_image_size: number;
  rendered_image_mime_type: string;
  success: boolean;
  error?: AtlasOcrError;
  extraction?: AtlasOcrExtraction;
};

export type AtlasOcrDetectedInvoiceStatus = 'detected' | 'needs_review' | 'no_invoice_detected';

export type AtlasOcrDetectedInvoice = {
  page_number: number;
  source_pages?: number[];
  invoice_number?: string;
  supplier_name?: string;
  invoice_date?: string;
  amount_ht?: number;
  vat_amount?: number;
  amount_ttc?: number;
  vat_rate?: number;
  status: AtlasOcrDetectedInvoiceStatus;
  confidence?: number;
};
