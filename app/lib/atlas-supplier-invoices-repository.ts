/**
 * Data-access boundary for supplier invoices (Sprint E).
 * Supabase: public.atlas_supplier_invoices. Local dev: browser storage only.
 */

import type { AtlasOcrExtraction } from '@/app/types/atlas-document';
import type { AtlasDocument } from '@/app/types/atlas-document';
import type { AtlasSupplierInvoice, AtlasSupplierInvoiceStatus } from '@/app/types/atlas-supplier-invoice';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { asRecord } from '@/app/lib/atlas-json';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';
import {
  requireOwnedCompany,
  requireOwnedDocument,
  requireOwnedSupplierInvoice,
} from '@/app/lib/atlas-entity-ownership';
import { ocrExtractionFromDocument, ocrInvoicesFromDocument } from '@/app/lib/atlas-documents-repository';
import {
  buildDetectedInvoicesFromExtraction,
  creatableOcrInvoices,
  pageLooksLikeInvoice,
  sourcePageForDetectedInvoice,
  supplierInvoiceDedupeKey,
} from '@/app/lib/atlas-ocr-invoices-detect';
import type { AtlasOcrDetectedInvoice } from '@/app/types/atlas-document';
import { addDaysYmd, todayYmd } from '@/app/lib/atlas-dates';
import { normalizePaymentTerms } from '@/app/types/atlas-payment-terms';

const SUPPLIER_INVOICE_SELECT =
  'id, user_id, company_id, document_id, source_page, supplier_name, invoice_number, invoice_date, amount_ht, vat_amount, amount_ttc, vat_rate, status, metadata, created_at, updated_at';

