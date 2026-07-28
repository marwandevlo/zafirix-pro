/**
 * POST /api/documents/[id]/route-to
 *
 * Routes a validated document to a destination module.
 * Creates draft downstream records with full traceability.
 *
 * Body: { module: string }
 *
 * Modules supported:
 *   comptabilite / supplier_invoices / fournisseurs / tva
 *   factures / sales_invoices / client_invoices
 *   banque / bank_statement
 *   rh / cnss / payroll_slip
 *   juridique / legal
 *   rapports / fiscalite
 *
 * Duplicate prevention:
 *   Uses zafirix_routing_records unique index on (source_document_id, target_module, target_entity_type).
 *   Returns { duplicate: true } if already routed.
 *
 * Every routing action logs to atlas_entity_events.
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
import { createBankStatementFromDocument } from '@/app/lib/atlas-bank-server';
import { createPayslipExtractionFromDocument } from '@/app/lib/atlas-payslip-server';
import { logAuditEvent } from '@/app/lib/atlas-audit-log';
import { meterFeatureUsage } from '@/app/lib/atlas-usage-meter';
import { checkWorkspaceRateLimit, rateLimitResponse } from '@/app/lib/atlas-rate-limit';
import { ensureWorkspaceSubscription } from '@/app/lib/atlas-billing-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteToBody = { module?: string };

// ── Field helpers ─────────────────────────────────────────────────────────────

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
  return raw != null ? String(raw) : null;
}

function parseDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const parts = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!parts) return null;
  const [, d, m, y] = parts;
  return `${y.length === 2 ? `20${y}` : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ── Duplicate guard ───────────────────────────────────────────────────────────

async function checkDuplicate(
  admin: ReturnType<typeof getSupabaseServiceRoleClient>,
  documentId: string,
  targetModule: string,
  targetEntityType: string,
): Promise<{ isDuplicate: boolean; existingRecord: Record<string, unknown> | null }> {
  const { data } = await admin
    .from('zafirix_routing_records')
    .select('id, target_entity_id, created_at, payload')
    .eq('source_document_id', documentId)
    .eq('target_module', targetModule)
    .eq('target_entity_type', targetEntityType)
    .eq('routing_status', 'completed')
    .maybeSingle();

  return { isDuplicate: !!data, existingRecord: data as Record<string, unknown> | null };
}

async function registerRouting(
  admin: ReturnType<typeof getSupabaseServiceRoleClient>,
  params: {
    userId: string;
    companyId: string | null;
    documentId: string;
    documentType: string;
    targetModule: string;
    targetEntityType: string;
    targetEntityId?: string | null;
    extractionConfidence?: number | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from('zafirix_routing_records').insert({
    user_id: params.userId,
    company_id: params.companyId,
    source_document_id: params.documentId,
    source_document_type: params.documentType,
    target_module: params.targetModule,
    target_entity_type: params.targetEntityType,
    target_entity_id: params.targetEntityId ?? null,
    routing_status: 'completed',
    generated_by: 'documents_ia',
    extraction_confidence: params.extractionConfidence ?? null,
    validation_status: 'draft',
    payload: params.payload ?? {},
  });
}

// ── Routing implementations ───────────────────────────────────────────────────

/** Purchase invoice / receipt → Comptabilité + TVA */
async function routePurchaseToComptabilite(
  admin: ReturnType<typeof getSupabaseServiceRoleClient>,
  userId: string,
  companyId: string,
  documentId: string,
  documentType: AtlasDocumentType | null,
  extraction: AtlasStructuredExtraction,
  regime: string,
): Promise<{
  invoiceId: string;
  journalLineCount: number;
  tvaSuggestionId: string | null;
  tvaAmount: number | null;
}> {
  const parsedDate = parseDate(extractString(extraction.invoice_date));
  const amountHt = extractNumeric(extraction.subtotal_ht);
  const vatAmount = extractNumeric(extraction.tva_amount);
  const amountTtc = extractNumeric(extraction.total_ttc) ?? ((amountHt ?? 0) + (vatAmount ?? 0));

  // 1. Supplier invoice
  const { data: inv, error: invErr } = await admin
    .from('atlas_supplier_invoices')
    .insert({
      user_id: userId, company_id: companyId,
      document_id: documentId, source_document_id: documentId,
      supplier_name: extractString(extraction.supplier_name) ?? 'Fournisseur inconnu',
      supplier_ice: extractString(extraction.supplier_ice),
      supplier_if: extractString(extraction.supplier_if),
      supplier_rc: extractString(extraction.supplier_rc),
      supplier_address: extractString(extraction.supplier_address),
      customer_name: extractString(extraction.customer_name),
      invoice_number: extractString(extraction.invoice_number),
      invoice_date: parsedDate,
      amount_ht: amountHt,
      vat_amount: vatAmount,
      amount_ttc: amountTtc,
      vat_rate: extractNumeric(extraction.tva_rate),
      payment_method: extractString(extraction.payment_method),
      currency: extractString(extraction.currency) ?? 'MAD',
      category: extractString(extraction.category_suggestion),
      accounting_account: extractString(extraction.accounting_account),
      line_items: Array.isArray(extraction.line_items) ? extraction.line_items : [],
      status: 'unpaid', validation_status: 'draft',
      generated_by: 'documents_ia', user_verified: false,
      metadata: { source_document_id: documentId, generated_by: 'documents_ia', generated_at: new Date().toISOString() },
    })
    .select('id').single();

  if (invErr) throw new Error(`Supplier invoice creation failed: ${invErr.message}`);
  const invoiceId = String(inv?.id);

  // 2. Journal lines
  const isPurchase = documentType !== 'sales_invoice';
  const journalLines = buildJournalLines(documentId, extraction, isPurchase, invoiceId);
  let journalLineCount = 0;
  if (journalLines.length > 0) {
    const jr = await persistJournalLines(admin, userId, companyId, journalLines);
    if (jr.ok) journalLineCount = jr.ids.length;
  }

  // 3. TVA suggestion
  const tvaSuggestion = buildTvaSuggestion(documentId, extraction, isPurchase, invoiceId, regime);
  let tvaSuggestionId: string | null = null;
  let tvaAmount: number | null = null;
  if (tvaSuggestion) {
    const tr = await persistTvaSuggestion(admin, userId, companyId, tvaSuggestion);
    if (tr.ok) { tvaSuggestionId = tr.id; tvaAmount = tvaSuggestion.amount; }
  }

  return { invoiceId, journalLineCount, tvaSuggestionId, tvaAmount };
}

