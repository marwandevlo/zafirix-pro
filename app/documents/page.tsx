'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileText, CheckCircle, Clock, Trash2, Sparkles } from 'lucide-react';
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
import type { AtlasDocument, AtlasOcrDetectedInvoice, AtlasOcrError, AtlasOcrExtraction } from '@/app/types/atlas-document';
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
  ocrProcessedPageCountFromDocument,
  ocrUiStatus,
  saveAtlasDocumentOcrResult,
  searchDocuments,
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
import { triggerDocumentOcrJob } from '@/app/lib/atlas-document-ocr-client';
import { uploadDocumentForOcr } from '@/app/lib/atlas-document-upload-client';
import { frenchMessageForUploadHttpStatus, sanitizeUploadUserMessage } from '@/app/lib/atlas-upload-http-errors';
import {
  formatOcrDevDiagnostics,
  formatOcrUiMessage,
  isPdfMimeType,
  ocrErrorFromAiBody,
  OCR_PROVIDER,
  parseOcrJsonResponse,
  type OcrAiErrorBody,
} from '@/app/lib/atlas-ocr';
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
  numero_facture?: string;
  fournisseur?: string;
  montant_ht?: number;
  montant_tva?: number;
  montant_ttc?: number;
  localDoc?: LocalOcrDocument;
  supabaseId?: string;
  detectedInvoices?: AtlasOcrDetectedInvoice[];
  creatableInvoiceCount?: number;
  supplierInvoicesCreatedCount?: number;
  hasAllSupplierInvoices?: boolean;
};

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
      return 'Téléversement vers le stockage…';
    case 'registered':
      return 'Fichier enregistré…';
    case 'uploading':
      return 'Téléversement vers le stockage…';
    case 'rendering':
      return progress.page && progress.totalPages
        ? `Page ${progress.page}/${progress.totalPages}…`
        : 'Analyse OCR en cours…';
    case 'analyzing':
      if (progress.page && progress.totalPages) {
        return `Page ${progress.page}/${progress.totalPages}…`;
      }
      return 'Analyse OCR en cours…';
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

const OCR_PROGRESS_POLL_MS = 2000;

