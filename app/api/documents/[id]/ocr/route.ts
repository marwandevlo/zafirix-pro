import { NextRequest, NextResponse } from 'next/server';

import { createServerClient } from '@supabase/ssr';

import { cookies } from 'next/headers';

import { atlasDataBackend } from '@/app/lib/atlas-data-source';

import { ATLAS_DOCUMENTS_BUCKET } from '@/app/lib/atlas-document-storage';

import { persistDocumentOcrResult, updateDocumentOcrProgress } from '@/app/lib/atlas-documents-ocr-server';

import { isPdfMimeType, OCR_PROVIDER } from '@/app/lib/atlas-ocr';

import { processMultiPagePdfOcr } from '@/app/lib/atlas-pdf-ocr-multipage';

import { PDF_OCR_RENDERED_MIME } from '@/app/lib/atlas-pdf-ocr-render';



export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';



const IS_DEV = process.env.NODE_ENV === 'development';



type OcrRouteError = {

  error: string;

  step: string;

  message: string;

  code: string;

  provider: string;

};



function ocrRouteJson(status: number, step: string, code: string, message: string) {

  const payload: OcrRouteError = {

    error: message,

    step,

    message,

    code,

    provider: OCR_PROVIDER,

  };

  if (IS_DEV) console.error('[documents/ocr]', payload);

  return NextResponse.json(IS_DEV ? payload : { error: message, code }, { status });

}



async function sessionUserId(request: NextRequest): Promise<string | null> {

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const cookieStore = await cookies();



  const supabase = createServerClient(url, anonKey, {

    cookies: {

      getAll() {

        return cookieStore.getAll();

      },

      setAll(list) {

        try {

          for (const { name, value, options } of list) {

            cookieStore.set(name, value, options);

          }

        } catch {

          /* middleware refresh */

        }

      },

    },

  });



  const { data } = await supabase.auth.getUser();

  if (data.user?.id) return data.user.id;



  const auth = request.headers.get('authorization') ?? '';

  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  if (!bearer) return null;



  const bearerClient = createServerClient(url, anonKey, {

    global: { headers: { Authorization: `Bearer ${bearer}` } },

    cookies: { getAll: () => [], setAll: () => {} },

  });

  const { data: bearerUser } = await bearerClient.auth.getUser();

  return bearerUser.user?.id ?? null;

}



