/** Cross-module company switch event — dispatched by CompanySwitcher. */
export const ATLAS_COMPANY_SWITCHED_EVENT = 'atlas:company-switched';

export type CompanySwitchedDetail = { companyId: string | null };

export function onCompanySwitched(handler: (companyId: string | null) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<CompanySwitchedDetail>).detail;
    handler(detail?.companyId ?? null);
  };
  window.addEventListener(ATLAS_COMPANY_SWITCHED_EVENT, listener);
  return () => window.removeEventListener(ATLAS_COMPANY_SWITCHED_EVENT, listener);
}
