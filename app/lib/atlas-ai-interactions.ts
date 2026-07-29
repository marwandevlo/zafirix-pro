import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiSourceRef, AtlasAiInteraction } from '@/app/types/atlas-ai-copilot';
import { isMissingTableError } from '@/app/lib/atlas-api-company-guard';

export async function logAtlasAiInteraction(
  db: SupabaseClient,
  params: {
    userId: string;
    companyId: string | null;
    conversationId?: string | null;
    interactionType: string;
    prompt: string;
    answer: string;
    sourcesUsed: AiSourceRef[];
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  const { data, error } = await db
    .from('atlas_ai_interactions')
    .insert({
      user_id: params.userId,
      company_id: params.companyId,
      conversation_id: params.conversationId ?? null,
      interaction_type: params.interactionType,
      prompt: params.prompt,
      answer: params.answer,
      sources_used: params.sourcesUsed,
      metadata: params.metadata ?? {},
    })
    .select('id')
    .single();

  if (error) {
    if (isMissingTableError(error.message)) return '';
    throw new Error(error.message);
  }
  return String(data.id);
}

export async function listConversationHistory(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<AtlasAiInteraction[]> {
  const { data, error } = await db
    .from('atlas_ai_interactions')
    .select('*')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((r) => ({
    id: String(r.id),
    conversationId: r.conversation_id ? String(r.conversation_id) : null,
    interactionType: String(r.interaction_type),
    prompt: String(r.prompt),
    answer: String(r.answer),
    sourcesUsed: Array.isArray(r.sources_used) ? (r.sources_used as AiSourceRef[]) : [],
    createdAt: String(r.created_at),
  }));
}

export async function getOrCreateConversation(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
  conversationId?: string | null,
  title?: string,
): Promise<string> {
  if (conversationId) {
    const { data } = await db
      .from('atlas_ai_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  const { data, error } = await db
    .from('atlas_ai_conversations')
    .insert({
      user_id: userId,
      company_id: companyId,
      title: title?.trim() || 'Assistant IA',
      status: 'active',
    })
    .select('id')
    .single();

  if (error) {
    if (isMissingTableError(error.message)) return crypto.randomUUID();
    throw new Error(error.message);
  }
  return String(data.id);
}

export async function touchConversation(db: SupabaseClient, conversationId: string): Promise<void> {
  const { error } = await db
    .from('atlas_ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (error && !isMissingTableError(error.message)) throw new Error(error.message);
}

export type AtlasAiConversationRow = {
  id: string;
  title: string;
  status: string;
  companyId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
};

export async function listConversations(
  db: SupabaseClient,
  userId: string,
  opts?: { companyId?: string | null; search?: string; limit?: number },
): Promise<AtlasAiConversationRow[]> {
  let q = db
    .from('atlas_ai_conversations')
    .select('id, title, status, company_id, created_at, updated_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(opts?.limit ?? 30);

  if (opts?.companyId) q = q.eq('company_id', opts.companyId);
  const search = opts?.search?.trim();
  if (search) q = q.ilike('title', `%${search}%`);

  const { data, error } = await q;
  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const enriched: AtlasAiConversationRow[] = [];

  for (const row of rows) {
    const { data: last } = await db
      .from('atlas_ai_interactions')
      .select('prompt, created_at')
      .eq('conversation_id', row.id)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count } = await db
      .from('atlas_ai_interactions')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', row.id)
      .eq('user_id', userId);

    enriched.push({
      id: String(row.id),
      title: String(row.title),
      status: String(row.status),
      companyId: row.company_id ? String(row.company_id) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      messageCount: count ?? 0,
      lastMessage: last?.prompt ? String(last.prompt) : null,
    });
  }

  return enriched;
}

export async function searchConversations(
  db: SupabaseClient,
  userId: string,
  query: string,
  companyId?: string | null,
): Promise<AtlasAiConversationRow[]> {
  const q = query.trim();
  if (!q) return listConversations(db, userId, { companyId });

  const byTitle = await listConversations(db, userId, { companyId, search: q, limit: 20 });

  let iq = db
    .from('atlas_ai_interactions')
    .select('conversation_id, prompt, answer, created_at')
    .eq('user_id', userId)
    .or(`prompt.ilike.%${q}%,answer.ilike.%${q}%`)
    .order('created_at', { ascending: false })
    .limit(30);

  if (companyId) iq = iq.eq('company_id', companyId);

  const { data: hits } = await iq;
  const convIds = new Set(byTitle.map((c) => c.id));
  const extra: AtlasAiConversationRow[] = [];

  for (const hit of hits ?? []) {
    const cid = hit.conversation_id ? String(hit.conversation_id) : '';
    if (!cid || convIds.has(cid)) continue;
    convIds.add(cid);
    const { data: conv } = await db
      .from('atlas_ai_conversations')
      .select('id, title, status, company_id, created_at, updated_at')
      .eq('id', cid)
      .eq('user_id', userId)
      .maybeSingle();
    if (!conv) continue;
    extra.push({
      id: String(conv.id),
      title: String(conv.title),
      status: String(conv.status),
      companyId: conv.company_id ? String(conv.company_id) : null,
      createdAt: String(conv.created_at),
      updatedAt: String(conv.updated_at),
      messageCount: 1,
      lastMessage: String(hit.prompt),
    });
  }

  return [...byTitle, ...extra].slice(0, 30);
}

export async function updateConversationTitleFromMessage(
  db: SupabaseClient,
  conversationId: string,
  message: string,
): Promise<void> {
  const { data } = await db
    .from('atlas_ai_conversations')
    .select('title')
    .eq('id', conversationId)
    .maybeSingle();

  if (!data || (data.title !== 'Assistant IA' && data.title !== 'Conversation')) return;

  const title = message.trim().slice(0, 80) || 'Assistant IA';
  await db.from('atlas_ai_conversations').update({ title }).eq('id', conversationId);
}
