/**
 * GET /api/share/[token]
 * Public endpoint — no auth required.
 * Returns sanitised document data for a valid, non-expired, non-revoked share link.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { buildDocumentExportPayload } from '@/app/lib/atlas-document-export';
import type { AtlasDocument } from '@/app/types/atlas-document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const admin = getSupabaseServiceRoleClient();

  const { data: link, error: linkErr } = await admin
    .from('zafirix_share_links')
    .select('id, entity_type, entity_id, permissions, expires_at, revoked_at, accessed_count')
    .eq('token', token)
    .maybeSingle();

  if (linkErr || !link) {
    return NextResponse.json({ error: 'link_not_found' }, { status: 404 });
  }

  if (link.revoked_at) {
    return NextResponse.json({ error: 'link_revoked' }, { status: 410 });
  }

  if (link.expires_at && new Date(String(link.expires_at)) < new Date()) {
    return NextResponse.json({ error: 'link_expired' }, { status: 410 });
  }

  if (link.entity_type !== 'document') {
    return NextResponse.json({ error: 'unsupported_entity_type' }, { status: 422 });
  }

  const { data: doc, error: docErr } = await admin
    .from('atlas_documents')
    .select('*')
    .eq('id', String(link.entity_id))
    .maybeSingle();

  if (docErr || !doc) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  // Increment access counter (best-effort)
  void admin
    .from('zafirix_share_links')
    .update({ accessed_count: (Number(link.accessed_count ?? 0) + 1), last_accessed_at: new Date().toISOString() })
    .eq('id', String(link.id));

  const payload = buildDocumentExportPayload(doc as AtlasDocument);

  return NextResponse.json({
    ok: true,
    permissions: link.permissions,
    expiresAt: link.expires_at,
    document: payload,
  });
}
