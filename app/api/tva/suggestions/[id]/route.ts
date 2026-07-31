/**
 * PATCH /api/tva/suggestions/[id]
 * Updates suggestion metadata only. ICE/IF route to atlas_supplier_invoices.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiCompanyAccess } from '@/app/lib/atlas-api-company-guard';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { isValidMoroccoVatRate } from '@/app/lib/atlas-morocco-compliance';
import {
  normalizeSupplierIceIf,
  resolveSupplierInvoiceIdForTvaLine,
  updateSupplierInvoiceIdentity,
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

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = getSupabaseServiceRoleClient();

  const { data: existing, error: loadError } = await admin
    .from('zafirix_tva_suggestions')
    .select('id, company_id, source_invoice_id, source_document_id')
    .eq('id', id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const companyIdFromBody = body.companyId != null ? String(body.companyId).trim() : '';
  const companyId = companyIdFromBody || String((existing as { company_id?: string }).company_id ?? '');
  const access = await requireApiCompanyAccess(admin, userId, companyId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.error === 'company_id_required' ? 400 : 403, headers: NO_STORE_HEADERS });
  }

  if (String((existing as { company_id?: string }).company_id) !== access.companyId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.reference != null) patch.invoice_number = String(body.reference).trim();
  if (body.counterparty != null) patch.supplier_name = String(body.counterparty).trim();
  if (body.issueDate != null) patch.invoice_date = String(body.issueDate);
  if (body.amountHT != null) patch.base_ht = Number(body.amountHT);
  if (body.vatAmount != null) patch.amount = Number(body.vatAmount);
  if (body.vatRate != null && isValidMoroccoVatRate(Number(body.vatRate))) {
    patch.rate = Number(body.vatRate);
  }

  const { data, error } = await admin
    .from('zafirix_tva_suggestions')
    .update(patch)
    .eq('id', id)
    .eq('company_id', access.companyId)
    .select('id, supplier_name, invoice_number, invoice_date, base_ht, amount, rate, source_invoice_id, source_document_id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE_HEADERS });
  }

  if (body.supplierIce != null || body.supplierIf != null) {
    const normalized = normalizeSupplierIceIf({
      supplierIce: body.supplierIce as string | null | undefined,
      supplierIf: body.supplierIf as string | null | undefined,
    });
    if ('error' in normalized) {
      return NextResponse.json(
        { error: normalized.error, message: normalized.message },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const supplierInvoiceId = await resolveSupplierInvoiceIdForTvaLine(admin, access.companyId, userId, {
      sourceInvoiceId: (existing as { source_invoice_id?: string | null }).source_invoice_id,
      sourceDocumentId: (existing as { source_document_id?: string | null }).source_document_id,
    });

    if (!supplierInvoiceId) {
      return NextResponse.json(
        {
          error: 'supplier_invoice_not_linked',
          message: 'Aucune facture fournisseur liée — impossible d’enregistrer ICE/IF pour cette suggestion.',
        },
        { status: 422, headers: NO_STORE_HEADERS },
      );
    }

    try {
      await updateSupplierInvoiceIdentity(
        admin,
        userId,
        supplierInvoiceId,
        normalized.supplierIce,
        normalized.supplierIf,
      );
    } catch (identityErr) {
      const message = identityErr instanceof Error ? identityErr.message : 'identity_update_failed';
      const status = message === 'company_not_found_or_forbidden' ? 403 : 500;
      return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
    }
  }

  revalidateTvaSurfaces(access.companyId);

  return NextResponse.json({ ok: true, suggestion: data }, { headers: NO_STORE_HEADERS });
}
