/**
 * GET /api/documents/[id]/export?format=json|csv|xml|xlsx
 * Returns a downloadable file for the document.
 * Logs export to atlas_entity_events + zafirix_exports.
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import {
  exportToJson,
  exportToCsv,
  exportToXml,
  exportToXlsx,
  exportFilename,
} from '@/app/lib/atlas-document-export';
import type { AtlasDocument } from '@/app/types/atlas-document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_FORMATS = ['json', 'csv', 'xml', 'xlsx'] as const;
type ExportFormat = (typeof SUPPORTED_FORMATS)[number];

const CONTENT_TYPES: Record<ExportFormat, string> = {
  json: 'application/json',
  csv: 'text/csv; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const format = (request.nextUrl.searchParams.get('format') ?? 'json') as ExportFormat;

  if (!SUPPORTED_FORMATS.includes(format)) {
    return NextResponse.json(
      { error: 'format_not_supported', supported: SUPPORTED_FORMATS },
      { status: 400 },
    );
  }

  const userId = await documentUploadSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const admin = getSupabaseServiceRoleClient();

  const { data: doc, error: fetchErr } = await admin
    .from('atlas_documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  // Build the export
  let body: string | Buffer;
  try {
    if (format === 'json') body = exportToJson(doc as AtlasDocument);
    else if (format === 'csv') body = exportToCsv(doc as AtlasDocument);
    else if (format === 'xml') body = exportToXml(doc as AtlasDocument);
    else body = await exportToXlsx(doc as AtlasDocument);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const filename = exportFilename(doc as AtlasDocument, format);
  const contentType = CONTENT_TYPES[format];

  // Convert to ArrayBuffer for NextResponse compatibility
  const arrayBuffer: ArrayBuffer = typeof body === 'string'
    ? new TextEncoder().encode(body).buffer as ArrayBuffer
    : (body as Buffer).buffer.slice(
        (body as Buffer).byteOffset,
        (body as Buffer).byteOffset + (body as Buffer).byteLength,
      ) as ArrayBuffer;

  const sizeBytes = arrayBuffer.byteLength;

  // Audit log (best-effort)
  void Promise.all([
    admin.from('atlas_entity_events').insert({
      user_id: userId,
      company_id: (doc as Record<string, unknown>).company_id ?? null,
      entity_type: 'document',
      entity_id: documentId,
      event_type: `exported_${format}`,
      payload: { format, filename, size_bytes: sizeBytes },
    }),
    admin.from('zafirix_exports').insert({
      user_id: userId,
      company_id: (doc as Record<string, unknown>).company_id ?? null,
      entity_type: 'document',
      entity_id: documentId,
      format,
      filename,
      file_size_bytes: sizeBytes,
    }),
  ]);

  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(sizeBytes),
      'Cache-Control': 'no-store',
    },
  });
}
