/**
 * Client-side workspace generation token — invalidates in-flight fetches after company switch.
 */

import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';

let companyWorkspaceGeneration = 0;
let clientActiveCompanyId: string | null = null;

/** In-memory fetch memo keyed by `${companyId}:${generation}:${url}` — cleared on every switch. */
const companyFetchCache = new Map<string, unknown>();

export function setClientActiveCompanyId(companyId: string | null): void {
  clientActiveCompanyId = companyId?.trim() || null;
}

export function getClientActiveCompanyId(): string | null {
  return clientActiveCompanyId;
}

export function bumpCompanyWorkspaceGeneration(): number {
  companyWorkspaceGeneration += 1;
  return companyWorkspaceGeneration;
}

export function getCompanyWorkspaceGeneration(): number {
  return companyWorkspaceGeneration;
}

export function isCurrentCompanyWorkspaceGeneration(token: number): boolean {
  return token === companyWorkspaceGeneration;
}

export function clearCompanyScopedFetchCache(): void {
  companyFetchCache.clear();
}

/** Drop cached document workspace data when the active company changes. */
export function purgeDocumentWorkspaceClientCache(_previousCompanyId?: string | null): void {
  bumpCompanyWorkspaceGeneration();
  clearCompanyScopedFetchCache();

  if (typeof window === 'undefined') return;

  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith('atlas:documents:') || key.startsWith('atlas:invoices:') || key.startsWith('atlas:ocr:'))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }

  if (!isAtlasSupabaseDataEnabled()) {
    try {
      localStorage.removeItem(ATLAS_STORAGE_KEYS.documents);
      localStorage.removeItem(ATLAS_STORAGE_KEYS.supplierInvoices);
      localStorage.removeItem(ATLAS_STORAGE_KEYS.invoices);
    } catch {
      /* ignore */
    }
  }
}

export function filterDocumentsForCompany<T extends { companyId?: string | null }>(
  rows: T[],
  companyId: string | null | undefined,
): T[] {
  if (!companyId) return [];
  return rows.filter((row) => row.companyId === companyId);
}

export function companyFetchCacheKey(companyId: string | null | undefined, url: string): string {
  return `${companyId ?? 'none'}:${getCompanyWorkspaceGeneration()}:${url}`;
}

/** Fetch with no HTTP cache and company id in cache key namespace (generation-busted on switch). */
export async function companyScopedFetch(
  companyId: string | null | undefined,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const scope = getCompanyWorkspaceGeneration();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  const response = await fetch(input, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init?.headers ?? {}),
      'Cache-Control': 'no-store',
      'X-Atlas-Company-Id': companyId ?? '',
    },
  });

  if (!isCurrentCompanyWorkspaceGeneration(scope)) {
    throw new DOMException('Company workspace changed during fetch', 'AbortError');
  }

  return response;
}

export function readCompanyFetchCache<T>(companyId: string | null | undefined, url: string): T | undefined {
  return companyFetchCache.get(companyFetchCacheKey(companyId, url)) as T | undefined;
}

export function writeCompanyFetchCache<T>(companyId: string | null | undefined, url: string, value: T): void {
  companyFetchCache.set(companyFetchCacheKey(companyId, url), value);
}

export function invalidateCompanyFetchCache(companyId: string | null | undefined, url?: string): void {
  if (!url) {
    const prefix = `${companyId ?? 'none'}:`;
    for (const key of companyFetchCache.keys()) {
      if (key.startsWith(prefix)) companyFetchCache.delete(key);
    }
    return;
  }
  companyFetchCache.delete(companyFetchCacheKey(companyId, url));
}
