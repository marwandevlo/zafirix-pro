/**
 * GET /api/entities/[type]/[id]/history
 * Returns audit events for any entity (documents, invoices, supplier_invoices, etc.)
 * Sources:
 *   - atlas_entity_events (generic, all entity types)
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

  // 1. Generic entity events
  const { data: entityEventsData } = await db
    .from('atlas_entity_events')
    .select('id, event_type, payload, created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(50);

  for (const row of entityEventsData ?? []) {
    events.push({
      id: String(row.id),
      eventType: String(row.event_type),
      payload: (row.payload && typeof row.payload === 'object') ? row.payload as Record<string, unknown> : {},
      createdAt: String(row.created_at),
    });
  }

  // 2. zafirix_document_events for documents
  if (entityType === 'document') {
    const { data: docEventsData } = await db
      .from('zafirix_document_events')
      .select('id, event_type, payload, created_at')
      .eq('document_id', entityId)
      .order('created_at', { ascending: false })
      .limit(50);

    for (const row of docEventsData ?? []) {
      events.push({
        id: `doc-${String(row.id)}`,
        eventType: String(row.event_type),
        payload: (row.payload && typeof row.payload === 'object') ? row.payload as Record<string, unknown> : {},
        createdAt: String(row.created_at),
      });
    }
  }

  // Sort combined by createdAt desc
  events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ events: events.slice(0, 60) });
}
