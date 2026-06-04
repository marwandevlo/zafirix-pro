/**
 * GET /api/assistant/conversations/[id] — reopen conversation with history
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { listConversationHistory } from '@/app/lib/atlas-ai-interactions';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { id } = await context.params;
  const db = getSupabaseServiceRoleClient();

  const { data: conv } = await db
    .from('atlas_ai_conversations')
    .select('id, title, status, company_id, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const history = await listConversationHistory(db, userId, id);
  const messages = history.flatMap((h) => [
    { role: 'user' as const, content: h.prompt, createdAt: h.createdAt, sources: [] },
    { role: 'assistant' as const, content: h.answer, createdAt: h.createdAt, sources: h.sourcesUsed },
  ]);

  return NextResponse.json({
    ok: true,
    conversation: {
      id: String(conv.id),
      title: String(conv.title),
      status: String(conv.status),
      companyId: conv.company_id ? String(conv.company_id) : null,
      createdAt: String(conv.created_at),
      updatedAt: String(conv.updated_at),
    },
    messages,
    history,
  });
}
