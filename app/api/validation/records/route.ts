/**
 * PATCH /api/validation/records
 *
 * Update validation_status of one or more routing records.
 * Cascades the status change to the underlying entity (invoice, entry, TVA, etc.).
 *
 * Body: {
 *   ids: string[];       // zafirix_routing_records ids
 *   action: 'review' | 'validate' | 'reject';
 *   reason?: string;
 * }
 *
 * Logs each change to atlas_audit_logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { logAuditEvent } from '@/app/lib/atlas-audit-log';
import type { AuditAction } from '@/app/lib/atlas-audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTION_TO_STATUS: Record<string, string> = {
  review: 'reviewed',
  validate: 'validated',
  reject: 'rejected',
};

const ACTION_TO_AUDIT: Record<string, AuditAction> = {
  review: 'reviewed',
  validate: 'validated',
  reject: 'rejected',
};

export async function PATCH(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: { ids?: string[]; action?: string; reason?: string };
  try { body = (await request.json()) as typeof body; }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const { ids, action, reason } = body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids_required' }, { status: 400 });
  }
  if (!action || !ACTION_TO_STATUS[action]) {
    return NextResponse.json({ error: 'invalid_action', allowed: Object.keys(ACTION_TO_STATUS) }, { status: 400 });
  }

  const newStatus = ACTION_TO_STATUS[action]!;
  const auditAction = ACTION_TO_AUDIT[action]!;
  const admin = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();

  // Fetch routing records to validate ownership + get entity info
  const { data: records, error: fetchErr } = await admin
    .from('zafirix_routing_records')
    .select('id, user_id, company_id, validation_status, target_module, target_entity_type, target_entity_id, source_document_id, payload')
    .in('id', ids)
    .eq('user_id', userId);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!records || records.length === 0) {
    return NextResponse.json({ error: 'records_not_found' }, { status: 404 });
  }

  const updated: string[] = [];
  const cascaded: string[] = [];
  const skipped: string[] = [];

  for (const rec of records) {
    if (rec.validation_status === newStatus) {
      skipped.push(rec.id);
      continue;
    }

    const oldStatus = rec.validation_status as string;

    // Update routing record
    await admin.from('zafirix_routing_records')
      .update({ validation_status: newStatus, updated_at: now })
      .eq('id', rec.id);
    updated.push(rec.id);

    // Cascade to entity table
    const entityId = rec.target_entity_id as string | null;
    if (entityId) {
      const tableMap: Record<string, string> = {
        supplier_invoice: 'atlas_supplier_invoices',
        sales_invoice: 'atlas_invoices',
        accounting_entry: 'atlas_accounting_entries',
        legal_document: 'zafirix_legal_documents',
      };
      const entityTable = tableMap[rec.target_entity_type as string];
      if (entityTable) {
        const { error: cascadeErr } = await admin
          .from(entityTable)
          .update({ validation_status: newStatus, updated_at: now })
          .eq('id', entityId);
        if (!cascadeErr) cascaded.push(`${entityTable}:${entityId}`);
      }

      // Also update TVA suggestions linked to this document
      if (rec.target_module === 'comptabilite' && rec.source_document_id) {
        await admin.from('zafirix_tva_suggestions')
          .update({ status: newStatus === 'validated' ? 'validated' : newStatus === 'rejected' ? 'rejected' : 'reviewed', updated_at: now })
          .eq('source_document_id', rec.source_document_id)
          .eq('status', 'pending');
      }
    }

    // Audit log
    await logAuditEvent({
      entityType: 'routing_record',
      entityId: rec.id,
      action: auditAction,
      performedBy: userId,
      companyId: rec.company_id as string | null,
      sourceDocumentId: rec.source_document_id as string | null,
      oldValues: { validation_status: oldStatus },
      newValues: { validation_status: newStatus },
      metadata: { reason: reason ?? null, target_module: rec.target_module, target_entity_type: rec.target_entity_type },
    });
  }

  return NextResponse.json({
    ok: true,
    updated: updated.length,
    cascaded: cascaded.length,
    skipped: skipped.length,
    new_status: newStatus,
  });
}
