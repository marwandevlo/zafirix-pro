/**
 * GET /api/entities/[type]/[id]/history
 * Returns audit events for any entity (documents, invoices, supplier_invoices, etc.)
 * Sources:
 *   - atlas_audit_logs (Phase 9+, primary source)
 *   - atlas_entity_events (legacy generic events)
 *   - zafirix_document_events (documents only, legacy)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAgentsRouteDb } from '@/app/lib/atlas-agents-route-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type HistoryRow = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  performedBy?: string;
  source?: 'audit_log' | 'entity_event' | 'document_event';
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type: entityType, id: entityId } = await params;

  const ctx = await requireAgentsRouteDb(request);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { db } = ctx;

  const events: HistoryRow[] = [];
  const seenIds = new Set<string>();

  // 1. Atlas audit logs (primary source — Phase 9+)
  const { data: auditData } = await db
    .from('atlas_audit_logs')
    .select('id, action, entity_type, entity_id, performed_by, source_document_id, old_values, new_values, metadata, created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(50);

  for (const row of auditData ?? []) {
    const id = `audit-${String(row.id)}`;
    seenIds.add(id);
    events.push({
      id,
      eventType: String(row.action),
      payload: {
        action: row.action,
        source_document_id: row.source_document_id,
        old_values: row.old_values,
        new_values: row.new_values,
        metadata: row.metadata,
      },
      createdAt: String(row.created_at),
      performedBy: row.performed_by ? String(row.performed_by) : undefined,
      source: 'audit_log',
    });
  }

  // 2. Generic entity events (legacy fallback)
  const { data: entityEventsData } = await db
    .from('atlas_entity_events')
    .select('id, event_type, payload, created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(50);

  for (const row of entityEventsData ?? []) {
    const id = String(row.id);
    if (!seenIds.has(id)) {
      seenIds.add(id);
      events.push({
        id,
        eventType: String(row.event_type),
        payload: (row.payload && typeof row.payload === 'object') ? row.payload as Record<string, unknown> : {},
        createdAt: String(row.created_at),
        source: 'entity_event',
      });
    }
  }

  // 3. zafirix_document_events for documents (legacy)
  if (entityType === 'document') {
    const { data: docEventsData } = await db
      .from('zafirix_document_events')
      .select('id, event_type, payload, created_at')
      .eq('document_id', entityId)
      .order('created_at', { ascending: false })
      .limit(50);

    for (const row of docEventsData ?? []) {
      const id = `doc-${String(row.id)}`;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        events.push({
          id,
          eventType: String(row.event_type),
          payload: (row.payload && typeof row.payload === 'object') ? row.payload as Record<string, unknown> : {},
          createdAt: String(row.created_at),
          source: 'document_event',
        });
      }
    }
  }

  // Sort combined by createdAt desc
  events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ events: events.slice(0, 60) });
}
