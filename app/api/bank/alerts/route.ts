/**
 * GET /api/bank/alerts — banking anomaly alerts
 */
import { NextRequest, NextResponse } from 'next/server';
import { documentUploadSessionUserId } from '@/app/lib/atlas-document-upload-auth';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Alert = {
  id: string;
  severity: 'red' | 'orange' | 'yellow';
  category: string;
  title: string;
  description: string;
  transactionId?: string;
};

export async function GET(request: NextRequest) {
  const userId = await documentUploadSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const admin = getSupabaseServiceRoleClient();
  const alerts: Alert[] = [];

  const { data: txs } = await admin
    .from('zafirix_bank_transactions')
    .select('id, description, debit, credit, amount, balance, transaction_date')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .limit(500);

  const seen = new Map<string, string[]>();
  for (const tx of txs ?? []) {
    const key = `${tx.transaction_date}-${tx.amount}-${tx.description?.slice(0, 20)}`;
    const list = seen.get(key) ?? [];
    list.push(String(tx.id));
    seen.set(key, list);
  }
  for (const [, ids] of seen) {
    if (ids.length > 1) {
      alerts.push({
        id: `dup-${ids[0]}`,
        severity: 'orange',
        category: 'Paiement en double',
        title: 'Transaction potentiellement dupliquée',
        description: `${ids.length} opérations similaires détectées`,
        transactionId: ids[0],
      });
    }
  }

  const LARGE_THRESHOLD = 50000;
  for (const tx of txs ?? []) {
    const amt = Number(tx.amount ?? 0);
    if (amt >= LARGE_THRESHOLD) {
      alerts.push({
        id: `large-${tx.id}`,
        severity: 'yellow',
        category: 'Montant élevé',
        title: `Opération ${amt.toLocaleString('fr-FR')} MAD`,
        description: tx.description ?? 'Sans libellé',
        transactionId: String(tx.id),
      });
    }
    if (tx.balance != null && Number(tx.balance) < 0) {
      alerts.push({
        id: `neg-${tx.id}`,
        severity: 'red',
        category: 'Solde négatif',
        title: 'Solde débiteur détecté',
        description: `Solde: ${Number(tx.balance).toLocaleString('fr-FR')} MAD`,
        transactionId: String(tx.id),
      });
    }
  }

  const { data: unmatched } = await admin
    .from('atlas_bank_reconciliation')
    .select('transaction_id')
    .eq('user_id', userId)
    .eq('status', 'unmatched')
    .limit(20);

  for (const u of unmatched ?? []) {
    alerts.push({
      id: `unm-${u.transaction_id}`,
      severity: 'orange',
      category: 'Non rapproché',
      title: 'Transaction sans facture associée',
      description: 'Aucune correspondance facture vente/achat',
      transactionId: String(u.transaction_id),
    });
  }

  return NextResponse.json({
    ok: true,
    alerts: alerts.slice(0, 30),
    counts: {
      red: alerts.filter(a => a.severity === 'red').length,
      orange: alerts.filter(a => a.severity === 'orange').length,
      yellow: alerts.filter(a => a.severity === 'yellow').length,
      total: alerts.length,
    },
  });
}
