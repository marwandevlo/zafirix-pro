import type { SupabaseClient } from '@supabase/supabase-js';
import { asRecord } from '@/app/lib/atlas-json';
import type { ClientPortalSession } from '@/app/lib/atlas-client-portal';

export type ClientPortalQueueResult =
  | { ok: true; method: 'routing_record' }
  | { ok: true; method: 'document_metadata' };

/** Enqueue client upload for accountant validation (/validation). */
export async function enqueueClientPortalForValidation(
  admin: SupabaseClient,
  session: ClientPortalSession,
  documentId: string,
  payload: Record<string, unknown>,
): Promise<ClientPortalQueueResult> {
  const { error } = await admin.from('zafirix_routing_records').insert({
    user_id: session.ownerUserId,
    company_id: session.companyId,
    source_document_id: documentId,
    source_document_type: 'receipt',
    target_module: 'comptabilite',
    target_entity_type: 'client_upload',
    routing_status: 'completed',
    generated_by: 'client_portal',
    validation_status: 'draft',
    payload,
  });

  if (!error) return { ok: true, method: 'routing_record' };

  if (!isMissingRoutingTableError(error)) throw new Error(error.message);

  const { data: doc } = await admin
    .from('atlas_documents')
    .select('metadata')
    .eq('id', documentId)
    .maybeSingle();

  const metadata = asRecord((doc as { metadata?: unknown } | null)?.metadata) ?? {};
  await admin
    .from('atlas_documents')
    .update({
      metadata: {
        ...metadata,
        validationQueuePending: true,
        validationStatus: 'draft',
        clientPortalUpload: true,
        targetModule: 'comptabilite',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId);

  return { ok: true, method: 'document_metadata' };
}

export function isMissingRoutingTableError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.message?.includes('zafirix_routing_records') ||
    error.code === 'PGRST205' ||
    error.code === '42P01'
  );
}

/** Count pending client portal uploads (draft / needs review) for validation KPIs. */
export async function countClientPortalPendingDocuments(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const rows = await listClientPortalPendingDocuments(admin, userId);
  return rows.length;
}

/** Synthetic queue rows from atlas_documents when routing table unavailable or as supplement. */
export async function listClientPortalPendingDocuments(
  admin: SupabaseClient,
  userId: string,
): Promise<
  Array<{
    id: string;
    source_document_id: string;
    source_document_type: string;
    target_module: string;
    target_entity_type: string;
    target_entity_id: string | null;
    validation_status: string;
    extraction_confidence: number | null;
    payload: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    source_document_filename: string | null;
    module_label: string;
  }>
> {
  const { data: docs } = await admin
    .from('atlas_documents')
    .select('id, filename, title, type, metadata, created_at, updated_at')
    .eq('user_id', userId)
    .eq('source', 'client_portal')
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = [];
  for (const d of docs ?? []) {
    const row = d as Record<string, unknown>;
    const meta = asRecord(row.metadata) ?? {};
    if (!meta.clientPortalUpload && !meta.validationQueuePending) continue;
    if (meta.validationStatus === 'validated' || meta.validationStatus === 'rejected') continue;

    rows.push({
      id: `client-portal-${String(row.id)}`,
      source_document_id: String(row.id),
      source_document_type: String(row.type ?? 'receipt'),
      target_module: String(meta.targetModule ?? 'comptabilite'),
      target_entity_type: 'client_upload',
      target_entity_id: null,
      validation_status: String(meta.validationStatus ?? 'draft'),
      extraction_confidence: null,
      payload: meta,
      created_at: String(row.created_at ?? new Date().toISOString()),
      updated_at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
      source_document_filename: String(row.filename ?? row.title ?? 'Upload client'),
      module_label: 'Comptabilité (client)',
    });
  }
  return rows;
}
