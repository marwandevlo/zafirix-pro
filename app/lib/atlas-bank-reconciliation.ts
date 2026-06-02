/**
 * Automatic bank reconciliation — invoice & supplier matching.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const AMOUNT_TOLERANCE = 0.01;
const DATE_TOLERANCE_DAYS = 7;

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.abs(Math.round((d1 - d2) / 86400000));
}

function nameSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const nb = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (!na || !nb) return 0;
  if (na.includes(nb) || nb.includes(na)) return 90;
  const wordsA = new Set(na.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(nb.split(/\s+/).filter(w => w.length > 2));
  let match = 0;
  for (const w of wordsA) if (wordsB.has(w)) match++;
  const score = (match / Math.max(wordsA.size, wordsB.size, 1)) * 100;
  return Math.round(score);
}

function amountMatch(txAmount: number, target: number): boolean {
  return Math.abs(txAmount - target) <= AMOUNT_TOLERANCE;
}

export type MatchCandidate = {
  entityType: string;
  entityId: string;
  confidence: number;
  reason: string;
};

export async function findMatchesForTransaction(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  tx: {
    id: string;
    amount: number;
    credit: number;
    debit: number;
    transaction_date: string | null;
    description: string | null;
  },
): Promise<MatchCandidate[]> {
  const candidates: MatchCandidate[] = [];
  const txDate = tx.transaction_date ?? new Date().toISOString().slice(0, 10);
  const txAmount = tx.amount;
  const desc = tx.description ?? '';

  // Credit → likely customer payment → sales invoice
  if (tx.credit > 0 || txAmount > 0) {
    const { data: invoices } = await db
      .from('atlas_invoices')
      .select('id, client_name, total_ttc, issue_date, status')
      .eq('user_id', userId)
      .limit(200);

    for (const inv of invoices ?? []) {
      const ttc = Number(inv.total_ttc ?? 0);
      if (!amountMatch(txAmount, ttc)) continue;
      const dateOk = inv.issue_date ? daysBetween(txDate, String(inv.issue_date)) <= DATE_TOLERANCE_DAYS : true;
      const nameScore = nameSimilarity(desc, String(inv.client_name ?? ''));
      let confidence = 70;
      if (dateOk) confidence += 15;
      confidence += Math.min(15, Math.round(nameScore / 6));
      if (confidence >= 60) {
        candidates.push({
          entityType: 'sales_invoice',
          entityId: String(inv.id),
          confidence: Math.min(100, confidence),
          reason: `Facture vente ${inv.client_name} · ${ttc} MAD`,
        });
      }
    }
  }

  // Debit → supplier payment
  if (tx.debit > 0) {
    const { data: supplierInvoices } = await db
      .from('atlas_supplier_invoices')
      .select('id, supplier_name, amount_ttc, invoice_date, validation_status')
      .eq('user_id', userId)
      .limit(200);

    for (const inv of supplierInvoices ?? []) {
      const ttc = Number(inv.amount_ttc ?? 0);
      if (!amountMatch(txAmount, ttc)) continue;
      const dateOk = inv.invoice_date ? daysBetween(txDate, String(inv.invoice_date)) <= DATE_TOLERANCE_DAYS : true;
      const nameScore = nameSimilarity(desc, String(inv.supplier_name ?? ''));
      let confidence = 68;
      if (dateOk) confidence += 17;
      confidence += Math.min(15, Math.round(nameScore / 6));
      if (confidence >= 58) {
        candidates.push({
          entityType: 'supplier_invoice',
          entityId: String(inv.id),
          confidence: Math.min(100, confidence),
          reason: `Facture achat ${inv.supplier_name} · ${ttc} MAD`,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

export async function runReconciliationForTransactions(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  transactionIds: string[],
): Promise<{ suggested: number; matched: number }> {
  let suggested = 0;
  let matched = 0;

  for (const txId of transactionIds) {
    const { data: tx } = await db
      .from('zafirix_bank_transactions')
      .select('id, amount, credit, debit, transaction_date, description')
      .eq('id', txId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!tx) continue;

    const matches = await findMatchesForTransaction(db, userId, companyId, {
      id: String(tx.id),
      amount: Number(tx.amount),
      credit: Number(tx.credit ?? 0),
      debit: Number(tx.debit ?? 0),
      transaction_date: tx.transaction_date as string | null,
      description: tx.description as string | null,
    });

    const best = matches[0];
    if (!best) {
      await db.from('atlas_bank_reconciliation').upsert({
        user_id: userId,
        company_id: companyId,
        transaction_id: txId,
        entity_type: 'unmatched',
        entity_id: txId,
        confidence: 0,
        status: 'unmatched',
        match_reason: 'Aucune correspondance trouvée',
      }, { onConflict: 'transaction_id,entity_type,entity_id', ignoreDuplicates: false });
      continue;
    }

    const status = best.confidence >= 85 ? 'matched' : 'suggested';
    if (status === 'matched') matched++;
    else suggested++;

    await db.from('atlas_bank_reconciliation').upsert({
      user_id: userId,
      company_id: companyId,
      transaction_id: txId,
      entity_type: best.entityType,
      entity_id: best.entityId,
      confidence: best.confidence,
      status,
      match_reason: best.reason,
    }, { onConflict: 'transaction_id,entity_type,entity_id' });
  }

  return { suggested, matched };
}
