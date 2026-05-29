import type { AtlasProject } from '@/app/types/atlas-project';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { asRecord } from '@/app/lib/atlas-json';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';

export function readProjectsFromLocalStorage(): AtlasProject[] {
  if (blockCriticalLocalStorageInProduction('atlas_projects')) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATLAS_STORAGE_KEYS.projects);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AtlasProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeProjectsToLocalStorage(projects: AtlasProject[]): void {
  if (blockCriticalLocalStorageInProduction('atlas_projects')) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(ATLAS_STORAGE_KEYS.projects, JSON.stringify(projects));
}

export async function listAtlasProjects(): Promise<AtlasProject[]> {
  if (!isAtlasSupabaseDataEnabled()) return readProjectsFromLocalStorage();

  const auth = await requireSupabaseUser();
  if (!auth.ok) return [];

  const { data, error } = await supabase
    .from('atlas_projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('atlas_projects list error', error.message);
    return readProjectsFromLocalStorage();
  }

  return (data ?? []).map((row: Record<string, unknown>): AtlasProject => {
    const metadata = asRecord(row.metadata);
    const cid = row.company_id;
    return {
      id: String(row.id),
      companyId: cid == null ? null : String(cid),
      name: String(row.name ?? ''),
      status: String(row.status ?? 'active'),
      metadata,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    };
  });
}

export async function upsertAtlasProject(project: AtlasProject): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    const existing = readProjectsFromLocalStorage();
    const next = existing.some((p) => p.id === project.id)
      ? existing.map((p) => (p.id === project.id ? project : p))
      : [...existing, project];
    writeProjectsToLocalStorage(next);
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const { error } = await supabase.from('atlas_projects').upsert({
    id: project.id,
    user_id: auth.userId,
    company_id: project.companyId ?? null,
    name: project.name,
    status: project.status,
    metadata: project.metadata ?? {},
    updated_at: new Date().toISOString(),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

