/**
 * POST /api/supplier-invoices/bulk-update
 * Body: { companyId: string, ids: string[], supplierIce: string, supplierIf: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { prepareBulkDeleteIds } from '@/app/lib/atlas-bulk-delete-server';
import { isValidIce, isValidIf } from '@/app/lib/atlas-morocco-compliance';
import { bulkUpdateSupplierInvoiceIdentity } from '@/app/lib/atlas-tva-supplier-identity-update';
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

  let body: { companyId?: string; ids?: string[]; supplierIce?: string; supplierIf?: string };
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

  const prepared = prepareBulkDeleteIds(body.ids);
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error }, { status: prepared.status, headers: NO_STORE_HEADERS });
  }

  const supplierIce = String(body.supplierIce ?? '').replace(/\D/g, '');
  const supplierIf = String(body.supplierIf ?? '').replace(/\D/g, '');

  if (!isValidIce(supplierIce)) {
    return NextResponse.json(
      { error: 'invalid_ice', message: 'ICE fournisseur invalide (15 chiffres requis).' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!isValidIf(supplierIf)) {
    return NextResponse.json(
      { error: 'invalid_if', message: 'IF fournisseur invalide (7 à 8 chiffres requis).' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const { uuidIds, skipped, skippedIds } = prepared;
  if (uuidIds.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, skipped, skippedIds }, { headers: NO_STORE_HEADERS });
  }

  try {
    const updated = await bulkUpdateSupplierInvoiceIdentity(
      admin,
      userId,
      access.companyId,
      uuidIds,
      supplierIce,
      supplierIf,
    );

    revalidateTvaSurfaces(access.companyId);

    return NextResponse.json({ ok: true, updated, skipped, skippedIds }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update_failed';
    const status = message === 'company_not_found_or_forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
  }
}
