/**
 * GET /api/validation/queue
 *
 * Returns all routing records grouped by target_module,
 * with draft/reviewed/validated/rejected counts.
 * Also returns the full list of pending records (draft + reviewed) for the queue UI.
 *
 * Query params:
 *   status?: 'draft' | 'reviewed' | 'validated' | 'rejected' (default: draft,reviewed)
 *   module?: string (filter by module)
 *   limit?: number (default 50)
 *   offset?: number (default 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { listClientPortalPendingDocuments } from '@/app/lib/atlas-client-portal-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RoutingRecord = {
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
};

const MODULE_LABELS: Record<string, string> = {
  comptabilite: 'Comptabilité',
  factures: 'Factures',
  tva: 'TVA',
  rh: 'Ressources Humaines',
  juridique: 'Juridique',
  banque: 'Banque',
  rapports: 'Rapports',
  fiscalite: 'Fiscalité',
};

function isMissingRoutingTable(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.message?.includes('zafirix_routing_records') ||
    error.code === 'PGRST205' ||
    error.code === '42P01'
  );
}

function emptyModuleSummary() {
  return { draft: 0, reviewed: 0, validated: 0, rejected: 0, total: 0 };
}

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status') ?? 'draft,reviewed';
  const moduleFilter = url.searchParams.get('module');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');

  const statuses = statusFilter.split(',').filter(Boolean);
  const admin = getSupabaseServiceRoleClient();

  const summary: Record<string, { draft: number; reviewed: number; validated: number; rejected: number; total: number }> = {};

  const { data: allRecords, error: summaryError } = await admin
    .from('zafirix_routing_records')
    .select('target_module, validation_status')
    .eq('user_id', userId)
    .eq('routing_status', 'completed');

  const routingTableAvailable = !isMissingRoutingTable(summaryError);
  if (summaryError && !routingTableAvailable) {
    // Fall through — client portal documents supply the queue.
  } else if (summaryError) {
    return NextResponse.json({ error: summaryError.message }, { status: 500 });
  } else {
    for (const rec of allRecords ?? []) {
      const mod = rec.target_module as string;
      if (!summary[mod]) summary[mod] = emptyModuleSummary();
      const st = rec.validation_status as string;
      if (st in summary[mod]) (summary[mod] as Record<string, number>)[st]++;
      summary[mod].total++;
    }
  }

  let enrichedRecords: Array<RoutingRecord & { source_document_filename: string | null; module_label: string }> = [];

  if (routingTableAvailable) {
    let query = admin
      .from('zafirix_routing_records')
      .select('id, source_document_id, source_document_type, target_module, target_entity_type, target_entity_id, validation_status, extraction_confidence, payload, created_at, updated_at')
      .eq('user_id', userId)
      .eq('routing_status', 'completed')
      .in('validation_status', statuses)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (moduleFilter) {
      query = query.eq('target_module', moduleFilter);
    }

    const { data: records, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const docIds = [...new Set((records ?? []).map((r) => r.source_document_id as string).filter(Boolean))];
    const docNames: Record<string, string> = {};
    if (docIds.length > 0) {
      const { data: docs } = await admin
        .from('atlas_documents')
        .select('id, filename, document_type')
        .in('id', docIds);
      for (const d of docs ?? []) {
        docNames[d.id] = d.filename ?? `Document ${d.id.slice(0, 8)}`;
      }
    }

    enrichedRecords = (records ?? [] as RoutingRecord[]).map((r) => ({
      ...r,
      source_document_filename: docNames[r.source_document_id] ?? null,
      module_label: MODULE_LABELS[r.target_module] ?? r.target_module,
    }));

    const clientPortalRows = await listClientPortalPendingDocuments(admin, userId);
    const existingDocIds = new Set(enrichedRecords.map((r) => r.source_document_id));
    for (const row of clientPortalRows) {
      if (!existingDocIds.has(row.source_document_id)) enrichedRecords.push(row);
    }
  } else {
    enrichedRecords = await listClientPortalPendingDocuments(admin, userId);
    const filtered = enrichedRecords.filter((r) => statuses.includes(r.validation_status));
    if (moduleFilter) {
      enrichedRecords = filtered.filter((r) => r.target_module === moduleFilter);
    } else {
      enrichedRecords = filtered;
    }

    for (const rec of enrichedRecords) {
      const mod = rec.target_module;
      if (!summary[mod]) summary[mod] = emptyModuleSummary();
      const st = rec.validation_status;
      if (st in summary[mod]) (summary[mod] as Record<string, number>)[st]++;
      summary[mod].total++;
    }
  }

  return NextResponse.json({
    ok: true,
    summary: Object.entries(summary).map(([mod, counts]) => ({
      module: mod,
      label: MODULE_LABELS[mod] ?? mod,
      ...counts,
    })).sort((a, b) => b.draft - a.draft),
    records: enrichedRecords,
    pagination: { limit, offset, returned: enrichedRecords.length },
    queueSource: routingTableAvailable ? 'routing_records' : 'client_portal_documents',
  });
}
