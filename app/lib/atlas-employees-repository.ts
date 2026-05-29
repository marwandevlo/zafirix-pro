import type { AtlasEmployee } from '@/app/types/atlas-employee';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { asRecord } from '@/app/lib/atlas-json';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';

export function readEmployeesFromLocalStorage(): AtlasEmployee[] {
  if (blockCriticalLocalStorageInProduction('atlas_employees')) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATLAS_STORAGE_KEYS.employees);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AtlasEmployee[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeEmployeesToLocalStorage(employees: AtlasEmployee[]): void {
  if (blockCriticalLocalStorageInProduction('atlas_employees')) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(ATLAS_STORAGE_KEYS.employees, JSON.stringify(employees));
}

export async function listAtlasEmployees(): Promise<AtlasEmployee[]> {
  if (!isAtlasSupabaseDataEnabled()) return readEmployeesFromLocalStorage();

  const auth = await requireSupabaseUser();
  if (!auth.ok) return [];

  const { data, error } = await supabase
    .from('atlas_employees')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('atlas_employees list error', error.message);
    return readEmployeesFromLocalStorage();
  }

  return (data ?? []).map((row: Record<string, unknown>): AtlasEmployee => {
    const metadata = asRecord(row.metadata);
    const cid = row.company_id;
    const em = row.email;
    const ph = row.phone;
    const rt = row.role_title;
    return {
      id: String(row.id),
      companyId: cid == null ? null : String(cid),
      fullName: String(row.full_name ?? ''),
      email: em == null || em === '' ? undefined : String(em),
      phone: ph == null || ph === '' ? undefined : String(ph),
      roleTitle: rt == null || rt === '' ? undefined : String(rt),
      status: String(row.status ?? 'active'),
      metadata,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    };
  });
}

export async function upsertAtlasEmployee(emp: AtlasEmployee): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    const existing = readEmployeesFromLocalStorage();
    const next = existing.some((e) => e.id === emp.id)
      ? existing.map((e) => (e.id === emp.id ? emp : e))
      : [...existing, emp];
    writeEmployeesToLocalStorage(next);
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const { error } = await supabase.from('atlas_employees').upsert({
    id: emp.id,
    user_id: auth.userId,
    company_id: emp.companyId ?? null,
    full_name: emp.fullName,
    email: emp.email ?? null,
    phone: emp.phone ?? null,
    role_title: emp.roleTitle ?? null,
    status: emp.status,
    metadata: emp.metadata ?? {},
    updated_at: new Date().toISOString(),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

