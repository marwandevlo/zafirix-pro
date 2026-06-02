/**
 * Parse bank transactions from OCR extraction + document metadata.
 */

import type { AtlasStructuredExtraction } from '@/app/types/atlas-document';

export type RawBankTransaction = {
  transaction_date?: string;
  value_date?: string;
  description?: string;
  reference?: string;
  debit?: number;
  credit?: number;
  amount?: number;
  balance?: number;
};

function fieldVal(field: unknown): string | number | null {
  if (field == null) return null;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    const v = (field as { value?: unknown }).value;
    if (typeof v === 'number') return v;
    if (v != null) return String(v);
    return null;
  }
  if (typeof field === 'number') return field;
  return String(field);
}

function parseNum(v: string | number | null): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseDateStr(v: string | number | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (fr) {
    const y = fr[3].length === 2 ? `20${fr[3]}` : fr[3];
    return `${y}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  }
  return null;
}

export function extractStringFromField(field: unknown): string | null {
  const v = fieldVal(field);
  return v == null ? null : String(v);
}

export function extractNumericFromField(field: unknown): number | null {
  return parseNum(fieldVal(field));
}

/** Normalize a single raw transaction row */
export function normalizeTransaction(raw: RawBankTransaction, confidence = 0.85): {
  transaction_date: string | null;
  value_date: string | null;
  description: string | null;
  reference: string | null;
  debit: number;
  credit: number;
  amount: number;
  balance: number | null;
  confidence_score: number;
} {
  const debit = raw.debit ?? (raw.amount != null && raw.amount < 0 ? Math.abs(raw.amount) : 0);
  const credit = raw.credit ?? (raw.amount != null && raw.amount > 0 ? raw.amount : 0);
  const amount = raw.amount ?? (credit > 0 ? credit : debit);
  return {
    transaction_date: parseDateStr(raw.transaction_date ?? null),
    value_date: parseDateStr(raw.value_date ?? raw.transaction_date ?? null),
    description: raw.description?.trim() || null,
    reference: raw.reference?.trim() || null,
    debit: Math.round(debit * 100) / 100,
    credit: Math.round(credit * 100) / 100,
    amount: Math.round(Math.abs(amount) * 100) / 100,
    balance: raw.balance != null ? Math.round(raw.balance * 100) / 100 : null,
    confidence_score: confidence,
  };
}

/** Collect transactions from extraction metadata */
export function parseBankTransactionsFromDocument(
  extraction: AtlasStructuredExtraction,
  metadata?: Record<string, unknown>,
): RawBankTransaction[] {
  const rows: RawBankTransaction[] = [];

  // 1. metadata.transactions array (preferred)
  const metaTx = metadata?.transactions;
  if (Array.isArray(metaTx)) {
    for (const t of metaTx) {
      if (t && typeof t === 'object') {
        const o = t as Record<string, unknown>;
        rows.push({
          transaction_date: o.date as string | undefined ?? o.transaction_date as string | undefined,
          value_date: o.value_date as string | undefined,
          description: o.description as string | undefined ?? o.label as string | undefined,
          reference: o.reference as string | undefined,
          debit: typeof o.debit === 'number' ? o.debit : undefined,
          credit: typeof o.credit === 'number' ? o.credit : undefined,
          amount: typeof o.amount === 'number' ? o.amount : undefined,
          balance: typeof o.balance === 'number' ? o.balance : undefined,
        });
      }
    }
  }

  // 2. extraction.line_items as bank lines
  const ext = extraction as Record<string, unknown>;
  const lineItems = ext.line_items ?? ext.transactions;
  if (Array.isArray(lineItems) && rows.length === 0) {
    for (const item of lineItems) {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        rows.push({
          description: String(o.description ?? o.label ?? ''),
          debit: parseNum(o.debit as string | number) ?? undefined,
          credit: parseNum(o.credit as string | number) ?? undefined,
          amount: parseNum(o.amount as string | number) ?? undefined,
        });
      }
    }
  }

  return rows;
}

export function statementHeaderFromExtraction(
  extraction: AtlasStructuredExtraction,
): {
  bankName: string | null;
  accountNumber: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  periodStart: string | null;
  periodEnd: string | null;
} {
  const ext = extraction as Record<string, unknown>;
  const period = extractStringFromField(ext.statement_period);
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  if (period) {
    const parts = period.split(/[\/\-–—to]+/i).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      periodStart = parseDateStr(parts[0]);
      periodEnd = parseDateStr(parts[1]);
    }
  }
  return {
    bankName: extractStringFromField(ext.bank_name),
    accountNumber: extractStringFromField(ext.account_number),
    openingBalance: extractNumericFromField(ext.opening_balance),
    closingBalance: extractNumericFromField(ext.closing_balance),
    periodStart,
    periodEnd,
  };
}
