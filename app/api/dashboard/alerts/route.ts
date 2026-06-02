/**
 * GET /api/dashboard/alerts
 *
 * Unified alert feed for the dashboard Alert Center.
 * Sources:
 *   - Rejected routing records
 *   - Expiring legal documents (≤ 30 days)
 *   - Expired legal documents
 *   - High TVA discrepancies (routing records with tva_warning in metadata)
 *   - Documents stuck in 'processing' > 1 hour
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AlertSeverity = 'red' | 'orange' | 'yellow';

type Alert = {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  description: string;
  href?: string;
  entity_id?: string;
  entity_type?: string;
  created_at: string;
};

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const admin = getSupabaseServiceRoleClient();

  const today = new Date().toISOString().split('T')[0];
  const alertDate = new Date();
  alertDate.setDate(alertDate.getDate() + 30);
  const alertDateStr = alertDate.toISOString().split('T')[0];

  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const fiscalYear = new Date().getFullYear();
  const yearStart = `${fiscalYear}-01-01`;
  const yearEnd = `${fiscalYear}-12-31`;

  const [rejected, expiring, expired, stuck, bankTxRes, payslipRes, liasseRes, salesInvRes] = await Promise.all([
    // Rejected routing records
    admin.from('zafirix_routing_records')
      .select('id, source_document_id, target_module, target_entity_type, updated_at')
      .eq('user_id', userId)
      .eq('validation_status', 'rejected')
      .order('updated_at', { ascending: false })
      .limit(10),

    // Contracts expiring soon (≤ 30 days)
    admin.from('zafirix_legal_documents')
      .select('id, title, expiry_date')
      .eq('user_id', userId)
      .gte('expiry_date', today)
      .lte('expiry_date', alertDateStr)
      .order('expiry_date', { ascending: true })
      .limit(10),

    // Expired contracts
    admin.from('zafirix_legal_documents')
      .select('id, title, expiry_date')
      .eq('user_id', userId)
      .lt('expiry_date', today)
      .order('expiry_date', { ascending: false })
      .limit(5),

    // Documents stuck in processing
    admin.from('zafirix_ocr_documents')
      .select('id, filename, processing_status, created_at')
      .eq('user_id', userId)
      .eq('processing_status', 'processing')
      .lt('created_at', oneHourAgo.toISOString())
      .limit(5),

    // Phase 12 — unreconciled bank transactions (fiscal year)
    admin.from('zafirix_bank_transactions')
      .select('id, transaction_date, description, amount')
      .eq('user_id', userId)
      .gte('transaction_date', yearStart)
      .lte('transaction_date', yearEnd)
      .limit(100),

    // Payroll drafts
    admin.from('atlas_payslip_extractions')
      .select('id, period_year, validation_status, employee_name')
      .eq('user_id', userId)
      .eq('validation_status', 'draft')
      .limit(20),

    // Liasse for current year
    admin.from('zafirix_liasse_fiscale')
      .select('id, fiscal_year, status, readiness_score')
      .eq('user_id', userId)
      .eq('fiscal_year', fiscalYear)
      .maybeSingle(),

    // TVA inconsistencies (sales invoices)
    admin.from('atlas_invoices')
      .select('id, amount_ht, vat_rate, vat_amount')
      .eq('user_id', userId)
      .limit(200),
  ]);

  const alerts: Alert[] = [];

  // Expired contracts — red
  for (const c of expired.data ?? []) {
    const daysAgo = Math.abs(Math.ceil((Date.now() - new Date(c.expiry_date as string).getTime()) / 86400000));
    alerts.push({
      id: `expired-${c.id}`,
      severity: 'red',
      category: 'Contrat expiré',
      title: `Contrat expiré : ${c.title ?? 'Sans titre'}`,
      description: `Expiré il y a ${daysAgo} jour${daysAgo > 1 ? 's' : ''}`,
      href: '/juridique',
      entity_id: String(c.id),
      entity_type: 'legal_document',
      created_at: c.expiry_date as string,
    });
  }

  // Rejected records — red
  for (const r of rejected.data ?? []) {
    alerts.push({
      id: `rejected-${r.id}`,
      severity: 'red',
      category: 'Enregistrement rejeté',
      title: `Rejet : module ${r.target_module ?? 'inconnu'}`,
      description: `Document source : ${r.source_document_id ? String(r.source_document_id).slice(0, 8) + '…' : '—'}`,
      href: '/validation',
      entity_id: String(r.id),
      entity_type: 'routing_record',
      created_at: String(r.updated_at),
    });
  }

  // Expiring contracts — orange
  for (const c of expiring.data ?? []) {
    const days = Math.ceil((new Date(c.expiry_date as string).getTime() - Date.now()) / 86400000);
    alerts.push({
      id: `expiring-${c.id}`,
      severity: 'orange',
      category: 'Contrat bientôt expiré',
      title: `${c.title ?? 'Contrat sans titre'}`,
      description: `Expire dans ${days} jour${days > 1 ? 's' : ''}`,
      href: '/juridique',
      entity_id: String(c.id),
      entity_type: 'legal_document',
      created_at: c.expiry_date as string,
    });
  }

  // ── Phase 12 Liasse alerts ─────────────────────────────────────────────────
  const bankTx = bankTxRes.data ?? [];
  const bankTxIds = bankTx.map(t => String(t.id));
  let unreconciledBank = 0;
  if (bankTxIds.length) {
    const { data: recons } = await admin
      .from('atlas_bank_reconciliation')
      .select('transaction_id, status')
      .in('transaction_id', bankTxIds);
    const matched = new Set(
      (recons ?? []).filter(r => r.status === 'matched').map(r => String(r.transaction_id)),
    );
    unreconciledBank = bankTx.filter(t => !matched.has(String(t.id))).length;
  }
  if (unreconciledBank > 0) {
    alerts.push({
      id: 'liasse-bank-unreconciled',
      severity: unreconciledBank > 5 ? 'red' : 'orange',
      category: 'Clôture fiscale',
      title: 'Opérations bancaires non rapprochées',
      description: `${unreconciledBank} opération(s) avant clôture fiscale`,
      href: '/banque',
      entity_type: 'bank_transaction',
      created_at: new Date().toISOString(),
    });
  }

  const draftPayslips = (payslipRes.data ?? []).filter(
    p => Number(p.period_year) === fiscalYear,
  );
  if (draftPayslips.length > 0) {
    alerts.push({
      id: 'liasse-payroll-draft',
      severity: 'red',
      category: 'Clôture fiscale',
      title: 'Bulletins de paie non validés',
      description: `${draftPayslips.length} bulletin(s) en brouillon`,
      href: '/rh',
      entity_type: 'payslip',
      created_at: new Date().toISOString(),
    });
  }

  const { data: cnssPayslips } = await admin
    .from('atlas_payslip_extractions')
    .select('id, cnss_amount, cnss_number, period_year')
    .eq('user_id', userId)
    .eq('period_year', fiscalYear)
    .limit(50);
  const missingCnss = (cnssPayslips ?? []).filter(
    p => !p.cnss_amount && !p.cnss_number,
  ).length;
  if (missingCnss > 0) {
    alerts.push({
      id: 'liasse-cnss-missing',
      severity: 'red',
      category: 'Clôture fiscale',
      title: 'CNSS manquant avant clôture',
      description: `${missingCnss} bulletin(s) sans données CNSS`,
      href: '/rh',
      entity_type: 'payslip',
      created_at: new Date().toISOString(),
    });
  }

  let tvaInconsistencies = 0;
  for (const inv of salesInvRes.data ?? []) {
    const ht = Number(inv.amount_ht ?? 0);
    const rate = Number(inv.vat_rate ?? 20);
    const expected = ht * (rate / 100);
    const detected = Number(inv.vat_amount ?? 0);
    if (ht > 0 && Math.abs(expected - detected) / ht > 0.05) tvaInconsistencies++;
  }
  if (tvaInconsistencies > 0) {
    alerts.push({
      id: 'liasse-tva-inconsistency',
      severity: 'orange',
      category: 'Clôture fiscale',
      title: 'Incohérences TVA avant clôture',
      description: `${tvaInconsistencies} facture(s) avec écart TVA`,
      href: '/tva',
      entity_type: 'invoice',
      created_at: new Date().toISOString(),
    });
  }

  if (!liasseRes.data) {
    alerts.push({
      id: 'liasse-not-generated',
      severity: 'yellow',
      category: 'Clôture fiscale',
      title: `Liasse non générée pour ${fiscalYear}`,
      description: 'Générez la liasse fiscale avant la clôture',
      href: '/liasse',
      entity_type: 'liasse_fiscale',
      created_at: new Date().toISOString(),
    });
  } else if (Number(liasseRes.data.readiness_score ?? 0) < 50) {
    alerts.push({
      id: 'liasse-low-readiness',
      severity: 'orange',
      category: 'Clôture fiscale',
      title: 'Score de clôture faible',
      description: `Prêt pour clôture : ${liasseRes.data.readiness_score}%`,
      href: '/liasse',
      entity_id: String(liasseRes.data.id),
      entity_type: 'liasse_fiscale',
      created_at: new Date().toISOString(),
    });
  }

  // Stuck documents — yellow
  for (const d of stuck.data ?? []) {
    alerts.push({
      id: `stuck-${d.id}`,
      severity: 'yellow',
      category: 'OCR bloqué',
      title: `Analyse bloquée : ${d.filename ?? String(d.id).slice(0, 8)}`,
      description: 'OCR en cours depuis plus d\'1 heure',
      href: '/documents',
      entity_id: String(d.id),
      entity_type: 'document',
      created_at: String(d.created_at),
    });
  }

  // Sort: red first, then orange, then yellow, newest first within each
  const order = { red: 0, orange: 1, yellow: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return NextResponse.json({
    ok: true,
    alerts,
    counts: {
      red: alerts.filter(a => a.severity === 'red').length,
      orange: alerts.filter(a => a.severity === 'orange').length,
      yellow: alerts.filter(a => a.severity === 'yellow').length,
      total: alerts.length,
    },
  });
}
