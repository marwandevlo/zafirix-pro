import type { SupabaseClient } from '@supabase/supabase-js';

export type CompanyAccessResult =
  | { ok: true; companyId: string }
  | { ok: false; error: 'company_not_found_or_forbidden' | 'company_id_required' };

/** Verify the signed-in user owns the target company (server-side, service role client). */
export async function requireApiCompanyAccess(
  admin: SupabaseClient,
  userId: string,
  companyId: string | null | undefined,
): Promise<CompanyAccessResult> {
  if (!companyId?.trim()) {
    return { ok: false, error: 'company_id_required' };
  }

  const { data, error } = await admin
    .from('atlas_companies')
    .select('id')
    .eq('id', companyId.trim())
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.id) {
    return { ok: false, error: 'company_not_found_or_forbidden' };
  }

  return { ok: true, companyId: data.id };
}

/** Detect missing relation / migration-not-applied errors from PostgREST. */
export function isMissingTableError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('does not exist') || m.includes('relation') && m.includes('not found');
}
