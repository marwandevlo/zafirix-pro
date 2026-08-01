export type AtlasDocumentProcessingStatus = 'uploading' | 'uploaded' | 'processing' | 'processed' | 'failed';

export type AtlasDocumentValidationStatus = 'pending_review' | 'validated' | 'rejected' | 'needs_correction';

export type AtlasDocumentType =
  | 'purchase_invoice'
  | 'sales_invoice'
  | 'receipt'
  | 'bank_statement'
  | 'payroll_slip'
  | 'cnss_document'
  | 'tax_declaration'
  | 'vat_declaration'
  | 'legal_contract'
  | 'company_statutes'
  | 'legal_notice'
  | 'hr_document'
  | 'accounting_document'
  | 'unknown';

export type AtlasDocumentClassification = {
  detected_type: AtlasDocumentType;
  type_confidence: number;
  classification_reason: string;
  possible_types: AtlasDocumentType[];
  detected_language: string;
  detected_country: string;
  detected_currency: string;
};

export type AtlasExtractedField = {
  value: string | number | null;
  confidence: number;
  source_page?: number;
  raw_value?: string;
  normalized_value?: string;
  user_verified?: boolean;
  user_corrected_value?: string;
};

export type AtlasInvoiceLineItem = {
  description: string;
  quantity?: number;
  unit_price?: number;
  total_ht?: number;
  tva_rate?: number;
};

export type AtlasStructuredExtraction = {
  // Invoice fields
  supplier_name?: AtlasExtractedField;
  supplier_ice?: AtlasExtractedField;
  supplier_if?: AtlasExtractedField;
  supplier_rc?: AtlasExtractedField;
  supplier_patente?: AtlasExtractedField;
  supplier_address?: AtlasExtractedField;
  /** Strict DB-ready Moroccan supplier identifiers extracted from the invoice. */
  morocco_supplier_ids?: {
    ice: string | null;
    if: string | null;
    rc: string | null;
    patente: string | null;
  };
  customer_name?: AtlasExtractedField;
  customer_ice?: AtlasExtractedField;
  invoice_number?: AtlasExtractedField;
  invoice_date?: AtlasExtractedField;
  due_date?: AtlasExtractedField;
  currency?: AtlasExtractedField;
  subtotal_ht?: AtlasExtractedField;
  tva_amount?: AtlasExtractedField;
  total_ttc?: AtlasExtractedField;
  tva_rate?: AtlasExtractedField;
  payment_method?: AtlasExtractedField;
  line_items?: AtlasInvoiceLineItem[];
  category_suggestion?: AtlasExtractedField;
  accounting_account?: AtlasExtractedField;
  is_purchase?: AtlasExtractedField;
  // Bank statement fields
  bank_name?: AtlasExtractedField;
  account_number?: AtlasExtractedField;
  statement_period?: AtlasExtractedField;
  opening_balance?: AtlasExtractedField;
  closing_balance?: AtlasExtractedField;
  // Payroll fields
  employee_name?: AtlasExtractedField;
  period?: AtlasExtractedField;
  gross_salary?: AtlasExtractedField;
  net_salary?: AtlasExtractedField;
  cnss_amount?: AtlasExtractedField;
  ir_amount?: AtlasExtractedField;
};

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

  /** Documents IA central engine */
  documentType?: AtlasDocumentType;
  validationStatus?: AtlasDocumentValidationStatus;
  sha256Hash?: string;
  validatedAt?: string;
  validatedBy?: string;

  metadata?: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
};

export type AtlasOcrError = {
  step: string;
  message: string;
  code: string;
  /** Raw JS error message for server-side diagnostics (not shown in UI). */
  raw_error?: string;
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
