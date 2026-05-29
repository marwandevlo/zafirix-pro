import type { SupabaseClient } from '@supabase/supabase-js';

import type { AtlasOcrError, AtlasOcrExtraction } from '@/app/types/atlas-document';

import type { AtlasOcrPageMeta } from '@/app/lib/atlas-pdf-ocr-multipage';

function asMetaRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** Live OCR progress for Documents IA polling (metadata.ocr.progress_*). */
export async function updateDocumentOcrProgress(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  progress: { phase: 'rendering' | 'analyzing'; page: number; total: number },
): Promise<void> {
  const { data } = await supabase
    .from('atlas_documents')
    .select('metadata')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  const meta = asMetaRecord(data?.metadata);
  const ocr = asMetaRecord(meta.ocr);

  await supabase
    .from('atlas_documents')
    .update({
      processing_status: 'processing',
      metadata: {
        ...meta,
        ocr: {
          ...ocr,
          progress_phase: progress.phase,
          progress_page: progress.page,
          progress_total: progress.total,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .eq('user_id', userId);
}



export type DocumentOcrPdfMeta = {

  original_mime_type: string;

  total_pages?: number;

  processed_pages?: number;

  processed_page_count?: number;

  pages?: AtlasOcrPageMeta[];

  invoices?: import('@/app/types/atlas-document').AtlasOcrDetectedInvoice[];

  partial_failure?: boolean;

  /** Legacy single-page fields */

  processed_page?: number;

  rendered_image_mime_type?: string;

};



export type PersistDocumentOcrInput = {

  processingStatus: 'processed' | 'failed';

  extraction?: AtlasOcrExtraction;

  extractedText?: string;

  ocrError?: AtlasOcrError;

  pdfMeta?: DocumentOcrPdfMeta;

};



export async function persistDocumentOcrResult(

  supabase: SupabaseClient,

  userId: string,

  documentId: string,

  input: PersistDocumentOcrInput,

): Promise<{ ok: true } | { ok: false; error: string }> {

  const extraction = input.extraction ?? {};

  const ocrMeta: Record<string, unknown> = {

    ...extraction,

    ...(input.pdfMeta ?? {}),

  };

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

    .eq('user_id', userId);



  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export type DocumentOcrProgressSnapshot = {
  processingStatus: string;
  progressPhase?: 'rendering' | 'analyzing';
  progressPage?: number;
  progressTotal?: number;
};

/** Server-side OCR progress read (Documents IA polling API). */
export async function readDocumentOcrProgress(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<{ ok: true; progress: DocumentOcrProgressSnapshot } | { ok: false; code: string }> {
  const { data, error } = await supabase
    .from('atlas_documents')
    .select('processing_status, metadata')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, code: 'document_not_found_or_forbidden' };
  }

  const ocr = asMetaRecord(asMetaRecord(data.metadata).ocr);
  const progressPhase = ocr.progress_phase;

  return {
    ok: true,
    progress: {
      processingStatus: String(data.processing_status ?? 'uploaded'),
      progressPhase:
        progressPhase === 'rendering' || progressPhase === 'analyzing' ? progressPhase : undefined,
      progressPage: typeof ocr.progress_page === 'number' ? ocr.progress_page : undefined,
      progressTotal: typeof ocr.progress_total === 'number' ? ocr.progress_total : undefined,
    },
  };
}
