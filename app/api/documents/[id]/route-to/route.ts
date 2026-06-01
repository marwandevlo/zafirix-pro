/**
 * POST /api/documents/[id]/route-to
 *
 * Send a validated document to a destination module.
 * Body: { module: 'supplier_invoices' | 'tva' | ... }
 *
 * Creates traceability-linked records in the destination module.
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logDocumentEvent } from '@/app/lib/atlas-document-events';
import type { AtlasStructuredExtraction } from '@/app/types/atlas-document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteToBody = {
  module?: string;
};

function extractNumeric(field?: { value?: string | number | null } | null): number | null {
  if (!field) return null;
  const v = field.value;
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    if (isFinite(n)) return n;
  }
  return null;
}

function extractString(field?: { value?: string | number | null; user_corrected_value?: string } | null): string | null {
  if (!field) return null;
  // User-corrected value wins
  if (field.user_corrected_value != null) return String(field.user_corrected_value);
  const v = field.value;
  if (v == null) return null;
  return String(v);
}

async function routeToSupplierInvoices(
  admin: ReturnType<typeof getSupabaseServiceRoleClient>,
  userId: string,
  companyId: string,
  documentId: string,
  extraction: AtlasStructuredExtraction,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const supplierName = extractString(extraction.supplier_name) ?? 'Fournisseur inconnu';
  const invoiceNumber = extractString(extraction.invoice_number);
  const invoiceDate = extractString(extraction.invoice_date);
  const amountHt = extractNumeric(extraction.subtotal_ht);
  const vatAmount = extractNumeric(extraction.tva_amount);
  const amountTtc = extractNumeric(extraction.total_ttc);
  const vatRate = extractNumeric(extraction.tva_rate);
  const currency = extractString(extraction.currency) ?? 'MAD';
  const supplierIce = extractString(extraction.supplier_ice);
  const supplierIf = extractString(extraction.supplier_if);
  const supplierRc = extractString(extraction.supplier_rc);
  const supplierAddress = extractString(extraction.supplier_address);
  const customerName = extractString(extraction.customer_name);
  const paymentMethod = extractString(extraction.payment_method);
  const category = extractString(extraction.category_suggestion);
  const accountingAccount = extractString(extraction.accounting_account);

  let parsedDate: string | null = null;
  if (invoiceDate) {
    const parts = invoiceDate.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (parts) {
      const [, d, m, y] = parts;
      const year = y.length === 2 ? `20${y}` : y;
      parsedDate = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  const { data, error } = await admin
    .from('atlas_supplier_invoices')
    .insert({
      user_id: userId,
      company_id: companyId,
      document_id: documentId,
      source_document_id: documentId,
      supplier_name: supplierName,
      supplier_ice: supplierIce,
      supplier_if: supplierIf,
      supplier_rc: supplierRc,
      supplier_address: supplierAddress,
      customer_name: customerName,
      invoice_number: invoiceNumber,
      invoice_date: parsedDate,
      amount_ht: amountHt,
      vat_amount: vatAmount,
      amount_ttc: amountTtc,
      vat_rate: vatRate,
      payment_method: paymentMethod,
      currency,
      category,
      accounting_account: accountingAccount,
      line_items: Array.isArray(extraction.line_items) ? extraction.line_items : [],
      status: 'unpaid',
      validation_status: 'draft',
      generated_by: 'documents_ia',
      confidence_score: null,
      user_verified: false,
      metadata: {
        source_document_id: documentId,
        generated_by: 'documents_ia',
        generated_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, invoiceId: String(data?.id) };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }
  const auth = { userId };

  let body: RouteToBody;
  try {
    body = (await request.json()) as RouteToBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const targetModule = String(body.module ?? '').trim();
  if (!targetModule) {
    return NextResponse.json({ error: 'module_required' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();

  const { data: doc, error: fetchErr } = await admin
    .from('atlas_documents')
    .select('id, company_id, processing_status, validation_status, metadata, document_type')
    .eq('id', documentId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  if (doc.processing_status !== 'processed') {
    return NextResponse.json({ error: 'document_not_processed' }, { status: 422 });
  }

  const meta = (doc.metadata && typeof doc.metadata === 'object') ? doc.metadata as Record<string, unknown> : {};
  const extraction = (meta.extraction && typeof meta.extraction === 'object') ? meta.extraction as AtlasStructuredExtraction : {};

  let result: Record<string, unknown> = {};

  if (targetModule === 'supplier_invoices' || targetModule === 'comptabilite' || targetModule === 'fournisseurs') {
    const routeResult = await routeToSupplierInvoices(admin, auth.userId, doc.company_id, documentId, extraction);
    if (!routeResult.ok) {
      return NextResponse.json({ error: 'route_failed', message: routeResult.error }, { status: 500 });
    }
    result = { module: 'supplier_invoices', invoiceId: routeResult.invoiceId };
  } else {
    // For other modules, mark as routed in metadata (no table action yet)
    result = { module: targetModule, note: 'Module routing recorded' };
  }

  // Mark document as validated + update routing log in metadata
  const routed = Array.isArray(meta.routed_to) ? [...(meta.routed_to as string[]), targetModule] : [targetModule];
  await admin
    .from('atlas_documents')
    .update({
      validation_status: 'validated',
      validated_at: new Date().toISOString(),
      validated_by: auth.userId,
      metadata: { ...meta, routed_to: routed, last_routed_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('user_id', auth.userId);

  if (doc.company_id) {
    void logDocumentEvent({
      companyId: doc.company_id,
      documentId,
      userId: auth.userId,
      eventType: 'routed_to_module',
      payload: { module: targetModule, ...result },
    });
  }

  return NextResponse.json({ ok: true, ...result });
}
