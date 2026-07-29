/**
 * Canonical company shape: persisted in Supabase `atlas_companies` columns + `company_json` for extended fields.
 */
import type { AtlasPaymentTerms } from '@/app/types/atlas-payment-terms';

export type AtlasCompany = {
  /** Local demo: number. Supabase: prefer `dbRowId` for row identity; `id` may mirror row UUID or legacy numeric. */
  id: number | string;
  /** `atlas_companies.id` when loaded from Supabase (omit for new local-only rows). */
  dbRowId?: string;
  raisonSociale: string;
  formeJuridique: string;
  if_fiscal: string;
  ice: string;
  rc: string;
  cnss: string;
  adresse: string;
  ville: string;
  telephone: string;
  email: string;
  activite: string;
  regimeTVA: string;
  actif: boolean;

  /** Default payment terms for invoices emitted by this company. */
  paymentTerms?: AtlasPaymentTerms;

  /** Current balance snapshot (MAD). */
  balance?: number;

  /** Phase 14 — enterprise registry (columns + company_json). */
  legalName?: string;
  tradeName?: string;
  country?: string;
  website?: string;
  logoUrl?: string;
  status?: 'active' | 'inactive' | 'archived';
  workspaceId?: string | null;

  /** Client portal access code (stored in company_json). */
  clientPortalCode?: string;
};