type AtlasSupplierInvoiceRow = {
  id: string;
  user_id: string;
  company_id: string | null;
  document_id: string | null;
  source_page: number | null;
  supplier_name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  amount_ht: number | string | null;
  vat_amount: number | string | null;
  amount_ttc: number | string | null;
  vat_rate: number | string | null;
  status: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export function readSupplierInvoicesFromLocalStorage(): AtlasSupplierInvoice[] {
  if (blockCriticalLocalStorageInProduction('atlas_supplier_invoices')) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATLAS_STORAGE_KEYS.supplierInvoices);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AtlasSupplierInvoice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSupplierInvoicesToLocalStorage(invoices: AtlasSupplierInvoice[]): void {
  if (blockCriticalLocalStorageInProduction('atlas_supplier_invoices')) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(ATLAS_STORAGE_KEYS.supplierInvoices, JSON.stringify(invoices));
}

function rowToSupplierInvoice(row: AtlasSupplierInvoiceRow): AtlasSupplierInvoice {
  const metadata = asRecord(row.metadata);
  const issueDate = row.invoice_date ? String(row.invoice_date) : todayYmd();
  return {
    id: String(row.id),
    companyId: row.company_id ? String(row.company_id) : undefined,
    documentId: row.document_id ? String(row.document_id) : undefined,
    supplierName: String(row.supplier_name ?? '').trim(),
    invoiceNumber: row.invoice_number ?? undefined,
    issueDate,
    paymentTerms: normalizePaymentTerms({ kind: 'preset', days: 60 }),
    dueDate: addDaysYmd(issueDate, 60),
    status: (row.status ?? 'unpaid') as AtlasSupplierInvoiceStatus,
    amountHT: row.amount_ht != null ? Number(row.amount_ht) : undefined,
    vatAmount: row.vat_amount != null ? Number(row.vat_amount) : undefined,
    totalTTC: row.amount_ttc != null ? Number(row.amount_ttc) : undefined,
    vatRate: row.vat_rate != null ? Number(row.vat_rate) : undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    ...(metadata || row.source_page != null
      ? {
          metadata: {
            ...(metadata ?? {}),
            ...(row.source_page != null ? { source_page: row.source_page } : {}),
          },
        }
      : {}),
  };
}

type SupplierInvoiceWriteInput = {
  documentId?: string;
  sourcePage?: number;
  supplierName: string;
  invoiceNumber?: string;
  issueDate: string;
  status: AtlasSupplierInvoiceStatus;
  amountHT?: number;
  vatAmount?: number;
  totalTTC?: number;
  vatRate?: number;
  metadata?: Record<string, unknown>;
};

function supplierInvoiceRowPayload(
  invoice: SupplierInvoiceWriteInput,
  userId: string,
  companyId: string,
): Record<string, unknown> {
  const sourcePage = invoice.sourcePage ?? null;
  return {
    user_id: userId,
    company_id: companyId,
    document_id: invoice.documentId ?? null,
    source_page: sourcePage,
    supplier_name: invoice.supplierName.trim() || 'Fournisseur à compléter',
    invoice_number: invoice.invoiceNumber?.trim() || null,
    invoice_date: invoice.issueDate || todayYmd(),
    amount_ht: invoice.amountHT ?? null,
    vat_amount: invoice.vatAmount ?? null,
    amount_ttc: invoice.totalTTC ?? null,
    vat_rate: invoice.vatRate ?? null,
    status: invoice.status,
    metadata: {
      ...(invoice.metadata ?? {}),
      ...(sourcePage != null ? { source_page: sourcePage } : {}),
    },
    updated_at: new Date().toISOString(),
  };
}

function mapDetectedInvoiceToSupplierWriteInput(
  detected: AtlasOcrDetectedInvoice,
  document: AtlasDocument,
): SupplierInvoiceWriteInput {
  const sourcePage = sourcePageForDetectedInvoice(detected);
  const issueDate = detected.invoice_date?.trim() || todayYmd();
  const supplierStatus: AtlasSupplierInvoiceStatus =
    detected.status === 'needs_review' ? 'needs_review' : 'unpaid';

  return {
    documentId: String(document.id),
    sourcePage,
    supplierName: detected.supplier_name?.trim() || 'Fournisseur à compléter',
    invoiceNumber: detected.invoice_number?.trim() || undefined,
    issueDate,
    status: supplierStatus,
    amountHT: detected.amount_ht,
    vatAmount: detected.vat_amount,
    totalTTC: detected.amount_ttc,
    vatRate: detected.vat_rate,
    metadata: {
      source: 'ocr',
      ocr_document_id: String(document.id),
      source_page: sourcePage,
      source_pages: detected.source_pages ?? [sourcePage],
      created_from: 'documents_ia',
    },
  };
}

export async function findSupplierInvoiceByDocumentPage(
  documentId: string,
  sourcePage: number,
  invoiceNumber?: string | null,
): Promise<AtlasSupplierInvoice | null> {
  if (!isAtlasSupabaseDataEnabled()) {
    const num = (invoiceNumber ?? '').trim().toLowerCase();
    return (
      readSupplierInvoicesFromLocalStorage().find((inv) => {
        if (inv.documentId !== documentId) return false;
        const meta = inv.metadata as Record<string, unknown> | undefined;
        const page = typeof meta?.source_page === 'number' ? meta.source_page : 0;
        if (page !== sourcePage) return false;
        return (inv.invoiceNumber ?? '').trim().toLowerCase() === num;
      }) ?? null
    );
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return null;

  let query = supabase
    .from('atlas_supplier_invoices')
    .select(SUPPLIER_INVOICE_SELECT)
    .eq('user_id', auth.userId)
    .eq('document_id', documentId)
    .eq('source_page', sourcePage);

  const trimmed = invoiceNumber?.trim();
  query = trimmed ? query.eq('invoice_number', trimmed) : query.is('invoice_number', null);

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    if (error && isSupplierInvoicesTableMissingError(error.message)) return null;
    return null;
  }
  return rowToSupplierInvoice(data as AtlasSupplierInvoiceRow);
}

/** @deprecated Use findSupplierInvoiceByDocumentPage — returns first invoice for document. */
export async function findSupplierInvoiceByDocumentId(
  documentId: string,
): Promise<AtlasSupplierInvoice | null> {
  if (!isAtlasSupabaseDataEnabled()) {
    return readSupplierInvoicesFromLocalStorage().find((inv) => inv.documentId === documentId) ?? null;
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return null;

  const { data, error } = await supabase
    .from('atlas_supplier_invoices')
    .select(SUPPLIER_INVOICE_SELECT)
    .eq('user_id', auth.userId)
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error && isSupplierInvoicesTableMissingError(error.message)) return null;
    return null;
  }
  return rowToSupplierInvoice(data as AtlasSupplierInvoiceRow);
}

export function supplierInvoiceKeysFromList(invoices: AtlasSupplierInvoice[]): Set<string> {
  const keys = new Set<string>();
  for (const inv of invoices) {
    if (!inv.documentId) continue;
    const meta = inv.metadata as Record<string, unknown> | undefined;
    const sourcePage =
      typeof meta?.source_page === 'number'
        ? meta.source_page
        : typeof (inv as AtlasSupplierInvoice & { sourcePage?: number }).sourcePage === 'number'
          ? (inv as AtlasSupplierInvoice & { sourcePage?: number }).sourcePage
          : 0;
    keys.add(supplierInvoiceDedupeKey(String(inv.documentId), sourcePage ?? 0, inv.invoiceNumber));
  }
  return keys;
}

export function isSupplierInvoicesTableMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('atlas_supplier_invoices') &&
    (m.includes('schema cache') || m.includes('does not exist') || m.includes('could not find'))
  );
}

export type ListSupplierInvoicesResult = {
  invoices: AtlasSupplierInvoice[];
  tableMissing: boolean;
};

export async function listSupplierInvoicesWithMeta(companyId: string): Promise<ListSupplierInvoicesResult> {
  if (!isAtlasSupabaseDataEnabled()) {
    const all = readSupplierInvoicesFromLocalStorage();
    const invoices = companyId ? all.filter((inv) => inv.companyId === companyId) : all;
    return { invoices, tableMissing: false };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { invoices: [], tableMissing: false };

  const owned = await requireOwnedCompany(companyId);
  if (!owned.ok) return { invoices: [], tableMissing: false };

  const { data, error } = await supabase
    .from('atlas_supplier_invoices')
    .select(SUPPLIER_INVOICE_SELECT)
    .eq('user_id', auth.userId)
    .eq('company_id', companyId)
    .order('invoice_date', { ascending: false });

  if (error) {
    const tableMissing = isSupplierInvoicesTableMissingError(error.message);
    if (!tableMissing) {
      logAtlasServerEvent('atlas_supplier_invoices', 'error', 'list_failed', { message: error.message });
    }
    return { invoices: [], tableMissing };
  }

  return {
    invoices: (data ?? []).map((row) => rowToSupplierInvoice(row as AtlasSupplierInvoiceRow)),
    tableMissing: false,
  };
}

export async function listSupplierInvoices(companyId: string): Promise<AtlasSupplierInvoice[]> {
  const { invoices } = await listSupplierInvoicesWithMeta(companyId);
  return invoices;
}

export async function createSupplierInvoicesFromOcr(
  documentId: string,
): Promise<
  | {
      ok: true;
      created: number;
      alreadyExists: number;
      skipped: number;
      invoiceIds: string[];
    }
  | { ok: false; error: string }
> {
  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: false, error: 'supabase_required' };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const ownedDoc = await requireOwnedDocument(documentId);
  if (!ownedDoc.ok) return { ok: false, error: ownedDoc.error };

  const { data: row, error: docErr } = await supabase
    .from('atlas_documents')
    .select('id, user_id, company_id, processing_status, content, metadata')
    .eq('id', documentId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (docErr || !row?.id) return { ok: false, error: 'document_not_found_or_forbidden' };

  if (row.processing_status !== 'processed') {
    return { ok: false, error: 'ocr_not_processed' };
  }

  const companyId = row.company_id ? String(row.company_id) : '';
  if (!companyId) return { ok: false, error: 'company_required' };

  const ownedCompany = await requireOwnedCompany(companyId);
  if (!ownedCompany.ok) return { ok: false, error: ownedCompany.error };

  const document = {
    id: String(row.id),
    companyId,
    content: row.content,
    metadata: asRecord(row.metadata),
  } as AtlasDocument;

  const detectedInvoices = creatableOcrInvoices(ocrInvoicesFromDocument(document));
  let invoicesToCreate = detectedInvoices;

  if (!invoicesToCreate.length) {
    const legacy = ocrExtractionFromDocument(document);
    if (legacy && pageLooksLikeInvoice(legacy)) {
      invoicesToCreate = creatableOcrInvoices(buildDetectedInvoicesFromExtraction(legacy));
    }
  }

  if (!invoicesToCreate.length) {
    return { ok: false, error: 'no_invoices_detected' };
  }

  let created = 0;
  let alreadyExists = 0;
  let skipped = 0;
  const invoiceIds: string[] = [];

  for (const detected of invoicesToCreate) {
    const sourcePage = sourcePageForDetectedInvoice(detected);
    const existing = await findSupplierInvoiceByDocumentPage(
      documentId,
      sourcePage,
      detected.invoice_number ?? null,
    );
    if (existing) {
      alreadyExists += 1;
      invoiceIds.push(String(existing.id));
      continue;
    }

    const mapped = mapDetectedInvoiceToSupplierWriteInput(detected, document);
    const payload = supplierInvoiceRowPayload(mapped, auth.userId, companyId);

    const { data: inserted, error: insertErr } = await supabase
      .from('atlas_supplier_invoices')
      .insert(payload)
      .select('id')
      .single();

    if (insertErr) {
      if (isSupplierInvoicesTableMissingError(insertErr.message)) {
        return { ok: false, error: 'supplier_invoices_table_missing' };
      }
      if (insertErr.code === '23505') {
        const again = await findSupplierInvoiceByDocumentPage(
          documentId,
          sourcePage,
          detected.invoice_number ?? null,
        );
        if (again) {
          alreadyExists += 1;
          invoiceIds.push(String(again.id));
          continue;
        }
      }
      skipped += 1;
      continue;
    }

    created += 1;
    invoiceIds.push(String(inserted.id));
  }

  return { ok: true, created, alreadyExists, skipped, invoiceIds };
}

export async function createSupplierInvoiceFromOcr(
  documentId: string,
): Promise<
  | { ok: true; id: string; alreadyExists: boolean; status: AtlasSupplierInvoiceStatus; created: number; total: number }
  | { ok: false; error: string }
> {
  const result = await createSupplierInvoicesFromOcr(documentId);
  if (!result.ok) return result;

  const firstId = result.invoiceIds[0] ?? '';
  return {
    ok: true,
    id: firstId,
    alreadyExists: result.created === 0 && result.alreadyExists > 0,
    status: 'unpaid',
    created: result.created,
    total: result.invoiceIds.length,
  };
}

export async function updateSupplierInvoice(
  invoice: AtlasSupplierInvoice,
  opts: { companyId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    const existing = readSupplierInvoicesFromLocalStorage();
    const next = existing.some((i) => i.id === invoice.id)
      ? existing.map((i) => (i.id === invoice.id ? { ...invoice, updatedAt: new Date().toISOString() } : i))
      : [...existing, invoice];
    writeSupplierInvoicesToLocalStorage(next);
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  if (typeof invoice.id !== 'string') return { ok: false, error: 'invalid_id' };

  const owned = await requireOwnedSupplierInvoice(invoice.id);
  if (!owned.ok) return { ok: false, error: owned.error };

  const companyId = opts.companyId.trim();
  if (!companyId) return { ok: false, error: 'company_required' };

  const ownedCompany = await requireOwnedCompany(companyId);
  if (!ownedCompany.ok) return { ok: false, error: ownedCompany.error };

  const row = supplierInvoiceRowPayload(
    {
      documentId: invoice.documentId,
      sourcePage:
        typeof (invoice.metadata as Record<string, unknown> | undefined)?.source_page === 'number'
          ? ((invoice.metadata as Record<string, unknown>).source_page as number)
          : undefined,
      supplierName: invoice.supplierName,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      status: invoice.status,
      amountHT: invoice.amountHT,
      vatAmount: invoice.vatAmount,
      totalTTC: invoice.totalTTC,
      vatRate: invoice.vatRate,
      metadata: invoice.metadata,
    },
    auth.userId,
    companyId,
  );
  const { error } = await supabase
    .from('atlas_supplier_invoices')
    .update(row)
    .eq('id', invoice.id)
    .eq('user_id', auth.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteSupplierInvoice(
  id: AtlasSupplierInvoice['id'],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    writeSupplierInvoicesToLocalStorage(readSupplierInvoicesFromLocalStorage().filter((inv) => inv.id !== id));
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  if (typeof id !== 'string') return { ok: false, error: 'invalid_id' };

  const owned = await requireOwnedSupplierInvoice(id);
  if (!owned.ok) return { ok: false, error: owned.error };

  const { error } = await supabase
    .from('atlas_supplier_invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function atlasSupplierInvoiceErrorMessage(code: string): string {
  switch (code) {
    case 'auth_required':
      return 'Connectez-vous pour gérer vos factures fournisseur.';
    case 'company_required':
      return 'Sélectionnez une société active avant de créer une facture fournisseur.';
    case 'company_not_found_or_forbidden':
      return 'Société active introuvable ou non autorisée.';
    case 'document_not_found_or_forbidden':
      return 'Document OCR introuvable ou non autorisé.';
    case 'supplier_invoice_not_found_or_forbidden':
      return 'Cette facture fournisseur est introuvable ou ne vous appartient pas.';
    case 'ocr_not_processed':
      return 'L’analyse OCR doit être terminée avant de créer une facture fournisseur.';
    case 'supabase_required':
      return 'Création depuis OCR disponible uniquement en mode Supabase.';
    case 'supplier_invoices_table_missing':
      return 'Table factures fournisseur absente. Exécutez les migrations Sprint E dans Supabase SQL Editor.';
    case 'invalid_id':
      return 'Identifiant facture fournisseur invalide.';
    case 'no_invoices_detected':
      return 'Aucune facture détectée dans ce document.';
    default:
      return code || 'Une erreur est survenue. Réessayez.';
  }
}
