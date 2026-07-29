/**
 * DELETE /api/supplier-invoices/[id]
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { isValidIce, isValidMoroccoVatRate } from '@/app/lib/atlas-morocco-compliance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(_request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseServiceRoleClient();

  const { error } = await admin
    .from('atlas_supplier_invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = getSupabaseServiceRoleClient();

  if (body.supplierIce != null && String(body.supplierIce).trim() && !isValidIce(String(body.supplierIce))) {
    return NextResponse.json(
      { error: 'invalid_ice', message: "ICE fournisseur invalide (15 chiffres requis)." },
      { status: 400 },
    );
  }
  if (body.vatRate != null && !isValidMoroccoVatRate(Number(body.vatRate))) {
    return NextResponse.json(
      { error: 'invalid_vat_rate', message: 'Taux TVA non conforme DGI (0, 7, 10, 14 ou 20 %).' },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.supplierName != null) patch.supplier_name = String(body.supplierName).trim();
  if (body.invoiceNumber != null) patch.invoice_number = String(body.invoiceNumber).trim();
  if (body.issueDate != null) patch.invoice_date = String(body.issueDate);
  if (body.supplierIce != null) patch.supplier_ice = String(body.supplierIce).replace(/\D/g, '');
  if (body.amountHT != null) patch.amount_ht = Number(body.amountHT);
  if (body.vatAmount != null) patch.vat_amount = Number(body.vatAmount);
  if (body.totalTTC != null) patch.amount_ttc = Number(body.totalTTC);
  if (body.vatRate != null) patch.vat_rate = Number(body.vatRate);

  const { data, error } = await admin
    .from('atlas_supplier_invoices')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, supplier_name, invoice_number, invoice_date, amount_ht, vat_amount, amount_ttc, supplier_ice, vat_rate')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ ok: true, invoice: data });
}
