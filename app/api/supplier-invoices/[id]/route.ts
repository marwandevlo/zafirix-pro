/**
 * DELETE /api/supplier-invoices/[id]
 * PATCH /api/supplier-invoices/[id]
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { assertSupplierInvoiceCompanyAccess } from '@/app/lib/atlas-tva-supplier-identity-update';
import { isValidIce, isValidIf, isValidMoroccoVatRate } from '@/app/lib/atlas-morocco-compliance';
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

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(_request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { id } = await params;
  const admin = getSupabaseServiceRoleClient();

  let companyId: string | null = null;
  try {
    ({ companyId } = await assertSupplierInvoiceCompanyAccess(admin, userId, id));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'forbidden';
    const status = message === 'not_found' ? 404 : 403;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
  }

  const { error } = await admin
    .from('atlas_supplier_invoices')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId ?? '');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  revalidateTvaSurfaces(companyId ?? undefined);
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = getSupabaseServiceRoleClient();

  let companyId: string | null = null;
  try {
    ({ companyId } = await assertSupplierInvoiceCompanyAccess(admin, userId, id));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'forbidden';
    const status = message === 'not_found' ? 404 : 403;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
  }

  if (body.supplierIce != null && String(body.supplierIce).trim() && !isValidIce(String(body.supplierIce))) {
    return NextResponse.json(
      { error: 'invalid_ice', message: "ICE fournisseur invalide (15 chiffres requis)." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (body.supplierIf != null && String(body.supplierIf).trim() && !isValidIf(String(body.supplierIf))) {
    return NextResponse.json(
      { error: 'invalid_if', message: "IF fournisseur invalide (7 à 8 chiffres requis)." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (body.vatRate != null && !isValidMoroccoVatRate(Number(body.vatRate))) {
    return NextResponse.json(
      { error: 'invalid_vat_rate', message: 'Taux TVA non conforme DGI (0, 7, 10, 14 ou 20 %).' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.supplierName != null) patch.supplier_name = String(body.supplierName).trim();
  if (body.invoiceNumber != null) patch.invoice_number = String(body.invoiceNumber).trim();
  if (body.issueDate != null) patch.invoice_date = String(body.issueDate);
  if (body.supplierIce != null) patch.supplier_ice = String(body.supplierIce).replace(/\D/g, '');
  if (body.supplierIf != null) patch.supplier_if = String(body.supplierIf).replace(/\D/g, '');
  if (body.amountHT != null) patch.amount_ht = Number(body.amountHT);
  if (body.vatAmount != null) patch.vat_amount = Number(body.vatAmount);
  if (body.totalTTC != null) patch.amount_ttc = Number(body.totalTTC);
  if (body.vatRate != null) patch.vat_rate = Number(body.vatRate);

  const { data, error } = await admin
    .from('atlas_supplier_invoices')
    .update(patch)
    .eq('id', id)
    .eq('company_id', companyId ?? '')
    .select('id, supplier_name, invoice_number, invoice_date, amount_ht, vat_amount, amount_ttc, supplier_ice, supplier_if, vat_rate')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE_HEADERS });
  }

  if (body.supplierIce != null || body.supplierIf != null) {
    revalidateTvaSurfaces(companyId ?? undefined);
  }

  return NextResponse.json({ ok: true, invoice: data }, { headers: NO_STORE_HEADERS });
}
