import type { AtlasPaymentTerms } from '@/app/types/atlas-payment-terms';

/**
 * Canonical client shape: persisted in Supabase `public.atlas_clients` when backend is supabase.
 */
export type AtlasClient = {
  /** Local demo uses number; Supabase uses UUID string from DB. */
  id: number | string;
  /** Supabase `atlas_clients.company_id` when scoped to active company. */
  companyId?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;

  /** Contractual payment terms for invoices (used to auto-calculate due date). */
  paymentTerms: AtlasPaymentTerms;

  /**
   * Current balance in MAD.
   * Positive = client owes you, negative = you owe client (credit note / advance).
   */
  balance: number;

  createdAt: string;
  updatedAt: string;
};
