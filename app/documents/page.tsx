'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileText, CheckCircle, Clock, Trash2, Sparkles, ShieldCheck, Archive, History, Eye, Download, Share2, Wrench, Mail, Link2, FileJson, FileSpreadsheet, FileCode2, Package, CloudUpload, Loader2 as DriveLoader } from 'lucide-react';
import { EntityActionMenu, ConfirmDeleteDialog, EntityHistoryDrawer } from '@/app/components/actions';
import type { ActionItem } from '@/app/components/actions';
import { RowShareActionBar, DriveSyncBadge, type DriveSyncState } from '@/app/components/share';
import { downloadAuthenticatedExport, type ExportFormat } from '@/app/lib/atlas-export-engine';
import { SendEmailModal } from '@/app/documents/components/SendEmailModal';
import { ValidationCenter } from '@/app/documents/components/ValidationCenter';
import {
  classificationFromDocument,
  documentTypeFromDocument,
  validationStatusFromDocument,
} from '@/app/lib/atlas-documents-repository';
import { documentTypeLabel } from '@/app/lib/atlas-document-routing';
import { DocumentExplainerButton } from '@/app/components/assistant/DocumentExplainerButton';
import { ExportMenu } from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';

const DOCUMENT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'filename', label: 'Nom fichier' },
  { key: 'document_type', label: 'Type' },
  { key: 'processing_status', label: 'Statut OCR' },
  { key: 'validation_status', label: 'Statut validation' },
  { key: 'page_count', label: 'Pages', format: v => String(v ?? '') },
  { key: 'size_bytes', label: 'Taille (Ko)', format: v => v != null ? (Math.round((v as number) / 1024)).toString() : '' },
  { key: 'id', label: 'ID document' },
  { key: 'created_at', label: 'Uploadé le', format: v => v ? new Date(v as string).toLocaleDateString('fr-FR') : '' },
];
import { useRouter } from 'next/navigation';
import { fetchAi } from '../lib/fetch-ai';
import { addDaysYmd, todayYmd } from '@/app/lib/atlas-dates';
import {
  atlasSupplierInvoiceErrorMessage,
  createSupplierInvoicesFromOcr,
  listSupplierInvoicesWithMeta,
  readSupplierInvoicesFromLocalStorage,
  supplierInvoiceKeysFromList,
  writeSupplierInvoicesToLocalStorage,
} from '@/app/lib/atlas-supplier-invoices-repository';
import type { AtlasSupplierInvoice } from '@/app/types/atlas-supplier-invoice';
import { normalizePaymentTerms } from '@/app/types/atlas-payment-terms';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import type { AtlasDocument, AtlasOcrDetectedInvoice, AtlasOcrError, AtlasOcrExtraction, AtlasDocumentType } from '@/app/types/atlas-document';
import { isBankStatementType } from '@/app/lib/atlas-document-type-utils';
import {
  creatableOcrInvoices,
  sourcePageForDetectedInvoice,
  supplierInvoiceDedupeKey,
} from '@/app/lib/atlas-ocr-invoices-detect';
import {
  atlasDocumentErrorMessage,
  deleteAtlasDocument,
  getDocuments,
  listAtlasOcrDocuments,
  ocrExtractionFromDocument,
  ocrInvoicesFromDocument,
  formatDocumentSizeBytes,
  hasMeaningfulExtractedText,
  ocrDebugFromDocument,
  ocrFailureFromDocument,
  ocrPageProgressFromDocument,
  ocrProcessedPageCountFromDocument,
  ocrTextPreviewFromDocument,
  ocrUiStatus,
  saveAtlasDocumentOcrResult,
  searchDocuments,
  bankTransactionsFromDocument,
  structuredExtractionFromDocument,
} from '@/app/lib/atlas-documents-repository';
import { createAtlasLink } from '@/app/lib/atlas-links-repository';
import { listAtlasCompanies } from '@/app/lib/atlas-companies-repository';
import { listAtlasInvoices } from '@/app/lib/atlas-invoices-repository';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import {
  ATLAS_DOCUMENT_MAX_FILES_PER_BATCH,
  documentUploadLimitExceededMessage,
  inferDocumentMimeType,
  isAllowedDocumentMime,
  maxUploadBytesForMime,
} from '@/app/lib/atlas-document-storage';
import { uploadDocumentForOcr } from '@/app/lib/atlas-document-upload-client';
import { frenchMessageForUploadHttpStatus, sanitizeUploadUserMessage } from '@/app/lib/atlas-upload-http-errors';
import {
  formatOcrDevDiagnostics,
  formatOcrUiMessage,
  isPdfMimeType,
  ocrErrorFromAiBody,
  OCR_PROVIDER,
  parseOcrJsonResponse,
  parseOcrClientPayload,
  type OcrAiErrorBody,
} from '@/app/lib/atlas-ocr';
import { looksLikeRawJsonText } from '@/app/lib/atlas-ai-json-parse';
import type { NormalizedOcrPayload } from '@/app/lib/atlas-ocr-normalize';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { EmptyStateCta } from '@/app/components/ui/EmptyStateCta';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';

type LocalOcrDocument = {
  id: number;
  nom: string;
  statut: 'analysé' | 'en cours' | 'erreur';
  date: string;
  numero_facture?: string;
  fournisseur?: string;
  montant_ht?: number;
  montant_tva?: number;
  montant_ttc?: number;
  taux_tva?: number;
};

type OcrDisplayRow = {
  key: string;
  nom: string;
  statut: 'analysé' | 'en cours' | 'erreur';
  detectedType?: AtlasDocumentType | null;
  numero_facture?: string;
  fournisseur?: string;
  montant_ht?: number;
  montant_tva?: number;
  montant_ttc?: number;
  bank_name?: string;
  statement_period?: string;
  transaction_count?: number;
  closing_balance?: number;
  fileSizeLabel?: string;
  pageProgressLabel?: string;
  errorDetail?: string;
  textPreview?: string;
  localDoc?: LocalOcrDocument;
  supabaseId?: string;
  detectedInvoices?: AtlasOcrDetectedInvoice[];
  creatableInvoiceCount?: number;
  supplierInvoicesCreatedCount?: number;
  hasAllSupplierInvoices?: boolean;
  debug?: {
    documentId: string;
    processingStatus: string;
    progressPhase?: string;
    errorCode?: string;
    extractedTextLength: number;
    updatedAt: string;
  };
};

/** Shows per-row debug info only when explicitly enabled via env var. Never in production. */
const SHOW_OCR_ROW_DEBUG =
  process.env.NEXT_PUBLIC_ATLAS_OCR_DEBUG === 'true' && process.env.NODE_ENV !== 'production';

type UploadErrorBody = {
  error?: string;
  step?: string;
  message?: string;
  code?: string;
  userIdPresent?: boolean;
  companyId?: string;
  mimeType?: string;
  fileSize?: number;
  document?: { id: string; mimeType?: string; sizeBytes?: number };
};

async function persistOcrFailure(
  documentId: string,
  ocrError: AtlasOcrError,
  extraction?: AtlasOcrExtraction,
): Promise<{ ok: boolean; error?: string }> {
  const res = await saveAtlasDocumentOcrResult(documentId, {
    extraction,
    processingStatus: 'failed',
    ocrError,
  });
  if (!res.ok && process.env.NODE_ENV === 'development') {
    console.debug('[documents/ocr] db_update_failed', { documentId, dbError: res.error, ocrError });
  }
  return { ok: res.ok, error: res.ok ? undefined : res.error };
}

