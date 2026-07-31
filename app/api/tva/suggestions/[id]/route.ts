/**
 * PATCH /api/tva/suggestions/[id]
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { isValidMoroccoVatRate } from '@/app/lib/atlas-morocco-compliance';
import {
  normalizeSupplierIceIf,
  syncLinkedSupplierInvoiceIdentity,
} from '@/app/lib/atlas-tva-suggestion-update';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = getSupabaseServiceRoleClient();

  const { data: existing, error: loadError } = await admin
    .from('zafirix_tva_suggestions')
    .select('id, source_invoice_id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.reference != null) patch.invoice_number = String(body.reference).trim();
  if (body.counterparty != null) patch.supplier_name = String(body.counterparty).trim();
  if (body.issueDate != null) patch.invoice_date = String(body.issueDate);
  if (body.amountHT != null) patch.base_ht = Number(body.amountHT);
  if (body.vatAmount != null) patch.amount = Number(body.vatAmount);
  if (body.vatRate != null && isValidMoroccoVatRate(Number(body.vatRate))) {
    patch.rate = Number(body.vatRate);
  }

  let supplierIce: string | undefined;
  let supplierIf: string | undefined;

  if (body.supplierIce != null || body.supplierIf != null) {
    const normalized = normalizeSupplierIceIf({
      supplierIce: body.supplierIce as string | null | undefined,
      supplierIf: body.supplierIf as string | null | undefined,
    });
    if ('error' in normalized) {
      return NextResponse.json(
        { error: normalized.error, message: normalized.message },
        { status: 400 },
      );
    }
    supplierIce = normalized.supplierIce;
    supplierIf = normalized.supplierIf;
    patch.supplier_ice = supplierIce;
    patch.supplier_if = supplierIf;
  }

  const { data, error } = await admin
    .from('zafirix_tva_suggestions')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select(
      'id, supplier_name, invoice_number, invoice_date, base_ht, amount, rate, supplier_ice, supplier_if, source_invoice_id',
    )
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (supplierIce && supplierIf) {
    await syncLinkedSupplierInvoiceIdentity(
      admin,
      userId,
      (existing as { source_invoice_id?: string | null }).source_invoice_id,
      supplierIce,
      supplierIf,
    );
  }

  return NextResponse.json({ ok: true, suggestion: data });
}
