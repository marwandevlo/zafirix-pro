import { canAccessCompany } from '@/app/lib/atlas-permissions';
import type { SupabaseClient } from '@supabase/supabase-js';

export type CompanyAccessResult =
  | { ok: true; companyId: string }
  | { ok: false; error: 'company_not_found_or_forbidden' | 'company_id_required' };

/** Verify the signed-in user can access the target company (owner or workspace role). */
export async function requireApiCompanyAccess(
  admin: SupabaseClient,
  userId: string,
  companyId: string | null | undefined,
): Promise<CompanyAccessResult> {
  if (!companyId?.trim()) {
    return { ok: false, error: 'company_id_required' };
  }

  const trimmed = companyId.trim();
  const allowed = await canAccessCompany(admin, userId, trimmed);
  if (!allowed) {
    return { ok: false, error: 'company_not_found_or_forbidden' };
  }

  return { ok: true, companyId: trimmed };
}

/** Detect missing relation / migration-not-applied errors from PostgREST. */
export function isMissingTableError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('does not exist') || m.includes('relation') && m.includes('not found');
}