function formatDocumentsUploadError(status: number, body: UploadErrorBody): string {
  const code = body.error ?? body.code ?? 'upload_failed';

  const sanitized = sanitizeUploadUserMessage(body.message);
  if (sanitized) return sanitized;

  const fromHttp = frenchMessageForUploadHttpStatus(status, code, body.step);
  if (fromHttp) return fromHttp;

  if (code === 'storage_permission_denied' || code === 'storage_upload_failed') {
    return atlasDocumentErrorMessage('storage_permission_denied');
  }

  const base = atlasDocumentErrorMessage(code);
  if (base && base !== code) return base;

  if (process.env.NODE_ENV === 'development') {
    const detail = [body.step, body.message, `code=${code}`, `http=${status}`].filter(Boolean).join(' · ');
    console.debug('[documents/upload]', { status, body });
    return detail || 'Échec du téléversement. Réessayez.';
  }

  return 'Échec du téléversement. Réessayez.';
}

type OcrProgressPhase =
  | 'idle'
  | 'storage'
  | 'registered'
  | 'uploading'
  | 'started'
  | 'rendering'
  | 'analyzing'
  | 'saving'
  | 'completed';

type OcrProgressState = {
  phase: OcrProgressPhase;
  page?: number;
  totalPages?: number;
  isPdf?: boolean;
  documentId?: string;
};

function ocrProgressLabel(progress: OcrProgressState): string {
  switch (progress.phase) {
    case 'storage':
    case 'uploading':
      return 'Téléversement vers le stockage…';
    case 'registered':
      return 'Enregistrement du document…';
    case 'started':
      return progress.totalPages
        ? `Démarrage OCR (${progress.totalPages} page${progress.totalPages > 1 ? 's' : ''})…`
        : 'Analyse en cours…';
    case 'rendering':
      return progress.page && progress.totalPages
        ? `Page ${progress.page}/${progress.totalPages}…`
        : 'Analyse en cours…';
    case 'analyzing':
      if (progress.page && progress.totalPages) {
        return `Page ${progress.page}/${progress.totalPages}…`;
      }
      return 'Analyse en cours…';
    case 'saving':
      return 'Fichier enregistré…';
    case 'completed':
      return 'OCR terminé';
    default:
      return '';
  }
}

function validateOcrUploadFile(file: File): string | null {
  const mime = inferDocumentMimeType(file);
  if (!mime || !isAllowedDocumentMime(mime)) {
    return 'Type de fichier non autorisé (images ou PDF uniquement).';
  }
  if (file.size > maxUploadBytesForMime(mime)) {
    return documentUploadLimitExceededMessage(mime);
  }
  return null;
}

const SUPPLIER_INVOICES_MIGRATION_FILES = [
  'supabase/migrations/ensure_atlas_supplier_invoices_baseline.sql',
  'supabase/migrations/20260528160000_atlas_supplier_invoices_sprint_e.sql',
  'supabase/migrations/20260528170000_atlas_supplier_invoices_multi_invoice.sql',
] as const;

const OCR_PROGRESS_POLL_MS = 2500;

type OcrProgressApiBody = {
  ok?: boolean;
  processingStatus?: string;
  progressPhase?: 'started' | 'rendering' | 'analyzing' | 'completed' | 'failed';
  progressPage?: number;
  progressTotal?: number;
  progressPercent?: number;
  pageCount?: number;
  errorMessage?: string;
  code?: string;
};

function isAuthLockErrorMessage(message: string): boolean {
  return /auth-token|stole it|lock:sb-/i.test(message);
}

