import type { AtlasDocumentType } from '@/app/types/atlas-document';

const BANK_STATEMENT_TYPES = new Set<AtlasDocumentType>(['bank_statement']);
const INVOICE_TYPES = new Set<AtlasDocumentType>([
  'purchase_invoice',
  'sales_invoice',
  'receipt',
]);

export function isBankStatementType(type: AtlasDocumentType | null | undefined): boolean {
  return type != null && BANK_STATEMENT_TYPES.has(type);
}

export function isInvoiceDocumentType(type: AtlasDocumentType | null | undefined): boolean {
  if (!type) return true;
  if (BANK_STATEMENT_TYPES.has(type)) return false;
  if (INVOICE_TYPES.has(type)) return true;
  return !['payroll_slip', 'cnss_document', 'tax_declaration', 'vat_declaration'].includes(type);
}

export function normalizeDocumentTypeAlias(type: string | null | undefined): AtlasDocumentType | null {
  if (!type) return null;
  const key = type.trim().toLowerCase();
  if (key === 'facture' || key === 'invoice' || key === 'purchase_invoice') return 'purchase_invoice';
  if (key === 'releve_bancaire' || key === 'bank_statement') return 'bank_statement';
  return type as AtlasDocumentType;
}

export const INVOICE_EXTRACTION_FIELD_KEYS = new Set([
  'supplier_name',
  'supplier_ice',
  'supplier_if',
  'supplier_rc',
  'supplier_patente',
  'customer_name',
  'invoice_number',
  'invoice_date',
  'due_date',
  'subtotal_ht',
  'tva_rate',
  'tva_amount',
  'total_ttc',
  'payment_method',
  'category_suggestion',
]);

export const BANK_EXTRACTION_FIELD_KEYS = new Set([
  'bank_name',
  'account_number',
  'statement_period',
  'opening_balance',
  'closing_balance',
]);

export function extractionFieldKeysForType(type: AtlasDocumentType | null | undefined): Set<string> | null {
  if (isBankStatementType(type)) return BANK_EXTRACTION_FIELD_KEYS;
  if (isInvoiceDocumentType(type)) return INVOICE_EXTRACTION_FIELD_KEYS;
  return null;
}
