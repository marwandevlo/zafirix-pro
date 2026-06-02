/**
 * PATCH /api/documents/[id]/propagate-corrections
 *
 * Propagates user corrections from Documents IA to all DRAFT downstream records.
 *
 * Rules:
 *   - Only updates records with validation_status = 'draft' or 'needs_review'.
 *   - Never silently overwrites validated records; instead returns a warning list.
 *   - Propagates to:
 *       atlas_supplier_invoices (draft)
 *       atlas_accounting_entries (draft)
 *       zafirix_tva_suggestions (pending)
 *       atlas_invoices (draft)
 *
 * Response:
 *   {
 *     ok: true,
 *     propagated: { supplier_invoices: number, accounting_entries: number, tva_suggestions: number, invoices: number },
 *     blocked: Array<{ table: string; entityId: string; reason: 'already_validated' }>
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PropagateBody = {
  corrections: Record<string, { field: string; old_value: unknown; new_value: unknown }>;
};

function numericOrNull(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    if (isFinite(n)) return n;
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: PropagateBody;
  try { body = (await request.json()) as PropagateBody; }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  if (!body.corrections || typeof body.corrections !== 'object') {
    return NextResponse.json({ error: 'corrections_required' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();

  // Verify document belongs to user
  const { data: doc, error: docErr } = await admin
    .from('atlas_documents')
    .select('id, company_id, metadata, document_type')
    .eq('id', documentId).eq('user_id', userId).maybeSingle();

  if (docErr || !doc) return NextResponse.json({ error: 'document_not_found' }, { status: 404 });

  const corrections = body.corrections;
  const correctionKeys = Object.keys(corrections);
  if (correctionKeys.length === 0) return NextResponse.json({ ok: true, propagated: {}, blocked: [] });

  const propagated = { supplier_invoices: 0, accounting_entries: 0, tva_suggestions: 0, invoices: 0 };
  const blocked: Array<{ table: string; entityId: string; reason: string }> = [];
  const now = new Date().toISOString();

  // ── Helper: build update object from corrections for given field mapping ──

  function buildUpdate(
    fieldMapping: Record<string, string>,
  ): Record<string, unknown> {
    const update: Record<string, unknown> = {};
    for (const [corrKey, corrDelta] of Object.entries(corrections)) {
      const dbCol = fieldMapping[corrKey];
      if (!dbCol) continue;
      const newVal = corrDelta.new_value;
      const num = numericOrNull(newVal);
      update[dbCol] = num ?? (newVal != null ? String(newVal) : null);
    }
    return update;
  }

  // ── 1. Supplier invoices (draft) ──────────────────────────────────────────

  const { data: supplierInvoices } = await admin
    .from('atlas_supplier_invoices')
    .select('id, validation_status')
    .eq('source_document_id', documentId);

  if (supplierInvoices && supplierInvoices.length > 0) {
    const supplierFieldMap: Record<string, string> = {
      supplier_name: 'supplier_name', invoice_number: 'invoice_number',
      invoice_date: 'invoice_date', subtotal_ht: 'amount_ht',
      tva_amount: 'vat_amount', total_ttc: 'amount_ttc',
      tva_rate: 'vat_rate', payment_method: 'payment_method',
      category_suggestion: 'category', accounting_account: 'accounting_account',
    };
    const upd = buildUpdate(supplierFieldMap);

    for (const inv of supplierInvoices) {
      if (['validated', 'archived'].includes(inv.validation_status)) {
        blocked.push({ table: 'atlas_supplier_invoices', entityId: String(inv.id), reason: 'already_validated' });
        continue;
      }
      if (Object.keys(upd).length > 0) {
        await admin.from('atlas_supplier_invoices')
          .update({ ...upd, updated_at: now })
          .eq('id', inv.id);
        propagated.supplier_invoices++;
      }
    }
  }

  // ── 2. Accounting entries (draft) ─────────────────────────────────────────

  const { data: accountingEntries } = await admin
    .from('atlas_accounting_entries')
    .select('id, validation_status, debit, credit, description')
    .eq('source_document_id', documentId);

  if (accountingEntries && accountingEntries.length > 0) {
    for (const entry of accountingEntries) {
      if (['validated', 'archived'].includes(entry.validation_status ?? '')) {
        blocked.push({ table: 'atlas_accounting_entries', entityId: String(entry.id), reason: 'already_validated' });
        continue;
      }
      // Update amounts if TTC or HT changed
      const ttcCorrection = corrections.total_ttc ?? corrections.subtotal_ht;
      if (ttcCorrection) {
        const newAmount = numericOrNull(ttcCorrection.new_value);
        if (newAmount != null) {
          const isDebit = entry.debit > 0;
          await admin.from('atlas_accounting_entries')
            .update({ [isDebit ? 'debit' : 'credit']: newAmount, updated_at: now })
            .eq('id', entry.id);
          propagated.accounting_entries++;
        }
      }
    }
  }

  // ── 3. TVA suggestions (pending) ──────────────────────────────────────────

  const { data: tvaSuggestions } = await admin
    .from('zafirix_tva_suggestions')
    .select('id, status')
    .eq('source_document_id', documentId);

  if (tvaSuggestions && tvaSuggestions.length > 0) {
    const tvaCorrection = corrections.tva_amount;
    const vatRateCorrection = corrections.tva_rate;

    for (const tva of tvaSuggestions) {
      if (['validated', 'archived'].includes(tva.status ?? '')) {
        blocked.push({ table: 'zafirix_tva_suggestions', entityId: String(tva.id), reason: 'already_validated' });
        continue;
      }
      const upd: Record<string, unknown> = {};
      if (tvaCorrection) {
        const newAmt = numericOrNull(tvaCorrection.new_value);
        if (newAmt != null) upd['amount'] = newAmt;
      }
      if (vatRateCorrection) {
        const newRate = numericOrNull(vatRateCorrection.new_value);
        if (newRate != null) upd['vat_rate'] = newRate;
      }
      if (Object.keys(upd).length > 0) {
        await admin.from('zafirix_tva_suggestions').update({ ...upd, updated_at: now }).eq('id', tva.id);
        propagated.tva_suggestions++;
      }
    }
  }

  // ── 4. Sales invoices (draft) from atlas_invoices ─────────────────────────

  const { data: salesInvoices } = await admin
    .from('atlas_invoices')
    .select('id, validation_status')
    .eq('source_document_id', documentId);

  if (salesInvoices && salesInvoices.length > 0) {
    const salesFieldMap: Record<string, string> = {
      invoice_number: 'number', customer_name: 'client_name',
      subtotal_ht: 'amount_ht', tva_rate: 'vat_rate',
      tva_amount: 'vat_amount', total_ttc: 'total_ttc',
    };
    const upd = buildUpdate(salesFieldMap);

    for (const inv of salesInvoices) {
      if (['validated', 'archived'].includes(inv.validation_status ?? '')) {
        blocked.push({ table: 'atlas_invoices', entityId: String(inv.id), reason: 'already_validated' });
        continue;
      }
      if (Object.keys(upd).length > 0) {
        await admin.from('atlas_invoices').update({ ...upd, updated_at: now }).eq('id', inv.id);
        propagated.invoices++;
      }
    }
  }

  // ── Audit log ─────────────────────────────────────────────────────────────

  const companyId = doc.company_id;
  if (companyId) {
    void admin.from('atlas_entity_events').insert({
      user_id: userId,
      company_id: companyId,
      entity_type: 'document',
      entity_id: documentId,
      event_type: 'correction_propagated',
      payload: {
        corrected_fields: correctionKeys,
        propagated,
        blocked_count: blocked.length,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    propagated,
    blocked,
    message: blocked.length > 0
      ? `${blocked.length} enregistrement(s) déjà validé(s) ne peuvent pas être modifiés automatiquement.`
      : null,
  });
}
