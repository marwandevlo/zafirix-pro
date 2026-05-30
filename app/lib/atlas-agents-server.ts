import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtlasAgentConversation,
  AtlasAgentMessage,
  AtlasAgentOverviewStats,
  AtlasAgentTask,
  AtlasAgentType,
  AtlasAgentTypeStats,
} from '@/app/types/atlas-agent';
import { ATLAS_AGENT_TYPES } from '@/app/types/atlas-agent';
import { asRecord } from '@/app/lib/atlas-json';
import { isAtlasAgentType } from '@/app/lib/atlas-agents-config';
import { runAgentAssistantReply } from '@/app/lib/atlas-agents-ai';

function rowToConversation(row: Record<string, unknown>): AtlasAgentConversation {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyId: row.company_id == null ? null : String(row.company_id),
    agentType: String(row.agent_type) as AtlasAgentType,
    title: String(row.title ?? ''),
    status: (String(row.status ?? 'active') === 'archived' ? 'archived' : 'active'),
    metadata: asRecord(row.metadata) ?? {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function rowToMessage(row: Record<string, unknown>): AtlasAgentMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    userId: String(row.user_id),
    role: String(row.role) as AtlasAgentMessage['role'],
    content: String(row.content ?? ''),
    metadata: asRecord(row.metadata) ?? {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function rowToTask(row: Record<string, unknown>): AtlasAgentTask {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyId: row.company_id == null ? null : String(row.company_id),
    conversationId: row.conversation_id == null ? null : String(row.conversation_id),
    agentType: String(row.agent_type) as AtlasAgentType,
    taskKind: String(row.task_kind ?? 'message'),
    status: String(row.status ?? 'pending') as AtlasAgentTask['status'],
    inputJson: asRecord(row.input_json) ?? {},
    outputJson: asRecord(row.output_json) ?? {},
    error: row.error == null ? null : String(row.error),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
  };
}

export async function listAgentConversations(
  db: SupabaseClient,
  userId: string,
  opts?: { agentType?: AtlasAgentType; companyId?: string | null },
): Promise<AtlasAgentConversation[]> {
  let q = db
    .from('atlas_agent_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (opts?.agentType) q = q.eq('agent_type', opts.agentType);
  if (opts?.companyId) q = q.eq('company_id', opts.companyId);

  const { data, error } = await q.limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToConversation(r as Record<string, unknown>));
}

export async function getAgentConversation(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<AtlasAgentConversation | null> {
  const { data, error } = await db
    .from('atlas_agent_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToConversation(data as Record<string, unknown>);
}

export async function createAgentConversation(
  db: SupabaseClient,
  userId: string,
  params: { agentType: AtlasAgentType; companyId?: string | null; title?: string },
): Promise<AtlasAgentConversation> {
  const title = params.title?.trim() || `Conversation ${params.agentType}`;
  const { data, error } = await db
    .from('atlas_agent_conversations')
    .insert({
      user_id: userId,
      company_id: params.companyId ?? null,
      agent_type: params.agentType,
      title,
      status: 'active',
      metadata: {},
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'create_failed');
  return rowToConversation(data as Record<string, unknown>);
}

export async function listAgentMessages(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<AtlasAgentMessage[]> {
  const conv = await getAgentConversation(db, userId, conversationId);
  if (!conv) return [];

  const { data, error } = await db
    .from('atlas_agent_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToMessage(r as Record<string, unknown>));
}

export async function listAgentTasks(
  db: SupabaseClient,
  userId: string,
  opts?: { agentType?: AtlasAgentType; conversationId?: string },
): Promise<AtlasAgentTask[]> {
  let q = db
    .from('atlas_agent_tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (opts?.agentType) q = q.eq('agent_type', opts.agentType);
  if (opts?.conversationId) q = q.eq('conversation_id', opts.conversationId);

  const { data, error } = await q.limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToTask(r as Record<string, unknown>));
}

export async function getAgentOverviewStats(
  db: SupabaseClient,
  userId: string,
  companyId?: string | null,
): Promise<AtlasAgentOverviewStats> {
  let convQ = db.from('atlas_agent_conversations').select('id, agent_type, updated_at').eq('user_id', userId);
  let taskQ = db.from('atlas_agent_tasks').select('agent_type, status, updated_at').eq('user_id', userId);

  if (companyId) {
    convQ = convQ.eq('company_id', companyId);
    taskQ = taskQ.eq('company_id', companyId);
  }

  const [convRes, taskRes] = await Promise.all([convQ, taskQ]);
  if (convRes.error) throw new Error(convRes.error.message);
  if (taskRes.error) throw new Error(taskRes.error.message);

  const byType: AtlasAgentTypeStats[] = ATLAS_AGENT_TYPES.map((agentType) => {
    const convs = (convRes.data ?? []).filter((c) => String(c.agent_type) === agentType);
    const tasks = (taskRes.data ?? []).filter((t) => String(t.agent_type) === agentType);
    const lastConv = convs.reduce<string | null>((best, c) => {
      const ts = String(c.updated_at ?? '');
      return !best || ts > best ? ts : best;
    }, null);
    const lastTask = tasks.reduce<string | null>((best, t) => {
      const ts = String(t.updated_at ?? '');
      return !best || ts > best ? ts : best;
    }, null);
    const lastActivityAt =
      lastConv && lastTask ? (lastConv > lastTask ? lastConv : lastTask) : lastConv ?? lastTask;

    return {
      agentType,
      done: tasks.filter((t) => String(t.status) === 'done').length,
      pending: tasks.filter((t) => ['pending', 'running'].includes(String(t.status))).length,
      failed: tasks.filter((t) => String(t.status) === 'failed').length,
      conversationCount: convs.length,
      lastActivityAt,
    };
  });

  return {
    totalDone: byType.reduce((s, t) => s + t.done, 0),
    totalPending: byType.reduce((s, t) => s + t.pending, 0),
    totalFailed: byType.reduce((s, t) => s + t.failed, 0),
    totalConversations: byType.reduce((s, t) => s + t.conversationCount, 0),
    byType,
  };
}

export async function sendAgentMessage(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
  content: string,
): Promise<{ userMessage: AtlasAgentMessage; assistantMessage: AtlasAgentMessage; task: AtlasAgentTask }> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('message_required');

  const conv = await getAgentConversation(db, userId, conversationId);
  if (!conv) throw new Error('conversation_not_found');

  const now = new Date().toISOString();

  const { data: taskRow, error: taskErr } = await db
    .from('atlas_agent_tasks')
    .insert({
      user_id: userId,
      company_id: conv.companyId,
      conversation_id: conversationId,
      agent_type: conv.agentType,
      task_kind: 'message',
      status: 'running',
      input_json: { message: trimmed },
      output_json: {},
    })
    .select('*')
    .single();

  if (taskErr || !taskRow) throw new Error(taskErr?.message ?? 'task_create_failed');
  const taskId = String((taskRow as Record<string, unknown>).id);

  const { data: userRow, error: userErr } = await db
    .from('atlas_agent_messages')
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: 'user',
      content: trimmed,
      metadata: {},
    })
    .select('*')
    .single();

  if (userErr || !userRow) {
    await db.from('atlas_agent_tasks').update({ status: 'failed', error: userErr?.message, updated_at: now }).eq('id', taskId);
    throw new Error(userErr?.message ?? 'user_message_failed');
  }

  const history = await listAgentMessages(db, userId, conversationId);
  const ai = await runAgentAssistantReply({
    agentType: conv.agentType,
    history: history.filter((m) => m.id !== String((userRow as Record<string, unknown>).id)),
    userMessage: trimmed,
  });

  if (!ai.ok) {
    await db
      .from('atlas_agent_tasks')
      .update({ status: 'failed', error: ai.error, updated_at: now, completed_at: now })
      .eq('id', taskId);
    throw new Error(ai.error);
  }

  const { data: assistantRow, error: assistantErr } = await db
    .from('atlas_agent_messages')
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: 'assistant',
      content: ai.text,
      metadata: { provider: 'anthropic' },
    })
    .select('*')
    .single();

  if (assistantErr || !assistantRow) {
    await db
      .from('atlas_agent_tasks')
      .update({ status: 'failed', error: assistantErr?.message, updated_at: now, completed_at: now })
      .eq('id', taskId);
    throw new Error(assistantErr?.message ?? 'assistant_message_failed');
  }

  await db
    .from('atlas_agent_conversations')
    .update({ updated_at: now })
    .eq('id', conversationId)
    .eq('user_id', userId);

  const { data: taskDone } = await db
    .from('atlas_agent_tasks')
    .update({
      status: 'done',
      output_json: {
        assistant_message_id: String((assistantRow as Record<string, unknown>).id),
        preview: ai.text.slice(0, 280),
      },
      updated_at: now,
      completed_at: now,
    })
    .eq('id', taskId)
    .select('*')
    .single();

  return {
    userMessage: rowToMessage(userRow as Record<string, unknown>),
    assistantMessage: rowToMessage(assistantRow as Record<string, unknown>),
    task: rowToTask((taskDone ?? taskRow) as Record<string, unknown>),
  };
}

export function parseAgentTypeParam(v: unknown): AtlasAgentType | null {
  const s = String(v ?? '').trim();
  return isAtlasAgentType(s) ? s : null;
}
