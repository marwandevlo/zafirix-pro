/**
 * Project studies (Business Studio studies, their versions and legacy studies) are planning documents, not
 * transactional data: clearing a company's data unlinks them from the company and keeps them, as when the company
 * itself is deleted (atlas_projects.company_id is "on delete set null").
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGACY_STUDY_KIND, STUDY_KIND, STUDY_VERSION_KIND } from './model';

export async function detachCompanyStudies(
  db: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<{ ok: true; detached: number } | { ok: false; error: string }> {
  const { data, error } = await db
    .from('atlas_projects')
    .update({ company_id: null, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .in('metadata->>kind', [STUDY_KIND, STUDY_VERSION_KIND, LEGACY_STUDY_KIND])
    .select('id');
  if (error) return { ok: false, error: `atlas_projects: ${error.message}` };
  return { ok: true, detached: data?.length ?? 0 };
}
