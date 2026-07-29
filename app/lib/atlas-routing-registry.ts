/**
 * Shared routing record registry — used by validate and route-to paths.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentValidationResult } from '@/app/lib/atlas-document-validation-server';

export type RoutingRecordParams = {
  userId: string;
  companyId: string | null;
  documentId: string;
  documentType: string;
  targetModule: string;
  targetEntityType: string;
  targetEntityId?: string | null;
  extractionConfidence?: number | null;
  payload?: Record<string, unknown>;
};

export async function findExistingRoutingRecord(
  admin: SupabaseClient,
  documentId: string,
  targetModule: string,
  targetEntityType: string,
): Promise<{ id: string; target_entity_id: string | null } | null> {
  const { data } = await admin
    .from('zafirix_routing_records')
    .select('id, target_entity_id')
    .eq('source_document_id', documentId)
    .eq('target_module', targetModule)
    .eq('target_entity_type', targetEntityType)
    .eq('routing_status', 'completed')
    .maybeSingle();
  if (!data?.id) return null;
  return { id: String(data.id), target_entity_id: data.target_entity_id ? String(data.target_entity_id) : null };
}

export async function registerDocumentRoutingRecord(
  admin: SupabaseClient,
  params: RoutingRecordParams,
): Promise<string | null> {
  const existing = await findExistingRoutingRecord(
    admin,
    params.documentId,
    params.targetModule,
    params.targetEntityType,
  );
  if (existing) return existing.id;

  const { data, error } = await admin
    .from('zafirix_routing_records')
    .insert({
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
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return null;
    throw new Error(error.message);
  }
  return data?.id ? String(data.id) : null;
}

/** Register routing records after document validation (prevents duplicate route-to inserts). */
export async function registerRoutingAfterValidation(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  documentId: string,
  documentType: string,
  registration: DocumentValidationResult & { ok: true },
): Promise<string[]> {
  const routedModules: string[] = [];

  if (registration.documentKind === 'bank_statement' && registration.statementId) {
    await registerDocumentRoutingRecord(admin, {
      userId,
      companyId,
      documentId,
      documentType,
      targetModule: 'banque',
      targetEntityType: 'bank_statement',
      targetEntityId: registration.statementId,
      payload: { transaction_count: registration.transactionCount ?? 0 },
    });
    routedModules.push('banque');
  }

  if (registration.documentKind === 'invoice' && registration.invoiceIds.length > 0) {
    for (const invoiceId of registration.invoiceIds) {
      await registerDocumentRoutingRecord(admin, {
        userId,
        companyId,
        documentId,
        documentType,
        targetModule: 'comptabilite',
        targetEntityType: 'supplier_invoice',
        targetEntityId: invoiceId,
        payload: {
          journal_line_count: registration.journalLineCount,
          tva_amount: registration.tvaAmount,
        },
      });
    }
    routedModules.push('comptabilite');
    if (registration.tvaAmount > 0) {
      await registerDocumentRoutingRecord(admin, {
        userId,
        companyId,
        documentId,
        documentType,
        targetModule: 'tva',
        targetEntityType: 'tva_suggestion',
        targetEntityId: registration.invoiceIds[0] ?? null,
        payload: { tva_amount: registration.tvaAmount },
      });
      routedModules.push('tva');
    }
  }

  return [...new Set(routedModules)];
}
