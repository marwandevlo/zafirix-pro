/**
 * GET /api/audit/recent
 *
 * Returns recent audit events, optionally filtered by entity_type.
 * Used for History tabs in module pages.
 *
 * Query params:
 *   entityType  — filter to a specific entity type (invoice, accounting_entry, etc.)
 *   entityId    — filter to a specific entity (optional)
 *   limit       — max results (default 50, max 100)
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10));

  const admin = getSupabaseServiceRoleClient();

  let query = admin
    .from('atlas_audit_logs')
    .select('id, entity_type, entity_id, action, performed_by, source_document_id, old_values, new_values, metadata, created_at')
    .eq('performed_by', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (entityType) query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', entityId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, events: data ?? [] });
}
