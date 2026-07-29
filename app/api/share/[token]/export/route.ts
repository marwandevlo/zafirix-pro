/**
 * GET /api/share/[token]/export?format=pdf|xlsx|docx|xml|csv|json|zip
 * Public token-scoped export — validates share link permissions.
 */
import { NextRequest, NextResponse } from 'next/server';
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

function toArrayBuffer(body: string | Buffer | ArrayBuffer): ArrayBuffer {
  if (body instanceof ArrayBuffer) return body;
  if (typeof body === 'string') return new TextEncoder().encode(body).buffer as ArrayBuffer;
  return (body as Buffer).buffer.slice(
    (body as Buffer).byteOffset,
    (body as Buffer).byteOffset + (body as Buffer).byteLength,
  ) as ArrayBuffer;
}

async function resolveShareLink(token: string) {
  const admin = getSupabaseServiceRoleClient();
  const { data: link, error } = await admin
    .from('zafirix_share_links')
    .select('id, entity_type, entity_id, permissions, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (error || !link) return { error: 'link_not_found' as const };
  if (link.revoked_at) return { error: 'link_revoked' as const };
  if (link.expires_at && new Date(String(link.expires_at)) < new Date()) {
    return { error: 'link_expired' as const };
  }
  if (link.entity_type !== 'document') return { error: 'unsupported_entity_type' as const };
  if (link.permissions !== 'download') return { error: 'download_not_permitted' as const };

  const { data: doc } = await admin
    .from('atlas_documents')
    .select('*')
    .eq('id', String(link.entity_id))
    .maybeSingle();

  if (!doc) return { error: 'document_not_found' as const };
  return { link, doc: doc as AtlasDocument };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const formatParam = request.nextUrl.searchParams.get('format') ?? 'pdf';

  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }
  if (!isExportFormat(formatParam)) {
    return NextResponse.json({ error: 'format_not_supported' }, { status: 400 });
  }

  const resolved = await resolveShareLink(token);
  if ('error' in resolved) {
    const status =
      resolved.error === 'link_not_found' || resolved.error === 'document_not_found'
        ? 404
        : resolved.error === 'download_not_permitted'
          ? 403
          : 410;
    return NextResponse.json({ error: resolved.error }, { status });
  }

  const { doc } = resolved;
  const format = formatParam;

  let body: string | Buffer | ArrayBuffer;
  let filename: string;

  try {
    switch (format) {
      case 'json':
        body = exportToJson(doc);
        break;
      case 'csv':
        body = exportToCsv(doc);
        break;
      case 'xml':
        body = exportToXml(doc);
        break;
      case 'xlsx':
        body = await exportToXlsx(doc);
        break;
      case 'docx':
        body = await exportToDocx(doc);
        break;
      case 'zip':
        body = await exportToZip(doc);
        break;
      default:
        body = generateDocumentPdf(doc, null);
        break;
    }
    filename =
      format === 'pdf' ? documentPdfFilename(doc) : exportFilename(doc, format);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const arrayBuffer = toArrayBuffer(body);

  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': EXPORT_CONTENT_TYPES[format],
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(arrayBuffer.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
