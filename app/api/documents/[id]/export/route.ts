/**
 * GET /api/documents/[id]/export?format=json|csv|xml|xlsx|pdf|zip
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
  exportToDocx,
  exportToZip,
  exportFilename,
} from '@/app/lib/atlas-document-export';
import { generateDocumentPdf, documentPdfFilename } from '@/app/lib/atlas-document-pdf-export';
import { EXPORT_CONTENT_TYPES, isExportFormat } from '@/app/lib/atlas-export-engine';
import type { AtlasDocument } from '@/app/types/atlas-document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_FORMATS = ['json', 'csv', 'xml', 'xlsx', 'docx', 'pdf', 'zip'] as const;
type ExportFormat = (typeof SUPPORTED_FORMATS)[number];

function toArrayBuffer(body: string | Buffer | ArrayBuffer): ArrayBuffer {
  if (body instanceof ArrayBuffer) return body;
  if (typeof body === 'string') return new TextEncoder().encode(body).buffer as ArrayBuffer;
  return (body as Buffer).buffer.slice(
    (body as Buffer).byteOffset,
    (body as Buffer).byteOffset + (body as Buffer).byteLength,
  ) as ArrayBuffer;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const format = (request.nextUrl.searchParams.get('format') ?? 'json') as ExportFormat;

  if (!SUPPORTED_FORMATS.includes(format as ExportFormat)) {
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

  // Fetch document + company (for PDF branding)
  const { data: doc, error: fetchErr } = await admin
    .from('atlas_documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  // Fetch company for branding (best-effort)
  const docRecord = doc as Record<string, unknown>;
  let company = null;
  if (docRecord.company_id) {
    const { data: co } = await admin
      .from('atlas_companies')
      .select('raisonSociale, ice, if_fiscal, rc, adresse, ville, telephone, email')
      .eq('id', String(docRecord.company_id))
      .maybeSingle();
    company = co;
  }

  // Build the export
  let body: string | Buffer | ArrayBuffer;
  let filename: string;

  try {
    switch (format) {
      case 'json': body = exportToJson(doc as AtlasDocument); break;
      case 'csv':  body = exportToCsv(doc as AtlasDocument);  break;
      case 'xml':  body = exportToXml(doc as AtlasDocument);  break;
      case 'xlsx': body = await exportToXlsx(doc as AtlasDocument); break;
      case 'docx': body = await exportToDocx(doc as AtlasDocument); break;
      case 'pdf':  body = generateDocumentPdf(doc as AtlasDocument, company); break;
      case 'zip':  body = await exportToZip(doc as AtlasDocument); break;
    }
    filename = format === 'pdf'
      ? documentPdfFilename(doc as AtlasDocument)
      : exportFilename(doc as AtlasDocument, format);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const arrayBuffer = toArrayBuffer(body);
  const sizeBytes = arrayBuffer.byteLength;
  const contentType = EXPORT_CONTENT_TYPES[format as ExportFormat];

  // Audit log (best-effort)
  // zafirix_exports constraint allows: json|csv|xml|xlsx|pdf|zip|edi
  void Promise.all([
    admin.from('atlas_entity_events').insert({
      user_id: userId,
      company_id: docRecord.company_id ?? null,
      entity_type: 'document',
      entity_id: documentId,
      event_type: `exported_${format}`,
      payload: { format, filename, size_bytes: sizeBytes },
    }),
    admin.from('zafirix_exports').insert({
      user_id: userId,
      company_id: docRecord.company_id ?? null,
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
