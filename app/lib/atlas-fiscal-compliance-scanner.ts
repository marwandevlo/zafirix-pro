import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ComplianceFinding,
  FiscalComplianceScanResult,
} from '@/app/types/atlas-fiscal-compliance';
import { computeIsLiquidation } from '@/app/lib/atlas-payroll-calculations';

const FORMULA_VERSION = 'ma-compliance-scan-v1';

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

function bandFromScore(score: number): FiscalComplianceScanResult['band'] {
  if (score >= 75) return 'healthy';
  if (score >= 50) return 'attention';
  return 'critical';
}

export async function scanFiscalCompliance(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  fiscalYear: number,
): Promise<FiscalComplianceScanResult> {
  const periodStart = `${fiscalYear}-01-01`;
  const periodEnd = `${fiscalYear}-12-31`;
  const findings: ComplianceFinding[] = [];
  let penalty = 0;

  const [invRes, supRes, accRes, tvaRes, routingRes, isDraftRes] = await Promise.all([
    db
      .from('atlas_invoices')
      .select('amount_ht, tva_amount, status')
      .eq('company_id', companyId)
      .gte('issue_date', periodStart)
      .lte('issue_date', periodEnd),
    db
      .from('atlas_supplier_invoices')
      .select('amount_ht, tva_amount, supplier_ice')
      .eq('company_id', companyId)
      .gte('invoice_date', periodStart)
      .lte('invoice_date', periodEnd),
    db
      .from('atlas_accounting_entries')
      .select('entry_json')
      .eq('company_id', companyId)
      .gte('entry_date', periodStart)
      .lte('entry_date', periodEnd),
    db
      .from('atlas_tva_periods')
      .select('period_key, tva_collectee, tva_deductible, tva_nette')
      .eq('company_id', companyId)
      .eq('user_id', userId),
    db
      .from('zafirix_routing_records')
      .select('id, validation_status, target_module')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .in('validation_status', ['draft', 'rejected']),
    db
      .from('atlas_is_drafts')
      .select('revenue_ht, taxable_result, estimated_is, minimal_contribution, is_due')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .eq('fiscal_year', fiscalYear)
      .maybeSingle(),
  ]);

  const revenueHT = (invRes.data ?? [])
    .filter((i) => String((i as { status: string }).status) !== 'cancelled')
    .reduce((s, i) => s + Number((i as { amount_ht: number | null }).amount_ht ?? 0), 0);

  const supplierHT = (supRes.data ?? []).reduce(
    (s, r) => s + Number((r as { amount_ht: number | null }).amount_ht ?? 0),
    0,
  );

  let accountingCharges = 0;
  let invalidPcge = 0;
  for (const row of accRes.data ?? []) {
    const entry = (row as { entry_json: Record<string, unknown> }).entry_json;
    if (!entry) continue;
    const compte = String(entry.compte ?? '');
    const debit = Number(entry.debit ?? 0);
    if (debit > 0) accountingCharges += debit;
    if (compte && (compte.length < 3 || compte.length > 8 || !/^\d+$/.test(compte))) {
      invalidPcge += 1;
    }
  }

  const totalCharges = supplierHT + accountingCharges;
  const expenseRatio = revenueHT > 0 ? totalCharges / revenueHT : 0;

  if (revenueHT > 100_000 && expenseRatio > 0.92) {
    penalty += 18;
    findings.push({
      id: 'expense_ratio_high',
      severity: 'warning',
      category: 'comptabilite',
      titleFr: 'Ratio charges/CA élevé',
      titleAr: 'نسبة مصاريف/رقم الأعمال مرتفعة',
      descriptionFr: `Charges ${roundMad(totalCharges).toLocaleString()} MAD vs CA ${roundMad(revenueHT).toLocaleString()} MAD (${Math.round(expenseRatio * 100)}%).`,
      descriptionAr: `مصاريف مرتفعة مقارنة برقم الأعمال (${Math.round(expenseRatio * 100)}%).`,
      recommendationFr: 'Vérifiez la classification PCGE et la justification des charges déductibles.',
      recommendationAr: 'تحقق من تصنيف الحسابات ومبررات المصاريف القابلة للخصم.',
      href: '/comptabilite',
      metric: `${Math.round(expenseRatio * 100)}%`,
    });
  }

  let tvaCollected = 0;
  let tvaDeductible = 0;
  for (const p of tvaRes.data ?? []) {
    tvaCollected += Number((p as { tva_collectee: number }).tva_collectee ?? 0);
    tvaDeductible += Number((p as { tva_deductible: number }).tva_deductible ?? 0);
  }
  if (tvaCollected > 0 && tvaDeductible > tvaCollected * 1.15) {
    penalty += 15;
    findings.push({
      id: 'tva_deductible_excess',
      severity: 'critical',
      category: 'tva',
      titleFr: 'TVA déductible supérieure à la TVA collectée',
      titleAr: 'TVA القابلة للخصم تفوق TVA المحصلة',
      descriptionFr: `TVA déductible ${roundMad(tvaDeductible).toLocaleString()} vs collectée ${roundMad(tvaCollected).toLocaleString()} MAD.`,
      descriptionAr: 'فرق غير طبيعي بين TVA المحصلة والقابلة للخصم.',
      recommendationFr: 'Rapprochez relevé de déductions et factures fournisseurs avant déclaration SIMPL-TVA.',
      recommendationAr: 'طابق كشف الخصومات مع فواتير الموردين قبل التصريح.',
      href: '/tva',
    });
  }

  const missingIce = (supRes.data ?? []).filter(
    (s) => !String((s as { supplier_ice: string | null }).supplier_ice ?? '').trim(),
  ).length;
  if (missingIce >= 3) {
    penalty += 10;
    findings.push({
      id: 'supplier_ice_missing',
      severity: 'warning',
      category: 'tva',
      titleFr: 'Factures fournisseurs sans ICE',
      titleAr: 'فواتير موردين بدون ICE',
      descriptionFr: `${missingIce} facture(s) achat sans ICE renseigné.`,
      descriptionAr: `${missingIce} فاتورة بدون ICE.`,
      recommendationFr: 'Complétez l\'ICE fournisseur pour sécuriser la déductibilité TVA.',
      recommendationAr: 'أكمل ICE المورد لتأمين خصم TVA.',
      href: '/tva',
    });
  }

  if (isDraftRes.data) {
    const d = isDraftRes.data as Record<string, unknown>;
    const rev = Number(d.revenue_ht ?? 0);
    const taxable = Number(d.taxable_result ?? 0);
    const liquidation = computeIsLiquidation(rev, taxable, fiscalYear);
    if (liquidation.cotisationMinimaleAppliquee && rev > 50_000) {
      penalty += 12;
      findings.push({
        id: 'cotisation_minimale_is',
        severity: 'warning',
        category: 'is',
        titleFr: 'Cotisation minimale IS applicable',
        titleAr: 'الاشتراك الأدنى IS مطبق',
        descriptionFr: `Impôt dû basé sur 0,5% CA (${liquidation.minimalContribution.toLocaleString()} MAD) > IS calculé.`,
        descriptionAr: 'الضريبة المستحقة مبنية على 0,5% من رقم الأعمال.',
        recommendationFr: 'Anticipez trésorerie IS et acomptes provisionnels N+1.',
        recommendationAr: 'خطط للتدفقات ودفعات IS القادمة.',
        href: '/is',
      });
    }
  } else if (revenueHT > 0) {
    penalty += 8;
    findings.push({
      id: 'is_draft_missing',
      severity: 'info',
      category: 'is',
      titleFr: 'Brouillon IS non calculé',
      titleAr: 'مسودة IS غير محسوبة',
      descriptionFr: `Exercice ${fiscalYear} — lancez le calcul IS depuis vos données.`,
      descriptionAr: `السنة ${fiscalYear} — احسب IS من البيانات.`,
      recommendationFr: 'Calculez le brouillon IS avant clôture fiscale.',
      recommendationAr: 'احسب مسودة IS قبل الإقفال.',
      href: '/is',
    });
  }

  const pendingRouting = (routingRes.data ?? []).length;
  if (pendingRouting >= 5) {
    penalty += 10;
    findings.push({
      id: 'validation_queue_backlog',
      severity: 'warning',
      category: 'comptabilite',
      titleFr: 'File validation OCR en retard',
      titleAr: 'تراكم في قائمة التحقق OCR',
      descriptionFr: `${pendingRouting} document(s) en attente de validation.`,
      descriptionAr: `${pendingRouting} وثيقة بانتظار التحقق.`,
      recommendationFr: 'Traitez la file /validation pour éviter des écarts comptables.',
      recommendationAr: 'عالج قائمة التحقق لتجنب الفوارق.',
      href: '/validation',
    });
  }

  if (invalidPcge >= 5) {
    penalty += 8;
    findings.push({
      id: 'pcge_invalid_accounts',
      severity: 'warning',
      category: 'comptabilite',
      titleFr: 'Comptes PCGE non conformes',
      titleAr: 'حسابات PCGE غير مطابقة',
      descriptionFr: `${invalidPcge} écriture(s) avec numéros de compte invalides.`,
      descriptionAr: `${invalidPcge} قيد بحسابات غير صالحة.`,
      recommendationFr: 'Corrigez les comptes selon le plan comptable marocain (PCGE).',
      recommendationAr: 'صحح الحسابات وفق PCGE المغربي.',
      href: '/comptabilite',
    });
  }

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const riskScore = 100 - score;

  return {
    companyId,
    fiscalYear,
    score,
    riskScore,
    band: bandFromScore(score),
    findings: findings.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    }),
    scannedAt: new Date().toISOString(),
    formulaVersion: FORMULA_VERSION,
  };
}
