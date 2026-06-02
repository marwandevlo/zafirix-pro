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

export type AuditAction =
  | 'created'
  | 'corrected'
  | 'reviewed'
  | 'validated'
  | 'rejected'
  | 'propagated'
  | 'routed'
  | 'archived'
  | 'deleted'
  | 'restored';

export type AuditEntityType =
  | 'document'
  | 'invoice'
  | 'supplier_invoice'
  | 'accounting_entry'
  | 'tva_suggestion'
  | 'legal_document'
  | 'payroll_record'
  | 'bank_statement'
  | 'bank_transaction'
  | 'liasse_fiscale'
  | 'routing_record'
  | 'export'
  | 'backup';

export type AuditLogParams = {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  performedBy: string;
  companyId?: string | null;
  sourceDocumentId?: string | null;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

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
    }
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

/** Human-readable label for audit actions */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  created: 'Créé',
  corrected: 'Corrigé',
  reviewed: 'Révisé',
  validated: 'Validé',
  rejected: 'Rejeté',
  propagated: 'Correction propagée',
  routed: 'Routé vers module',
  archived: 'Archivé',
  deleted: 'Supprimé',
  restored: 'Restauré',
};

export const AUDIT_ACTION_COLORS: Record<AuditAction, string> = {
  created: 'bg-blue-50 text-blue-700 border-blue-100',
  corrected: 'bg-amber-50 text-amber-700 border-amber-100',
  reviewed: 'bg-purple-50 text-purple-700 border-purple-100',
  validated: 'bg-green-50 text-green-700 border-green-100',
  rejected: 'bg-red-50 text-red-700 border-red-100',
  propagated: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  routed: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  archived: 'bg-gray-50 text-gray-600 border-gray-200',
  deleted: 'bg-red-50 text-red-800 border-red-200',
  restored: 'bg-teal-50 text-teal-700 border-teal-100',
};
