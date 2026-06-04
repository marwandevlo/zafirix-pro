import type { SupabaseClient } from '@supabase/supabase-js';
import type { AtlasAiClosingChecklist } from '@/app/types/atlas-ai-copilot';
import { runLiasseEngine } from '@/app/lib/atlas-liasse-engine';

export async function buildFiscalClosingChecklist(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
): Promise<AtlasAiClosingChecklist> {
  const fiscalYear = new Date().getFullYear();
  const engine = await runLiasseEngine(db, { userId, companyId, fiscalYear });

  const { data: liasse } = await db
    .from('zafirix_liasse_fiscale')
    .select('id, status')
    .eq('user_id', userId)
    .eq('fiscal_year', fiscalYear)
    .maybeSingle();

  const tvaOk = !engine.checks.some((c) => c.category === 'TVA' && c.severity === 'critical');
  const payrollOk = engine.payrollSummary.payslips_draft === 0;
  const bankOk = engine.bankSummary.unreconciled_count === 0;
  const liasseOk = !!liasse && liasse.status !== 'draft';
  const alertsOk = engine.checks.filter((c) => c.severity === 'critical').length === 0;

  const items = [
    { id: 'tva', label: 'TVA validée / cohérente', ok: tvaOk, href: '/tva', detail: tvaOk ? 'OK' : 'Incohérences TVA détectées' },
    { id: 'payroll', label: 'Paie validée', ok: payrollOk, href: '/rh', detail: `${engine.payrollSummary.payslips_validated}/${engine.payrollSummary.payslips_total} bulletins` },
    { id: 'bank', label: 'Banque rapprochée', ok: bankOk, href: '/banque', detail: `${engine.bankSummary.unreconciled_count} non rapprochée(s)` },
    { id: 'liasse', label: 'Liasse générée', ok: liasseOk, href: '/liasse', detail: liasse ? `Statut: ${liasse.status}` : 'Non générée' },
    { id: 'alerts', label: 'Alertes critiques résolues', ok: alertsOk, href: '/assistant', detail: alertsOk ? 'OK' : `${engine.checks.filter((c) => c.severity === 'critical').length} alerte(s)` },
  ];

  const blockers = engine.blockingIssues.map((b) => b.message);
  const ready = items.every((i) => i.ok) && blockers.length === 0 && engine.readinessScore >= 80;

  return {
    ready,
    readinessScore: engine.readinessScore,
    items,
    blockers,
  };
}
