import type { AtlasLink } from '@/app/types/atlas-link';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { asRecord } from '@/app/lib/atlas-json';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';

export function readLinksFromLocalStorage(): AtlasLink[] {
  if (blockCriticalLocalStorageInProduction('atlas_links')) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATLAS_STORAGE_KEYS.links);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AtlasLink[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLinksToLocalStorage(links: AtlasLink[]): void {
  if (blockCriticalLocalStorageInProduction('atlas_links')) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(ATLAS_STORAGE_KEYS.links, JSON.stringify(links));
}

export async function listAtlasLinks(params?: { fromType?: string; fromId?: string; toType?: string; toId?: string }): Promise<AtlasLink[]> {
  if (!isAtlasSupabaseDataEnabled()) return readLinksFromLocalStorage();

  const auth = await requireSupabaseUser();
  if (!auth.ok) return [];

  let q = supabase.from('atlas_links').select('*').order('created_at', { ascending: false });
  if (params?.fromType) q = q.eq('from_type', params.fromType);
  if (params?.fromId) q = q.eq('from_id', params.fromId);
  if (params?.toType) q = q.eq('to_type', params.toType);
  if (params?.toId) q = q.eq('to_id', params.toId);

  const { data, error } = await q;
  if (error) {
    console.error('atlas_links list error', error.message);
    return readLinksFromLocalStorage();
  }

  return (data ?? []).map((row: Record<string, unknown>): AtlasLink => {
    const metadata = asRecord(row.metadata);
    const cid = row.company_id;
    return {
      id: String(row.id),
      companyId: cid == null ? null : String(cid),
      fromType: String(row.from_type),
      fromId: String(row.from_id),
      toType: String(row.to_type),
      toId: String(row.to_id),
      relation: String(row.relation ?? 'relates_to'),
      metadata,
      createdAt: String(row.created_at ?? new Date().toISOString()),
    };
  });
}

export async function createAtlasLink(link: Omit<AtlasLink, 'id' | 'createdAt'>): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const payload: AtlasLink = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...link,
    relation: link.relation ?? 'relates_to',
  };

  if (!isAtlasSupabaseDataEnabled()) {
    writeLinksToLocalStorage([payload, ...readLinksFromLocalStorage()]);
    return { ok: true, id: payload.id };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const { error } = await supabase.from('atlas_links').insert({
    id: payload.id,
    user_id: auth.userId,
    company_id: payload.companyId ?? null,
    from_type: payload.fromType,
    from_id: payload.fromId,
    to_type: payload.toType,
    to_id: payload.toId,
    relation: payload.relation,
    metadata: payload.metadata ?? {},
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: payload.id };
}