export async function POST(

  request: NextRequest,

  context: { params: Promise<{ id: string }> },

) {

  if (atlasDataBackend() !== 'supabase') {

    return ocrRouteJson(400, 'backend', 'not_enabled', 'Supabase data backend is not enabled');

  }



  const userId = await sessionUserId(request);

  if (!userId) {

    return ocrRouteJson(401, 'auth', 'auth_required', 'Session user id missing');

  }



  const { id: documentId } = await context.params;

  if (!documentId) {

    return ocrRouteJson(400, 'validation', 'document_required', 'Document id required');

  }



  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const cookieStore = await cookies();

  const supabase = createServerClient(url, anonKey, {

    cookies: {

      getAll() {

        return cookieStore.getAll();

      },

      setAll(list) {

        try {

          for (const { name, value, options } of list) {

            cookieStore.set(name, value, options);

          }

        } catch {

          /* noop */

        }

      },

    },

  });



  const { data: row, error: rowErr } = await supabase

    .from('atlas_documents')

    .select('id, mime_type, storage_path, filename, size_bytes')

    .eq('id', documentId)

    .eq('user_id', userId)

    .maybeSingle();



  if (rowErr || !row?.id) {

    return ocrRouteJson(404, 'document_load', 'document_not_found_or_forbidden', 'Document not found');

  }



  const mimeType = String(row.mime_type ?? '').toLowerCase();

  const storagePath = String(row.storage_path ?? '');



  if (!isPdfMimeType(mimeType)) {

    return ocrRouteJson(400, 'validation', 'pdf_required', 'This endpoint only processes PDF documents');

  }

  if (!storagePath) {

    return ocrRouteJson(400, 'storage_load', 'storage_path_missing', 'Document has no storage path');

  }



  await supabase

    .from('atlas_documents')

    .update({ processing_status: 'processing', updated_at: new Date().toISOString() })

    .eq('id', documentId)

    .eq('user_id', userId);



  const { data: fileBlob, error: downloadErr } = await supabase.storage

    .from(ATLAS_DOCUMENTS_BUCKET)

    .download(storagePath);



  if (downloadErr || !fileBlob) {

    await persistDocumentOcrResult(supabase, userId, documentId, {

      processingStatus: 'failed',

      ocrError: {

        step: 'storage_download',

        code: 'storage_download_failed',

        message: downloadErr?.message ?? 'Failed to download PDF from storage',

      },

      pdfMeta: {

        original_mime_type: mimeType,

        processed_page: 1,

        rendered_image_mime_type: PDF_OCR_RENDERED_MIME,

      },

    });

    return ocrRouteJson(500, 'storage_download', 'storage_download_failed', downloadErr?.message ?? 'Download failed');

  }



  let multiPageResult;

  try {

    const pdfBytes = Buffer.from(await fileBlob.arrayBuffer());

    multiPageResult = await processMultiPagePdfOcr(pdfBytes, {
      onProgress: async (event) => {
        await updateDocumentOcrProgress(supabase, userId, documentId, {
          phase: event.phase,
          page: event.pageNumber,
          total: event.totalPages,
        });
      },
    });

    if (IS_DEV) {

      console.info('[documents/ocr] pdf_multipage', {

        documentId,

        totalPages: multiPageResult.totalPages,

        processedPages: multiPageResult.processedPages,

        successPages: multiPageResult.pageResults.filter((p) => p.success).length,

        partialFailure: multiPageResult.partialFailure,

      });

    }

  } catch (err) {

    const message = err instanceof Error ? err.message : 'pdf_render_failed';

    await persistDocumentOcrResult(supabase, userId, documentId, {

      processingStatus: 'failed',

      ocrError: {

        step: 'pdf_render',

        code: 'pdf_render_failed',

        message,

      },

      pdfMeta: {

        original_mime_type: mimeType,

        processed_page: 1,

        rendered_image_mime_type: PDF_OCR_RENDERED_MIME,

      },

    });

    return ocrRouteJson(422, 'pdf_render', 'pdf_render_failed', message);

  }



  const pdfMeta = {

    original_mime_type: mimeType,

    total_pages: multiPageResult.totalPages,

    processed_pages: multiPageResult.processedPages,

    processed_page_count: multiPageResult.processedPages,

    pages: multiPageResult.pageResults,

    partial_failure: multiPageResult.partialFailure,

    invoices: multiPageResult.invoices,

    processed_page: multiPageResult.processedPages,

    rendered_image_mime_type: multiPageResult.renderedMime,

  };



  if (multiPageResult.processingStatus === 'failed') {

    const firstErr = multiPageResult.pageResults.find((p) => !p.success)?.error;

    await persistDocumentOcrResult(supabase, userId, documentId, {

      processingStatus: 'failed',

      extraction: multiPageResult.merged,

      extractedText: JSON.stringify({ pages: multiPageResult.pageResults }, null, 2),

      ocrError: firstErr ?? {

        step: 'ai_provider',

        code: 'ocr_failed',

        message: 'All PDF pages failed OCR',

      },

      pdfMeta,

    });

    return ocrRouteJson(

      422,

      firstErr?.step ?? 'ai_provider',

      firstErr?.code ?? 'ocr_failed',

      firstErr?.message ?? 'All PDF pages failed OCR',

    );

  }



  const persist = await persistDocumentOcrResult(supabase, userId, documentId, {

    processingStatus: 'processed',

    extraction: multiPageResult.merged,

    extractedText: JSON.stringify(

      { merged: multiPageResult.merged, pages: multiPageResult.pageResults, invoices: multiPageResult.invoices },

      null,

      2,

    ),

    pdfMeta,

  });



  if (!persist.ok) {

    return ocrRouteJson(500, 'db_update', 'db_update_failed', persist.error);

  }



  const successCount = multiPageResult.pageResults.filter((p) => p.success).length;



  return NextResponse.json({

    ok: true,

    documentId,

    extraction: multiPageResult.merged,

    pdfMeta,

    processedPageCount: multiPageResult.processedPages,

    successPageCount: successCount,

    totalPageCount: multiPageResult.totalPages,

    partialFailure: multiPageResult.partialFailure,

    invoiceCount: multiPageResult.invoices.filter((i) => i.status !== 'no_invoice_detected').length,

    ...(IS_DEV

      ? {

          debug: {

            provider: OCR_PROVIDER,

            mimeType,

            fileSize: row.size_bytes,

          },

        }

      : {}),

  });

}