/** Sales invoice → atlas_invoices draft */
async function routeSalesInvoice(
  admin: ReturnType<typeof getSupabaseServiceRoleClient>,
  userId: string,
  companyId: string,
  documentId: string,
  extraction: AtlasStructuredExtraction,
): Promise<{ invoiceId: string; amountTtc: number | null }> {
  const parsedDate = parseDate(extractString(extraction.invoice_date)) ?? new Date().toISOString().slice(0, 10);
  const dueDate = parseDate(extractString(extraction.due_date)) ?? parsedDate;
  const amountHt = extractNumeric(extraction.subtotal_ht) ?? 0;
  const vatRate = extractNumeric(extraction.tva_rate) ?? 20;
  const vatAmount = extractNumeric(extraction.tva_amount) ?? Math.round(amountHt * (vatRate / 100) * 100) / 100;
  const amountTtc = extractNumeric(extraction.total_ttc) ?? (amountHt + vatAmount);
  const clientName = extractString(extraction.customer_name) ?? extractString(extraction.supplier_name) ?? 'Client';
  const invoiceNumber = extractString(extraction.invoice_number) ?? `AI-${documentId.slice(0, 8)}`;

  const { data: inv, error } = await admin
    .from('atlas_invoices')
    .insert({
      user_id: userId, company_id: companyId,
      number: invoiceNumber,
      client_name: clientName,
      issue_date: parsedDate, due_date: dueDate,
      payment_terms_days: 30,
      status: 'draft',
      amount_ht: amountHt, vat_rate: vatRate, vat_amount: vatAmount, total_ttc: amountTtc,
      source_document_id: documentId,
      source_document_type: 'sales_invoice',
      generated_by: 'documents_ia',
      metadata: { source_document_id: documentId, generated_by: 'documents_ia', generated_at: new Date().toISOString() },
    })
    .select('id').single();

  if (error) throw new Error(`Sales invoice creation failed: ${error.message}`);
  return { invoiceId: String(inv?.id), amountTtc };
}


