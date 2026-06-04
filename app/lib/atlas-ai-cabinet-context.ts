/**
 * Phase 14 — Cabinet-aware AI context extensions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCabinetPortfolio, buildConsolidatedDashboard, getOrCreateDefaultWorkspace } from '@/app/lib/atlas-workspace-server';

export type CabinetAiContext = {
  workspace_id: string;
  workspace_type: string;
  portfolio: Array<{
    company_id: string;
    label: string;
    health_score: number;
    readiness_score: number;
    alert_count: number;
    health_band: string;
  }>;
  consolidated: {
    company_count: number;
    total_alerts: number;
    avg_readiness: number;
    avg_health: number;
  };
  cross_client_insights: string[];
};

export async function buildCabinetAiContext(
  db: SupabaseClient,
  userId: string,
  workspaceId?: string | null,
): Promise<CabinetAiContext> {
  const ws = workspaceId
    ? { id: workspaceId, workspaceType: 'accounting_firm' as const }
    : await getOrCreateDefaultWorkspace(db, userId);

  const [portfolio, consolidated] = await Promise.all([
    buildCabinetPortfolio(db, userId, ws.id),
    buildConsolidatedDashboard(db, userId, ws.id),
  ]);

  const tvaWorst = [...portfolio].sort((a, b) => b.alertCount - a.alertCount)[0];
  const readinessWorst = [...portfolio].sort((a, b) => a.readinessScore - b.readinessScore)[0];

  const cross_client_insights: string[] = [];
  if (tvaWorst && tvaWorst.alertCount > 0) {
    cross_client_insights.push(`Client avec le plus d'alertes: ${tvaWorst.clientLabel} (${tvaWorst.alertCount})`);
  }
  if (readinessWorst) {
    cross_client_insights.push(`Client le moins prêt clôture: ${readinessWorst.clientLabel} (${readinessWorst.readinessScore}%)`);
  }
  const payrollRisks = portfolio.filter((p) => p.healthBand === 'critical');
  if (payrollRisks.length) {
    cross_client_insights.push(`${payrollRisks.length} client(s) en statut critique`);
  }

  return {
    workspace_id: ws.id,
    workspace_type: 'workspaceType' in ws ? ws.workspaceType : 'accounting_firm',
    portfolio: portfolio.map((p) => ({
      company_id: p.companyId,
      label: p.clientLabel,
      health_score: p.healthScore,
      readiness_score: p.readinessScore,
      alert_count: p.alertCount,
      health_band: p.healthBand,
    })),
    consolidated: {
      company_count: consolidated.companyCount,
      total_alerts: consolidated.totalAlerts,
      avg_readiness: consolidated.avgReadiness,
      avg_health: consolidated.avgHealth,
    },
    cross_client_insights,
  };
}

export function cabinetContextToPromptBlock(ctx: CabinetAiContext): string {
  return `[CABINET / WORKSPACE]\n${JSON.stringify(ctx, null, 2)}`;
}
