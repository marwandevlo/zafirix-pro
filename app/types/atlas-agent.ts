export const ATLAS_AGENT_TYPES = ['fiscal', 'comptable', 'juridique', 'rh', 'business'] as const;

export type AtlasAgentType = (typeof ATLAS_AGENT_TYPES)[number];

export type AtlasAgentConversationStatus = 'active' | 'archived';

export type AtlasAgentMessageRole = 'user' | 'assistant' | 'system';

export type AtlasAgentTaskStatus = 'pending' | 'running' | 'done' | 'failed';

export type AtlasAgentConversation = {
  id: string;
  userId: string;
  companyId: string | null;
  agentType: AtlasAgentType;
  title: string;
  status: AtlasAgentConversationStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AtlasAgentMessage = {
  id: string;
  conversationId: string;
  userId: string;
  role: AtlasAgentMessageRole;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AtlasAgentTask = {
  id: string;
  userId: string;
  companyId: string | null;
  conversationId: string | null;
  agentType: AtlasAgentType;
  taskKind: string;
  status: AtlasAgentTaskStatus;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type AtlasAgentTypeStats = {
  agentType: AtlasAgentType;
  done: number;
  pending: number;
  failed: number;
  conversationCount: number;
  lastActivityAt: string | null;
};

export type AtlasAgentOverviewStats = {
  totalDone: number;
  totalPending: number;
  totalFailed: number;
  totalConversations: number;
  byType: AtlasAgentTypeStats[];
};
