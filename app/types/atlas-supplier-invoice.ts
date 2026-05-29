import type { AtlasPaymentTerms } from '@/app/types/atlas-payment-terms';

export type AtlasSupplierInvoiceStatus = 'unpaid' | 'paid' | 'needs_review';

export type AtlasSupplierInvoice = {
  /** Local demo uses number; Supabase uses UUID string. */
  id: number | string;
  companyId?: string;
  documentId?: string;
  supplierName: string;
  invoiceNumber?: string;
  issueDate: string; // YYYY-MM-DD
  paymentTerms: AtlasPaymentTerms;
  dueDate: string; // YYYY-MM-DD
  status: AtlasSupplierInvoiceStatus;

  amountHT?: number;
  vatAmount?: number;
  totalTTC?: number;
  vatRate?: number;

  paidAt?: string;
  paidAmount?: number;

  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};
