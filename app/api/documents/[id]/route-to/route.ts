/**
 * POST /api/documents/[id]/route-to
 *
 * Send a validated document to a destination module.
 * Body: { module: 'comptabilite' | 'tva' | 'rh' | ... }
 *
 * For comptabilite (purchase/sales invoice):
 *   1. Creates atlas_supplier_invoices row (TVA auto-computed from it)
 *   2. Creates atlas_accounting_entries journal lines (Debit/Credit)
 *   3. Creates zafirix_tva_suggestions row
 *   4. Marks document validated + routed
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logDocumentEvent } from '@/app/lib/atlas-document-events';
import type { AtlasDocumentType, AtlasStructuredExtraction } from '@/app/types/atlas-document';
import {
  buildJournalLines,
  buildTvaSuggestion,
  persistJournalLines,
  persistTvaSuggestion,
} from '@/app/lib/atlas-documents-accounting-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteToBody = {
  module?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractNumeric(field?: { value?: string | number | null; user_corrected_value?: string } | null): number | null {
  if (!field) return null;
  const raw = field.user_corrected_value != null ? field.user_corrected_value : field.value;
  if (typeof raw === 'number' && isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
    if (isFinite(n)) return n;
  }
  return null;
}

function extractString(field?: { value?: string | number | null; user_corrected_value?: string } | null): string | null {
  if (!field) return null;
  const raw = field.user_corrected_value != null ? field.user_corrected_value : field.value;
  if (raw == null) return null;
  return String(raw);
}

function parseInvoiceDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const parts = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!parts) return null;
  const [, d, m, y] = parts;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ── Core routing actions ──────────────────────────────────────────────────────

async function createSupplierInvoice(
  admin: ReturnType<typeof getSupabaseServiceRoleClient>,
  userId: string,
  companyId: string,
  documentId: string,
  extraction: AtlasStructuredExtraction,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const parsedDate = parseInvoiceDate(extractString(extraction.invoice_date));

  const { data, error } = await admin
    .from('atlas_supplier_invoices')
    .insert({
      user_id: userId,
      company_id: companyId,
      document_id: documentId,
      source_document_id: documentId,
      supplier_name: extractString(extraction.supplier_name) ?? 'Fournisseur inconnu',
      supplier_ice: extractString(extraction.supplier_ice),
      supplier_if: extractString(extraction.supplier_if),
      supplier_rc: extractString(extraction.supplier_rc),
      supplier_address: extractString(extraction.supplier_address),
      customer_name: extractString(extraction.customer_name),
      invoice_number: extractString(extraction.invoice_number),
      invoice_date: parsedDate,
      amount_ht: extractNumeric(extraction.subtotal_ht),
      vat_amount: extractNumeric(extraction.tva_amount),
      amount_ttc: extractNumeric(extraction.total_ttc),
      vat_rate: extractNumeric(extraction.tva_rate),
      payment_method: extractString(extraction.payment_method),
      currency: extractString(extraction.currency) ?? 'MAD',
      category: extractString(extraction.category_suggestion),
      accounting_account: extractString(extraction.accounting_account),
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

async function routeToComptabilite(
  admin: ReturnType<typeof getSupabaseServiceRoleClient>,
  userId: string,
  companyId: string,
  documentId: string,
  extraction: AtlasStructuredExtraction,
  documentType: AtlasDocumentType | null,
  companyRegime: string,
): Promise<{
  ok: true;
  invoiceId: string;
  journalEntryIds: string[];
  tvaSuggestionId: string | null;
  journalLineCount: number;
  tvaAmount: number | null;
} | { ok: false; error: string }> {
  const isPurchase = documentType !== 'sales_invoice';

  // 1. Create supplier invoice (TVA auto-computed from this row)
  const invoiceResult = await createSupplierInvoice(admin, userId, companyId, documentId, extraction);
  if (!invoiceResult.ok) return invoiceResult;
  const { invoiceId } = invoiceResult;

  // 2. Create journal lines (Debit/Credit)
  const journalLines = buildJournalLines(documentId, extraction, isPurchase, invoiceId);
  let journalEntryIds: string[] = [];
  if (journalLines.length > 0) {
    const journalResult = await persistJournalLines(admin, userId, companyId, journalLines);
    if (journalResult.ok) {
      journalEntryIds = journalResult.ids;
    }
    // Non-fatal: journal lines failure doesn't block supplier invoice creation
  }

  // 3. Create TVA suggestion
  const tvaSuggestion = buildTvaSuggestion(documentId, extraction, isPurchase, invoiceId, companyRegime);
  let tvaSuggestionId: string | null = null;
  let tvaAmount: number | null = null;
  if (tvaSuggestion) {
    const tvaResult = await persistTvaSuggestion(admin, userId, companyId, tvaSuggestion);
    if (tvaResult.ok) {
      tvaSuggestionId = tvaResult.id;
      tvaAmount = tvaSuggestion.amount;
    }
  }

  return {
    ok: true,
    invoiceId,
    journalEntryIds,
    tvaSuggestionId,
    journalLineCount: journalLines.length,
    tvaAmount,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

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

  // Load document + company (for TVA regime)
  const [docRes, companyRes] = await Promise.all([
    admin
      .from('atlas_documents')
      .select('id, company_id, processing_status, validation_status, metadata, document_type')
      .eq('id', documentId)
      .eq('user_id', userId)
      .maybeSingle(),
    admin
      .from('atlas_companies')
      .select('id, company_json')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (docRes.error || !docRes.data) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  const doc = docRes.data;

  if (doc.processing_status !== 'processed') {
    return NextResponse.json({ error: 'document_not_processed', message: 'Document doit être analysé avant envoi.' }, { status: 422 });
  }

  const meta = (doc.metadata && typeof doc.metadata === 'object') ? doc.metadata as Record<string, unknown> : {};
  const extraction = (meta.extraction && typeof meta.extraction === 'object') ? meta.extraction as AtlasStructuredExtraction : {};
  const companyJson = companyRes.data?.company_json;
  const regime = (companyJson && typeof companyJson === 'object' ? (companyJson as Record<string, unknown>).regimeTVA as string : null) ?? 'mensuel';

  let result: Record<string, unknown> = {};

  if (['comptabilite', 'supplier_invoices', 'fournisseurs', 'tva'].includes(targetModule)) {
    const routeResult = await routeToComptabilite(
      admin,
      userId,
      doc.company_id,
      documentId,
      extraction,
      (doc.document_type as AtlasDocumentType | null) ?? null,
      regime,
    );

    if (!routeResult.ok) {
      return NextResponse.json({ error: 'route_failed', message: routeResult.error }, { status: 500 });
    }

    result = {
      module: 'comptabilite',
      invoiceId: routeResult.invoiceId,
      journalEntryIds: routeResult.journalEntryIds,
      journalLineCount: routeResult.journalLineCount,
      tvaSuggestionId: routeResult.tvaSuggestionId,
      tvaAmount: routeResult.tvaAmount,
    };
  } else {
    result = { module: targetModule, note: 'Routage enregistré' };
  }

  // Mark document validated + log routing
  const routed = Array.isArray(meta.routed_to) ? [...(meta.routed_to as string[]), targetModule] : [targetModule];
  await admin
    .from('atlas_documents')
    .update({
      validation_status: 'validated',
      validated_at: new Date().toISOString(),
      validated_by: userId,
      metadata: { ...meta, routed_to: routed, last_routed_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('user_id', userId);

  if (doc.company_id) {
    void logDocumentEvent({
      companyId: doc.company_id,
      documentId,
      userId,
      eventType: 'routed_to_module',
      payload: { module: targetModule, ...result },
    });
  }

  return NextResponse.json({ ok: true, ...result });
}
