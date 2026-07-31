/**
 * POST /api/tva/suggestions/bulk-update
 * Body: { ids: string[], supplierIce: string, supplierIf: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { prepareBulkDeleteIds } from '@/app/lib/atlas-bulk-delete-server';
import {
  normalizeSupplierIceIf,
  syncLinkedSupplierInvoiceIdentity,
} from '@/app/lib/atlas-tva-suggestion-update';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 50;

export async function POST(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: { ids?: string[]; supplierIce?: string; supplierIf?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const prepared = prepareBulkDeleteIds(body.ids);
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  }

  const normalized = normalizeSupplierIceIf(body);
  if ('error' in normalized) {
    return NextResponse.json(
      { error: normalized.error, message: normalized.message },
      { status: 400 },
    );
  }

  const { uuidIds, skipped, skippedIds } = prepared;
  if (uuidIds.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, skipped, skippedIds });
  }

  const admin = getSupabaseServiceRoleClient();
  const patch = {
    supplier_ice: normalized.supplierIce,
    supplier_if: normalized.supplierIf,
    updated_at: new Date().toISOString(),
  };

  let updated = 0;

  for (let i = 0; i < uuidIds.length; i += BATCH_SIZE) {
    const batch = uuidIds.slice(i, i + BATCH_SIZE);

    const { data: rows, error: loadError } = await admin
      .from('zafirix_tva_suggestions')
      .select('id, source_invoice_id')
      .in('id', batch)
      .eq('user_id', userId);

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }

    const { error, count } = await admin
      .from('zafirix_tva_suggestions')
      .update(patch)
      .in('id', batch)
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    updated += count ?? batch.length;

    for (const row of rows ?? []) {
      await syncLinkedSupplierInvoiceIdentity(
        admin,
        userId,
        (row as { source_invoice_id?: string | null }).source_invoice_id,
        normalized.supplierIce,
        normalized.supplierIf,
      );
    }
  }

  return NextResponse.json({ ok: true, updated, skipped, skippedIds });
}
