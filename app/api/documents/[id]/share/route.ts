/**
 * POST /api/documents/[id]/share   — create secure share link
 * GET  /api/documents/[id]/share   — list active share links for this document
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreateShareBody = {
  permissions?: 'read_only' | 'download';
  /** ISO duration in hours, e.g. 72. Default: 168 (7 days). */
  expiresInHours?: number;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  let body: CreateShareBody = {};
  try { body = await request.json() as CreateShareBody; } catch { /* defaults */ }

  const permissions = body.permissions ?? 'read_only';
  const expiresInHours = typeof body.expiresInHours === 'number' ? body.expiresInHours : 168;

  const admin = getSupabaseServiceRoleClient();

  const { data: doc, error: fetchErr } = await admin
    .from('atlas_documents')
    .select('id, company_id, filename')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  const { data: link, error: insertErr } = await admin
    .from('zafirix_share_links')
    .insert({
      company_id: doc.company_id,
      created_by: userId,
      entity_type: 'document',
      entity_id: documentId,
      token,
      permissions,
      expires_at: expiresAt,
    })
    .select('id, token, permissions, expires_at, created_at')
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Audit
  void admin.from('atlas_entity_events').insert({
    user_id: userId,
    company_id: doc.company_id,
    entity_type: 'document',
    entity_id: documentId,
    event_type: 'shared',
    payload: { token: token.slice(0, 8) + '…', permissions, expires_at: expiresAt },
  });

  const baseUrl = request.nextUrl.origin;
  return NextResponse.json({
    ok: true,
    shareLink: `${baseUrl}/share/${token}`,
    token,
    permissions: link.permissions,
    expiresAt: link.expires_at,
    createdAt: link.created_at,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const admin = getSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from('zafirix_share_links')
    .select('id, token, permissions, expires_at, revoked_at, accessed_count, last_accessed_at, created_at')
    .eq('entity_type', 'document')
    .eq('entity_id', documentId)
    .eq('created_by', userId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const baseUrl = request.nextUrl.origin;
  const links = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    shareLink: `${baseUrl}/share/${String(row.token)}`,
    active: !row.revoked_at && (row.expires_at == null || new Date(String(row.expires_at)) > new Date()),
  }));

  return NextResponse.json({ links });
}
