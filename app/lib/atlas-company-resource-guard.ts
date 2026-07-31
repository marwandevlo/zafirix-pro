/**
 * Service-role API guards — company-scoped access for shared workspace resources.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccessCompany } from '@/app/lib/atlas-permissions';

export type CompanyGuardDeny = { ok: false; status: 401 | 403 | 404 | 500; error: string };
export type CompanyGuardOk<T extends Record<string, unknown> = Record<string, never>> = { ok: true } & T;

export type DocumentScope =
  | { mode: 'company'; companyId: string }
  | { mode: 'legacy'; userId: string };

const COMPANY_SCOPED_TABLES = [
  'atlas_invoices',
  'atlas_accounting_entries',
  'atlas_documents',
  'atlas_supplier_invoices',
] as const;

export type CompanyScopedTable = (typeof COMPANY_SCOPED_TABLES)[number];

export async function assertUserCompanyAccess(
  admin: SupabaseClient,
  userId: string,
  companyId: string | null | undefined,
): Promise<CompanyGuardOk<{ companyId: string }> | CompanyGuardDeny> {
  const cid = companyId?.trim();
  if (!cid) return { ok: false, status: 404, error: 'company_not_found_or_forbidden' };
  if (!(await canAccessCompany(admin, userId, cid))) {
    return { ok: false, status: 403, error: 'company_not_found_or_forbidden' };
  }
  return { ok: true, companyId: cid };
}

/** Resolve whether the caller may read/write a document row (company workspace or legacy uploader). */
export async function resolveDocumentScope(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<DocumentScope | null> {
  const { data } = await admin
    .from('atlas_documents')
    .select('company_id, user_id')
    .eq('id', documentId)
    .maybeSingle();

  if (!data) return null;

  const companyId = data.company_id ? String(data.company_id) : null;
  if (companyId) {
    const access = await assertUserCompanyAccess(admin, userId, companyId);
    if (!access.ok) return null;
    return { mode: 'company', companyId: access.companyId };
  }

  if (String(data.user_id) === userId) return { mode: 'legacy', userId };
  return null;
}

export async function loadDocumentForCompanyAccess(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
  select = 'id, company_id, storage_path, user_id',
): Promise<
  | CompanyGuardOk<{ row: Record<string, unknown>; companyId: string; scope: DocumentScope }>
  | CompanyGuardDeny
> {
  const scope = await resolveDocumentScope(admin, userId, documentId);
  if (!scope) return { ok: false, status: 404, error: 'not_found' };

  let query = admin.from('atlas_documents').select(select).eq('id', documentId);
  if (scope.mode === 'company') {
    query = query.eq('company_id', scope.companyId);
  } else {
    query = query.eq('user_id', scope.userId);
  }

  const { data, error } = await query.maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (error || !row?.id) return { ok: false, status: 404, error: 'not_found' };

  if (scope.mode === 'legacy') {
    return { ok: false, status: 404, error: 'company_required' };
  }

  return {
    ok: true,
    row,
    companyId: scope.companyId,
    scope,
  };
}

/** Delete rows strictly scoped to an accessible company workspace. */
export async function bulkDeleteCompanyScoped(
  admin: SupabaseClient,
  userId: string,
  table: CompanyScopedTable,
  ids: string[],
  companyId?: string | null,
): Promise<{ ok: true; deleted: number } | CompanyGuardDeny> {
  if (ids.length === 0) return { ok: true, deleted: 0 };

  if (companyId?.trim()) {
    const access = await assertUserCompanyAccess(admin, userId, companyId);
    if (!access.ok) return access;

    const { error, count } = await admin
      .from(table)
      .delete({ count: 'exact' })
      .in('id', ids)
      .eq('company_id', access.companyId);

    if (error) return { ok: false, status: 500, error: error.message };
    return { ok: true, deleted: count ?? ids.length };
  }

  const { data: rows, error: fetchErr } = await admin.from(table).select('id, company_id').in('id', ids);
  if (fetchErr) return { ok: false, status: 500, error: fetchErr.message };

  const deletableByCompany = new Map<string, string[]>();
  for (const row of rows ?? []) {
    const cid = row.company_id ? String(row.company_id) : null;
    if (!cid) continue;
    if (!(await canAccessCompany(admin, userId, cid))) continue;
    const list = deletableByCompany.get(cid) ?? [];
    list.push(String(row.id));
    deletableByCompany.set(cid, list);
  }

  let deleted = 0;
  for (const [cid, batchIds] of deletableByCompany) {
    const { error, count } = await admin
      .from(table)
      .delete({ count: 'exact' })
      .in('id', batchIds)
      .eq('company_id', cid);

    if (error) return { ok: false, status: 500, error: error.message };
    deleted += count ?? batchIds.length;
  }

  return { ok: true, deleted };
}
