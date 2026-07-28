/**
 * Sync bank statements from Documents IA into zafirix_bank_transactions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AtlasDocumentType, AtlasStructuredExtraction } from '@/app/types/atlas-document';
import { asRecord } from '@/app/lib/atlas-json';
import { parseNestedClassification } from '@/app/lib/atlas-ai-json-parse';
import { isBankStatementType, normalizeDocumentTypeAlias } from '@/app/lib/atlas-document-type-utils';
import { parseBankTransactionsFromDocument } from '@/app/lib/atlas-bank-extraction';
import { syncBankStatementFromDocument } from '@/app/lib/atlas-bank-server';

export type PendingBankStatementDoc = {
  id: string;
  title: string;
  filename: string | null;
  validationStatus: string;
  transactionCount: number;
  synced: boolean;
  statementId: string | null;
  syncedTransactionCount: number;
};

export type BankStatementSyncResult = {
  synced: number;
  skipped: number;
  totalTransactions: number;
  errors: { documentId: string; message: string }[];
  results: { documentId: string; statementId: string; transactionCount: number }[];
};

type DocumentRow = {
  id: string;
  title: string | null;
  filename: string | null;
  validation_status: string | null;
  document_type: string | null;
  metadata: unknown;
};

function structuredExtractionFromMetadata(metadata: Record<string, unknown>): AtlasStructuredExtraction {
  const raw = metadata.extraction;
  if (!raw || typeof raw !== 'object') return {};
  return raw as AtlasStructuredExtraction;
}

export function resolveDocumentBankType(row: DocumentRow): AtlasDocumentType | null {
  const fromColumn = normalizeDocumentTypeAlias(row.document_type);
  if (fromColumn && isBankStatementType(fromColumn)) return fromColumn;

  const metadata = asRecord(row.metadata) ?? {};
  const parsed = parseNestedClassification(metadata.classification);
  const detectedType = parsed?.detected_type;
  const fromClassification = normalizeDocumentTypeAlias(
    typeof detectedType === 'string' ? detectedType : null,
  );
  if (fromClassification && isBankStatementType(fromClassification)) return fromClassification;

  return null;
}

export function bankTransactionCountFromRow(row: DocumentRow): number {
  const metadata = asRecord(row.metadata) ?? {};
  const extraction = structuredExtractionFromMetadata(metadata);
  return parseBankTransactionsFromDocument(extraction, metadata).length;
}

export async function listPendingBankStatements(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<PendingBankStatementDoc[]> {
  const { data: docs, error } = await admin
    .from('atlas_documents')
    .select('id, title, filename, validation_status, document_type, metadata, processing_status')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .eq('processing_status', 'processed')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const bankDocs = (docs ?? []).filter((row) => resolveDocumentBankType(row as DocumentRow) != null);
  if (bankDocs.length === 0) return [];

  const docIds = bankDocs.map((d) => String(d.id));
  const { data: statements } = await admin
    .from('zafirix_bank_statements')
    .select('id, source_document_id, transaction_count')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .in('source_document_id', docIds);

  const stmtByDoc = new Map<string, { id: string; transactionCount: number }>();
  for (const stmt of statements ?? []) {
    const docId = String(stmt.source_document_id);
    stmtByDoc.set(docId, {
      id: String(stmt.id),
      transactionCount: typeof stmt.transaction_count === 'number' ? stmt.transaction_count : 0,
    });
  }

  return bankDocs.map((row) => {
    const docRow = row as DocumentRow;
    const docId = String(docRow.id);
    const extractedCount = bankTransactionCountFromRow(docRow);
    const existing = stmtByDoc.get(docId);
    const syncedTransactionCount = existing?.transactionCount ?? 0;
    const synced = syncedTransactionCount > 0;

    return {
      id: docId,
      title: docRow.title?.trim() || docRow.filename?.trim() || 'Relevé bancaire',
      filename: docRow.filename,
      validationStatus: docRow.validation_status ?? 'pending_review',
      transactionCount: extractedCount,
      synced,
      statementId: existing?.id ?? null,
      syncedTransactionCount,
    };
  });
}

export async function syncBankStatementsFromDocuments(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  documentIds?: string[],
): Promise<BankStatementSyncResult> {
  const pending = await listPendingBankStatements(admin, userId, companyId);
  const targets = documentIds?.length
    ? pending.filter((p) => documentIds.includes(p.id))
    : pending.filter((p) => !p.synced && p.transactionCount > 0);

  const result: BankStatementSyncResult = {
    synced: 0,
    skipped: 0,
    totalTransactions: 0,
    errors: [],
    results: [],
  };

  for (const target of targets) {
    const { data: row, error } = await admin
      .from('atlas_documents')
      .select('id, metadata, validation_status')
      .eq('id', target.id)
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error || !row) {
      result.errors.push({ documentId: target.id, message: error?.message ?? 'Document introuvable.' });
      result.skipped += 1;
      continue;
    }

    const metadata = asRecord(row.metadata) ?? {};
    const extraction = structuredExtractionFromMetadata(metadata);
    const txCount = parseBankTransactionsFromDocument(extraction, metadata).length;

    if (txCount === 0) {
      result.errors.push({
        documentId: target.id,
        message: 'Aucune opération extraite — relancez l\'OCR ou corrigez le relevé.',
      });
      result.skipped += 1;
      continue;
    }

    try {
      const markValidated = row.validation_status === 'validated';
      const imported = await syncBankStatementFromDocument(admin, {
        userId,
        companyId,
        documentId: target.id,
        extraction,
        metadata,
        markValidated,
      });

      result.synced += 1;
      result.totalTransactions += imported.transactionCount;
      result.results.push({
        documentId: target.id,
        statementId: imported.statementId,
        transactionCount: imported.transactionCount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ documentId: target.id, message });
      result.skipped += 1;
    }
  }

  return result;
}
