/**
 * POST /api/supplier-invoices/bulk-update
 * Body: { ids: string[], supplierIce: string, supplierIf: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { prepareBulkDeleteIds } from '@/app/lib/atlas-bulk-delete-server';
import { isValidIce, isValidIf } from '@/app/lib/atlas-morocco-compliance';
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

  const supplierIce = String(body.supplierIce ?? '').replace(/\D/g, '');
  const supplierIf = String(body.supplierIf ?? '').replace(/\D/g, '');

  if (!isValidIce(supplierIce)) {
    return NextResponse.json(
      { error: 'invalid_ice', message: 'ICE fournisseur invalide (15 chiffres requis).' },
      { status: 400 },
    );
  }
  if (!isValidIf(supplierIf)) {
    return NextResponse.json(
      { error: 'invalid_if', message: 'IF fournisseur invalide (7 à 8 chiffres requis).' },
      { status: 400 },
    );
  }

  const { uuidIds, skipped, skippedIds } = prepared;
  if (uuidIds.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, skipped, skippedIds });
  }

  const admin = getSupabaseServiceRoleClient();
  const patch = {
    supplier_ice: supplierIce,
    supplier_if: supplierIf,
    updated_at: new Date().toISOString(),
  };

  let updated = 0;

  for (let i = 0; i < uuidIds.length; i += BATCH_SIZE) {
    const batch = uuidIds.slice(i, i + BATCH_SIZE);
    const { error, count } = await admin
      .from('atlas_supplier_invoices')
      .update(patch)
      .in('id', batch)
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    updated += count ?? batch.length;
  }

  return NextResponse.json({ ok: true, updated, skipped, skippedIds });
}
