/**
 * Shared client fetch for /api/dashboard/deadlines.
 * Deduplicates concurrent requests and caches briefly so dashboard widgets
 * (home KPI + DeadlineRadar + LegalCalendar) do not triple-hit the API.
 */

export type DashboardDeadlinesCounts = {
  red: number;
  orange: number;
  green: number;
  total: number;
};

export type DashboardDeadlinesPayload = {
  deadlines?: unknown[];
  counts?: DashboardDeadlinesCounts;
};

type CacheEntry = {
  at: number;
  promise: Promise<DashboardDeadlinesPayload | null>;
};

const TTL_MS = 15_000;
const cache = new Map<string, CacheEntry>();

export function invalidateDashboardDeadlinesCache(companyId?: string | null): void {
  if (companyId === undefined) {
    cache.clear();
    return;
  }
  cache.delete(companyId ?? '');
}

export async function fetchDashboardDeadlinesShared(
  companyId?: string | null,
): Promise<DashboardDeadlinesPayload | null> {
  const key = companyId ?? '';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.promise;
  }

  const promise = (async (): Promise<DashboardDeadlinesPayload | null> => {
    try {
      const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
      const res = await fetch(`/api/dashboard/deadlines${qs}`, { credentials: 'include' });
      if (!res.ok) return null;
      return (await res.json()) as DashboardDeadlinesPayload;
    } catch {
      return null;
    }
  })();

  cache.set(key, { at: Date.now(), promise });
  return promise;
}
