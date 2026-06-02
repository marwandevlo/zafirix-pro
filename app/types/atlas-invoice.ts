import type { AtlasPaymentTerms } from '@/app/types/atlas-payment-terms';

export type AtlasInvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

export type AtlasInvoice = {
  /** Local demo uses number; Supabase uses UUID string. */
  id: number | string;
  number: string;
  clientName: string;
  issueDate: string; // YYYY-MM-DD
  paymentTerms: AtlasPaymentTerms;
  dueDate: string; // YYYY-MM-DD
  status: AtlasInvoiceStatus;

  amountHT: number;
  vatRate: number; // 0..1
  vatAmount: number;
  totalTTC: number;

  paidAt?: string;
  paidAmount?: number;

  /** Traceability: set when invoice was created from Documents IA */
  sourceDocumentId?: string | null;
  sourceDocumentType?: string | null;
  generatedBy?: string | null;
  validationStatus?: string | null;

  /** Raw DB row metadata (JSON column) */
  metadata?: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
};

