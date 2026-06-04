/**
 * Builds and persists contextual company memory for the AI copilot.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { runLiasseEngine } from '@/app/lib/atlas-liasse-engine';
import { collectLiasseAlerts } from '@/app/lib/atlas-liasse-engine';
import { buildFiscalTvaContext } from '@/app/lib/atlas-tva-server';
import type { AiSourceRef, AtlasAiContextSnapshot } from '@/app/types/atlas-ai-copilot';

export type BuildContextInput = {
  userId: string;
  companyId: string | null;
  companyProfile?: Record<string, unknown> | null;
  fiscalYear?: number;
};

function filterCo<T extends { company_id?: string | null }>(rows: T[] | null | undefined, companyId: string | null): T[] {
  if (!companyId) return rows ?? [];
  return (rows ?? []).filter((r) => !r.company_id || r.company_id === companyId);
}

export async function buildAtlasAiContext(
  db: SupabaseClient,
  input: BuildContextInput,
): Promise<{ snapshot: AtlasAiContextSnapshot; sources: AiSourceRef[] }> {
  const { userId, companyId, companyProfile } = input;
  const fiscalYear = input.fiscalYear ?? new Date().getFullYear();
  const sources: AiSourceRef[] = [];

  const [
    invoicesRes,
    entriesRes,
    unpaidRes,
    tvaCtx,
    liasseEngine,
    alerts,
    payslipsRes,
    bankTxRes,
    reconRes,
  ] = await Promise.all([
    db.from('atlas_invoices').select('id, number, client_name, total_ttc, status, validation_status, company_id').eq('user_id', userId).limit(200),
    db.from('atlas_accounting_entries').select('id, entry_json, validation_status, company_id').eq('user_id', userId).limit(500),
    db.from('atlas_invoices').select('id, number, client_name, total_ttc, due_date, company_id').eq('user_id', userId).neq('status', 'paid').limit(50),
    companyId ? buildFiscalTvaContext(db, userId, companyId).catch(() => null) : Promise.resolve(null),
    runLiasseEngine(db, { userId, companyId, fiscalYear }),
    collectLiasseAlerts(db, userId, companyId),
    db.from('atlas_payslip_extractions').select('id, employee_name, gross_salary, validation_status, company_id').eq('user_id', userId).limit(100),
    db.from('zafirix_bank_transactions').select('id, description, debit, credit, transaction_date, company_id').eq('user_id', userId).limit(100),
    db.from('atlas_bank_reconciliation').select('transaction_id, status, company_id').eq('user_id', userId),
  ]);

  const invoices = filterCo(invoicesRes.data, companyId);
  const entries = filterCo(entriesRes.data, companyId);
  const unpaid = filterCo(unpaidRes.data, companyId);
  const payslips = filterCo(payslipsRes.data, companyId);
  const bankTx = filterCo(bankTxRes.data, companyId);
  const recons = filterCo(reconRes.data, companyId);

  for (const inv of unpaid.slice(0, 10)) {
    sources.push({ type: 'invoice', id: String(inv.id), label: inv.number ?? inv.client_name ?? 'Facture' });
  }
  sources.push({ type: 'readiness', id: `fy-${fiscalYear}`, label: `Readiness ${liasseEngine.readinessScore}%` });
  if (tvaCtx) sources.push({ type: 'tva', id: 'dashboard', label: 'TVA dashboard' });
  sources.push({ type: 'liasse', id: `engine-${fiscalYear}`, label: 'Liasse engine' });

  const unpaidTotal = unpaid.reduce((s, i) => s + Number(i.total_ttc ?? 0), 0);
  const validatedInv = invoices.filter((i) => i.validation_status === 'validated').length;
  const draftEntries = entries.filter((e) => e.validation_status === 'draft').length;
  const unmatchedBank = recons.filter((r) => r.status === 'unmatched').length;

  const snapshot: AtlasAiContextSnapshot = {
    company: companyProfile ?? {},
    fiscal_year: fiscalYear,
    accounting: {
      entries_count: entries.length,
      draft_entries: draftEntries,
      journal_balanced: Math.abs(
        entries.reduce((s, e) => {
          const j = e.entry_json as { debit?: number; credit?: number } | null;
          return s + Number(j?.debit ?? 0) - Number(j?.credit ?? 0);
        }, 0),
      ) < 1,
    },
    tva: tvaCtx ? { narrative: tvaCtx } : { note: 'TVA context unavailable (société requise)' },
    payroll: {
      payslips_count: payslips.length,
      payslips_draft: payslips.filter((p) => p.validation_status === 'draft').length,
      gross_total: payslips.reduce((s, p) => s + Number(p.gross_salary ?? 0), 0),
      summary: liasseEngine.payrollSummary,
    },
    banking: {
      transactions_count: bankTx.length,
      unreconciled: unmatchedBank,
      summary: liasseEngine.bankSummary,
    },
    liasse: {
      readiness_score: liasseEngine.readinessScore,
      readiness_breakdown: liasseEngine.readinessBreakdown,
      blocking_count: liasseEngine.blockingIssues.length,
      checks_critical: liasseEngine.checks.filter((c) => c.severity === 'critical').length,
      bilan: liasseEngine.payload.bilan,
    },
    invoices: {
      total: invoices.length,
      validated: validatedInv,
      unpaid_count: unpaid.length,
      unpaid_total_mad: Math.round(unpaidTotal * 100) / 100,
      top_unpaid: unpaid.slice(0, 15).map((i) => ({
        id: i.id,
        number: i.number,
        client: i.client_name,
        amount: i.total_ttc,
        due: i.due_date,
      })),
    },
    alerts: alerts,
    readiness: {
      score: liasseEngine.readinessScore,
      breakdown: liasseEngine.readinessBreakdown,
      missing_points: 100 - liasseEngine.readinessScore,
      blockers: liasseEngine.blockingIssues.map((b) => b.message),
    },
    refreshed_at: new Date().toISOString(),
  };

  return { snapshot, sources };
}

export async function refreshAtlasAiContext(
  db: SupabaseClient,
  input: BuildContextInput,
): Promise<{ snapshot: AtlasAiContextSnapshot; sources: AiSourceRef[] }> {
  const { snapshot, sources } = await buildAtlasAiContext(db, input);
  const fiscalYear = input.fiscalYear ?? new Date().getFullYear();

  const row = {
    user_id: input.userId,
    company_id: input.companyId,
    fiscal_year: fiscalYear,
    context_json: snapshot,
    sources_snapshot: sources,
    refreshed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let q = db.from('atlas_ai_context').select('id').eq('user_id', input.userId).eq('fiscal_year', fiscalYear);
  if (input.companyId) q = q.eq('company_id', input.companyId);
  else q = q.is('company_id', null);

  const { data: existing } = await q.maybeSingle();

  if (existing?.id) {
    await db.from('atlas_ai_context').update(row).eq('id', existing.id);
  } else {
    await db.from('atlas_ai_context').insert(row);
  }

  return { snapshot, sources };
}

export function contextToPromptBlock(snapshot: AtlasAiContextSnapshot): string {
  return `[DONNÉES RÉELLES ATLAS — NE PAS INVENTER]\n${JSON.stringify(snapshot, null, 2).slice(0, 12000)}`;
}
