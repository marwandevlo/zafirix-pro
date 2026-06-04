/**
 * GET /api/assistant/conversations — list & search conversations
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { listConversations, searchConversations } from '@/app/lib/atlas-ai-interactions';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim() || null;
  const search = request.nextUrl.searchParams.get('search')?.trim() || '';
  const db = getSupabaseServiceRoleClient();

  const conversations = search
    ? await searchConversations(db, userId, search, companyId)
    : await listConversations(db, userId, { companyId });

  return NextResponse.json({ ok: true, conversations });
}