async function fetchOcrProgressFromApi(
  documentId: string,
  signal: AbortSignal,
): Promise<OcrProgressApiBody | null> {
  try {
    const res = await fetch(`/api/documents/${documentId}/ocr/progress`, {
      credentials: 'include',
      signal,
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as OcrProgressApiBody | null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    const message = err instanceof Error ? err.message : '';
    if (isAuthLockErrorMessage(message)) return null;
    return null;
  }
}

export default function DocumentsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const ocrPollRef = useRef<number | null>(null);
  const ocrPollAbortRef = useRef<AbortController | null>(null);
  const ocrPollInFlightRef = useRef(false);
  const ocrPollingIdsRef = useRef<Set<string>>(new Set());
  const ocrRetriggeredRef = useRef<Set<string>>(new Set());
  const [retryingOcrId, setRetryingOcrId] = useState<string | null>(null);
  const [validationDocId, setValidationDocId] = useState<string | null>(null);
  const uploadQueueRef = useRef(0);
  const [localDocuments, setLocalDocuments] = useState<LocalOcrDocument[]>([]);
  const [ocrDocuments, setOcrDocuments] = useState<AtlasDocument[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState('');
  const [ocrPageInfo, setOcrPageInfo] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [supplierInvoiceKeys, setSupplierInvoiceKeys] = useState<Set<string>>(new Set());
  const [creatingSupplierInvoiceId, setCreatingSupplierInvoiceId] = useState<string | null>(null);
  const [supplierTableMissing, setSupplierTableMissing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgressState>({ phase: 'idle' });
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [tab, setTab] = useState<'ocr' | 'library'>('ocr');
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<OcrDisplayRow | null>(null);
  const [historyDocId, setHistoryDocId] = useState<string | null>(null);
  const [emailModalDocId, setEmailModalDocId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [driveBackingUpId, setDriveBackingUpId] = useState<string | null>(null);
  const [driveSyncByDocId, setDriveSyncByDocId] = useState<Record<string, DriveSyncState>>({});

  // Library state
  const [library, setLibrary] = useState<AtlasDocument[]>([]);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryType, setLibraryType] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [linkCompanyId, setLinkCompanyId] = useState<string>('');
  const [linkInvoiceId, setLinkInvoiceId] = useState<string>('');
  const [linkStatus, setLinkStatus] = useState<string>('');
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [invoices, setInvoices] = useState<{ id: string; title: string }[]>([]);

  const supabaseMode = isAtlasSupabaseDataEnabled();

  const stopOcrPoll = useCallback(() => {
    if (ocrPollRef.current) {
      clearInterval(ocrPollRef.current);
      ocrPollRef.current = null;
    }
    ocrPollAbortRef.current?.abort();
    ocrPollAbortRef.current = null;
    ocrPollInFlightRef.current = false;
  }, []);

  useEffect(() => () => stopOcrPoll(), [stopOcrPoll]);

  const refreshOcr = useCallback(async () => {
    setOcrError('');
    if (!isAtlasSupabaseDataEnabled()) return;
    setOcrLoading(true);
    try {
      const companyId = await getActiveCompanyDbRowId();
      setActiveCompanyId(companyId);
      if (!companyId) {
        setOcrDocuments([]);
        setOcrError(atlasDocumentErrorMessage('company_required'));
        return;
      }
      const [list, supplierResult] = await Promise.all([
        listAtlasOcrDocuments(companyId),
        listSupplierInvoicesWithMeta(companyId),
      ]);
      setOcrDocuments(list);
      setSupplierTableMissing(supplierResult.tableMissing);
      setSupplierInvoiceKeys(supplierInvoiceKeysFromList(supplierResult.invoices));
    } finally {
      setOcrLoading(false);
    }
  }, []);

  const enqueueOcrProgressPoll = useCallback(
    (documentId: string) => {
      ocrPollingIdsRef.current.add(documentId);
      if (ocrPollRef.current) return;

      const tick = async () => {
        if (ocrPollInFlightRef.current) return;
        const ids = Array.from(ocrPollingIdsRef.current);
        if (ids.length === 0) {
          stopOcrPoll();
          return;
        }

        ocrPollInFlightRef.current = true;
        ocrPollAbortRef.current?.abort();
        const controller = new AbortController();
        ocrPollAbortRef.current = controller;

        try {
          let needsRefresh = false;
          for (const id of ids) {
            const live = await fetchOcrProgressFromApi(id, controller.signal);
            if (!live?.ok) continue;

            if (live.processingStatus === 'processed') {
              ocrPollingIdsRef.current.delete(id);
              needsRefresh = true;
              setOcrProgress({
                phase: 'completed',
                documentId: id,
                isPdf: true,
                page: live.progressPage,
                totalPages: live.progressTotal,
              });
              setOcrPageInfo('OCR terminé');
              window.setTimeout(() => {
                setOcrProgress((prev) => (prev.documentId === id ? { phase: 'idle' } : prev));
              }, 4000);
              continue;
            }

            if (live.processingStatus === 'failed') {
              ocrPollingIdsRef.current.delete(id);
              needsRefresh = true;
              setOcrError(live.errorMessage ?? formatOcrUiMessage('ocr_failed'));
              setOcrProgress({ phase: 'idle' });
              continue;
            }

            if (live.progressPhase && live.progressPhase !== 'completed' && live.progressPhase !== 'failed') {
              const uiPhase: OcrProgressPhase =
                live.progressPhase === 'started'
                  ? 'started'
                  : live.progressPhase === 'rendering'
                    ? 'rendering'
                    : 'analyzing';
              setOcrProgress({
                documentId: id,
                phase: uiPhase,
                page: live.progressPage,
                totalPages: live.progressTotal ?? live.pageCount,
                isPdf: true,
              });
            }
          }

          if (ocrPollingIdsRef.current.size > 0) needsRefresh = true;

          if (needsRefresh) await refreshOcr();
          if (ocrPollingIdsRef.current.size === 0) stopOcrPoll();
        } finally {
          ocrPollInFlightRef.current = false;
        }
      };

      void tick();
      ocrPollRef.current = window.setInterval(() => void tick(), OCR_PROGRESS_POLL_MS);
    },
    [stopOcrPoll, refreshOcr, ocrDocuments],
  );

  const refreshLibrary = async () => {
    const companyId = isAtlasSupabaseDataEnabled() ? await getActiveCompanyDbRowId() : undefined;
    const [docs, cs, invs] = await Promise.all([
      getDocuments(companyId ? { companyId } : undefined),
      listAtlasCompanies(),
      listAtlasInvoices(),
    ]);
    setLibrary(docs);
    setCompanies(cs.map((c) => ({ id: String(c.dbRowId ?? c.id), name: c.raisonSociale })));
    setInvoices(invs.map((i) => ({ id: String(i.id), title: `${i.number} · ${i.clientName}` })));
    if (!selectedId && docs[0]?.id) setSelectedId(String(docs[0].id));
  };

  useEffect(() => {
    if (tab !== 'ocr') return;
    if (supabaseMode) void refreshOcr();
  }, [tab, refreshOcr, supabaseMode]);

  useEffect(() => {
    if (!supabaseMode || tab !== 'ocr') return;
    for (const doc of ocrDocuments) {
      if (doc.processingStatus !== 'processing' && doc.processingStatus !== 'uploading') continue;
      enqueueOcrProgressPoll(String(doc.id));
    }
  }, [ocrDocuments, supabaseMode, tab, enqueueOcrProgressPoll]);

  useEffect(() => {
    if (!supabaseMode) return;
    void fetch('/api/backups?limit=100&provider=google_drive', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { backups?: Array<{ entity_type?: string; entity_id?: string; sync_status?: string }> }) => {
        const map: Record<string, DriveSyncState> = {};
        for (const b of data.backups ?? []) {
          if (b.entity_type !== 'document' || !b.entity_id) continue;
          const id = String(b.entity_id);
          if (b.sync_status === 'completed') map[id] = 'synced';
          else if (b.sync_status === 'failed') map[id] = 'local_fallback';
        }
        setDriveSyncByDocId((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {});
  }, [supabaseMode, ocrDocuments.length]);

  useEffect(() => {
    if (tab !== 'library') return;
    void refreshLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== 'library') return;
    const t = window.setTimeout(async () => {
      const companyId = supabaseMode ? await getActiveCompanyDbRowId() : undefined;
      const docs = await searchDocuments(libraryQuery, {
        type: libraryType || undefined,
        companyId: companyId ?? undefined,
      });
      setLibrary(docs);
    }, 150);
    return () => window.clearTimeout(t);
  }, [libraryQuery, libraryType, tab, supabaseMode]);

  useEffect(() => {
    if (tab !== 'library') return;
    if (selectedId && !library.some((d) => String(d.id) === selectedId)) {
      setSelectedId(library[0]?.id ?? '');
    }
  }, [library, selectedId, tab]);

  const selectedDoc = useMemo(() => library.find((d) => String(d.id) === String(selectedId)) ?? null, [library, selectedId]);
  const distinctTypes = useMemo(() => {
    const s = new Set<string>();
    for (const d of library) s.add(d.type);
    return Array.from(s).sort();
  }, [library]);

  const ocrRows = useMemo<OcrDisplayRow[]>(() => {
    if (supabaseMode) {
      return ocrDocuments.map((doc) => {
        const extraction = ocrExtractionFromDocument(doc);
        const allInvoices = ocrInvoicesFromDocument(doc);
        const creatable = creatableOcrInvoices(allInvoices);
        const docId = String(doc.id);
        const createdCount = creatable.filter((inv) =>
          supplierInvoiceKeys.has(
            supplierInvoiceDedupeKey(docId, sourcePageForDetectedInvoice(inv), inv.invoice_number),
          ),
        ).length;

        const prog = ocrPageProgressFromDocument(doc);
        const pageLabel =
          prog.page != null && prog.total
            ? `Page ${prog.page}/${prog.total}${prog.percent != null ? ` (${prog.percent}%)` : ''}`
            : prog.total
              ? `${prog.total} page${prog.total > 1 ? 's' : ''}`
              : undefined;
        const fail = ocrFailureFromDocument(doc);
        const detectedType = documentTypeFromDocument(doc);
        const structured = structuredExtractionFromDocument(doc);
        const bankTx = isBankStatementType(detectedType) ? bankTransactionsFromDocument(doc) : [];
        const fieldStr = (key: string) => {
          const f = structured?.[key as keyof typeof structured];
          if (!f || typeof f !== 'object' || Array.isArray(f)) return undefined;
          const field = f as { value?: unknown; user_corrected_value?: unknown };
          const raw = field.user_corrected_value != null ? field.user_corrected_value : field.value;
          return raw != null ? String(raw) : undefined;
        };
        const fieldNum = (key: string) => {
          const s = fieldStr(key);
          if (!s) return undefined;
          const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
          return Number.isFinite(n) ? n : undefined;
        };

        return {
          key: docId,
          nom: doc.filename ?? doc.title,
          statut: ocrUiStatus(doc),
          detectedType,
          numero_facture: extraction?.numero_facture,
          fournisseur: extraction?.fournisseur,
          montant_ht: extraction?.montant_ht,
          montant_tva: extraction?.montant_tva,
          montant_ttc: extraction?.montant_ttc,
          bank_name: fieldStr('bank_name'),
          statement_period: fieldStr('statement_period'),
          transaction_count: bankTx.length || undefined,
          closing_balance: fieldNum('closing_balance'),
          fileSizeLabel: formatDocumentSizeBytes(doc.sizeBytes),
          pageProgressLabel: doc.processingStatus === 'processing' ? pageLabel : undefined,
          errorDetail: fail?.message,
          textPreview:
            doc.processingStatus === 'processed' || hasMeaningfulExtractedText(doc)
              ? ocrTextPreviewFromDocument(doc)
              : undefined,
          debug: SHOW_OCR_ROW_DEBUG ? ocrDebugFromDocument(doc) : undefined,
          supabaseId: docId,
          detectedInvoices: allInvoices,
          creatableInvoiceCount: creatable.length,
          supplierInvoicesCreatedCount: createdCount,
          hasAllSupplierInvoices: creatable.length > 0 && createdCount >= creatable.length,
        };
      });
    }
    return localDocuments.map((d) => ({
      key: String(d.id),
      nom: d.nom,
      statut: d.statut,
      numero_facture: d.numero_facture,
      fournisseur: d.fournisseur,
      montant_ht: d.montant_ht,
      montant_tva: d.montant_tva,
      montant_ttc: d.montant_ttc,
      localDoc: d,
    }));
  }, [supabaseMode, ocrDocuments, localDocuments, supplierInvoiceKeys]);

  const ocrTableMode = useMemo<'invoice' | 'bank' | 'mixed'>(() => {
    const types = ocrRows
      .map((r) => r.detectedType)
      .filter((t): t is AtlasDocumentType => Boolean(t));
    const hasBank = types.some((t) => isBankStatementType(t));
    const hasInvoice = types.some((t) => !isBankStatementType(t));
    if (hasBank && hasInvoice) return 'mixed';
    if (hasBank) return 'bank';
    return 'invoice';
  }, [ocrRows]);

  const ocrPageSummary = useMemo(() => {
    if (ocrPageInfo) return ocrPageInfo;
    if (!supabaseMode) return '';
    const latestProcessed = ocrDocuments.find((d) => d.processingStatus === 'processed');
    if (!latestProcessed) return '';
    const count = creatableOcrInvoices(ocrInvoicesFromDocument(latestProcessed)).length;
    if (count > 1) return `${count} factures détectées`;
    const pages = ocrProcessedPageCountFromDocument(latestProcessed);
    if (pages && pages > 1) return `${pages} page(s) traitée(s) (PDF)`;
    return '';
  }, [supabaseMode, ocrPageInfo, ocrDocuments]);

  const createSupplierInvoice = (doc: LocalOcrDocument) => {
    if (supabaseMode) return;
    if (!doc.fournisseur || !doc.montant_ttc) return;
    const issueDate = doc.date || todayYmd();
    const paymentTerms = normalizePaymentTerms({ kind: 'preset', days: 60 });
    const dueDate = addDaysYmd(issueDate, paymentTerms.days);

    const next: AtlasSupplierInvoice = {
      id: Date.now(),
      supplierName: doc.fournisseur,
      invoiceNumber: doc.numero_facture,
      issueDate,
      amountHT: doc.montant_ht,
      vatAmount: doc.montant_tva,
      totalTTC: doc.montant_ttc,
      paymentTerms,
      dueDate,
      status: 'unpaid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const existing = readSupplierInvoicesFromLocalStorage();
    const updated = [...existing, next];
    writeSupplierInvoicesToLocalStorage(updated);
    router.push('/comptabilite');
  };

  const createSupplierInvoiceSupabase = async (documentId: string) => {
    setCreatingSupplierInvoiceId(documentId);
    setOcrError('');
    try {
      const res = await fetch(`/api/documents/${documentId}/validate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validated' }),
      });
      const body = await res.json().catch(() => ({})) as {
        ok?: boolean;
        error?: string;
        message?: string;
        invoicesCreated?: number;
        journalLineCount?: number;
      };
      if (!res.ok) {
        setOcrError(body.message ?? body.error ?? 'Validation impossible.');
        return;
      }
      await refreshOcr();
      await refreshLibrary();
      const created = body.invoicesCreated ?? 0;
      if (created >= 1) {
        setOcrPageInfo(`Validé — ${created} facture(s), ${body.journalLineCount ?? 0} écriture(s) journal.`);
        router.push('/comptabilite');
        return;
      }
      setOcrPageInfo('Document validé et enregistré.');
    } finally {
      setCreatingSupplierInvoiceId(null);
    }
  };

  const analyzeImageLocal = async (file: File) => {
    setAnalyzing(true);
    const newDoc: LocalOcrDocument = {
      id: Date.now(),
      nom: file.name,
      statut: 'en cours',
      date: new Date().toISOString().split('T')[0],
    };
    setLocalDocuments((prev) => [...prev, newDoc]);

    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(file);
      });

      const response = await fetchAi({ type: 'ocr', imageBase64: base64 });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLocalDocuments((prev) => prev.map((d) => (d.id === newDoc.id ? { ...d, statut: 'erreur' } : d)));
        return;
      }

      try {
        const parsed: NormalizedOcrPayload =
          data.parsed && typeof data.parsed === 'object'
            ? (data.parsed as NormalizedOcrPayload)
            : parseOcrClientPayload(String(data.response ?? ''));

        if (parsed.type === 'bank_statement') {
          setLocalDocuments((prev) =>
            prev.map((d) =>
              d.id === newDoc.id
                ? {
                    ...d,
                    statut: 'analysé',
                    fournisseur: parsed.bankName || 'Relevé bancaire',
                  }
                : d,
            ),
          );
        } else {
          setLocalDocuments((prev) =>
            prev.map((d) =>
              d.id === newDoc.id
                ? {
                    ...d,
                    statut: 'analysé',
                    numero_facture: parsed.numero_facture,
                    fournisseur: parsed.fournisseur,
                    montant_ht: parsed.montant_ht,
                    montant_tva: parsed.montant_tva,
                    montant_ttc: parsed.montant_ttc,
                    taux_tva: parsed.taux_tva,
                  }
                : d,
            ),
          );
        }
      } catch {
        setLocalDocuments((prev) => prev.map((d) => (d.id === newDoc.id ? { ...d, statut: 'erreur' } : d)));
      }
    } catch {
      setLocalDocuments((prev) => prev.map((d) => (d.id === newDoc.id ? { ...d, statut: 'erreur' } : d)));
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeImageSupabase = async (file: File) => {
    const validationError = validateOcrUploadFile(file);
    if (validationError) {
      setOcrError(validationError);
      return;
    }

    const mimeTypeGuess = inferDocumentMimeType(file);
    const isPdf = isPdfMimeType(mimeTypeGuess);
    uploadQueueRef.current += 1;
    setAnalyzing(true);
    setOcrError('');
    setOcrPageInfo('');
    setOcrProgress({ phase: 'storage', isPdf });
    try {
      const companyId = activeCompanyId ?? (await getActiveCompanyDbRowId());
      if (!companyId) {
        setOcrProgress({ phase: 'idle' });
        setOcrError(atlasDocumentErrorMessage('company_required'));
        return;
      }

      const uploadResult = await uploadDocumentForOcr(file, companyId, {
        onProgress: (p) => {
          if (p.phase === 'storage') {
            setOcrProgress({ phase: 'storage', isPdf });
          } else if (p.phase === 'registered') {
            setOcrProgress({ phase: 'registered', isPdf });
          } else if (p.phase === 'ocr') {
            setOcrProgress({ phase: 'analyzing', isPdf });
          }
        },
      });

      if (!uploadResult.ok) {
        setOcrProgress({ phase: 'idle' });
        setOcrError(formatDocumentsUploadError(uploadResult.status, uploadResult.body));
        return;
      }

      const documentId = uploadResult.data.documentId ?? uploadResult.data.document.id;
      const mimeType = uploadResult.data.document.mimeType ?? mimeTypeGuess;

      setOcrPageInfo(atlasDocumentErrorMessage('ocr_background'));
      ocrRetriggeredRef.current.add(documentId);
      setOcrProgress({ phase: 'analyzing', documentId, isPdf });
      enqueueOcrProgressPoll(documentId);
      void refreshOcr();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ocr_failed';
      const code = message === 'ocr_timeout' ? 'ocr_timeout' : 'ocr_failed';
      if (process.env.NODE_ENV === 'development') {
        console.debug('[documents/ocr] unexpected', err);
      }
      setOcrProgress({ phase: 'idle' });
      setOcrError(formatOcrUiMessage(code, message));
      await refreshOcr();
    } finally {
      uploadQueueRef.current -= 1;
      if (uploadQueueRef.current <= 0) {
        uploadQueueRef.current = 0;
        setAnalyzing(false);
      }
    }
  };

  const analyzeImage = async (file: File) => {
    if (supabaseMode) await analyzeImageSupabase(file);
    else await analyzeImageLocal(file);
  };

  const retryOcrRow = async (row: OcrDisplayRow) => {
    if (!row.supabaseId) return;
    setRetryingOcrId(row.supabaseId);
    setOcrError('');
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(row.supabaseId)}/ocr/run`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
        setOcrError(body.message ?? "Erreur lors du relancement de l'analyse.");
        return;
      }
      ocrRetriggeredRef.current.add(row.supabaseId);
      enqueueOcrProgressPoll(row.supabaseId);
      setOcrPageInfo('Analyse relancée…');
    } finally {
      setRetryingOcrId(null);
    }
  };

  const removeOcrRow = async (row: OcrDisplayRow) => {
    if (supabaseMode && row.supabaseId) {
      const res = await deleteAtlasDocument(row.supabaseId);
      if (!res.ok) {
        setOcrError(atlasDocumentErrorMessage(res.error));
        return;
      }
      await refreshOcr();
      return;
    }
    if (row.localDoc) {
      setLocalDocuments((prev) => prev.filter((d) => d.id !== row.localDoc!.id));
    }
  };

  const archiveDocument = async (row: OcrDisplayRow) => {
    if (!supabaseMode || !row.supabaseId) return;
    const res = await fetch(`/api/documents/${row.supabaseId}/archive`, {
      method: 'PATCH',
      credentials: 'include',
    });
    if (res.ok) {
      await refreshOcr();
    } else {
      setOcrError('Archivage échoué. Réessayez.');
    }
  };

  const downloadDocumentExport = (documentId: string, format: ExportFormat) => {
    downloadAuthenticatedExport(documentId, format);
  };

  const backupToGoogleDrive = async (documentId: string) => {
    setDriveBackingUpId(documentId);
    try {
      const res = await fetch(`/api/documents/${documentId}/backup-to-drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ format: 'pdf' }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string; driveUrl?: string };
      if (data.ok && data.driveUrl) {
        setShareToast('Sauvegardé sur Google Drive !');
        setTimeout(() => setShareToast(null), 4000);
      } else if (data.error === 'google_drive_not_connected') {
        setOcrError('Google Drive non connecté. Configurez-le dans le Centre de sauvegarde (/backup).');
      } else {
        setOcrError(data.message ?? data.error ?? 'Sauvegarde échouée.');
      }
    } catch {
      setOcrError('Erreur réseau lors de la sauvegarde Google Drive.');
    } finally {
      setDriveBackingUpId(null);
    }
  };

  const shareDocumentLink = async (documentId: string) => {
    try {
      const res = await fetch(`/api/documents/${documentId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ permissions: 'read_only', expiresInHours: 168 }),
      });
      if (!res.ok) { setOcrError('Partage échoué. Réessayez.'); return; }
      const data = await res.json() as { shareLink?: string };
      if (data.shareLink) {
        await navigator.clipboard.writeText(data.shareLink).catch(() => {});
        setShareToast('Lien copié ! Valable 7 jours.');
        setTimeout(() => setShareToast(null), 4000);
      }
    } catch {
      setOcrError('Erreur lors de la création du lien de partage.');
    }
  };

  const handleFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).slice(0, ATLAS_DOCUMENT_MAX_FILES_PER_BATCH);
    for (const file of files) {
      const mime = inferDocumentMimeType(file);
      if (!mime || (!mime.startsWith('image/') && !isPdfMimeType(mime))) continue;
      void analyzeImage(file);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module">
        <button
          type="button"
          onClick={() => setTab('ocr')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${tab === 'ocr' ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
        >
          <Upload size={16} /> OCR
        </button>
        <button
          type="button"
          onClick={() => setTab('library')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${tab === 'library' ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
        >
          <FileText size={16} /> Bibliothèque
        </button>
      </AppSidebar>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">
                Documents — {tab === 'ocr' ? 'OCR' : 'Bibliothèque'}
              </h1>
              <p className="text-xs text-gray-400">
                {tab === 'ocr' ? 'Analyse automatique de vos factures' : 'Liste, recherche, lecture et liens'}
              </p>
            </div>
          </div>
        </header>

        <div className="shrink-0 px-8 pt-3">
          <BetaSurfaceBadge label="Bêta · OCR & extraction IA" />
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {tab === 'library' && (
            <div className="grid grid-cols-12 gap-5">
              <div className="col-span-12 lg:col-span-5 space-y-3">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2">
                    <input
                      value={libraryQuery}
                      onChange={(e) => setLibraryQuery(e.target.value)}
                      placeholder="Rechercher un document…"
                      className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-300"
                    />
                    <select
                      value={libraryType}
                      onChange={(e) => setLibraryType(e.target.value)}
                      className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white"
                    >
                      <option value="">Tous types</option>
                      {distinctTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3 text-xs text-gray-400 flex items-center justify-between">
                    <span>{library.length} document(s)</span>
                    <div className="flex items-center gap-2">
                      <ExportMenu
                        data={library.map(d => ({
                          id: d.id ?? '',
                          filename: d.filename ?? d.title ?? '',
                          document_type: (() => { const t = documentTypeFromDocument(d); return t ? documentTypeLabel(t) : ''; })(),
                          processing_status: d.processingStatus ?? '',
                          validation_status: d.validationStatus ?? '',
                          page_count: ocrProcessedPageCountFromDocument(d) ?? null,
                          size_bytes: d.sizeBytes ?? null,
                          created_at: d.createdAt ?? '',
                        }))}
                        columns={DOCUMENT_EXPORT_COLUMNS}
                        filename="documents_ia"
                        title="Documents IA"
                        filters={{ type: libraryType, recherche: libraryQuery }}
                        size="xs"
                        align="right"
                      />
                      <button type="button" onClick={() => void refreshLibrary()} className="text-rose-600 hover:text-rose-700 font-medium">
                        Actualiser
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {library.map((d) => (
                      <button
                        key={String(d.id)}
                        type="button"
                        onClick={() => { setSelectedId(String(d.id)); setLinkStatus(''); }}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${String(d.id) === String(selectedId) ? 'bg-rose-50' : ''}`}
                      >
                        <p className="text-sm font-medium text-gray-800 truncate">{d.title}</p>
                        <p className="text-xs text-gray-400 truncate">{d.type} · {new Date(d.createdAt).toLocaleString('fr-FR')}</p>
                      </button>
                    ))}
                    {library.length === 0 && (
                      <div className="p-4">
                        <EmptyStateCta
                          lang="fr"
                          title="Aucun document"
                          description="Importez un PDF ou une image depuis l’onglet OCR pour alimenter votre bibliothèque."
                          primaryLabelFr="Ajouter maintenant"
                          primaryLabelAr="ابدأ الآن"
                          onPrimary={() => {
                            setTab('ocr');
                            fileRef.current?.click();
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-span-12 lg:col-span-7 space-y-3">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  {selectedDoc ? (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-lg font-bold text-gray-900 truncate">{selectedDoc.title}</p>
                          <p className="text-xs text-gray-400">{selectedDoc.type} · {new Date(selectedDoc.createdAt).toLocaleString('fr-FR')}</p>
                        </div>
                        {supabaseMode && (
                          <DocumentExplainerButton documentId={String(selectedDoc.id)} companyId={linkCompanyId || undefined} />
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <select value={linkCompanyId} onChange={(e) => setLinkCompanyId(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white">
                          <option value="">Lier à une société (optionnel)</option>
                          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select value={linkInvoiceId} onChange={(e) => setLinkInvoiceId(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white">
                          <option value="">Lier à une facture (optionnel)</option>
                          {invoices.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={async () => {
                            setLinkStatus('');
                            try {
                              if (linkCompanyId) {
                                await createAtlasLink({
                                  fromType: 'document',
                                  fromId: String(selectedDoc.id),
                                  toType: 'company',
                                  toId: String(linkCompanyId),
                                  relation: 'attached_to',
                                  metadata: { source: 'documents_page' },
                                });
                              }
                              if (linkInvoiceId) {
                                await createAtlasLink({
                                  fromType: 'document',
                                  fromId: String(selectedDoc.id),
                                  toType: 'invoice',
                                  toId: String(linkInvoiceId),
                                  relation: 'attached_to',
                                  metadata: { source: 'documents_page' },
                                });
                              }
                              setLinkStatus('✅ Liens enregistrés.');
                            } catch {
                              setLinkStatus('❌ Impossible de créer le lien.');
                            }
                          }}
                          className="text-sm font-medium px-3 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
                        >
                          Enregistrer liens
                        </button>
                      </div>
                      {linkStatus && <p className="mt-2 text-xs text-gray-500">{linkStatus}</p>}

                      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap wrap-break-word">
                          {typeof selectedDoc.content === 'string'
                            ? selectedDoc.content
                            : JSON.stringify(selectedDoc.content ?? {}, null, 2)}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <div className="p-6 text-center text-sm text-gray-400">Sélectionnez un document.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'ocr' && (
            <>
            {supplierTableMissing && supabaseMode && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-medium">Table factures fournisseur absente</p>
                <p className="text-xs mt-1">
                  Exécutez dans Supabase SQL Editor (dans l’ordre) :
                </p>
                <ul className="text-xs mt-2 list-disc pl-5 space-y-1 font-mono">
                  {SUPPLIER_INVOICES_MIGRATION_FILES.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {ocrError && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {ocrError}
              </div>
            )}
            {ocrProgress.phase !== 'idle' && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900 flex items-start gap-3">
                <div className="w-5 h-5 mt-0.5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin shrink-0" />
                <div>
                  <p className="font-medium">{ocrProgressLabel(ocrProgress)}</p>
                  {ocrProgress.isPdf && ocrProgress.phase === 'analyzing' && !ocrProgress.page && (
                    <p className="text-xs text-rose-700 mt-1">
                      Analyse en cours, cela peut prendre quelques instants.
                    </p>
                  )}
                  <p className="text-xs text-rose-600 mt-1">Vous pouvez consulter la liste ci-dessous pendant l’analyse.</p>
                </div>
              </div>
            )}
            {ocrLoading && supabaseMode && (
              <p className="text-xs text-gray-400">Chargement des documents…</p>
            )}
            <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Documents analysés</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{ocrRows.filter(d => d.statut === 'analysé').length}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">En cours</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{ocrRows.filter(d => d.statut === 'en cours').length}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{ocrRows.length}</p>
            </div>
            </div>
            {ocrPageSummary && (
              <p className="text-xs text-gray-500">{ocrPageSummary}</p>
            )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <div
            onDragOver={e => { e.preventDefault(); if (!analyzing) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (analyzing || !e.dataTransfer.files.length) return;
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => { if (!analyzing) fileRef.current?.click(); }}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-all ${
              analyzing
                ? 'border-rose-200 bg-rose-50/50 cursor-wait opacity-90'
                : `cursor-pointer ${dragging ? 'border-rose-400 bg-rose-50' : 'border-gray-200 hover:border-rose-300 hover:bg-rose-50'}`
            }`}
          >
            {analyzing ? (
              <div className="flex flex-col items-center gap-2 pointer-events-none">
                <p className="text-rose-600 font-medium text-sm">Analyse en cours…</p>
                <p className="text-xs text-gray-500">{ocrProgressLabel(ocrProgress) || 'Préparation…'}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center">
                  <Upload size={28} className="text-rose-500" />
                </div>
                <p className="font-medium text-gray-700">Déposez vos factures ici</p>
                <p className="text-sm text-gray-400">
                  PDF jusqu’à 10 Mo · images jusqu’à 4 Mo · plusieurs fichiers (50 Mo bientôt)
                </p>
                <p className="text-xs text-gray-500">
                  Compression et découpage automatiques — vous pouvez quitter la page pendant l’analyse.
                </p>
                <p className="text-xs text-rose-500 font-medium">Extraction : n° de facture, fournisseur, montants, TVA</p>
              </div>
            )}
          </div>

          {ocrRows.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              {SHOW_OCR_ROW_DEBUG && supabaseMode && (
                <div className="px-4 py-2 bg-slate-900 text-slate-100 text-[10px] font-mono border-b border-slate-700">
                  DEBUG OCR (temporaire) — id · status · phase · err · textLen · updated_at
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3">Fichier</th>
                    {ocrTableMode === 'bank' ? (
                      <>
                        <th className="px-4 py-3">Banque</th>
                        <th className="px-4 py-3">Période</th>
                        <th className="px-4 py-3 text-right">Opérations</th>
                        <th className="px-4 py-3 text-right">Solde clôture</th>
                        <th className="px-4 py-3"></th>
                      </>
                    ) : ocrTableMode === 'mixed' ? (
                      <>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Détail</th>
                        <th className="px-4 py-3 text-right">Montant / Solde</th>
                        <th className="px-4 py-3"></th>
                        <th className="px-4 py-3"></th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3">N° Facture</th>
                        <th className="px-4 py-3">Fournisseur</th>
                        <th className="px-4 py-3 text-right">HT</th>
                        <th className="px-4 py-3 text-right">TVA</th>
                        <th className="px-4 py-3 text-right">TTC</th>
                      </>
                    )}
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {ocrRows.map(d => {
                    const creatable = d.detectedInvoices
                      ? creatableOcrInvoices(d.detectedInvoices)
                      : [];
                    const showInvoiceRows = supabaseMode && creatable.length > 1;
                    const isBankRow = isBankStatementType(d.detectedType);

                    return (
                    <Fragment key={d.key}>
                    <tr className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-gray-400" />
                            <span className="text-gray-700 text-xs">{d.nom.substring(0, 20)}</span>
                            {isBankRow && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                                Relevé bancaire
                              </span>
                            )}
                          </div>
                          {supabaseMode && d.fileSizeLabel && (
                            <span className="text-[10px] text-gray-400 pl-5">{d.fileSizeLabel}</span>
                          )}
                          {supabaseMode && d.pageProgressLabel && d.statut === 'en cours' && (
                            <span className="text-[10px] text-amber-700 font-medium pl-5">{d.pageProgressLabel}</span>
                          )}
                          {supabaseMode && d.statut === 'erreur' && d.errorDetail && (
                            <span className="text-[10px] text-red-600 pl-5 line-clamp-2">{d.errorDetail}</span>
                          )}
                          {supabaseMode && d.statut === 'analysé' && d.textPreview && !looksLikeRawJsonText(d.textPreview) && (
                            <span className="text-[10px] text-gray-500 pl-5 line-clamp-2" title={d.textPreview}>
                              {d.textPreview}
                            </span>
                          )}
                          {supabaseMode && (d.creatableInvoiceCount ?? 0) > 1 && (
                            <span className="text-[10px] text-emerald-700 font-medium pl-5">
                              {d.creatableInvoiceCount} factures détectées
                            </span>
                          )}
                          {d.debug && (
                            <pre className="text-[9px] text-slate-600 pl-5 mt-1 whitespace-pre-wrap break-all font-mono leading-tight">
                              {d.debug.documentId.slice(0, 8)}… · {d.debug.processingStatus} ·{' '}
                              {d.debug.progressPhase ?? '—'} · err={d.debug.errorCode ?? '—'} · len=
                              {d.debug.extractedTextLength} · {d.debug.updatedAt.slice(0, 19)}
                            </pre>
                          )}
                        </div>
                      </td>
                      {ocrTableMode === 'bank' ? (
                        <>
                          <td className="px-4 py-3 text-gray-600 text-xs">{d.bank_name || '-'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{d.statement_period || '-'}</td>
                          <td className="px-4 py-3 text-right text-gray-700 text-xs">
                            {d.transaction_count != null ? d.transaction_count : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-xs">
                            {d.closing_balance != null
                              ? `${d.closing_balance.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`
                              : '-'}
                          </td>
                          <td className="px-4 py-3"></td>
                        </>
                      ) : ocrTableMode === 'mixed' ? (
                        <>
                          <td className="px-4 py-3 text-indigo-700 text-xs font-medium">
                            {d.detectedType ? documentTypeLabel(d.detectedType) : '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {isBankRow
                              ? [d.bank_name, d.statement_period].filter(Boolean).join(' · ') || '-'
                              : showInvoiceRows
                                ? '—'
                                : [d.numero_facture, d.fournisseur].filter(Boolean).join(' · ') || '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700 text-xs">
                            {isBankRow
                              ? d.closing_balance != null
                                ? `${d.closing_balance.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`
                                : d.transaction_count != null
                                  ? `${d.transaction_count} op.`
                                  : '-'
                              : showInvoiceRows
                                ? '—'
                                : d.montant_ttc
                                  ? `${d.montant_ttc.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD`
                                  : '-'}
                          </td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3"></td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-gray-600 text-xs">{showInvoiceRows ? '—' : (d.numero_facture || '-')}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{showInvoiceRows ? '—' : (d.fournisseur || '-')}</td>
                          <td className="px-4 py-3 text-right text-gray-700 text-xs">{showInvoiceRows ? '—' : (d.montant_ht ? d.montant_ht.toLocaleString() + ' MAD' : '-')}</td>
                          <td className="px-4 py-3 text-right text-blue-600 text-xs">{showInvoiceRows ? '—' : (d.montant_tva ? d.montant_tva.toLocaleString() + ' MAD' : '-')}</td>
                          <td className="px-4 py-3 text-right font-medium text-xs">{showInvoiceRows ? '—' : (d.montant_ttc ? d.montant_ttc.toLocaleString() + ' MAD' : '-')}</td>
                        </>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium w-fit ${d.statut === 'analysé' ? 'bg-green-100 text-green-700' : d.statut === 'en cours' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {d.statut === 'analysé' ? <CheckCircle size={10} /> : <Clock size={10} />}
                            {d.statut}
                          </span>
                          {supabaseMode && d.supabaseId && (() => {
                            const doc = ocrDocuments.find(doc => doc.id === d.supabaseId);
                            if (!doc) return null;
                            const docType = documentTypeFromDocument(doc);
                            const valStatus = validationStatusFromDocument(doc);
                            return (
                              <div className="flex flex-col gap-0.5">
                                {docType && docType !== 'unknown' && (
                                  <span className="inline-flex items-center gap-1 flex-wrap">
                                    <span className="text-[10px] text-indigo-600 font-medium">{documentTypeLabel(docType)}</span>
                                    <DriveSyncBadge
                                      status={driveSyncByDocId[d.supabaseId!] ?? 'idle'}
                                      compact
                                    />
                                  </span>
                                )}
                                {valStatus === 'validated' && (
                                  <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                                    <ShieldCheck size={9} /> Validé
                                  </span>
                                )}
                                {valStatus === 'needs_correction' && (
                                  <span className="text-[10px] text-amber-600">À corriger</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap min-w-0 ml-auto">
                          {supabaseMode && d.statut === 'analysé' && d.supabaseId && (
                            <DocumentExplainerButton documentId={d.supabaseId} className="inline-block" />
                          )}
                          {supabaseMode && d.statut === 'analysé' && d.supabaseId && (
                            <button
                              onClick={() => setValidationDocId(d.supabaseId!)}
                              className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                                isBankRow
                                  ? 'text-sky-800 hover:text-sky-900 bg-sky-50 hover:bg-sky-100'
                                  : 'text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100'
                              }`}
                              title={isBankRow ? 'Voir les opérations bancaires' : 'Ouvrir le centre de validation'}
                            >
                              <ShieldCheck size={12} />
                              {isBankRow ? 'Voir opérations' : 'Valider'}
                            </button>
                          )}
                          {!supabaseMode && d.statut === 'analysé' && d.fournisseur && d.montant_ttc && d.localDoc && (
                            <button
                              onClick={() => createSupplierInvoice(d.localDoc!)}
                              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                            >
                              Créer facture fournisseur
                            </button>
                          )}
                          {supabaseMode && d.statut === 'erreur' && d.supabaseId && (
                            <button
                              onClick={() => void retryOcrRow(d)}
                              disabled={retryingOcrId === d.supabaseId}
                              className="text-xs font-medium text-rose-700 hover:text-rose-800 disabled:opacity-50"
                            >
                              {retryingOcrId === d.supabaseId ? 'Relancement\u2026' : "R\u00e9essayer l'analyse"}
                            </button>
                          )}
                          {supabaseMode && d.statut === 'analysé' && d.supabaseId && !isBankRow && (d.creatableInvoiceCount ?? 0) > 0 && (
                            d.hasAllSupplierInvoices ? (
                              <span className="text-xs text-gray-400">
                                {(d.creatableInvoiceCount ?? 0) > 1
                                  ? `${d.creatableInvoiceCount} factures créées`
                                  : 'Facture créée'}
                              </span>
                            ) : (
                              <button
                                onClick={() => void createSupplierInvoiceSupabase(d.supabaseId!)}
                                disabled={creatingSupplierInvoiceId === d.supabaseId}
                                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                              >
                                {creatingSupplierInvoiceId === d.supabaseId
                                  ? 'Création…'
                                  : (d.creatableInvoiceCount ?? 0) > 1
                                    ? `Créer ${d.creatableInvoiceCount} factures`
                                    : 'Créer facture fournisseur'}
                              </button>
                            )
                          )}
                          {supabaseMode && d.supabaseId && d.statut === 'analysé' && (
                            <RowShareActionBar
                              entityLabel={d.nom}
                              whatsAppMessage={`Bonjour,\n\nDocument « ${d.nom} » disponible sur Zafirix Pro.\n${typeof window !== 'undefined' ? window.location.origin : ''}/documents`}
                              documentId={d.supabaseId}
                              exportFormats={['pdf', 'xlsx', 'docx', 'xml']}
                              menuExtraExportFormats={['zip']}
                              onExport={(fmt) => downloadDocumentExport(d.supabaseId!, fmt)}
                              onSendEmail={() => setEmailModalDocId(d.supabaseId!)}
                              mailto={{
                                subject: `Document — ${d.nom}`,
                                body: `Bonjour,\n\nVeuillez consulter le document « ${d.nom} » sur Zafirix Pro.`,
                              }}
                              disabled={driveBackingUpId === d.supabaseId}
                              driveSyncStatus={driveSyncByDocId[d.supabaseId] ?? 'idle'}
                              onDriveSyncStatusChange={(status) =>
                                setDriveSyncByDocId((prev) => ({ ...prev, [d.supabaseId!]: status }))
                              }
                            />
                          )}
                          {/* Three-dot action menu — all actions real */}
                          <EntityActionMenu
                            entityLabel={d.nom}
                            actions={[
                              {
                                id: 'view',
                                label: 'Consulter / Valider',
                                Icon: Eye,
                                onClick: () => { if (supabaseMode && d.supabaseId) setValidationDocId(d.supabaseId); },
                                hidden: !supabaseMode || !d.supabaseId,
                              },
                              {
                                id: 'correct',
                                label: 'Corriger les champs',
                                Icon: Wrench,
                                onClick: () => { if (supabaseMode && d.supabaseId) setValidationDocId(d.supabaseId); },
                                hidden: !supabaseMode || d.statut !== 'analysé',
                              },
                              {
                                id: 'export-json',
                                label: 'Télécharger JSON',
                                Icon: FileJson,
                                onClick: () => { if (d.supabaseId) downloadDocumentExport(d.supabaseId, 'json'); },
                                hidden: !supabaseMode || !d.supabaseId || d.statut !== 'analysé',
                              },
                              {
                                id: 'export-csv',
                                label: 'Télécharger CSV',
                                Icon: Download,
                                onClick: () => { if (d.supabaseId) downloadDocumentExport(d.supabaseId, 'csv'); },
                                hidden: !supabaseMode || !d.supabaseId || d.statut !== 'analysé',
                              },
                              {
                                id: 'export-xml',
                                label: 'Télécharger XML',
                                Icon: FileCode2,
                                onClick: () => { if (d.supabaseId) downloadDocumentExport(d.supabaseId, 'xml'); },
                                hidden: !supabaseMode || !d.supabaseId || d.statut !== 'analysé',
                              },
                              {
                                id: 'export-xlsx',
                                label: 'Télécharger Excel',
                                Icon: FileSpreadsheet,
                                onClick: () => { if (d.supabaseId) downloadDocumentExport(d.supabaseId, 'xlsx'); },
                                hidden: !supabaseMode || !d.supabaseId || d.statut !== 'analysé',
                              },
                              {
                                id: 'export-pdf',
                                label: 'Télécharger PDF',
                                Icon: Download,
                                onClick: () => { if (d.supabaseId) downloadDocumentExport(d.supabaseId, 'pdf'); },
                                hidden: !supabaseMode || !d.supabaseId || d.statut !== 'analysé',
                              },
                              {
                                id: 'export-zip',
                                label: 'Télécharger ZIP (tous formats)',
                                Icon: Package,
                                onClick: () => { if (d.supabaseId) downloadDocumentExport(d.supabaseId, 'zip'); },
                                hidden: !supabaseMode || !d.supabaseId || d.statut !== 'analysé',
                                dividerAfter: true,
                              },
                              {
                                id: 'share',
                                label: 'Partager (copier lien)',
                                Icon: Link2,
                                onClick: () => { if (d.supabaseId) void shareDocumentLink(d.supabaseId); },
                                hidden: !supabaseMode || !d.supabaseId || d.statut !== 'analysé',
                              },
                              {
                                id: 'send-email',
                                label: 'Envoyer par email',
                                Icon: Mail,
                                onClick: () => { if (d.supabaseId) setEmailModalDocId(d.supabaseId); },
                                hidden: !supabaseMode || !d.supabaseId || d.statut !== 'analysé',
                              },
                              {
                                id: 'backup-drive',
                                label: driveBackingUpId === d.supabaseId ? 'Sauvegarde…' : 'Sauvegarder Google Drive',
                                Icon: driveBackingUpId === d.supabaseId ? DriveLoader : CloudUpload,
                                onClick: () => { if (d.supabaseId && driveBackingUpId !== d.supabaseId) void backupToGoogleDrive(d.supabaseId); },
                                hidden: !supabaseMode || !d.supabaseId || d.statut !== 'analysé',
                                disabled: driveBackingUpId === d.supabaseId,
                              },
                              {
                                id: 'history',
                                label: 'Historique',
                                Icon: History,
                                onClick: () => { if (d.supabaseId) setHistoryDocId(d.supabaseId); },
                                hidden: !supabaseMode || !d.supabaseId,
                                dividerAfter: true,
                              },
                              {
                                id: 'archive',
                                label: 'Archiver',
                                Icon: Archive,
                                onClick: () => void archiveDocument(d),
                                variant: 'warning',
                                hidden: !supabaseMode || !d.supabaseId,
                              },
                              {
                                id: 'delete',
                                label: 'Supprimer',
                                Icon: Trash2,
                                onClick: () => setConfirmDeleteRow(d),
                                variant: 'danger',
                              },
                            ] satisfies ActionItem[]}
                          />
                        </div>
                      </td>
                    </tr>
                    {showInvoiceRows && creatable.map((inv) => {
                      const created = d.supabaseId
                        ? supplierInvoiceKeys.has(
                            supplierInvoiceDedupeKey(
                              d.supabaseId,
                              sourcePageForDetectedInvoice(inv),
                              inv.invoice_number,
                            ),
                          )
                        : false;
                      return (
                        <tr key={`${d.key}-p${inv.page_number}`} className="border-b border-gray-50 bg-gray-50/60">
                          <td className="px-4 py-2 pl-8 text-[11px] text-gray-500">Page {inv.page_number}</td>
                          <td className="px-4 py-2 text-gray-600 text-[11px]">{inv.invoice_number || '—'}</td>
                          <td className="px-4 py-2 text-gray-600 text-[11px]">{inv.supplier_name || '—'}</td>
                          <td className="px-4 py-2 text-right text-gray-700 text-[11px]">{inv.amount_ht != null ? `${Math.round(inv.amount_ht).toLocaleString()} MAD` : '—'}</td>
                          <td className="px-4 py-2 text-right text-blue-600 text-[11px]">{inv.vat_amount != null ? `${Math.round(inv.vat_amount).toLocaleString()} MAD` : '—'}</td>
                          <td className="px-4 py-2 text-right font-medium text-[11px]">{inv.amount_ttc != null ? `${Math.round(inv.amount_ttc).toLocaleString()} MAD` : '—'}</td>
                          <td className="px-4 py-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${inv.status === 'needs_review' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              {inv.status === 'needs_review' ? 'À compléter' : 'Détectée'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-[11px] text-gray-400">
                            {created ? 'Créée' : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {showInvoiceRows && d.detectedInvoices?.filter((i) => i.status === 'no_invoice_detected').map((inv) => (
                      <tr key={`${d.key}-skip-${inv.page_number}`} className="border-b border-gray-50 bg-gray-50/30">
                        <td className="px-4 py-2 pl-8 text-[11px] text-gray-400">Page {inv.page_number}</td>
                        <td colSpan={5} className="px-4 py-2 text-[11px] text-gray-400 italic">Aucune facture détectée</td>
                        <td className="px-4 py-2" />
                      </tr>
                    ))}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
            </>
          )}
        </div>
        </div>

        {/* Validation Center side panel */}
        {validationDocId && supabaseMode && (() => {
          const validationDoc = ocrDocuments.find(d => d.id === validationDocId);
          if (!validationDoc) return null;
          return (
            <div className="w-[420px] shrink-0 overflow-y-auto border-l border-gray-200">
              <ValidationCenter
                document={validationDoc}
                onClose={() => setValidationDocId(null)}
                onValidated={() => { void refreshOcr(); }}
                onRetryOcr={(docId) => {
                  const row = ocrRows.find(r => r.supabaseId === docId);
                  if (row) void retryOcrRow(row);
                }}
              />
            </div>
          );
        })()}
      </main>

      {/* Confirm delete dialog */}
      <ConfirmDeleteDialog
        open={confirmDeleteRow !== null}
        entityName={confirmDeleteRow?.nom ?? ''}
        entityType="ce document"
        showArchiveOption={supabaseMode && !!confirmDeleteRow?.supabaseId}
        onConfirmDelete={() => {
          if (confirmDeleteRow) void removeOcrRow(confirmDeleteRow);
          setConfirmDeleteRow(null);
        }}
        onConfirmArchive={supabaseMode && confirmDeleteRow?.supabaseId ? () => {
          if (confirmDeleteRow) void archiveDocument(confirmDeleteRow);
          setConfirmDeleteRow(null);
        } : undefined}
        onCancel={() => setConfirmDeleteRow(null)}
      />

      {/* History drawer */}
      <EntityHistoryDrawer
        open={historyDocId !== null}
        entityId={historyDocId ?? ''}
        entityType="document"
        entityLabel={ocrRows.find(r => r.supabaseId === historyDocId)?.nom ?? 'Document'}
        onClose={() => setHistoryDocId(null)}
      />

      {/* Email send modal */}
      <SendEmailModal
        open={emailModalDocId !== null}
        documentId={emailModalDocId ?? ''}
        documentName={ocrRows.find(r => r.supabaseId === emailModalDocId)?.nom ?? 'Document'}
        onClose={() => setEmailModalDocId(null)}
      />

      {/* Share link toast */}
      {shareToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-300 flex items-center gap-2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          <Link2 size={14} className="text-green-400" />
          {shareToast}
        </div>
      )}
    </div>
  );
}