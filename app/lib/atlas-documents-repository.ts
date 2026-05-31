/**
 * Data-access boundary for documents: library + OCR uploads (Sprint D-alt).
 */

import type { AtlasDocument, AtlasDocumentProcessingStatus, AtlasOcrDetectedInvoice, AtlasOcrError, AtlasOcrExtraction } from '@/app/types/atlas-document';
import {
  buildDetectedInvoicesFromExtraction,
  creatableOcrInvoices,
  summaryExtractionFromInvoices,
} from '@/app/lib/atlas-ocr-invoices-detect';
import { ATLAS_STORAGE_KEYS } from '@/app/lib/atlas-storage-keys';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { asRecord } from '@/app/lib/atlas-json';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';
import { requireOwnedCompany, requireOwnedDocument } from '@/app/lib/atlas-entity-ownership';
import { ATLAS_DOCUMENTS_BUCKET } from '@/app/lib/atlas-document-storage';

const DOCUMENT_SELECT =
  'id, user_id, company_id, type, title, content, kind, source, status, filename, mime_type, size_bytes, storage_path, extracted_text, processing_status, metadata, created_at, updated_at';

type AtlasDocumentRow = {
  id: string;
  user_id: string;
  company_id: string | null;
  type: string | null;
  title: string;
  content: unknown;
  kind: string;
  source: string;
  status: string;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  extracted_text: string | null;
  processing_status: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export function readDocumentsFromLocalStorage(): AtlasDocument[] {
  if (blockCriticalLocalStorageInProduction('atlas_documents')) return [];
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATLAS_STORAGE_KEYS.documents);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AtlasDocument[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeDocumentsToLocalStorage(documents: AtlasDocument[]): void {
  if (blockCriticalLocalStorageInProduction('atlas_documents')) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(ATLAS_STORAGE_KEYS.documents, JSON.stringify(documents));
}

function rowToDocument(row: AtlasDocumentRow): AtlasDocument {
  const metadata = asRecord(row.metadata) ?? undefined;
  return {
    id: String(row.id),
    companyId: row.company_id ? String(row.company_id) : null,
    type: String(row.type ?? 'generic'),
    title: String(row.title ?? ''),
    content: row.content ?? undefined,
    kind: String(row.kind ?? 'generic'),
    source: String(row.source ?? 'manual'),
    status: String(row.status ?? 'active'),
    filename: row.filename ?? undefined,
    mimeType: row.mime_type ?? undefined,
    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : undefined,
    storagePath: row.storage_path ?? undefined,
    extractedText: row.extracted_text ?? undefined,
    processingStatus: (row.processing_status as AtlasDocumentProcessingStatus) ?? 'uploaded',
    metadata,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

export type ListAtlasDocumentsOptions = {
  companyId?: string | null;
  source?: string;
  processingStatus?: AtlasDocumentProcessingStatus;
};

export async function listAtlasDocuments(opts?: ListAtlasDocumentsOptions): Promise<AtlasDocument[]> {
  if (!isAtlasSupabaseDataEnabled()) return readDocumentsFromLocalStorage();

  const auth = await requireSupabaseUser();
  if (!auth.ok) return [];

  let query = supabase.from('atlas_documents').select(DOCUMENT_SELECT).order('created_at', { ascending: false });

  if (opts?.companyId) {
    const owned = await requireOwnedCompany(opts.companyId);
    if (!owned.ok) return [];
    query = query.eq('company_id', opts.companyId);
  }
  if (opts?.source) query = query.eq('source', opts.source);
  if (opts?.processingStatus) query = query.eq('processing_status', opts.processingStatus);

  const { data, error } = await query;

  if (error) {
    logAtlasServerEvent('atlas_documents', 'error', 'list_failed', { message: error.message });
    return [];
  }

  return (data ?? []).map((row) => rowToDocument(row as AtlasDocumentRow));
}

/** OCR uploads for the active company (source=ocr). */
export async function listAtlasOcrDocuments(companyId: string): Promise<AtlasDocument[]> {
  return listAtlasDocuments({ companyId, source: 'ocr' });
}

export async function upsertAtlasDocument(doc: AtlasDocument): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    const existing = readDocumentsFromLocalStorage();
    const next = existing.some((d) => d.id === doc.id)
      ? existing.map((d) => (d.id === doc.id ? doc : d))
      : [...existing, doc];
    writeDocumentsToLocalStorage(next);
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const owned = await requireOwnedDocument(String(doc.id));
  if (!owned.ok) return { ok: false, error: owned.error };

  const { error } = await supabase.from('atlas_documents').update({
    company_id: doc.companyId ?? null,
    type: doc.type ?? 'generic',
    title: doc.title,
    content: doc.content ?? null,
    kind: doc.kind,
    source: doc.source,
    status: doc.status,
    metadata: doc.metadata ?? {},
    updated_at: new Date().toISOString(),
  }).eq('id', doc.id).eq('user_id', auth.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateAtlasDocumentProcessingStatus(
  documentId: string,
  processingStatus: AtlasDocumentProcessingStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) return { ok: true };

  const owned = await requireOwnedDocument(documentId);
  if (!owned.ok) return owned;

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const { error } = await supabase
    .from('atlas_documents')
    .update({ processing_status: processingStatus, updated_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('user_id', auth.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveAtlasDocumentOcrResult(
  documentId: string,
  input: {
    extraction?: AtlasOcrExtraction;
    invoices?: AtlasOcrDetectedInvoice[];
    extractedText?: string;
    processingStatus: 'processed' | 'failed';
    ocrError?: AtlasOcrError;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) return { ok: true };

  const owned = await requireOwnedDocument(documentId);
  if (!owned.ok) return owned;

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const invoices =
    input.invoices ??
    buildDetectedInvoicesFromExtraction(input.extraction ?? null);
  const extraction = input.extraction ?? summaryExtractionFromInvoices(invoices);
  const ocrMeta: Record<string, unknown> = { ...extraction, invoices };
  if (input.ocrError) {
    ocrMeta.error = input.ocrError;
  }

  const extractedText =
    input.extractedText ??
    (input.processingStatus === 'processed'
      ? JSON.stringify(extraction, null, 2)
      : input.ocrError?.message ?? JSON.stringify(ocrMeta, null, 2));

  const { error } = await supabase
    .from('atlas_documents')
    .update({
      processing_status: input.processingStatus,
      extracted_text: extractedText,
      content: extraction,
      metadata: { ocr: ocrMeta },
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('user_id', auth.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAtlasDocument(
  documentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    writeDocumentsToLocalStorage(readDocumentsFromLocalStorage().filter((d) => d.id !== documentId));
    return { ok: true };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const owned = await requireOwnedDocument(documentId);
  if (!owned.ok) return owned;

  const { data: row } = await supabase
    .from('atlas_documents')
    .select('storage_path')
    .eq('id', documentId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  const { error } = await supabase.from('atlas_documents').delete().eq('id', documentId).eq('user_id', auth.userId);
  if (error) return { ok: false, error: error.message };

  const storagePath = (row as { storage_path?: string } | null)?.storage_path;
  if (storagePath) {
    await supabase.storage.from(ATLAS_DOCUMENTS_BUCKET).remove([storagePath]);
  }

  return { ok: true };
}

export async function getAtlasDocumentSignedUrl(
  storagePath: string,
  expiresInSec = 3600,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) return { ok: false, error: 'not_enabled' };

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  if (!storagePath.startsWith(`${auth.userId}/`)) {
    return { ok: false, error: 'document_not_found_or_forbidden' };
  }

  const { data, error } = await supabase.storage
    .from(ATLAS_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSec);

  if (error || !data?.signedUrl) return { ok: false, error: error?.message ?? 'signed_url_failed' };
  return { ok: true, url: data.signedUrl };
}

export function atlasDocumentErrorMessage(code: string): string {
  switch (code) {
    case 'auth_required':
      return 'Session expirée. Reconnectez-vous.';
    case 'server_error':
      return 'Erreur serveur. Réessayez dans quelques instants.';
    case 'company_required':
      return 'Sélectionnez une société active avant d’importer un document.';
    case 'company_not_found_or_forbidden':
      return 'Société active introuvable ou non autorisée.';
    case 'document_not_found_or_forbidden':
      return 'Document introuvable ou non autorisé.';
    case 'file_required':
      return 'Fichier requis.';
    case 'file_too_large':
      return 'Fichier trop volumineux (PDF max 50 Mo, images max 20 Mo).';
    case 'storage_permission_denied':
      return 'Autorisation stockage refusée. Reconnectez-vous ou contactez le support.';
    case 'upload_timeout':
      return 'Délai dépassé pendant le téléversement. Réessayez avec une connexion stable.';
    case 'use_direct_storage':
      return 'Ce mode de téléversement n’est plus utilisé. Rechargez la page.';
    case 'ocr_background':
    case 'ocr_enqueued':
      return 'OCR en arrière-plan — vous pouvez quitter cette page.';
    case 'image_compress_failed':
      return 'Compression automatique impossible. Réessayez avec une autre image.';
    case 'storage_upload_failed':
      return 'Échec du téléversement vers le stockage. Réessayez ou reconnectez-vous.';
    case 'storage_object_missing':
      return 'Fichier introuvable dans le stockage après téléversement. Réessayez.';
    case 'storage_duplicate':
      return 'Ce fichier existe déjà. Renommez-le ou réessayez.';
    case 'db_insert_failed':
      return 'Impossible d’enregistrer le document en base. Contactez le support si le problème persiste.';
    case 'invalid_json':
      return 'Requête invalide. Rechargez la page et réessayez.';
    case 'mime_not_allowed':
      return 'Type de fichier non autorisé (images ou PDF uniquement).';
    case 'upload_failed':
      return 'Échec du téléversement. Réessayez.';
    case 'ocr_failed':
      return 'Échec de l’analyse OCR. Le fichier a été enregistré.';
    case 'form_parse_failed':
      return 'Corps de requête invalide (fichier trop volumineux ou tronqué).';
    default:
      return code || 'Une erreur est survenue. Réessayez.';
  }
}

// ---------------------------------------------------------------------------
// Legacy API names
// ---------------------------------------------------------------------------

export async function getDocuments(opts?: ListAtlasDocumentsOptions): Promise<AtlasDocument[]> {
  return listAtlasDocuments(opts);
}

export async function createDocument(input: {
  type: string;
  title: string;
  content: unknown;
  companyId?: string | null;
  metadata?: Record<string, unknown>;
  source?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const doc: AtlasDocument = {
    id: crypto.randomUUID(),
    companyId: input.companyId ?? null,
    type: input.type,
    title: input.title,
    content: input.content,
    kind: 'library',
    source: input.source ?? 'generated',
    status: 'active',
    processingStatus: 'processed',
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };

  if (!isAtlasSupabaseDataEnabled()) {
    const res = await upsertAtlasDocument(doc);
    if (!res.ok) return res;
    return { ok: true, id: doc.id };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  if (input.companyId) {
    const owned = await requireOwnedCompany(input.companyId);
    if (!owned.ok) return { ok: false, error: owned.error };
  }

  const { data, error } = await supabase
    .from('atlas_documents')
    .insert({
      id: doc.id,
      user_id: auth.userId,
      company_id: input.companyId ?? null,
      type: input.type,
      title: input.title,
      content: input.content ?? null,
      kind: 'library',
      source: input.source ?? 'generated',
      status: 'active',
      processing_status: 'processed',
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single();

  if (error || !data?.id) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, id: String(data.id) };
}

export async function searchDocuments(q: string, opts?: { type?: string; companyId?: string }): Promise<AtlasDocument[]> {
  const all = await listAtlasDocuments({ companyId: opts?.companyId });
  const needle = (q ?? '').trim().toLowerCase();
  return all.filter((d) => {
    if (opts?.type && d.type !== opts.type) return false;
    if (!needle) return true;
    const hay = `${d.title} ${d.type} ${d.filename ?? ''} ${d.extractedText ?? ''}`.toLowerCase();
    return hay.includes(needle);
  });
}

export function ocrExtractionFromDocument(doc: AtlasDocument): AtlasOcrExtraction | null {
  const invoices = ocrInvoicesFromDocument(doc);
  if (invoices.length) {
    const summary = summaryExtractionFromInvoices(invoices);
    if (Object.values(summary).some((v) => v != null && v !== '')) return summary;
  }
  const fromMeta = pickOcrFields(doc.metadata?.ocr);
  if (fromMeta) return fromMeta;
  if (doc.content && typeof doc.content === 'object') return pickOcrFields(doc.content);
  return null;
}

function parseOcrInvoicesArray(raw: unknown): AtlasOcrDetectedInvoice[] {
  if (!Array.isArray(raw)) return [];
  const parsed: AtlasOcrDetectedInvoice[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const pageNumber = rec.page_number;
    const status = rec.status;
    if (typeof pageNumber !== 'number') continue;
    if (status !== 'detected' && status !== 'needs_review' && status !== 'no_invoice_detected') continue;
    parsed.push({
      page_number: pageNumber,
      source_pages: Array.isArray(rec.source_pages)
        ? rec.source_pages.filter((p): p is number => typeof p === 'number')
        : [pageNumber],
      invoice_number: typeof rec.invoice_number === 'string' ? rec.invoice_number : undefined,
      supplier_name: typeof rec.supplier_name === 'string' ? rec.supplier_name : undefined,
      invoice_date: typeof rec.invoice_date === 'string' ? rec.invoice_date : undefined,
      amount_ht: typeof rec.amount_ht === 'number' ? rec.amount_ht : undefined,
      vat_amount: typeof rec.vat_amount === 'number' ? rec.vat_amount : undefined,
      amount_ttc: typeof rec.amount_ttc === 'number' ? rec.amount_ttc : undefined,
      vat_rate: typeof rec.vat_rate === 'number' ? rec.vat_rate : undefined,
      status,
      confidence: typeof rec.confidence === 'number' ? rec.confidence : undefined,
    });
  }
  return parsed;
}

export function ocrInvoicesFromDocument(doc: AtlasDocument): AtlasOcrDetectedInvoice[] {
  const raw = doc.metadata?.ocr;
  if (raw && typeof raw === 'object') {
    const fromArray = parseOcrInvoicesArray((raw as Record<string, unknown>).invoices);
    if (fromArray.length) return fromArray;
  }
  const extraction = pickOcrFields(doc.metadata?.ocr) ?? (doc.content && typeof doc.content === 'object'
    ? pickOcrFields(doc.content)
    : null);
  return buildDetectedInvoicesFromExtraction(extraction);
}

export function ocrCreatableInvoiceCountFromDocument(doc: AtlasDocument): number {
  return creatableOcrInvoices(ocrInvoicesFromDocument(doc)).length;
}

function pickOcrFields(raw: unknown): AtlasOcrExtraction | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const fields: AtlasOcrExtraction = {
    numero_facture: rec.numero_facture as string | undefined,
    date: rec.date as string | undefined,
    fournisseur: rec.fournisseur as string | undefined,
    montant_ht: rec.montant_ht as number | undefined,
    taux_tva: rec.taux_tva as number | undefined,
    montant_tva: rec.montant_tva as number | undefined,
    montant_ttc: rec.montant_ttc as number | undefined,
    description: rec.description as string | undefined,
  };
  const hasData = Object.values(fields).some((v) => v != null && v !== '');
  return hasData ? fields : null;
}

export function ocrProcessedPageCountFromDocument(doc: AtlasDocument): number | null {
  const raw = doc.metadata?.ocr;
  if (!raw || typeof raw !== 'object') return null;
  const count = (raw as Record<string, unknown>).processed_page_count;
  return typeof count === 'number' && count > 0 ? count : null;
}

export type AtlasDocumentOcrProgress = {
  processingStatus: AtlasDocumentProcessingStatus;
  progressPhase?: 'rendering' | 'analyzing';
  progressPage?: number;
  progressTotal?: number;
};

/** Poll OCR progress while server processes PDF pages. */
export async function getAtlasDocumentOcrProgress(
  documentId: string,
): Promise<AtlasDocumentOcrProgress | null> {
  if (!isAtlasSupabaseDataEnabled()) return null;

  const auth = await requireSupabaseUser();
  if (!auth.ok) return null;

  const owned = await requireOwnedDocument(documentId);
  if (!owned.ok) return null;

  const { data, error } = await supabase
    .from('atlas_documents')
    .select('processing_status, metadata')
    .eq('id', documentId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error || !data) return null;

  const ocr = asRecord(data.metadata)?.ocr;
  const ocrRec = ocr && typeof ocr === 'object' ? (ocr as Record<string, unknown>) : {};

  return {
    processingStatus: (data.processing_status as AtlasDocumentProcessingStatus) ?? 'uploaded',
    progressPhase:
      ocrRec.progress_phase === 'rendering' || ocrRec.progress_phase === 'analyzing'
        ? ocrRec.progress_phase
        : undefined,
    progressPage: typeof ocrRec.progress_page === 'number' ? ocrRec.progress_page : undefined,
    progressTotal: typeof ocrRec.progress_total === 'number' ? ocrRec.progress_total : undefined,
  };
}

export function ocrFailureFromDocument(doc: AtlasDocument): AtlasOcrError | null {
  const raw = doc.metadata?.ocr;
  if (!raw || typeof raw !== 'object') return null;
  const err = (raw as Record<string, unknown>).error;
  if (!err || typeof err !== 'object') return null;
  const rec = err as Record<string, unknown>;
  if (typeof rec.step !== 'string' || typeof rec.message !== 'string' || typeof rec.code !== 'string') {
    return null;
  }
  return { step: rec.step, message: rec.message, code: rec.code };
}

export function ocrUiStatus(doc: AtlasDocument): 'analysé' | 'en cours' | 'erreur' {
  switch (doc.processingStatus) {
    case 'processed':
      return 'analysé';
    case 'processing':
    case 'uploading':
    case 'uploaded':
      return 'en cours';
    case 'failed':
    default:
      return 'erreur';
  }
}
