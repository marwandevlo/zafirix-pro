import { trackEvent } from '@/app/lib/analytics-track';
import { listAtlasCompanies } from '@/app/lib/atlas-companies-repository';
import { listAtlasInvoices } from '@/app/lib/atlas-invoices-repository';
import { supabase } from '@/app/lib/supabase';

const LANDED_KEY = 'atlas_first_session_landed_v1';
let landingInflight = false;

/** Once per browser session, on the first authenticated view of `/` or `/factures`. */
export function trackInitialAuthenticatedLanding(): void {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(LANDED_KEY) || landingInflight) return;
  } catch {
    return;
  }
  landingInflight = true;

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      if (sessionStorage.getItem(LANDED_KEY)) return;
      const [companies, invoices] = await Promise.all([
        listAtlasCompanies().catch(() => []),
        listAtlasInvoices().catch(() => []),
      ]);
      sessionStorage.setItem(LANDED_KEY, '1');
      trackEvent('first_session_landed', {
        has_company: companies.length > 0,
        has_invoice: invoices.length > 0,
      });
    } catch (error) {
      console.warn('[activation] first_session_landed failed', error instanceof Error ? error.message : error);
    } finally {
      landingInflight = false;
    }
  })();
}
