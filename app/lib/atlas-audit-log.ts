/**
 * atlas-audit-log.ts
 *
 * Reusable audit logging for every entity mutation in Atlas.
 * Writes to atlas_audit_logs (enterprise-grade append-only log).
 *
 * Usage:
 *   await logAuditEvent({ entityType: 'invoice', entityId: inv.id, action: 'validated', ... })
 */

import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logActivityFromAudit } from '@/app/lib/atlas-user-activity';
import type { AuditAction, AuditEntityType, AuditLogParams } from '@/app/lib/atlas-audit-log-constants';

export type { AuditAction, AuditEntityType, AuditLogParams } from '@/app/lib/atlas-audit-log-constants';

/**
 * Append an immutable audit event.
 * Non-throwing: failures are logged to console but never crash the caller.
 */
export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  try {
    const admin = getSupabaseServiceRoleClient();
    const { error } = await admin.from('atlas_audit_logs').insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      performed_by: params.performedBy,
      company_id: params.companyId ?? null,
      source_document_id: params.sourceDocumentId ?? null,
      old_values: params.oldValues ?? null,
      new_values: params.newValues ?? null,
      metadata: params.metadata ?? null,
    });
    if (error) {
      console.error('[audit_log] insert error:', error.message);
      return;
    }
    void logActivityFromAudit(params);
  } catch (err) {
    console.error('[audit_log] unexpected error:', err instanceof Error ? err.message : err);
  }
}

/**
 * Fetch audit history for a single entity (sorted newest-first).
 * Used for the History tab UI.
 */
export async function getEntityAuditHistory(
  entityType: AuditEntityType,
  entityId: string,
  limit = 50,
): Promise<AuditLogEntry[]> {
  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('atlas_audit_logs')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as AuditLogEntry[];
}

export type AuditLogEntry = {
  id: string;
  entity_type: string;
  entity_id: string;
  source_document_id: string | null;
  action: AuditAction;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  performed_by: string | null;
  company_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