/** Legal contract / statutes → zafirix_legal_documents */
async function routeLegalDocument(
  admin: ReturnType<typeof getSupabaseServiceRoleClient>,
  userId: string,
  companyId: string,
  documentId: string,
  documentType: string,
  extraction: AtlasStructuredExtraction,
): Promise<{ legalDocId: string }> {
  const ext = extraction as Record<string, unknown>;
  const effectiveDate = parseDate(extractString((ext.invoice_date ?? ext.effective_date) as Parameters<typeof extractString>[0]));
  const expiryDate = parseDate(extractString(ext.expiry_date as Parameters<typeof extractString>[0]));
  const parties: string[] = [];
  if (extractString(extraction.supplier_name)) parties.push(extractString(extraction.supplier_name)!);
  if (extractString(extraction.customer_name)) parties.push(extractString(extraction.customer_name)!);

  const legalType =
    documentType === 'legal_contract' ? 'legal_contract' :
    documentType === 'company_statutes' ? 'company_statutes' :
    documentType === 'legal_notice' ? 'legal_notice' :
    documentType === 'hr_document' ? 'hr_document' : 'other';

  const { data, error } = await admin
    .from('zafirix_legal_documents')
    .insert({
      user_id: userId, company_id: companyId,
      source_document_id: documentId,
      document_type: legalType,
      parties: parties.length > 0 ? parties : null,
      effective_date: effectiveDate,
      expiry_date: expiryDate,
      renewal_alert_days: expiryDate ? 30 : null,
      generated_by: 'documents_ia',
      validation_status: 'draft',
      raw_extraction: extraction as object,
    })
    .select('id').single();

  if (error) throw new Error(`Legal document creation failed: ${error.message}`);
  return { legalDocId: String(data?.id) };
}

// ── Module group resolvers ────────────────────────────────────────────────────

function resolveModuleGroup(module: string): string {
  const map: Record<string, string> = {
    comptabilite: 'comptabilite', supplier_invoices: 'comptabilite',
    fournisseurs: 'comptabilite', tva: 'comptabilite',
    factures: 'factures', sales_invoices: 'factures', client_invoices: 'factures',
    banque: 'banque', bank_statement: 'banque',
    rh: 'rh', cnss: 'rh', payroll_slip: 'rh',
    juridique: 'juridique', legal: 'juridique',
    rapports: 'rapports', fiscalite: 'rapports',
  };
  return map[module] ?? module;
}

// ── Main handler ──────────────────────────────────────────────────────────────

function routeToErrorResponse(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error: code, code, message, ...extra }, { status });
}

