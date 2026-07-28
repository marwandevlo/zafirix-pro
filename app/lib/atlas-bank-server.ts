/**
 * Bank statement persistence + transaction import.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AtlasStructuredExtraction } from '@/app/types/atlas-document';
import { logAuditEvent } from '@/app/lib/atlas-audit-log';
import {
  normalizeTransaction,
  parseBankTransactionsFromDocument,
  statementHeaderFromExtraction,
} from '@/app/lib/atlas-bank-extraction';
import { runReconciliationForTransactions } from '@/app/lib/atlas-bank-reconciliation';

export type CreateBankStatementResult = {
  statementId: string;
  transactionCount: number;
  reconciliationRun: boolean;
};

async function findBankStatementByDocument(
  db: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<{ id: string; transactionCount: number } | null> {
  const { data } = await db
    .from('zafirix_bank_statements')
    .select('id, transaction_count')
    .eq('user_id', userId)
    .eq('source_document_id', documentId)
    .maybeSingle();
  if (!data?.id) return null;
  return {
    id: String(data.id),
    transactionCount: typeof data.transaction_count === 'number' ? data.transaction_count : 0,
  };
}

export async function markBankStatementValidated(
  db: SupabaseClient,
  userId: string,
  statementId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .from('zafirix_bank_statements')
    .update({ validation_status: 'validated', updated_at: now })
    .eq('id', statementId)
    .eq('user_id', userId);
  await db
    .from('zafirix_bank_transactions')
    .update({ validation_status: 'validated', updated_at: now })
    .eq('statement_id', statementId)
    .eq('user_id', userId);
}

/** Idempotent import — re-imports when an existing statement has zero transactions. */
export async function syncBankStatementFromDocument(
  db: SupabaseClient,
  params: {
    userId: string;
    companyId: string;
    documentId: string;
    extraction: AtlasStructuredExtraction;
    metadata?: Record<string, unknown>;
    markValidated?: boolean;
  },
): Promise<CreateBankStatementResult> {
  const { userId, documentId, markValidated = false } = params;
  const existing = await findBankStatementByDocument(db, userId, documentId);

  if (existing && existing.transactionCount > 0) {
    if (markValidated) {
      await markBankStatementValidated(db, userId, existing.id);
    }
    return {
      statementId: existing.id,
      transactionCount: existing.transactionCount,
      reconciliationRun: false,
    };
  }

  if (existing) {
    await db.from('zafirix_bank_transactions').delete().eq('statement_id', existing.id);
    await db.from('zafirix_bank_statements').delete().eq('id', existing.id);
  }

  const result = await createBankStatementFromDocument(db, {
    ...params,
    validationStatus: markValidated ? 'validated' : 'draft',
  });

  if (markValidated) {
    await markBankStatementValidated(db, userId, result.statementId);
  }

  return result;
}

export async function createBankStatementFromDocument(
  db: SupabaseClient,
  params: {
    userId: string;
    companyId: string;
    documentId: string;
    extraction: AtlasStructuredExtraction;
    metadata?: Record<string, unknown>;
    validationStatus?: 'draft' | 'validated';
  },
): Promise<CreateBankStatementResult> {
  const { userId, companyId, documentId, extraction, metadata, validationStatus = 'draft' } = params;
  const header = statementHeaderFromExtraction(extraction);
  const rawRows = parseBankTransactionsFromDocument(extraction, metadata);

  const { data: stmt, error: stmtErr } = await db
    .from('zafirix_bank_statements')
    .insert({
      user_id: userId,
      company_id: companyId,
      source_document_id: documentId,
      bank_name: header.bankName,
      account_number: header.accountNumber,
      statement_period_start: header.periodStart,
      statement_period_end: header.periodEnd,
      opening_balance: header.openingBalance,
      closing_balance: header.closingBalance,
      currency: 'MAD',
      transaction_count: rawRows.length,
      validation_status: validationStatus,
      raw_extraction: extraction as object,
      metadata: { imported_at: new Date().toISOString(), transaction_rows: rawRows.length },
    })
    .select('id')
    .single();

  if (stmtErr || !stmt) throw new Error(`Bank statement insert failed: ${stmtErr?.message ?? 'unknown'}`);

  const statementId = String(stmt.id);
  const txInserts = rawRows.map(raw => {
    const n = normalizeTransaction(raw);
    return {
      user_id: userId,
      company_id: companyId,
      statement_id: statementId,
      source_document_id: documentId,
      account_number: header.accountNumber,
      transaction_date: n.transaction_date,
      value_date: n.value_date,
      description: n.description,
      reference: n.reference,
      debit: n.debit,
      credit: n.credit,
      amount: n.amount,
      balance: n.balance,
      currency: 'MAD',
      validation_status: validationStatus,
      confidence_score: n.confidence_score,
      raw_payload: raw as object,
    };
  });

  if (txInserts.length > 0) {
    const { error: txErr } = await db.from('zafirix_bank_transactions').insert(txInserts);
    if (txErr) throw new Error(`Bank transactions insert failed: ${txErr.message}`);
  }

  await db.from('zafirix_bank_statements')
    .update({ transaction_count: txInserts.length, updated_at: new Date().toISOString() })
    .eq('id', statementId);

  void logAuditEvent({
    entityType: 'bank_statement',
    entityId: statementId,
    action: 'created',
    performedBy: userId,
    companyId,
    sourceDocumentId: documentId,
    newValues: { transaction_count: txInserts.length, ...header },
  });

  let reconciliationRun = false;
  if (txInserts.length > 0) {
    const { data: inserted } = await db
      .from('zafirix_bank_transactions')
      .select('id')
      .eq('statement_id', statementId);
    if (inserted?.length) {
      await runReconciliationForTransactions(db, userId, companyId, inserted.map(r => String(r.id)));
      reconciliationRun = true;
    }
  }

  return { statementId, transactionCount: txInserts.length, reconciliationRun };
}
