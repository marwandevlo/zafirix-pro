import type { SupabaseClient } from '@supabase/supabase-js';
import type { LiasseCheck, LiasseFiscalePayload, LiasseStatus } from '@/app/types/atlas-liasse';
import {
  buildAuditPackage,
  buildLiassePayload,
  canValidateOrFile,
  getBlockingIssues,
  upsertLiasseRecord,
  type LiasseEngineInput,
} from '@/app/lib/atlas-liasse-engine';
import { logAuditEvent } from '@/app/lib/atlas-audit-log';

async function assertCompanyOwned(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<{ name: string }> {
  const { data, error } = await db
    .from('atlas_companies')
    .select('id, name')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new Error('company_not_found');
  const name = String(data.name ?? 'Société');
  return { name };
}

export function missingRequiredSections(payload: LiasseFiscalePayload): LiasseCheck[] {
  const missing: LiasseCheck[] = [];
  if (payload.accounting.total_debit === 0 && payload.accounting.total_credit === 0) {
    missing.push({
      id: 'section-accounting',
      category: 'accounting',
      severity: 'critical',
      title: 'Section comptabilité manquante',
      description: 'Aucune écriture comptable pour l\'exercice',
      blocking: true,
    });
  }
  if (payload.bank.transactions_imported === 0 && payload.bank.statement_closing_balance == null) {
    missing.push({
      id: 'section-bank',
      category: 'bank',
      severity: 'warning',
      title: 'Section banque incomplète',
      description: 'Aucun relevé ni transaction importée',
      blocking: true,
    });
  }
  if (
    payload.payroll.employees_count === 0
    && payload.payroll.gross_salaries === 0
    && !payload.payroll.payroll_run_validated
  ) {
    missing.push({
      id: 'section-payroll',
      category: 'payroll',
      severity: 'warning',
      title: 'Section paie manquante',
      description: 'Aucune donnée paie / CNSS / IR pour l\'exercice',
      blocking: true,
    });
  }
  return missing;
}

export async function loadLiasseRecord(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
) {
  const { data } = await db
    .from('zafirix_liasse_fiscale')
    .select('*')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .eq('fiscal_year', fiscalYear)
    .maybeSingle();
  return data;
}

export async function generateLiasse(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
): Promise<{ id: string; payload: LiasseFiscalePayload; status: LiasseStatus }> {
  const { name } = await assertCompanyOwned(db, userId, companyId);
  const input: LiasseEngineInput = {
    userId,
    companyId,
    companyName: name,
    fiscalYear,
  };
  let payload = await buildLiassePayload(db, input);
  const sectionChecks = missingRequiredSections(payload);
  if (sectionChecks.length) {
    payload = {
      ...payload,
      checks: [...payload.checks, ...sectionChecks],
      readiness_factors: {
        ...payload.readiness_factors,
        liasse_generated: true,
      },
    };
  }
  const id = await upsertLiasseRecord(db, userId, companyId, fiscalYear, payload);
  void logAuditEvent({
    action: 'created',
    entityType: 'liasse_fiscale',
    entityId: id,
    performedBy: userId,
    metadata: { fiscal_year: fiscalYear, readiness_score: payload.readiness_score },
  });
  return { id, payload, status: 'draft' };
}

export async function getReadiness(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
) {
  const record = await loadLiasseRecord(db, userId, companyId, fiscalYear);
  if (record?.payload) {
    const payload = record.payload as LiasseFiscalePayload;
    return {
      readiness_score: Number(record.readiness_score ?? payload.readiness_score),
      factors: payload.readiness_factors,
      checks: payload.checks,
      liasse_generated: true,
      status: String(record.status) as LiasseStatus,
    };
  }
  const { name } = await assertCompanyOwned(db, userId, companyId);
  const payload = await buildLiassePayload(db, {
    userId,
    companyId,
    companyName: name,
    fiscalYear,
  });
  return {
    readiness_score: payload.readiness_score,
    factors: { ...payload.readiness_factors, liasse_generated: false },
    checks: payload.checks,
    liasse_generated: false,
    status: 'draft' as LiasseStatus,
  };
}

export async function updateLiasseStatus(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
  nextStatus: 'validated' | 'filed',
  adminOverrideReason?: string | null,
): Promise<{ ok: boolean; error?: string; blockers?: LiasseCheck[] }> {
  const record = await loadLiasseRecord(db, userId, companyId, fiscalYear);
  if (!record) return { ok: false, error: 'liasse_not_found' };

  const payload = record.payload as LiasseFiscalePayload;
  const sectionChecks = missingRequiredSections(payload);
  const allChecks = [...(payload.checks ?? []), ...sectionChecks];
  const gate = canValidateOrFile(allChecks, adminOverrideReason);

  if (!gate.allowed) {
    return { ok: false, error: gate.message, blockers: gate.blockers };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: nextStatus,
    blocking_issues: getBlockingIssues(allChecks),
    updated_at: now,
  };
  if (adminOverrideReason?.trim()) {
    patch.admin_override_reason = adminOverrideReason.trim();
  }
  if (nextStatus === 'validated') patch.validated_at = now;
  if (nextStatus === 'filed') patch.filed_at = now;

  const { error } = await db
    .from('zafirix_liasse_fiscale')
    .update(patch)
    .eq('id', record.id)
    .eq('user_id', userId);

  if (error) return { ok: false, error: error.message };

  void logAuditEvent({
    action: 'validated',
    entityType: 'liasse_fiscale',
    entityId: String(record.id),
    performedBy: userId,
    metadata: { status: nextStatus, override: Boolean(adminOverrideReason?.trim()) },
  });

  return { ok: true };
}

export async function exportAuditPackage(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
) {
  const { name } = await assertCompanyOwned(db, userId, companyId);
  const record = await loadLiasseRecord(db, userId, companyId, fiscalYear);
  const input = { userId, companyId, companyName: name, fiscalYear };
  const payload = record?.payload
    ? (record.payload as LiasseFiscalePayload)
    : await buildLiassePayload(db, input);
  const status = String(record?.status ?? 'draft');
  return buildAuditPackage(db, payload, { ...input, status });
}
