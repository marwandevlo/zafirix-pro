/**
 * POST /api/tva/update-supplier-identity
 * Body: {
 *   companyId: string,
 *   supplierIce: string,
 *   supplierIf: string,
 *   supplierInvoiceIds?: string[],
 *   tvaSuggestionIds?: string[],
 * }
 *
 * ICE/IF are persisted on atlas_supplier_invoices only (never zafirix_tva_suggestions).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { prepareBulkDeleteIds } from '@/app/lib/atlas-bulk-delete-server';
import {
  bulkUpdateSupplierInvoiceIdentity,
  normalizeSupplierIceIf,
  resolveSupplierInvoiceIdsFromTvaSuggestions,
} from '@/app/lib/atlas-tva-supplier-identity-update';
import { revalidateTvaSurfaces } from '@/app/lib/revalidate-tva-surfaces';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
};

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  let body: {
    companyId?: string;
    supplierIce?: string;
    supplierIf?: string;
    supplierInvoiceIds?: string[];
    tvaSuggestionIds?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const admin = getSupabaseServiceRoleClient();
  const access = await requireApiCompanyAccess(admin, userId, body.companyId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.error === 'company_id_required' ? 400 : 403, headers: NO_STORE_HEADERS });
  }

  const normalized = normalizeSupplierIceIf(body);
  if ('error' in normalized) {
    return NextResponse.json(
      { error: normalized.error, message: normalized.message },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const directPrepared = prepareBulkDeleteIds(body.supplierInvoiceIds ?? []);
  if (!directPrepared.ok && (body.supplierInvoiceIds?.length ?? 0) > 0) {
    return NextResponse.json({ error: directPrepared.error }, { status: directPrepared.status, headers: NO_STORE_HEADERS });
  }

  const suggestionPrepared = prepareBulkDeleteIds(body.tvaSuggestionIds ?? []);
  if (!suggestionPrepared.ok && (body.tvaSuggestionIds?.length ?? 0) > 0) {
    return NextResponse.json({ error: suggestionPrepared.error }, { status: suggestionPrepared.status, headers: NO_STORE_HEADERS });
  }

  const targetIds = new Set<string>(directPrepared.ok ? directPrepared.uuidIds : []);

  let unresolvedSuggestions = 0;
  if (suggestionPrepared.ok && suggestionPrepared.uuidIds.length > 0) {
    const { invoiceIds, unresolvedCount } = await resolveSupplierInvoiceIdsFromTvaSuggestions(
      admin,
      access.companyId,
      userId,
      suggestionPrepared.uuidIds,
    );
    unresolvedSuggestions = unresolvedCount;
    for (const id of invoiceIds) targetIds.add(id);
  }

  const skipped =
    (directPrepared.ok ? directPrepared.skipped : 0) + (suggestionPrepared.ok ? suggestionPrepared.skipped : 0);

  if (targetIds.size === 0) {
    return NextResponse.json({
      ok: true,
      updated: 0,
      skipped,
      unresolvedSuggestions,
    }, { headers: NO_STORE_HEADERS });
  }

  try {
    const updated = await bulkUpdateSupplierInvoiceIdentity(
      admin,
      userId,
      access.companyId,
      [...targetIds],
      normalized.supplierIce,
      normalized.supplierIf,
    );

    revalidateTvaSurfaces(access.companyId);

    return NextResponse.json({
      ok: true,
      updated,
      skipped,
      unresolvedSuggestions,
    }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update_failed';
    const status = message === 'company_not_found_or_forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
  }
}
