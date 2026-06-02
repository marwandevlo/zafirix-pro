/**
 * Documents IA — lifecycle event logging (zafirix_document_events table).
 *
 * Every significant event in a document's lifecycle is stored here for
 * observability, debugging, and audit.
 */

import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';

export type DocumentEventType =
  | 'uploaded'
  | 'registered'
  | 'sha256_dedup_hit'
  | 'ocr_started'
  | 'page_count_detected'
  | 'classified'
  | 'extraction_completed'
  | 'ocr_failed'
  | 'ocr_recovered'
  | 'validation_required'
  | 'user_validated'
  | 'user_rejected'
  | 'user_corrected'
  | 'routed_to_module'
  | 'routed_to_comptabilite'
  | 'routed_to_factures'
  | 'routed_to_banque'
  | 'routed_to_rh'
  | 'routed_to_juridique'
  | 'routed_to_rapports'
  | 'routed_to_tva'
  | 'correction_propagated'
  | 'downstream_record_created'
  | 'downstream_record_updated'
  | 'supplier_invoice_created'
  | 'accounting_draft_created'
  | 'archived'
  | 'deleted';

export type DocumentEventSeverity = 'info' | 'warn' | 'error';

export async function logDocumentEvent(params: {
  companyId: string;
  documentId: string;
  userId: string;
  eventType: DocumentEventType;
  severity?: DocumentEventSeverity;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = getSupabaseServiceRoleClient();
    await supabase.from('zafirix_document_events').insert({
      company_id: params.companyId,
      document_id: params.documentId,
      user_id: params.userId,
      event_type: params.eventType,
      severity: params.severity ?? 'info',
      payload: params.payload ?? {},
    });
  } catch (err) {
    // Never throw — event logging must be best-effort
    logAtlasServerEvent('document_events', 'error', 'log_event_failed', {
      documentId: params.documentId,
      eventType: params.eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
