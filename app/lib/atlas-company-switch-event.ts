import { purgeDocumentWorkspaceClientCache, setClientActiveCompanyId } from '@/app/lib/atlas-company-client-cache';

/** Cross-module company switch event — dispatched when the active workspace company changes. */
export const ATLAS_COMPANY_SWITCHED_EVENT = 'atlas:company-switched';

export type CompanySwitchedDetail = { companyId: string | null };

/** Central entry: purge caches, sync client company id, broadcast to all listeners. */
export function notifyCompanyWorkspaceSwitched(
  nextCompanyId: string | null,
  previousCompanyId?: string | null,
): void {
  if (typeof window === 'undefined') return;

  purgeDocumentWorkspaceClientCache(previousCompanyId ?? undefined);
  setClientActiveCompanyId(nextCompanyId);

  window.dispatchEvent(
    new CustomEvent<CompanySwitchedDetail>(ATLAS_COMPANY_SWITCHED_EVENT, {
      detail: { companyId: nextCompanyId },
    }),
  );
}

export function onCompanySwitched(handler: (companyId: string | null) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<CompanySwitchedDetail>).detail;
    handler(detail?.companyId ?? null);
  };
  window.addEventListener(ATLAS_COMPANY_SWITCHED_EVENT, listener);
  return () => window.removeEventListener(ATLAS_COMPANY_SWITCHED_EVENT, listener);
}
