import type { AtlasAccountingEntry } from '@/app/types/atlas-accounting';
import { supabase } from '@/app/lib/supabase';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';

export function readAccountingFromLocalStorage(): AtlasAccountingEntry[] {
  if (blockCriticalLocalStorageInProduction('atlas_accounting')) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATLAS_STORAGE_KEYS.accountingEntries);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AtlasAccountingEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeAccountingToLocalStorage(entries: AtlasAccountingEntry[]): void {
  if (blockCriticalLocalStorageInProduction('atlas_accounting')) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(ATLAS_STORAGE_KEYS.accountingEntries, JSON.stringify(entries));
}

/** Reserved for when comptabilité persists lines; same pattern as companies. */
export async function listAtlasAccountingEntries(): Promise<AtlasAccountingEntry[]> {
  if (!isAtlasSupabaseDataEnabled()) {
    return readAccountingFromLocalStorage();
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('atlas_accounting_entries')
    .select('id, entry_json, source_document_id, validation_status')
    .order('entry_date', { ascending: true });

  if (error) {
    console.error('atlas_accounting_entries list error', error.message);
    return readAccountingFromLocalStorage();
  }

  return (data ?? [])
    .map((row: { id: unknown; entry_json: unknown; source_document_id: unknown; validation_status: unknown }) => {
      const j = row.entry_json as AtlasAccountingEntry | null;
      if (!j || typeof j !== 'object') return null;
      return {
        ...j,
        rowId: String(row.id ?? ''),
        sourceDocumentId: (row.source_document_id as string | null) ?? null,
        validationStatus: (row.validation_status as string | null) ?? 'draft',
      } as AtlasAccountingEntry;
    })
    .filter((e): e is AtlasAccountingEntry => e !== null);
}

export async function upsertAtlasAccountingEntry(
  entry: AtlasAccountingEntry,
  opts?: { companyId?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    const existing = readAccountingFromLocalStorage();
    const next = existing.some((e) => e.id === entry.id)
      ? existing.map((e) => (e.id === entry.id ? entry : e))
      : [...existing, entry];
    writeAccountingToLocalStorage(next);
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const row = {
    user_id: auth.userId,
    company_id: opts?.companyId ?? null,
    entry_json: entry,
    entry_date: entry.date || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('atlas_accounting_entries').insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
