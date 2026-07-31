/**
 * POST /api/tva/update-supplier-identity
 * Body: {
 *   supplierIce: string,
 *   supplierIf: string,
 *   supplierInvoiceIds?: string[],
 *   tvaSuggestionIds?: string[],
 * }
 *
 * ICE/IF are persisted on atlas_supplier_invoices only (never zafirix_tva_suggestions).
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { prepareBulkDeleteIds } from '@/app/lib/atlas-bulk-delete-server';
import {
  bulkUpdateSupplierInvoiceIdentity,
  normalizeSupplierIceIf,
  resolveSupplierInvoiceIdsFromTvaSuggestions,
} from '@/app/lib/atlas-tva-supplier-identity-update';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: {
    supplierIce?: string;
    supplierIf?: string;
    supplierInvoiceIds?: string[];
    tvaSuggestionIds?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const normalized = normalizeSupplierIceIf(body);
  if ('error' in normalized) {
    return NextResponse.json(
      { error: normalized.error, message: normalized.message },
      { status: 400 },
    );
  }

  const directPrepared = prepareBulkDeleteIds(body.supplierInvoiceIds ?? []);
  if (!directPrepared.ok && (body.supplierInvoiceIds?.length ?? 0) > 0) {
    return NextResponse.json({ error: directPrepared.error }, { status: directPrepared.status });
  }

  const suggestionPrepared = prepareBulkDeleteIds(body.tvaSuggestionIds ?? []);
  if (!suggestionPrepared.ok && (body.tvaSuggestionIds?.length ?? 0) > 0) {
    return NextResponse.json({ error: suggestionPrepared.error }, { status: suggestionPrepared.status });
  }

  const admin = getSupabaseServiceRoleClient();
  const targetIds = new Set<string>(directPrepared.ok ? directPrepared.uuidIds : []);

  let unresolvedSuggestions = 0;
  if (suggestionPrepared.ok && suggestionPrepared.uuidIds.length > 0) {
    const { invoiceIds, unresolvedCount } = await resolveSupplierInvoiceIdsFromTvaSuggestions(
      admin,
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
    });
  }

  try {
    const updated = await bulkUpdateSupplierInvoiceIdentity(
      admin,
      userId,
      [...targetIds],
      normalized.supplierIce,
      normalized.supplierIf,
    );

    return NextResponse.json({
      ok: true,
      updated,
      skipped,
      unresolvedSuggestions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
