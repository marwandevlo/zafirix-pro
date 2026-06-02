/**
 * Liasse Fiscale persistence helpers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { runLiasseEngine } from '@/app/lib/atlas-liasse-engine';
import type { LiasseFiscaleRecord, LiasseStatus } from '@/app/types/atlas-liasse';

type LiasseDbRow = {
  id: string;
  user_id: string;
  company_id: string | null;
  fiscal_year: number;
  status: string;
  readiness_score: number | string | null;
  payload: Record<string, unknown> | null;
  validation_result: Record<string, unknown> | null;
  blocking_issues: unknown;
  admin_override_reason: string | null;
  generated_at: string | null;
  validated_at: string | null;
  filed_at: string | null;
  created_at: string;
};

export function mapLiasseRow(row: LiasseDbRow): LiasseFiscaleRecord {
  const vr = (row.validation_result ?? {}) as {
    checks?: LiasseFiscaleRecord['validationResult']['checks'];
    readiness_breakdown?: Record<string, number>;
  };
  return {
    id: row.id,
    companyId: row.company_id,
    fiscalYear: row.fiscal_year,
    status: row.status as LiasseStatus,
    readinessScore: Number(row.readiness_score ?? 0),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    validationResult: {
      checks: vr.checks ?? [],
      readiness_breakdown: vr.readiness_breakdown ?? {},
    },
    blockingIssues: Array.isArray(row.blocking_issues)
      ? (row.blocking_issues as LiasseFiscaleRecord['blockingIssues'])
      : [],
    adminOverrideReason: row.admin_override_reason,
    generatedAt: row.generated_at,
    validatedAt: row.validated_at,
    filedAt: row.filed_at,
    createdAt: row.created_at,
  };
}

export async function generateLiasseForUser(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
  fiscalYear: number,
): Promise<LiasseFiscaleRecord> {
  const engine = await runLiasseEngine(db, { userId, companyId, fiscalYear });
  const now = new Date().toISOString();

  const row = {
    user_id: userId,
    company_id: companyId,
    fiscal_year: fiscalYear,
    status: 'draft' as const,
    readiness_score: engine.readinessScore,
    payload: engine.payload,
    validation_result: {
      checks: engine.checks,
      readiness_breakdown: engine.readinessBreakdown,
    },
    blocking_issues: engine.blockingIssues,
    generated_at: now,
    updated_at: now,
  };

  let existingQuery = db
    .from('zafirix_liasse_fiscale')
    .select('id')
    .eq('user_id', userId)
    .eq('fiscal_year', fiscalYear);

  if (companyId) {
    existingQuery = existingQuery.eq('company_id', companyId);
  } else {
    existingQuery = existingQuery.is('company_id', null);
  }

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing?.id) {
    const { data, error } = await db
      .from('zafirix_liasse_fiscale')
      .update(row)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return mapLiasseRow(data as LiasseDbRow);
  }

  const { data, error } = await db
    .from('zafirix_liasse_fiscale')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return mapLiasseRow(data as LiasseDbRow);
}

export function canTransitionLiasseStatus(
  nextStatus: LiasseStatus,
  blockingIssues: { blocking?: boolean }[],
  adminOverrideReason: string | null | undefined,
): { ok: boolean; error?: string } {
  if (nextStatus !== 'validated' && nextStatus !== 'filed') {
    return { ok: true };
  }
  const blocking = blockingIssues.filter((c) => c.blocking !== false);
  if (blocking.length === 0) return { ok: true };
  const reason = String(adminOverrideReason ?? '').trim();
  if (reason.length < 10) {
    return {
      ok: false,
      error: 'blocking_issues_require_admin_override',
    };
  }
  return { ok: true };
}
