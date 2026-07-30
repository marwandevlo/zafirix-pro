/**
 * Documents IA → Accounting Engine
 *
 * Creates traceable Debit/Credit journal entries from a validated document.
 * Uses the Moroccan PCGE (Plan Comptable Général des Entreprises) account codes.
 *
 * Purchase invoice flow:
 *   Debit  61xxxx (charges HT)     ← montant_ht
 *   Debit  34551  (TVA déductible) ← tva_amount
 *   Credit 44100  (Fournisseurs)   ← total_ttc
 *
 * Sales invoice flow:
 *   Debit  34210  (Clients)        ← total_ttc
 *   Credit 71100  (Ventes)         ← montant_ht
 *   Credit 44550  (TVA collectée)  ← tva_amount
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AtlasStructuredExtraction } from '@/app/types/atlas-document';
import { currentPeriodKey, periodTypeForRegime } from '@/app/lib/atlas-tva-server';

// ── Moroccan PCGE account codes ───────────────────────────────────────────────

/** Map category_suggestion / accounting_account → charge account code. */
function resolveChargeAccount(
  category?: string | null,
  accountingAccount?: string | null,
): string {
  // Use AI-suggested account if it looks like a valid code
  if (accountingAccount && /^\d{5,8}$/.test(accountingAccount.replace(/\s/g, ''))) {
    return accountingAccount.replace(/\s/g, '');
  }
  // Category-based mapping
  const c = (category ?? '').toLowerCase();
  if (c.includes('loyer') || c.includes('location')) return '61300';
  if (c.includes('téléphone') || c.includes('internet') || c.includes('télécommunication')) return '61310';
  if (c.includes('électricité') || c.includes('eau') || c.includes('énergie')) return '61400';
  if (c.includes('assurance')) return '61600';
  if (c.includes('transport') || c.includes('livraison')) return '61631';
  if (c.includes('publicité') || c.includes('marketing')) return '62100';
  if (c.includes('informatique') || c.includes('logiciel')) return '61320';
  if (c.includes('maintenance') || c.includes('entretien')) return '61500';
  if (c.includes('fourniture') || c.includes('bureau')) return '61250';
  if (c.includes('carburant')) return '61632';
  if (c.includes('matière') || c.includes('matériau') || c.includes('marchandise')) return '61111';
  // Default: services extérieurs
  return '61200';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractNum(field?: { value?: string | number | null; user_corrected_value?: string } | null): number {
  if (!field) return 0;
  const raw = field.user_corrected_value != null ? field.user_corrected_value : field.value;
  if (typeof raw === 'number' && isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  return 0;
}

function extractStr(field?: { value?: string | number | null; user_corrected_value?: string } | null): string {
  if (!field) return '';
  const raw = field.user_corrected_value != null ? field.user_corrected_value : field.value;
  return raw != null ? String(raw) : '';
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!parts) return null;
  const [, d, m, y] = parts;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function periodKey(dateYmd: string, regime: string): string {
  return currentPeriodKey(regime, new Date(`${dateYmd}T12:00:00`));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AccountingJournalLine = {
  date: string;
  libelle: string;
  compte: string;
  debit: number;
  credit: number;
  source_document_id?: string;
  source_invoice_id?: string;
  generated_by: 'documents_ia' | 'petty_cash' | 'fixed_assets';
  validation_status: 'draft';
};

export type TvaSuggestion = {
  tva_type: 'deductible' | 'collectee';
  amount: number;
  rate: number;
  base_ht: number;
  period_key: string;
  invoice_date: string | null;
  invoice_number: string;
  supplier_name: string;
  source_document_id: string;
  source_invoice_id?: string;
};

export type AccountingEngineResult = {
  ok: true;
  journalLines: AccountingJournalLine[];
  tvaSuggestion: TvaSuggestion | null;
  supplierInvoiceId: string;
  journalEntryIds: string[];
  tvaSuggestionId: string | null;
};

export type AccountingEngineError = {
  ok: false;
  error: string;
};

// ── Main engine ───────────────────────────────────────────────────────────────

export function buildJournalLines(
  documentId: string,
  extraction: AtlasStructuredExtraction,
  isPurchase: boolean,
  invoiceId: string,
  uploadDateYmd?: string | null,
): AccountingJournalLine[] {
  const supplierName = extractStr(extraction.supplier_name) || 'Fournisseur';
  const invoiceNum = extractStr(extraction.invoice_number) || '—';
  const invoiceDateRaw = extractStr(extraction.invoice_date);
  const entryDate = parseDate(invoiceDateRaw) ?? parseDate(uploadDateYmd ?? '') ?? null;
  if (!entryDate) return [];
  const ht = extractNum(extraction.subtotal_ht);
  const tva = extractNum(extraction.tva_amount);
  const ttc = extractNum(extraction.total_ttc) || (ht + tva);
  const category = extractStr(extraction.category_suggestion);
  const accountingAccount = extractStr(extraction.accounting_account);

  const base: Omit<AccountingJournalLine, 'libelle' | 'compte' | 'debit' | 'credit'> = {
    date: entryDate,
    source_document_id: documentId,
    source_invoice_id: invoiceId,
    generated_by: 'documents_ia',
    validation_status: 'draft',
  };

  if (isPurchase) {
    const chargeAccount = resolveChargeAccount(category, accountingAccount);
    const lines: AccountingJournalLine[] = [];
    if (ht > 0) {
      lines.push({
        ...base,
        libelle: `Charges / ${supplierName} — Fac. ${invoiceNum}`,
        compte: chargeAccount,
        debit: Math.round(ht * 100) / 100,
        credit: 0,
      });
    }
    if (tva > 0) {
      lines.push({
        ...base,
        libelle: `TVA déductible / ${supplierName} — Fac. ${invoiceNum}`,
        compte: '34551',
        debit: Math.round(tva * 100) / 100,
        credit: 0,
      });
    }
    if (ttc > 0) {
      lines.push({
        ...base,
        libelle: `Fournisseurs / ${supplierName} — Fac. ${invoiceNum}`,
        compte: '44100',
        debit: 0,
        credit: Math.round(ttc * 100) / 100,
      });
    }
    return lines;
  } else {
    // Sales invoice
    const clientName = extractStr(extraction.customer_name) || 'Client';
    const lines: AccountingJournalLine[] = [];
    if (ttc > 0) {
      lines.push({
        ...base,
        libelle: `Clients / ${clientName} — Fac. ${invoiceNum}`,
        compte: '34210',
        debit: Math.round(ttc * 100) / 100,
        credit: 0,
      });
    }
    if (ht > 0) {
      lines.push({
        ...base,
        libelle: `Ventes / ${clientName} — Fac. ${invoiceNum}`,
        compte: '71100',
        debit: 0,
        credit: Math.round(ht * 100) / 100,
      });
    }
    if (tva > 0) {
      lines.push({
        ...base,
        libelle: `TVA collectée / ${clientName} — Fac. ${invoiceNum}`,
        compte: '44550',
        debit: 0,
        credit: Math.round(tva * 100) / 100,
      });
    }
    return lines;
  }
}

export function buildTvaSuggestion(
  documentId: string,
  extraction: AtlasStructuredExtraction,
  isPurchase: boolean,
  invoiceId: string,
  regime: string,
  uploadDateYmd?: string | null,
): TvaSuggestion | null {
  const tva = extractNum(extraction.tva_amount);
  if (tva <= 0) return null;

  const ht = extractNum(extraction.subtotal_ht);
  const rate = extractNum(extraction.tva_rate) || (ht > 0 ? Math.round(tva / ht * 100) : 20);
  const invoiceDateRaw = extractStr(extraction.invoice_date);
  const invoiceDateYmd = parseDate(invoiceDateRaw) ?? parseDate(uploadDateYmd ?? '') ?? null;
  if (!invoiceDateYmd) return null;
  const pk = periodKey(invoiceDateYmd, regime);

  return {
    tva_type: isPurchase ? 'deductible' : 'collectee',
    amount: Math.round(tva * 100) / 100,
    rate: Math.round(rate * 100) / 100,
    base_ht: Math.round(ht * 100) / 100,
    period_key: pk,
    invoice_date: invoiceDateYmd,
    invoice_number: extractStr(extraction.invoice_number) || '',
    supplier_name: extractStr(extraction.supplier_name) || extractStr(extraction.customer_name) || '',
    source_document_id: documentId,
    source_invoice_id: invoiceId,
  };
}

/** Persist journal lines to atlas_accounting_entries. Returns inserted IDs. */
export async function persistJournalLines(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  lines: AccountingJournalLine[],
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  if (!lines.length) return { ok: true, ids: [] };

  const rows = lines.map(line => ({
    user_id: userId,
    company_id: companyId,
    entry_json: {
      id: crypto.randomUUID(),
      date: line.date,
      libelle: line.libelle,
      compte: line.compte,
      debit: line.debit,
      credit: line.credit,
    },
    entry_date: line.date,
    source_document_id: line.source_document_id ?? null,
    source_invoice_id: line.source_invoice_id ?? null,
    generated_by: line.generated_by,
    validation_status: line.validation_status,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await admin
    .from('atlas_accounting_entries')
    .insert(rows)
    .select('id');

  if (error) return { ok: false, error: error.message };
  return { ok: true, ids: (data ?? []).map((r: { id: string }) => String(r.id)) };
}

/** Persist TVA suggestion to zafirix_tva_suggestions. Returns inserted ID. */
export async function persistTvaSuggestion(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  suggestion: TvaSuggestion,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('zafirix_tva_suggestions')
    .insert({
      user_id: userId,
      company_id: companyId,
      source_document_id: suggestion.source_document_id,
      source_invoice_id: suggestion.source_invoice_id ?? null,
      tva_type: suggestion.tva_type,
      amount: suggestion.amount,
      rate: suggestion.rate,
      base_ht: suggestion.base_ht,
      period_key: suggestion.period_key,
      invoice_date: suggestion.invoice_date,
      invoice_number: suggestion.invoice_number,
      supplier_name: suggestion.supplier_name,
      validation_status: 'pending',
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: String(data?.id ?? '') };
}
