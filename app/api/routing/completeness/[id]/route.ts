/**
 * GET /api/routing/completeness/[id]
 *
 * Returns routing completeness analysis for a document:
 *   - Which modules are expected (from routing matrix)
 *   - Which modules have been routed
 *   - Which modules are missing
 *   - Whether TVA amounts are consistent
 *
 * Used by RoutingCompletenessAlert component.
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Expected modules per document type (non-view-only ones)
const REQUIRED_MODULES: Record<string, string[]> = {
  purchase_invoice: ['comptabilite', 'tva'],
  sales_invoice: ['factures', 'tva'],
  receipt: ['comptabilite'],
  bank_statement: ['banque'],
  payroll_slip: ['rh'],
  cnss_document: ['rh'],
  legal_contract: ['juridique'],
  company_statutes: ['juridique'],
  hr_document: ['rh'],
  vat_declaration: ['tva'],
  tax_declaration: ['rapports'],
  accounting_document: ['comptabilite'],
  legal_notice: ['juridique'],
  unknown: [],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const admin = getSupabaseServiceRoleClient();

  // Load document
  const { data: doc, error: docErr } = await admin
    .from('atlas_documents')
    .select('id, document_type, metadata')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (docErr || !doc) return NextResponse.json({ error: 'document_not_found' }, { status: 404 });

  const docType = (doc.document_type as string) ?? 'unknown';
  const requiredModules = REQUIRED_MODULES[docType] ?? [];

  // Load completed routing records
  const { data: routingRecords } = await admin
    .from('zafirix_routing_records')
    .select('target_module, target_entity_type, validation_status, payload')
    .eq('source_document_id', documentId)
    .eq('routing_status', 'completed');

  const routedModules = [...new Set((routingRecords ?? []).map(r => r.target_module as string))];
  const missingModules = requiredModules.filter(m => !routedModules.includes(m));
  const isComplete = missingModules.length === 0;

  // TVA consistency check
  type TvaAlert = { expected: number; detected: number; amountHt: number; vatRate: number } | null;
  let tvaAlert: TvaAlert = null;
  if (['purchase_invoice', 'sales_invoice', 'receipt'].includes(docType)) {
    const meta = (doc.metadata && typeof doc.metadata === 'object') ? doc.metadata as Record<string, unknown> : {};
    const extraction = meta.extraction as Record<string, unknown> | null;
    if (extraction) {
      function numVal(field: unknown): number | null {
        if (!field || typeof field !== 'object') return null;
        const f = field as Record<string, unknown>;
        const raw = f.user_corrected_value ?? f.value;
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/\s/g, '').replace(',', '.'));
        return isFinite(n) ? n : null;
      }
      const amountHt = numVal(extraction.subtotal_ht);
      const vatRate = numVal(extraction.tva_rate);
      const vatDetected = numVal(extraction.tva_amount);
      if (amountHt != null && vatRate != null && vatDetected != null) {
        const expectedVat = Math.round(amountHt * (vatRate / 100) * 100) / 100;
        const diff = Math.abs(expectedVat - vatDetected);
        const threshold = Math.max(1, expectedVat * 0.05); // 5% tolerance
        if (diff > threshold) {
          tvaAlert = { expected: expectedVat, detected: vatDetected, amountHt, vatRate };
        }
      }
    }
  }

  // Module labels
  const MODULE_LABELS: Record<string, string> = {
    comptabilite: 'Comptabilité', factures: 'Factures', tva: 'TVA',
    rh: 'Ressources Humaines', juridique: 'Juridique', banque: 'Banque', rapports: 'Rapports',
  };
  const label = (m: string) => MODULE_LABELS[m] ?? m;

  return NextResponse.json({
    ok: true,
    documentId,
    documentType: docType,
    isComplete,
    requiredModules: requiredModules.map(m => ({ module: m, label: label(m) })),
    routedModules: routedModules.map(m => ({ module: m, label: label(m) })),
    missingModules: missingModules.map(m => ({ module: m, label: label(m) })),
    routingRecords: routingRecords ?? [],
    tvaAlert,
  });
}
