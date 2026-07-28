/**
 * Normalize raw AI OCR text into typed client payloads (invoice vs bank statement).
 */

import { parseAiJsonResponse } from '@/app/lib/atlas-ai-json-parse';
import type { AtlasDocumentClassification, AtlasStructuredExtraction } from '@/app/types/atlas-document';

export type BankStatementTransaction = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
};

export type BankStatementOcrPayload = {
  type: 'bank_statement';
  bankName: string;
  accountNumber?: string;
  period?: string;
  transactions: BankStatementTransaction[];
};

export type InvoiceOcrPayload = {
  type: 'invoice';
  numero_facture?: string;
  date?: string;
  fournisseur?: string;
  montant_ht?: number;
  taux_tva?: number;
  montant_tva?: number;
  montant_ttc?: number;
  description?: string;
};

export type NormalizedOcrPayload = BankStatementOcrPayload | InvoiceOcrPayload;

function fieldValue(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    const v = (raw as { value?: unknown }).value;
    return v != null ? String(v).trim() : '';
  }
  return String(raw).trim();
}

function fieldNumber(raw: unknown): number {
  const s = fieldValue(raw);
  if (!s) return 0;
  const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function normalizeTransactionRow(raw: Record<string, unknown>): BankStatementTransaction {
  const debit = typeof raw.debit === 'number' ? raw.debit : fieldNumber(raw.debit);
  const credit = typeof raw.credit === 'number' ? raw.credit : fieldNumber(raw.credit);
  const amount = typeof raw.amount === 'number' ? raw.amount : fieldNumber(raw.amount);
  return {
    date: String(raw.date ?? raw.transaction_date ?? raw.value_date ?? '').trim(),
    description: String(raw.description ?? raw.label ?? '').trim(),
    debit: debit || (amount < 0 ? Math.abs(amount) : 0),
    credit: credit || (amount > 0 ? amount : 0),
    balance: typeof raw.balance === 'number' ? raw.balance : fieldNumber(raw.balance) || undefined,
  };
}

function transactionsFromParsed(parsed: Record<string, unknown>): BankStatementTransaction[] {
  const rows: BankStatementTransaction[] = [];
  const rawTx = parsed.transactions;
  if (Array.isArray(rawTx)) {
    for (const item of rawTx) {
      if (item && typeof item === 'object') {
        rows.push(normalizeTransactionRow(item as Record<string, unknown>));
      }
    }
  }
  return rows;
}

function isBankStatementType(type: unknown): boolean {
  const key = String(type ?? '').trim().toLowerCase();
  return key === 'bank_statement' || key === 'releve_bancaire';
}

/** Parse and normalize AI OCR output for API/client consumption. */
export function normalizeOcrAiResponse(rawText: string): NormalizedOcrPayload {
  const parsed = parseAiJsonResponse<Record<string, unknown>>(rawText);

  if (parsed.type === 'bank_statement' && typeof parsed === 'object') {
    const tx = Array.isArray(parsed.transactions)
      ? parsed.transactions
          .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
          .map(normalizeTransactionRow)
      : [];
    return {
      type: 'bank_statement',
      bankName: String(parsed.bankName ?? parsed.bank_name ?? ''),
      accountNumber: String(parsed.accountNumber ?? parsed.account_number ?? '') || undefined,
      period: String(parsed.period ?? parsed.statement_period ?? '') || undefined,
      transactions: tx,
    };
  }

  const classification =
    parsed.classification && typeof parsed.classification === 'object'
      ? (parsed.classification as Record<string, unknown>)
      : null;
  const detectedType = classification?.detected_type ?? parsed.detected_type;

  if (isBankStatementType(detectedType)) {
    const extraction =
      parsed.extraction && typeof parsed.extraction === 'object'
        ? (parsed.extraction as Record<string, unknown>)
        : {};
    const transactions = transactionsFromParsed(parsed);
    return {
      type: 'bank_statement',
      bankName: fieldValue(extraction.bank_name) || String(parsed.bankName ?? ''),
      accountNumber: fieldValue(extraction.account_number) || undefined,
      period: fieldValue(extraction.statement_period) || undefined,
      transactions,
    };
  }

  const extraction =
    parsed.extraction && typeof parsed.extraction === 'object'
      ? (parsed.extraction as Record<string, unknown>)
      : parsed;

  return {
    type: 'invoice',
    numero_facture: fieldValue(extraction.invoice_number) || String(parsed.numero_facture ?? '') || undefined,
    date: fieldValue(extraction.invoice_date) || String(parsed.date ?? '') || undefined,
    fournisseur: fieldValue(extraction.supplier_name) || String(parsed.fournisseur ?? '') || undefined,
    montant_ht: fieldNumber(extraction.subtotal_ht) || (typeof parsed.montant_ht === 'number' ? parsed.montant_ht : undefined),
    taux_tva: fieldNumber(extraction.tva_rate) || (typeof parsed.taux_tva === 'number' ? parsed.taux_tva : undefined),
    montant_tva: fieldNumber(extraction.tva_amount) || (typeof parsed.montant_tva === 'number' ? parsed.montant_tva : undefined),
    montant_ttc: fieldNumber(extraction.total_ttc) || (typeof parsed.montant_ttc === 'number' ? parsed.montant_ttc : undefined),
    description: String(parsed.description ?? '') || undefined,
  };
}

export function buildBankStatementPayloadFromOcrResult(input: {
  classification: AtlasDocumentClassification;
  extraction: AtlasStructuredExtraction;
  transactions?: Array<Record<string, unknown>>;
}): BankStatementOcrPayload {
  const extractionRec = input.extraction as Record<string, unknown>;
  const bankName = fieldValue(extractionRec.bank_name);
  const accountNumber = fieldValue(extractionRec.account_number) || undefined;
  const period = fieldValue(extractionRec.statement_period) || undefined;

  const transactions = (input.transactions ?? []).map((row) =>
    normalizeTransactionRow(row as Record<string, unknown>),
  );

  return {
    type: 'bank_statement',
    bankName,
    accountNumber,
    period,
    transactions,
  };
}
