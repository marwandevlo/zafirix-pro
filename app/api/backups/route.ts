/**
 * GET /api/backups
 * Returns paginated backup history for the authenticated user.
 * Query params: ?limit=20&offset=0&provider=google_drive
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const limit  = Math.min(Number(sp.get('limit') ?? 50), 100);
  const offset = Number(sp.get('offset') ?? 0);
  const provider = sp.get('provider') ?? null;

  const admin = getSupabaseServiceRoleClient();

  let query = admin
    .from('zafirix_backups')
    .select('id, entity_type, entity_id, provider, file_format, filename, file_size_bytes, provider_url, sync_status, error_message, last_synced_at, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (provider) query = query.eq('provider', provider);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ backups: data ?? [], total: count ?? 0 });
}
