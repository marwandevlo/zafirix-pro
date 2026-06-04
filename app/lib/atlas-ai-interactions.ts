import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiSourceRef, AtlasAiInteraction } from '@/app/types/atlas-ai-copilot';

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

  if (error) throw new Error(error.message);
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

  if (error) throw new Error(error.message);

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

  if (error) throw new Error(error.message);
  return String(data.id);
}

export async function touchConversation(db: SupabaseClient, conversationId: string): Promise<void> {
  await db
    .from('atlas_ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}
