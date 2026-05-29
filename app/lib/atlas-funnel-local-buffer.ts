/** Browser-only buffer when Supabase is off or track API cannot persist. */

import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';

export const ATLAS_FUNNEL_LOCAL_STORAGE_KEY = 'atlas_funnel_events_local';
const MAX_EVENTS = 3000;

export type LocalFunnelEventRow = {
  event_name: string;
  anonymous_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function readAll(): LocalFunnelEventRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATLAS_FUNNEL_LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalFunnelEventRow[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: LocalFunnelEventRow[]): void {
  if (typeof window === 'undefined') return;
  const trimmed = rows.length > MAX_EVENTS ? rows.slice(-MAX_EVENTS) : rows;
  localStorage.setItem(ATLAS_FUNNEL_LOCAL_STORAGE_KEY, JSON.stringify(trimmed));
}

export function appendLocalFunnelEvent(row: LocalFunnelEventRow): void {
  if (blockCriticalLocalStorageInProduction('atlas_funnel_events_local')) return;
  const next = [...readAll(), row];
  writeAll(next);
}

export function readLocalFunnelEvents(): LocalFunnelEventRow[] {
  return readAll();
}
