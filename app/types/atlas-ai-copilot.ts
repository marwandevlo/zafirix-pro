export type AiAnomalySeverity = 'info' | 'warning' | 'critical';

export type AiSourceRef = {
  type: 'invoice' | 'accounting_entry' | 'payroll' | 'bank' | 'tva' | 'liasse' | 'audit_log' | 'document' | 'legal' | 'anomaly' | 'readiness';
  id: string;
  label?: string;
};

export type AtlasAiContextSnapshot = {
  company: Record<string, unknown>;
  fiscal_year: number;
  accounting: Record<string, unknown>;
  tva: Record<string, unknown>;
  payroll: Record<string, unknown>;
  banking: Record<string, unknown>;
  liasse: Record<string, unknown>;
  invoices: Record<string, unknown>;
  alerts: unknown[];
  readiness: Record<string, unknown>;
  refreshed_at: string;
};

export type AtlasAiAnomaly = {
  id: string;
  category: string;
  severity: AiAnomalySeverity;
  title: string;
  description: string;
  entityType: string | null;
  entityId: string | null;
  status: string;
  detectedAt: string;
  code?: string;
  href?: string;
};

export type AtlasAiInsight = {
  id: string;
  kind: 'risk' | 'opportunity' | 'fiscal_warning' | 'cash_flow' | 'recommendation';
  title: string;
  description: string;
  severity: AiAnomalySeverity;
  href?: string;
};

export type AtlasAiRecommendation = {
  id: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  href?: string;
};

export type AtlasAiConversation = {
  id: string;
  title: string;
  status: string;
  companyId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastMessage?: string | null;
};

export type AtlasAiChatResponse = {
  answer: string;
  sources: AiSourceRef[];
  confidence: number;
  conversationId: string;
  interactionId: string;
};

export type AtlasAiInteraction = {
  id: string;
  conversationId: string | null;
  interactionType: string;
  prompt: string;
  answer: string;
  sourcesUsed: AiSourceRef[];
  createdAt: string;
};

export type AtlasAiClosingChecklist = {
  ready: boolean;
  readinessScore: number;
  items: Array<{
    id: string;
    label: string;
    ok: boolean;
    detail?: string;
    href?: string;
  }>;
  blockers: string[];
};

export type AtlasAiAuditReport = {
  exported_at: string;
  fiscal_year: number;
  score?: number;
  risk_score?: number;
  findings: Array<{ severity: AiAnomalySeverity; category: string; title: string; description: string; href?: string }>;
  observations: string[];
  recommendations: string[];
  criticalIssues?: Array<{ severity: AiAnomalySeverity; category: string; title: string; description: string }>;
  sections?: {
    critical: Array<{ severity: AiAnomalySeverity; category: string; title: string; description: string }>;
    tva: Array<{ severity: AiAnomalySeverity; category: string; title: string; description: string }>;
    banking: Array<{ severity: AiAnomalySeverity; category: string; title: string; description: string }>;
    hr: Array<{ severity: AiAnomalySeverity; category: string; title: string; description: string }>;
    legal: Array<{ severity: AiAnomalySeverity; category: string; title: string; description: string }>;
    fiscal: Array<{ severity: AiAnomalySeverity; category: string; title: string; description: string }>;
  };
  sources: AiSourceRef[];
};

export type AtlasAiExecutiveSummary = {
  period: 'month' | 'quarter' | 'year';
  period_label: string;
  fiscal_year: number;
  metrics: {
    chiffre_affaires: number;
    charges: number;
    resultat: number;
    tva: number;
    tresorerie: number;
    unpaid_invoices: number;
    risk_count: number;
  };
  narrative: string;
  risks: string[];
  recommendations: string[];
};

export type AtlasAiClosingEvaluation = {
  ready: boolean;
  score: number;
  blockingIssues: string[];
  recommendations: string[];
  estimatedReadiness: number;
  labelFr: string;
};
