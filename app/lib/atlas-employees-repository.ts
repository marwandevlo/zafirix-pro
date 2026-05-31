import type { AtlasEmployee } from '@/app/types/atlas-employee';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { asRecord } from '@/app/lib/atlas-json';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { requireOwnedCompany } from '@/app/lib/atlas-entity-ownership';

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

function rowToEmployee(row: Record<string, unknown>): AtlasEmployee {
  const metadata = asRecord(row.metadata);
  return {
    id: String(row.id),
    companyId: row.company_id == null ? null : String(row.company_id),
    fullName: String(row.full_name ?? ''),
    email: row.email == null || row.email === '' ? undefined : String(row.email),
    phone: row.phone == null || row.phone === '' ? undefined : String(row.phone),
    roleTitle: row.role_title == null || row.role_title === '' ? undefined : String(row.role_title),
    status: String(row.status ?? 'active'),
    cin: row.cin == null || row.cin === '' ? undefined : String(row.cin),
    cnssMatricule:
      row.cnss_matricule == null || row.cnss_matricule === '' ? undefined : String(row.cnss_matricule),
    grossSalaryMad: row.gross_salary_mad != null ? Number(row.gross_salary_mad) : undefined,
    hireDate: row.hire_date == null ? undefined : String(row.hire_date),
    metadata,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export type ListEmployeesOptions = {
  companyId?: string | null;
};

export async function listAtlasEmployees(opts?: ListEmployeesOptions): Promise<AtlasEmployee[]> {
  if (!isAtlasSupabaseDataEnabled()) return readEmployeesFromLocalStorage();

  const auth = await requireSupabaseUser();
  if (!auth.ok) return [];

  let companyId = opts?.companyId;
  if (companyId === undefined) {
    companyId = await getActiveCompanyDbRowId();
  }

  let q = supabase.from('atlas_employees').select('*').order('created_at', { ascending: false });
  if (companyId) q = q.eq('company_id', companyId);

  const { data, error } = await q;
  if (error) {
    console.error('atlas_employees list error', error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToEmployee(row as Record<string, unknown>));
}

export async function upsertAtlasEmployee(
  emp: AtlasEmployee,
  opts?: { companyId?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
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

  const companyId = (opts?.companyId ?? emp.companyId ?? (await getActiveCompanyDbRowId()))?.trim() || null;
  if (!companyId) return { ok: false, error: 'company_required' };

  const owned = await requireOwnedCompany(companyId);
  if (!owned.ok) return { ok: false, error: owned.error };

  const row: Record<string, unknown> = {
    user_id: auth.userId,
    company_id: companyId,
    full_name: emp.fullName.trim(),
    email: emp.email ?? null,
    phone: emp.phone ?? null,
    role_title: emp.roleTitle ?? null,
    status: emp.status || 'active',
    cin: emp.cin ?? null,
    cnss_matricule: emp.cnssMatricule ?? null,
    gross_salary_mad: emp.grossSalaryMad ?? null,
    hire_date: emp.hireDate ?? null,
    metadata: emp.metadata ?? {},
    updated_at: new Date().toISOString(),
  };

  if (emp.id && !emp.id.startsWith('new-')) {
    row.id = emp.id;
  }

  const { error } = await supabase.from('atlas_employees').upsert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAtlasEmployee(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    writeEmployeesToLocalStorage(readEmployeesFromLocalStorage().filter((e) => e.id !== id));
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const { error } = await supabase.from('atlas_employees').delete().eq('id', id).eq('user_id', auth.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
