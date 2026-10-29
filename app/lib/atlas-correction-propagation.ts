import { MONEY_TOLERANCE } from '@/app/lib/atlas-documents-accounting-engine';

const IMMUTABLE_LEDGER_STATUSES = ['validated', 'archived', 'posted'] as const;

export type CorrectionDelta = { field: string; old_value: unknown; new_value: unknown };

export type DraftEntryRow = {
  id: string;
  validation_status: string | null;
  entry_json: Record<string, unknown> | null;
  source_invoice_id?: string | null;
};

export type EntryCorrectionPlan = {
  planned: Array<{ id: string; entry_json: Record<string, unknown> }>;
  immutableIds: string[];
  balanced: boolean;
};

export function numericOrNull(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    if (isFinite(n)) return n;
  }
  return null;
}

/**
 * Invoices a document's records belong to. Document-level corrections carry one set of
 * amounts, so they can only be applied when this is at most one.
 */
export function linkedInvoiceIds(
  invoiceIds: Array<string | null | undefined>,
  entries: Array<Pick<DraftEntryRow, 'source_invoice_id'>>,
): Set<string> {
  const ids = new Set<string>();
  for (const id of invoiceIds) if (id) ids.add(String(id));
  for (const entry of entries) if (entry.source_invoice_id) ids.add(String(entry.source_invoice_id));
  return ids;
}

/** New amounts for the draft lines of a single-invoice document; validated lines are never changed. */
export function planDraftEntryCorrection(
  entries: DraftEntryRow[],
  corrections: Record<string, CorrectionDelta>,
): EntryCorrectionPlan {
  const ht = numericOrNull(corrections.subtotal_ht?.new_value);
  const vat = numericOrNull(corrections.tva_amount?.new_value);
  const ttc = numericOrNull(corrections.total_ttc?.new_value);
  const planned: EntryCorrectionPlan['planned'] = [];
  const immutableIds: string[] = [];
  let debitSum = 0;
  let creditSum = 0;
  for (const entry of entries) {
    if ((IMMUTABLE_LEDGER_STATUSES as readonly string[]).includes(entry.validation_status ?? '')) {
      immutableIds.push(entry.id);
      continue;
    }
    const json = entry.entry_json ?? {};
    const compte = String(json.compte ?? '');
    let debit = Number(json.debit ?? 0);
    let credit = Number(json.credit ?? 0);
    if (compte.startsWith('3455') && vat != null) debit = vat;
    else if (compte.startsWith('4455') && vat != null) credit = vat;
    else if ((compte.startsWith('441') || compte.startsWith('342')) && ttc != null) {
      if (debit > 0) debit = ttc;
      if (credit > 0) credit = ttc;
    } else if ((compte.startsWith('6') || compte.startsWith('7')) && ht != null) {
      if (debit > 0) debit = ht;
      if (credit > 0) credit = ht;
    }
    debitSum += debit;
    creditSum += credit;
    planned.push({ id: entry.id, entry_json: { ...json, debit, credit } });
  }
  return { planned, immutableIds, balanced: Math.abs(debitSum - creditSum) <= MONEY_TOLERANCE };
}