type OcrProgressApiBody = {
  ok?: boolean;
  processingStatus?: string;
  progressPhase?: 'rendering' | 'analyzing';
  progressPage?: number;
  progressTotal?: number;
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
              setOcrError(formatOcrUiMessage('ocr_failed'));
              continue;
            }

            if (
              live.processingStatus === 'processing' &&
              !live.progressPhase &&
              !ocrRetriggeredRef.current.has(id)
            ) {
              const doc = ocrDocuments.find((d) => String(d.id) === id);
              const mime = doc?.mimeType ?? 'application/pdf';
              ocrRetriggeredRef.current.add(id);
              triggerDocumentOcrJob(id, mime);
            }

            if (live.progressPhase) {
              setOcrProgress({
                documentId: id,
                phase: live.progressPhase === 'rendering' ? 'rendering' : 'analyzing',
                page: live.progressPage,
                totalPages: live.progressTotal,
                isPdf: true,
              });
            }
          }

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
      const id = String(doc.id);
      enqueueOcrProgressPoll(id);
      if (!ocrRetriggeredRef.current.has(id)) {
        ocrRetriggeredRef.current.add(id);
        triggerDocumentOcrJob(id, doc.mimeType ?? 'application/pdf');
      }
    }
  }, [ocrDocuments, supabaseMode, tab, enqueueOcrProgressPoll]);

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
      if (selectedId && !docs.some((d) => String(d.id) === selectedId)) setSelectedId(docs[0]?.id ?? '');
    }, 150);
    return () => window.clearTimeout(t);
  }, [libraryQuery, libraryType, selectedId, tab, supabaseMode]);

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

        return {
          key: docId,
          nom: doc.filename ?? doc.title,
          statut: ocrUiStatus(doc),
          numero_facture: extraction?.numero_facture,
          fournisseur: extraction?.fournisseur,
          montant_ht: extraction?.montant_ht,
          montant_tva: extraction?.montant_tva,
          montant_ttc: extraction?.montant_ttc,
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
      const result = await createSupplierInvoicesFromOcr(documentId);
      if (!result.ok) {
        setOcrError(atlasSupplierInvoiceErrorMessage(result.error));
        return;
      }
      await refreshOcr();
      if (result.created >= 1) {
        router.push('/comptabilite');
        return;
      }
      if (result.created === 0 && result.alreadyExists > 0) {
        setOcrPageInfo(`${result.alreadyExists} facture(s) fournisseur déjà créée(s).`);
      } else if (result.created > 1) {
        setOcrPageInfo(`${result.created} factures fournisseur créées.`);
      } else if (result.created === 1) {
        setOcrPageInfo('Facture fournisseur créée.');
      } else if (result.skipped > 0) {
        setOcrPageInfo(`${result.skipped} facture(s) n’ont pas pu être créées.`);
      }
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
        const parsed = JSON.parse(data.response) as AtlasOcrExtraction;
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

      const documentId = uploadResult.data.document.id;
      const mimeType = uploadResult.data.document.mimeType ?? mimeTypeGuess;

      setOcrPageInfo(atlasDocumentErrorMessage('ocr_background'));
      ocrRetriggeredRef.current.add(documentId);
      enqueueOcrProgressPoll(documentId);
      setOcrProgress({ phase: 'analyzing', documentId, isPdf });
      await refreshOcr();
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

      <main className="flex-1 flex flex-col overflow-hidden">
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
                    <button type="button" onClick={() => void refreshLibrary()} className="text-rose-600 hover:text-rose-700 font-medium">
                      Actualiser
                    </button>
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
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3">Fichier</th>
                    <th className="px-4 py-3">N° Facture</th>
                    <th className="px-4 py-3">Fournisseur</th>
                    <th className="px-4 py-3 text-right">HT</th>
                    <th className="px-4 py-3 text-right">TVA</th>
                    <th className="px-4 py-3 text-right">TTC</th>
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

                    return (
                    <Fragment key={d.key}>
                    <tr className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-gray-400" />
                            <span className="text-gray-700 text-xs">{d.nom.substring(0, 20)}</span>
                          </div>
                          {supabaseMode && (d.creatableInvoiceCount ?? 0) > 1 && (
                            <span className="text-[10px] text-emerald-700 font-medium pl-5">
                              {d.creatableInvoiceCount} factures détectées
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{showInvoiceRows ? '—' : (d.numero_facture || '-')}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{showInvoiceRows ? '—' : (d.fournisseur || '-')}</td>
                      <td className="px-4 py-3 text-right text-gray-700 text-xs">{showInvoiceRows ? '—' : (d.montant_ht ? d.montant_ht.toLocaleString() + ' MAD' : '-')}</td>
                      <td className="px-4 py-3 text-right text-blue-600 text-xs">{showInvoiceRows ? '—' : (d.montant_tva ? d.montant_tva.toLocaleString() + ' MAD' : '-')}</td>
                      <td className="px-4 py-3 text-right font-medium text-xs">{showInvoiceRows ? '—' : (d.montant_ttc ? d.montant_ttc.toLocaleString() + ' MAD' : '-')}</td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium w-fit ${d.statut === 'analysé' ? 'bg-green-100 text-green-700' : d.statut === 'en cours' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {d.statut === 'analysé' ? <CheckCircle size={10} /> : <Clock size={10} />}
                          {d.statut}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          {!supabaseMode && d.statut === 'analysé' && d.fournisseur && d.montant_ttc && d.localDoc && (
                            <button
                              onClick={() => createSupplierInvoice(d.localDoc!)}
                              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                            >
                              Créer facture fournisseur
                            </button>
                          )}
                          {supabaseMode && d.statut === 'analysé' && d.supabaseId && (d.creatableInvoiceCount ?? 0) > 0 && (
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
                          <button onClick={() => void removeOcrRow(d)} className="text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 size={14} />
                          </button>
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
      </main>
    </div>
  );
}