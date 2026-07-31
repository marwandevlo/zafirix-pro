import type { AtlasAccountingEntry } from '@/app/types/atlas-accounting';
import { resolveToPostgresUuid } from '@/app/lib/atlas-id-validation';
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

/** List journal entries, optionally scoped to active company. */
export async function listAtlasAccountingEntries(opts?: { companyId?: string | null }): Promise<AtlasAccountingEntry[]> {
  if (!isAtlasSupabaseDataEnabled()) {
    return readAccountingFromLocalStorage();
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let q = supabase
    .from('atlas_accounting_entries')
    .select('id, entry_json, source_document_id, validation_status, company_id')
    .order('entry_date', { ascending: true });

  if (opts?.companyId) {
    q = q.eq('company_id', opts.companyId);
  }

  const { data, error } = await q;

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

export async function updateAtlasAccountingEntryByRowId(
  rowId: string,
  entry: AtlasAccountingEntry,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    const existing = readAccountingFromLocalStorage();
    const next = existing.map((e) => (e.rowId === rowId || String(e.id) === rowId ? { ...entry, rowId } : e));
    writeAccountingToLocalStorage(next);
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const { error } = await supabase
    .from('atlas_accounting_entries')
    .update({
      entry_json: entry,
      entry_date: entry.date || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowId)
    .eq('user_id', auth.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAtlasAccountingEntryByRowId(
  rowId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return deleteAtlasAccountingEntryBySelectionId(rowId);
}

/** Delete by grid selection id (UUID rowId or local numeric id). */
export async function deleteAtlasAccountingEntryBySelectionId(
  selectionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = selectionId.trim();
  if (!id) return { ok: false, error: 'invalid_id' };

  if (!isAtlasSupabaseDataEnabled()) {
    const uuid = resolveToPostgresUuid(id);
    writeAccountingToLocalStorage(
      readAccountingFromLocalStorage().filter(
        (e) =>
          (e.rowId && (e.rowId === id || e.rowId === uuid)) ||
          String(e.id) !== id,
      ),
    );
    return { ok: true };
  }

  const uuid = resolveToPostgresUuid(id);
  if (!uuid) {
    return { ok: false, error: 'invalid_id' };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const { error } = await supabase
    .from('atlas_accounting_entries')
    .delete()
    .eq('id', uuid)
    .eq('user_id', auth.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