function routingFailureStatus(message: string): number {
  const lower = message.toLowerCase();
  if (
    lower.includes('required') ||
    lower.includes('invalid') ||
    lower.includes('missing') ||
    lower.includes('not processed') ||
    lower.includes('classification')
  ) {
    return 400;
  }
  return 500;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: documentId } = await params;
    const userId = await documentUploadSessionUserId(request);
    if (!userId) return routeToErrorResponse(401, 'auth_required', 'Session expirée.');

    let body: RouteToBody;
    try {
      body = (await request.json()) as RouteToBody;
    } catch {
      return routeToErrorResponse(400, 'invalid_json', 'Corps JSON invalide.');
    }

    const targetModule = String(body.module ?? '').trim();
    if (!targetModule) {
      return routeToErrorResponse(400, 'module_required', 'Le module de destination est requis.');
    }

    const moduleGroup = resolveModuleGroup(targetModule);
    const admin = getSupabaseServiceRoleClient();

    const [docRes, companyRes] = await Promise.all([
      admin
        .from('atlas_documents')
        .select('id, company_id, processing_status, validation_status, metadata, document_type')
        .eq('id', documentId)
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('atlas_companies').select('id, raisonSociale, company_json').eq('user_id', userId).maybeSingle(),
    ]);

    if (docRes.error) {
      return routeToErrorResponse(500, 'document_load_failed', docRes.error.message);
    }
    if (!docRes.data) {
      return routeToErrorResponse(404, 'document_not_found', 'Document introuvable.');
    }
    const doc = docRes.data;

    if (doc.processing_status !== 'processed') {
      return routeToErrorResponse(
        422,
        'document_not_processed',
        'Le document doit être analysé avant envoi vers un module.',
      );
    }

    const meta =
      doc.metadata && typeof doc.metadata === 'object' ? (doc.metadata as Record<string, unknown>) : {};
    const extraction =
      meta.extraction && typeof meta.extraction === 'object'
        ? (meta.extraction as AtlasStructuredExtraction)
        : {};
    const docType = (doc.document_type as AtlasDocumentType | null) ?? 'unknown';
    const companyId = doc.company_id ?? companyRes.data?.id ?? '';
    if (!companyId) {
      return routeToErrorResponse(400, 'company_required', 'Société active requise pour le routage.');
    }

    const companyJson = companyRes.data?.company_json;
    const regime =
      (companyJson && typeof companyJson === 'object'
        ? ((companyJson as Record<string, unknown>).regimeTVA as string)
        : null) ?? 'mensuel';

    const entityTypeMap: Record<string, string> = {
      comptabilite: 'supplier_invoice',
      factures: 'sales_invoice',
      banque: 'bank_statement',
      rh: 'payroll_record',
      juridique: 'legal_document',
      rapports: 'report_record',
    };
    const targetEntityType = entityTypeMap[moduleGroup] ?? moduleGroup;

    const { isDuplicate, existingRecord } = await checkDuplicate(
      admin,
      documentId,
      moduleGroup,
      targetEntityType,
    );

    if (isDuplicate) {
      return NextResponse.json({
        ok: false,
        duplicate: true,
        message: `Ce document a déjà été envoyé vers ${moduleGroup}.`,
        existingEntityId: existingRecord?.target_entity_id ?? null,
        routedAt: existingRecord?.created_at ?? null,
        actions: ['view', 'resend', 'new_version'],
      });
    }

    let result: Record<string, unknown> = {};

    if (moduleGroup === 'comptabilite') {
      const r = await routePurchaseToComptabilite(admin, userId, companyId, documentId, docType, extraction, regime);
      result = {
        module: 'comptabilite',
        invoiceId: r.invoiceId,
        journalLineCount: r.journalLineCount,
        tvaSuggestionId: r.tvaSuggestionId,
        tvaAmount: r.tvaAmount,
      };
      await registerRouting(admin, {
        userId, companyId, documentId, documentType: docType,
        targetModule: moduleGroup, targetEntityType,
        targetEntityId: r.invoiceId,
        payload: { invoice_id: r.invoiceId, journal_lines: r.journalLineCount },
      });

    } else if (moduleGroup === 'factures') {
      const r = await routeSalesInvoice(admin, userId, companyId, documentId, extraction);
      result = { module: 'factures', invoiceId: r.invoiceId, amountTtc: r.amountTtc };
      await registerRouting(admin, {
        userId, companyId, documentId, documentType: docType,
        targetModule: moduleGroup, targetEntityType,
        targetEntityId: r.invoiceId,
        payload: { invoice_id: r.invoiceId, amount_ttc: r.amountTtc },
      });

    } else if (moduleGroup === 'banque') {
      const { workspaceId } = await ensureWorkspaceSubscription(admin, userId);
      const wsRate = checkWorkspaceRateLimit(workspaceId, 'bank_import', userId);
      if (!wsRate.ok) {
        const rl = rateLimitResponse(wsRate);
        return NextResponse.json(rl.body, { status: rl.status });
      }
      const meter = await meterFeatureUsage(admin, userId, 'bank_import', { companyId });
      if (!meter.ok) {
        return NextResponse.json({ error: meter.code, message: meter.messageFr }, { status: meter.status });
      }

      const r = await createBankStatementFromDocument(admin, {
        userId, companyId, documentId, extraction, metadata: meta,
      });
      result = {
        module: 'banque',
        statementId: r.statementId,
        transactionCount: r.transactionCount,
        reconciliationRun: r.reconciliationRun,
        note: `${r.transactionCount} opération(s) importée(s)`,
      };
      await registerRouting(admin, {
        userId, companyId, documentId, documentType: docType,
        targetModule: moduleGroup, targetEntityType,
        targetEntityId: r.statementId,
        payload: { statement_id: r.statementId, transaction_count: r.transactionCount },
      });
      void logAuditEvent({
        entityType: 'bank_statement',
        entityId: r.statementId,
        action: 'routed',
        performedBy: userId,
        companyId,
        sourceDocumentId: documentId,
      });

    } else if (moduleGroup === 'rh') {
      const r = await createPayslipExtractionFromDocument(admin, {
        userId, companyId, documentId, extraction, metadata: meta,
      });
      result = {
        module: 'rh',
        extractionId: r.extractionId,
        employeeId: r.employeeId,
        matchConfidence: r.matchConfidence,
        needsReview: r.needsReview,
        note: r.needsReview ? 'Bulletin en file de révision' : 'Bulletin associé à l\'employé',
      };
      await registerRouting(admin, {
        userId, companyId, documentId, documentType: docType,
        targetModule: moduleGroup, targetEntityType,
        targetEntityId: r.extractionId,
        payload: {
          extraction_id: r.extractionId,
          employee_id: r.employeeId,
          match_confidence: r.matchConfidence,
        },
      });
      void logAuditEvent({
        entityType: 'payroll_record',
        entityId: r.extractionId,
        action: 'routed',
        performedBy: userId,
        companyId,
        sourceDocumentId: documentId,
      });

    } else if (moduleGroup === 'juridique') {
      const r = await routeLegalDocument(admin, userId, companyId, documentId, docType, extraction);
      result = { module: 'juridique', legalDocId: r.legalDocId, note: 'Document juridique créé (brouillon)' };
      await registerRouting(admin, {
        userId, companyId, documentId, documentType: docType,
        targetModule: moduleGroup, targetEntityType,
        targetEntityId: r.legalDocId,
        payload: { legal_doc_id: r.legalDocId },
      });

    } else {
      // Generic routing (rapports, fiscalite, etc.)
      result = { module: moduleGroup, note: 'Routage enregistré' };
      await registerRouting(admin, {
        userId, companyId, documentId, documentType: docType,
        targetModule: moduleGroup, targetEntityType,
        payload: { note: 'generic_routing' },
      });
    }

    const routed = Array.isArray(meta.routed_to)
      ? [...new Set([...(meta.routed_to as string[]), moduleGroup])]
      : [moduleGroup];

    const { error: docUpdateError } = await admin
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

    if (docUpdateError) {
      return routeToErrorResponse(500, 'document_update_failed', docUpdateError.message);
    }

    const moduleEventMap: Record<string, import('@/app/lib/atlas-document-events').DocumentEventType> = {
      comptabilite: 'routed_to_comptabilite',
      factures: 'routed_to_factures',
      banque: 'routed_to_banque',
      rh: 'routed_to_rh',
      juridique: 'routed_to_juridique',
      rapports: 'routed_to_rapports',
      tva: 'routed_to_tva',
    };

    if (companyId) {
      void logDocumentEvent({
        companyId,
        documentId,
        userId,
        eventType: moduleEventMap[moduleGroup] ?? 'routed_to_module',
        payload: { module: moduleGroup, entity_type: targetEntityType, ...result },
      });

      void admin.from('atlas_entity_events').insert({
        user_id: userId,
        company_id: companyId,
        entity_type: 'document',
        entity_id: documentId,
        event_type: `routed_to_${moduleGroup}`,
        payload: { module: moduleGroup, entity_type: targetEntityType, ...result },
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'route_failed';
    console.error('[documents/route-to]', { message, err });
    const status = routingFailureStatus(message);
    return routeToErrorResponse(status, 'route_failed', message);
  }
}
